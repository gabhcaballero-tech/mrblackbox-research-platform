import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type FieldStudyStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
export type FieldScreeningStatus =
  | "INCOMPLETE"
  | "NOT_STARTED"
  | "PASSED"
  | "PENDING_REVIEW"
  | "STARTED"
  | "TERMINATED";
export type FieldOperationalStatus =
  | "ASSIGNED"
  | "COMPLETED"
  | "CREATED"
  | "IN_PROGRESS"
  | "SCREENING_PASSED"
  | "SCREENING_STARTED"
  | "SCREENING_TERMINATED"
  | "WITHDRAWN";

export type FieldScreenerVersionSummary = {
  definitionHash: string;
  definitionJson: unknown;
  id: string;
  publishedAt: Date;
  status: "ACTIVE" | "RETIRED";
  versionNumber: number;
};

export type FieldParticipantPortalConfigSummary = {
  maxImageBytes: number;
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
};

export type FieldStudySummary = {
  activeScreenerVersion: FieldScreenerVersionSummary;
  code: string;
  createdByUserId: string;
  id: string;
  name: string;
  status: FieldStudyStatus;
  timeZoneIana: string;
};

export type FieldParticipantProfileRecord = {
  email: string | null;
  externalReference: string | null;
  id: string;
  name: string;
  phone: string | null;
};

export type FieldStudyParticipantRecord = {
  id: string;
  participantProfileId: string;
  screeningStatus: FieldScreeningStatus;
  studyId: string;
};

export type FieldScreeningAttemptRecord = {
  completedAt: Date | null;
  evaluationJson: unknown;
  fieldUserId: string | null;
  id: string;
  nseClass: string | null;
  nseScore: number | null;
  participantEvidence: FieldParticipantEvidenceRecord[];
  participantScreeningReview: {
    rejectionReason: string | null;
    status: "APPROVED" | "PENDING" | "REJECTED";
  } | null;
  questionnaireVersion: FieldScreenerVersionSummary & {
    study: {
      code: string;
      id: string;
      name: string;
      participantPortalConfig: FieldParticipantPortalConfigSummary | null;
      status: FieldStudyStatus;
      timeZoneIana: string;
    };
  };
  questionnaireVersionId: string;
  source: "FIELD" | "PARTICIPANT_PORTAL";
  startedAt: Date;
  status: FieldScreeningStatus;
  studyParticipant: FieldStudyParticipantRecord & {
    participantProfile: FieldParticipantProfileRecord;
  };
  studyParticipantId: string;
  terminationCode: string | null;
  terminationReason: string | null;
};

export type FieldScreeningAnswerRecord = {
  answerJson: unknown;
  questionId: string;
};

export type FieldParticipantEvidenceRecord = {
  id: string;
  extension: string;
  mimeType: string;
  originalFilename: string | null;
  privateStorageKey: string;
  relatedQuestionId: string | null;
  reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
  sizeBytes: number;
  storageBucket: string;
  type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  uploadedAt: Date;
};

export type CreateParticipantProfileInput = {
  createdByUserId: string | null;
  email?: string;
  externalReference?: string;
  name: string;
  phone?: string;
};

export type CreateStudyParticipantInput = {
  createdByUserId: string | null;
  participantProfileId: string;
  screeningStatus: FieldScreeningStatus;
  studyId: string;
};

export type CreateScreeningAttemptInput = {
  fieldUserId: string | null;
  questionnaireVersionId: string;
  studyParticipantId: string;
};

export type CreateFieldEvidenceInput = {
  extension: string;
  mimeType: string;
  originalFilename: string;
  privateStorageKey: string;
  relatedQuestionId: string | null;
  screeningAttemptId: string;
  sizeBytes: number;
  storageBucket: string;
  studyParticipantId: string;
  type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
};

export type UpsertScreeningAnswerInput = {
  answerJson: unknown;
  questionId: string;
  screeningAttemptId: string;
};

export type CompleteScreeningAttemptInput = {
  attemptId: string;
  completedAt: Date | null;
  evaluationJson: unknown;
  nseClass?: string | null;
  nseScore?: number | null;
  operationalStatus: FieldOperationalStatus;
  screeningStatus: FieldScreeningStatus;
  status: FieldScreeningStatus;
  studyParticipantId: string;
  terminationCode?: string | null;
  terminationReason?: string | null;
};

