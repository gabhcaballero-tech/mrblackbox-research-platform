import { createPrismaClient } from "@/shared/db/client";

const AUTHORIZED_TEST_FOLIOS = [
  "NAV-001",
  "NAV-002",
  "NAV-010",
  "NAV-011",
  "NAV-012",
  "NAV-013",
  "NAV-014",
  "NAV-015",
  "NAV-030",
  "NAV-104",
  "NAV-106",
  "NAV-110",
  "NAV-115",
  "NAV-117"
] as const;

const AUTHORIZED_LEGACY_QA_PARTICIPANT_FOLIOS = [
  "NAV-104",
  "NAV-106",
  "NAV-110",
  "NAV-115",
  "NAV-117"
] as const;

const SUSPECT_ROTATION_CODES = [
  ...AUTHORIZED_TEST_FOLIOS,
  "ROT-1",
  "ROT-2",
  "FM-A",
  "FM-B"
] as const;

const OFFICIAL_ROTATION_PLAN_PAIRS = new Map([
  ["ROTACION1", "247->583"],
  ["ROTACION2", "583->247"]
]);

type Delegate = {
  create?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<{ count: number }>;
  findMany?: (args: unknown) => Promise<unknown[]>;
};

type RotationCleanupPrismaClient = {
  $transaction: <T>(callback: (tx: RotationCleanupPrismaClient) => Promise<T>) => Promise<T>;
  applicationTimeEvent: Delegate;
  ctlAnswer: Delegate;
  ctlPhaseProgress: Delegate;
  ctlSession: Delegate;
  ctlTriangularRotationAssignment: Delegate;
  mediaEvidencePlaceholder: Delegate;
  oneuiWhatsAppMessage: Delegate;
  participantAccessToken: Delegate;
  participantArmAssignment: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  participantAttributeOrder: Delegate;
  participantConfirmation: Delegate;
  participantConsent: Delegate;
  participantEvidence: Delegate;
  participantReferenceCode: Delegate;
  participantRotationAssignment: Delegate;
  participantScreeningReview: Delegate;
  qaParticipantRun: Delegate;
  quotaEvaluation: Delegate;
  reminderLog: Delegate;
  researchResponse: Delegate;
  rotationPlan: Delegate;
  rotationPlanArm: Delegate;
  screeningAnswer: Delegate;
  screeningAttempt: Delegate;
  studyParticipant: Delegate;
};

type RotationPlanRecord = {
  arms: Array<{
    applicationOrder: number;
    id: string;
    studyProduct: {
      internalCode: string;
    };
  }>;
  assignments: Array<{
    id: string;
    studyParticipant: {
      id: string;
      participantConfirmation: { folio: string | null } | null;
      participantProfile: { name: string | null } | null;
      qaParticipantRun: { id: string } | null;
    };
    studyParticipantId: string;
  }>;
  id: string;
  name: string;
  rotationCode: string;
  status: string;
};

export type NavigoRotationCleanupPlanPreview = {
  assignedParticipants: Array<{
    folio: string | null;
    isAuthorizedTestFolio: boolean;
    isQaRun: boolean;
    name: string | null;
    studyParticipantId: string;
  }>;
  arms: Array<{
    applicationOrder: number;
    sampleKey: string;
  }>;
  blockReasons: string[];
  id: string;
  isOfficialRotation: boolean;
  isSuspectTestConfig: boolean;
  name: string;
  relationCounts: {
    participantArmAssignments: number;
    participantRotationAssignments: number;
    rotationPlanArms: number;
  };
  rotationCode: string;
};

export type NavigoRotationCleanupPreview = {
  authorizedTestFolios: string[];
  blockedRealParticipants: Array<{
    folio: string | null;
    name: string | null;
    rotationCode: string;
    studyParticipantId: string;
  }>;
  deleteablePlanIds: string[];
  legacyQaParticipants: Array<{
    folio: string;
    name: string | null;
    rotationCode: string;
    studyParticipantId: string;
  }>;
  officialPlanIds: string[];
  plans: NavigoRotationCleanupPlanPreview[];
  studyId: string;
  suspectRotationCodes: string[];
};

export type NavigoRotationCleanupReport = {
  cleanedAt: string;
  cleanedByUserId: string;
  deleted: Record<string, number>;
  legacyQaParticipants: NavigoRotationCleanupPreview["legacyQaParticipants"];
  plans: NavigoRotationCleanupPlanPreview[];
  studyId: string;
};

export type NavigoRotationCleanupActionResult =
  | { data: NavigoRotationCleanupReport; ok: true }
  | { message: string; ok: false };

