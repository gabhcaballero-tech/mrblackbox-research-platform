import { createCltOperationsRepository } from "@/modules/clt-operations";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { FieldOperationsDashboard, FieldOperationsStudy } from "./types";

type Delegate = {
  findMany?: (args: unknown) => Promise<unknown[]>;
};

type FieldOperationsPrismaClient = PrismaClientLike & {
  study: Delegate;
};

export type FieldOperationsRepository = {
  getDashboard: (input: {
    actorName: string;
    detailSessionId?: string | null;
    interviewerUserId: string;
    studyId?: string | null;
  }) => Promise<FieldOperationsDashboard>;
};

export function createFieldOperationsRepository(
  prismaClient?: FieldOperationsPrismaClient
): FieldOperationsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as FieldOperationsPrismaClient);
  }

  return {
    async getDashboard(input) {
      const prisma = await getPrisma();
      const studies = await listInterviewerStudies(prisma, input.interviewerUserId);
      const selectedStudyId = input.studyId && studies.some((study) => study.id === input.studyId)
        ? input.studyId
        : studies[0]?.id ?? null;
      const dashboard = selectedStudyId
        ? await createCltOperationsRepository(prisma as never).getDashboard({
            detailSessionId: input.detailSessionId,
            interviewerUserId: input.interviewerUserId,
            studyId: selectedStudyId
          })
        : null;

      return {
        actorName: input.actorName,
        detail: dashboard?.detail ?? null,
        participants: dashboard?.participants ?? [],
        selectedStudyId,
        studies
      };
    }
  };
}

async function listInterviewerStudies(
  prisma: FieldOperationsPrismaClient,
  interviewerUserId: string
): Promise<FieldOperationsStudy[]> {
  const studies = await prisma.study.findMany?.({
    orderBy: { name: "asc" },
    select: {
      code: true,
      id: true,
      name: true,
      timeZoneIana: true
    },
    where: {
      ctlSessions: {
        some: {
          interviewerId: interviewerUserId,
          studyParticipant: {
            qaParticipantRun: { is: null }
          }
        }
      }
    }
  }) as FieldOperationsStudy[] | undefined;

  return studies ?? [];
}
