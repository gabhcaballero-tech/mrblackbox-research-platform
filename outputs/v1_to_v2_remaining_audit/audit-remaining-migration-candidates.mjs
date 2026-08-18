import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const OUTPUT_JSON = path.join(__dirname, "V1_TO_V2_REMAINING_MIGRATION_AUDIT.json");
const OUTPUT_CSV = path.join(__dirname, "V1_TO_V2_REMAINING_MIGRATION_AUDIT.csv");
const RELEASE_FOLIOS = new Set([
  "NAV-009",
  "NAV-011",
  "NAV-023",
  "NAV-024",
  "NAV-027",
  "NAV-029",
  "NAV-035",
  "NAV-036",
  "NAV-038",
  "NAV-040",
  "NAV-041",
  "NAV-043",
  "NAV-044",
  "NAV-046",
  "NAV-048",
  "NAV-049",
  "NAV-050",
  "NAV-051",
  "NAV-054",
  "NAV-055",
  "NAV-056",
  "NAV-058",
  "NAV-061",
  "NAV-063",
  "NAV-064",
  "NAV-065",
  "NAV-066",
  "NAV-068",
  "NAV-073",
  "NAV-074",
  "NAV-075",
  "NAV-078",
  "NAV-079",
  "NAV-080",
  "NAV-081",
  "NAV-082",
  "NAV-084",
  "NAV-085",
  "NAV-089",
  "NAV-091",
  "NAV-092",
  "NAV-093",
  "NAV-094",
  "NAV-096",
  "NAV-100",
  "NAV-103"
]);

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  await fs.mkdir(__dirname, { recursive: true });
  const audit = await buildAudit();
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await fs.writeFile(OUTPUT_CSV, toCsv(audit.rows), "utf8");
  console.log(JSON.stringify({
    outputJson: OUTPUT_JSON,
    outputCsv: OUTPUT_CSV,
    summary: audit.summary,
    rows: audit.rows
  }, null, 2));
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

async function buildAudit() {
  const study = await prisma.study.findUnique({
    where: { code: STUDY_CODE },
    select: { id: true, code: true, name: true }
  });
  if (!study) throw new Error(`No existe estudio ${STUDY_CODE}`);

  const confirmations = await prisma.participantConfirmation.findMany({
    where: {
      studyId: study.id,
      folio: { notIn: Array.from(RELEASE_FOLIOS) },
      studyParticipant: {
        participantProfile: {
          name: { not: "" }
        }
      }
    },
    include: {
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          participantScreeningReview: true
        }
      },
      studyParticipant: {
        include: {
          participantProfile: true,
          participantScreeningReviews: true,
          screeningAttempts: {
            include: {
              participantScreeningReview: true
            },
            orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }]
          },
          ctlSessions: {
            include: {
              answers: { select: { id: true, updatedAt: true } },
              phaseProgress: true
            },
            orderBy: { createdAt: "asc" }
          },
          accessTokens: true,
          activities: {
            include: {
              activitySchedule: true,
              responses: { select: { id: true, responseKey: true, updatedAt: true } },
              participantActivityEvidence: { select: { id: true, uploadedAt: true } }
            },
            orderBy: { scheduledAt: "asc" }
          },
          participantActivityEvidence: { select: { id: true, uploadedAt: true } },
          participantEvidence: { select: { id: true, uploadedAt: true } },
          hutParticipant: {
            include: {
              applicationEvidence: true,
              applicationPhotoEntries: true,
              questionnaireAttempt: {
                include: {
                  visits: true,
                  answers: true
                }
              },
              phaseCodes: true
            }
          },
          qaParticipantRun: true
        }
      }
    },
    orderBy: { folioSequence: "asc" }
  });

  const rows = confirmations.map(classifyConfirmation);
  const summary = {
    studyCode: study.code,
    totalConfirmacionesConNombreExcluyendoLiberacion: rows.length,
    foliosLiberacionExcluidos: RELEASE_FOLIOS.size,
    migrarAvance: rows.filter((row) => row.categoriaMigracion === "MIGRAR_AVANCE").length,
    migrarScreening: rows.filter((row) => row.categoriaMigracion === "MIGRAR_SCREENING").length,
    noMigrar: rows.filter((row) => row.categoriaMigracion === "NO_MIGRAR").length
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      sourceStudyCode: study.code,
      sourceStudyName: study.name,
      excludedReleaseFolios: Array.from(RELEASE_FOLIOS)
    },
    summary,
    rows
  };
}

