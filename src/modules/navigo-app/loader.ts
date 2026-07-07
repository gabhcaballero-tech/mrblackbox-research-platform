import {
  createNavigoMeasurementDefinition,
  createNavigoScheduleSeeds,
  hashNavigoMeasurementDefinition,
  NAVIGO_LEGACY_ACTIVITY_CODES,
  NAVIGO_MEASUREMENT_DRAFT_NAME,
  resolveNavigoTimeZone,
  type NavigoMeasurementDefinition,
  type NavigoScheduleSeed
} from "./definition";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export type NavigoFoundationResult =
  | {
      code: "STUDY_NOT_FOUND" | "UNEXPECTED_ERROR";
      message: string;
      ok: false;
    }
  | {
      data: {
        draftCreated: boolean;
        draftUpdated: boolean;
        questionnaireVersionCreated: boolean;
        questionnaireVersionId: string;
        questionnaireVersionReused: boolean;
        retiredVersionCount: number;
        scheduleCodes: string[];
        schedulesCreated: number;
        schedulesUpdated: number;
        studyCode: string;
        studyId: string;
        timeZoneIana: string;
      };
      ok: true;
    };

export type NavigoFoundationRepository = {
  ensureNavigoFoundation: (input: {
    actorUserId: string;
    definition: NavigoMeasurementDefinition;
    definitionHash: string;
    studyCode: string;
  }) => Promise<{
    draftCreated: boolean;
    draftUpdated: boolean;
    questionnaireVersionCreated: boolean;
    questionnaireVersionId: string;
    questionnaireVersionReused: boolean;
    retiredVersionCount: number;
    scheduleCodes: string[];
    schedulesCreated: number;
    schedulesUpdated: number;
    studyCode: string;
    studyId: string;
    timeZoneIana: string;
  } | null>;
};

type NavigoFoundationPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: NavigoFoundationTransaction) => Promise<T>) => Promise<T>;
};

