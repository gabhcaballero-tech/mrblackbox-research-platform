import { describe, expect, it } from "vitest";
import {
  cleanupNavigoTestRotations,
  previewNavigoTestRotationCleanup
} from "./rotation-cleanup";

describe("Navigo test rotation cleanup", () => {
  it("preserves official 247/583 rotation plans", async () => {
    const prisma = createRotationCleanupPrisma();
    prisma.seedPlan({
      arms: ["247", "583"],
      id: "official-1",
      rotationCode: "ROTACION_1"
    });

    const preview = await previewNavigoTestRotationCleanup("study-1", prisma as never);

    expect(preview.officialPlanIds).toEqual(["official-1"]);
    expect(preview.deleteablePlanIds).toEqual([]);
  });

  it("blocks suspect cleanup when a real participant is associated", async () => {
    const prisma = createRotationCleanupPrisma();
    prisma.seedPlan({
      arms: ["AAA", "BBB"],
      assignments: [
        {
          folio: "NAV-999",
          id: "assignment-real",
          name: "Participante real",
          qa: false,
          studyParticipantId: "participant-real"
        }
      ],
      id: "plan-test",
      rotationCode: "NAV-001__AAA__BBB"
    });

    const result = await cleanupNavigoTestRotations({
      actorUserId: "admin-1",
      studyId: "study-1"
    }, prisma as never);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("NAV-001__AAA__BBB");
    expect(prisma.calls).not.toContainEqual(expect.objectContaining({ operation: "deleteMany" }));
  });

  it("cleans only safe test rotation plans and stores a report", async () => {
    const prisma = createRotationCleanupPrisma();
    prisma.seedPlan({
      arms: ["AAA", "BBB"],
      assignments: [
        {
          folio: "NAV-106",
          id: "assignment-test",
          name: "Prueba antigua",
          qa: false,
          studyParticipantId: "participant-test"
        }
      ],
      id: "plan-test",
      rotationCode: "NAV-106__AAA__BBB"
    });
    prisma.seedPlan({
      arms: ["247", "583"],
      id: "official-1",
      rotationCode: "ROTACION_1"
    });

    const result = await cleanupNavigoTestRotations({
      actorUserId: "admin-1",
      studyId: "study-1"
    }, prisma as never);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.deleted : null).toMatchObject({
      participantArmAssignment: 1,
      participantConfirmation: 1,
      participantRotationAssignment: 1,
      rotationPlan: 1,
      rotationPlanArm: 2
    });
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "rotationPlan",
        operation: "deleteMany",
        where: { id: { in: ["plan-test"] } }
      })
    );
    expect(prisma.calls).toContainEqual(
      expect.objectContaining({
        modelName: "oneuiWhatsAppMessage",
        operation: "deleteMany",
        where: {
          conversation: {
            linkedParticipantId: "participant-test",
            sourceModule: "NAVIGO"
          }
        }
      })
    );
    expect(prisma.createdReports).toHaveLength(1);
    expect(prisma.createdReports[0]?.cleanupReportJson).toMatchObject({
      plans: [expect.objectContaining({ rotationCode: "NAV-106__AAA__BBB" })],
      studyId: "study-1"
    });
  });

  it("shows inherited QA participants and real blocked participants in preview", async () => {
    const prisma = createRotationCleanupPrisma();
    prisma.seedPlan({
      arms: ["AAA", "BBB"],
      assignments: [
        {
          folio: "NAV-104",
          id: "assignment-legacy-qa",
          name: "Prueba NAV-104",
          qa: false,
          studyParticipantId: "participant-legacy"
        }
      ],
      id: "plan-legacy",
      rotationCode: "NAV-104__AAA__BBB"
    });
    prisma.seedPlan({
      arms: ["CCC", "DDD"],
      assignments: [
        {
          folio: "NAV-999",
          id: "assignment-real",
          name: "Participante real",
          qa: false,
          studyParticipantId: "participant-real"
        }
      ],
      id: "plan-real",
      rotationCode: "NAV-106__CCC__DDD"
    });

    const preview = await previewNavigoTestRotationCleanup("study-1", prisma as never);

    expect(preview.deleteablePlanIds).toEqual(["plan-legacy"]);
    expect(preview.legacyQaParticipants).toEqual([
      {
        folio: "NAV-104",
        name: "Prueba NAV-104",
        rotationCode: "NAV-104__AAA__BBB",
        studyParticipantId: "participant-legacy"
      }
    ]);
    expect(preview.blockedRealParticipants).toEqual([
      {
        folio: "NAV-999",
        name: "Participante real",
        rotationCode: "NAV-106__CCC__DDD",
        studyParticipantId: "participant-real"
      }
    ]);
  });
});

