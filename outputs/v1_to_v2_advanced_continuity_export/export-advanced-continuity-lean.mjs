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

loadDotenv({ path: path.join(repoRoot, ".env") });

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const auditPath = path.join(repoRoot, "outputs", "v1_to_v2_remaining_audit", "V1_TO_V2_REMAINING_MIGRATION_AUDIT.json");
const outputJson = path.join(__dirname, "V1_TO_V2_ADVANCED_CONTINUITY_EXPORT.json");
const outputCsv = path.join(__dirname, "V1_TO_V2_ADVANCED_CONTINUITY_SUMMARY.csv");
const { prisma, pool } = createPrisma();

try {
  const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
  const auditRows = audit.rows.filter((row) => row.categoriaMigracion === "MIGRAR_AVANCE" && row.NAV_FOLIO !== "NAV-003");
  const auditByFolio = new Map(auditRows.map((row) => [row.NAV_FOLIO, row]));
  const folios = auditRows.map((row) => row.NAV_FOLIO);
  const study = await prisma.study.findUniqueOrThrow({ where: { code: STUDY_CODE }, select: { id: true, code: true, name: true } });

  const confirmations = await prisma.participantConfirmation.findMany({
    where: {
      studyId: study.id,
      folio: { in: folios }
    },
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
          participantScreeningReviews: { orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }] },
          screeningAttempts: {
            include: { answers: { orderBy: { createdAt: "asc" } } },
            orderBy: { startedAt: "asc" }
          },
          rotationAssignment: {
            include: {
              rotationPlan: true,
              arms: {
                include: { studyArm: true, studyProduct: true },
                orderBy: { applicationOrder: "asc" }
              }
            }
          },
          armAssignments: {
            include: { studyArm: true, studyProduct: true },
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
              participantActivityEvidence: true
            },
            orderBy: { scheduledAt: "asc" }
          },
          participantEvidence: { orderBy: { uploadedAt: "asc" } },
          hutParticipant: {
            include: {
              applicationEvidence: { orderBy: { capturedAt: "asc" } },
              applicationPhotoEntries: { orderBy: { capturedAt: "asc" } },
              phaseCodes: { orderBy: { slot: "asc" } },
              questionnaireAttempt: {
                include: {
                  visits: { orderBy: { createdAt: "asc" } },
                  answers: { orderBy: { answeredAt: "asc" } }
                }
              }
            }
          }
        }
      }
    },
    orderBy: { folioSequence: "asc" }
  });

  const storedRotations = await prisma.navigoRotationFolioConfiguration.findMany({
    where: { studyId: study.id, folio: { in: folios } }
  });
  const storedRotationByFolio = new Map(storedRotations.map((rotation) => [rotation.folio, rotation]));
  const participants = confirmations.map((confirmation) =>
    buildParticipant(confirmation, auditByFolio.get(confirmation.folio), storedRotationByFolio.get(confirmation.folio))
  );
  const missingFolios = folios.filter((folio) => !confirmations.some((confirmation) => confirmation.folio === folio));

  const payload = {
    schemaVersion: "v1-to-v2.advanced-continuity-export.1",
    source: {
      project: "mrblackbox-research-platform",
      studyCode: study.code,
      studyName: study.name,
      exportedAt: new Date().toISOString(),
      exportedAtMexicoCity: formatDateTimeMexicoCity(new Date()),
      readOnly: true,
      selectionSource: "outputs/v1_to_v2_remaining_audit/V1_TO_V2_REMAINING_MIGRATION_AUDIT.json",
      includedCategory: "MIGRAR_AVANCE",
      excludedManualReleaseFolios: audit.metadata.manualReleaseFolios ?? [],
      excludedReleaseFolios: audit.metadata.excludedReleaseFolios ?? []
    },
    summary: {
      requestedParticipants: folios.length,
      exportedParticipants: participants.length,
      missingFolios,
      excludedFolios: ["NAV-003", ...(audit.metadata.excludedReleaseFolios ?? [])]
    },
    participants
  };

  await fs.writeFile(outputJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(outputCsv, toSummaryCsv(participants), "utf8");

  console.log(JSON.stringify({ outputJson, outputCsv, summary: payload.summary }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function createPrisma() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no esta configurado en .env.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) }) };
}

