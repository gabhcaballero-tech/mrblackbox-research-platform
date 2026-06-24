import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type PortalScreenerStudyStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
export type PortalScreeningStatus =
  | "INCOMPLETE"
  | "NOT_STARTED"
  | "PASSED"
  | "PENDING_REVIEW"
  | "STARTED"
  | "TERMINATED";
export type PortalOperationalStatus =
  | "ASSIGNED"
  | "COMPLETED"
  | "CREATED"
  | "IN_PROGRESS"
  | "SCREENING_PASSED"
  | "SCREENING_STARTED"
  | "SCREENING_TERMINATED"
  | "WITHDRAWN";

export type PortalScreenerConfigRecord = {
  enabled: boolean;
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
  privacyNoticeHash: string;
  privacyNoticeText: string;
  privacyNoticeVersion: string;
};

export type PortalScreenerVersionRecord = {
  definitionHash: string;
  definitionJson: unknown;
  id: string;
  publishedAt: Date;
  status: "ACTIVE" | "RETIRED";
  versionNumber: number;
};

export type PortalScreenerStudyRecord = {
  activeScreenerVersion: PortalScreenerVersionRecord | null;
  code: string;
  id: string;
  name: string;
  portalConfig: PortalScreenerConfigRecord | null;
  status: PortalScreenerStudyStatus;
};

export type PortalParticipantProfileRecord = {
  email: string | null;
  id: string;
  name: string;
  participantAuthUserId: string | null;
  phone: string | null;
};

export type PortalStudyParticipantRecord = {
  id: string;
  participantProfileId: string;
  screeningStatus: PortalScreeningStatus;
  studyId: string;
};

export type PortalParticipantConsentRecord = {
  id: string;
  noticeVersion: string;
  participantAuthUserId: string;
  studyParticipantId: string;
};

export type PortalScreeningAttemptRecord = {
  completedAt: Date | null;
  evaluationJson: unknown;
  fieldUserId: string | null;
  id: string;
  nseClass: string | null;
  nseScore: number | null;
  participantConfirmation: { id: string } | null;
  participantEvidence: Array<{
    id: string;
    relatedQuestionId: string | null;
    type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  }>;
  participantScreeningReview: {
    id: string;
    rejectionReason: string | null;
    status: "APPROVED" | "PENDING" | "REJECTED";
  } | null;
  questionnaireVersion: PortalScreenerVersionRecord & {
    study: {
      code: string;
      id: string;
      name: string;
      status: PortalScreenerStudyStatus;
    };
  };
  questionnaireVersionId: string;
  source: "FIELD" | "PARTICIPANT_PORTAL";
  startedAt: Date;
  status: PortalScreeningStatus;
  studyParticipant: PortalStudyParticipantRecord & {
    participantProfile: PortalParticipantProfileRecord;
  };
  studyParticipantId: string;
  terminationCode: string | null;
  terminationReason: string | null;
};

export type PortalScreeningAnswerRecord = {
  answerJson: unknown;
  questionId: string;
};

export type CreatePortalScreeningAttemptInput = {
  questionnaireVersionId: string;
  studyParticipantId: string;
};

export type UpdatePortalAttemptInput = {
  attemptId: string;
  completedAt: Date | null;
  evaluationJson: unknown;
  nseClass?: string | null;
  nseScore?: number | null;
  operationalStatus: PortalOperationalStatus;
  screeningStatus: PortalScreeningStatus;
  status: PortalScreeningStatus;
  studyParticipantId: string;
  terminationCode?: string | null;
  terminationReason?: string | null;
};

export type UpsertPortalAnswerInput = {
  answerJson: unknown;
  questionId: string;
  screeningAttemptId: string;
};

export type ParticipantPortalScreenerRepository = {
  createPortalScreeningAttempt: (
    input: CreatePortalScreeningAttemptInput
  ) => Promise<PortalScreeningAttemptRecord>;
  findCurrentParticipantConsent: (input: {
    noticeVersion: string;
    participantAuthUserId: string;
    studyParticipantId: string;
  }) => Promise<PortalParticipantConsentRecord | null>;
  findParticipantProfileByAuthUserId: (
    participantAuthUserId: string
  ) => Promise<PortalParticipantProfileRecord | null>;
  findStudyParticipant: (input: {
    participantProfileId: string;
    studyId: string;
  }) => Promise<PortalStudyParticipantRecord | null>;
  getAttempt: (attemptId: string) => Promise<PortalScreeningAttemptRecord | null>;
  getStudyByCode: (studyCode: string) => Promise<PortalScreenerStudyRecord | null>;
  listAnswers: (attemptId: string) => Promise<PortalScreeningAnswerRecord[]>;
  listPortalAttemptsForStudyParticipant: (
    studyParticipantId: string
  ) => Promise<PortalScreeningAttemptRecord[]>;
  updateAttemptEvaluation: (input: UpdatePortalAttemptInput) => Promise<void>;
  updateStudyParticipantScreening: (input: {
    operationalStatus: PortalOperationalStatus;
    screeningStatus: PortalScreeningStatus;
    studyParticipantId: string;
  }) => Promise<void>;
  upsertAnswer: (input: UpsertPortalAnswerInput) => Promise<PortalScreeningAnswerRecord>;
  upsertPendingScreeningReview: (input: {
    screeningAttemptId: string;
    studyParticipantId: string;
  }) => Promise<void>;
};

