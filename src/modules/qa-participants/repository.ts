import { createPrismaClient } from "@/shared/db/client";
import { randomUUID, createHash } from "node:crypto";
import { generateParticipantReferenceCode, generateReferenceCodes } from "@/modules/participant-portal/review";
import { createHutParticipantToken, createHutRegistrationToken } from "@/modules/hut/service";
import {
  encryptHutPhaseCode,
  generateHutPhaseCode,
  hashHutPhaseCode,
  hutPhaseForSlot,
  resolveHutPhaseCodeSecret
} from "@/modules/hut/phase-codes";
import { hashToken } from "@/modules/navigo-app";
import {
  createEmptyQaCleanupReport,
  normalizeQaParticipantFolio,
  recordQaCleanupCount
} from "./service";
import type {
  QaParticipantActionResult,
  QaParticipantCleanupReport,
  QaParticipantExecutionMode,
  LegacyQaCleanupPreview,
  LegacyQaCleanupReport,
  QaParticipantScenarioReport,
  QaParticipantRunStatus,
  QaParticipantRunSummary,
  QaParticipantScenario
} from "./types";

type Delegate = {
  count?: (args: unknown) => Promise<number>;
  create?: (args: unknown) => Promise<unknown>;
  createMany?: (args: unknown) => Promise<{ count: number }>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<{ count: number }>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findFirst?: (args: unknown) => Promise<unknown | null>;
  findUnique?: (args: unknown) => Promise<unknown | null>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<{ count: number }>;
  upsert?: (args: unknown) => Promise<unknown>;
};

const LEGACY_QA_CLEANUP_AUTHORIZED_FOLIOS = ["NAV-106", "NAV-110", "NAV-115", "NAV-117", "PRUEBA"] as const;

type QaPrismaClient = {
  $transaction: <T>(callback: (tx: QaPrismaClient) => Promise<T>) => Promise<T>;
  applicationTimeEvent: Delegate;
  ctlAnswer: Delegate;
  ctlPhaseProgress: Delegate;
  ctlSession: Delegate;
  ctlTriangularRotationAssignment: Delegate;
  hutAnswer: Delegate;
  hutApplicationEvidence: Delegate;
  hutApplicationPhotoEntry: Delegate;
  hutBlock: Delegate;
  hutCallEvaluation: Delegate;
  hutDailyCheck: Delegate;
  hutParticipant: Delegate;
  hutParticipantPhaseCode: Delegate;
  hutQuestionnaireAttempt: Delegate;
  hutReferenceSelfie: Delegate;
  hutRegistrationSlot: Delegate;
  hutVideoSubmission: Delegate;
  hutVisitProgress: Delegate;
  hutVisualVerification: Delegate;
  mediaEvidencePlaceholder: Delegate;
  oneuiWhatsAppMessage: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  participantArmAssignment: Delegate;
  participantAttributeOrder: Delegate;
  participantConfirmation: Delegate;
  participantConsent: Delegate;
  participantEvidence: Delegate;
  participantProfile: Delegate;
  participantReferenceCode: Delegate;
  participantRotationAssignment: Delegate;
  participantScreeningReview: Delegate;
  qaParticipantRun: Delegate;
  quotaEvaluation: Delegate;
  reminderLog: Delegate;
  researchResponse: Delegate;
  rotationPlan: Delegate;
  screeningAnswer: Delegate;
  screeningAttempt: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
  questionnaireVersion: Delegate;
};

type QaParticipantRunRecord = {
  cleanupReportJson: unknown | null;
  cleanedAt: Date | null;
  cleanedByUserId: string | null;
  createdAt: Date;
  createdBy?: { email: string; name: string } | null;
  createdByUserId: string;
  executionMode: QaParticipantExecutionMode;
  folio: string | null;
  hutParticipantId: string | null;
  id: string;
  reportJson: unknown | null;
  scenario: QaParticipantScenario;
  status: QaParticipantRunStatus;
  studyId: string;
  studyParticipantId: string | null;
  updatedAt: Date;
};

export type CreateEmptyQaParticipantRunInput = {
  createdByUserId: string;
  executionMode: QaParticipantExecutionMode;
  folio?: string | null;
  reportJson?: unknown;
  scenario: QaParticipantScenario;
  studyId: string;
};

export type ListQaParticipantRunsInput = {
  includeCleaned?: boolean;
  studyId: string;
};

export type CleanupQaParticipantRunInput = {
  cleanedByUserId: string;
  runId: string;
};

export type PreviewLegacyQaCleanupInput = {
  folios: string[];
  studyId: string;
};

export type CleanupLegacyQaParticipantsInput = PreviewLegacyQaCleanupInput & {
  cleanedByUserId: string;
};

export type CreateQaParticipantScenarioInput = {
  baseUrl?: string;
  createdByUserId: string;
  executionMode: QaParticipantExecutionMode;
  hutPhaseCodeSecret?: string;
  now?: Date;
  scenario: QaParticipantScenario;
  studyId: string;
};

export type QaParticipantsRepository = {
  cleanupLegacyAuthorizedFolios: (input: CleanupLegacyQaParticipantsInput) => Promise<QaParticipantActionResult<LegacyQaCleanupReport>>;
  cleanupRun: (input: CleanupQaParticipantRunInput) => Promise<QaParticipantActionResult<QaParticipantRunSummary>>;
  createEmptyRun: (input: CreateEmptyQaParticipantRunInput) => Promise<QaParticipantActionResult<QaParticipantRunSummary>>;
  createScenario: (input: CreateQaParticipantScenarioInput) => Promise<QaParticipantActionResult<QaParticipantRunSummary>>;
  getRun: (runId: string) => Promise<QaParticipantRunSummary | null>;
  listRuns: (input: ListQaParticipantRunsInput) => Promise<QaParticipantRunSummary[]>;
  previewLegacyCleanup: (input: PreviewLegacyQaCleanupInput) => Promise<LegacyQaCleanupPreview>;
};

const qaRunSelect = {
  cleanupReportJson: true,
  cleanedAt: true,
  cleanedByUserId: true,
  createdAt: true,
  createdBy: {
    select: {
      email: true,
      name: true
    }
  },
  createdByUserId: true,
  executionMode: true,
  folio: true,
  hutParticipantId: true,
  id: true,
  reportJson: true,
  scenario: true,
  status: true,
  studyId: true,
  studyParticipantId: true,
  updatedAt: true
} as const;