function buildParticipant(confirmation, auditRow, storedRotation) {
  const participant = confirmation.studyParticipant;
  const profile = participant.participantProfile;
  const hut = participant.hutParticipant;
  const rotation = buildRotation(participant, hut, storedRotation);
  const activities = buildActivities(participant, hut);
  const answers = buildAnswers(participant, hut);
  const evidence = buildEvidence(participant, hut);

  return {
    identidad: {
      NAV_FOLIO: confirmation.folio,
      HUT_FOLIO: hut?.folio ?? null,
      nombre: profile.name,
      telefono: profile.phone,
      email: profile.email,
      reclutador: findRecruiter(participant.screeningAttempts),
      protocolo: hut?.origin === "HUT_DIRECTO" ? "HUT_DIRECTO" : "CLT_NAVIGO_HUT",
      productos: {
        EVA1: rotation.EVA1,
        EVA2: rotation.EVA2
      },
      idsV1: {
        participantProfileId: profile.id,
        studyParticipantId: participant.id,
        participantConfirmationId: confirmation.id,
        hutParticipantId: hut?.id ?? null
      }
    },
    screening: {
      estado: participant.screeningStatus,
      resultado: auditRow?.screeningResultado ?? participant.screeningStatus,
      fechaAprobacion: auditRow?.fechaAprobacion ?? formatDateTimeMexicoCity(confirmation.approvedAt),
      approvedAt: iso(confirmation.approvedAt)
    },
    codigos: confirmation.referenceCodes.map((code) => ({ slot: code.slot, codigo: code.code, creado: iso(code.createdAt) })),
    rotacionHistorica: rotation,
    actividades: activities.map((activity) => ({
      tipo: activity.tipo,
      codigo: activity.codigo,
      estado: activity.estado,
      inicio: activity.inicio,
      termino: activity.termino
    })),
    respuestas: answers,
    evidencias: evidence,
    clasificacion: {
      categoria: "MIGRAR_AVANCE",
      etapaActual: inferCurrentStage(auditRow),
      ultimaActividad: auditRow?.ultimaActividad ?? latestActivityLabel(activities),
      siguienteActividadEsperada: inferNextExpectedActivity(auditRow),
      respuestasExistentes: answers.length,
      accionRecomendada: auditRow?.accionRecomendada ?? "Migrar participante con avance actual y continuar en V2"
    }
  };
}

function buildRotation(participant, hut, storedRotation) {
  const arms = participant.rotationAssignment?.arms?.length ? participant.rotationAssignment.arms : participant.armAssignments;
  const eva1 = arms.find((arm) => arm.applicationOrder === 1);
  const eva2 = arms.find((arm) => arm.applicationOrder === 2);
  const triangular = participant.ctlTriangularRotationAssignment ?? storedRotation ?? null;
  return {
    PR1: triangular?.triangular1Pr1 ?? null,
    PR2: triangular?.triangular1Pr2 ?? null,
    PR3: triangular?.triangular1Pr3 ?? null,
    VERI_1: triangular?.triangular1Verify ?? null,
    PR4: triangular?.triangular2Pr1 ?? null,
    PR5: triangular?.triangular2Pr2 ?? null,
    PR6: triangular?.triangular2Pr3 ?? null,
    VERI_2: triangular?.triangular2Verify ?? null,
    EVA1: eva1?.studyProduct?.internalCode ?? storedRotation?.firstFragrance ?? hut?.firstFragranceLeftArm ?? null,
    EVA2: eva2?.studyProduct?.internalCode ?? storedRotation?.secondFragrance ?? hut?.secondFragranceRightArm ?? null,
    rotationPlanName: participant.rotationAssignment?.rotationPlan?.name ?? null,
    rotationCode: participant.rotationAssignment?.rotationCode ?? participant.rotationAssignment?.rotationPlan?.rotationCode ?? null,
    triangularSource: participant.ctlTriangularRotationAssignment
      ? "CtlTriangularRotationAssignment"
      : storedRotation
        ? "NavigoRotationFolioConfiguration"
        : null,
    hut: {
      EVA1: hut?.firstFragranceLeftArm ?? null,
      EVA2: hut?.secondFragranceRightArm ?? null
    }
  };
}