type ParticipantPortalScreenerPrismaClient = PrismaClientLike & {
  participantConsent: {
    findUnique: (args: unknown) => Promise<PortalParticipantConsentRecord | null>;
  };
  participantProfile: {
    findUnique: (args: unknown) => Promise<PortalParticipantProfileRecord | null>;
  };
  participantScreeningReview: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  screeningAnswer: {
    findMany: (args: unknown) => Promise<PortalScreeningAnswerRecord[]>;
    upsert: (args: unknown) => Promise<PortalScreeningAnswerRecord>;
  };
  screeningAttempt: {
    create: (args: unknown) => Promise<PortalScreeningAttemptRecord>;
    findMany: (args: unknown) => Promise<PortalScreeningAttemptRecord[]>;
    findUnique: (args: unknown) => Promise<PortalScreeningAttemptRecord | null>;
    update: (args: unknown) => Promise<PortalScreeningAttemptRecord>;
  };
  study: {
    findUnique: (args: unknown) => Promise<StudyWithVersions | null>;
  };
  studyParticipant: {
    findUnique: (args: unknown) => Promise<PortalStudyParticipantRecord | null>;
    update: (args: unknown) => Promise<PortalStudyParticipantRecord>;
  };
};

type StudyWithVersions = Omit<PortalScreenerStudyRecord, "activeScreenerVersion" | "portalConfig"> & {
  participantPortalConfig: PortalScreenerConfigRecord | null;
  questionnaireVersions: PortalScreenerVersionRecord[];
};

const screenerVersionSelect = {
  definitionHash: true,
  definitionJson: true,
  id: true,
  publishedAt: true,
  status: true,
  versionNumber: true
} as const;

const participantProfileSelect = {
  email: true,
  id: true,
  name: true,
  participantAuthUserId: true,
  phone: true
} as const;

const studyParticipantSelect = {
  id: true,
  participantProfileId: true,
  screeningStatus: true,
  studyId: true
} as const;

