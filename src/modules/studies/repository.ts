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

export type StudyListMode = "active" | "archived";

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

export type StudyDeletionBlocker = {
  count: number;
  key: string;
  label: string;
};

export type StudyRiskState = StudyListItem & {
  deletionBlockers: StudyDeletionBlocker[];
};

export type StudyArchiveResult = {
  code: string;
  id: string;
  portalDisabled: boolean;
  status: StudyStatus;
} | null;

export type StudyDeleteResult = {
  code: string;
  id: string;
} | null;

export type StudiesRepository = {
  archiveStudy: (studyId: string) => Promise<StudyArchiveResult>;
  deleteEmptyStudy: (studyId: string) => Promise<StudyDeleteResult>;
  getStudyRiskState: (studyId: string) => Promise<StudyRiskState | null>;
  listStudies: (mode?: StudyListMode) => Promise<StudyListItem[]>;
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
    where?: unknown;
  }) => Promise<StudyListItem[]>;
  create: (args: {
    data: CreateStudyRecordInput;
    select: StudySelect;
  }) => Promise<StudyListItem>;
  findFirst: (args: unknown) => Promise<StudyActivationState>;
  updateMany: (args: {
    where: unknown;
    data:
      | {
          code: string;
          name: string;
          timeZoneIana: string;
        }
      | {
          status: "ACTIVE";
        }
      | {
          status: "ARCHIVED";
        };
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: { id: string };
    select: StudySelect | { id: true; status: true };
  }) => Promise<StudyEditState | StudyListItem | null>;
  delete: (args: unknown) => Promise<{ code: string; id: string }>;
};

type CountDelegate = {
  count: (args: unknown) => Promise<number>;
};

type DeleteManyDelegate = {
  deleteMany: (args: unknown) => Promise<unknown>;
};

