import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = process.env.AUDIT_STUDY_CODE || "FMASCULINA-NAVIGO-2026";
const DEFAULT_INPUT_FILE = "C:\\Users\\gabhc\\Downloads\\FILTROS QUE NO PASAN.xlsx";
const INPUT_FILE = process.argv[2] || DEFAULT_INPUT_FILE;
const OUTPUT_FILE = path.join(__dirname, "auditoria_filtros_no_pasan_v1.xlsx");
const PREVIEW_DIR = path.join(__dirname, "previews");
const MEXICO_CITY_TIMEZONE = "America/Mexico_City";
const AUDIT_COLUMNS = [
  "INPUT_ROW",
  "INPUT_NAV_FOLIO",
  "INPUT_NOMBRE",
  "NAV_FOLIO",
  "HUT_FOLIO",
  "NOMBRE",
  "NAME_MATCH",
  "IDENTITY_WARNING",
  "TELEFONO",
  "EMAIL",
  "EXISTE_V1",
  "SCREENING_INICIADO",
  "SCREENING_COMPLETADO",
  "SCREENING_APROBADO",
  "SCREENING_RECHAZADO",
  "SCREENING_STATUS",
  "SCREENING_OUTCOME",
  "SCREENING_COMPLETED_AT",
  "MOTIVO_RECHAZO",
  "PROTOCOL",
  "CODES_COUNT",
  "ACTIVITIES_COUNT",
  "ANSWERS_COUNT",
  "EVIDENCE_COUNT",
  "LAST_ACTIVITY",
  "CURRENT_STAGE",
  "RECOMENDACION",
  "MOTIVO_RECOMENDACION",
  "MATCH_SOURCE",
  "MATCH_COUNT",
  "STUDY_PARTICIPANT_ID",
  "PARTICIPANT_PROFILE_ID",
  "HUT_PARTICIPANT_ID",
  "QA_MODE"
];

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  const inputRows = await readInputWorkbook(INPUT_FILE);
  const snapshot = await readStudySnapshot();
  const report = buildAuditReport(inputRows, snapshot);
  const workbook = await buildWorkbook(report);
  await verifyWorkbook(workbook);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(OUTPUT_FILE);
  console.log(
    JSON.stringify(
      {
        output: OUTPUT_FILE,
        input: INPUT_FILE,
        studyCode: STUDY_CODE,
        summary: report.summary
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function createPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado en .env.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: false })
    })
  };
}

async function readInputWorkbook(inputFile) {
  const input = await FileBlob.load(inputFile);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItemAt(0);
  const usedRange = sheet.getUsedRange(true);
  const values = usedRange?.values ?? [];
  if (values.length < 1) {
    throw new Error("El archivo de entrada no contiene filas para auditar.");
  }

  const headerRowIndex = findHeaderRow(values);
  const candidateHeaders = values[headerRowIndex].map((value) => String(value ?? "").trim());
  const detectedNavIndex = findColumnIndex(candidateHeaders, [
    "NAV_FOLIO",
    "FOLIO NAV",
    "FOLIO_NAV",
    "NAV",
    "FOLIO",
    "FOLIO PARTICIPANTE"
  ]);
  const detectedNameIndex = findColumnIndex(candidateHeaders, [
    "NOMBRE",
    "NOMBRE COMPLETO",
    "PARTICIPANTE",
    "NOMBRE DEL PARTICIPANTE",
    "NOMBRE_PARTICIPANTE"
  ]);

  const firstRowLooksLikeData =
    isNavFolioLike(values[0]?.[0]) && Boolean(normalizeDisplayText(values[0]?.[1]));
  const hasHeader = detectedNavIndex !== -1 || detectedNameIndex !== -1;
  const headers = hasHeader ? candidateHeaders : ["NAV_FOLIO", "NOMBRE"];
  const navIndex = hasHeader ? detectedNavIndex : 0;
  const nameIndex = hasHeader ? detectedNameIndex : 1;
  const firstDataRowIndex = hasHeader ? headerRowIndex + 1 : 0;
  const allowBareSequence = hasHeader;

  if (!hasHeader && !firstRowLooksLikeData) {
    throw new Error("No encontre columna NAV_FOLIO ni Nombre del participante en el XLSX.");
  }

  const rows = [];
  for (let index = firstDataRowIndex; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const navFolio = navIndex >= 0 ? normalizeNavFolio(row[navIndex], { allowBareSequence }) : null;
    const name = nameIndex >= 0 ? normalizeDisplayText(row[nameIndex]) : "";
    if (!navFolio && !name && row.every((value) => !normalizeDisplayText(value))) {
      continue;
    }
    rows.push({
      inputRow: index + 1,
      inputNavFolio: navFolio,
      inputName: name,
      raw: Object.fromEntries(headers.map((header, columnIndex) => [header || `COL_${columnIndex + 1}`, row[columnIndex] ?? null]))
    });
  }
  return rows;
}