const attemptSelect = {
  completedAt: true,
  evaluationJson: true,
  fieldUserId: true,
  id: true,
  nseClass: true,
  nseScore: true,
  participantConfirmation: {
    select: {
      id: true
    }
  },
  participantEvidence: {
    orderBy: { uploadedAt: "asc" },
    select: {
      id: true,
      relatedQuestionId: true,
      type: true
    }
  },
  participantScreeningReview: {
    select: {
      id: true,
      rejectionReason: true,
      status: true
    }
  },
  questionnaireVersion: {
    select: {
      ...screenerVersionSelect,
      study: {
        select: {
          code: true,
          id: true,
          name: true,
          status: true
        }
      }
    }
  },
  questionnaireVersionId: true,
  source: true,
  startedAt: true,
  status: true,
  studyParticipant: {
    select: {
      ...studyParticipantSelect,
      participantProfile: {
        select: participantProfileSelect
      }
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

export function createParticipantPortalScreenerRepository(
  prismaClient?: ParticipantPortalScreenerPrismaClient
): ParticipantPortalScreenerRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ParticipantPortalScreenerPrismaClient);
  }

  return {
    async createPortalScreeningAttempt(input) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.create({
        data: {
          fieldUserId: null,
          questionnaireVersionId: input.questionnaireVersionId,
          source: "PARTICIPANT_PORTAL",
          status: "STARTED",
          studyParticipantId: input.studyParticipantId
        },
        select: attemptSelect
      });
    },
    async findCurrentParticipantConsent(input) {
      const prisma = await getPrisma();

      return prisma.participantConsent.findUnique({
        select: {
          id: true,
          noticeVersion: true,
          participantAuthUserId: true,
          studyParticipantId: true
        },
        where: {
          studyParticipantId_noticeVersion: {
            noticeVersion: input.noticeVersion,
            studyParticipantId: input.studyParticipantId
          }
        }
      }).then((consent) =>
        consent?.participantAuthUserId === input.participantAuthUserId ? consent : null
      );
    },
    async findParticipantProfileByAuthUserId(participantAuthUserId) {
      const prisma = await getPrisma();

      return prisma.participantProfile.findUnique({
        select: participantProfileSelect,
        where: { participantAuthUserId }
      });
    },
    async findStudyParticipant(input) {
      const prisma = await getPrisma();

      return prisma.studyParticipant.findUnique({
        select: studyParticipantSelect,
        where: {
          participantProfileId_studyId: {
            participantProfileId: input.participantProfileId,
            studyId: input.studyId
          }
        }
      });
    },
    async getAttempt(attemptId) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.findUnique({
        select: attemptSelect,
        where: { id: attemptId }
      });
    },
    async getStudyByCode(studyCode) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: {
          code: true,
          id: true,
          name: true,
          participantPortalConfig: {
            select: {
              enabled: true,
              maxPerfumePhotos: true,
              minPerfumePhotos: true,
              privacyNoticeHash: true,
              privacyNoticeText: true,
              privacyNoticeVersion: true
            }
          },
          questionnaireVersions: {
            orderBy: { versionNumber: "desc" },
            select: screenerVersionSelect,
            take: 10,
            where: {
              status: "ACTIVE"
            }
          },
          status: true
        },
        where: { code: studyCode }
      });

      if (!study) {
        return null;
      }

      const activeScreenerVersion =
        study.questionnaireVersions.find((version) => isScreenerDefinition(version.definitionJson)) ??
        null;

      return {
        activeScreenerVersion,
        code: study.code,
        id: study.id,
        name: study.name,
        portalConfig: study.participantPortalConfig,
        status: study.status
      };
    },
    async listAnswers(attemptId) {
      const prisma = await getPrisma();

      return prisma.screeningAnswer.findMany({
        orderBy: { createdAt: "asc" },
        select: answerSelect,
        where: { screeningAttemptId: attemptId }
      });
    },
    async listPortalAttemptsForStudyParticipant(studyParticipantId) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.findMany({
        orderBy: { startedAt: "desc" },
        select: attemptSelect,
        where: {
          source: "PARTICIPANT_PORTAL",
          studyParticipantId
        }
      });
    },
    async updateAttemptEvaluation(input) {
      const prisma = await getPrisma();

      await prisma.screeningAttempt.update({
        data: {
          completedAt: input.completedAt,
          evaluationJson: input.evaluationJson,
          nseClass: input.nseClass,
          nseScore: input.nseScore,
          status: input.status,
          terminationCode: input.terminationCode,
          terminationReason: input.terminationReason
        },
        select: attemptSelect,
        where: { id: input.attemptId }
      });

      await prisma.studyParticipant.update({
        data: {
          operationalStatus: input.operationalStatus,
          screeningStatus: input.screeningStatus
        },
        select: studyParticipantSelect,
        where: { id: input.studyParticipantId }
      });
    },
    async updateStudyParticipantScreening(input) {
      const prisma = await getPrisma();

      await prisma.studyParticipant.update({
        data: {
          operationalStatus: input.operationalStatus,
          screeningStatus: input.screeningStatus
        },
        select: studyParticipantSelect,
        where: { id: input.studyParticipantId }
      });
    },
    async upsertAnswer(input) {
      const prisma = await getPrisma();

      return prisma.screeningAnswer.upsert({
        create: {
          answerJson: input.answerJson,
          questionId: input.questionId,
          screeningAttemptId: input.screeningAttemptId
        },
        select: answerSelect,
        update: {
          answerJson: input.answerJson
        },
        where: {
          screeningAttemptId_questionId: {
            questionId: input.questionId,
            screeningAttemptId: input.screeningAttemptId
          }
        }
      });
    },
    async upsertPendingScreeningReview(input) {
      const prisma = await getPrisma();

      await prisma.participantScreeningReview.upsert({
        create: {
          screeningAttemptId: input.screeningAttemptId,
          status: "PENDING",
          studyParticipantId: input.studyParticipantId
        },
        update: {
          rejectionReason: null,
          reviewedAt: null,
          reviewedByUserId: null,
          status: "PENDING",
          studyParticipantId: input.studyParticipantId
        },
        where: {
          screeningAttemptId: input.screeningAttemptId
        }
      });
    }
  };
}

function isScreenerDefinition(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "purpose" in input &&
    (input as { purpose?: unknown }).purpose === "SCREENER" &&
    "schemaVersion" in input &&
    (input as { schemaVersion?: unknown }).schemaVersion === "screening.v1"
  );
}