type NavigoFoundationTransaction = {
  activitySchedule: {
    create: (args: unknown) => Promise<{ id: string }>;
    findMany: (args: unknown) => Promise<
      Array<{
        code: string | null;
        id: string;
        name: string;
        offsetMinutes: number;
        questionnaireVersionId: string | null;
        sortOrder: number;
        status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
        type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
        windowEndsMinutes: number;
        windowStartsMinutes: number;
      }>
    >;
    update: (args: unknown) => Promise<{ id: string }>;
  };
  questionnaireDraft: {
    create: (args: unknown) => Promise<{ id: string }>;
    findFirst: (args: unknown) => Promise<{ definitionJson: unknown; id: string; status: "DRAFT" | "READY" } | null>;
    update: (args: unknown) => Promise<{ id: string }>;
  };
  questionnaireVersion: {
    create: (args: unknown) => Promise<{ id: string }>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    findMany: (args: unknown) => Promise<Array<{ id: string; versionNumber: number }>>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  study: {
    findUnique: (args: unknown) => Promise<{
      code: string;
      id: string;
      timeZoneIana: string;
    } | null>;
  };
};

const studySelect = {
  code: true,
  id: true,
  timeZoneIana: true
} as const;

export async function ensureNavigoAppFoundation({
  actorUserId,
  repository = createNavigoFoundationRepository()
}: {
  actorUserId: string;
  repository?: NavigoFoundationRepository;
}): Promise<NavigoFoundationResult> {
  try {
    const definition = createNavigoMeasurementDefinition();
    const definitionHash = hashNavigoMeasurementDefinition(definition);
    const result = await repository.ensureNavigoFoundation({
      actorUserId,
      definition,
      definitionHash,
      studyCode: NAVIGO_STUDY_CODE
    });

    if (!result) {
      return {
        code: "STUDY_NOT_FOUND",
        message: "No se encontro el estudio Navigo para preparar la app.",
        ok: false
      };
    }

    return {
      data: result,
      ok: true
    };
  } catch {
    return {
      code: "UNEXPECTED_ERROR",
      message: "No fue posible preparar la fundacion tecnica de la App Navigo.",
      ok: false
    };
  }
}

export function createNavigoFoundationRepository(
  prismaClient?: NavigoFoundationPrismaClient
): NavigoFoundationRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as NavigoFoundationPrismaClient);
  }

  return {
    async ensureNavigoFoundation(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const study = await tx.study.findUnique({
          select: studySelect,
          where: { code: input.studyCode }
        });

        if (!study) {
          return null;
        }

        const existingDraft = await tx.questionnaireDraft.findFirst({
          orderBy: { createdAt: "desc" },
          select: {
            definitionJson: true,
            id: true,
            status: true
          },
          where: {
            purpose: "MEASUREMENT",
            studyId: study.id
          }
        });

        const normalizedDefinition = JSON.stringify(input.definition);
        let draftCreated = false;
        let draftUpdated = false;
        let draftId = existingDraft?.id ?? null;

        if (!existingDraft) {
          const createdDraft = await tx.questionnaireDraft.create({
            data: {
              createdByUserId: input.actorUserId,
              definitionJson: input.definition,
              name: NAVIGO_MEASUREMENT_DRAFT_NAME,
              purpose: "MEASUREMENT",
              status: "DRAFT",
              studyId: study.id,
              updatedByUserId: input.actorUserId
            },
            select: {
              id: true
            }
          });
          draftCreated = true;
          draftId = createdDraft.id;
        } else if (
          existingDraft.status !== "DRAFT" ||
          JSON.stringify(existingDraft.definitionJson) !== normalizedDefinition
        ) {
          const updatedDraft = await tx.questionnaireDraft.update({
            data: {
              definitionJson: input.definition,
              name: NAVIGO_MEASUREMENT_DRAFT_NAME,
              status: "DRAFT",
              updatedByUserId: input.actorUserId
            },
            select: {
              id: true
            },
            where: {
              id: existingDraft.id
            }
          });
          draftUpdated = true;
          draftId = updatedDraft.id;
        }

        if (!draftId) {
          throw new Error("Navigo measurement draft was not prepared.");
        }

        const sameHashVersion = await tx.questionnaireVersion.findFirst({
          select: {
            id: true
          },
          where: {
            definitionHash: input.definitionHash,
            questionnaireDraft: {
              purpose: "MEASUREMENT"
            },
            status: "ACTIVE",
            studyId: study.id
          }
        });

        let questionnaireVersionCreated = false;
        let questionnaireVersionReused = false;
        let questionnaireVersionId = sameHashVersion?.id ?? null;
        let retiredVersionCount = 0;

        if (sameHashVersion) {
          questionnaireVersionReused = true;
        } else {
          const existingVersions = await tx.questionnaireVersion.findMany({
            orderBy: {
              versionNumber: "desc"
            },
            select: {
              id: true,
              versionNumber: true
            },
            where: {
              questionnaireDraft: {
                purpose: "MEASUREMENT"
              },
              studyId: study.id
            }
          });

          retiredVersionCount =
            (
              await tx.questionnaireVersion.updateMany({
                data: {
                  retiredAt: new Date(),
                  retiredByUserId: input.actorUserId,
                  status: "RETIRED"
                },
                where: {
                  questionnaireDraft: {
                    purpose: "MEASUREMENT"
                  },
                  status: "ACTIVE",
                  studyId: study.id
                }
              })
            ).count ?? 0;

          const createdVersion = await tx.questionnaireVersion.create({
            data: {
              definitionHash: input.definitionHash,
              definitionJson: input.definition,
              publishedByUserId: input.actorUserId,
              questionnaireDraftId: draftId,
              studyId: study.id,
              versionNumber: (existingVersions[0]?.versionNumber ?? 0) + 1
            },
            select: {
              id: true
            }
          });

          questionnaireVersionCreated = true;
          questionnaireVersionId = createdVersion.id;
        }

        if (!questionnaireVersionId) {
          throw new Error("Navigo measurement version was not prepared.");
        }

        const seeds = createNavigoScheduleSeeds(questionnaireVersionId);
        const activeCodes = seeds.map((seed) => seed.code);
        const existingSchedules = await tx.activitySchedule.findMany({
          select: {
            code: true,
            id: true,
            name: true,
            offsetMinutes: true,
            questionnaireVersionId: true,
            sortOrder: true,
            status: true,
            type: true,
            windowEndsMinutes: true,
            windowStartsMinutes: true
          },
          where: {
            code: {
              in: [...activeCodes, ...NAVIGO_LEGACY_ACTIVITY_CODES]
            },
            studyId: study.id
          }
        });
        const schedulesByCode = new Map(
          existingSchedules
            .filter((schedule): schedule is typeof schedule & { code: string } => Boolean(schedule.code))
            .map((schedule) => [schedule.code, schedule])
        );
        let schedulesCreated = 0;
        let schedulesUpdated = 0;

        for (const seed of seeds) {
          const existing = schedulesByCode.get(seed.code);
          const sortOrder = resolveNavigoScheduleSortOrder({
            code: seed.code,
            existingSchedules,
            preferredSortOrder: seed.sortOrder,
            type: seed.type
          });

          if (!existing) {
            await tx.activitySchedule.create({
              data: toScheduleCreateData(seed, sortOrder, study.id)
            });
            schedulesCreated += 1;
            continue;
          }

          if (scheduleNeedsUpdate(existing, seed, sortOrder)) {
            await tx.activitySchedule.update({
              data: {
                name: seed.name,
                offsetMinutes: seed.offsetMinutes,
                questionnaireVersionId: seed.questionnaireVersionId,
                sortOrder,
                status: "ACTIVE",
                type: seed.type,
                windowEndsMinutes: seed.windowEndsMinutes,
                windowStartsMinutes: seed.windowStartsMinutes
              },
              where: {
                id: existing.id
              }
            });
            schedulesUpdated += 1;
          }
        }

        for (const legacy of existingSchedules.filter((schedule) => NAVIGO_LEGACY_ACTIVITY_CODES.includes(schedule.code as never))) {
          if (legacy.status === "ACTIVE") {
            await tx.activitySchedule.update({
              data: {
                status: "INACTIVE"
              },
              where: {
                id: legacy.id
              }
            });
            schedulesUpdated += 1;
          }
        }

        return {
          draftCreated,
          draftUpdated,
          questionnaireVersionCreated,
          questionnaireVersionId,
          questionnaireVersionReused,
          retiredVersionCount,
          scheduleCodes: activeCodes,
          schedulesCreated,
          schedulesUpdated,
          studyCode: study.code,
          studyId: study.id,
          timeZoneIana: resolveNavigoTimeZone(study.timeZoneIana)
        };
      });
    }
  };
}