export function createQaParticipantsRepository(prismaClient?: QaPrismaClient): QaParticipantsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as unknown as QaPrismaClient);
  }

  return {
    async previewLegacyCleanup(input) {
      const prisma = await getPrisma();
      return buildLegacyQaCleanupPreview(prisma, input);
    },

    async cleanupLegacyAuthorizedFolios(input) {
      const normalized = normalizeLegacyQaCleanupFolios(input.folios);
      if (normalized.blockedFolios.length > 0) {
        return {
          message: `Hay folios no autorizados para limpieza: ${normalized.blockedFolios.join(", ")}.`,
          ok: false
        };
      }
      if (normalized.authorizedFolios.length === 0) {
        return {
          message: "Selecciona al menos un folio autorizado.",
          ok: false
        };
      }

      const prisma = await getPrisma();
      return prisma.$transaction(async (tx) => {
        const preview = await buildLegacyQaCleanupPreview(tx, {
          folios: normalized.authorizedFolios,
          studyId: input.studyId
        });
        const report: LegacyQaCleanupReport = {
          authorizedFolios: preview.authorizedFolios,
          blockedFolios: preview.blockedFolios,
          cleanedAt: new Date().toISOString(),
          cleanedByUserId: input.cleanedByUserId,
          folios: [],
          studyId: input.studyId
        };

        for (const item of preview.folios) {
          if (!item.found) {
            report.folios.push({ ...item, cleanupReport: null });
            continue;
          }

          const cleanupReport = createEmptyQaCleanupReport({
            hutParticipantId: item.hutParticipantId,
            studyParticipantId: item.studyParticipantId
          });
          if (item.hutParticipantId) {
            await cleanupHutParticipant(tx, cleanupReport, item.hutParticipantId);
          }
          if (item.studyParticipantId) {
            await cleanupStudyParticipant(tx, cleanupReport, item.studyParticipantId);
          }
          report.folios.push({ ...item, cleanupReport });
        }

        await tx.qaParticipantRun.create?.({
          data: {
            cleanedAt: new Date(report.cleanedAt),
            cleanedByUserId: input.cleanedByUserId,
            cleanupReportJson: report,
            createdByUserId: input.cleanedByUserId,
            executionMode: "FAST_FORWARD",
            folio: preview.authorizedFolios.join(", "),
            reportJson: {
              authorizedFolios: preview.authorizedFolios,
              preview,
              qa: true,
              source: "LEGACY_AUTHORIZED_FOLIO_CLEANUP"
            },
            scenario: "CLT_NAVIGO_HUT",
            status: "CLEANED",
            studyId: input.studyId
          },
          select: qaRunSelect
        });

        return { data: report, ok: true };
      });
    },

    async cleanupRun(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const run = (await tx.qaParticipantRun.findUnique?.({
          select: qaRunSelect,
          where: { id: input.runId }
        })) as QaParticipantRunRecord | null;

        if (!run) {
          return { message: "No encontramos el run QA.", ok: false };
        }
        if (run.status === "CLEANED") {
          return { data: toQaParticipantRunSummary(run), ok: true };
        }
        if (!run.studyParticipantId && !run.hutParticipantId) {
          const report = createEmptyQaCleanupReport({
            hutParticipantId: null,
            studyParticipantId: null
          });
          report.notes.push("Run QA sin participantes asociados; solo se marco como limpio.");
          const updated = await markRunCleaned(tx, {
            cleanedByUserId: input.cleanedByUserId,
            report,
            runId: run.id
          });
          return { data: updated, ok: true };
        }

        const report = await cleanupQaRunData(tx, run);
        const updated = await markRunCleaned(tx, {
          cleanedByUserId: input.cleanedByUserId,
          report,
          runId: run.id
        });

        return { data: updated, ok: true };
      });
    },

    async createEmptyRun(input) {
      const prisma = await getPrisma();
      const created = (await prisma.qaParticipantRun.create?.({
        data: {
          createdByUserId: input.createdByUserId,
          executionMode: input.executionMode,
          folio: normalizeQaParticipantFolio(input.folio),
          reportJson: input.reportJson ?? null,
          scenario: input.scenario,
          status: "CREATED",
          studyId: input.studyId
        },
        select: qaRunSelect
      })) as QaParticipantRunRecord;

      return { data: toQaParticipantRunSummary(created), ok: true };
    },

    async createScenario(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const initialRun = (await prisma.qaParticipantRun.create?.({
        data: {
          createdByUserId: input.createdByUserId,
          executionMode: input.executionMode,
          reportJson: {
            createdAt: now.toISOString(),
            qa: true,
            scenario: input.scenario,
            status: "CREATING"
          },
          scenario: input.scenario,
          status: "CREATED",
          studyId: input.studyId
        },
        select: qaRunSelect
      })) as QaParticipantRunRecord;

      try {
        const created = await prisma.$transaction((tx) =>
          createQaScenarioData(tx, {
            ...input,
            now,
            run: initialRun
          })
        );
        return { data: created, ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "No fue posible crear el escenario QA.";
        await prisma.qaParticipantRun.update?.({
          data: {
            reportJson: {
              createdAt: now.toISOString(),
              error: message,
              qa: true,
              scenario: input.scenario,
              status: "FAILED"
            },
            status: "FAILED"
          },
          select: qaRunSelect,
          where: { id: initialRun.id }
        });

        return {
          message: `No fue posible crear el escenario QA: ${message}`,
          ok: false
        };
      }
    },

    async getRun(runId) {
      const prisma = await getPrisma();
      const run = (await prisma.qaParticipantRun.findUnique?.({
        select: qaRunSelect,
        where: { id: runId }
      })) as QaParticipantRunRecord | null;

      return run ? toQaParticipantRunSummary(run) : null;
    },

    async listRuns(input) {
      const prisma = await getPrisma();
      const runs = (await prisma.qaParticipantRun.findMany?.({
        orderBy: { createdAt: "desc" },
        select: qaRunSelect,
        where: {
          studyId: input.studyId,
          ...(input.includeCleaned ? {} : { status: { not: "CLEANED" } })
        }
      })) as QaParticipantRunRecord[];

      return runs.map(toQaParticipantRunSummary);
    }
  };
}

