import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type StudyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type StudyListItem = {
  id: string;
  code: string;
  name: string;
  status: StudyStatus;
  timeZoneIana: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateStudyRecordInput = {
  code: string;
  name: string;
  timeZoneIana: string;
  createdByUserId: string;
  status: "DRAFT";
};

export type UpdateDraftStudyRecordInput = {
  id: string;
  code: string;
  name: string;
  timeZoneIana: string;
};

export type StudyEditState = {
  id: string;
  status: StudyStatus;
} | null;

export type StudyActivationState = {
  id: string;
  questionnaireVersions: Array<{
    definitionJson: unknown;
    id: string;
  }>;
  status: StudyStatus;
} | null;

export type StudiesRepository = {
  listStudies: () => Promise<StudyListItem[]>;
  activateStudy: (id: string) => Promise<number>;
  createStudy: (input: CreateStudyRecordInput) => Promise<StudyListItem>;
  findStudyActivationState: (id: string) => Promise<StudyActivationState>;
  updateDraftStudy: (input: UpdateDraftStudyRecordInput) => Promise<number>;
  findStudyEditState: (id: string) => Promise<StudyEditState>;
};

type StudyDelegate = {
  findMany: (args: {
    orderBy: { createdAt: "desc" };
    select: StudySelect;
  }) => Promise<StudyListItem[]>;
  create: (args: {
    data: CreateStudyRecordInput;
    select: StudySelect;
  }) => Promise<StudyListItem>;
  findFirst: (args: unknown) => Promise<StudyActivationState>;
  updateMany: (args: {
    where: { id: string; status: "DRAFT" };
    data:
      | {
          code: string;
          name: string;
          timeZoneIana: string;
        }
      | {
          status: "ACTIVE";
        };
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: { id: string };
    select: { id: true; status: true };
  }) => Promise<StudyEditState>;
};

type StudyPrismaClient = PrismaClientLike & {
  study: StudyDelegate;
};

const studySelect = {
  code: true,
  createdAt: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true,
  updatedAt: true
} as const;

type StudySelect = typeof studySelect;

export function sortStudiesByCreatedAtDescending(studies: StudyListItem[]): StudyListItem[] {
  return [...studies].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function createStudiesRepository(prismaClient?: StudyPrismaClient): StudiesRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as StudyPrismaClient);
  }

  return {
    async activateStudy(id) {
      const prisma = await getPrisma();
      const result = await prisma.study.updateMany({
        data: {
          status: "ACTIVE"
        },
        where: {
          id,
          status: "DRAFT"
        }
      });

      return result.count;
    },
    async createStudy(input) {
      const prisma = await getPrisma();

      return prisma.study.create({
        data: input,
        select: studySelect
      });
    },
    async findStudyEditState(id) {
      const prisma = await getPrisma();

      return prisma.study.findUnique({
        select: {
          id: true,
          status: true
        },
        where: { id }
      });
    },
    async findStudyActivationState(id) {
      const prisma = await getPrisma();

      return prisma.study.findFirst({
        select: {
          id: true,
          questionnaireVersions: {
            orderBy: { versionNumber: "desc" },
            select: {
              definitionJson: true,
              id: true
            },
            take: 1,
            where: {
              questionnaireDraft: {
                purpose: "SCREENER"
              },
              status: "ACTIVE"
            }
          },
          status: true
        },
        where: { id }
      });
    },
    async listStudies() {
      const prisma = await getPrisma();

      return prisma.study.findMany({
        orderBy: { createdAt: "desc" },
        select: studySelect
      });
    },
    async updateDraftStudy(input) {
      const prisma = await getPrisma();
      const { id, ...data } = input;
      const result = await prisma.study.updateMany({
        data,
        where: {
          id,
          status: "DRAFT"
        }
      });

      return result.count;
    }
  };
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
