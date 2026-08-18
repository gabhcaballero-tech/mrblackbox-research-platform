import { createRequire } from "node:module";
import path from "node:path";
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

const navFolio = String(process.argv[2] ?? "NAV-156").toUpperCase();
const hutFolio = navFolio.replace(/^NAV-/, "HUT-");

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

function fmt(value) {
  return value ? new Date(value).toISOString() : null;
}

const { prisma, pool } = createPrisma();

try {
  const confirmation = await prisma.participantConfirmation.findFirst({
    include: {
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          answers: true,
          participantScreeningReview: true
        }
      },
      study: { select: { code: true, id: true, name: true } },
      studyParticipant: {
        include: {
          accessTokens: true,
          activities: { include: { responses: true, participantActivityEvidence: true } },
          armAssignments: { include: { studyArm: true, studyProduct: true }, orderBy: { applicationOrder: "asc" } },
          ctlSessions: { include: { answers: true, phaseProgress: true } },
          hutParticipant: {
            include: {
              applicationEvidence: true,
              applicationPhotoEntries: true,
              phaseCodes: { orderBy: { slot: "asc" } },
              questionnaireAttempt: { include: { answers: true, visits: true } },
              registrationSlot: true
            }
          },
          participantEvidence: true,
          participantProfile: true,
          participantScreeningReviews: true,
          qaParticipantRun: true,
          rotationAssignment: { include: { rotationPlan: true } },
          screeningAttempts: { include: { answers: true }, orderBy: { startedAt: "asc" } }
        }
      }
    },
    where: { folio: navFolio }
  });

  const hut = await prisma.hutParticipant.findFirst({
    include: {
      applicationEvidence: true,
      applicationPhotoEntries: true,
      phaseCodes: { orderBy: { slot: "asc" } },
      questionnaireAttempt: { include: { answers: true, visits: true } },
      registrationSlot: true,
      studyParticipant: {
        include: {
          participantConfirmation: { include: { referenceCodes: { orderBy: { slot: "asc" } } } },
          participantProfile: true
        }
      }
    },
    where: { folio: hutFolio }
  });

  const rotationConfig = await prisma.navigoRotationFolioConfiguration.findFirst({
    where: { folio: navFolio }
  });

  const participant = confirmation?.studyParticipant ?? hut?.studyParticipant ?? null;
  const profile = participant?.participantProfile ?? null;
  const result = {
    navFolio,
    hutFolio,
    exists: {
      participantConfirmation: Boolean(confirmation),
      studyParticipant: Boolean(participant),
      participantProfile: Boolean(profile),
      hutParticipant: Boolean(hut),
      navigoRotationFolioConfiguration: Boolean(rotationConfig)
    },
    study: confirmation?.study ?? null,
    participant: profile ? {
      participantProfileId: profile.id,
      studyParticipantId: participant.id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      profileStatus: profile.status,
      screeningStatus: participant.screeningStatus,
      operationalStatus: participant.operationalStatus,
      createdAt: fmt(participant.createdAt),
      updatedAt: fmt(participant.updatedAt),
      qa: Boolean(participant.qaParticipantRun)
    } : null,
    confirmation: confirmation ? {
      id: confirmation.id,
      folio: confirmation.folio,
      folioSequence: confirmation.folioSequence,
      approvedAt: fmt(confirmation.approvedAt),
      manualMessageStatus: confirmation.manualMessageStatus,
      referenceCodes: confirmation.referenceCodes.map((code) => ({
        slot: code.slot,
        code: code.code,
        createdAt: fmt(code.createdAt)
      }))
    } : null,
    screening: participant ? {
      attempts: participant.screeningAttempts.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        source: attempt.source,
        startedAt: fmt(attempt.startedAt),
        completedAt: fmt(attempt.completedAt),
        answers: attempt.answers.length
      })),
      reviews: participant.participantScreeningReviews.map((review) => ({
        id: review.id,
        status: review.status,
        reviewedAt: fmt(review.reviewedAt)
      }))
    } : null,
    clt: participant ? {
      sessions: participant.ctlSessions.map((session) => ({
        id: session.id,
        status: session.status,
        startedAt: fmt(session.startedAt),
        completedAt: fmt(session.completedAt),
        answers: session.answers.length,
        phaseProgress: session.phaseProgress.length
      }))
    } : null,
    navigo: participant ? {
      accessTokens: participant.accessTokens.map((token) => ({ id: token.id, status: token.status, createdAt: fmt(token.createdAt) })),
      activities: participant.activities.map((activity) => ({
        id: activity.id,
        scheduleId: activity.activityScheduleId,
        status: activity.status,
        scheduledAt: fmt(activity.scheduledAt),
        availableFrom: fmt(activity.availableFrom),
        completedAt: fmt(activity.actualCompletedAt),
        responses: activity.responses.length,
        evidence: activity.participantActivityEvidence.length
      })),
      rotationAssignment: participant.rotationAssignment ? {
        rotationCode: participant.rotationAssignment.rotationCode,
        rotationPlan: participant.rotationAssignment.rotationPlan?.name ?? null
      } : null,
      armAssignments: participant.armAssignments.map((assignment) => ({
        order: assignment.applicationOrder,
        arm: assignment.studyArm.code,
        product: assignment.studyProduct.internalCode
      })),
      storedRotationConfig: rotationConfig
    } : { storedRotationConfig: rotationConfig },
    hut: hut ? {
      id: hut.id,
      folio: hut.folio,
      origin: hut.origin,
      status: hut.status,
      name: hut.name,
      phone: hut.phone,
      email: hut.email,
      startDate: fmt(hut.startDate),
      studyParticipantId: hut.studyParticipantId,
      registrationSlot: hut.registrationSlot ? {
        id: hut.registrationSlot.id,
        status: hut.registrationSlot.status,
        eva1: hut.registrationSlot.eva1,
        eva2: hut.registrationSlot.eva2
      } : null,
      phaseCodes: hut.phaseCodes.map((code) => ({ phase: code.phase, slot: code.slot, status: code.status, code: code.code })),
      applicationEvidence: hut.applicationEvidence.length,
      applicationPhotoEntries: hut.applicationPhotoEntries.length,
      questionnaire: hut.questionnaireAttempt ? {
        status: hut.questionnaireAttempt.status,
        answers: hut.questionnaireAttempt.answers.length,
        visits: hut.questionnaireAttempt.visits.length
      } : null
    } : null
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
