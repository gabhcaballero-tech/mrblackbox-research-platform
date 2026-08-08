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
    expect(prisma.createdReports).toHaveLength(1);
    expect(prisma.createdReports[0]?.cleanupReportJson).toMatchObject({
      plans: [expect.objectContaining({ rotationCode: "NAV-106__AAA__BBB" })],
      studyId: "study-1"
    });
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
    participantArmAssignment: ReturnType<typeof deleteDelegate>;
    participantRotationAssignment: ReturnType<typeof deleteDelegate>;
    qaParticipantRun: {
      create: (args: { data: { cleanupReportJson: unknown } }) => Promise<{ cleanupReportJson: unknown }>;
    };
    rotationPlan: {
      deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>;
      findMany: () => Promise<FakeRotationPlan[]>;
    };
    rotationPlanArm: ReturnType<typeof deleteDelegate>;
    seedPlan: (input: {
      arms: string[];
      assignments?: FakeAssignmentInput[];
      id: string;
      rotationCode: string;
    }) => void;
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
    participantArmAssignment: deleteDelegate("participantArmAssignment", calls, () => 1),
    participantRotationAssignment: deleteDelegate("participantRotationAssignment", calls, () => 1),
    qaParticipantRun: {
      create: async (args: { data: { cleanupReportJson: unknown } }) => {
        createdReports.push(args.data);
        return args.data;
      }
    },
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
    )
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
