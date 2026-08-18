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

loadDotenv({ path: path.join(repoRoot, ".env") });

const participantIds = process.argv.slice(2);
const OUTPUT_DIR = path.join(repoRoot, "outputs", "v1_to_v2_no_folio_assignment_export");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "V1_TO_V2_NO_FOLIO_BRANDON_MIGUEL_ASSIGN_FOLIO.json");

function createPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: false })
    })
  };
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDateTimeMexicoCity(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    hour12: false,
    timeStyle: "medium",
    timeZone: "America/Mexico_City"
  }).format(new Date(value));
}

const { prisma, pool } = createPrisma();

try {
  if (participantIds.length === 0) {
    throw new Error("Debes proporcionar al menos un StudyParticipant ID.");
  }

  const participants = await prisma.studyParticipant.findMany({
    include: {
      accessTokens: true,
      activities: {
        include: {
          activitySchedule: true,
          participantActivityEvidence: true,
          responses: { orderBy: { createdAt: "asc" } }
        },
        orderBy: { scheduledAt: "asc" }
      },
      ctlSessions: {
        include: {
          answers: { orderBy: { createdAt: "asc" } },
          phaseProgress: { orderBy: { createdAt: "asc" } }
        },
        orderBy: { createdAt: "asc" }
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
          }
        }
      },
      participantConfirmation: {
        include: { referenceCodes: { orderBy: { slot: "asc" } } }
      },
      participantEvidence: { orderBy: { uploadedAt: "asc" } },
      participantProfile: true,
      participantScreeningReviews: { orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }] },
      screeningAttempts: {
        include: {
          answers: { orderBy: { createdAt: "asc" } },
          participantEvidence: { orderBy: { uploadedAt: "asc" } },
          participantScreeningReview: true,
          questionnaireVersion: {
            include: {
              study: { select: { code: true, id: true, name: true } }
            }
          }
        },
        orderBy: { startedAt: "asc" }
      }
    },
    where: { id: { in: participantIds } }
  });

  const rows = participants.map((participant) => {
    const profile = participant.participantProfile;
    const latestAttempt = [...participant.screeningAttempts].sort((left, right) => {
      const leftTime = new Date(left.completedAt ?? left.startedAt).getTime();
      const rightTime = new Date(right.completedAt ?? right.startedAt).getTime();
      return rightTime - leftTime;
    })[0] ?? null;
    const cltAnswers = participant.ctlSessions.reduce((sum, session) => sum + session.answers.length, 0);
    const navigoResponses = participant.activities.reduce((sum, activity) => sum + activity.responses.length, 0);
    const hutAnswers = participant.hutParticipant?.questionnaireAttempt?.answers.length ?? 0;

    return {
      migrationCategory: "ASSIGN_NEW_FOLIO_IN_V2",
      migrationReady: false,
      reason: "V1 participant exists without ParticipantConfirmation/NAV/HUT master codes. V2 must assign folio and create master codes.",
      participant: {
        ids: {
          participantProfileId: profile.id,
          studyParticipantId: participant.id,
          participantConfirmationId: participant.participantConfirmation?.id ?? null
        },
        navFolio: participant.participantConfirmation?.folio ?? null,
        hutFolio: participant.hutParticipant?.folio ?? null,
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
        profileStatus: profile.status,
        screeningStatus: participant.screeningStatus,
        operationalStatus: participant.operationalStatus,
        createdAt: iso(participant.createdAt),
        createdAtMexicoCity: formatDateTimeMexicoCity(participant.createdAt),
        updatedAt: iso(participant.updatedAt),
        updatedAtMexicoCity: formatDateTimeMexicoCity(participant.updatedAt)
      },
      codes: [],
      screening: {
        attempts: participant.screeningAttempts.map((attempt) => ({
          id: attempt.id,
          source: attempt.source,
          status: attempt.status,
          terminationCode: attempt.terminationCode,
          terminationReason: attempt.terminationReason,
          nseScore: attempt.nseScore,
          nseClass: attempt.nseClass,
          evaluationJson: attempt.evaluationJson,
          startedAt: iso(attempt.startedAt),
          startedAtMexicoCity: formatDateTimeMexicoCity(attempt.startedAt),
          completedAt: iso(attempt.completedAt),
          completedAtMexicoCity: formatDateTimeMexicoCity(attempt.completedAt),
          study: {
            code: attempt.questionnaireVersion.study.code,
            id: attempt.questionnaireVersion.study.id,
            name: attempt.questionnaireVersion.study.name
          },
          questionnaireVersionId: attempt.questionnaireVersionId,
          answers: attempt.answers.map((answer) => ({
            questionId: answer.questionId,
            answerJson: answer.answerJson,
            createdAt: iso(answer.createdAt),
            createdAtMexicoCity: formatDateTimeMexicoCity(answer.createdAt),
            updatedAt: iso(answer.updatedAt)
          })),
          evidence: attempt.participantEvidence.map((item) => ({
            id: item.id,
            type: item.type,
            relatedQuestionId: item.relatedQuestionId,
            storageBucket: item.storageBucket,
            privateStorageKey: item.privateStorageKey,
            originalFilename: item.originalFilename,
            mimeType: item.mimeType,
            uploadedAt: iso(item.uploadedAt),
            uploadedAtMexicoCity: formatDateTimeMexicoCity(item.uploadedAt),
            reviewStatus: item.reviewStatus
          })),
          review: attempt.participantScreeningReview ? {
            id: attempt.participantScreeningReview.id,
            status: attempt.participantScreeningReview.status,
            reviewedAt: iso(attempt.participantScreeningReview.reviewedAt),
            rejectionReason: attempt.participantScreeningReview.rejectionReason
          } : null
        })),
        latestAttemptId: latestAttempt?.id ?? null,
        latestStatus: latestAttempt?.status ?? null
      },
      operationalProgress: {
        cltSessions: participant.ctlSessions.map((session) => ({
          id: session.id,
          status: session.status,
          startedAt: iso(session.startedAt),
          completedAt: iso(session.completedAt),
          answers: session.answers.length,
          phaseProgress: session.phaseProgress.length
        })),
        navigoActivities: participant.activities.map((activity) => ({
          id: activity.id,
          code: activity.activitySchedule.code,
          name: activity.activitySchedule.name,
          status: activity.status,
          scheduledAt: iso(activity.scheduledAt),
          availableFrom: iso(activity.availableFrom),
          completedAt: iso(activity.actualCompletedAt),
          responses: activity.responses.length,
          evidence: activity.participantActivityEvidence.length
        })),
        hut: participant.hutParticipant ? {
          id: participant.hutParticipant.id,
          folio: participant.hutParticipant.folio,
          origin: participant.hutParticipant.origin,
          status: participant.hutParticipant.status,
          applicationEvidence: participant.hutParticipant.applicationEvidence.length,
          applicationPhotoEntries: participant.hutParticipant.applicationPhotoEntries.length,
          questionnaireStatus: participant.hutParticipant.questionnaireAttempt?.status ?? null,
          questionnaireAnswers: participant.hutParticipant.questionnaireAttempt?.answers.length ?? 0
        } : null,
        totals: {
          cltAnswers,
          navigoResponses,
          hutAnswers,
          participantEvidence: participant.participantEvidence.length
        }
      },
      warnings: [
        "NO_NAV_FOLIO_IN_V1",
        "NO_REFERENCE_CODES_IN_V1",
        "V2_MUST_ASSIGN_FOLIO_AND_CODES",
        "PRIVATE_EVIDENCE_EXPORTED_WITH_STORAGE_KEY_ONLY"
      ]
    };
  });

  const payload = {
    schemaVersion: "v1-to-v2.no-folio-assignment-export.1",
    source: {
      project: "mrblackbox-research-platform",
      exportedAt: new Date().toISOString(),
      exportedAtMexicoCity: formatDateTimeMexicoCity(new Date()),
      readOnly: true,
      requestedNames: [
        "BRANDON SANTIAGO SORIA",
        "MIGUEL ANGEL CASTAÑEDA"
      ]
    },
    summary: {
      requested: participantIds.length,
      exported: rows.length,
      participants: rows.map((row) => ({
        name: row.participant.name,
        status: row.participant.screeningStatus,
        attempts: row.screening.attempts.length,
        answers: row.screening.attempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)
      }))
    },
    participants: rows
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: OUTPUT_FILE, summary: payload.summary }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