export type FieldRepository = {
  createEvidence: (input: CreateFieldEvidenceInput) => Promise<FieldParticipantEvidenceRecord>;
  createParticipantProfile: (input: CreateParticipantProfileInput) => Promise<FieldParticipantProfileRecord>;
  createScreeningAttempt: (input: CreateScreeningAttemptInput) => Promise<FieldScreeningAttemptRecord>;
  createStudyParticipant: (input: CreateStudyParticipantInput) => Promise<FieldStudyParticipantRecord>;
  findParticipantProfileById: (participantProfileId: string) => Promise<FieldParticipantProfileRecord | null>;
  findParticipantProfileMatches: (input: {
    email?: string;
    externalReference?: string;
    phone?: string;
  }) => Promise<FieldParticipantProfileRecord[]>;
  findReusableParticipantProfile: (input: {
    email?: string;
    externalReference?: string;
    phone?: string;
  }) => Promise<FieldParticipantProfileRecord | null>;
  findStudyParticipant: (input: {
    participantProfileId: string;
    studyId: string;
  }) => Promise<FieldStudyParticipantRecord | null>;
  getAttempt: (attemptId: string) => Promise<FieldScreeningAttemptRecord | null>;
  getStudyWithActiveScreener: (studyId: string) => Promise<FieldStudySummary | null>;
  listAnswers: (attemptId: string) => Promise<FieldScreeningAnswerRecord[]>;
  listScreeningAttemptsForProfileInStudy: (input: {
    participantProfileId: string;
    studyId: string;
  }) => Promise<FieldScreeningAttemptRecord[]>;
  listAvailableStudies: () => Promise<FieldStudySummary[]>;
  updateAttemptEvaluation: (input: CompleteScreeningAttemptInput) => Promise<void>;
  updateStudyParticipantScreening: (input: {
    operationalStatus: FieldOperationalStatus;
    screeningStatus: FieldScreeningStatus;
    studyParticipantId: string;
  }) => Promise<void>;
  upsertPendingReview: (input: {
    screeningAttemptId: string;
    studyParticipantId: string;
  }) => Promise<void>;
  upsertAnswer: (input: UpsertScreeningAnswerInput) => Promise<FieldScreeningAnswerRecord>;
};

type FieldPrismaClient = PrismaClientLike & {
  participantEvidence: {
    create: (args: unknown) => Promise<FieldParticipantEvidenceRecord>;
  };
  participantProfile: {
    create: (args: unknown) => Promise<FieldParticipantProfileRecord>;
    findMany: (args: unknown) => Promise<FieldParticipantProfileRecord[]>;
    findFirst: (args: unknown) => Promise<FieldParticipantProfileRecord | null>;
    findUnique: (args: unknown) => Promise<FieldParticipantProfileRecord | null>;
  };
  participantScreeningReview: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  screeningAnswer: {
    findMany: (args: unknown) => Promise<FieldScreeningAnswerRecord[]>;
    upsert: (args: unknown) => Promise<FieldScreeningAnswerRecord>;
  };
  screeningAttempt: {
    create: (args: unknown) => Promise<FieldScreeningAttemptRecord>;
    findMany: (args: unknown) => Promise<FieldScreeningAttemptRecord[]>;
    findUnique: (args: unknown) => Promise<FieldScreeningAttemptRecord | null>;
    update: (args: unknown) => Promise<FieldScreeningAttemptRecord>;
  };
  study: {
    findFirst: (args: unknown) => Promise<FieldStudySummary | null>;
    findMany: (args: unknown) => Promise<FieldStudySummary[]>;
    findUnique: (args: unknown) => Promise<FieldStudySummary | null>;
  };
  studyParticipant: {
    create: (args: unknown) => Promise<FieldStudyParticipantRecord>;
    findUnique: (args: unknown) => Promise<FieldStudyParticipantRecord | null>;
    update: (args: unknown) => Promise<FieldStudyParticipantRecord>;
  };
};

const screenerVersionSelect = {
  definitionHash: true,
  definitionJson: true,
  id: true,
  publishedAt: true,
  status: true,
  versionNumber: true
} as const;

const studySelect = {
  code: true,
  createdByUserId: true,
  id: true,
  name: true,
  questionnaireVersions: {
    orderBy: { versionNumber: "desc" },
    select: screenerVersionSelect,
    take: 1,
    where: {
      questionnaireDraft: {
        purpose: "SCREENER"
      },
      status: "ACTIVE"
    }
  },
  status: true,
  timeZoneIana: true
} as const;

const participantProfileSelect = {
  email: true,
  externalReference: true,
  id: true,
  name: true,
  phone: true
} as const;

const studyParticipantSelect = {
  id: true,
  participantProfileId: true,
  screeningStatus: true,
  studyId: true
} as const;

const evidenceSelect = {
  extension: true,
  id: true,
  mimeType: true,
  originalFilename: true,
  privateStorageKey: true,
  relatedQuestionId: true,
  reviewStatus: true,
  sizeBytes: true,
  storageBucket: true,
  type: true,
  uploadedAt: true
} as const;