function scheduleNeedsUpdate(
  existing: {
    code?: string | null;
    name: string;
    offsetMinutes: number;
    questionnaireVersionId: string | null;
    sortOrder: number;
    status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
    type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
    windowEndsMinutes: number;
    windowStartsMinutes: number;
  },
  seed: NavigoScheduleSeed,
  sortOrder: number
): boolean {
  return (
    existing.name !== seed.name ||
    existing.offsetMinutes !== seed.offsetMinutes ||
    existing.questionnaireVersionId !== seed.questionnaireVersionId ||
    existing.sortOrder !== sortOrder ||
    existing.status !== "ACTIVE" ||
    existing.type !== seed.type ||
    existing.windowEndsMinutes !== seed.windowEndsMinutes ||
    existing.windowStartsMinutes !== seed.windowStartsMinutes
  );
}

function resolveNavigoScheduleSortOrder({
  code,
  existingSchedules,
  preferredSortOrder,
  type
}: {
  code: string;
  existingSchedules: Array<{
    code: string | null;
    sortOrder: number;
    type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
  }>;
  preferredSortOrder: number;
  type: NavigoScheduleSeed["type"];
}): number {
  const conflicting = existingSchedules.find(
    (schedule) => schedule.code !== code && schedule.type === type && schedule.sortOrder === preferredSortOrder
  );

  if (!conflicting) {
    return preferredSortOrder;
  }

  return (
    Math.max(
      preferredSortOrder,
      ...existingSchedules.filter((schedule) => schedule.type === type).map((schedule) => schedule.sortOrder)
    ) + 1
  );
}

function toScheduleCreateData(
  seed: NavigoScheduleSeed,
  sortOrder: number,
  studyId: string
) {
  return {
    code: seed.code,
    name: seed.name,
    offsetMinutes: seed.offsetMinutes,
    questionnaireVersionId: seed.questionnaireVersionId,
    sortOrder,
    status: "ACTIVE",
    studyId,
    type: seed.type,
    windowEndsMinutes: seed.windowEndsMinutes,
    windowStartsMinutes: seed.windowStartsMinutes
  };
}
