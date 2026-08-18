import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const FOLIOS = [
  "NAV-038",
  "NAV-043",
  "NAV-009",
  "NAV-023",
  "NAV-024",
  "NAV-044",
  "NAV-053",
  "NAV-054",
  "NAV-055",
  "NAV-056",
  "NAV-058",
  "NAV-068",
  "NAV-079",
  "NAV-080",
  "NAV-081",
  "NAV-082",
  "NAV-084",
  "NAV-085",
  "NAV-089",
  "NAV-096"
];

const outputJson = path.join(__dirname, "vanguardia_recovered_folios_audit.json");
const outputCsv = path.join(__dirname, "vanguardia_recovered_folios_audit.csv");

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma(process.env.DATABASE_URL);

try {
  const report = await buildReport();
  await fs.writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(outputCsv, toCsv(report.rows), "utf8");
  console.log(JSON.stringify({
    outputCsv,
    outputJson,
    summary: report.summary,
    v2: report.v2
  }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function createPrisma(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL no esta configurado.");
  }
  const pool = new Pool({ connectionString, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: false })
    })
  };
}

async function buildReport() {
  const study = await prisma.study.findUnique({
    select: { code: true, id: true, name: true },
    where: { code: STUDY_CODE }
  });
  if (!study) {
    throw new Error(`No existe estudio ${STUDY_CODE}`);
  }

  const confirmations = await prisma.participantConfirmation.findMany({
    include: {
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          answers: { orderBy: { createdAt: "asc" } },
          participantScreeningReview: true
        }
      },
      studyParticipant: {
        include: {
          participantProfile: true,
          participantScreeningReviews: true,
          screeningAttempts: {
            include: {
              answers: { orderBy: { createdAt: "asc" } },
              participantScreeningReview: true
            },
            orderBy: [{ startedAt: "asc" }]
          },
          participantEvidence: { orderBy: { uploadedAt: "asc" } },
          participantActivityEvidence: { orderBy: { uploadedAt: "asc" } },
          rotationAssignment: {
            include: {
              rotationPlan: true,
              arms: {
                include: {
                  studyArm: true,
                  studyProduct: true
                },
                orderBy: { applicationOrder: "asc" }
              }
            }
          },
          armAssignments: {
            include: {
              studyArm: true,
              studyProduct: true
            },
            orderBy: { applicationOrder: "asc" }
          },
          ctlTriangularRotationAssignment: true,
          ctlSessions: {
            include: {
              answers: { orderBy: { createdAt: "asc" } },
              phaseProgress: { orderBy: { createdAt: "asc" } }
            },
            orderBy: { createdAt: "asc" }
          },
          accessTokens: { orderBy: { createdAt: "desc" } },
          activities: {
            include: {
              activitySchedule: true,
              responses: { orderBy: { createdAt: "asc" } },
              participantActivityEvidence: true,
              reminders: { orderBy: { sentAt: "desc" } }
            },
            orderBy: { scheduledAt: "asc" }
          },
          hutParticipant: {
            include: {
              applicationEvidence: { orderBy: { capturedAt: "asc" } },
              applicationPhotoEntries: { orderBy: { capturedAt: "asc" } },
              phaseCodes: { orderBy: { slot: "asc" } },
              questionnaireAttempt: {
                include: {
                  answers: { orderBy: { answeredAt: "asc" } },
                  visits: { orderBy: { createdAt: "asc" } }
                }
              },
              registrationSlot: true
            }
          },
          qaParticipantRun: true
        }
      }
    },
    where: {
      folio: { in: FOLIOS },
      studyId: study.id
    }
  });

  const confirmationByFolio = new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));
  const hutByFolio = await prisma.hutParticipant.findMany({
    include: {
      applicationEvidence: { orderBy: { capturedAt: "asc" } },
      applicationPhotoEntries: { orderBy: { capturedAt: "asc" } },
      phaseCodes: { orderBy: { slot: "asc" } },
      questionnaireAttempt: {
        include: {
          answers: { orderBy: { answeredAt: "asc" } },
          visits: { orderBy: { createdAt: "asc" } }
        }
      },
      registrationSlot: true,
      qaParticipantRun: true,
      studyParticipant: {
        include: {
          participantConfirmation: true,
          participantProfile: true
        }
      }
    },
    where: {
      folio: { in: FOLIOS.map(navToHutFolio) },
      studyId: study.id
    }
  });
  const hutByNavFolio = new Map(hutByFolio.map((hut) => [hutToNavFolio(hut.folio), hut]));

  const rows = FOLIOS.map((folio) => {
    const confirmation = confirmationByFolio.get(folio) ?? null;
    const participant = confirmation?.studyParticipant ?? null;
    const hut = participant?.hutParticipant ?? hutByNavFolio.get(folio) ?? null;
    const row = buildFolioRow({ confirmation, folio, hut, participant });
    return row;
  });

  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    acc.byClassification[row.classification] = (acc.byClassification[row.classification] ?? 0) + 1;
    acc.v1Found += row.v1.exists ? 1 : 0;
    acc.v1Missing += row.v1.exists ? 0 : 1;
    return acc;
  }, { byClassification: {}, total: 0, v1Found: 0, v1Missing: 0 });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      studyCode: study.code,
      studyId: study.id,
      studyName: study.name,
      requestedFolios: FOLIOS
    },
    summary,
    v2: {
      checked: false,
      reason: "No hay variable de conexion V2 configurada en el entorno local. Variables detectadas: DATABASE_URL solamente.",
      requiredForFinalOccupationCheck: "Configurar una conexion V2 de solo lectura, por ejemplo V2_DATABASE_URL."
    },
    rows
  };
}

