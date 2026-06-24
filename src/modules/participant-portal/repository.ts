import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type ParticipantPortalStudyStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";

export type ParticipantPortalConfigRecord = {
  enabled: boolean;
  evidenceRetentionDays: number;
  folioMaxSequence: number;
  folioPrefix: string;
  maxImageBytes: number;
  maxOtpAttempts: number;
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
  nextFolioSequence: number;
  otpCooldownSeconds: number;
  privacyNoticeHash: string;
  privacyNoticeText: string;
  privacyNoticeVersion: string;
};

export type ParticipantPortalOtpConfigRecord = {
  enabled: boolean;
  maxOtpAttempts: number;
  otpCooldownSeconds: number;
};

export type ParticipantPortalStudyRecord = {
  activeScreenerVersionId: string | null;
  code: string;
  id: string;
  name: string;
  portalConfig: ParticipantPortalConfigRecord | null;
  status: ParticipantPortalStudyStatus;
};

export type ParticipantPortalOtpLogInput = {
  emailHash: string;
  ipHash: string | null;
  purpose: "OTP_REQUEST" | "OTP_VERIFY_FAILED";
  requestedAt: Date;
};

export type ParticipantPortalRepository = {
  countOtpLogsSince: (input: {
    emailHash: string;
    purpose: "OTP_REQUEST" | "OTP_VERIFY_FAILED";
    since: Date;
  }) => Promise<number>;
  createOtpLog: (input: ParticipantPortalOtpLogInput) => Promise<void>;
  findInternalUserByAuthUserId: (authUserId: string) => Promise<{ id: string } | null>;
  findRecentOtpRequest: (input: {
    emailHash: string;
    since: Date;
  }) => Promise<{ requestedAt: Date } | null>;
  getStudyByCode: (studyCode: string) => Promise<ParticipantPortalStudyRecord | null>;
};

type PrismaWithParticipantPortal = PrismaClientLike & {
  internalUser: {
    findUnique: (args: {
      select: { id: true };
      where: { authUserId: string };
    }) => Promise<{ id: string } | null>;
  };
  participantPortalOtpRequestLog: {
    count: (args: {
      where: {
        emailHash: string;
        purpose: string;
        requestedAt: { gte: Date };
      };
    }) => Promise<number>;
    create: (args: {
      data: {
        emailHash: string;
        ipHash: string | null;
        purpose: string;
        requestedAt: Date;
      };
    }) => Promise<unknown>;
    findFirst: (args: {
      orderBy: { requestedAt: "desc" };
      select: { requestedAt: true };
      where: {
        emailHash: string;
        purpose: string;
        requestedAt: { gte: Date };
      };
    }) => Promise<{ requestedAt: Date } | null>;
  };
  study: {
    findUnique: (args: {
      select: {
        code: true;
        id: true;
        name: true;
        participantPortalConfig: {
          select: {
            enabled: true;
            evidenceRetentionDays: true;
            folioMaxSequence: true;
            folioPrefix: true;
            maxImageBytes: true;
            maxOtpAttempts: true;
            maxPerfumePhotos: true;
            minPerfumePhotos: true;
            nextFolioSequence: true;
            otpCooldownSeconds: true;
            privacyNoticeHash: true;
            privacyNoticeText: true;
            privacyNoticeVersion: true;
          };
        };
        questionnaireVersions: {
          orderBy: { versionNumber: "desc" };
          select: { id: true };
          take: 1;
          where: {
            questionnaireDraft: { purpose: "SCREENER" };
            status: "ACTIVE";
          };
        };
        status: true;
      };
      where: { code: string };
    }) => Promise<{
      code: string;
      id: string;
      name: string;
      participantPortalConfig: ParticipantPortalConfigRecord | null;
      questionnaireVersions: Array<{ id: string }>;
      status: ParticipantPortalStudyStatus;
    } | null>;
  };
};

export function createParticipantPortalRepository(): ParticipantPortalRepository {
  return {
    async countOtpLogsSince(input) {
      const prisma = (await createPrismaClient()) as PrismaWithParticipantPortal;

      return prisma.participantPortalOtpRequestLog.count({
        where: {
          emailHash: input.emailHash,
          purpose: input.purpose,
          requestedAt: { gte: input.since }
        }
      });
    },
    async createOtpLog(input) {
      const prisma = (await createPrismaClient()) as PrismaWithParticipantPortal;

      await prisma.participantPortalOtpRequestLog.create({
        data: input
      });
    },
    async findInternalUserByAuthUserId(authUserId) {
      const prisma = (await createPrismaClient()) as PrismaWithParticipantPortal;

      return prisma.internalUser.findUnique({
        select: { id: true },
        where: { authUserId }
      });
    },
    async findRecentOtpRequest(input) {
      const prisma = (await createPrismaClient()) as PrismaWithParticipantPortal;

      return prisma.participantPortalOtpRequestLog.findFirst({
        orderBy: { requestedAt: "desc" },
        select: { requestedAt: true },
        where: {
          emailHash: input.emailHash,
          purpose: "OTP_REQUEST",
          requestedAt: { gte: input.since }
        }
      });
    },
    async getStudyByCode(studyCode) {
      const prisma = (await createPrismaClient()) as PrismaWithParticipantPortal;
      const study = await prisma.study.findUnique({
        select: {
          code: true,
          id: true,
          name: true,
          participantPortalConfig: {
            select: {
              enabled: true,
              evidenceRetentionDays: true,
              folioMaxSequence: true,
              folioPrefix: true,
              maxImageBytes: true,
              maxOtpAttempts: true,
              maxPerfumePhotos: true,
              minPerfumePhotos: true,
              nextFolioSequence: true,
              otpCooldownSeconds: true,
              privacyNoticeHash: true,
              privacyNoticeText: true,
              privacyNoticeVersion: true
            }
          },
          questionnaireVersions: {
            orderBy: { versionNumber: "desc" },
            select: { id: true },
            take: 1,
            where: {
              questionnaireDraft: { purpose: "SCREENER" },
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

      return {
        activeScreenerVersionId: study.questionnaireVersions[0]?.id ?? null,
        code: study.code,
        id: study.id,
        name: study.name,
        portalConfig: study.participantPortalConfig,
        status: study.status
      };
    }
  };
}