function findHeaderRow(values) {
  let bestRow = 0;
  let bestScore = -1;
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 15); rowIndex += 1) {
    const row = values[rowIndex] ?? [];
    const normalized = row.map(normalizeHeader);
    const score =
      Number(normalized.some((value) => value.includes("NAV") || value.includes("FOLIO"))) +
      Number(normalized.some((value) => value.includes("NOMBRE") || value.includes("PARTICIPANTE")));
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowIndex;
    }
  }
  return bestRow;
}

function findColumnIndex(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.findIndex((header) => normalizedCandidates.includes(normalizeHeader(header)));
}

async function readStudySnapshot() {
  const study = await prisma.study.findFirst({
    where: { code: STUDY_CODE },
    select: { id: true, code: true, name: true }
  });
  if (!study) {
    throw new Error(`No se encontro el estudio ${STUDY_CODE}.`);
  }

  const studyParticipants = await prisma.studyParticipant.findMany({
    where: { studyId: study.id },
    include: {
      participantProfile: true,
      participantConfirmation: {
        include: { referenceCodes: { orderBy: { slot: "asc" } } }
      },
      participantScreeningReviews: {
        orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }]
      },
      screeningAttempts: {
        include: {
          answers: { orderBy: { createdAt: "asc" } },
          participantEvidence: true,
          participantScreeningReview: true,
          participantConfirmation: true
        },
        orderBy: { startedAt: "asc" }
      },
      ctlSessions: {
        include: {
          answers: true,
          phaseProgress: true
        },
        orderBy: { createdAt: "asc" }
      },
      accessTokens: true,
      activities: {
        include: {
          responses: true,
          participantActivityEvidence: true,
          reminders: true,
          activitySchedule: true
        }
      },
      participantEvidence: true,
      hutParticipant: {
        include: {
          applicationEvidence: true,
          applicationPhotoEntries: true,
          phaseCodes: true,
          questionnaireAttempt: {
            include: {
              visits: true,
              answers: true
            }
          },
          referenceSelfie: true,
          videoSubmissions: true,
          blocks: true,
          dailyChecks: true,
          callEvaluations: true,
          visualVerifications: true
        }
      },
      qaParticipantRun: true
    }
  });

  const hutParticipants = await prisma.hutParticipant.findMany({
    where: { studyId: study.id },
    include: {
      studyParticipant: {
        include: {
          participantProfile: true,
          participantConfirmation: {
            include: { referenceCodes: { orderBy: { slot: "asc" } } }
          }
        }
      },
      applicationEvidence: true,
      applicationPhotoEntries: true,
      phaseCodes: true,
      questionnaireAttempt: {
        include: {
          visits: true,
          answers: true
        }
      },
      referenceSelfie: true,
      videoSubmissions: true,
      qaParticipantRun: true
    }
  });

  const profiles = await prisma.participantProfile.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      participations: {
        where: { studyId: study.id },
        select: { id: true }
      }
    }
  });

  return buildIndexes({ study, studyParticipants, hutParticipants, profiles });
}

