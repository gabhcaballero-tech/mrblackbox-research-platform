import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { ParticipantEvidenceKind } from "./evidence-storage";

export type PortalEvidenceStudyStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
export type PortalEvidenceScreeningStatus =
  | "INCOMPLETE"
  | "NOT_STARTED"
  | "PASSED"
  | "PENDING_REVIEW"
  | "STARTED"
  | "TERMINATED";
export type PortalEvidenceReviewStatus = "APPROVED" | "PENDING" | "REJECTED";

export type PortalEvidenceConfigRecord = {
  enabled: boolean;
  folioMaxSequence: number;
  folioPrefix: string;
  maxImageBytes: number;
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
  nextFolioSequence: number;
  privacyNoticeVersion: string;
};

export type PortalEvidenceStudyRecord = {
  code: string;
  id: string;
  name: string;
  portalConfig: PortalEvidenceConfigRecord | null;
  status: PortalEvidenceStudyStatus;
};

export type PortalEvidenceParticipantProfileRecord = {
  email: string | null;
  id: string;
  name: string;
  participantAuthUserId: string | null;
  phone: string | null;
};

export type PortalEvidenceStudyParticipantRecord = {
  id: string;
  participantProfileId: string;
  screeningStatus: PortalEvidenceScreeningStatus;
  studyId: string;
};

export type PortalEvidenceConsentRecord = {
  id: string;
  noticeVersion: string;
  participantAuthUserId: string;
  studyParticipantId: string;
};

export type PortalEvidenceRecord = {
  id: string;
  extension: string;
  mimeType: string;
  originalFilename: string | null;
  privateStorageKey: string;
  relatedQuestionId: string | null;
  reviewStatus: PortalEvidenceReviewStatus;
  sizeBytes: number;
  storageBucket: string;
  type: ParticipantEvidenceKind;
  uploadedAt: Date;
};

export type PortalEvidenceReferenceCodeRecord = {
  code: string;
  slot: number;
};

export type PortalEvidenceConfirmationRecord = {
  folio: string;
  manualMessageMarkedSentAt: Date | null;
  manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
  referenceCodes: PortalEvidenceReferenceCodeRecord[];
};

export type PortalEvidenceReviewRecord = {
  rejectionReason: string | null;
  status: PortalEvidenceReviewStatus;
};

export type PortalEvidenceAttemptRecord = {
  completedAt: Date | null;
  fieldUserId: string | null;
  id: string;
  participantConfirmation: PortalEvidenceConfirmationRecord | null;
  participantEvidence: PortalEvidenceRecord[];
  participantScreeningReview: PortalEvidenceReviewRecord | null;
  source: "FIELD" | "PARTICIPANT_PORTAL";
  status: PortalEvidenceScreeningStatus;
  studyParticipant: PortalEvidenceStudyParticipantRecord & {
    participantProfile: PortalEvidenceParticipantProfileRecord;
  };
  studyParticipantId: string;
};

export type CreatePortalEvidenceInput = {
  extension: string;
  mimeType: string;
  originalFilename: string;
  privateStorageKey: string;
  relatedQuestionId: string | null;
  screeningAttemptId: string;
  sizeBytes: number;
  storageBucket: string;
  studyParticipantId: string;
  type: ParticipantEvidenceKind;
};

export type ParticipantPortalEvidenceRepository = {
  createEvidence: (input: CreatePortalEvidenceInput) => Promise<PortalEvidenceRecord>;
  findCurrentParticipantConsent: (input: {
    noticeVersion: string;
    participantAuthUserId: string;
    studyParticipantId: string;
  }) => Promise<PortalEvidenceConsentRecord | null>;
  findParticipantProfileByAuthUserId: (
    participantAuthUserId: string
  ) => Promise<PortalEvidenceParticipantProfileRecord | null>;
  findStudyParticipant: (input: {
    participantProfileId: string;
    studyId: string;
  }) => Promise<PortalEvidenceStudyParticipantRecord | null>;
  getAttempt: (attemptId: string) => Promise<PortalEvidenceAttemptRecord | null>;
  getStudyByCode: (studyCode: string) => Promise<PortalEvidenceStudyRecord | null>;
  listPortalAttemptsForStudyParticipant: (
    studyParticipantId: string
  ) => Promise<PortalEvidenceAttemptRecord[]>;
  upsertPendingReview: (input: {
    screeningAttemptId: string;
    studyParticipantId: string;
  }) => Promise<void>;
};

type ParticipantPortalEvidencePrismaClient = PrismaClientLike & {
  participantConsent: {
    findUnique: (args: unknown) => Promise<PortalEvidenceConsentRecord | null>;
  };
  participantProfile: {
    findUnique: (args: unknown) => Promise<PortalEvidenceParticipantProfileRecord | null>;
  };
  participantScreeningReview: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  participantEvidence: {
    create: (args: unknown) => Promise<PortalEvidenceRecord>;
  };
  screeningAttempt: {
    findMany: (args: unknown) => Promise<PortalEvidenceAttemptRecord[]>;
    findUnique: (args: unknown) => Promise<PortalEvidenceAttemptRecord | null>;
  };
  study: {
    findUnique: (args: unknown) => Promise<StudyWithPortalConfig | null>;
  };
  studyParticipant: {
    findUnique: (args: unknown) => Promise<PortalEvidenceStudyParticipantRecord | null>;
  };
};

type StudyWithPortalConfig = Omit<PortalEvidenceStudyRecord, "portalConfig"> & {
  participantPortalConfig: PortalEvidenceConfigRecord | null;
};

const portalConfigSelect = {
  enabled: true,
  folioMaxSequence: true,
  folioPrefix: true,
  maxImageBytes: true,
  maxPerfumePhotos: true,
  minPerfumePhotos: true,
  nextFolioSequence: true,
  privacyNoticeVersion: true
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
  fieldUserId: true,
  id: true,
  participantConfirmation: {
    select: {
      folio: true,
      manualMessageMarkedSentAt: true,
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
  source: true,
  status: true,
  studyParticipant: {
    select: {
      ...studyParticipantSelect,
      participantProfile: {
        select: participantProfileSelect
      }
    }
  },
  studyParticipantId: true
} as const;

export function createParticipantPortalEvidenceRepository(
  prismaClient?: ParticipantPortalEvidencePrismaClient
): ParticipantPortalEvidenceRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ParticipantPortalEvidencePrismaClient);
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
            select: portalConfigSelect
          },
          status: true
        },
        where: { code: studyCode }
      });

      if (!study) {
        return null;
      }

      return {
        code: study.code,
        id: study.id,
        name: study.name,
        portalConfig: study.participantPortalConfig,
        status: study.status
      };
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
    }
  };
}