function toQaParticipantRunSummary(run: QaParticipantRunRecord): QaParticipantRunSummary {
  return {
    cleanupReportJson: run.cleanupReportJson,
    cleanedAt: run.cleanedAt,
    cleanedByUserId: run.cleanedByUserId,
    createdAt: run.createdAt,
    createdByEmail: run.createdBy?.email ?? null,
    createdByUserId: run.createdByUserId,
    createdByUserName: run.createdBy?.name ?? null,
    executionMode: run.executionMode,
    folio: run.folio,
    hutParticipantId: run.hutParticipantId,
    id: run.id,
    reportJson: run.reportJson,
    scenario: run.scenario,
    status: run.status,
    studyId: run.studyId,
    studyParticipantId: run.studyParticipantId,
    updatedAt: run.updatedAt
  };
}

type LegacyQaConfirmationRecord = {
  folio: string;
  studyParticipant?: {
    hutParticipant?: { id: string } | null;
    participantProfile?: { name: string | null } | null;
  } | null;
  studyParticipantId: string;
};

type LegacyQaHutParticipantRecord = {
  folio: string | null;
  id: string;
  name: string | null;
  studyParticipantId: string | null;
};

function normalizeLegacyQaCleanupFolios(folios: string[]): {
  authorizedFolios: string[];
  blockedFolios: string[];
} {
  const requested = [...new Set(folios.map((folio) => normalizeQaParticipantFolio(folio)).filter(Boolean) as string[])];
  const authorized = new Set<string>(LEGACY_QA_CLEANUP_AUTHORIZED_FOLIOS);
  return {
    authorizedFolios: requested.filter((folio) => authorized.has(folio)),
    blockedFolios: requested.filter((folio) => !authorized.has(folio))
  };
}

async function buildLegacyQaCleanupPreview(
  prisma: QaPrismaClient,
  input: PreviewLegacyQaCleanupInput
): Promise<LegacyQaCleanupPreview> {
  const normalized = normalizeLegacyQaCleanupFolios(input.folios);
  const confirmations = ((await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      studyParticipant: {
        select: {
          hutParticipant: {
            select: { id: true }
          },
          participantProfile: {
            select: { name: true }
          }
        }
      },
      studyParticipantId: true
    },
    where: {
      folio: { in: normalized.authorizedFolios },
      studyId: input.studyId
    }
  })) as LegacyQaConfirmationRecord[] | undefined) ?? [];
  const hutParticipants = ((await prisma.hutParticipant.findMany?.({
    select: {
      folio: true,
      id: true,
      name: true,
      studyParticipantId: true
    },
    where: {
      folio: { in: normalized.authorizedFolios },
      studyId: input.studyId
    }
  })) as LegacyQaHutParticipantRecord[] | undefined) ?? [];
  const confirmationsByFolio = new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));
  const hutByFolio = new Map(hutParticipants.filter((participant) => participant.folio).map((participant) => [participant.folio!, participant]));

  return {
    authorizedFolios: normalized.authorizedFolios,
    blockedFolios: normalized.blockedFolios,
    folios: await Promise.all(normalized.authorizedFolios.map(async (folio) => {
      const confirmation = confirmationsByFolio.get(folio) ?? null;
      const hutParticipant = hutByFolio.get(folio) ?? null;
      const studyParticipantId = confirmation?.studyParticipantId ?? hutParticipant?.studyParticipantId ?? null;
      const hutParticipantId = confirmation?.studyParticipant?.hutParticipant?.id ?? hutParticipant?.id ?? null;
      return {
        folio,
        found: Boolean(studyParticipantId || hutParticipantId),
        hutParticipantId,
        participantName: confirmation?.studyParticipant?.participantProfile?.name ?? hutParticipant?.name ?? null,
        relationCounts: await countLegacyQaRelations(prisma, {
          hutParticipantId,
          studyParticipantId
        }),
        studyParticipantId
      };
    })),
    studyId: input.studyId
  };
}

async function countLegacyQaRelations(
  prisma: QaPrismaClient,
  input: {
    hutParticipantId: string | null;
    studyParticipantId: string | null;
  }
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (input.studyParticipantId) {
    counts.ctlSessions = await countIfAvailable(prisma.ctlSession, { studyParticipantId: input.studyParticipantId });
    counts.participantActivities = await countIfAvailable(prisma.participantActivity, { studyParticipantId: input.studyParticipantId });
    counts.participantActivityEvidence = await countIfAvailable(prisma.participantActivityEvidence, { studyParticipantId: input.studyParticipantId });
    counts.participantReferenceCodes = await countIfAvailable(prisma.participantReferenceCode, {
      confirmation: { studyParticipantId: input.studyParticipantId }
    });
    counts.participantEvidences = await countIfAvailable(prisma.participantEvidence, { studyParticipantId: input.studyParticipantId });
    counts.screeningAttempts = await countIfAvailable(prisma.screeningAttempt, { studyParticipantId: input.studyParticipantId });
    counts.whatsAppMessagesNavigo = await countIfAvailable(prisma.oneuiWhatsAppMessage, {
      linkedParticipantId: input.studyParticipantId,
      sourceModule: "NAVIGO"
    });
  }
  if (input.hutParticipantId) {
    counts.hutQuestionnaireAttempts = await countIfAvailable(prisma.hutQuestionnaireAttempt, { participantId: input.hutParticipantId });
    counts.hutApplicationPhotos = await countIfAvailable(prisma.hutApplicationPhotoEntry, { participantId: input.hutParticipantId });
    counts.hutPhaseCodes = await countIfAvailable(prisma.hutParticipantPhaseCode, { participantId: input.hutParticipantId });
    counts.hutVideos = await countIfAvailable(prisma.hutVideoSubmission, { participantId: input.hutParticipantId });
    counts.hutVisualVerifications = await countIfAvailable(prisma.hutVisualVerification, { participantId: input.hutParticipantId });
    counts.whatsAppMessagesHut = await countIfAvailable(prisma.oneuiWhatsAppMessage, {
      linkedParticipantId: input.hutParticipantId,
      sourceModule: "HUT"
    });
  }
  return counts;
}

async function countIfAvailable(delegate: Delegate, where: unknown): Promise<number> {
  if (!delegate.count) {
    return 0;
  }
  return delegate.count({ where });
}