const attemptSelect = {
  completedAt: true,
  evaluationJson: true,
  fieldUserId: true,
  id: true,
  nseClass: true,
  nseScore: true,
  participantEvidence: {
    orderBy: { uploadedAt: "asc" },
    select: evidenceSelect
  },
  participantScreeningReview: {
    select: {
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
          participantPortalConfig: {
            select: {
              maxImageBytes: true,
              maxPerfumePhotos: true,
              minPerfumePhotos: true
            }
          },
          status: true,
          timeZoneIana: true
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

type StudyWithVersions = Omit<FieldStudySummary, "activeScreenerVersion"> & {
  questionnaireVersions: FieldScreenerVersionSummary[];
};

function toFieldStudy(study: StudyWithVersions): FieldStudySummary {
  const activeScreenerVersion = study.questionnaireVersions[0];

  if (!activeScreenerVersion) {
    throw new Error("Active screener version is required for field studies.");
  }

  return {
    activeScreenerVersion,
    code: study.code,
    createdByUserId: study.createdByUserId,
    id: study.id,
    name: study.name,
    status: study.status,
    timeZoneIana: study.timeZoneIana
  };
}

function buildParticipantProfileMatchOr(input: {
  email?: string;
  externalReference?: string;
  phone?: string;
}) {
  return [
    input.phone ? { phone: input.phone } : null,
    input.email ? { email: input.email } : null,
    input.externalReference ? { externalReference: input.externalReference } : null
  ].filter(Boolean);
}

export function createFieldRepository(prismaClient?: FieldPrismaClient): FieldRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as FieldPrismaClient);
  }

  return {
    async createEvidence(input) {
      const prisma = await getPrisma();

      return prisma.participantEvidence.create({
        data: {
          extension: input.extension,
          mimeType: input.mimeType,
          originalFilename: input.originalFilename,
          privateStorageKey: input.privateStorageKey,
          relatedQuestionId: input.relatedQuestionId,
          screeningAttemptId: input.screeningAttemptId,
          sizeBytes: input.sizeBytes,
          storageBucket: input.storageBucket,
          studyParticipantId: input.studyParticipantId,
          type: input.type
        },
        select: evidenceSelect
      });
    },
    async createParticipantProfile(input) {
      const prisma = await getPrisma();

      return prisma.participantProfile.create({
        data: {
          createdByUserId: input.createdByUserId,
          email: input.email,
          externalReference: input.externalReference,
          name: input.name,
          phone: input.phone,
          status: "ACTIVE"
        },
        select: participantProfileSelect
      });
    },
    async createScreeningAttempt(input) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.create({
        data: {
          fieldUserId: input.fieldUserId,
          questionnaireVersionId: input.questionnaireVersionId,
          status: "STARTED",
          studyParticipantId: input.studyParticipantId
        },
        select: attemptSelect
      });
    },
    async createStudyParticipant(input) {
      const prisma = await getPrisma();

      return prisma.studyParticipant.create({
        data: {
          createdByUserId: input.createdByUserId,
          operationalStatus: "SCREENING_STARTED",
          participantProfileId: input.participantProfileId,
          screeningStatus: input.screeningStatus,
          studyId: input.studyId
        },
        select: studyParticipantSelect
      });
    },
    async findParticipantProfileById(participantProfileId) {
      const prisma = await getPrisma();

      return prisma.participantProfile.findUnique({
        select: participantProfileSelect,
        where: { id: participantProfileId }
      });
    },
    async findParticipantProfileMatches(input) {
      const prisma = await getPrisma();
      const or = buildParticipantProfileMatchOr(input);

      if (or.length === 0) {
        return [];
      }

      return prisma.participantProfile.findMany({
        orderBy: { createdAt: "asc" },
        select: participantProfileSelect,
        take: 10,
        where: { OR: or }
      });
    },
    async findReusableParticipantProfile(input) {
      const prisma = await getPrisma();
      const or = buildParticipantProfileMatchOr(input);

      if (or.length === 0) {
        return null;
      }

      return prisma.participantProfile.findFirst({
        orderBy: { createdAt: "asc" },
        select: participantProfileSelect,
        where: { OR: or }
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
    async getStudyWithActiveScreener(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findFirst({
        select: studySelect,
        where: {
          id: studyId,
          status: "ACTIVE"
        }
      }) as unknown as StudyWithVersions | null;

      if (!study || study.questionnaireVersions.length === 0) {
        return null;
      }

      return toFieldStudy(study);
    },
    async listAnswers(attemptId) {
      const prisma = await getPrisma();

      return prisma.screeningAnswer.findMany({
        orderBy: { createdAt: "asc" },
        select: answerSelect,
        where: { screeningAttemptId: attemptId }
      });
    },
    async listScreeningAttemptsForProfileInStudy(input) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.findMany({
        orderBy: { startedAt: "desc" },
        select: attemptSelect,
        where: {
          studyParticipant: {
            participantProfileId: input.participantProfileId,
            studyId: input.studyId
          }
        }
      });
    },
    async listAvailableStudies() {
      const prisma = await getPrisma();
      const studies = await prisma.study.findMany({
        orderBy: { name: "asc" },
        select: studySelect,
        where: {
          questionnaireVersions: {
            some: {
              questionnaireDraft: {
                purpose: "SCREENER"
              },
              status: "ACTIVE"
            }
          },
          status: "ACTIVE"
        }
      }) as unknown as StudyWithVersions[];

      return studies.filter((study) => study.questionnaireVersions.length > 0).map(toFieldStudy);
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
    async upsertPendingReview(input) {
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
          status: "PENDING"
        },
        where: {
          screeningAttemptId: input.screeningAttemptId
        }
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
    }
  };
}