function classifyConfirmation(confirmation) {
  const participant = confirmation.studyParticipant;
  const profile = participant.participantProfile;
  const screeningAttempt =
    confirmation.screeningAttempt ??
    participant.screeningAttempts.find((attempt) => attempt.status === "PASSED") ??
    participant.screeningAttempts.at(0) ??
    null;
  const review = screeningAttempt?.participantScreeningReview ?? participant.participantScreeningReviews.at(0) ?? null;
  const hut = participant.hutParticipant;
  const codes = Object.fromEntries(confirmation.referenceCodes.map((code) => [code.slot, code.code]));

  const cltAnswers = participant.ctlSessions.reduce((sum, session) => sum + session.answers.length, 0);
  const cltIniciado = participant.ctlSessions.some((session) =>
    Boolean(
      session.startedAt ||
        session.claimedAt ||
        session.completedAt ||
        session.status !== "PENDING" ||
        session.phaseProgress.some((phase) => phase.startedAt || phase.validatedAt || phase.completedAt)
    )
  );
  const cltCompletado = participant.ctlSessions.some((session) => session.status === "COMPLETED" || session.completedAt);

  const navigoRespuestas = participant.activities.reduce((sum, activity) => sum + activity.responses.length, 0);
  const navigoIniciado = participant.activities.some((activity) =>
    Boolean(
      activity.actualStartedAt ||
        activity.actualCompletedAt ||
        activity.lastSavedAt ||
        activity.status !== "PENDING" ||
        activity.responses.length > 0 ||
        activity.participantActivityEvidence.length > 0
    )
  );
  const navigoCompletado = participant.activities.length > 0 && participant.activities.every((activity) => activity.status === "COMPLETED");

  const hutAnswers = hut?.questionnaireAttempt?.answers.length ?? 0;
  const hutEvidence = (hut?.applicationEvidence.length ?? 0) + (hut?.applicationPhotoEntries.length ?? 0);
  const hutVisitProgress = hut?.questionnaireAttempt?.visits ?? [];
  const hutIniciado = Boolean(
    hut &&
      (hut.startDate ||
        hut.status !== "NOT_STARTED" ||
        hutAnswers > 0 ||
        hutEvidence > 0 ||
        hutVisitProgress.some((visit) => visit.startedAt || visit.completedAt || visit.status !== "PENDING"))
  );
  const hutEtapaActual = hut ? inferHutStage(hut) : "";

  const screeningIniciado = participant.screeningAttempts.length > 0;
  const screeningCompletado = Boolean(screeningAttempt?.completedAt);
  const screeningAprobado = Boolean(
    screeningAttempt?.status === "PASSED" ||
      participant.screeningStatus === "PASSED" ||
      review?.status === "APPROVED"
  );
  const screeningRechazado = Boolean(
    screeningAttempt?.status === "TERMINATED" ||
      participant.screeningStatus === "TERMINATED" ||
      review?.status === "REJECTED"
  );

  const respuestasExistentes = cltAnswers + navigoRespuestas + hutAnswers;
  const isNavFolio = /^NAV-\d{3}$/.test(confirmation.folio);
  const isQa = Boolean(participant.qaParticipantRun);
  const hasAvance =
    cltIniciado ||
    cltAnswers > 0 ||
    navigoIniciado ||
    navigoRespuestas > 0 ||
    hutIniciado ||
    hutAnswers > 0 ||
    hutEvidence > 0 ||
    participant.participantActivityEvidence.length > 0;

  let categoriaMigracion = "NO_MIGRAR";
  let accionRecomendada = "";
  if (!isNavFolio || isQa) {
    accionRecomendada = "No migrar: registro QA o folio no NAV operativo";
  } else if (hasAvance) {
    categoriaMigracion = "MIGRAR_AVANCE";
    accionRecomendada = "Migrar participante con avance actual y continuar en V2";
  } else if (screeningCompletado && screeningAprobado) {
    categoriaMigracion = "MIGRAR_SCREENING";
    accionRecomendada = "Migrar identidad, screening aprobado y codigos; sin avance posterior";
  } else if (screeningRechazado) {
    accionRecomendada = "No migrar: screening rechazado/terminado";
  } else if (!screeningCompletado) {
    accionRecomendada = "No migrar: screening incompleto";
  } else {
    accionRecomendada = "No migrar: estado no elegible";
  }

  return {
    NAV_FOLIO: confirmation.folio,
    HUT_FOLIO: hut?.folio ?? "",
    nombre: profile.name ?? "",
    telefono: profile.phone ?? "",
    email: profile.email ?? "",
    screeningIniciado: screeningIniciado ? "SI" : "NO",
    screeningCompletado: screeningCompletado ? "SI" : "NO",
    screeningResultado: screeningAprobado ? "APROBADO" : screeningRechazado ? "RECHAZADO" : screeningAttempt?.status ?? participant.screeningStatus,
    fechaAprobacion: formatMexicoCity(confirmation.approvedAt ?? review?.reviewedAt ?? screeningAttempt?.completedAt),
    cltIniciado: cltIniciado ? "SI" : "NO",
    cltRespuestas: cltAnswers,
    cltCompletado: cltCompletado ? "SI" : "NO",
    navigoIniciado: navigoIniciado ? "SI" : "NO",
    navigoRespuestas,
    navigoCompletado: navigoCompletado ? "SI" : "NO",
    hutIniciado: hutIniciado ? "SI" : "NO",
    hutEtapaActual,
    hutUltimaActividad: latestHutActivity(hut),
    codigo1: codes[1] ?? "",
    codigo2: codes[2] ?? "",
    codigo3: codes[3] ?? "",
    categoriaMigracion,
    ultimaActividad: latestOverallActivity(participant, hut),
    respuestasExistentes,
    accionRecomendada
  };
}