type QaScenarioDataInput = CreateQaParticipantScenarioInput & {
  now: Date;
  run: QaParticipantRunRecord;
};

type QaStudyRecord = {
  code: string;
  id: string;
  name: string;
};

type QaQuestionnaireVersionRecord = {
  id: string;
};

type QaRotationPlanArmRecord = {
  applicationOrder: number;
  participantVisibleLabel: string;
  studyArm: {
    code: string;
    label: string;
  };
  studyArmId: string;
  studyProduct: {
    displayLabel: string;
    internalCode: string;
  };
  studyProductId: string;
};

type QaRotationPlanRecord = {
  arms: QaRotationPlanArmRecord[];
  id: string;
  rotationCode: string;
};

type QaParticipantFoundation = {
  confirmationId: string;
  folio: string;
  participantId: string;
  participantName: string;
  participantProfileId: string;
  referenceCodes: Array<{ code: string; slot: 1 | 2 | 3 }>;
  screeningAttemptId: string;
};

type QaNavigoRotation = {
  assignmentId: string;
  arms: QaRotationPlanArmRecord[];
  firstFragrance: string;
  rotationCode: string;
  secondFragrance: string;
};

type QaCtlTriangularRotation = {
  id: string;
  triangular1Pr1: string;
  triangular1Pr2: string;
  triangular1Pr3: string;
  triangular1Verify: string;
  triangular2Pr1: string;
  triangular2Pr2: string;
  triangular2Pr3: string;
  triangular2Verify: string;
};

type QaHutParticipant = {
  attemptId: string;
  id: string;
  token: string;
};

async function createQaScenarioData(
  tx: QaPrismaClient,
  input: QaScenarioDataInput
): Promise<QaParticipantRunSummary> {
  const study = await findQaStudy(tx, input.studyId);
  const folio = buildQaScenarioFolio(input.run);
  const report = createBaseScenarioReport(input);

  let participant: QaParticipantFoundation | null = null;
  let navigoRotation: QaNavigoRotation | null = null;
  let ctlTriangularRotation: QaCtlTriangularRotation | null = null;
  let ctlSessionId: string | null = null;
  let navigoToken: string | null = null;
  let hutParticipant: QaHutParticipant | null = null;

  if (input.scenario !== "HUT_DIRECTO") {
    participant = await createQaStudyParticipantFoundation(tx, {
      actorUserId: input.createdByUserId,
      folio,
      now: input.now,
      runId: input.run.id,
      study
    });
    report.objects.participantProfileId = participant.participantProfileId;
    report.objects.studyParticipantId = participant.participantId;
    report.objects.screeningAttemptId = participant.screeningAttemptId;
    report.objects.participantConfirmationId = participant.confirmationId;
    report.referenceCodes = participant.referenceCodes.map((code) => ({
      generated: true,
      slot: code.slot
    }));
    report.links.ctlPublic = buildRelativeOrAbsoluteLink(input.baseUrl, `/ctl/${study.code}`);

    navigoRotation = await assignQaNavigoRotation(tx, {
      actorUserId: input.createdByUserId,
      now: input.now,
      studyParticipantId: participant.participantId,
      studyId: study.id
    });
    report.objects.rotationAssignmentId = navigoRotation.assignmentId;
    report.rotations.navigo = {
      armAssignmentCount: navigoRotation.arms.length,
      firstFragrance: navigoRotation.firstFragrance,
      rotationCode: navigoRotation.rotationCode,
      secondFragrance: navigoRotation.secondFragrance
    };

    ctlTriangularRotation = await createQaCtlTriangularRotation(tx, {
      actorUserId: input.createdByUserId,
      firstFragrance: navigoRotation.firstFragrance,
      secondFragrance: navigoRotation.secondFragrance,
      studyParticipantId: participant.participantId
    });
    report.objects.triangularRotationAssignmentId = ctlTriangularRotation.id;
    report.rotations.ctlTriangular = toCtlTriangularReport(ctlTriangularRotation);
  }

  if (participant && (input.scenario === "CLT_NAVIGO" || input.scenario === "CLT_NAVIGO_HUT")) {
    ctlSessionId = await createCompletedQaCtlSession(tx, {
      actorUserId: input.createdByUserId,
      ctlTriangularRotation,
      now: input.now,
      participant,
      rotation: navigoRotation,
      studyId: study.id
    });
    report.objects.ctlSessionId = ctlSessionId;

    navigoToken = await createQaNavigoAccessToken(tx, {
      actorUserId: input.createdByUserId,
      now: input.now,
      studyParticipantId: participant.participantId
    });
    report.objects.participantAccessTokenId = navigoToken;
    report.links.navigoParticipant = buildRelativeOrAbsoluteLink(input.baseUrl, `/p/${navigoToken}/activities`);
  }

  if (input.scenario === "CLT_NAVIGO_HUT" || input.scenario === "HUT_DIRECTO") {
    const hutSource =
      input.scenario === "CLT_NAVIGO_HUT" && participant && navigoRotation
        ? {
            email: `qa-${input.run.id}@example.invalid`,
            firstFragrance: navigoRotation.firstFragrance,
            folio,
            name: participant.participantName,
            phone: "+520000000000",
            referenceCodes: participant.referenceCodes,
            secondFragrance: navigoRotation.secondFragrance,
            studyParticipantId: participant.participantId
          }
        : {
            email: `qa-${input.run.id}@example.invalid`,
            firstFragrance: "QA-EVA1",
            folio,
            name: `QA HUT ${folio}`,
            phone: "+520000000000",
            referenceCodes: [],
            secondFragrance: "QA-EVA2",
            studyParticipantId: null
          };

    hutParticipant = await createQaHutParticipant(tx, {
      hutPhaseCodeSecret: input.hutPhaseCodeSecret,
      now: input.now,
      origin: input.scenario === "HUT_DIRECTO" ? "HUT_DIRECTO" : "CLT_HUT",
      source: hutSource,
      studyId: study.id
    });
    report.objects.hutParticipantId = hutParticipant.id;
    report.objects.hutQuestionnaireAttemptId = hutParticipant.attemptId;
    report.links.hutParticipant = buildRelativeOrAbsoluteLink(input.baseUrl, `/hut/p/${hutParticipant.token}`);
    report.rotations.hut = {
      eva1: hutSource.firstFragrance,
      eva2: hutSource.secondFragrance
    };
  }

  report.status = "CREATED";

  const updated = (await tx.qaParticipantRun.update?.({
    data: {
      folio,
      hutParticipantId: hutParticipant?.id ?? null,
      reportJson: report,
      status: "CREATED",
      studyParticipantId: participant?.participantId ?? null
    },
    select: qaRunSelect,
    where: { id: input.run.id }
  })) as QaParticipantRunRecord;

  return toQaParticipantRunSummary(updated);
}

