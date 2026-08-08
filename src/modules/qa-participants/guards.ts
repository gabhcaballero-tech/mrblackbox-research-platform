import { createPrismaClient } from "@/shared/db/client";

type QaGuardPrismaClient = {
  qaParticipantRun: {
    findUnique?: (args: unknown) => Promise<{ id: string } | null>;
  };
};

export async function isQaStudyParticipant(studyParticipantId: string, prismaClient?: QaGuardPrismaClient): Promise<boolean> {
  try {
    const prisma = prismaClient ?? ((await createPrismaClient()) as unknown as QaGuardPrismaClient);
    const run = await prisma.qaParticipantRun.findUnique?.({
      select: { id: true },
      where: { studyParticipantId }
    });

    return Boolean(run);
  } catch {
    return false;
  }
}