function inferHutStage(hut) {
  if (!hut) return "";
  const attempt = hut.questionnaireAttempt;
  const completedVisit = attempt?.visits
    .filter((visit) => visit.completedAt || visit.status === "COMPLETED")
    .sort((left, right) => dateMs(right.completedAt ?? right.updatedAt) - dateMs(left.completedAt ?? left.updatedAt))
    .at(0);
  if (completedVisit) return `${completedVisit.section} ${completedVisit.status}`;
  if (attempt?.startedAt) return `QUESTIONNAIRE_${attempt.status}`;
  if (hut.applicationPhotoEntries.length > 0) {
    const latest = [...hut.applicationPhotoEntries].sort((left, right) => dateMs(right.capturedAt) - dateMs(left.capturedAt)).at(0);
    return `FOTO useDay ${latest?.useDayNumber ?? ""}`;
  }
  if (hut.applicationEvidence.length > 0) {
    const latest = [...hut.applicationEvidence].sort((left, right) => dateMs(right.capturedAt) - dateMs(left.capturedAt)).at(0);
    return `EVIDENCIA ${latest?.phase ?? ""}`;
  }
  return hut.status;
}

function latestHutActivity(hut) {
  if (!hut) return "";
  const candidates = [];
  for (const evidence of hut.applicationEvidence) {
    candidates.push({ at: evidence.capturedAt, label: `HUT evidencia ${evidence.phase}` });
  }
  for (const photo of hut.applicationPhotoEntries) {
    candidates.push({ at: photo.capturedAt, label: `HUT foto useDay ${photo.useDayNumber}` });
  }
  for (const answer of hut.questionnaireAttempt?.answers ?? []) {
    candidates.push({ at: answer.answeredAt, label: `HUT respuesta ${answer.questionCode}` });
  }
  for (const visit of hut.questionnaireAttempt?.visits ?? []) {
    candidates.push({ at: visit.completedAt ?? visit.startedAt ?? visit.updatedAt, label: `HUT visita ${visit.section} ${visit.status}` });
  }
  return latestLabel(candidates) || hut.status;
}