function buildFolioRow({ confirmation, folio, hut, participant }) {
  const profile = participant?.participantProfile ?? null;
  const screeningAttempts = participant?.screeningAttempts ?? (confirmation?.screeningAttempt ? [confirmation.screeningAttempt] : []);
  const latestScreening = [...screeningAttempts].sort((a, b) =>
    new Date(b.completedAt ?? b.startedAt ?? 0).getTime() - new Date(a.completedAt ?? a.startedAt ?? 0).getTime()
  )[0] ?? null;
  const codes = Object.fromEntries((confirmation?.referenceCodes ?? []).map((code) => [code.slot, code.code]));
  const ctlSessions = participant?.ctlSessions ?? [];
  const ctlAnswers = ctlSessions.flatMap((session) => session.answers ?? []);
  const navigoActivities = participant?.activities ?? [];
  const navigoResponses = navigoActivities.flatMap((activity) => activity.responses ?? []);
  const hutAnswers = hut?.questionnaireAttempt?.answers ?? [];
  const participantActivityEvidence = participant?.participantActivityEvidence ?? [];
  const hutEvidence = hut?.applicationEvidence ?? [];
  const hutPhotos = hut?.applicationPhotoEntries ?? [];
  const evidence = [
    ...(participant?.participantEvidence ?? []).map((item) => ({ source: "ParticipantEvidence", ...summarizeEvidence(item) })),
    ...participantActivityEvidence.map((item) => ({ source: "ParticipantActivityEvidence", ...summarizeEvidence(item) })),
    ...hutEvidence.map((item) => ({ source: "HutApplicationEvidence", ...summarizeHutEvidence(item) })),
    ...hutPhotos.map((item) => ({ source: "HutApplicationPhotoEntry", ...summarizeHutPhoto(item) }))
  ];
  const responseCount = (latestScreening?.answers?.length ?? 0) + ctlAnswers.length + navigoResponses.length + hutAnswers.length;
  const operationalResponseCount = ctlAnswers.length + navigoResponses.length + hutAnswers.length;
  const operationalEvidenceCount = participantActivityEvidence.length + hutEvidence.length + hutPhotos.length;
  const activities = [
    ...ctlSessions.map((session) => ({
      completedAt: iso(session.completedAt),
      kind: "CLT",
      startedAt: iso(session.startedAt ?? session.claimedAt),
      status: session.status
    })),
    ...navigoActivities.map((activity) => ({
      code: activity.activitySchedule?.code ?? null,
      completedAt: iso(activity.actualCompletedAt),
      kind: "NAVIGO",
      scheduledAt: iso(activity.scheduledAt),
      startedAt: iso(activity.actualStartedAt),
      status: activity.status
    })),
    ...(hut ? [{
      completedAt: iso(hut.questionnaireAttempt?.completedAt),
      kind: "HUT",
      startedAt: iso(hut.startDate ?? hut.questionnaireAttempt?.startedAt),
      status: hut.status
    }] : [])
  ];
  const progressFlags = {
    cltAnswers: ctlAnswers.length,
    cltCompleted: ctlSessions.some((session) => session.status === "COMPLETED"),
    cltStarted: ctlSessions.some((session) => session.startedAt || session.claimedAt || session.completedAt || session.status !== "PENDING"),
    evidenceCount: evidence.length,
    hutAnswers: hutAnswers.length,
    hutExists: Boolean(hut),
    hutPhotos: hutEvidence.length + hutPhotos.length,
    hutStarted: Boolean(hut?.startDate || hut?.status && hut.status !== "NOT_STARTED" || hutAnswers.length > 0),
    navigoActivities: navigoActivities.length,
    navigoCompleted: navigoActivities.some((activity) => activity.status === "COMPLETED"),
    navigoResponses: navigoResponses.length,
    navigoStarted: navigoActivities.some((activity) => activity.status !== "PENDING" || activity.actualStartedAt || activity.actualCompletedAt || (activity.responses?.length ?? 0) > 0),
    operationalEvidenceCount,
    operationalResponseCount,
    responseCount
  };
  const classification = classifyV1({ confirmation, hut, participant, progressFlags });

  return {
    folio,
    classification,
    recommendation: recommendationFor(classification),
    v1: {
      exists: Boolean(confirmation || hut),
      navFolio: confirmation?.folio ?? hut?.studyParticipant?.participantConfirmation?.folio ?? null,
      hutFolio: hut?.folio ?? null,
      participantProfileId: profile?.id ?? null,
      studyParticipantId: participant?.id ?? hut?.studyParticipantId ?? null,
      hutParticipantId: hut?.id ?? null,
      name: profile?.name ?? hut?.studyParticipant?.participantProfile?.name ?? hut?.name ?? null,
      phone: profile?.phone ?? hut?.studyParticipant?.participantProfile?.phone ?? hut?.phone ?? null,
      email: profile?.email ?? hut?.studyParticipant?.participantProfile?.email ?? hut?.email ?? null,
      protocol: inferProtocol(participant, hut),
      qa: Boolean(participant?.qaParticipantRun || hut?.qaParticipantRun),
      codes: {
        codigo1: codes[1] ?? null,
        codigo2: codes[2] ?? null,
        codigo3: codes[3] ?? null,
        count: Object.keys(codes).length
      },
      screening: {
        aggregateStatus: participant?.screeningStatus ?? null,
        operationalStatus: participant?.operationalStatus ?? null,
        attemptCount: screeningAttempts.length,
        latestStatus: latestScreening?.status ?? null,
        completed: Boolean(latestScreening?.completedAt),
        approved: Boolean(
          latestScreening?.status === "PASSED" ||
          participant?.screeningStatus === "PASSED" ||
          screeningAttempts.some((attempt) => attempt.participantScreeningReview?.status === "APPROVED")
        ),
        rejected: Boolean(
          latestScreening?.status === "TERMINATED" ||
          latestScreening?.status === "FAILED" ||
          participant?.screeningStatus === "TERMINATED"
        ),
        completedAt: iso(latestScreening?.completedAt),
        rejectionReason: latestScreening?.terminationReason ?? latestScreening?.participantScreeningReview?.rejectionReason ?? null
      },
      progress: progressFlags,
      activities,
      answers: {
        screening: (latestScreening?.answers ?? []).map((answer) => ({
          answer: answer.answerJson,
          answeredAt: iso(answer.createdAt),
          questionKey: answer.questionId
        })),
        clt: ctlAnswers.map((answer) => ({
          answer: answer.answerValue,
          answeredAt: iso(answer.createdAt),
          questionKey: answer.questionCode
        })),
        navigo: navigoResponses.map((answer) => ({
          activityCode: answer.participantActivityId,
          answer: answer.answerJson,
          answeredAt: iso(answer.createdAt),
          questionKey: answer.questionKey
        })),
        hut: hutAnswers.map((answer) => ({
          answer: answer.answerJson,
          answeredAt: iso(answer.answeredAt),
          questionKey: answer.questionCode
        }))
      },
      evidence,
      rotations: {
        clt: participant?.rotationAssignment ? {
          rotationCode: participant.rotationAssignment.rotationPlan?.rotationCode ?? null,
          rotationPlanName: participant.rotationAssignment.rotationPlan?.name ?? null,
          arms: participant.rotationAssignment.arms.map((arm) => ({
            arm: arm.studyArm?.code ?? null,
            applicationOrder: arm.applicationOrder,
            product: arm.studyProduct?.internalCode ?? null
          }))
        } : null,
        triangular: participant?.ctlTriangularRotationAssignment ? {
          pr1: participant.ctlTriangularRotationAssignment.triangular1Pr1,
          pr2: participant.ctlTriangularRotationAssignment.triangular1Pr2,
          pr3: participant.ctlTriangularRotationAssignment.triangular1Pr3,
          veri1: participant.ctlTriangularRotationAssignment.triangular1Verify,
          pr4: participant.ctlTriangularRotationAssignment.triangular2Pr1,
          pr5: participant.ctlTriangularRotationAssignment.triangular2Pr2,
          pr6: participant.ctlTriangularRotationAssignment.triangular2Pr3,
          veri2: participant.ctlTriangularRotationAssignment.triangular2Verify
        } : null,
        hut: hut ? {
          eva1: hut.firstFragranceLeftArm,
          eva2: hut.secondFragranceRightArm
        } : null
      }
    },
    v2: {
      checked: false,
      participantExists: null,
      occupation: "NO_VERIFICADO_SIN_CONEXION_V2",
      origin: null,
      status: null,
      activities: null,
      responses: null,
      evidence: null,
      claimedRotations: null
    }
  };
}

