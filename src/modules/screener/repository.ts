import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { ScreenerDefinition } from "./definition";

export type ScreenerStudyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type ScreenerVersionStatus = "ACTIVE" | "RETIRED";
export type ScreenerDraftStatus = "DRAFT" | "READY";

export type ScreenerStudySummary = {
  code: string;
  id: string;
  name: string;
  status: ScreenerStudyStatus;
  timeZoneIana: string;
};

export type ScreenerDraftRecord = {
  createdAt: Date;
  createdByUserId: string;
  definitionJson: unknown;
  id: string;
  name: string;
  purpose: "SCREENER";
  status: ScreenerDraftStatus;
  studyId: string;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type ScreenerVersionRecord = {
  definitionHash: string;
  definitionJson: unknown;
  id: string;
  publishedAt: Date;
  publishedByUserId: string;
  questionnaireDraftId: string;
  retiredAt: Date | null;
  retiredByUserId: string | null;
  status: ScreenerVersionStatus;
  studyId: string;
  versionNumber: number;
};

export type ScreenerBuilderData = {
  draft: ScreenerDraftRecord | null;
  study: ScreenerStudySummary;
  versions: ScreenerVersionRecord[];
};

export type CreateScreenerDraftInput = {
  createdByUserId: string;
  definitionJson: ScreenerDefinition;
  name: string;
  studyId: string;
};

export type UpdateScreenerDraftInput = {
  definitionJson: ScreenerDefinition;
  draftId: string;
  name: string;
  studyId: string;
  updatedByUserId: string;
};

export type PublishScreenerVersionInput = {
  definitionHash: string;
  definitionJson: ScreenerDefinition;
  draftId: string;
  publishedByUserId: string;
  studyId: string;
};

export type PublishScreenerVersionResult = {
  retiredCount: number;
  version: ScreenerVersionRecord;
};

export type RetireScreenerVersionInput = {
  retiredByUserId: string;
  studyId: string;
  versionId: string;
};

export type ScreenerRepository = {
  createDraft: (input: CreateScreenerDraftInput) => Promise<ScreenerDraftRecord>;
  getBuilderData: (studyId: string) => Promise<ScreenerBuilderData | null>;
  publishVersion: (input: PublishScreenerVersionInput) => Promise<PublishScreenerVersionResult>;
  retireVersion: (input: RetireScreenerVersionInput) => Promise<number>;
  updateDraft: (input: UpdateScreenerDraftInput) => Promise<number>;
};

type ScreenerPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: ScreenerTransactionClient) => Promise<T>) => Promise<T>;
  questionnaireDraft: {
    create: (args: unknown) => Promise<ScreenerDraftRecord>;
    findFirst: (args: unknown) => Promise<ScreenerDraftRecord | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  questionnaireVersion: {
    findMany: (args: unknown) => Promise<ScreenerVersionRecord[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  study: {
    findUnique: (args: unknown) => Promise<ScreenerStudySummary | null>;
  };
};

type ScreenerTransactionClient = {
  auditLog: {
    create: (args: unknown) => Promise<unknown>;
  };
  questionnaireVersion: {
    create: (args: unknown) => Promise<ScreenerVersionRecord>;
    findFirst: (args: unknown) => Promise<{ versionNumber: number } | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const draftSelect = {
  createdAt: true,
  createdByUserId: true,
  definitionJson: true,
  id: true,
  name: true,
  purpose: true,
  status: true,
  studyId: true,
  updatedAt: true,
  updatedByUserId: true
} as const;

const versionSelect = {
  definitionHash: true,
  definitionJson: true,
  id: true,
  publishedAt: true,
  publishedByUserId: true,
  questionnaireDraftId: true,
  retiredAt: true,
  retiredByUserId: true,
  status: true,
  studyId: true,
  versionNumber: true
} as const;

export function createScreenerRepository(prismaClient?: ScreenerPrismaClient): ScreenerRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ScreenerPrismaClient);
  }

  return {
    async createDraft(input) {
      const prisma = await getPrisma();

      return prisma.questionnaireDraft.create({
        data: {
          createdByUserId: input.createdByUserId,
          definitionJson: input.definitionJson,
          name: input.name,
          purpose: "SCREENER",
          status: "DRAFT",
          studyId: input.studyId,
          updatedByUserId: input.createdByUserId
        },
        select: draftSelect
      });
    },
    async getBuilderData(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: studySelect,
        where: { id: studyId }
      });

      if (!study) {
        return null;
      }

      const draft = await prisma.questionnaireDraft.findFirst({
        orderBy: { createdAt: "desc" },
        select: draftSelect,
        where: {
          purpose: "SCREENER",
          studyId
        }
      });
      const versions = await prisma.questionnaireVersion.findMany({
        orderBy: { versionNumber: "desc" },
        select: versionSelect,
        where: {
          questionnaireDraft: {
            purpose: "SCREENER"
          },
          studyId
        }
      });

      return {
        draft,
        study,
        versions
      };
    },
    async publishVersion(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        const latestVersion = await transaction.questionnaireVersion.findFirst({
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
          where: {
            questionnaireDraft: {
              purpose: "SCREENER"
            },
            studyId: input.studyId
          }
        });
        const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
        const now = new Date();
        const retired = await transaction.questionnaireVersion.updateMany({
          data: {
            retiredAt: now,
            retiredByUserId: input.publishedByUserId,
            status: "RETIRED"
          },
          where: {
            questionnaireDraft: {
              purpose: "SCREENER"
            },
            status: "ACTIVE",
            studyId: input.studyId
          }
        });
        const version = await transaction.questionnaireVersion.create({
          data: {
            definitionHash: input.definitionHash,
            definitionJson: input.definitionJson,
            publishedByUserId: input.publishedByUserId,
            questionnaireDraftId: input.draftId,
            status: "ACTIVE",
            studyId: input.studyId,
            versionNumber
          },
          select: versionSelect
        });

        if (retired.count > 0) {
          await transaction.auditLog.create({
            data: {
              action: "QUESTIONNAIRE_RETIRED",
              actorUserId: input.publishedByUserId,
              afterJson: {
                retiredCount: retired.count,
                replacedByVersionId: version.id
              },
              entityId: input.studyId,
              entityType: "Study"
            }
          });
        }

        await transaction.auditLog.create({
          data: {
            action: "QUESTIONNAIRE_PUBLISHED",
            actorUserId: input.publishedByUserId,
            afterJson: {
              definitionHash: input.definitionHash,
              questionnaireVersionId: version.id,
              versionNumber
            },
            entityId: version.id,
            entityType: "QuestionnaireVersion"
          }
        });

        return {
          retiredCount: retired.count,
          version
        };
      });
    },
    async retireVersion(input) {
      const prisma = await getPrisma();
      const result = await prisma.questionnaireVersion.updateMany({
        data: {
          retiredAt: new Date(),
          retiredByUserId: input.retiredByUserId,
          status: "RETIRED"
        },
        where: {
          id: input.versionId,
          questionnaireDraft: {
            purpose: "SCREENER"
          },
          status: "ACTIVE",
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async updateDraft(input) {
      const prisma = await getPrisma();
      const result = await prisma.questionnaireDraft.updateMany({
        data: {
          definitionJson: input.definitionJson,
          name: input.name,
          status: "DRAFT",
          updatedByUserId: input.updatedByUserId
        },
        where: {
          id: input.draftId,
          purpose: "SCREENER",
          studyId: input.studyId
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