type UpdateManyDelegate = {
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

type StudyDeletionTransaction = {
  activitySchedule: DeleteManyDelegate;
  attributeRandomizationConfig: DeleteManyDelegate;
  libraryItem: DeleteManyDelegate;
  libraryItemRevision: DeleteManyDelegate;
  participantPortalStudyConfig: DeleteManyDelegate;
  questionnaireAttributeSet: DeleteManyDelegate;
  questionnaireDraft: DeleteManyDelegate;
  questionnaireDraftLibraryUse: DeleteManyDelegate;
  questionnaireVersion: DeleteManyDelegate;
  quotaDefinition: DeleteManyDelegate;
  rotationPlan: DeleteManyDelegate;
  rotationPlanArm: DeleteManyDelegate;
  study: {
    delete: (args: unknown) => Promise<{ code: string; id: string }>;
  };
  studyArm: DeleteManyDelegate;
  studyProduct: DeleteManyDelegate;
};

type StudyPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: StudyDeletionTransaction) => Promise<T>) => Promise<T>;
  applicationTimeEvent: CountDelegate;
  exportJob: CountDelegate;
  mediaEvidencePlaceholder: CountDelegate;
  participantAccessToken: CountDelegate;
  participantActivity: CountDelegate;
  participantArmAssignment: CountDelegate;
  participantAttributeOrder: CountDelegate;
  participantConfirmation: CountDelegate;
  participantConsent: CountDelegate;
  participantEvidence: CountDelegate;
  participantReferenceCode: CountDelegate;
  participantRotationAssignment: CountDelegate;
  quotaEvaluation: CountDelegate;
  reminderLog: CountDelegate;
  researchResponse: CountDelegate;
  screeningAnswer: CountDelegate;
  screeningAttempt: CountDelegate;
  study: StudyDelegate;
  studyParticipant: CountDelegate;
  participantPortalStudyConfig: UpdateManyDelegate;
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
    async archiveStudy(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: studySelect,
        where: { id: studyId }
      }) as StudyListItem | null;

      if (!study) {
        return null;
      }

      await prisma.study.updateMany({
        data: { status: "ARCHIVED" },
        where: {
          id: studyId
        }
      });
      const portalResult = await prisma.participantPortalStudyConfig.updateMany({
        data: { enabled: false },
        where: { studyId }
      });

      return {
        code: study.code,
        id: study.id,
        portalDisabled: portalResult.count > 0,
        status: "ARCHIVED"
      };
    },
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
      }) as Promise<StudyEditState>;
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
    async getStudyRiskState(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: studySelect,
        where: { id: studyId }
      }) as StudyListItem | null;

      if (!study) {
        return null;
      }

      return {
        ...study,
        deletionBlockers: await getDeletionBlockers(prisma, studyId)
      };
    },
    async deleteEmptyStudy(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: studySelect,
        where: { id: studyId }
      }) as StudyListItem | null;

      if (!study) {
        return null;
      }

      const blockers = await getDeletionBlockers(prisma, studyId);

      if (blockers.length > 0) {
        throw new StudyDeletionBlockedError(blockers);
      }

      return prisma.$transaction(async (transaction) => {
        await transaction.questionnaireDraftLibraryUse.deleteMany({
          where: {
            questionnaireDraft: { studyId }
          }
        });
        await transaction.questionnaireAttributeSet.deleteMany({
          where: {
            questionnaireVersion: { studyId }
          }
        });
        await transaction.attributeRandomizationConfig.deleteMany({
          where: {
            questionnaireVersion: { studyId }
          }
        });
        await transaction.activitySchedule.deleteMany({ where: { studyId } });
        await transaction.questionnaireVersion.deleteMany({ where: { studyId } });
        await transaction.questionnaireDraft.deleteMany({ where: { studyId } });
        await transaction.libraryItemRevision.deleteMany({
          where: {
            libraryItem: { studyId }
          }
        });
        await transaction.libraryItem.deleteMany({ where: { studyId } });
        await transaction.rotationPlanArm.deleteMany({
          where: {
            rotationPlan: { studyId }
          }
        });
        await transaction.rotationPlan.deleteMany({ where: { studyId } });
        await transaction.studyProduct.deleteMany({ where: { studyId } });
        await transaction.studyArm.deleteMany({ where: { studyId } });
        await transaction.quotaDefinition.deleteMany({ where: { studyId } });
        await transaction.participantPortalStudyConfig.deleteMany({ where: { studyId } });

        return transaction.study.delete({
          select: {
            code: true,
            id: true
          },
          where: { id: studyId }
        });
      });
    },
    async listStudies(mode = "active") {
      const prisma = await getPrisma();

      return prisma.study.findMany({
        orderBy: { createdAt: "desc" },
        select: studySelect,
        where:
          mode === "archived"
            ? { status: "ARCHIVED" }
            : {
                status: { not: "ARCHIVED" }
              }
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

export class StudyDeletionBlockedError extends Error {
  constructor(public readonly blockers: StudyDeletionBlocker[]) {
    super("Study deletion is blocked by operational records.");
    this.name = "StudyDeletionBlockedError";
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function isStudyDeletionBlockedError(error: unknown): error is StudyDeletionBlockedError {
  return error instanceof StudyDeletionBlockedError;
}

async function getDeletionBlockers(
  prisma: StudyPrismaClient,
  studyId: string
): Promise<StudyDeletionBlocker[]> {
  const checks: Array<Promise<StudyDeletionBlocker>> = [
    countBlocker(prisma.studyParticipant, studyId, "studyParticipants", "participantes del estudio", {
      where: { studyId }
    }),
    countBlocker(prisma.screeningAttempt, studyId, "screeningAttempts", "intentos de screener", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.screeningAnswer, studyId, "screeningAnswers", "respuestas de screener", {
      where: { screeningAttempt: { studyParticipant: { studyId } } }
    }),
    countBlocker(prisma.participantConsent, studyId, "participantConsents", "consentimientos", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantEvidence, studyId, "participantEvidence", "evidencias", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantConfirmation, studyId, "participantConfirmations", "confirmaciones finales", {
      where: { studyId }
    }),
    countBlocker(prisma.participantReferenceCode, studyId, "participantReferenceCodes", "folios o codigos", {
      where: { confirmation: { studyId } }
    }),
    countBlocker(prisma.participantActivity, studyId, "participantActivities", "actividades de participante", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.applicationTimeEvent, studyId, "applicationTimeEvents", "eventos de hora de aplicacion", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantAccessToken, studyId, "participantAccessTokens", "tokens de participante", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantRotationAssignment, studyId, "participantRotationAssignments", "asignaciones de rotacion", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantArmAssignment, studyId, "participantArmAssignments", "asignaciones de brazo", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.participantAttributeOrder, studyId, "participantAttributeOrders", "ordenes de atributos", {
      where: { studyParticipant: { studyId } }
    }),
    countBlocker(prisma.mediaEvidencePlaceholder, studyId, "mediaEvidencePlaceholders", "evidencia multimedia", {
      where: { participantActivity: { studyParticipant: { studyId } } }
    }),
    countBlocker(prisma.reminderLog, studyId, "reminderLogs", "recordatorios", {
      where: { participantActivity: { studyParticipant: { studyId } } }
    }),
    countBlocker(prisma.researchResponse, studyId, "researchResponses", "respuestas de medicion", {
      where: { participantActivity: { studyParticipant: { studyId } } }
    }),
    countBlocker(prisma.quotaEvaluation, studyId, "quotaEvaluations", "evaluaciones de cuotas", {
      where: { quotaDefinition: { studyId } }
    }),
    countBlocker(prisma.exportJob, studyId, "exportJobs", "exportaciones generadas", {
      where: { studyId }
    })
  ];

  const blockers = await Promise.all(checks);

  return blockers.filter((blocker) => blocker.count > 0);
}

async function countBlocker(
  delegate: CountDelegate,
  _studyId: string,
  key: string,
  label: string,
  args: unknown
): Promise<StudyDeletionBlocker> {
  void _studyId;

  return {
    count: await delegate.count(args),
    key,
    label
  };
}