async function findQaStudy(tx: QaPrismaClient, studyId: string): Promise<QaStudyRecord> {
  const study = (await tx.study.findUnique?.({
    select: {
      code: true,
      id: true,
      name: true
    },
    where: { id: studyId }
  })) as QaStudyRecord | null;

  if (!study) {
    throw new Error("No encontramos el estudio para crear QA.");
  }

  return study;
}

async function createQaStudyParticipantFoundation(
  tx: QaPrismaClient,
  input: {
    actorUserId: string;
    folio: string;
    now: Date;
    runId: string;
    study: QaStudyRecord;
  }
): Promise<QaParticipantFoundation> {
  const questionnaireVersion = (await tx.questionnaireVersion.findFirst?.({
    orderBy: { publishedAt: "desc" },
    select: { id: true },
    where: {
      questionnaireDraft: { purpose: "SCREENER" },
      status: "ACTIVE",
      studyId: input.study.id
    }
  })) as QaQuestionnaireVersionRecord | null;

  if (!questionnaireVersion) {
    throw new Error("No encontramos una version activa del screener para el estudio.");
  }

  const profile = (await tx.participantProfile.create?.({
    data: {
      createdByUserId: input.actorUserId,
      email: `qa-${input.runId}@example.invalid`,
      externalReference: input.folio,
      name: `QA ${input.folio}`,
      phone: "+520000000000",
      status: "ACTIVE"
    },
    select: { id: true, name: true }
  })) as { id: string; name: string };

  const studyParticipant = (await tx.studyParticipant.create?.({
    data: {
      createdByUserId: input.actorUserId,
      operationalStatus: "SCREENING_PASSED",
      participantProfileId: profile.id,
      screeningStatus: "PASSED",
      studyId: input.study.id,
      visualVerificationMode: "disabled"
    },
    select: { id: true }
  })) as { id: string };

  const screeningAttempt = (await tx.screeningAttempt.create?.({
    data: {
      completedAt: input.now,
      evaluationJson: {
        qa: true,
        source: "QaParticipantRun"
      },
      questionnaireVersionId: questionnaireVersion.id,
      source: "FIELD",
      startedAt: input.now,
      status: "PASSED",
      studyParticipantId: studyParticipant.id
    },
    select: { id: true }
  })) as { id: string };

  await tx.participantScreeningReview.create?.({
    data: {
      evidenceReviewStatus: "APPROVED",
      internalNote: "Participante QA generado para pruebas internas.",
      reviewedAt: input.now,
      reviewedByUserId: input.actorUserId,
      status: "APPROVED",
      studyParticipantId: studyParticipant.id
    }
  });

  const confirmation = (await tx.participantConfirmation.create?.({
    data: {
      approvedAt: input.now,
      approvedByUserId: input.actorUserId,
      folio: input.folio,
      folioSequence: buildQaFolioSequence(input.runId),
      manualMessageStatus: "NOT_SENT",
      screeningAttemptId: screeningAttempt.id,
      studyId: input.study.id,
      studyParticipantId: studyParticipant.id
    },
    select: { id: true }
  })) as { id: string };

  const existingReferenceCodes = ((await tx.participantReferenceCode.findMany?.({
    select: { code: true }
  })) ?? []) as Array<{ code: string }>;
  const referenceCodes = generateReferenceCodes({
    codeGenerator: generateParticipantReferenceCode,
    existingReferenceCodes: existingReferenceCodes.map((code) => code.code)
  });
  for (const referenceCode of referenceCodes) {
    await tx.participantReferenceCode.create?.({
      data: {
        code: referenceCode.code,
        confirmationId: confirmation.id,
        slot: referenceCode.slot
      }
    });
  }

  return {
    confirmationId: confirmation.id,
    folio: input.folio,
    participantId: studyParticipant.id,
    participantName: profile.name,
    participantProfileId: profile.id,
    referenceCodes,
    screeningAttemptId: screeningAttempt.id
  };
}

async function assignQaNavigoRotation(
  tx: QaPrismaClient,
  input: {
    actorUserId: string;
    now: Date;
    studyId: string;
    studyParticipantId: string;
  }
): Promise<QaNavigoRotation> {
  const plans = ((await tx.rotationPlan.findMany?.({
    orderBy: { rotationCode: "asc" },
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
          studyArm: {
            select: {
              code: true,
              label: true
            }
          },
          studyArmId: true,
          studyProduct: {
            select: {
              displayLabel: true,
              internalCode: true
            }
          },
          studyProductId: true
        }
      },
      id: true,
      rotationCode: true
    },
    where: {
      status: "ACTIVE",
      studyId: input.studyId
    }
  })) ?? []) as QaRotationPlanRecord[];
  const selected = plans.find((plan) => {
    const orders = plan.arms.map((arm) => arm.applicationOrder).sort();
    return plan.arms.length === 2 && orders[0] === 1 && orders[1] === 2;
  });

  if (!selected) {
    throw new Error("Falta una rotacion Navigo activa con dos brazos para crear QA.");
  }

  const assignment = (await tx.participantRotationAssignment.create?.({
    data: {
      assignedAt: input.now,
      assignedByUserId: input.actorUserId,
      assignmentMode: "MANUAL_COVER_CODE",
      rotationCode: selected.rotationCode,
      rotationPlanId: selected.id,
      studyParticipantId: input.studyParticipantId
    },
    select: { id: true }
  })) as { id: string };

  for (const arm of selected.arms) {
    await tx.participantArmAssignment.create?.({
      data: {
        applicationOrder: arm.applicationOrder,
        participantRotationAssignmentId: assignment.id,
        participantVisibleLabel: arm.participantVisibleLabel,
        studyArmId: arm.studyArmId,
        studyParticipantId: input.studyParticipantId,
        studyProductId: arm.studyProductId
      }
    });
  }

  const firstArm = selected.arms.find((arm) => arm.applicationOrder === 1) ?? selected.arms[0];
  const secondArm = selected.arms.find((arm) => arm.applicationOrder === 2) ?? selected.arms[1];

  return {
    arms: selected.arms,
    assignmentId: assignment.id,
    firstFragrance: firstArm?.studyProduct.internalCode ?? firstArm?.participantVisibleLabel ?? "QA-EVA1",
    rotationCode: selected.rotationCode,
    secondFragrance: secondArm?.studyProduct.internalCode ?? secondArm?.participantVisibleLabel ?? "QA-EVA2"
  };
}