function buildActivities(participant, hut) {
  const activities = [];
  for (const session of participant.ctlSessions) {
    activities.push({
      tipo: "CLT_SESSION",
      codigo: "CLT",
      estado: session.status,
      inicio: iso(session.startedAt ?? session.claimedAt),
      termino: iso(session.completedAt)
    });
    for (const progress of session.phaseProgress) {
      activities.push({
        tipo: "CLT_PHASE",
        codigo: progress.phase,
        estado: progress.status,
        inicio: iso(progress.startedAt),
        termino: iso(progress.completedAt)
      });
    }
  }
  for (const activity of participant.activities) {
    activities.push({
      tipo: "NAVIGO_ACTIVITY",
      codigo: activity.activitySchedule?.code ?? activity.occurrenceKey,
      estado: activity.status,
      inicio: iso(activity.actualStartedAt ?? activity.scheduledAt),
      termino: iso(activity.actualCompletedAt)
    });
  }
  if (hut) {
    activities.push({
      tipo: "HUT_PARTICIPANT",
      codigo: hut.folio,
      estado: hut.status,
      inicio: iso(hut.startDate),
      termino: hut.status === "COMPLETED" ? iso(hut.updatedAt) : null
    });
    for (const phaseCode of hut.phaseCodes) {
      activities.push({
        tipo: "HUT_PHASE_CODE",
        codigo: phaseCode.phase,
        estado: phaseCode.status,
        inicio: iso(phaseCode.sentAt),
        termino: iso(phaseCode.usedAt ?? phaseCode.validatedAt)
      });
    }
    const attempt = hut.questionnaireAttempt;
    if (attempt) {
      activities.push({
        tipo: "HUT_QUESTIONNAIRE_ATTEMPT",
        codigo: "HUT_QUESTIONNAIRE",
        estado: attempt.status,
        inicio: iso(attempt.startedAt),
        termino: iso(attempt.completedAt)
      });
      for (const visit of attempt.visits) {
        activities.push({
          tipo: "HUT_VISIT_PROGRESS",
          codigo: visit.section,
          estado: visit.status,
          inicio: iso(visit.startedAt),
          termino: iso(visit.completedAt)
        });
      }
    }
  }
  return activities;
}

function buildAnswers(participant, hut) {
  const answers = [];
  for (const attempt of participant.screeningAttempts) {
    for (const answer of attempt.answers) {
      answers.push({ actividad: "SCREENING", preguntaV1: answer.questionId, respuesta: answer.answerJson, fecha: iso(answer.createdAt) });
    }
  }
  for (const session of participant.ctlSessions) {
    for (const answer of session.answers) {
      answers.push({ actividad: "CLT", preguntaV1: answer.questionCode, respuesta: answer.answerValue, fecha: iso(answer.updatedAt ?? answer.createdAt) });
    }
  }
  for (const activity of participant.activities) {
    const activityCode = activity.activitySchedule?.code ?? activity.occurrenceKey;
    for (const response of activity.responses) {
      answers.push({ actividad: `NAVIGO:${activityCode}`, preguntaV1: response.responseKey, respuesta: response.answerJson, fecha: iso(response.updatedAt ?? response.createdAt) });
    }
  }
  const attempt = hut?.questionnaireAttempt;
  if (attempt) {
    const visitsById = new Map(attempt.visits.map((visit) => [visit.id, visit.section]));
    for (const answer of attempt.answers) {
      answers.push({ actividad: `HUT:${visitsById.get(answer.visitProgressId) ?? "QUESTIONNAIRE"}`, preguntaV1: answer.questionCode, respuesta: answer.answerJson, fecha: iso(answer.answeredAt) });
    }
  }
  return answers;
}

function buildEvidence(participant, hut) {
  const evidence = [];
  for (const item of participant.participantEvidence) {
    evidence.push({
      actividad: "SCREENING",
      tipo: item.type,
      fecha: iso(item.uploadedAt),
      referenciaArchivo: item.privateStorageKey,
      archivoOriginal: item.originalFilename ?? null
    });
  }
  for (const activity of participant.activities) {
    const activityCode = activity.activitySchedule?.code ?? activity.occurrenceKey;
    for (const item of activity.participantActivityEvidence) {
      evidence.push({
        actividad: `NAVIGO:${activityCode}`,
        tipo: item.type,
        fecha: iso(item.uploadedAt),
        referenciaArchivo: item.privateStorageKey,
        archivoOriginal: item.originalFilename ?? null
      });
    }
  }
  if (hut) {
    for (const item of hut.applicationEvidence) {
      evidence.push({
        actividad: "HUT",
        tipo: `APPLICATION_EVIDENCE:${item.phase}`,
        fecha: iso(item.capturedAt),
        referenciaArchivo: item.privateStorageKey,
        archivoOriginal: item.originalFilename ?? null,
        productCode: item.productCode ?? null
      });
    }
    for (const item of hut.applicationPhotoEntries) {
      evidence.push({
        actividad: "HUT",
        tipo: `PHOTO_ENTRY:DAY_${item.useDayNumber}`,
        fecha: iso(item.capturedAt),
        referenciaArchivo: item.privateStorageKey,
        archivoOriginal: item.originalFilename ?? null,
        productCode: item.productCode ?? null
      });
    }
  }
  return evidence;
}