function buildIndexes(snapshot) {
  const byNav = new Map();
  const byHut = new Map();
  const byName = new Map();
  const profileOnlyByName = new Map();

  for (const participant of snapshot.studyParticipants) {
    const nav = participant.participantConfirmation?.folio;
    if (nav) {
      byNav.set(normalizeNavFolio(nav), { type: "STUDY_PARTICIPANT", participant });
    }
    addToMap(byName, normalizeName(participant.participantProfile?.name), {
      type: "STUDY_PARTICIPANT",
      participant
    });
    if (participant.hutParticipant?.folio) {
      byHut.set(normalizeHutFolio(participant.hutParticipant.folio), {
        type: "STUDY_PARTICIPANT",
        participant,
        hutParticipant: participant.hutParticipant
      });
    }
  }

  for (const hutParticipant of snapshot.hutParticipants) {
    if (hutParticipant.folio) {
      byHut.set(normalizeHutFolio(hutParticipant.folio), {
        type: "HUT_PARTICIPANT",
        hutParticipant,
        participant: hutParticipant.studyParticipant ?? null
      });
    }
    addToMap(byName, normalizeName(hutParticipant.name), {
      type: "HUT_PARTICIPANT",
      hutParticipant,
      participant: hutParticipant.studyParticipant ?? null
    });
  }

  for (const profile of snapshot.profiles) {
    if (profile.participations.length === 0) {
      addToMap(profileOnlyByName, normalizeName(profile.name), {
        type: "PROFILE_ONLY",
        profile
      });
    }
  }

  return { ...snapshot, byNav, byHut, byName, profileOnlyByName };
}

function buildAuditReport(inputRows, snapshot) {
  const completeRows = inputRows.map((inputRow) => auditInputRow(inputRow, snapshot));
  const summary = {
    totalRegistrosAnalizados: completeRows.length,
    migrar: completeRows.filter((row) => row.RECOMENDACION === "MIGRAR_V2").length,
    liberar: completeRows.filter((row) => row.RECOMENDACION === "LIBERAR_FOLIO").length,
    revisionManual: completeRows.filter((row) => row.RECOMENDACION === "REVISAR_MANUAL").length,
    sinFolio: completeRows.filter((row) => !row.INPUT_NAV_FOLIO).length
  };
  return {
    summary,
    completeRows,
    migrateRows: completeRows.filter((row) => row.RECOMENDACION === "MIGRAR_V2"),
    releaseRows: completeRows.filter((row) => row.RECOMENDACION === "LIBERAR_FOLIO"),
    noFolioRows: completeRows.filter((row) => !row.INPUT_NAV_FOLIO)
  };
}

function auditInputRow(inputRow, snapshot) {
  const match = findMatch(inputRow, snapshot);
  const analysis = analyzeMatch(match, inputRow);
  return {
    INPUT_ROW: inputRow.inputRow,
    INPUT_NAV_FOLIO: inputRow.inputNavFolio,
    INPUT_NOMBRE: inputRow.inputName,
    NAV_FOLIO: analysis.navFolio,
    HUT_FOLIO: analysis.hutFolio,
    NOMBRE: analysis.name,
    NAME_MATCH: nameMatch(inputRow.inputName, analysis.name),
    IDENTITY_WARNING: identityWarning(inputRow, match, analysis),
    TELEFONO: analysis.phone,
    EMAIL: analysis.email,
    EXISTE_V1: analysis.existsV1 ? "SI" : "NO",
    SCREENING_INICIADO: analysis.screeningStarted ? "SI" : "NO",
    SCREENING_COMPLETADO: analysis.screeningCompleted ? "SI" : "NO",
    SCREENING_APROBADO: analysis.screeningApproved ? "SI" : "NO",
    SCREENING_RECHAZADO: analysis.screeningRejected ? "SI" : "NO",
    SCREENING_STATUS: analysis.screeningStatus,
    SCREENING_OUTCOME: analysis.screeningOutcome,
    SCREENING_COMPLETED_AT: formatDateTimeMexicoCity(analysis.screeningCompletedAt),
    MOTIVO_RECHAZO: analysis.rejectionReason,
    PROTOCOL: analysis.protocol,
    CODES_COUNT: analysis.codesCount,
    ACTIVITIES_COUNT: analysis.activitiesCount,
    ANSWERS_COUNT: analysis.answersCount,
    EVIDENCE_COUNT: analysis.evidenceCount,
    LAST_ACTIVITY: formatDateTimeMexicoCity(analysis.lastActivity),
    CURRENT_STAGE: analysis.currentStage,
    RECOMENDACION: analysis.recommendation,
    MOTIVO_RECOMENDACION: analysis.recommendationReason,
    MATCH_SOURCE: match.source,
    MATCH_COUNT: match.count,
    STUDY_PARTICIPANT_ID: analysis.studyParticipantId,
    PARTICIPANT_PROFILE_ID: analysis.participantProfileId,
    HUT_PARTICIPANT_ID: analysis.hutParticipantId,
    QA_MODE: analysis.qaMode ? "SI" : "NO"
  };
}