async function createQaCtlTriangularRotation(
  tx: QaPrismaClient,
  input: {
    actorUserId: string;
    firstFragrance: string;
    secondFragrance: string;
    studyParticipantId: string;
  }
): Promise<QaCtlTriangularRotation> {
  const triangular = {
    triangular1Pr1: input.firstFragrance,
    triangular1Pr2: input.secondFragrance,
    triangular1Pr3: "QA-TRI-3",
    triangular1Verify: input.secondFragrance,
    triangular2Pr1: input.secondFragrance,
    triangular2Pr2: input.firstFragrance,
    triangular2Pr3: "QA-TRI-6",
    triangular2Verify: input.firstFragrance
  };
  const created = (await tx.ctlTriangularRotationAssignment.create?.({
    data: {
      ...triangular,
      importedByUserId: input.actorUserId,
      sourceFileName: "QA_PARTICIPANT_RUN",
      studyParticipantId: input.studyParticipantId
    },
    select: {
      id: true,
      triangular1Pr1: true,
      triangular1Pr2: true,
      triangular1Pr3: true,
      triangular1Verify: true,
      triangular2Pr1: true,
      triangular2Pr2: true,
      triangular2Pr3: true,
      triangular2Verify: true
    }
  })) as QaCtlTriangularRotation;

  return created;
}

async function createCompletedQaCtlSession(
  tx: QaPrismaClient,
  input: {
    actorUserId: string;
    ctlTriangularRotation: QaCtlTriangularRotation | null;
    now: Date;
    participant: QaParticipantFoundation;
    rotation: QaNavigoRotation | null;
    studyId: string;
  }
): Promise<string> {
  const session = (await tx.ctlSession.create?.({
    data: {
      claimedAt: input.now,
      completedAt: input.now,
      interviewerId: input.actorUserId,
      screeningAttemptId: input.participant.screeningAttemptId,
      startedAt: input.now,
      status: "COMPLETED",
      studyId: input.studyId,
      studyParticipantId: input.participant.participantId,
      triangularRotationSnapshot: input.ctlTriangularRotation ? toCtlTriangularSnapshot(input.ctlTriangularRotation) : null
    },
    select: { id: true }
  })) as { id: string };

  await createQaCtlAutomaticAnswers(tx, {
    completedAt: input.now,
    participantName: input.participant.participantName,
    sessionId: session.id
  });

  const firstArm = input.rotation?.arms.find((arm) => arm.applicationOrder === 1);
  const secondArm = input.rotation?.arms.find((arm) => arm.applicationOrder === 2);
  const phases = [
    {
      arm: firstArm?.studyArm.label ?? "IZQUIERDO",
      phase: "COLOCACION",
      productCode: input.rotation?.firstFragrance ?? null,
      referenceCodeSlot: 1
    },
    {
      arm: secondArm?.studyArm.label ?? "DERECHO",
      phase: "EVALUACION_1",
      productCode: input.rotation?.secondFragrance ?? null,
      referenceCodeSlot: 2
    },
    {
      arm: null,
      phase: "EVALUACION_2",
      productCode: input.rotation?.secondFragrance ?? null,
      referenceCodeSlot: 3
    }
  ] as const;

  for (const phase of phases) {
    await tx.ctlPhaseProgress.create?.({
      data: {
        arm: phase.arm,
        completedAt: input.now,
        ctlSessionId: session.id,
        phase: phase.phase,
        productCode: phase.productCode,
        referenceCodeSlot: phase.referenceCodeSlot,
        rotationSnapshot: {
          firstSampleKey: input.rotation?.firstFragrance ?? null,
          secondSampleKey: input.rotation?.secondFragrance ?? null,
          triangularRotation: input.ctlTriangularRotation ? toCtlTriangularSnapshot(input.ctlTriangularRotation) : null
        },
        startedAt: input.now,
        status: "COMPLETED",
        validatedAt: input.now,
        validatedBy: input.actorUserId
      }
    });
  }

  return session.id;
}

async function createQaCtlAutomaticAnswers(
  tx: QaPrismaClient,
  input: {
    completedAt: Date;
    participantName: string;
    sessionId: string;
  }
): Promise<void> {
  const answers = [
    { answerValue: input.participantName, questionCode: "DG_NOMBRE" },
    { answerValue: input.completedAt.toISOString().slice(0, 10), questionCode: "DG_FECHA" },
    { answerValue: input.completedAt.toISOString().slice(11, 16), questionCode: "DG_HORA_INICIO" },
    { answerValue: input.completedAt.toISOString().slice(11, 16), questionCode: "DG_HORA_TERMINO" }
  ];

  for (const answer of answers) {
    await tx.ctlAnswer.create?.({
      data: {
        answerValue: answer.answerValue,
        ctlSessionId: input.sessionId,
        questionCode: answer.questionCode
      }
    });
  }
}

async function createQaNavigoAccessToken(
  tx: QaPrismaClient,
  input: {
    actorUserId: string;
    now: Date;
    studyParticipantId: string;
  }
): Promise<string> {
  const token = randomUUID();
  await tx.participantAccessToken.create?.({
    data: {
      createdByUserId: input.actorUserId,
      expiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
      id: token,
      status: "ACTIVE",
      studyParticipantId: input.studyParticipantId,
      tokenHash: hashToken(token)
    }
  });
  await tx.studyParticipant.update?.({
    data: {
      operationalStatus: "ASSIGNED"
    },
    where: { id: input.studyParticipantId }
  });

  return token;
}