function findRecruiter(screeningAttempts) {
  for (const attempt of screeningAttempts) {
    const answer = attempt.answers.find((item) => {
      const key = String(item.questionId ?? "").toUpperCase();
      return key.includes("RECLUTADOR") || key === "F0" || key === "OP1_RECLUTADOR";
    });
    if (answer) return stringifyAnswer(answer.answerJson);
  }
  return null;
}

function inferCurrentStage(row) {
  if (!row) return "MIGRAR_AVANCE";
  if (row.hutIniciado === "SI") return `HUT: ${row.hutEtapaActual || row.hutUltimaActividad || "INICIADO"}`;
  if (row.navigoIniciado === "SI") return row.navigoCompletado === "SI" ? "NAVIGO_COMPLETADO" : "NAVIGO_EN_PROGRESO";
  if (row.cltIniciado === "SI") return row.cltCompletado === "SI" ? "CLT_COMPLETADO" : "CLT_EN_PROGRESO";
  return "SCREENING_APROBADO";
}

function inferNextExpectedActivity(row) {
  if (!row) return "Revisar continuidad operativa";
  if (row.hutIniciado === "SI") return "Continuar HUT desde etapa actual";
  if (row.navigoIniciado === "SI" && row.navigoCompletado !== "SI") return "Continuar evaluaciones Navigo pendientes";
  if (row.navigoIniciado === "SI" && row.navigoCompletado === "SI") return "Iniciar o continuar HUT";
  if (row.cltIniciado === "SI" && row.cltCompletado !== "SI") return "Continuar CLT";
  if (row.cltIniciado === "SI" && row.cltCompletado === "SI") return "Liberar o continuar Navigo";
  return "Revisar continuidad operativa";
}

function latestActivityLabel(activities) {
  const latest = activities
    .filter((activity) => activity.termino || activity.inicio)
    .sort((left, right) => dateMs(right.termino ?? right.inicio) - dateMs(left.termino ?? left.inicio))
    .at(0);
  return latest ? `${latest.tipo}:${latest.codigo}:${latest.estado}` : "";
}

function toSummaryCsv(participants) {
  const headers = ["NAV_FOLIO", "HUT_FOLIO", "Nombre", "Categoria", "Ultima actividad", "Respuestas", "Evidencias", "Etapa actual", "Siguiente actividad", "PR1", "PR2", "PR3", "VERI_1", "PR4", "PR5", "PR6", "VERI_2", "EVA1", "EVA2"];
  const rows = participants.map((participant) => [
    participant.identidad.NAV_FOLIO,
    participant.identidad.HUT_FOLIO,
    participant.identidad.nombre,
    participant.clasificacion.categoria,
    participant.clasificacion.ultimaActividad,
    participant.respuestas.length,
    participant.evidencias.length,
    participant.clasificacion.etapaActual,
    participant.clasificacion.siguienteActividadEsperada,
    participant.rotacionHistorica.PR1,
    participant.rotacionHistorica.PR2,
    participant.rotacionHistorica.PR3,
    participant.rotacionHistorica.VERI_1,
    participant.rotacionHistorica.PR4,
    participant.rotacionHistorica.PR5,
    participant.rotacionHistorica.PR6,
    participant.rotacionHistorica.VERI_2,
    participant.rotacionHistorica.EVA1,
    participant.rotacionHistorica.EVA2
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function stringifyAnswer(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyAnswer).filter(Boolean).join(" | ");
  if (typeof value === "object") {
    if ("text" in value) return stringifyAnswer(value.text);
    if ("value" in value) return stringifyAnswer(value.value);
    if ("label" in value) return stringifyAnswer(value.label);
  }
  return JSON.stringify(value);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dateMs(value) {
  return value ? new Date(value).getTime() : 0;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDateTimeMexicoCity(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}
