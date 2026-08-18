import fs from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
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

const STUDY_CODE = process.env.EXPORT_STUDY_CODE || "FMASCULINA-NAVIGO-2026";
const PUBLIC_ORIGIN =
  normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL
  ) || "https://mrblackbox-research-platform.vercel.app";
const DEFAULT_FOLIO = "NAV-119";
const SCREENING_EVIDENCE_SIGNED_LINK_TTL_SECONDS = 60 * 60 * 24 * 7;

const folio = normalizeFolio(process.argv[2] || DEFAULT_FOLIO);
const outputFile = path.join(__dirname, `${folio}_v1_to_v2.json`);
const { prisma, pool } = createPrisma();

try {
  const exportJson = await buildParticipantExport(folio);
  await fs.writeFile(outputFile, `${JSON.stringify(exportJson, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: outputFile,
        folio,
        activities: exportJson.activities.length,
        answers: exportJson.answers.length,
        evidence: exportJson.evidence.length,
        warnings: exportJson.warnings
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

async function buildParticipantExport(navFolio) {
  const confirmation = await prisma.participantConfirmation.findFirst({
    where: { folio: navFolio },
    include: {
      study: { select: { id: true, code: true, name: true } },
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          answers: { orderBy: { createdAt: "asc" } }
        }
      },
      studyParticipant: {
        include: {
          participantProfile: true,
          participantScreeningReviews: {
            orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }]
          },
          screeningAttempts: {
            include: {
              answers: { orderBy: { createdAt: "asc" } }
            },
            orderBy: { startedAt: "asc" }
          },
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
              mediaEvidence: true,
              reminders: { orderBy: { sentAt: "desc" } }
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
              },
              referenceSelfie: true,
              videoSubmissions: { orderBy: { submittedAt: "asc" } },
              blocks: true,
              dailyChecks: true,
              callEvaluations: true,
              visualVerifications: true,
              registrationSlot: true
            }
          }
        }
      }
    }
  });

  if (!confirmation) {
    throw new Error(`No se encontro ParticipantConfirmation para ${navFolio}.`);
  }

  const participant = confirmation.studyParticipant;
  const profile = participant.participantProfile;
  const hutParticipant = participant.hutParticipant;
  const storedRotation = await prisma.navigoRotationFolioConfiguration.findFirst({
    where: { studyId: confirmation.studyId, folio: navFolio }
  });
  const auditLogs = await readAuditLogs(participant, hutParticipant);

  const products = buildProducts(participant, hutParticipant);
  const rotations = buildRotations(participant, hutParticipant, storedRotation);
  const activities = buildActivities(participant, hutParticipant, auditLogs);
  const answers = buildAnswers(participant, hutParticipant);
  const evidence = buildEvidence(participant, hutParticipant);

  return {
    schemaVersion: "v1-to-v2.participant-export.1",
    source: {
      project: "mrblackbox-research-platform",
      studyCode: confirmation.study.code,
      studyName: confirmation.study.name,
      exportedAt: new Date().toISOString(),
      exportedAtMexicoCity: formatDateTimeMexicoCity(new Date()),
      readOnly: true,
      publicOrigin: PUBLIC_ORIGIN
    },
    participant: {
      navFolio: confirmation.folio,
      hutFolio: hutParticipant?.folio ?? null,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      protocol: inferProtocol(participant, hutParticipant),
      products,
      ids: {
        participantProfileId: profile.id,
        studyParticipantId: participant.id,
        participantConfirmationId: confirmation.id,
        hutParticipantId: hutParticipant?.id ?? null
      },
      statuses: {
        screeningStatus: participant.screeningStatus,
        operationalStatus: participant.operationalStatus,
        hutStatus: hutParticipant?.status ?? null
      },
      createdAt: iso(participant.createdAt),
      updatedAt: iso(participant.updatedAt)
    },
    codes: confirmation.referenceCodes.map((code) => ({
      slot: code.slot,
      code: code.code,
      source: "ParticipantReferenceCode",
      createdAt: iso(code.createdAt)
    })),
    rotations,
    activities,
    answers,
    evidence,
    audit: auditLogs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actorType: log.actorType,
      actorUserId: log.actorUserId,
      reason: log.reason,
      createdAt: iso(log.createdAt),
      createdAtMexicoCity: formatDateTimeMexicoCity(log.createdAt),
      beforeJson: log.beforeJson,
      afterJson: log.afterJson
    })),
    warnings: buildWarnings(confirmation, participant, hutParticipant, rotations, evidence)
  };
}

async function readAuditLogs(participant, hutParticipant) {
  const ids = new Set([
    participant.id,
    participant.participantProfileId,
    participant.participantConfirmation?.id,
    participant.rotationAssignment?.id,
    participant.ctlTriangularRotationAssignment?.id,
    hutParticipant?.id,
    hutParticipant?.questionnaireAttempt?.id
  ]);
  for (const session of participant.ctlSessions) {
    ids.add(session.id);
  }
  for (const activity of participant.activities) {
    ids.add(activity.id);
  }
  for (const evidence of participant.participantEvidence) {
    ids.add(evidence.id);
  }
  if (hutParticipant) {
    for (const evidence of hutParticipant.applicationEvidence) {
      ids.add(evidence.id);
    }
    for (const photo of hutParticipant.applicationPhotoEntries) {
      ids.add(photo.id);
    }
  }

  return prisma.auditLog.findMany({
    where: { entityId: { in: [...ids].filter(Boolean) } },
    orderBy: { createdAt: "asc" }
  });
}

function buildProducts(participant, hutParticipant) {
  const arms = getArms(participant);
  const eva1 = arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const eva2 = arms.find((arm) => arm.applicationOrder === 2) ?? null;
  return {
    eva1: eva1 ? productSummary(eva1) : fallbackProduct(hutParticipant?.firstFragranceLeftArm, "EVA1"),
    eva2: eva2 ? productSummary(eva2) : fallbackProduct(hutParticipant?.secondFragranceRightArm, "EVA2"),
    arms: arms.map(productSummary)
  };
}

function buildRotations(participant, hutParticipant, storedRotation) {
  const arms = getArms(participant);
  const eva1 = arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const eva2 = arms.find((arm) => arm.applicationOrder === 2) ?? null;
  const triangular = participant.ctlTriangularRotationAssignment ?? storedRotation ?? null;
  const triangularSource = participant.ctlTriangularRotationAssignment
    ? "CtlTriangularRotationAssignment"
    : storedRotation
      ? "NavigoRotationFolioConfiguration"
      : null;

  return {
    clt: {
      rotationPlanName: participant.rotationAssignment?.rotationPlan?.name ?? null,
      rotationCode:
        participant.rotationAssignment?.rotationCode ??
        participant.rotationAssignment?.rotationPlan?.rotationCode ??
        null,
      eva1: eva1 ? productSummary(eva1) : fallbackProduct(storedRotation?.firstFragrance, "EVA1"),
      eva2: eva2 ? productSummary(eva2) : fallbackProduct(storedRotation?.secondFragrance, "EVA2"),
      pr1: triangular?.triangular1Pr1 ?? null,
      pr2: triangular?.triangular1Pr2 ?? null,
      pr3: triangular?.triangular1Pr3 ?? null,
      pr4: triangular?.triangular2Pr1 ?? null,
      pr5: triangular?.triangular2Pr2 ?? null,
      pr6: triangular?.triangular2Pr3 ?? null,
      veri1: triangular?.triangular1Verify ?? null,
      veri2: triangular?.triangular2Verify ?? null,
      triangularSource,
      importedAt: iso(triangular?.importedAt)
    },
    hut: {
      eva1:
        hutParticipant?.firstFragranceLeftArm ??
        eva1?.studyProduct?.internalCode ??
        storedRotation?.firstFragrance ??
        null,
      eva2:
        hutParticipant?.secondFragranceRightArm ??
        eva2?.studyProduct?.internalCode ??
        storedRotation?.secondFragrance ??
        null,
      source: hutParticipant ? "HutParticipant" : storedRotation ? "NavigoRotationFolioConfiguration" : null
    }
  };
}

function buildActivities(participant, hutParticipant, auditLogs) {
  const activities = [];

  for (const session of participant.ctlSessions) {
    activities.push({
      type: "CLT_SESSION",
      code: "CLT",
      status: session.status,
      startedAt: iso(session.startedAt),
      completedAt: iso(session.completedAt),
      metadata: {
        ctlSessionId: session.id,
        claimedAt: iso(session.claimedAt),
        triangularRotationSnapshot: session.triangularRotationSnapshot
      }
    });
    for (const progress of session.phaseProgress) {
      activities.push({
        type: "CLT_PHASE",
        code: progress.phase,
        status: progress.status,
        startedAt: iso(progress.startedAt),
        completedAt: iso(progress.completedAt),
        metadata: {
          ctlPhaseProgressId: progress.id,
          referenceCodeSlot: progress.referenceCodeSlot,
          productCode: progress.productCode,
          arm: progress.arm,
          validatedAt: iso(progress.validatedAt)
        }
      });
    }
  }

  for (const activity of participant.activities) {
    activities.push({
      type: "NAVIGO_ACTIVITY",
      code: activity.activitySchedule?.code ?? activity.occurrenceKey,
      status: activity.status,
      scheduledAt: iso(activity.scheduledAt),
      availableFrom: iso(activity.availableFrom),
      availableUntil: iso(activity.availableUntil),
      startedAt: iso(activity.actualStartedAt),
      completedAt: iso(activity.actualCompletedAt),
      metadata: {
        participantActivityId: activity.id,
        scheduleName: activity.activitySchedule?.name ?? null,
        scheduleType: activity.activitySchedule?.type ?? null,
        occurrenceKey: activity.occurrenceKey,
        lastSavedAt: iso(activity.lastSavedAt),
        reopenedAt: iso(activity.reopenedAt),
        reopenReason: activity.reopenReason,
        reminders: activity.reminders.map((reminder) => ({
          id: reminder.id,
          channel: reminder.channel,
          status: reminder.status,
          scheduledFor: iso(reminder.scheduledFor),
          sentAt: iso(reminder.sentAt),
          metadataJson: reminder.metadataJson
        }))
      }
    });
  }

  if (hutParticipant) {
    activities.push({
      type: "HUT_PARTICIPANT",
      code: hutParticipant.folio,
      status: hutParticipant.status,
      startedAt: iso(hutParticipant.startDate),
      completedAt: hutParticipant.status === "COMPLETED" ? iso(hutParticipant.updatedAt) : null,
      metadata: {
        hutParticipantId: hutParticipant.id,
        origin: hutParticipant.origin,
        protocolVersion: hutParticipant.protocolVersion,
        currentBlockNumber: hutParticipant.currentBlockNumber,
        currentVideoSequence: hutParticipant.currentVideoSequence,
        testMode: hutParticipant.testMode
      }
    });
    for (const phaseCode of hutParticipant.phaseCodes) {
      activities.push({
        type: "HUT_PHASE_CODE",
        code: phaseCode.phase,
        status: phaseCode.status,
        completedAt: iso(phaseCode.usedAt ?? phaseCode.validatedAt),
        metadata: {
          hutParticipantPhaseCodeId: phaseCode.id,
          slot: phaseCode.slot,
          sentAt: iso(phaseCode.sentAt),
          validatedAt: iso(phaseCode.validatedAt),
          usedAt: iso(phaseCode.usedAt)
        }
      });
    }
    const attempt = hutParticipant.questionnaireAttempt;
    if (attempt) {
      activities.push({
        type: "HUT_QUESTIONNAIRE_ATTEMPT",
        code: "HUT_QUESTIONNAIRE",
        status: attempt.status,
        startedAt: iso(attempt.startedAt),
        completedAt: iso(attempt.completedAt),
        metadata: {
          hutQuestionnaireAttemptId: attempt.id,
          terminatedAt: iso(attempt.terminatedAt),
          terminationReason: attempt.terminationReason
        }
      });
      for (const visit of attempt.visits) {
        activities.push({
          type: "HUT_VISIT_PROGRESS",
          code: visit.section,
          status: visit.status,
          startedAt: iso(visit.startedAt),
          completedAt: iso(visit.completedAt),
          metadata: { hutVisitProgressId: visit.id }
        });
      }
    }
  }

  for (const event of auditLogs) {
    activities.push({
      type: "AUDIT_EVENT",
      code: event.action,
      status: "RECORDED",
      completedAt: iso(event.createdAt),
      metadata: {
        auditLogId: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        reason: event.reason,
        beforeJson: event.beforeJson,
        afterJson: event.afterJson
      }
    });
  }

  return activities;
}

function buildAnswers(participant, hutParticipant) {
  const answers = [];

  if (participant.screeningAttempts) {
    for (const attempt of participant.screeningAttempts) {
      for (const answer of attempt.answers ?? []) {
        answers.push({
          activity: "SCREENING",
          questionKey: answer.questionId,
          answerValue: answer.answerJson,
          answeredAt: iso(answer.createdAt),
          metadata: { screeningAttemptId: attempt.id, screeningAnswerId: answer.id }
        });
      }
    }
  }

  for (const session of participant.ctlSessions) {
    for (const answer of session.answers) {
      answers.push({
        activity: "CLT",
        questionKey: answer.questionCode,
        answerValue: answer.answerValue,
        answeredAt: iso(answer.updatedAt ?? answer.createdAt),
        metadata: { ctlSessionId: session.id, ctlAnswerId: answer.id }
      });
    }
  }

  for (const activity of participant.activities) {
    const activityCode = activity.activitySchedule?.code ?? activity.occurrenceKey;
    for (const response of activity.responses) {
      answers.push({
        activity: `NAVIGO:${activityCode}`,
        questionKey: response.responseKey,
        answerValue: response.answerJson,
        answeredAt: iso(response.updatedAt ?? response.createdAt),
        metadata: {
          participantActivityId: activity.id,
          researchResponseId: response.id,
          questionId: response.questionId,
          questionnaireVersionId: response.questionnaireVersionId,
          blockInstanceKey: response.blockInstanceKey
        }
      });
    }
  }

  const attempt = hutParticipant?.questionnaireAttempt;
  if (attempt) {
    const visitsById = new Map(attempt.visits.map((visit) => [visit.id, visit.section]));
    for (const answer of attempt.answers) {
      answers.push({
        activity: `HUT:${visitsById.get(answer.visitProgressId) ?? "QUESTIONNAIRE"}`,
        questionKey: answer.questionCode,
        answerValue: answer.answerJson,
        answeredAt: iso(answer.answeredAt),
        metadata: {
          hutQuestionnaireAttemptId: attempt.id,
          hutAnswerId: answer.id,
          hutVisitProgressId: answer.visitProgressId
        }
      });
    }
  }

  return answers;
}

function buildEvidence(participant, hutParticipant) {
  const evidence = [];

  for (const item of participant.participantEvidence) {
    evidence.push({
      type: `SCREENING:${item.type}`,
      url: screeningEvidenceUrl(item),
      fecha: iso(item.uploadedAt),
      fechaMexicoCity: formatDateTimeMexicoCity(item.uploadedAt),
      storage: storage(item),
      metadata: {
        participantEvidenceId: item.id,
        screeningAttemptId: item.screeningAttemptId,
        relatedQuestionId: item.relatedQuestionId,
        reviewStatus: item.reviewStatus,
        reviewedAt: iso(item.reviewedAt)
      }
    });
  }

  for (const activity of participant.activities) {
    const activityCode = activity.activitySchedule?.code ?? activity.occurrenceKey;
    for (const item of activity.participantActivityEvidence) {
      evidence.push({
        type: `NAVIGO:${activityCode}:${item.type}`,
        url: null,
        fecha: iso(item.uploadedAt),
        fechaMexicoCity: formatDateTimeMexicoCity(item.uploadedAt),
        storage: storage(item),
        metadata: {
          participantActivityEvidenceId: item.id,
          participantActivityId: activity.id,
          reviewStatus: item.reviewStatus,
          reviewedAt: iso(item.reviewedAt)
        }
      });
    }
    if (activity.mediaEvidence) {
      evidence.push({
        type: `NAVIGO:${activityCode}:MEDIA_PLACEHOLDER`,
        url: null,
        fecha: iso(activity.mediaEvidence.createdAt),
        fechaMexicoCity: formatDateTimeMexicoCity(activity.mediaEvidence.createdAt),
        storage: null,
        metadata: activity.mediaEvidence
      });
    }
  }

  if (hutParticipant) {
    for (const item of hutParticipant.applicationEvidence) {
      evidence.push({
        type: `HUT_APPLICATION_EVIDENCE:${item.phase}`,
        url: null,
        fecha: iso(item.capturedAt),
        fechaMexicoCity: formatDateTimeMexicoCity(item.capturedAt),
        storage: storage(item),
        metadata: {
          hutApplicationEvidenceId: item.id,
          productCode: item.productCode,
          notes: item.notes
        }
      });
    }
    for (const item of hutParticipant.applicationPhotoEntries) {
      evidence.push({
        type: `HUT_APPLICATION_PHOTO_ENTRY:DAY_${item.useDayNumber}`,
        url: null,
        fecha: iso(item.capturedAt),
        fechaMexicoCity: formatDateTimeMexicoCity(item.capturedAt),
        storage: storage(item),
        metadata: {
          hutApplicationPhotoEntryId: item.id,
          productCode: item.productCode,
          useDayNumber: item.useDayNumber,
          capturedLocalDate: item.capturedLocalDate,
          capturedLocalTimezone: item.capturedLocalTimezone,
          notes: item.notes
        }
      });
    }
    if (hutParticipant.referenceSelfie) {
      evidence.push({
        type: "HUT_REFERENCE_SELFIE",
        url: null,
        fecha: iso(hutParticipant.referenceSelfie.capturedAt),
        fechaMexicoCity: formatDateTimeMexicoCity(hutParticipant.referenceSelfie.capturedAt),
        storage: storage(hutParticipant.referenceSelfie),
        metadata: { hutReferenceSelfieId: hutParticipant.referenceSelfie.id }
      });
    }
    for (const item of hutParticipant.videoSubmissions) {
      evidence.push({
        type: `HUT_VIDEO:${item.blockNumber}:${item.sequenceNumber}`,
        url: null,
        fecha: iso(item.submittedAt),
        fechaMexicoCity: formatDateTimeMexicoCity(item.submittedAt),
        storage: storage(item),
        metadata: item
      });
    }
  }

  return evidence;
}

function buildWarnings(confirmation, participant, hutParticipant, rotations, evidence) {
  const warnings = [];
  if (!hutParticipant) {
    warnings.push("HUT_PARTICIPANT_NOT_FOUND");
  }
  if (confirmation.referenceCodes.length !== 3) {
    warnings.push("REFERENCE_CODES_NOT_EXACTLY_THREE");
  }
  if (!rotations.clt.eva1?.code || !rotations.clt.eva2?.code) {
    warnings.push("CLT_EVA_ROTATION_INCOMPLETE");
  }
  if (!rotations.clt.pr1 || !rotations.clt.veri1 || !rotations.clt.pr4 || !rotations.clt.veri2) {
    warnings.push("CLT_TRIANGULAR_ROTATION_INCOMPLETE");
  }
  if (evidence.some((item) => item.url === null && item.storage?.privateStorageKey)) {
    warnings.push("PRIVATE_EVIDENCE_EXPORTED_WITH_STORAGE_KEY_ONLY");
  }
  return warnings;
}

function inferProtocol(participant, hutParticipant) {
  if (hutParticipant?.origin === "HUT_DIRECTO") {
    return "HUT_DIRECTO";
  }
  return "CLT_NAVIGO_HUT";
}

function getArms(participant) {
  if (participant.rotationAssignment?.arms?.length) {
    return participant.rotationAssignment.arms;
  }
  return participant.armAssignments ?? [];
}

function productSummary(armAssignment) {
  return {
    code: armAssignment.studyProduct?.internalCode ?? null,
    label: armAssignment.studyProduct?.displayLabel ?? null,
    arm: armAssignment.studyArm?.code ?? armAssignment.studyArm?.label ?? null,
    armLabel: armAssignment.studyArm?.label ?? null,
    applicationOrder: armAssignment.applicationOrder,
    participantVisibleLabel: armAssignment.participantVisibleLabel ?? null
  };
}

function fallbackProduct(code, label) {
  if (!code) {
    return null;
  }
  return {
    code,
    label,
    arm: null,
    armLabel: null,
    applicationOrder: null,
    participantVisibleLabel: label
  };
}

function storage(item) {
  if (!item?.privateStorageKey) {
    return null;
  }
  return {
    storageBucket: item.storageBucket ?? null,
    privateStorageKey: item.privateStorageKey,
    originalFilename: item.originalFilename ?? null,
    mimeType: item.mimeType ?? null,
    extension: item.extension ?? null,
    sizeBytes: item.sizeBytes ?? null
  };
}

function screeningEvidenceUrl(item) {
  if (item.type !== "PERFUME_PHOTO") {
    return null;
  }
  const secret = process.env.PARTICIPANT_PORTAL_HASH_SECRET;
  if (!secret) {
    return null;
  }
  const exp = Math.floor(Date.now() / 1000) + SCREENING_EVIDENCE_SIGNED_LINK_TTL_SECONDS;
  const payload = base64UrlEncode(JSON.stringify({ evidenceId: item.id, exp, v: 1 }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${PUBLIC_ORIGIN}/evidence/signed/${payload}.${signature}`;
}

function normalizeFolio(value) {
  const trimmed = String(value ?? "").trim().toUpperCase();
  if (!trimmed) {
    throw new Error("Folio requerido.");
  }
  if (/^\d+$/.test(trimmed)) {
    return `NAV-${trimmed.padStart(3, "0")}`;
  }
  return trimmed;
}

function normalizeOrigin(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(String(value).trim());
    return url.origin;
  } catch {
    return null;
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function iso(value) {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function formatDateTimeMexicoCity(value) {
  if (!value) {
    return null;
  }
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