function latestOverallActivity(participant, hut) {
  const candidates = [];
  for (const session of participant.ctlSessions) {
    candidates.push({ at: session.completedAt ?? session.startedAt ?? session.claimedAt ?? session.updatedAt, label: `CLT ${session.status}` });
    for (const answer of session.answers) {
      candidates.push({ at: answer.updatedAt, label: "CLT respuesta" });
    }
  }
  for (const activity of participant.activities) {
    candidates.push({
      at: activity.actualCompletedAt ?? activity.actualStartedAt ?? activity.lastSavedAt ?? activity.scheduledAt,
      label: `Navigo ${activity.activitySchedule.code ?? activity.activitySchedule.name} ${activity.status}`
    });
    for (const response of activity.responses) {
      candidates.push({ at: response.updatedAt, label: `Navigo respuesta ${response.responseKey}` });
    }
  }
  if (hut) {
    candidates.push({ at: hut.updatedAt, label: `HUT ${hut.status}` });
    for (const evidence of hut.applicationEvidence) {
      candidates.push({ at: evidence.capturedAt, label: `HUT evidencia ${evidence.phase}` });
    }
    for (const photo of hut.applicationPhotoEntries) {
      candidates.push({ at: photo.capturedAt, label: `HUT foto useDay ${photo.useDayNumber}` });
    }
    for (const answer of hut.questionnaireAttempt?.answers ?? []) {
      candidates.push({ at: answer.answeredAt, label: `HUT respuesta ${answer.questionCode}` });
    }
    for (const visit of hut.questionnaireAttempt?.visits ?? []) {
      candidates.push({ at: visit.completedAt ?? visit.startedAt ?? visit.updatedAt, label: `HUT visita ${visit.section} ${visit.status}` });
    }
  }
  return latestLabel(candidates) || "Screening/confirmacion";
}

function latestLabel(candidates) {
  const latest = candidates
    .filter((candidate) => candidate.at)
    .sort((left, right) => dateMs(right.at) - dateMs(left.at))
    .at(0);
  return latest ? `${latest.label} (${formatMexicoCity(latest.at)})` : "";
}

function dateMs(value) {
  return value instanceof Date ? value.getTime() : value ? new Date(value).getTime() : 0;
}

function formatMexicoCity(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function toCsv(rows) {
  const headers = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "Nombre",
    "Categoria migracion",
    "Ultima actividad",
    "Respuestas existentes",
    "Accion recomendada",
    "Telefono",
    "Email",
    "Screening",
    "Fecha aprobacion",
    "CLT iniciado",
    "CLT respuestas",
    "CLT completado",
    "Navigo iniciado",
    "Navigo respuestas",
    "Navigo completado",
    "HUT iniciado",
    "HUT etapa actual",
    "HUT ultima actividad",
    "Codigo 1",
    "Codigo 2",
    "Codigo 3"
  ];
  const keys = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "nombre",
    "categoriaMigracion",
    "ultimaActividad",
    "respuestasExistentes",
    "accionRecomendada",
    "telefono",
    "email",
    "screeningResultado",
    "fechaAprobacion",
    "cltIniciado",
    "cltRespuestas",
    "cltCompletado",
    "navigoIniciado",
    "navigoRespuestas",
    "navigoCompletado",
    "hutIniciado",
    "hutEtapaActual",
    "hutUltimaActividad",
    "codigo1",
    "codigo2",
    "codigo3"
  ];
  return [headers, ...rows.map((row) => keys.map((key) => csvCell(row[key])))]
    .map((row) => row.join(","))
    .join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
