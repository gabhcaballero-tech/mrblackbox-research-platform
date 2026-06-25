import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { DETERGENT_RECRUITER_QUESTION_ID } from "@/modules/screener/study-overrides";
import type { ScreeningAttemptFilters, SupervisionAttemptStatus } from "./validation";

export type SupervisionStudyRecord = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

export type SupervisionFieldUserRecord = {
  email: string;
  id: string;
  name: string;
};

export type SupervisionParticipantProfileRecord = {
  createdAt: Date;
  email: string | null;
  externalReference: string | null;
  id: string;
  name: string;
  phone: string | null;
};

export type SupervisionQuestionnaireVersionRecord = {
  definitionHash: string;
  definitionJson: unknown;
  id: string;
  versionNumber: number;
  study: SupervisionStudyRecord;
};

export type SupervisionAttemptSource = "FIELD" | "PARTICIPANT_PORTAL";

export type SupervisionParticipantEvidenceRecord = {
  internalNote: string | null;
  rejectionReason: string | null;
  reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
  reviewedAt: Date | null;
  reviewedBy: SupervisionFieldUserRecord | null;
  type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
};

export type SupervisionAttemptRecord = {
  answers?: SupervisionAnswerRecord[];
  completedAt: Date | null;
  evaluationJson: unknown;
  fieldUser: SupervisionFieldUserRecord | null;
  fieldUserId: string | null;
  id: string;
  nseClass: string | null;
  nseScore: number | null;
  participantConfirmation: {
    folio: string;
    manualMessageMarkedSentAt?: Date | null;
    manualMessageMarkedSentBy?: SupervisionFieldUserRecord | null;
    manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
    referenceCodes: Array<{ code: string; slot: number }>;
  } | null;
  participantScreeningReview: {
    internalNote?: string | null;
    rejectionReason?: string | null;
    reviewedAt?: Date | null;
    reviewedBy?: SupervisionFieldUserRecord | null;
    status: "APPROVED" | "PENDING" | "REJECTED";
  } | null;
  questionnaireVersion: SupervisionQuestionnaireVersionRecord;
  questionnaireVersionId: string;
  source: SupervisionAttemptSource;
  startedAt: Date;
  status: SupervisionAttemptStatus;
  studyParticipant: {
    id: string;
    participantProfile: SupervisionParticipantProfileRecord;
    studyId: string;
  };
  studyParticipantId: string;
  terminationCode: string | null;
  terminationReason: string | null;
};

export type SupervisionAnswerRecord = {
  answerJson: unknown;
  questionId: string;
};

export type SupervisionAttemptDetailRecord = SupervisionAttemptRecord & {
  answers: SupervisionAnswerRecord[];
};

export type SupervisionAttemptExportRecord = SupervisionAttemptDetailRecord & {
  participantEvidence: SupervisionParticipantEvidenceRecord[];
};

export type ScreeningSupervisionRepository = {
  getAttemptDetail: (attemptId: string) => Promise<SupervisionAttemptDetailRecord | null>;
  getStudy: (studyId: string) => Promise<SupervisionStudyRecord | null>;
  listAttemptFieldUsers: (studyId: string) => Promise<SupervisionFieldUserRecord[]>;
  listStudyAttemptsForExport: (input: {
    filters: ScreeningAttemptFilters;
    studyId: string;
  }) => Promise<SupervisionAttemptExportRecord[]>;
  listStudyAttempts: (input: {
    filters: ScreeningAttemptFilters;
    studyId: string;
  }) => Promise<SupervisionAttemptRecord[]>;
};

type ScreeningSupervisionPrismaClient = PrismaClientLike & {
  internalUser: {
    findMany: (args: unknown) => Promise<SupervisionFieldUserRecord[]>;
  };
  screeningAttempt: {
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<SupervisionAttemptDetailRecord | null>;
  };
  study: {
    findUnique: (args: unknown) => Promise<SupervisionStudyRecord | null>;
  };
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  timeZoneIana: true
} as const;

const fieldUserSelect = {
  email: true,
  id: true,
  name: true
} as const;

const participantProfileSelect = {
  createdAt: true,
  email: true,
  externalReference: true,
  id: true,
  name: true,
  phone: true
} as const;

const attemptSelect = {
  completedAt: true,
  evaluationJson: true,
  fieldUser: {
    select: fieldUserSelect
  },
  fieldUserId: true,
  id: true,
  nseClass: true,
  nseScore: true,
  participantConfirmation: {
    select: {
      folio: true,
      manualMessageMarkedSentAt: true,
      manualMessageMarkedSentBy: {
        select: fieldUserSelect
      },
      manualMessageStatus: true,
      referenceCodes: {
        orderBy: { slot: "asc" },
        select: {
          code: true,
          slot: true
        }
      }
    }
  },
  participantScreeningReview: {
    select: {
      internalNote: true,
      rejectionReason: true,
      reviewedAt: true,
      reviewedBy: {
        select: fieldUserSelect
      },
      status: true
    }
  },
  questionnaireVersion: {
    select: {
      definitionHash: true,
      definitionJson: true,
      id: true,
      study: {
        select: studySelect
      },
      versionNumber: true
    }
  },
  questionnaireVersionId: true,
  source: true,
  startedAt: true,
  status: true,
  studyParticipant: {
    select: {
      id: true,
      participantProfile: {
        select: participantProfileSelect
      },
      studyId: true
    }
  },
  studyParticipantId: true,
  terminationCode: true,
  terminationReason: true
} as const;

