import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type {
  ParticipantPortalConfigRecord,
  ParticipantPortalStudyStatus
} from "./repository";

export type ParticipantPortalAdminStudyRecord = {
  activeScreenerVersionId: string | null;
  code: string;
  id: string;
  name: string;
  portalConfig: ParticipantPortalConfigRecord | null;
  status: ParticipantPortalStudyStatus;
};

export type SaveParticipantPortalConfigInput = ParticipantPortalConfigRecord & {
  studyId: string;
};

export type ParticipantPortalAdminRepository = {
  getStudyPortalConfig: (studyId: string) => Promise<ParticipantPortalAdminStudyRecord | null>;
  saveStudyPortalConfig: (input: SaveParticipantPortalConfigInput) => Promise<ParticipantPortalConfigRecord>;
};

type ParticipantPortalAdminPrismaClient = PrismaClientLike & {
  participantPortalStudyConfig: {
    upsert: (args: unknown) => Promise<ParticipantPortalConfigRecord>;
  };
  study: {
    findUnique: (args: unknown) => Promise<{
      code: string;
      id: string;
      name: string;
      participantPortalConfig: ParticipantPortalConfigRecord | null;
      questionnaireVersions: Array<{ id: string }>;
      status: ParticipantPortalStudyStatus;
    } | null>;
  };
};

const portalConfigSelect = {
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
} as const;

export function createParticipantPortalAdminRepository(
  prismaClient?: ParticipantPortalAdminPrismaClient
): ParticipantPortalAdminRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ParticipantPortalAdminPrismaClient);
  }

  return {
    async getStudyPortalConfig(studyId) {
      const prisma = await getPrisma();
      const study = await prisma.study.findUnique({
        select: {
          code: true,
          id: true,
          name: true,
          participantPortalConfig: {
            select: portalConfigSelect
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
        where: { id: studyId }
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
    },
    async saveStudyPortalConfig(input) {
      const prisma = await getPrisma();
      const { studyId, ...data } = input;

      return prisma.participantPortalStudyConfig.upsert({
        create: {
          ...data,
          studyId
        },
        select: portalConfigSelect,
        update: data,
        where: { studyId }
      });
    }
  };
}