export async function previewNavigoTestRotationCleanup(
  studyId: string,
  prismaClient?: RotationCleanupPrismaClient
): Promise<NavigoRotationCleanupPreview> {
  const prisma = prismaClient ?? ((await createPrismaClient()) as unknown as RotationCleanupPrismaClient);
  const plans = await loadRotationCleanupPlans(prisma, studyId);
  return buildRotationCleanupPreview(studyId, plans);
}

export async function cleanupNavigoTestRotations(input: {
  actorUserId: string;
  studyId: string;
}, prismaClient?: RotationCleanupPrismaClient): Promise<NavigoRotationCleanupActionResult> {
  const prisma = prismaClient ?? ((await createPrismaClient()) as unknown as RotationCleanupPrismaClient);

  return prisma.$transaction(async (tx) => {
    const plans = await loadRotationCleanupPlans(tx, input.studyId);
    const preview = buildRotationCleanupPreview(input.studyId, plans);
    const blocked = preview.plans.filter((plan) => plan.isSuspectTestConfig && hasRealParticipantBlockReason(plan));

    if (blocked.length > 0) {
      return {
        message: `No se limpiaron rotaciones porque hay participantes reales asociados: ${blocked.map((plan) => plan.rotationCode).join(", ")}.`,
        ok: false
      };
    }

    if (preview.deleteablePlanIds.length === 0) {
      return {
        message: "No hay rotaciones de prueba seguras para limpiar.",
        ok: false
      };
    }

    const legacyQaParticipantIds = Array.from(new Set(preview.legacyQaParticipants.map((participant) => participant.studyParticipantId)));
    const rotationAssignmentIds = plans
      .filter((plan) => preview.deleteablePlanIds.includes(plan.id))
      .flatMap((plan) => plan.assignments.map((assignment) => assignment.id));
    const deleted: Record<string, number> = {};

    for (const studyParticipantId of legacyQaParticipantIds) {
      await cleanupLegacyQaStudyParticipant(tx, deleted, studyParticipantId);
    }

    incrementDeleted(deleted, "participantArmAssignment", (await tx.participantArmAssignment.deleteMany?.({
      where: {
        participantRotationAssignmentId: { in: rotationAssignmentIds }
      }
    }))?.count ?? 0);
    incrementDeleted(deleted, "participantRotationAssignment", (await tx.participantRotationAssignment.deleteMany?.({
      where: { rotationPlanId: { in: preview.deleteablePlanIds } }
    }))?.count ?? 0);
    incrementDeleted(deleted, "rotationPlanArm", (await tx.rotationPlanArm.deleteMany?.({
      where: { rotationPlanId: { in: preview.deleteablePlanIds } }
    }))?.count ?? 0);
    incrementDeleted(deleted, "rotationPlan", (await tx.rotationPlan.deleteMany?.({
      where: { id: { in: preview.deleteablePlanIds } }
    }))?.count ?? 0);

    const report: NavigoRotationCleanupReport = {
      cleanedAt: new Date().toISOString(),
      cleanedByUserId: input.actorUserId,
      deleted,
      legacyQaParticipants: preview.legacyQaParticipants,
      plans: preview.plans.filter((plan) => preview.deleteablePlanIds.includes(plan.id)),
      studyId: input.studyId
    };

    await tx.qaParticipantRun.create?.({
      data: {
        cleanedAt: new Date(report.cleanedAt),
        cleanedByUserId: input.actorUserId,
        cleanupReportJson: report,
        createdByUserId: input.actorUserId,
        executionMode: "FAST_FORWARD",
        folio: "ROTATION_TEST_CLEANUP",
        reportJson: {
          preview,
          qa: true,
          source: "NAVIGO_TEST_ROTATION_CLEANUP"
        },
        scenario: "CLT_NAVIGO_HUT",
        status: "CLEANED",
        studyId: input.studyId
      }
    });

    return { data: report, ok: true };
  });
}

async function loadRotationCleanupPlans(
  prisma: RotationCleanupPrismaClient,
  studyId: string
): Promise<RotationPlanRecord[]> {
  return ((await prisma.rotationPlan.findMany?.({
    orderBy: { rotationCode: "asc" },
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          id: true,
          studyProduct: {
            select: { internalCode: true }
          }
        }
      },
      assignments: {
        select: {
          id: true,
          studyParticipant: {
            select: {
              id: true,
              participantConfirmation: {
                select: { folio: true }
              },
              participantProfile: {
                select: { name: true }
              },
              qaParticipantRun: {
                select: { id: true }
              }
            }
          },
          studyParticipantId: true
        }
      },
      id: true,
      name: true,
      rotationCode: true,
      status: true
    },
    where: { studyId }
  })) ?? []) as RotationPlanRecord[];
}