async function createQaHutParticipant(
  tx: QaPrismaClient,
  input: {
    hutPhaseCodeSecret?: string;
    now: Date;
    origin: "CLT_HUT" | "HUT_DIRECTO";
    source: {
      email: string;
      firstFragrance: string;
      folio: string;
      name: string;
      phone: string;
      referenceCodes: Array<{ code: string; slot: 1 | 2 | 3 }>;
      secondFragrance: string;
      studyParticipantId: string | null;
    };
    studyId: string;
  }
): Promise<QaHutParticipant> {
  const token = createHutParticipantToken();
  const participant = (await tx.hutParticipant.create?.({
    data: {
      email: input.source.email,
      firstFragranceLeftArm: input.source.firstFragrance,
      folio: input.source.folio,
      name: input.source.name,
      origin: input.origin,
      phone: input.source.phone,
      protocolVersion: "APPLICATION_PHOTO",
      secondFragranceRightArm: input.source.secondFragrance,
      status: "NOT_STARTED",
      studyId: input.studyId,
      studyParticipantId: input.source.studyParticipantId,
      token
    },
    select: { id: true }
  })) as { id: string };

  await tx.hutRegistrationSlot.upsert?.({
    create: {
      firstFragranceLeftArm: input.source.firstFragrance,
      folio: input.source.folio,
      participantId: participant.id,
      registeredAt: input.now,
      registrationToken: createHutRegistrationToken(),
      secondFragranceRightArm: input.source.secondFragrance,
      status: "REGISTERED",
      studyId: input.studyId
    },
    update: {
      firstFragranceLeftArm: input.source.firstFragrance,
      participantId: participant.id,
      registeredAt: input.now,
      secondFragranceRightArm: input.source.secondFragrance,
      status: "REGISTERED"
    },
    where: {
      studyId_folio: {
        folio: input.source.folio,
        studyId: input.studyId
      }
    }
  });

  await createQaHutPhaseCodes(tx, {
    hutPhaseCodeSecret: input.hutPhaseCodeSecret,
    now: input.now,
    participantId: participant.id,
    referenceCodes: input.source.referenceCodes
  });

  const attempt = (await tx.hutQuestionnaireAttempt.create?.({
    data: {
      participantId: participant.id,
      status: "PENDING"
    },
    select: { id: true }
  })) as { id: string };

  return {
    attemptId: attempt.id,
    id: participant.id,
    token
  };
}

async function createQaHutPhaseCodes(
  tx: QaPrismaClient,
  input: {
    hutPhaseCodeSecret?: string;
    now: Date;
    participantId: string;
    referenceCodes: Array<{ code: string; slot: 1 | 2 | 3 }>;
  }
): Promise<void> {
  const secret = input.hutPhaseCodeSecret ?? resolveHutPhaseCodeSecret();
  if (!secret) {
    throw new Error("Falta HUT_PHASE_CODE_SECRET para generar codigos HUT QA.");
  }

  for (const slot of [1, 2, 3] as const) {
    const phase = hutPhaseForSlot(slot);
    if (!phase) {
      continue;
    }
    const code = input.referenceCodes.find((candidate) => candidate.slot === slot)?.code ?? generateHutPhaseCode();
    await tx.hutParticipantPhaseCode.create?.({
      data: {
        codeHash: hashHutPhaseCode(code, secret),
        encryptedCode: encryptHutPhaseCode(code, secret),
        encryptionVersion: 1,
        participantId: input.participantId,
        phase,
        sentAt: null,
        slot,
        status: "GENERATED"
      }
    });
  }
}

function createBaseScenarioReport(input: QaScenarioDataInput): QaParticipantScenarioReport {
  return {
    createdAt: input.now.toISOString(),
    executionMode: input.executionMode,
    links: {},
    objects: {},
    qa: true,
    referenceCodes: [],
    rotations: {},
    scenario: input.scenario,
    skippedExternalEffects: ["WhatsApp real no enviado.", "Archivos/evidencias no cargados."],
    status: "CREATED"
  };
}

function toCtlTriangularReport(rotation: QaCtlTriangularRotation): QaParticipantScenarioReport["rotations"]["ctlTriangular"] {
  return {
    triangular1: {
      pr1: rotation.triangular1Pr1,
      pr2: rotation.triangular1Pr2,
      pr3: rotation.triangular1Pr3,
      verify: rotation.triangular1Verify
    },
    triangular2: {
      pr1: rotation.triangular2Pr1,
      pr2: rotation.triangular2Pr2,
      pr3: rotation.triangular2Pr3,
      verify: rotation.triangular2Verify
    }
  };
}

function toCtlTriangularSnapshot(rotation: QaCtlTriangularRotation) {
  return {
    assignmentId: rotation.id,
    triangular1: {
      pr1: rotation.triangular1Pr1,
      pr2: rotation.triangular1Pr2,
      pr3: rotation.triangular1Pr3,
      verify: rotation.triangular1Verify
    },
    triangular2: {
      pr1: rotation.triangular2Pr1,
      pr2: rotation.triangular2Pr2,
      pr3: rotation.triangular2Pr3,
      verify: rotation.triangular2Verify
    }
  };
}

function buildQaScenarioFolio(run: QaParticipantRunRecord): string {
  const compact = run.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
  return normalizeQaParticipantFolio(`QA-${compact || "RUN"}`) ?? "QA-RUN";
}

function buildQaFolioSequence(runId: string): number {
  const digest = createHash("sha256").update(runId).digest("hex").slice(0, 8);
  return -1 * (parseInt(digest, 16) % 1_000_000_000 || 1);
}

function buildRelativeOrAbsoluteLink(baseUrl: string | undefined, path: string): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, "");
  return trimmed ? `${trimmed}${path}` : path;
}

async function cleanupQaRunData(tx: QaPrismaClient, run: QaParticipantRunRecord): Promise<QaParticipantCleanupReport> {
  const report = createEmptyQaCleanupReport({
    hutParticipantId: run.hutParticipantId,
    studyParticipantId: run.studyParticipantId
  });

  if (run.hutParticipantId) {
    await cleanupHutParticipant(tx, report, run.hutParticipantId);
  }
  if (run.studyParticipantId) {
    await cleanupStudyParticipant(tx, report, run.studyParticipantId);
  }

  return report;
}