function findMatch(inputRow, snapshot) {
  if (inputRow.inputNavFolio) {
    const byNav = snapshot.byNav.get(inputRow.inputNavFolio);
    if (byNav) {
      return { source: "NAV_FOLIO", count: 1, records: [byNav] };
    }
    const hutFolio = navToHut(inputRow.inputNavFolio);
    const byHut = snapshot.byHut.get(hutFolio);
    if (byHut) {
      return { source: "HUT_EQUIVALENTE", count: 1, records: [byHut] };
    }
  }

  const normalizedName = normalizeName(inputRow.inputName);
  if (normalizedName) {
    const exactMatches = snapshot.byName.get(normalizedName) ?? [];
    if (exactMatches.length) {
      return { source: "NOMBRE_EXACTO", count: exactMatches.length, records: exactMatches };
    }
    const profileMatches = snapshot.profileOnlyByName.get(normalizedName) ?? [];
    if (profileMatches.length) {
      return { source: "PERFIL_SIN_PARTICIPACION", count: profileMatches.length, records: profileMatches };
    }
    const fuzzyMatches = findFuzzyNameMatches(normalizedName, snapshot.byName);
    if (fuzzyMatches.length) {
      return { source: "NOMBRE_APROXIMADO", count: fuzzyMatches.length, records: fuzzyMatches };
    }
  }

  return { source: "NO_ENCONTRADO", count: 0, records: [] };
}

function findFuzzyNameMatches(normalizedName, byName) {
  if (normalizedName.length < 10) {
    return [];
  }
  const matches = [];
  for (const [candidateName, records] of byName.entries()) {
    if (!candidateName || candidateName.length < 10) {
      continue;
    }
    if (candidateName.includes(normalizedName) || normalizedName.includes(candidateName)) {
      matches.push(...records);
    }
  }
  return matches.slice(0, 5);
}

function analyzeMatch(match, inputRow) {
  if (match.count === 0) {
    return noParticipantAnalysis(inputRow, "No existe participante ni perfil localizado en V1.");
  }
  if (match.count > 1) {
    const first = flattenRecord(match.records[0]);
    const base = summarizeRecord(first.participant, first.hutParticipant, first.profile);
    return {
      ...base,
      recommendation: "REVISAR_MANUAL",
      recommendationReason: `Coincidieron ${match.count} registros por ${match.source}; requiere validar identidad antes de liberar o migrar.`
    };
  }

  const record = flattenRecord(match.records[0]);
  const analysis = summarizeRecord(record.participant, record.hutParticipant, record.profile);
  return classifyAnalysis(analysis);
}

function noParticipantAnalysis(inputRow, reason) {
  return {
    navFolio: inputRow.inputNavFolio,
    hutFolio: inputRow.inputNavFolio ? navToHut(inputRow.inputNavFolio) : null,
    name: inputRow.inputName,
    phone: null,
    email: null,
    existsV1: false,
    screeningStarted: false,
    screeningCompleted: false,
    screeningApproved: false,
    screeningRejected: false,
    screeningStatus: "NO_ENCONTRADO",
    screeningOutcome: "NO_EXISTE_V1",
    screeningCompletedAt: null,
    rejectionReason: null,
    protocol: null,
    codesCount: 0,
    activitiesCount: 0,
    answersCount: 0,
    evidenceCount: 0,
    lastActivity: null,
    currentStage: "NO_EXISTE_V1",
    recommendation: inputRow.inputNavFolio ? "LIBERAR_FOLIO" : "REVISAR_MANUAL",
    recommendationReason: inputRow.inputNavFolio ? reason : "Sin NAV_FOLIO en Excel; no hay folio que liberar sin validacion manual.",
    studyParticipantId: null,
    participantProfileId: null,
    hutParticipantId: null,
    qaMode: false
  };
}

