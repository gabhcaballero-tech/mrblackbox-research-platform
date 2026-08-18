import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const OUTPUT_XLSX = path.join(__dirname, "V1_MASTER_PARTICIPANTS_EXPORT.xlsx");
const OUTPUT_JSON = path.join(__dirname, "V1_MASTER_PARTICIPANTS_EXPORT.json");
const OUTPUT_SUMMARY = path.join(__dirname, "V1_MASTER_PARTICIPANTS_EXPORT_SUMMARY.json");
const SPEC_JSON = path.join(repoRoot, "outputs", "v1_operative_specification", "V1_OPERATIVE_SPECIFICATION.json");
const PRIOR_AUDIT_JSON = path.join(repoRoot, "outputs", "v1_to_v2_remaining_audit", "V1_TO_V2_REMAINING_MIGRATION_AUDIT.json");

const RELEASE_FOLIOS = new Set([
  "NAV-003",
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
  const exportData = await buildExportData();
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");
  await fs.writeFile(OUTPUT_SUMMARY, `${JSON.stringify(exportData.summary, null, 2)}\n`, "utf8");
  const workbook = await buildWorkbook(exportData);
  await verifyWorkbook(workbook);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(OUTPUT_XLSX);
  console.log(JSON.stringify({
    output: OUTPUT_XLSX,
    json: OUTPUT_JSON,
    summary: OUTPUT_SUMMARY,
    counts: exportData.summary.counts,
    classifications: exportData.summary.byClassification
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

async function buildExportData() {
  const [questionLookup, priorAudit] = await Promise.all([
    loadQuestionLookup(),
    loadPriorAudit()
  ]);
  const study = await prisma.study.findUnique({
    where: { code: STUDY_CODE },
    select: { id: true, code: true, name: true }
  });
  if (!study) throw new Error(`No existe estudio ${STUDY_CODE}.`);

  const [studyParticipants, hutParticipants, orphanProfiles] = await Promise.all([
    prisma.studyParticipant.findMany({
      where: { studyId: study.id },
      include: studyParticipantInclude(),
      orderBy: { createdAt: "asc" }
    }),
    prisma.hutParticipant.findMany({
      where: { studyId: study.id },
      include: hutParticipantInclude(),
      orderBy: [{ folio: "asc" }, { createdAt: "asc" }]
    }),
    prisma.participantProfile.findMany({
      where: { participations: { none: {} } },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const linkedHutIds = new Set(studyParticipants.map((participant) => participant.hutParticipant?.id).filter(Boolean));
  const masterRows = [];
  const codeRows = [];
  const activityRows = [];
  const answerRows = [];
  const evidenceRows = [];
  const rotationRows = [];

  for (const participant of studyParticipants) {
    const context = buildParticipantContext({
      hut: participant.hutParticipant ?? null,
      participant,
      priorAudit,
      profile: participant.participantProfile,
      sourceKind: "STUDY_PARTICIPANT"
    });
    masterRows.push(context.masterRow);
    codeRows.push(...buildCodeRows(context));
    activityRows.push(...buildActivityRows(context));
    answerRows.push(...buildAnswerRows(context, questionLookup));
    evidenceRows.push(...buildEvidenceRows(context));
    rotationRows.push(...buildRotationRows(context));
  }

  for (const hut of hutParticipants.filter((item) => !linkedHutIds.has(item.id))) {
    const context = buildParticipantContext({
      hut,
      participant: null,
      priorAudit,
      profile: null,
      sourceKind: "HUT_PARTICIPANT_ORPHAN"
    });
    masterRows.push(context.masterRow);
    codeRows.push(...buildCodeRows(context));
    activityRows.push(...buildActivityRows(context));
    answerRows.push(...buildAnswerRows(context, questionLookup));
    evidenceRows.push(...buildEvidenceRows(context));
    rotationRows.push(...buildRotationRows(context));
  }

  for (const profile of orphanProfiles) {
    const context = buildParticipantContext({
      hut: null,
      participant: null,
      priorAudit,
      profile,
      sourceKind: "PARTICIPANT_PROFILE_ORPHAN"
    });
    masterRows.push(context.masterRow);
  }

  const summary = summarize({
    activityRows,
    answerRows,
    codeRows,
    evidenceRows,
    masterRows,
    rotationRows,
    study
  });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      studyCode: study.code,
      studyId: study.id,
      studyName: study.name,
      sources: [
        "study_participants",
        "participant_profiles",
        "participant_confirmations",
        "participant_reference_codes",
        "screening_attempts",
        "screening_answers",
        "participant_evidence",
        "ctl_sessions",
        "ctl_answers",
        "participant_activities",
        "research_responses",
        "hut_participants",
        "hut_answers",
        "hut_application_evidence",
        "hut_application_photo_entries",
        "rotation assignments"
      ]
    },
    summary,
    sheets: {
      participants: masterRows,
      codes: codeRows,
      activities: activityRows,
      answers: answerRows,
      evidence: evidenceRows,
      rotations: rotationRows
    }
  };
}

function studyParticipantInclude() {
  return {
    accessTokens: { orderBy: { createdAt: "desc" } },
    activities: {
      include: {
        activitySchedule: true,
        participantActivityEvidence: true,
        reminders: { orderBy: { sentAt: "desc" } },
        responses: {
          include: {
            questionnaireVersion: {
              select: { definitionJson: true, id: true }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { scheduledAt: "asc" }
    },
    armAssignments: {
      include: {
        studyArm: true,
        studyProduct: true
      },
      orderBy: { applicationOrder: "asc" }
    },
    ctlSessions: {
      include: {
        answers: { orderBy: { createdAt: "asc" } },
        ctlInterviewerCode: true,
        phaseProgress: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "asc" }
    },
    ctlTriangularRotationAssignment: true,
    hutParticipant: {
      include: hutParticipantInclude()
    },
    participantActivityEvidence: { orderBy: { uploadedAt: "asc" } },
    participantConfirmation: {
      include: {
        referenceCodes: { orderBy: { slot: "asc" } },
        screeningAttempt: {
          include: {
            answers: {
              include: {
                screeningAttempt: {
                  select: {
                    questionnaireVersion: {
                      select: { definitionJson: true, id: true }
                    }
                  }
                }
              },
              orderBy: { createdAt: "asc" }
            },
            participantScreeningReview: true,
            questionnaireVersion: {
              select: { definitionJson: true, id: true }
            }
          }
        }
      }
    },
    participantEvidence: { orderBy: { uploadedAt: "asc" } },
    participantProfile: true,
    participantScreeningReviews: { orderBy: { reviewedAt: "desc" } },
    qaParticipantRun: true,
    rotationAssignment: {
      include: {
        arms: {
          include: {
            studyArm: true,
            studyProduct: true
          },
          orderBy: { applicationOrder: "asc" }
        },
        rotationPlan: true
      }
    },
    screeningAttempts: {
      include: {
        answers: { orderBy: { createdAt: "asc" } },
        participantScreeningReview: true,
        questionnaireVersion: {
          select: { definitionJson: true, id: true }
        }
      },
      orderBy: { startedAt: "asc" }
    }
  };
}

function hutParticipantInclude() {
  return {
    applicationEvidence: { orderBy: { capturedAt: "asc" } },
    applicationPhotoEntries: { orderBy: { capturedAt: "asc" } },
    phaseCodes: { orderBy: { slot: "asc" } },
    qaParticipantRun: true,
    questionnaireAttempt: {
      include: {
        answers: { orderBy: { answeredAt: "asc" } },
        visits: { orderBy: { createdAt: "asc" } }
      }
    },
    registrationSlot: true
  };
}

function buildParticipantContext({ hut, participant, priorAudit, profile, sourceKind }) {
  const confirmation = participant?.participantConfirmation ?? null;
  const navFolio = confirmation?.folio ?? hutToNavFolio(hut?.folio) ?? null;
  const hutFolio = hut?.folio ?? navToHutFolio(navFolio);
  const screeningAttempts = participant?.screeningAttempts ?? [];
  const latestScreening = latestBy(screeningAttempts, (attempt) => attempt.completedAt ?? attempt.startedAt ?? attempt.createdAt);
  const confirmationScreening = confirmation?.screeningAttempt ?? null;
  const screening = confirmationScreening ?? latestScreening;
  const review = screening?.participantScreeningReview ?? participant?.participantScreeningReviews?.[0] ?? null;
  const priorRow = navFolio ? priorAudit.get(navFolio) ?? null : null;
  const qa = Boolean(participant?.qaParticipantRun || hut?.qaParticipantRun);

  const progress = computeProgress({ hut, participant, screeningAttempts });
  const classification = classifyParticipant({
    navFolio,
    participant,
    progress,
    qa,
    screening,
    sourceKind
  });

  return {
    confirmation,
    hut,
    hutFolio,
    latestScreening,
    masterRow: {
      participantIdV1: participant?.id ?? hut?.id ?? profile?.id ?? "",
      sourceRecordType: sourceKind,
      participantProfileId: profile?.id ?? participant?.participantProfileId ?? "",
      studyParticipantId: participant?.id ?? hut?.studyParticipantId ?? "",
      hutParticipantId: hut?.id ?? "",
      navFolio: navFolio ?? "",
      hutFolio: hut?.folio ?? "",
      name: profile?.name ?? participant?.participantProfile?.name ?? hut?.name ?? "",
      phone: profile?.phone ?? participant?.participantProfile?.phone ?? hut?.phone ?? "",
      email: profile?.email ?? participant?.participantProfile?.email ?? hut?.email ?? "",
      createdAt: iso(participant?.createdAt ?? hut?.createdAt ?? profile?.createdAt),
      updatedAt: iso(participant?.updatedAt ?? hut?.updatedAt ?? profile?.updatedAt),
      origin: originLabel({ hut, participant, sourceKind }),
      participantStatus: profile?.status ?? participant?.participantProfile?.status ?? hut?.status ?? "",
      screeningStatus: participant?.screeningStatus ?? "",
      screeningResult: screeningResult({ participant, review, screening }),
      screeningDate: iso(screening?.completedAt ?? confirmation?.approvedAt),
      existingClassification: priorRow?.categoriaMigracion ?? "",
      operationalClassification: classification,
      operationalStatus: participant?.operationalStatus ?? "",
      hutStatus: hut?.status ?? "",
      currentStage: stageLabel(progress),
      cltStarted: progress.cltStarted ? "SI" : "NO",
      navigoStarted: progress.navigoStarted ? "SI" : "NO",
      hutStarted: progress.hutStarted ? "SI" : "NO",
      hasAnswers: progress.answersCount > 0 ? "SI" : "NO",
      hasEvidence: progress.evidenceCount > 0 ? "SI" : "NO",
      qa: qa ? "SI" : "NO"
    },
    navFolio,
    participant,
    priorRow,
    profile,
    progress,
    qa,
    screening,
    sourceKind
  };
}

function computeProgress({ hut, participant, screeningAttempts }) {
  const screeningAnswerCount = screeningAttempts.reduce((sum, attempt) => sum + (attempt.answers?.length ?? 0), 0);
  const cltAnswers = participant?.ctlSessions?.reduce((sum, session) => sum + (session.answers?.length ?? 0), 0) ?? 0;
  const navigoResponses = participant?.activities?.reduce((sum, activity) => sum + (activity.responses?.length ?? 0), 0) ?? 0;
  const hutAnswers = hut?.questionnaireAttempt?.answers?.length ?? 0;
  const participantEvidence = participant?.participantEvidence?.length ?? 0;
  const activityEvidence = participant?.participantActivityEvidence?.length ?? 0;
  const hutEvidence = (hut?.applicationEvidence?.length ?? 0) + (hut?.applicationPhotoEntries?.length ?? 0);
  const cltStarted = Boolean(
    participant?.ctlSessions?.some((session) =>
      session.startedAt ||
      session.claimedAt ||
      session.completedAt ||
      session.status !== "PENDING" ||
      (session.answers?.length ?? 0) > 0 ||
      session.phaseProgress?.some((phase) => phase.startedAt || phase.validatedAt || phase.completedAt)
    )
  );
  const navigoStarted = Boolean(
    participant?.activities?.some((activity) =>
      activity.status !== "PENDING" ||
      activity.actualStartedAt ||
      activity.actualCompletedAt ||
      (activity.responses?.length ?? 0) > 0
    )
  );
  const hutStarted = Boolean(
    hut?.startDate ||
    (hut?.status && hut.status !== "NOT_STARTED") ||
    hutAnswers > 0 ||
    hutEvidence > 0 ||
    hut?.questionnaireAttempt?.startedAt
  );
  const operationalAnswers = cltAnswers + navigoResponses + hutAnswers;
  const operationalEvidence = activityEvidence + hutEvidence;
  return {
    activityEvidence,
    answersCount: screeningAnswerCount + operationalAnswers,
    cltAnswers,
    cltCompleted: Boolean(participant?.ctlSessions?.some((session) => session.status === "COMPLETED" || session.completedAt)),
    cltStarted,
    evidenceCount: participantEvidence + operationalEvidence,
    hutAnswers,
    hutEvidence,
    hutStarted,
    navigoResponses,
    navigoStarted,
    operationalAnswers,
    operationalEvidence,
    participantEvidence,
    screeningAnswerCount
  };
}

function classifyParticipant({ navFolio, participant, progress, qa, screening, sourceKind }) {
  if (qa) return "QA";
  if (navFolio && RELEASE_FOLIOS.has(navFolio)) return "LIBERAR";
  if (sourceKind === "HUT_PARTICIPANT_ORPHAN" || sourceKind === "PARTICIPANT_PROFILE_ORPHAN") return "OTRO";
  if (isRejected({ participant, screening })) return "RECHAZADO";
  if (progress.cltStarted || progress.navigoStarted || progress.hutStarted || progress.operationalAnswers > 0 || progress.operationalEvidence > 0) {
    return "MIGRAR_AVANCE";
  }
  if (isApproved({ participant, screening })) return "MIGRAR_SCREENING";
  return "OTRO";
}

function buildCodeRows(context) {
  const rows = [];
  const base = baseRow(context);
  for (const code of context.confirmation?.referenceCodes ?? []) {
    rows.push({
      ...base,
      slot: `Codigo ${code.slot}`,
      codeValue: code.code,
      status: "",
      source: "ParticipantReferenceCode",
      createdAt: iso(code.createdAt),
      usedAt: ""
    });
  }
  for (const code of context.hut?.phaseCodes ?? []) {
    rows.push({
      ...base,
      slot: `HUT ${code.phase} / slot ${code.slot}`,
      codeValue: "ENCRYPTED_CODE_AVAILABLE_ONLY",
      status: code.status,
      source: "HutParticipantPhaseCode",
      createdAt: iso(code.createdAt),
      usedAt: iso(code.usedAt ?? code.validatedAt)
    });
  }
  return rows;
}

function buildActivityRows(context) {
  const rows = [];
  const base = baseRow(context);
  for (const attempt of context.participant?.screeningAttempts ?? []) {
    rows.push({
      ...base,
      type: "SCREENING",
      name: "Screening / cuestionario filtro",
      status: attempt.status,
      startedAt: iso(attempt.startedAt),
      completedAt: iso(attempt.completedAt),
      updatedAt: iso(attempt.updatedAt),
      nextExpected: ""
    });
  }
  for (const session of context.participant?.ctlSessions ?? []) {
    rows.push({
      ...base,
      type: "CLT",
      name: "Sesion CLT",
      status: session.status,
      startedAt: iso(session.startedAt ?? session.claimedAt),
      completedAt: iso(session.completedAt),
      updatedAt: iso(session.updatedAt),
      nextExpected: context.priorRow?.siguienteActividadEsperada ?? ""
    });
    for (const phase of session.phaseProgress ?? []) {
      rows.push({
        ...base,
        type: "CLT",
        name: `CLT fase ${phase.phase}`,
        status: phase.status,
        startedAt: iso(phase.startedAt),
        completedAt: iso(phase.completedAt ?? phase.validatedAt),
        updatedAt: iso(phase.updatedAt),
        nextExpected: ""
      });
    }
  }
  for (const activity of context.participant?.activities ?? []) {
    rows.push({
      ...base,
      type: "NAVIGO",
      name: activity.activitySchedule?.name ?? activity.activitySchedule?.code ?? activity.occurrenceKey,
      status: activity.status,
      startedAt: iso(activity.actualStartedAt),
      completedAt: iso(activity.actualCompletedAt),
      updatedAt: iso(activity.lastSavedAt ?? activity.actualCompletedAt ?? activity.actualStartedAt),
      nextExpected: ""
    });
  }
  if (context.hut) {
    rows.push({
      ...base,
      type: "HUT",
      name: "HUT participant",
      status: context.hut.status,
      startedAt: iso(context.hut.startDate),
      completedAt: iso(context.hut.questionnaireAttempt?.completedAt),
      updatedAt: iso(context.hut.updatedAt),
      nextExpected: context.priorRow?.siguienteActividadEsperada ?? ""
    });
    for (const phase of context.hut.phaseCodes ?? []) {
      rows.push({
        ...base,
        type: "HUT",
        name: `Codigo/fase ${phase.phase}`,
        status: phase.status,
        startedAt: iso(phase.sentAt ?? phase.createdAt),
        completedAt: iso(phase.usedAt ?? phase.validatedAt),
        updatedAt: iso(phase.updatedAt),
        nextExpected: ""
      });
    }
    for (const visit of context.hut.questionnaireAttempt?.visits ?? []) {
      rows.push({
        ...base,
        type: "HUT",
        name: `Cuestionario ${visit.section}`,
        status: visit.status,
        startedAt: iso(visit.startedAt),
        completedAt: iso(visit.completedAt),
        updatedAt: iso(visit.updatedAt),
        nextExpected: ""
      });
    }
  }
  return rows;
}

function buildAnswerRows(context, questionLookup) {
  const rows = [];
  const base = baseRow(context);
  for (const attempt of context.participant?.screeningAttempts ?? []) {
    for (const answer of attempt.answers ?? []) {
      rows.push({
        ...base,
        activity: "SCREENING",
        questionId: answer.questionId,
        questionText: questionText(questionLookup, answer.questionId),
        answerReadable: readableAnswer(answer.answerJson),
        answerJson: jsonCell(answer.answerJson),
        answeredAt: iso(answer.createdAt)
      });
    }
  }
  for (const session of context.participant?.ctlSessions ?? []) {
    for (const answer of session.answers ?? []) {
      rows.push({
        ...base,
        activity: "CLT",
        questionId: answer.questionCode,
        questionText: questionText(questionLookup, answer.questionCode),
        answerReadable: readableAnswer(answer.answerValue),
        answerJson: jsonCell(answer.answerValue),
        answeredAt: iso(answer.createdAt)
      });
    }
  }
  for (const activity of context.participant?.activities ?? []) {
    for (const answer of activity.responses ?? []) {
      const key = answer.responseKey ?? answer.questionId;
      rows.push({
        ...base,
        activity: `NAVIGO ${activity.activitySchedule?.code ?? ""}`.trim(),
        questionId: key,
        questionText: questionText(questionLookup, key) || questionText(questionLookup, answer.questionId),
        answerReadable: readableAnswer(answer.answerJson),
        answerJson: jsonCell(answer.answerJson),
        answeredAt: iso(answer.createdAt)
      });
    }
  }
  for (const answer of context.hut?.questionnaireAttempt?.answers ?? []) {
    rows.push({
      ...base,
      activity: "HUT",
      questionId: answer.questionCode,
      questionText: questionText(questionLookup, answer.questionCode),
      answerReadable: readableAnswer(answer.answerJson),
      answerJson: jsonCell(answer.answerJson),
      answeredAt: iso(answer.answeredAt)
    });
  }
  return rows;
}

function buildEvidenceRows(context) {
  const rows = [];
  const base = baseRow(context);
  for (const evidence of context.participant?.participantEvidence ?? []) {
    rows.push({
      ...base,
      activity: "SCREENING",
      evidenceType: evidence.type,
      date: iso(evidence.uploadedAt),
      fileReference: evidence.privateStorageKey
    });
  }
  for (const evidence of context.participant?.participantActivityEvidence ?? []) {
    rows.push({
      ...base,
      activity: "NAVIGO",
      evidenceType: evidence.type,
      date: iso(evidence.uploadedAt),
      fileReference: evidence.privateStorageKey
    });
  }
  for (const evidence of context.hut?.applicationEvidence ?? []) {
    rows.push({
      ...base,
      activity: `HUT ${evidence.phase}`,
      evidenceType: "HutApplicationEvidence",
      date: iso(evidence.capturedAt),
      fileReference: evidence.privateStorageKey
    });
  }
  for (const evidence of context.hut?.applicationPhotoEntries ?? []) {
    rows.push({
      ...base,
      activity: `HUT useDay ${evidence.useDayNumber}`,
      evidenceType: "HutApplicationPhotoEntry",
      date: iso(evidence.capturedAt),
      fileReference: evidence.privateStorageKey
    });
  }
  return rows;
}

function buildRotationRows(context) {
  const rows = [];
  const base = baseRow(context);
  const rotation = context.participant?.rotationAssignment;
  const triangular = context.participant?.ctlTriangularRotationAssignment;
  const arms = context.participant?.armAssignments ?? [];
  if (rotation || triangular || arms.length) {
    rows.push({
      navFolio: base.navFolio,
      hutFolio: base.hutFolio,
      type: "CLT",
      status: rotation || triangular || arms.length ? "asignada" : "libre",
      pr1: triangular?.triangular1Pr1 ?? "",
      pr2: triangular?.triangular1Pr2 ?? "",
      pr3: triangular?.triangular1Pr3 ?? "",
      veri1: triangular?.triangular1Verify ?? "",
      pr4: triangular?.triangular2Pr1 ?? "",
      pr5: triangular?.triangular2Pr2 ?? "",
      pr6: triangular?.triangular2Pr3 ?? "",
      veri2: triangular?.triangular2Verify ?? "",
      eva1: arms.find((arm) => arm.applicationOrder === 1)?.studyProduct?.internalCode ?? rotation?.arms?.find((arm) => arm.applicationOrder === 1)?.studyProduct?.internalCode ?? "",
      eva2: arms.find((arm) => arm.applicationOrder === 2)?.studyProduct?.internalCode ?? rotation?.arms?.find((arm) => arm.applicationOrder === 2)?.studyProduct?.internalCode ?? "",
      rotationPlan: rotation?.rotationPlan?.name ?? rotation?.rotationPlan?.rotationCode ?? ""
    });
  }
  if (context.hut) {
    rows.push({
      navFolio: base.navFolio,
      hutFolio: base.hutFolio,
      type: "HUT",
      status: context.hut.firstFragranceLeftArm || context.hut.secondFragranceRightArm ? "asignada" : "libre",
      pr1: "",
      pr2: "",
      pr3: "",
      veri1: "",
      pr4: "",
      pr5: "",
      pr6: "",
      veri2: "",
      eva1: context.hut.firstFragranceLeftArm ?? "",
      eva2: context.hut.secondFragranceRightArm ?? "",
      rotationPlan: context.hut.registrationSlot ? `slot ${context.hut.registrationSlot.folio}` : ""
    });
  }
  return rows;
}

async function buildWorkbook(exportData) {
  const workbook = Workbook.create();
  addRowsSheet(workbook, "PARTICIPANTES MAESTRO", exportData.sheets.participants, [
    ["participantIdV1", "Participant ID V1"],
    ["navFolio", "NAV_FOLIO"],
    ["hutFolio", "HUT_FOLIO"],
    ["name", "Nombre completo"],
    ["phone", "Telefono"],
    ["email", "Email"],
    ["createdAt", "Fecha creacion"],
    ["updatedAt", "Ultima actualizacion"],
    ["origin", "Origen del registro"],
    ["participantStatus", "Estado participante"],
    ["screeningStatus", "Screening status"],
    ["screeningResult", "Screening resultado"],
    ["screeningDate", "Fecha screening"],
    ["existingClassification", "Clasificacion actual si existe"],
    ["operationalClassification", "Clasificacion operativa"],
    ["operationalStatus", "Operational status"],
    ["hutStatus", "HUT status"],
    ["currentStage", "Etapa actual"],
    ["cltStarted", "CLT iniciado"],
    ["navigoStarted", "Navigo iniciado"],
    ["hutStarted", "HUT iniciado"],
    ["hasAnswers", "Con respuestas"],
    ["hasEvidence", "Con evidencias"],
    ["qa", "QA"],
    ["sourceRecordType", "Fuente V1"],
    ["participantProfileId", "ParticipantProfile ID"],
    ["studyParticipantId", "StudyParticipant ID"],
    ["hutParticipantId", "HutParticipant ID"]
  ]);

  addRowsSheet(workbook, "CODIGOS", exportData.sheets.codes, [
    ["participantIdV1", "Participant ID V1"],
    ["navFolio", "NAV_FOLIO"],
    ["hutFolio", "HUT_FOLIO"],
    ["slot", "Slot"],
    ["codeValue", "Valor codigo"],
    ["status", "Estado uso"],
    ["source", "Fuente codigo"],
    ["createdAt", "Fecha creacion"],
    ["usedAt", "Fecha uso"]
  ]);

  addRowsSheet(workbook, "ACTIVIDADES", exportData.sheets.activities, [
    ["participantIdV1", "Participant ID V1"],
    ["navFolio", "NAV_FOLIO"],
    ["hutFolio", "HUT_FOLIO"],
    ["type", "Tipo actividad"],
    ["name", "Nombre actividad"],
    ["status", "Estado"],
    ["startedAt", "Fecha inicio"],
    ["completedAt", "Fecha termino"],
    ["updatedAt", "Ultima actualizacion"],
    ["nextExpected", "Siguiente actividad esperada"]
  ]);

  addRowsSheet(workbook, "RESPUESTAS", exportData.sheets.answers, [
    ["participantIdV1", "Participant ID V1"],
    ["navFolio", "NAV_FOLIO"],
    ["activity", "Actividad"],
    ["questionId", "Pregunta ID"],
    ["questionText", "Texto pregunta"],
    ["answerReadable", "Respuesta legible"],
    ["answerJson", "Respuesta JSON original"],
    ["answeredAt", "Fecha respuesta"]
  ]);

  addRowsSheet(workbook, "EVIDENCIAS", exportData.sheets.evidence, [
    ["participantIdV1", "Participant ID V1"],
    ["navFolio", "NAV_FOLIO"],
    ["hutFolio", "HUT_FOLIO"],
    ["activity", "Actividad"],
    ["evidenceType", "Tipo evidencia"],
    ["date", "Fecha"],
    ["fileReference", "Referencia archivo/storage"]
  ]);

  addRowsSheet(workbook, "ROTACIONES", exportData.sheets.rotations, [
    ["navFolio", "NAV_FOLIO"],
    ["hutFolio", "HUT_FOLIO"],
    ["type", "Tipo"],
    ["status", "Estado"],
    ["pr1", "PR1"],
    ["pr2", "PR2"],
    ["pr3", "PR3"],
    ["veri1", "VERI_1"],
    ["pr4", "PR4"],
    ["pr5", "PR5"],
    ["pr6", "PR6"],
    ["veri2", "VERI_2"],
    ["eva1", "EVA1"],
    ["eva2", "EVA2"],
    ["rotationPlan", "Plan/Caratula"]
  ]);

  addSummarySheet(workbook, exportData.summary);
  return workbook;
}

function addSummarySheet(workbook, summary) {
  const sheet = workbook.worksheets.add("RESUMEN");
  sheet.showGridLines = false;
  sheet.getRange("A1:E1").merge();
  sheet.getRange("A1").values = [["V1 MASTER PARTICIPANTS EXPORT"]];
  sheet.getRange("A1").format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF", size: 14 }
  };
  const rows = [
    ["Metrica", "Valor"],
    ["Total participantes V1", summary.counts.totalParticipants],
    ["Screening aprobado", summary.counts.screeningApproved],
    ["Screening rechazado", summary.counts.screeningRejected],
    ["CLT iniciado", summary.counts.cltStarted],
    ["HUT iniciado", summary.counts.hutStarted],
    ["Participantes con respuestas", summary.counts.withAnswers],
    ["Participantes con evidencias", summary.counts.withEvidence],
    ["Filas codigos", summary.counts.codes],
    ["Filas actividades", summary.counts.activities],
    ["Filas respuestas", summary.counts.answers],
    ["Filas evidencias", summary.counts.evidence],
    ["Filas rotaciones", summary.counts.rotations]
  ];
  sheet.getRangeByIndexes(2, 0, rows.length, 2).values = rows;
  sheet.getRange("A3:B3").format = { fill: "#2563EB", font: { bold: true, color: "#FFFFFF" } };

  const classificationRows = [["Clasificacion", "Cantidad"], ...Object.entries(summary.byClassification).sort()];
  sheet.getRangeByIndexes(2, 3, classificationRows.length, 2).values = classificationRows;
  sheet.getRange("D3:E3").format = { fill: "#059669", font: { bold: true, color: "#FFFFFF" } };

  sheet.getRange("A18:E18").merge();
  sheet.getRange("A18").values = [[`Generado: ${summary.generatedAt}. Fuente: ${summary.studyCode}. Export de solo lectura.`]];
  sheet.getRange("A18").format = { fill: "#FEF3C7", font: { color: "#92400E" }, wrapText: true };
  sheet.getUsedRange().format.autofitColumns();
  sheet.getUsedRange().format.autofitRows();
}

function addRowsSheet(workbook, sheetName, rows, columns) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const matrix = [
    columns.map(([, label]) => label),
    ...rows.map((row) => columns.map(([key]) => cellValue(row[key])))
  ];
  const range = sheet.getRangeByIndexes(0, 0, Math.max(matrix.length, 1), columns.length);
  range.values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, columns.length).format = {
    fill: "#1F2937",
    font: { bold: true, color: "#FFFFFF" }
  };
  range.format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  range.format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  const used = sheet.getUsedRange();
  used.format.autofitColumns();
  used.format.autofitRows();
}

async function verifyWorkbook(workbook) {
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 200 },
    summary: "formula error scan"
  });
  console.log(errors.ndjson);
  for (const sheetName of ["RESUMEN", "PARTICIPANTES MAESTRO", "CODIGOS", "ACTIVIDADES", "RESPUESTAS", "EVIDENCIAS", "ROTACIONES"]) {
    const preview = await workbook.render({ sheetName, range: "A1:J20", scale: 1, format: "png" });
    await fs.writeFile(path.join(__dirname, `${sheetName.replaceAll(" ", "_")}_preview.png`), new Uint8Array(await preview.arrayBuffer()));
  }
}

function summarize({ activityRows, answerRows, codeRows, evidenceRows, masterRows, rotationRows, study }) {
  const byClassification = {};
  for (const row of masterRows) {
    byClassification[row.operationalClassification] = (byClassification[row.operationalClassification] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    studyCode: study.code,
    studyName: study.name,
    counts: {
      activities: activityRows.length,
      answers: answerRows.length,
      cltStarted: masterRows.filter((row) => row.cltStarted === "SI").length,
      codes: codeRows.length,
      evidence: evidenceRows.length,
      hutStarted: masterRows.filter((row) => row.hutStarted === "SI").length,
      rotations: rotationRows.length,
      screeningApproved: masterRows.filter((row) => row.screeningStatus === "PASSED" || row.screeningResult === "APROBADO").length,
      screeningRejected: masterRows.filter((row) => row.operationalClassification === "RECHAZADO").length,
      totalParticipants: masterRows.length,
      withAnswers: masterRows.filter((row) => row.hasAnswers === "SI").length,
      withEvidence: masterRows.filter((row) => row.hasEvidence === "SI").length
    },
    byClassification
  };
}

async function loadQuestionLookup() {
  const map = new Map();
  try {
    const spec = JSON.parse(await fs.readFile(SPEC_JSON, "utf8"));
    for (const question of spec.questions ?? []) {
      const key = String(question.questionId ?? "").trim();
      if (key && question.textExact && !map.has(key)) {
        map.set(key, question.textExact);
      }
    }
  } catch {
    // Optional source. The export still includes question ids if unavailable.
  }
  return map;
}

async function loadPriorAudit() {
  const map = new Map();
  try {
    const audit = JSON.parse(await fs.readFile(PRIOR_AUDIT_JSON, "utf8"));
    for (const row of audit.rows ?? []) {
      if (row.NAV_FOLIO) map.set(row.NAV_FOLIO, row);
    }
  } catch {
    // Optional source.
  }
  return map;
}

function baseRow(context) {
  return {
    hutFolio: context.hutFolio ?? "",
    navFolio: context.navFolio ?? "",
    participantIdV1: context.participant?.id ?? context.hut?.id ?? context.profile?.id ?? ""
  };
}

function originLabel({ hut, participant, sourceKind }) {
  if (participant?.qaParticipantRun || hut?.qaParticipantRun) return "QA";
  if (hut?.origin) return hut.origin;
  return sourceKind;
}

function screeningResult({ participant, review, screening }) {
  if (review?.status === "APPROVED" || screening?.status === "PASSED" || participant?.screeningStatus === "PASSED") return "APROBADO";
  if (review?.status === "REJECTED" || ["FAILED", "TERMINATED"].includes(screening?.status) || participant?.screeningStatus === "TERMINATED") return "RECHAZADO";
  if (screening?.completedAt) return "COMPLETADO_SIN_RESULTADO";
  if (screening?.startedAt) return "INICIADO";
  return "";
}

function isApproved({ participant, screening }) {
  return screening?.status === "PASSED" || participant?.screeningStatus === "PASSED";
}

function isRejected({ participant, screening }) {
  return ["FAILED", "TERMINATED"].includes(screening?.status) || participant?.screeningStatus === "TERMINATED";
}

function stageLabel(progress) {
  if (progress.hutStarted) return "HUT iniciado";
  if (progress.navigoStarted) return "Navigo iniciado";
  if (progress.cltStarted) return progress.cltCompleted ? "CLT completado" : "CLT iniciado";
  if (progress.screeningAnswerCount > 0) return "Screening";
  return "Sin avance";
}

function questionText(questionLookup, questionId) {
  if (!questionId) return "";
  const id = String(questionId);
  return questionLookup.get(id) ?? questionLookup.get(id.toUpperCase()) ?? "";
}

function readableAnswer(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readableAnswer).join(" | ");
  if (typeof value === "object") {
    if (Array.isArray(value.values)) return value.values.map(readableAnswer).join(" | ") + (value.otherText ? ` | Otro: ${value.otherText}` : "");
    if ("value" in value) return readableAnswer(value.value);
    if ("answer" in value) return readableAnswer(value.answer);
  }
  return truncate(JSON.stringify(value), 32000);
}

function jsonCell(value) {
  return truncate(JSON.stringify(value ?? null), 32000);
}

function cellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return truncate(JSON.stringify(value), 32000);
  return truncate(String(value), 32000);
}

function latestBy(items, selector) {
  return [...items].sort((a, b) => new Date(selector(b) ?? 0).getTime() - new Date(selector(a) ?? 0).getTime())[0] ?? null;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function navToHutFolio(folio) {
  return folio ? folio.replace(/^NAV-/u, "HUT-") : "";
}

function hutToNavFolio(folio) {
  return folio ? folio.replace(/^HUT-/u, "NAV-") : "";
}

function iso(value) {
  return value ? new Date(value).toISOString() : "";
}

function truncate(value, maxLength) {
  return String(value ?? "").length > maxLength ? `${String(value).slice(0, maxLength - 14)}... [TRUNCADO]` : String(value ?? "");
}