const answerSelect = {
  answerJson: true,
  questionId: true
} as const;

const participantEvidenceSelect = {
  internalNote: true,
  rejectionReason: true,
  reviewStatus: true,
  reviewedAt: true,
  reviewedBy: {
    select: fieldUserSelect
  },
  type: true
} as const;

export function createScreeningSupervisionRepository(
  prismaClient?: ScreeningSupervisionPrismaClient
): ScreeningSupervisionRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ScreeningSupervisionPrismaClient);
  }

  return {
    async getAttemptDetail(attemptId) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.findUnique({
        select: {
          ...attemptSelect,
          answers: {
            orderBy: { createdAt: "asc" },
            select: answerSelect
          }
        },
        where: { id: attemptId }
      });
    },
    async getStudy(studyId) {
      const prisma = await getPrisma();

      return prisma.study.findUnique({
        select: studySelect,
        where: { id: studyId }
      });
    },
    async listAttemptFieldUsers(studyId) {
      const prisma = await getPrisma();

      return prisma.internalUser.findMany({
        orderBy: { name: "asc" },
        select: fieldUserSelect,
        where: {
          screeningAttempts: {
            some: {
              studyParticipant: {
                studyId
              }
            }
          }
        }
      });
    },
    async listStudyAttempts(input) {
      const prisma = await getPrisma();
      const where = buildAttemptWhere(input.studyId, input.filters);

      return prisma.screeningAttempt.findMany({
        orderBy: { startedAt: "desc" },
        select: {
          ...attemptSelect,
          answers: {
            orderBy: { createdAt: "asc" },
            select: answerSelect,
            where: { questionId: DETERGENT_RECRUITER_QUESTION_ID }
          }
        },
        take: 100,
        where
      }) as Promise<SupervisionAttemptRecord[]>;
    },
    async listStudyAttemptsForExport(input) {
      const prisma = await getPrisma();
      const where = buildAttemptWhere(input.studyId, input.filters);

      return prisma.screeningAttempt.findMany({
        orderBy: { startedAt: "desc" },
        select: {
          ...attemptSelect,
          answers: {
            orderBy: { createdAt: "asc" },
            select: answerSelect
          },
          participantEvidence: {
            orderBy: { uploadedAt: "asc" },
            select: participantEvidenceSelect
          }
        },
        where
      }) as Promise<SupervisionAttemptExportRecord[]>;
    }
  };
}

function buildAttemptWhere(studyId: string, filters: ScreeningAttemptFilters) {
  const startedAt: { gte?: Date; lte?: Date } = {};
  const codeStatus = supervisionStatusFromText(filters.code);
  const andClauses: Record<string, unknown>[] = [{ studyParticipant: { studyId } }];

  if (filters.dateFrom) {
    startedAt.gte = filters.dateFrom;
  }

  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    startedAt.lte = endOfDay;
  }

  if (filters.fieldUserId) {
    andClauses.push({ fieldUserId: filters.fieldUserId });
  }

  if (Object.keys(startedAt).length > 0) {
    andClauses.push({ startedAt });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  if (filters.code) {
    const codeFilters = [
      { terminationCode: { contains: filters.code, mode: "insensitive" } },
      { terminationReason: { contains: filters.code, mode: "insensitive" } },
      codeStatus ? { status: codeStatus } : null
    ].filter(Boolean);

    andClauses.push({ OR: codeFilters });
  }

  if (filters.participantQuery) {
    andClauses.push({
      OR: [
        {
          studyParticipant: {
            participantProfile: {
              name: { contains: filters.participantQuery, mode: "insensitive" }
            }
          }
        },
        {
          studyParticipant: {
            participantProfile: {
              externalReference: { contains: filters.participantQuery, mode: "insensitive" }
            }
          }
        },
        {
          studyParticipant: {
            participantProfile: {
              phone: { contains: filters.participantQuery, mode: "insensitive" }
            }
          }
        },
        {
          studyParticipant: {
            participantProfile: {
              email: { contains: filters.participantQuery, mode: "insensitive" }
            }
          }
        }
      ]
    });
  }

  return { AND: andClauses };
}

function supervisionStatusFromText(value: string | undefined) {
  const normalized = value?.toUpperCase();

  if (
    normalized === "STARTED" ||
    normalized === "INCOMPLETE" ||
    normalized === "PASSED" ||
    normalized === "TERMINATED" ||
    normalized === "PENDING_REVIEW"
  ) {
    return normalized;
  }

  return null;
}