function summarizeRecord(participant, hutParticipant, profileOnly) {
  const profile = participant?.participantProfile ?? hutParticipant?.studyParticipant?.participantProfile ?? profileOnly ?? null;
  const confirmation = participant?.participantConfirmation ?? hutParticipant?.studyParticipant?.participantConfirmation ?? null;
  const screeningAttempts = participant?.screeningAttempts ?? [];
  const latestScreening = latestByDate(screeningAttempts, (attempt) => attempt.completedAt ?? attempt.startedAt);
  const reviews = participant?.participantScreeningReviews ?? [];
  const latestReview = latestByDate(reviews, (review) => review.reviewedAt ?? review.createdAt);
  const codesCount = confirmation?.referenceCodes?.length ?? 0;
  const ctlSessions = participant?.ctlSessions ?? [];
  const navigoActivities = participant?.activities ?? [];
  const hutAttempt = hutParticipant?.questionnaireAttempt ?? null;
  const hutVisits = hutAttempt?.visits ?? [];
  const hutPhaseCodes = hutParticipant?.phaseCodes ?? [];
  const screeningAnswerCount = screeningAttempts.reduce((sum, attempt) => sum + (attempt.answers?.length ?? 0), 0);
  const ctlAnswerCount = ctlSessions.reduce((sum, session) => sum + (session.answers?.length ?? 0), 0);
  const navigoAnswerCount = navigoActivities.reduce((sum, activity) => sum + (activity.responses?.length ?? 0), 0);
  const hutAnswerCount = hutAttempt?.answers?.length ?? 0;
  const participantEvidenceCount = participant?.participantEvidence?.length ?? 0;
  const screeningEvidenceCount = screeningAttempts.reduce((sum, attempt) => sum + (attempt.participantEvidence?.length ?? 0), 0);
  const activityEvidenceCount = navigoActivities.reduce(
    (sum, activity) => sum + (activity.participantActivityEvidence?.length ?? 0),
    0
  );
  const hutEvidenceCount =
    (hutParticipant?.applicationEvidence?.length ?? 0) +
    (hutParticipant?.applicationPhotoEntries?.length ?? 0) +
    (hutParticipant?.referenceSelfie ? 1 : 0) +
    (hutParticipant?.videoSubmissions?.length ?? 0);
  const activityDates = collectDates([
    profile?.updatedAt,
    participant?.updatedAt,
    confirmation?.approvedAt,
    ...screeningAttempts.flatMap((attempt) => [attempt.startedAt, attempt.completedAt]),
    ...reviews.flatMap((review) => [review.reviewedAt, review.updatedAt]),
    ...ctlSessions.flatMap((session) => [session.startedAt, session.completedAt, session.updatedAt]),
    ...navigoActivities.flatMap((activity) => [
      activity.scheduledAt,
      activity.actualStartedAt,
      activity.actualCompletedAt,
      activity.lastSavedAt
    ]),
    hutParticipant?.startDate,
    hutParticipant?.updatedAt,
    ...hutVisits.flatMap((visit) => [visit.startedAt, visit.completedAt, visit.updatedAt]),
    ...(hutAttempt?.answers ?? []).map((answer) => answer.answeredAt),
    ...(hutParticipant?.applicationEvidence ?? []).map((item) => item.capturedAt),
    ...(hutParticipant?.applicationPhotoEntries ?? []).map((item) => item.capturedAt)
  ]);

  const screeningApproved =
    participant?.screeningStatus === "PASSED" ||
    latestScreening?.status === "PASSED" ||
    latestReview?.status === "APPROVED" ||
    Boolean(confirmation);
  const screeningRejected =
    participant?.screeningStatus === "TERMINATED" ||
    latestScreening?.status === "TERMINATED" ||
    latestReview?.status === "REJECTED";
  const screeningCompleted = Boolean(
    screeningAttempts.some((attempt) => attempt.completedAt || ["PASSED", "TERMINATED", "PENDING_REVIEW"].includes(attempt.status)) ||
      screeningApproved ||
      screeningRejected
  );
  const screeningStarted = screeningAttempts.length > 0 || participant?.screeningStatus !== "NOT_STARTED";

  return {
    navFolio: confirmation?.folio ?? null,
    hutFolio: hutParticipant?.folio ?? null,
    name: profile?.name ?? hutParticipant?.name ?? null,
    phone: profile?.phone ?? hutParticipant?.phone ?? null,
    email: profile?.email ?? hutParticipant?.email ?? null,
    existsV1: Boolean(participant || hutParticipant || profileOnly),
    screeningStarted,
    screeningCompleted,
    screeningApproved,
    screeningRejected,
    screeningStatus: participant?.screeningStatus ?? latestScreening?.status ?? "NO_PARTICIPANT",
    screeningOutcome: screeningOutcome({ screeningStarted, screeningCompleted, screeningApproved, screeningRejected }),
    screeningCompletedAt: latestScreening?.completedAt ?? latestReview?.reviewedAt ?? confirmation?.approvedAt ?? null,
    rejectionReason:
      latestScreening?.terminationReason ??
      latestScreening?.terminationCode ??
      latestReview?.rejectionReason ??
      null,
    protocol: inferProtocol(participant, hutParticipant),
    codesCount,
    activitiesCount:
      screeningAttempts.length +
      ctlSessions.length +
      ctlSessions.reduce((sum, session) => sum + (session.phaseProgress?.length ?? 0), 0) +
      navigoActivities.length +
      (participant?.accessTokens?.length ?? 0) +
      hutVisits.length +
      hutPhaseCodes.length +
      (hutParticipant?.applicationEvidence?.length ?? 0) +
      (hutParticipant?.applicationPhotoEntries?.length ?? 0),
    answersCount: screeningAnswerCount + ctlAnswerCount + navigoAnswerCount + hutAnswerCount,
    evidenceCount: participantEvidenceCount + screeningEvidenceCount + activityEvidenceCount + hutEvidenceCount,
    lastActivity: activityDates.length ? new Date(Math.max(...activityDates.map((date) => date.getTime()))) : null,
    currentStage: currentStage({ participant, hutParticipant, ctlSessions, navigoActivities, hutVisits, hutAttempt }),
    recommendation: null,
    recommendationReason: null,
    studyParticipantId: participant?.id ?? hutParticipant?.studyParticipantId ?? null,
    participantProfileId: profile?.id ?? null,
    hutParticipantId: hutParticipant?.id ?? null,
    qaMode: Boolean(participant?.qaParticipantRun || hutParticipant?.qaParticipantRun),
    downstreamProgress:
      codesCount > 0 ||
      ctlSessions.some((session) => session.startedAt || session.completedAt || session.answers?.length) ||
      navigoActivities.some(
        (activity) => activity.actualStartedAt || activity.actualCompletedAt || activity.responses?.length || activity.status !== "PENDING"
      ) ||
      Boolean(
        hutParticipant &&
          (hutParticipant.startDate ||
            hutParticipant.status !== "NOT_STARTED" ||
            hutVisits.length ||
            hutAnswerCount ||
            hutEvidenceCount)
      )
  };
}