async function cleanupHutParticipant(tx: QaPrismaClient, report: QaParticipantCleanupReport, hutParticipantId: string): Promise<void> {
  await deleteMany(tx.hutAnswer, report, "hutAnswer", { attempt: { participantId: hutParticipantId } });
  await deleteMany(tx.hutVisitProgress, report, "hutVisitProgress", { attempt: { participantId: hutParticipantId } });
  await deleteMany(tx.hutQuestionnaireAttempt, report, "hutQuestionnaireAttempt", { participantId: hutParticipantId });
  await deleteMany(tx.hutApplicationPhotoEntry, report, "hutApplicationPhotoEntry", { participantId: hutParticipantId });
  await deleteMany(tx.hutApplicationEvidence, report, "hutApplicationEvidence", { participantId: hutParticipantId });
  await deleteMany(tx.hutParticipantPhaseCode, report, "hutParticipantPhaseCode", { participantId: hutParticipantId });
  await deleteMany(tx.hutVisualVerification, report, "hutVisualVerification", { participantId: hutParticipantId });
  await deleteMany(tx.hutVideoSubmission, report, "hutVideoSubmission", { participantId: hutParticipantId });
  await deleteMany(tx.hutDailyCheck, report, "hutDailyCheck", { participantId: hutParticipantId });
  await deleteMany(tx.hutBlock, report, "hutBlock", { participantId: hutParticipantId });
  await deleteMany(tx.hutCallEvaluation, report, "hutCallEvaluation", { participantId: hutParticipantId });
  await deleteMany(tx.hutReferenceSelfie, report, "hutReferenceSelfie", { participantId: hutParticipantId });
  await updateMany(tx.hutRegistrationSlot, report, "hutRegistrationSlot", { participantId: hutParticipantId }, {
    participantId: null,
    registeredAt: null,
    status: "AVAILABLE"
  });
  await deleteMany(tx.oneuiWhatsAppMessage, report, "oneuiWhatsAppMessage", {
    linkedParticipantId: hutParticipantId,
    sourceModule: "HUT"
  });
  await deleteMany(tx.hutParticipant, report, "hutParticipant", { id: hutParticipantId });
}

async function cleanupStudyParticipant(tx: QaPrismaClient, report: QaParticipantCleanupReport, studyParticipantId: string): Promise<void> {
  const profile = (await tx.studyParticipant.findUnique?.({
    select: { participantProfileId: true },
    where: { id: studyParticipantId }
  })) as { participantProfileId: string } | null;

  await deleteMany(tx.ctlAnswer, report, "ctlAnswer", { ctlSession: { studyParticipantId } });
  await deleteMany(tx.ctlPhaseProgress, report, "ctlPhaseProgress", { ctlSession: { studyParticipantId } });
  await deleteMany(tx.ctlSession, report, "ctlSession", { studyParticipantId });
  await deleteMany(tx.ctlTriangularRotationAssignment, report, "ctlTriangularRotationAssignment", { studyParticipantId });

  await deleteMany(tx.researchResponse, report, "researchResponse", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.mediaEvidencePlaceholder, report, "mediaEvidencePlaceholder", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.participantActivityEvidence, report, "participantActivityEvidence", { studyParticipantId });
  await deleteMany(tx.reminderLog, report, "reminderLog", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.participantActivity, report, "participantActivity", { studyParticipantId });
  await deleteMany(tx.participantAttributeOrder, report, "participantAttributeOrder", { studyParticipantId });
  await deleteMany(tx.applicationTimeEvent, report, "applicationTimeEvent", { studyParticipantId });
  await deleteMany(tx.participantAccessToken, report, "participantAccessToken", { studyParticipantId });

  await deleteMany(tx.participantArmAssignment, report, "participantArmAssignment", { studyParticipantId });
  await deleteMany(tx.participantRotationAssignment, report, "participantRotationAssignment", { studyParticipantId });

  await deleteMany(tx.participantConsent, report, "participantConsent", { studyParticipantId });
  await deleteMany(tx.participantEvidence, report, "participantEvidence", { studyParticipantId });
  await deleteMany(tx.participantScreeningReview, report, "participantScreeningReview", { studyParticipantId });
  await deleteMany(tx.screeningAnswer, report, "screeningAnswer", { screeningAttempt: { studyParticipantId } });
  await deleteMany(tx.participantReferenceCode, report, "participantReferenceCode", { confirmation: { studyParticipantId } });
  await deleteMany(tx.participantConfirmation, report, "participantConfirmation", { studyParticipantId });
  await deleteMany(tx.screeningAttempt, report, "screeningAttempt", { studyParticipantId });
  await deleteMany(tx.quotaEvaluation, report, "quotaEvaluation", { studyParticipantId });
  await deleteMany(tx.oneuiWhatsAppMessage, report, "oneuiWhatsAppMessage", {
    linkedParticipantId: studyParticipantId,
    sourceModule: "NAVIGO"
  });

  await deleteMany(tx.studyParticipant, report, "studyParticipant", { id: studyParticipantId });
  if (profile?.participantProfileId) {
    await deleteMany(tx.participantProfile, report, "participantProfile", {
      id: profile.participantProfileId,
      participations: { none: {} }
    });
  }
}

async function deleteMany(
  delegate: Delegate,
  report: QaParticipantCleanupReport,
  modelName: string,
  where: unknown
): Promise<void> {
  if (!delegate.deleteMany) {
    report.notes.push(`${modelName}: delegate no disponible.`);
    return;
  }
  const result = await delegate.deleteMany({ where });
  recordQaCleanupCount(report, modelName, result);
}

async function updateMany(
  delegate: Delegate,
  report: QaParticipantCleanupReport,
  modelName: string,
  where: unknown,
  data: unknown
): Promise<void> {
  if (!delegate.updateMany) {
    report.notes.push(`${modelName}: updateMany no disponible.`);
    return;
  }
  const result = await delegate.updateMany({ data, where });
  recordQaCleanupCount(report, modelName, result);
}

async function markRunCleaned(
  tx: QaPrismaClient,
  input: {
    cleanedByUserId: string;
    report: QaParticipantCleanupReport;
    runId: string;
  }
): Promise<QaParticipantRunSummary> {
  const updated = (await tx.qaParticipantRun.update?.({
    data: {
      cleanedAt: new Date(),
      cleanedByUserId: input.cleanedByUserId,
      cleanupReportJson: input.report,
      status: "CLEANED"
    },
    select: qaRunSelect,
    where: { id: input.runId }
  })) as QaParticipantRunRecord;

  return toQaParticipantRunSummary(updated);
}
