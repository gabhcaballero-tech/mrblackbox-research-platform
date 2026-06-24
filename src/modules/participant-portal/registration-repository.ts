import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type PortalRegistrationParticipantProfile = {
  createdByUserId: string | null;
  email: string | null;
  id: string;
  name: string;
  participantAuthUserId: string | null;
  phone: string | null;
};

export type PortalRegistrationStudyParticipant = {
  createdByUserId: string | null;
  id: string;
  participantProfileId: string;
  screeningAttempts: Array<{ id: string; source: "FIELD" | "PARTICIPANT_PORTAL"; status: string }>;
  studyId: string;
};

export type PortalRegistrationConsent = {
  id?: string;
  noticeVersion: string;
  studyParticipantId: string;
};

export type CreatePortalParticipantProfileInput = {
  email: string | null;
  name: string;
  participantAuthUserId: string;
  phone: string;
};

export type UpdatePortalParticipantProfileInput = {
  email?: string;
  id: string;
  name?: string;
  participantAuthUserId?: string;
  phone?: string;
};

export type CreatePortalStudyParticipantInput = {
  participantProfileId: string;
  studyId: string;
};

export type CreatePortalConsentInput = {
  consentedAt: Date;
  noticeHash: string;
  noticeTextSnapshot: string;
  noticeVersion: string;
  participantAuthUserId: string;
  studyParticipantId: string;
};

export type PortalRegistrationScreeningAttempt = {
  id: string;
  source: "FIELD" | "PARTICIPANT_PORTAL";
  status: string;
  studyParticipantId: string;
};

export type ParticipantPortalRegistrationRepository = {
  createParticipantConsent: (input: CreatePortalConsentInput) => Promise<PortalRegistrationConsent>;
  createParticipantProfile: (input: CreatePortalParticipantProfileInput) => Promise<PortalRegistrationParticipantProfile>;
  createPortalScreeningAttempt: (input: {
    questionnaireVersionId: string;
    studyParticipantId: string;
  }) => Promise<PortalRegistrationScreeningAttempt>;
  createStudyParticipant: (input: CreatePortalStudyParticipantInput) => Promise<PortalRegistrationStudyParticipant>;
  findParticipantConsent: (input: {
    noticeVersion: string;
    studyParticipantId: string;
  }) => Promise<PortalRegistrationConsent | null>;
  findParticipantProfilesForRegistration: (input: {
    email: string | null;
    participantAuthUserId: string;
    phone: string;
  }) => Promise<PortalRegistrationParticipantProfile[]>;
  findStudyParticipant: (input: {
    participantProfileId: string;
    studyId: string;
  }) => Promise<PortalRegistrationStudyParticipant | null>;
  updateParticipantProfile: (input: UpdatePortalParticipantProfileInput) => Promise<PortalRegistrationParticipantProfile>;
};

type ParticipantPortalRegistrationPrismaClient = PrismaClientLike & {
  participantConsent: {
    create: (args: unknown) => Promise<PortalRegistrationConsent>;
    findUnique: (args: unknown) => Promise<PortalRegistrationConsent | null>;
  };
  participantProfile: {
    create: (args: unknown) => Promise<PortalRegistrationParticipantProfile>;
    findMany: (args: unknown) => Promise<PortalRegistrationParticipantProfile[]>;
    update: (args: unknown) => Promise<PortalRegistrationParticipantProfile>;
  };
  screeningAttempt: {
    create: (args: unknown) => Promise<PortalRegistrationScreeningAttempt>;
  };
  studyParticipant: {
    create: (args: unknown) => Promise<PortalRegistrationStudyParticipant>;
    findUnique: (args: unknown) => Promise<PortalRegistrationStudyParticipant | null>;
  };
};

const profileSelect = {
  createdByUserId: true,
  email: true,
  id: true,
  name: true,
  participantAuthUserId: true,
  phone: true
} as const;

const studyParticipantSelect = {
  createdByUserId: true,
  id: true,
  participantProfileId: true,
  screeningAttempts: {
    orderBy: { startedAt: "desc" },
    select: { id: true, source: true, status: true }
  },
  studyId: true
} as const;

const consentSelect = {
  id: true,
  noticeVersion: true,
  studyParticipantId: true
} as const;

export function createParticipantPortalRegistrationRepository(
  prismaClient?: ParticipantPortalRegistrationPrismaClient
): ParticipantPortalRegistrationRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ParticipantPortalRegistrationPrismaClient);
  }

  return {
    async createParticipantConsent(input) {
      const prisma = await getPrisma();

      return prisma.participantConsent.create({
        data: input,
        select: consentSelect
      });
    },
    async createParticipantProfile(input) {
      const prisma = await getPrisma();

      return prisma.participantProfile.create({
        data: {
          createdByUserId: null,
          email: input.email,
          name: input.name,
          participantAuthUserId: input.participantAuthUserId,
          phone: input.phone,
          status: "ACTIVE"
        },
        select: profileSelect
      });
    },
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
        select: {
          id: true,
          source: true,
          status: true,
          studyParticipantId: true
        }
      });
    },
    async createStudyParticipant(input) {
      const prisma = await getPrisma();

      return prisma.studyParticipant.create({
        data: {
          createdByUserId: null,
          operationalStatus: "CREATED",
          participantProfileId: input.participantProfileId,
          screeningStatus: "NOT_STARTED",
          studyId: input.studyId
        },
        select: studyParticipantSelect
      });
    },
    async findParticipantConsent(input) {
      const prisma = await getPrisma();

      return prisma.participantConsent.findUnique({
        select: consentSelect,
        where: {
          studyParticipantId_noticeVersion: {
            noticeVersion: input.noticeVersion,
            studyParticipantId: input.studyParticipantId
          }
        }
      });
    },
    async findParticipantProfilesForRegistration(input) {
      const prisma = await getPrisma();
      const or = [
        { participantAuthUserId: input.participantAuthUserId },
        input.email ? { email: input.email } : null,
        { phone: input.phone }
      ].filter(Boolean);

      return prisma.participantProfile.findMany({
        orderBy: { createdAt: "asc" },
        select: profileSelect,
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
    async updateParticipantProfile(input) {
      const prisma = await getPrisma();
      const { id, ...data } = input;

      return prisma.participantProfile.update({
        data,
        select: profileSelect,
        where: { id }
      });
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