function classifyAnalysis(analysis) {
  if (!analysis.existsV1) {
    return analysis;
  }
  if (analysis.qaMode) {
    return {
      ...analysis,
      recommendation: "REVISAR_MANUAL",
      recommendationReason: "Registro QA detectado; no clasificar como participante real sin decision operativa."
    };
  }
  if (analysis.screeningApproved && analysis.navFolio && analysis.downstreamProgress) {
    return {
      ...analysis,
      recommendation: "MIGRAR_V2",
      recommendationReason: "Screening aprobado con folio valido y progreso/codigos/actividades en V1."
    };
  }
  if (!analysis.studyParticipantId && !analysis.hutParticipantId) {
    return {
      ...analysis,
      recommendation: "LIBERAR_FOLIO",
      recommendationReason: "Solo existe perfil o rastro no operativo; no hay participante operativo ligado."
    };
  }
  if (!analysis.screeningCompleted) {
    return {
      ...analysis,
      recommendation: "LIBERAR_FOLIO",
      recommendationReason: "Screening no completado y sin cierre aprobatorio."
    };
  }
  if (analysis.screeningRejected && !analysis.downstreamProgress) {
    return {
      ...analysis,
      recommendation: "LIBERAR_FOLIO",
      recommendationReason: "Screening rechazado/terminado sin progreso operativo posterior."
    };
  }
  return {
    ...analysis,
    recommendation: "REVISAR_MANUAL",
    recommendationReason: "Estado parcial o inconsistente: existe registro V1, pero no cumple claramente reglas de liberar o migrar."
  };
}

