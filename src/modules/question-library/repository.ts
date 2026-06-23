import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { ScreenerDefinition } from "@/modules/screener";
import type { ScreenerDraftRecord, ScreenerStudySummary } from "@/modules/screener/repository";
import type {
  LibraryContent,
  LibraryItemScope,
  LibraryItemType,
  LibraryRevisionStatus
} from "./definition";

export type LibraryItemStatus = "ACTIVE" | "ARCHIVED" | "INACTIVE";

export type LibraryItemRecord = {
  category: string | null;
  createdAt: Date;
  createdByUserId: string;
  description: string | null;
  id: string;
  name: string;
  scope: LibraryItemScope;
  status: LibraryItemStatus;
  studyId: string | null;
  tags: string[];
  type: LibraryItemType;
  updatedAt: Date;
};

export type LibraryRevisionRecord = {
  contentHash: string | null;
  contentJson: unknown;
  createdAt: Date;
  createdByUserId: string;
  id: string;
  libraryItemId: string;
  retiredAt: Date | null;
  retiredByUserId: string | null;
  revisionNumber: number;
  status: LibraryRevisionStatus;
};

export type LibraryItemWithRevisions = LibraryItemRecord & {
  revisions: LibraryRevisionRecord[];
};

export type LibrarySearchFilters = {
  category?: string;
  query?: string;
  scope?: LibraryItemScope;
  showForStudyId?: string;
  tag?: string;
  type?: LibraryItemType;
};

export type CreateLibraryItemWithRevisionInput = {
  category?: string;
  contentHash: string;
  contentJson: LibraryContent;
  createdByUserId: string;
  description?: string;
  name: string;
  scope: LibraryItemScope;
  studyId: string | null;
  tags: string[];
  type: LibraryItemType;
};

export type CreateLibraryRevisionInput = {
  contentHash: string;
  contentJson: LibraryContent;
  createdByUserId: string;
  libraryItemId: string;
};

export type RetireLibraryRevisionInput = {
  retiredByUserId: string;
  revisionId: string;
};

export type RecordQuestionnaireDraftLibraryUseInput = {
  idMapJson: unknown;
  insertedByUserId: string;
  insertedContentHash: string;
  libraryItemRevisionId: string;
  questionnaireDraftId: string;
};

export type InsertLibraryRevisionFailureReason =
  | "CROSS_STUDY"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_UPDATE_FAILED"
  | "REVISION_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
  | "STUDY_NOT_FOUND";

export type InsertLibraryRevisionBuildInput = {
  draft: ScreenerDraftRecord;
  item: LibraryItemRecord;
  revision: LibraryRevisionRecord;
  study: ScreenerStudySummary;
};

export type InsertLibraryRevisionBuildResult<TPayload> = {
  definitionJson: ScreenerDefinition;
  idMapJson: unknown;
  insertedContentHash: string;
  name: string;
  payload: TPayload;
};

export type InsertLibraryRevisionIntoDraftInput<TPayload> = {
  buildDraftUpdate: (
    input: InsertLibraryRevisionBuildInput
  ) => InsertLibraryRevisionBuildResult<TPayload>;
  insertedByUserId: string;
  revisionId: string;
  studyId: string;
};

export type InsertLibraryRevisionIntoDraftResult<TPayload> =
  | {
      ok: true;
      payload: TPayload;
    }
  | {
      ok: false;
      reason: InsertLibraryRevisionFailureReason;
    };

export type QuestionLibraryRepository = {
  createItemWithRevision: (
    input: CreateLibraryItemWithRevisionInput
  ) => Promise<{ item: LibraryItemRecord; revision: LibraryRevisionRecord }>;
  createRevision: (input: CreateLibraryRevisionInput) => Promise<LibraryRevisionRecord>;
  getItemById: (itemId: string) => Promise<LibraryItemWithRevisions | null>;
  getRevisionWithItem: (
    revisionId: string
  ) => Promise<{ item: LibraryItemRecord; revision: LibraryRevisionRecord } | null>;
  insertRevisionIntoDraft: <TPayload>(
    input: InsertLibraryRevisionIntoDraftInput<TPayload>
  ) => Promise<InsertLibraryRevisionIntoDraftResult<TPayload>>;
  listItems: (filters: LibrarySearchFilters) => Promise<LibraryItemWithRevisions[]>;
  recordDraftUse: (input: RecordQuestionnaireDraftLibraryUseInput) => Promise<void>;
  retireRevision: (input: RetireLibraryRevisionInput) => Promise<number>;
};

type LibraryPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: LibraryTransactionClient) => Promise<T>) => Promise<T>;
  libraryItem: {
    findMany: (args: unknown) => Promise<LibraryItemWithRevisions[]>;
    findUnique: (args: unknown) => Promise<LibraryItemWithRevisions | null>;
  };
  libraryItemRevision: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  questionnaireDraftLibraryUse: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type LibraryTransactionClient = {
  libraryItem: {
    create: (args: unknown) => Promise<LibraryItemRecord>;
    findMany: (args: unknown) => Promise<LibraryItemWithRevisions[]>;
  };
  libraryItemRevision: {
    create: (args: unknown) => Promise<LibraryRevisionRecord>;
    findFirst: (args: unknown) => Promise<{ revisionNumber: number } | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  questionnaireDraft: {
    findFirst: (args: unknown) => Promise<ScreenerDraftRecord | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  questionnaireDraftLibraryUse: {
    create: (args: unknown) => Promise<unknown>;
  };
  study: {
    findUnique: (args: unknown) => Promise<ScreenerStudySummary | null>;
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

const itemSelect = {
  category: true,
  createdAt: true,
  createdByUserId: true,
  description: true,
  id: true,
  name: true,
  scope: true,
  status: true,
  studyId: true,
  tags: true,
  type: true,
  updatedAt: true
} as const;

const revisionSelect = {
  contentHash: true,
  contentJson: true,
  createdAt: true,
  createdByUserId: true,
  id: true,
  libraryItemId: true,
  retiredAt: true,
  retiredByUserId: true,
  revisionNumber: true,
  status: true
} as const;

export function createQuestionLibraryRepository(
  prismaClient?: LibraryPrismaClient
): QuestionLibraryRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as LibraryPrismaClient);
  }

  return {
    async createItemWithRevision(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        const item = await transaction.libraryItem.create({
          data: {
            category: input.category,
            createdByUserId: input.createdByUserId,
            description: input.description,
            name: input.name,
            scope: input.scope,
            status: "ACTIVE",
            studyId: input.studyId,
            tags: input.tags,
            type: input.type
          },
          select: itemSelect
        });
        const revision = await transaction.libraryItemRevision.create({
          data: {
            contentHash: input.contentHash,
            contentJson: input.contentJson,
            createdByUserId: input.createdByUserId,
            libraryItemId: item.id,
            revisionNumber: 1,
            status: "ACTIVE"
          },
          select: revisionSelect
        });

        return { item, revision };
      });
    },
    async createRevision(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        await transaction.libraryItemRevision.updateMany({
          data: {
            status: "SUPERSEDED"
          },
          where: {
            libraryItemId: input.libraryItemId,
            status: "ACTIVE"
          }
        });
        const latestRevision = await transaction.libraryItemRevision.findFirst({
          orderBy: { revisionNumber: "desc" },
          select: { revisionNumber: true },
          where: {
            libraryItemId: input.libraryItemId
          }
        });

        return transaction.libraryItemRevision.create({
          data: {
            contentHash: input.contentHash,
            contentJson: input.contentJson,
            createdByUserId: input.createdByUserId,
            libraryItemId: input.libraryItemId,
            revisionNumber: (latestRevision?.revisionNumber ?? 0) + 1,
            status: "ACTIVE"
          },
          select: revisionSelect
        });
      });
    },
    async getItemById(itemId) {
      const prisma = await getPrisma();

      return prisma.libraryItem.findUnique({
        select: {
          ...itemSelect,
          revisions: {
            orderBy: { revisionNumber: "desc" },
            select: revisionSelect
          }
        },
        where: { id: itemId }
      });
    },
    async getRevisionWithItem(revisionId) {
      const prisma = await getPrisma();
      const items = await prisma.libraryItem.findMany({
        select: {
          ...itemSelect,
          revisions: {
            select: revisionSelect,
            where: { id: revisionId }
          }
        },
        where: {
          revisions: {
            some: { id: revisionId }
          }
        }
      });
      const item = items[0];
      const revision = item?.revisions[0];

        return item && revision ? { item, revision } : null;
    },
    async insertRevisionIntoDraft(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        const study = await transaction.study.findUnique({
          select: studySelect,
          where: { id: input.studyId }
        });

        if (!study) {
          return { ok: false, reason: "STUDY_NOT_FOUND" } as const;
        }

        if (study.status !== "DRAFT") {
          return { ok: false, reason: "STUDY_NOT_DRAFT" } as const;
        }

        const draft = await transaction.questionnaireDraft.findFirst({
          orderBy: { createdAt: "asc" },
          select: draftSelect,
          where: {
            purpose: "SCREENER",
            studyId: input.studyId
          }
        });

        if (!draft) {
          return { ok: false, reason: "DRAFT_NOT_FOUND" } as const;
        }

        const items = await transaction.libraryItem.findMany({
          select: {
            ...itemSelect,
            revisions: {
              select: revisionSelect,
              where: { id: input.revisionId }
            }
          },
          where: {
            revisions: {
              some: { id: input.revisionId }
            }
          }
        });
        const item = items[0];
        const revision = item?.revisions[0];

        if (!item || !revision || revision.status !== "ACTIVE") {
          return { ok: false, reason: "REVISION_NOT_FOUND" } as const;
        }

        if (item.scope === "STUDY_SPECIFIC" && item.studyId !== input.studyId) {
          return { ok: false, reason: "CROSS_STUDY" } as const;
        }

        const built = input.buildDraftUpdate({
          draft,
          item,
          revision,
          study
        });
        const updated = await transaction.questionnaireDraft.updateMany({
          data: {
            definitionJson: built.definitionJson,
            name: built.name,
            status: "DRAFT",
            updatedByUserId: input.insertedByUserId
          },
          where: {
            id: draft.id,
            purpose: "SCREENER",
            studyId: input.studyId
          }
        });

        if (updated.count !== 1) {
          return { ok: false, reason: "DRAFT_UPDATE_FAILED" } as const;
        }

        await transaction.questionnaireDraftLibraryUse.create({
          data: {
            idMapJson: built.idMapJson,
            insertedByUserId: input.insertedByUserId,
            insertedContentHash: built.insertedContentHash,
            libraryItemRevisionId: input.revisionId,
            questionnaireDraftId: draft.id
          }
        });

        return {
          ok: true,
          payload: built.payload
        } as const;
      });
    },
    async listItems(filters) {
      const prisma = await getPrisma();
      const where: Record<string, unknown> = {
        status: "ACTIVE"
      };

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.scope) {
        where.scope = filters.scope;
      }

      if (filters.category) {
        where.category = {
          contains: filters.category,
          mode: "insensitive"
        };
      }

      if (filters.tag) {
        where.tags = {
          has: filters.tag
        };
      }

      if (filters.query) {
        where.OR = [
          {
            name: {
              contains: filters.query,
              mode: "insensitive"
            }
          },
          {
            description: {
              contains: filters.query,
              mode: "insensitive"
            }
          }
        ];
      }

      if (filters.showForStudyId && !filters.scope) {
        where.OR = [
          ...((where.OR as unknown[]) ?? []),
          { scope: "GENERIC" },
          { scope: "STUDY_SPECIFIC", studyId: filters.showForStudyId }
        ];
      }

      return prisma.libraryItem.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          ...itemSelect,
          revisions: {
            orderBy: { revisionNumber: "desc" },
            select: revisionSelect,
            where: {
              status: "ACTIVE"
            }
          }
        },
        where
      });
    },
    async recordDraftUse(input) {
      const prisma = await getPrisma();

      await prisma.questionnaireDraftLibraryUse.create({
        data: {
          idMapJson: input.idMapJson,
          insertedByUserId: input.insertedByUserId,
          insertedContentHash: input.insertedContentHash,
          libraryItemRevisionId: input.libraryItemRevisionId,
          questionnaireDraftId: input.questionnaireDraftId
        }
      });
    },
    async retireRevision(input) {
      const prisma = await getPrisma();
      const result = await prisma.libraryItemRevision.updateMany({
        data: {
          retiredAt: new Date(),
          retiredByUserId: input.retiredByUserId,
          status: "RETIRED"
        },
        where: {
          id: input.revisionId,
          status: {
            not: "RETIRED"
          }
        }
      });

      return result.count;
    }
  };
}