function buildRotationCleanupPreview(
  studyId: string,
  plans: RotationPlanRecord[]
): NavigoRotationCleanupPreview {
  const previewPlans = plans.map(toRotationCleanupPlanPreview);
  const deleteablePlanIds = previewPlans
    .filter((plan) => plan.isSuspectTestConfig && !plan.isOfficialRotation && plan.blockReasons.length === 0)
    .map((plan) => plan.id);
  const legacyQaParticipants = previewPlans
    .filter((plan) => deleteablePlanIds.includes(plan.id))
    .flatMap((plan) =>
      plan.assignedParticipants
        .filter(isLegacyQaParticipant)
        .map((participant) => ({
          folio: participant.folio!,
          name: participant.name,
          rotationCode: plan.rotationCode,
          studyParticipantId: participant.studyParticipantId
        }))
    );
  const blockedRealParticipants = previewPlans
    .filter((plan) => plan.isSuspectTestConfig && !plan.isOfficialRotation)
    .flatMap((plan) =>
      plan.assignedParticipants
        .filter((participant) => !participant.isAuthorizedTestFolio && !participant.isQaRun)
        .map((participant) => ({
          folio: participant.folio,
          name: participant.name,
          rotationCode: plan.rotationCode,
          studyParticipantId: participant.studyParticipantId
        }))
    );

  return {
    authorizedTestFolios: [...AUTHORIZED_TEST_FOLIOS],
    blockedRealParticipants,
    deleteablePlanIds,
    legacyQaParticipants,
    officialPlanIds: previewPlans.filter((plan) => plan.isOfficialRotation).map((plan) => plan.id),
    plans: previewPlans,
    studyId,
    suspectRotationCodes: [...SUSPECT_ROTATION_CODES]
  };
}

function toRotationCleanupPlanPreview(plan: RotationPlanRecord): NavigoRotationCleanupPlanPreview {
  const orderedArms = [...plan.arms].sort((left, right) => left.applicationOrder - right.applicationOrder);
  const pair = orderedArms.map((arm) => normalizeRotationCleanupCode(arm.studyProduct.internalCode)).join("->");
  const expectedOfficialPair = getOfficialRotationPair(plan);
  const isOfficialRotation = Boolean(expectedOfficialPair && expectedOfficialPair === pair);
  const isSuspectTestConfig = isSuspectRotationPlan(plan);
  const assignedParticipants = plan.assignments.map((assignment) => {
    const folio = normalizeRotationCleanupCode(assignment.studyParticipant.participantConfirmation?.folio);
    return {
      folio: folio || null,
      isAuthorizedTestFolio: Boolean(folio && AUTHORIZED_TEST_FOLIOS.includes(folio as typeof AUTHORIZED_TEST_FOLIOS[number])),
      isQaRun: Boolean(assignment.studyParticipant.qaParticipantRun),
      name: assignment.studyParticipant.participantProfile?.name ?? null,
      studyParticipantId: assignment.studyParticipantId
    };
  });
  const realParticipants = assignedParticipants.filter((participant) => !participant.isAuthorizedTestFolio && !participant.isQaRun);
  const blockReasons: string[] = [];

  if (isOfficialRotation) {
    blockReasons.push("Oficial real protegido.");
  }
  if (realParticipants.length > 0) {
    blockReasons.push(`Tiene participantes reales asociados: ${realParticipants.map((participant) => participant.folio ?? participant.studyParticipantId).join(", ")}.`);
  }

  return {
    assignedParticipants,
    arms: orderedArms.map((arm) => ({
      applicationOrder: arm.applicationOrder,
      sampleKey: arm.studyProduct.internalCode
    })),
    blockReasons,
    id: plan.id,
    isOfficialRotation,
    isSuspectTestConfig,
    name: plan.name,
    relationCounts: {
      participantArmAssignments: assignedParticipants.length * Math.max(orderedArms.length, 1),
      participantRotationAssignments: plan.assignments.length,
      rotationPlanArms: plan.arms.length
    },
    rotationCode: plan.rotationCode
  };
}

function isSuspectRotationPlan(plan: RotationPlanRecord): boolean {
  const code = normalizeRotationCleanupCode(plan.rotationCode);
  const name = normalizeRotationCleanupCode(plan.name);
  const armCodes = plan.arms.map((arm) => normalizeRotationCleanupCode(arm.studyProduct.internalCode));

  return SUSPECT_ROTATION_CODES.some((target) =>
    code === target ||
    name === target ||
    code.startsWith(`${target}__`) ||
    name.startsWith(`${target}__`) ||
    armCodes.includes(target)
  );
}

function normalizeRotationCleanupCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeOfficialRotationLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function getOfficialRotationPair(plan: Pick<RotationPlanRecord, "name" | "rotationCode">): string | null {
  const candidates = [plan.rotationCode, plan.name].map(normalizeOfficialRotationLabel);
  for (const candidate of candidates) {
    const pair = OFFICIAL_ROTATION_PLAN_PAIRS.get(candidate);
    if (pair) {
      return pair;
    }
  }
  return null;
}

async function cleanupLegacyQaStudyParticipant(
  tx: RotationCleanupPrismaClient,
  deleted: Record<string, number>,
  studyParticipantId: string
): Promise<void> {
  await deleteMany(tx.ctlAnswer, deleted, "ctlAnswer", { ctlSession: { studyParticipantId } });
  await deleteMany(tx.ctlPhaseProgress, deleted, "ctlPhaseProgress", { ctlSession: { studyParticipantId } });
  await deleteMany(tx.ctlSession, deleted, "ctlSession", { studyParticipantId });
  await deleteMany(tx.ctlTriangularRotationAssignment, deleted, "ctlTriangularRotationAssignment", { studyParticipantId });

  await deleteMany(tx.researchResponse, deleted, "researchResponse", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.mediaEvidencePlaceholder, deleted, "mediaEvidencePlaceholder", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.participantActivityEvidence, deleted, "participantActivityEvidence", { studyParticipantId });
  await deleteMany(tx.reminderLog, deleted, "reminderLog", { participantActivity: { studyParticipantId } });
  await deleteMany(tx.participantActivity, deleted, "participantActivity", { studyParticipantId });
  await deleteMany(tx.participantAttributeOrder, deleted, "participantAttributeOrder", { studyParticipantId });
  await deleteMany(tx.applicationTimeEvent, deleted, "applicationTimeEvent", { studyParticipantId });
  await deleteMany(tx.participantAccessToken, deleted, "participantAccessToken", { studyParticipantId });

  await deleteMany(tx.participantArmAssignment, deleted, "participantArmAssignment", { studyParticipantId });
  await deleteMany(tx.participantRotationAssignment, deleted, "participantRotationAssignment", { studyParticipantId });

  await deleteMany(tx.participantConsent, deleted, "participantConsent", { studyParticipantId });
  await deleteMany(tx.participantEvidence, deleted, "participantEvidence", { studyParticipantId });
  await deleteMany(tx.participantScreeningReview, deleted, "participantScreeningReview", { studyParticipantId });
  await deleteMany(tx.screeningAnswer, deleted, "screeningAnswer", { screeningAttempt: { studyParticipantId } });
  await deleteMany(tx.participantReferenceCode, deleted, "participantReferenceCode", { confirmation: { studyParticipantId } });
  await deleteMany(tx.participantConfirmation, deleted, "participantConfirmation", { studyParticipantId });
  await deleteMany(tx.screeningAttempt, deleted, "screeningAttempt", { studyParticipantId });
  await deleteMany(tx.quotaEvaluation, deleted, "quotaEvaluation", { studyParticipantId });
  await deleteMany(tx.oneuiWhatsAppMessage, deleted, "oneuiWhatsAppMessage", {
    conversation: {
      linkedParticipantId: studyParticipantId,
      sourceModule: "NAVIGO"
    }
  });
  await deleteMany(tx.studyParticipant, deleted, "studyParticipant", { id: studyParticipantId });
}

async function deleteMany(
  delegate: Delegate,
  deleted: Record<string, number>,
  modelName: string,
  where: unknown
): Promise<void> {
  const count = (await delegate.deleteMany?.({ where }))?.count ?? 0;
  incrementDeleted(deleted, modelName, count);
}

function incrementDeleted(deleted: Record<string, number>, modelName: string, count: number): void {
  deleted[modelName] = (deleted[modelName] ?? 0) + count;
}

function isLegacyQaParticipant(participant: NavigoRotationCleanupPlanPreview["assignedParticipants"][number]): boolean {
  return Boolean(
    participant.folio &&
      AUTHORIZED_LEGACY_QA_PARTICIPANT_FOLIOS.includes(participant.folio as typeof AUTHORIZED_LEGACY_QA_PARTICIPANT_FOLIOS[number])
  );
}

function hasRealParticipantBlockReason(plan: NavigoRotationCleanupPlanPreview): boolean {
  return plan.blockReasons.some((reason) => reason.includes("participantes reales"));
}