function flattenRecord(record) {
  if (record.type === "PROFILE_ONLY") {
    return { participant: null, hutParticipant: null, profile: record.profile };
  }
  return {
    participant: record.participant ?? null,
    hutParticipant: record.hutParticipant ?? record.participant?.hutParticipant ?? null,
    profile: null
  };
}

function screeningOutcome(flags) {
  if (flags.screeningApproved) return "APROBADO";
  if (flags.screeningRejected) return "RECHAZADO";
  if (flags.screeningCompleted) return "COMPLETADO_NO_APROBADO";
  if (flags.screeningStarted) return "INICIADO_INCOMPLETO";
  return "NO_INICIADO";
}

function inferProtocol(participant, hutParticipant) {
  if (hutParticipant?.origin === "HUT_DIRECTO") return "HUT_DIRECTO";
  if (hutParticipant?.origin === "CLT_HUT") return "CLT_NAVIGO_HUT";
  if (participant?.ctlSessions?.length || participant?.activities?.length || participant?.accessTokens?.length) {
    return "CLT_NAVIGO_HUT";
  }
  return hutParticipant ? hutParticipant.origin : null;
}

function currentStage({ participant, hutParticipant, ctlSessions, navigoActivities, hutVisits, hutAttempt }) {
  if (!participant && !hutParticipant) return "PERFIL_SIN_OPERACION";
  if (hutParticipant?.status === "COMPLETED") return "HUT_COMPLETED";
  if (hutParticipant && (hutParticipant.startDate || hutParticipant.status !== "NOT_STARTED" || hutVisits.length || hutAttempt?.answers?.length)) {
    return "HUT_INICIADO";
  }
  if (navigoActivities.some((activity) => activity.actualCompletedAt || activity.responses?.length || activity.status === "COMPLETED")) {
    return "NAVIGO_INICIADO";
  }
  if (participant?.accessTokens?.length || navigoActivities.length) return "NAVIGO_PREPARADO";
  if (ctlSessions.some((session) => session.status === "COMPLETED")) return "CLT_COMPLETED";
  if (ctlSessions.some((session) => session.startedAt || session.status === "IN_PROGRESS")) return "CLT_INICIADO";
  if (participant?.participantConfirmation) return "FOLIO_CONFIRMADO";
  if (participant?.screeningStatus === "PASSED") return "SCREENING_APROBADO";
  if (participant?.screeningStatus === "TERMINATED") return "SCREENING_RECHAZADO";
  if (participant?.screeningAttempts?.length) return "SCREENING_INICIADO";
  return "REGISTRO_CREADO";
}

async function buildWorkbook(report) {
  const workbook = Workbook.create();
  addRowsSheet(workbook, "AUDITORIA_COMPLETA", report.completeRows, AUDIT_COLUMNS);
  addRowsSheet(workbook, "MIGRAR_V2", report.migrateRows, AUDIT_COLUMNS);
  addRowsSheet(workbook, "LIBERAR_FOLIO", report.releaseRows, AUDIT_COLUMNS);
  addRowsSheet(workbook, "SIN_FOLIO", report.noFolioRows, AUDIT_COLUMNS);
  return workbook;
}

function addRowsSheet(workbook, sheetName, rows, columns) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const matrix = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? null))];
  sheet.getRangeByIndexes(0, 0, matrix.length, columns.length).values = matrix;
  const usedRange = sheet.getRangeByIndexes(0, 0, Math.max(matrix.length, 1), columns.length);
  usedRange.format = {
    font: { name: "Aptos", size: 10 },
    wrapText: false
  };
  const header = sheet.getRangeByIndexes(0, 0, 1, columns.length);
  header.format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", name: "Aptos", size: 10 },
    wrapText: true
  };
  header.format.rowHeightPx = 34;
  usedRange.format.borders = { preset: "insideHorizontal", style: "thin", color: "#E5E7EB" };
  sheet.freezePanes.freezeRows(1);
  sheet.getRangeByIndexes(0, 0, Math.max(matrix.length, 1), columns.length).format.autofitColumns();
  capColumns(sheet, columns.length);
  if (matrix.length > 1) {
    const tableRange = sheet.getRangeByIndexes(0, 0, matrix.length, columns.length);
    const tableName = `${sheetName.replace(/[^A-Za-z0-9]/g, "")}Table`;
    const table = sheet.tables.add(tableRange, true, tableName);
    table.style = "TableStyleMedium2";
    table.showFilterButton = true;
  }
}