type FakeRotationPlan = {
  arms: Array<{
    applicationOrder: number;
    id: string;
    studyProduct: { internalCode: string };
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

type FakeAssignmentInput = {
  folio: string | null;
  id: string;
  name: string | null;
  qa: boolean;
  studyParticipantId: string;
};

function createRotationCleanupPrisma() {
  const plans: FakeRotationPlan[] = [];
  const calls: Array<{ modelName: string; operation: string; where: unknown }> = [];
  const createdReports: Array<{ cleanupReportJson: unknown }> = [];

  type FakeRotationCleanupPrisma = {
    $transaction: <T>(callback: (tx: FakeRotationCleanupPrisma) => Promise<T>) => Promise<T>;
    calls: typeof calls;
    createdReports: typeof createdReports;
    applicationTimeEvent: ReturnType<typeof deleteDelegate>;
    ctlAnswer: ReturnType<typeof deleteDelegate>;
    ctlPhaseProgress: ReturnType<typeof deleteDelegate>;
    ctlSession: ReturnType<typeof deleteDelegate>;
    ctlTriangularRotationAssignment: ReturnType<typeof deleteDelegate>;
    mediaEvidencePlaceholder: ReturnType<typeof deleteDelegate>;
    oneuiWhatsAppMessage: ReturnType<typeof deleteDelegate>;
    participantAccessToken: ReturnType<typeof deleteDelegate>;
    participantArmAssignment: ReturnType<typeof deleteDelegate>;
    participantActivity: ReturnType<typeof deleteDelegate>;
    participantActivityEvidence: ReturnType<typeof deleteDelegate>;
    participantAttributeOrder: ReturnType<typeof deleteDelegate>;
    participantConfirmation: ReturnType<typeof deleteDelegate>;
    participantConsent: ReturnType<typeof deleteDelegate>;
    participantEvidence: ReturnType<typeof deleteDelegate>;
    participantReferenceCode: ReturnType<typeof deleteDelegate>;
    participantRotationAssignment: ReturnType<typeof deleteDelegate>;
    participantScreeningReview: ReturnType<typeof deleteDelegate>;
    qaParticipantRun: {
      create: (args: { data: { cleanupReportJson: unknown } }) => Promise<{ cleanupReportJson: unknown }>;
    };
    quotaEvaluation: ReturnType<typeof deleteDelegate>;
    reminderLog: ReturnType<typeof deleteDelegate>;
    researchResponse: ReturnType<typeof deleteDelegate>;
    rotationPlan: {
      deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>;
      findMany: () => Promise<FakeRotationPlan[]>;
    };
    rotationPlanArm: ReturnType<typeof deleteDelegate>;
    screeningAnswer: ReturnType<typeof deleteDelegate>;
    screeningAttempt: ReturnType<typeof deleteDelegate>;
    seedPlan: (input: {
      arms: string[];
      assignments?: FakeAssignmentInput[];
      id: string;
      rotationCode: string;
    }) => void;
    studyParticipant: ReturnType<typeof deleteDelegate>;
  };

  const prisma: FakeRotationCleanupPrisma = {
    calls,
    createdReports,
    seedPlan(input: {
      arms: string[];
      assignments?: FakeAssignmentInput[];
      id: string;
      rotationCode: string;
    }) {
      plans.push({
        arms: input.arms.map((sampleKey, index) => ({
          applicationOrder: index + 1,
          id: `${input.id}-arm-${index + 1}`,
          studyProduct: { internalCode: sampleKey }
        })),
        assignments: (input.assignments ?? []).map((assignment) => ({
          id: assignment.id,
          studyParticipant: {
            id: assignment.studyParticipantId,
            participantConfirmation: { folio: assignment.folio },
            participantProfile: { name: assignment.name },
            qaParticipantRun: assignment.qa ? { id: `qa-${assignment.studyParticipantId}` } : null
          },
          studyParticipantId: assignment.studyParticipantId
        })),
        id: input.id,
        name: input.rotationCode,
        rotationCode: input.rotationCode,
        status: "ACTIVE"
      });
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma),
    applicationTimeEvent: deleteDelegate("applicationTimeEvent", calls, () => 0),
    ctlAnswer: deleteDelegate("ctlAnswer", calls, () => 0),
    ctlPhaseProgress: deleteDelegate("ctlPhaseProgress", calls, () => 0),
    ctlSession: deleteDelegate("ctlSession", calls, () => 0),
    ctlTriangularRotationAssignment: deleteDelegate("ctlTriangularRotationAssignment", calls, () => 0),
    mediaEvidencePlaceholder: deleteDelegate("mediaEvidencePlaceholder", calls, () => 0),
    oneuiWhatsAppMessage: deleteDelegate("oneuiWhatsAppMessage", calls, () => 0),
    participantAccessToken: deleteDelegate("participantAccessToken", calls, () => 1),
    participantArmAssignment: deleteDelegate("participantArmAssignment", calls, (where) =>
      "studyParticipantId" in (where as Record<string, unknown>) ? 1 : 0
    ),
    participantActivity: deleteDelegate("participantActivity", calls, () => 1),
    participantActivityEvidence: deleteDelegate("participantActivityEvidence", calls, () => 0),
    participantAttributeOrder: deleteDelegate("participantAttributeOrder", calls, () => 0),
    participantConfirmation: deleteDelegate("participantConfirmation", calls, () => 1),
    participantConsent: deleteDelegate("participantConsent", calls, () => 0),
    participantEvidence: deleteDelegate("participantEvidence", calls, () => 0),
    participantReferenceCode: deleteDelegate("participantReferenceCode", calls, () => 3),
    participantRotationAssignment: deleteDelegate("participantRotationAssignment", calls, (where) =>
      "studyParticipantId" in (where as Record<string, unknown>) ? 1 : 0
    ),
    participantScreeningReview: deleteDelegate("participantScreeningReview", calls, () => 0),
    qaParticipantRun: {
      create: async (args: { data: { cleanupReportJson: unknown } }) => {
        createdReports.push(args.data);
        return args.data;
      }
    },
    quotaEvaluation: deleteDelegate("quotaEvaluation", calls, () => 0),
    reminderLog: deleteDelegate("reminderLog", calls, () => 0),
    researchResponse: deleteDelegate("researchResponse", calls, () => 0),
    rotationPlan: {
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        calls.push({ modelName: "rotationPlan", operation: "deleteMany", where: args.where });
        return { count: args.where.id.in.length };
      },
      findMany: async () => plans
    },
    rotationPlanArm: deleteDelegate("rotationPlanArm", calls, (where) =>
      plans
        .filter((plan) => (where as { rotationPlanId: { in: string[] } }).rotationPlanId.in.includes(plan.id))
        .reduce((total, plan) => total + plan.arms.length, 0)
    ),
    screeningAnswer: deleteDelegate("screeningAnswer", calls, () => 1),
    screeningAttempt: deleteDelegate("screeningAttempt", calls, () => 1),
    studyParticipant: deleteDelegate("studyParticipant", calls, () => 1)
  };

  return prisma;
}

function deleteDelegate(
  modelName: string,
  calls: Array<{ modelName: string; operation: string; where: unknown }>,
  count: (where: unknown) => number
) {
  return {
    deleteMany: async (args: { where: unknown }) => {
      calls.push({ modelName, operation: "deleteMany", where: args.where });
      return { count: count(args.where) };
    }
  };
}