function classifyV1({ confirmation, hut, participant, progressFlags }) {
  if (!confirmation && !hut) {
    return "D) NO EXISTE EN V1";
  }
  if (participant?.qaParticipantRun || hut?.qaParticipantRun) {
    return "B) FOLIO OCUPADO POR PRUEBA - LIBERAR";
  }
  if (!confirmation && hut) {
    return "C) FOLIO OCUPADO REAL - REVISAR";
  }
  if (progressFlags.cltStarted || progressFlags.navigoStarted || progressFlags.hutStarted || progressFlags.operationalResponseCount > 0 || progressFlags.operationalEvidenceCount > 0) {
    return "C) FOLIO OCUPADO REAL - REVISAR";
  }
  return "A) LISTO PARA MIGRAR";
}

function recommendationFor(classification) {
  if (classification.startsWith("A)")) {
    return "Migrar si V2 confirma folio libre.";
  }
  if (classification.startsWith("B)")) {
    return "Liberar solo mediante herramienta QA/autorizada.";
  }
  if (classification.startsWith("C)")) {
    return "Revisar ocupacion/avance antes de migrar o liberar.";
  }
  return "No migrar desde V1; confirmar origen externo.";
}

function inferProtocol(participant, hut) {
  if (hut?.origin === "HUT_DIRECTO") return "HUT_DIRECTO";
  if (hut || participant?.ctlSessions?.length || participant?.activities?.length) return "CLT_NAVIGO_HUT";
  return null;
}