function capColumns(sheet, columnCount) {
  for (let column = 0; column < columnCount; column += 1) {
    const range = sheet.getRangeByIndexes(0, column, 1, 1);
    const header = String(range.values?.[0]?.[0] ?? "");
    const width = ["MOTIVO_RECOMENDACION", "MOTIVO_RECHAZO"].includes(header)
      ? 42
      : ["INPUT_NOMBRE", "NOMBRE", "EMAIL"].includes(header)
        ? 28
        : 18;
    sheet.getRangeByIndexes(0, column, 1, 1).format.columnWidth = width;
  }
}

async function verifyWorkbook(workbook) {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const sheets = ["AUDITORIA_COMPLETA", "MIGRAR_V2", "LIBERAR_FOLIO", "SIN_FOLIO"];
  for (const sheetName of sheets) {
    const inspection = await workbook.inspect({
      kind: "table",
      sheetId: sheetName,
      tableMaxRows: 5,
      tableMaxCols: 8,
      maxChars: 2500
    });
    console.log(inspection.ndjson);
    const preview = await workbook.render({
      sheetName,
      range: "A1:Z25",
      scale: 1,
      format: "png"
    });
    await fs.writeFile(path.join(PREVIEW_DIR, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    maxChars: 1000
  });
  console.log(errors.ndjson);
}

function addToMap(map, key, value) {
  if (!key) return;
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

function latestByDate(items, getDate) {
  return [...(items ?? [])]
    .filter((item) => getDate(item))
    .sort((left, right) => new Date(getDate(right)).getTime() - new Date(getDate(left)).getTime())[0];
}

function collectDates(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
}

function normalizeNavFolio(value, options = {}) {
  const text = normalizeDisplayText(value).toUpperCase();
  if (!text) return null;
  const navMatch = text.match(/NAV[-\s_]?(\d{1,4})/);
  if (navMatch) return `NAV-${navMatch[1].padStart(3, "0")}`;
  if (/^\d{1,4}$/.test(text)) {
    return options.allowBareSequence ? `NAV-${text.padStart(3, "0")}` : null;
  }
  return text;
}

function isNavFolioLike(value) {
  return /NAV[-\s_]?\d{1,4}/i.test(normalizeDisplayText(value));
}

function normalizeHutFolio(value) {
  const text = normalizeDisplayText(value).toUpperCase();
  if (!text) return null;
  const hutMatch = text.match(/HUT[-\s_]?(\d{1,4})/);
  if (hutMatch) return `HUT-${hutMatch[1].padStart(3, "0")}`;
  return text;
}

function navToHut(navFolio) {
  const sequence = String(navFolio ?? "").match(/(\d{1,4})/)?.[1];
  return sequence ? `HUT-${sequence.padStart(3, "0")}` : null;
}

function normalizeDisplayText(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function normalizeHeader(value) {
  return normalizeDisplayText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeName(value) {
  return normalizeDisplayText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Z0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function nameMatch(inputName, v1Name) {
  if (!normalizeName(inputName) || !normalizeName(v1Name)) return "SIN_DATO";
  return normalizeName(inputName) === normalizeName(v1Name) ? "SI" : "NO";
}

function identityWarning(inputRow, match, analysis) {
  if (!inputRow.inputName || !analysis.name) return null;
  if (nameMatch(inputRow.inputName, analysis.name) === "SI") return null;
  if (match.source === "NAV_FOLIO" || match.source === "HUT_EQUIVALENTE") {
    return "NOMBRE_EXCEL_DISTINTO_DE_V1";
  }
  return null;
}

function formatDateTimeMexicoCity(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MEXICO_CITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