function summarizeEvidence(item) {
  return {
    capturedAt: iso(item.uploadedAt ?? item.createdAt),
    file: item.privateStorageKey ?? null,
    status: item.reviewStatus ?? null,
    type: item.type ?? null
  };
}

function summarizeHutEvidence(item) {
  return {
    capturedAt: iso(item.capturedAt),
    file: item.privateStorageKey ?? null,
    phase: item.phase,
    product: item.productCode,
    type: "HUT_APPLICATION_EVIDENCE"
  };
}

function summarizeHutPhoto(item) {
  return {
    capturedAt: iso(item.capturedAt),
    file: item.privateStorageKey ?? null,
    product: item.productCode,
    type: "HUT_APPLICATION_PHOTO_ENTRY",
    useDayNumber: item.useDayNumber
  };
}

function navToHutFolio(folio) {
  return folio.replace(/^NAV-/u, "HUT-");
}

function hutToNavFolio(folio) {
  return folio?.replace(/^HUT-/u, "NAV-") ?? null;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

function toCsv(rows) {
  const headers = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "NOMBRE",
    "TELEFONO",
    "EMAIL",
    "CODIGO_1",
    "CODIGO_2",
    "CODIGO_3",
    "SCREENING",
    "SCREENING_COMPLETED_AT",
    "AVANCE",
    "ACTIVIDADES",
    "RESPUESTAS",
    "EVIDENCIAS",
    "V2_OCUPACION",
    "CLASIFICACION",
    "RECOMENDACION"
  ];
  const lines = rows.map((row) => [
    row.folio,
    row.v1.hutFolio ?? "",
    row.v1.name ?? "",
    row.v1.phone ?? "",
    row.v1.email ?? "",
    row.v1.codes.codigo1 ?? "",
    row.v1.codes.codigo2 ?? "",
    row.v1.codes.codigo3 ?? "",
    row.v1.screening.latestStatus ?? row.v1.screening.aggregateStatus ?? "",
    row.v1.screening.completedAt ?? "",
    stageLabel(row.v1.progress),
    row.v1.activities.length,
    row.v1.progress.responseCount,
    row.v1.progress.evidenceCount,
    row.v2.occupation,
    row.classification,
    row.recommendation
  ]);
  return [headers, ...lines].map((line) => line.map(csvCell).join(",")).join("\n");
}

function stageLabel(progress) {
  if (progress.hutStarted) return "HUT iniciado";
  if (progress.navigoStarted) return "Navigo iniciado";
  if (progress.cltStarted) return progress.cltCompleted ? "CLT completado" : "CLT iniciado";
  if (progress.hutExists) return "Screening aprobado; HUT reservado/no iniciado";
  if (progress.responseCount > 0 || progress.evidenceCount > 0) return "Screening aprobado sin avance operativo";
  return "Sin avance operativo posterior";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
