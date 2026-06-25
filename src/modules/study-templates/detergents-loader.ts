import {
  DETERGENTS_PORTAL_FOLIO_PREFIX,
  DETERGENTS_PRIVACY_NOTICE_VERSION,
  DETERGENTS_SCREENER_TITLE,
  DETERGENTS_STUDY_NAME,
  DETERGENTS_STUDY_TIME_ZONE,
  createDetergentsScreenerDefinition
} from "./detergents";
import { DETERGENTS_STUDY_CODE } from "./study-behavior";
import { hashPrivacyNotice } from "@/modules/participant-portal/admin-service";
import { hashScreenerDefinition, type ScreenerDefinition } from "@/modules/screener";
import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type DetergentsTemplateActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type DetergentsTemplateStudyRecord = {
  code: string;
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  timeZoneIana: string;
};

export type DetergentsTemplateDraftRecord = {
  definitionJson: unknown;
  id: string;
  studyId: string;
};

export type EnsureDetergentsStudyInput = {
  actorUserId: string;
  definition: ScreenerDefinition;
  definitionHash: string;
  portalConfig: {
    enabled: boolean;
    folioPrefix: string;
    maxPerfumePhotos: number;
    minPerfumePhotos: number;
    privacyNoticeHash: string;
    privacyNoticeText: string;
    privacyNoticeVersion: string;
  };
  study: {
    code: string;
    name: string;
    timeZoneIana: string;
  };
};

export type EnsureDetergentsStudyResult = {
  activeVersionCreated: false;
  activeVersionReused: false;
  draftCreated: boolean;
  draftUpdated: boolean;
  matchedBy: "CODE" | "NAME" | "NONE";
  matchedExistingStudy: boolean;
  partialStudyUpdated: boolean;
  portalConfigUpserted: boolean;
  studyActivated: false;
  studyCreated: boolean;
  studyId: string;
  studyResetToDraft: boolean;
  versionNumber: 0;
};

export type DetergentsTemplateRepository = {
  ensureDetergentsStudy: (
    input: EnsureDetergentsStudyInput
  ) => Promise<EnsureDetergentsStudyResult>;
};

export type DetergentsTemplateLoadResult =
  | {
      data: EnsureDetergentsStudyResult & {
        definitionHash: string;
      };
      ok: true;
    }
  | {
      code: "PARTIAL_STUDY_HAS_DATA" | "UNAUTHORIZED" | "UNKNOWN_ERROR";
      message: string;
      ok: false;
    };

export async function loadDetergentsStudyTemplateForAdmin({
  actor,
  repository = createDetergentsTemplateRepository()
}: {
  actor: DetergentsTemplateActor | null;
  repository?: DetergentsTemplateRepository;
}): Promise<DetergentsTemplateLoadResult> {
  if (!isAdmin(actor)) {
    return {
      code: "UNAUTHORIZED",
      message: "Solo Administrador puede cargar la plantilla del estudio de detergentes.",
      ok: false
    };
  }

  try {
    const definition = createDetergentsScreenerDefinition();
    const definitionHash = hashScreenerDefinition(definition);
    const privacyNoticeText =
      "Aviso de privacidad y consentimiento para participar en el filtro autoaplicable de detergentes y cuidado de la ropa.";
    const result = await repository.ensureDetergentsStudy({
      actorUserId: actor.id,
      definition,
      definitionHash,
      portalConfig: {
        enabled: true,
        folioPrefix: DETERGENTS_PORTAL_FOLIO_PREFIX,
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1,
        privacyNoticeHash: hashPrivacyNotice(privacyNoticeText),
        privacyNoticeText,
        privacyNoticeVersion: DETERGENTS_PRIVACY_NOTICE_VERSION
      },
      study: {
        code: DETERGENTS_STUDY_CODE,
        name: DETERGENTS_STUDY_NAME,
        timeZoneIana: DETERGENTS_STUDY_TIME_ZONE
      }
    });

    return {
      data: {
        ...result,
        definitionHash
      },
      ok: true
    };
  } catch (error) {
    if (error instanceof DetergentsPartialStudyUnsafeError) {
      return {
        code: "PARTIAL_STUDY_HAS_DATA",
        message:
          "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro.",
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No fue posible cargar la plantilla del estudio de detergentes.",
      ok: false
    };
  }
}

type CountDelegate = {
  count: (args: unknown) => Promise<number>;
};

type DetergentsTemplatePrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: DetergentsTemplateTransaction) => Promise<T>) => Promise<T>;
};

type DetergentsTemplateTransaction = {
  participantActivity: CountDelegate;
  participantActivityEvidence: CountDelegate;
  participantConfirmation: CountDelegate;
  participantConsent: CountDelegate;
  participantEvidence: CountDelegate;
  participantPortalStudyConfig: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  participantReferenceCode: CountDelegate;
  questionnaireDraft: {
    create: (args: unknown) => Promise<DetergentsTemplateDraftRecord>;
    findFirst: (args: unknown) => Promise<DetergentsTemplateDraftRecord | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  questionnaireVersion: {
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  researchResponse: CountDelegate;
  screeningAnswer: CountDelegate;
  screeningAttempt: CountDelegate;
  study: {
    create: (args: unknown) => Promise<DetergentsTemplateStudyRecord>;
    findFirst: (args: unknown) => Promise<DetergentsTemplateStudyRecord | null>;
    findUnique: (args: unknown) => Promise<DetergentsTemplateStudyRecord | null>;
    update: (args: unknown) => Promise<DetergentsTemplateStudyRecord>;
  };
  studyParticipant: CountDelegate;
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const draftSelect = {
  definitionJson: true,
  id: true,
  studyId: true
} as const;

export function createDetergentsTemplateRepository(
  prismaClient?: DetergentsTemplatePrismaClient
): DetergentsTemplateRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as DetergentsTemplatePrismaClient);
  }

  return {
    async ensureDetergentsStudy(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        let study = await transaction.study.findUnique({
          select: studySelect,
          where: { code: input.study.code }
        });
        let matchedBy: EnsureDetergentsStudyResult["matchedBy"] = study ? "CODE" : "NONE";
        let partialStudyUpdated = false;
        let studyCreated = false;
        let studyResetToDraft = false;

        if (!study) {
          study = await transaction.study.findFirst({
            orderBy: { createdAt: "desc" },
            select: studySelect,
            where: {
              OR: [
                { name: { contains: "Detergentes", mode: "insensitive" } },
                { name: { contains: "cuidado de la ropa", mode: "insensitive" } }
              ]
            }
          });
          matchedBy = study ? "NAME" : "NONE";
        }

        const operationalRecords = study
          ? await countOperationalStudyRecords(transaction, study.id)
          : 0;
        const hasOperationalData = operationalRecords > 0;

        if (study && study.code !== input.study.code) {
          if (hasOperationalData) {
            throw new DetergentsPartialStudyUnsafeError(study.id);
          }

          studyResetToDraft = study.status !== "DRAFT";
          study = await transaction.study.update({
            data: {
              code: input.study.code,
              name: input.study.name,
              status: "DRAFT",
              timeZoneIana: input.study.timeZoneIana
            },
            select: studySelect,
            where: { id: study.id }
          });
          partialStudyUpdated = true;
        } else if (
          study &&
          (study.name !== input.study.name ||
            study.timeZoneIana !== input.study.timeZoneIana ||
            study.status !== "DRAFT")
        ) {
          if (study.status !== "DRAFT" && hasOperationalData) {
            throw new DetergentsPartialStudyUnsafeError(study.id);
          }

          studyResetToDraft = study.status !== "DRAFT";
          study = await transaction.study.update({
            data: {
              name: input.study.name,
              status: "DRAFT",
              timeZoneIana: input.study.timeZoneIana
            },
            select: studySelect,
            where: { id: study.id }
          });
          partialStudyUpdated = true;
        }

        if (!study) {
          study = await transaction.study.create({
            data: {
              code: input.study.code,
              createdByUserId: input.actorUserId,
              name: input.study.name,
              status: "DRAFT",
              timeZoneIana: input.study.timeZoneIana
            },
            select: studySelect
          });
          studyCreated = true;
        }

        await transaction.participantPortalStudyConfig.upsert({
          create: {
            enabled: input.portalConfig.enabled,
            folioPrefix: input.portalConfig.folioPrefix,
            maxPerfumePhotos: input.portalConfig.maxPerfumePhotos,
            minPerfumePhotos: input.portalConfig.minPerfumePhotos,
            privacyNoticeHash: input.portalConfig.privacyNoticeHash,
            privacyNoticeText: input.portalConfig.privacyNoticeText,
            privacyNoticeVersion: input.portalConfig.privacyNoticeVersion,
            studyId: study.id
          },
          update: {
            enabled: input.portalConfig.enabled,
            folioPrefix: input.portalConfig.folioPrefix,
            maxPerfumePhotos: input.portalConfig.maxPerfumePhotos,
            minPerfumePhotos: input.portalConfig.minPerfumePhotos,
            privacyNoticeHash: input.portalConfig.privacyNoticeHash,
            privacyNoticeText: input.portalConfig.privacyNoticeText,
            privacyNoticeVersion: input.portalConfig.privacyNoticeVersion
          },
          where: { studyId: study.id }
        });

        await transaction.questionnaireVersion.deleteMany({
          where: {
            questionnaireDraft: { purpose: "SCREENER" },
            studyId: study.id
          }
        });

        const existingDraft = await transaction.questionnaireDraft.findFirst({
          orderBy: { createdAt: "desc" },
          select: draftSelect,
          where: {
            purpose: "SCREENER",
            studyId: study.id
          }
        });

        let draftCreated = false;
        let draftUpdated = false;

        if (existingDraft) {
          const updated = await transaction.questionnaireDraft.updateMany({
            data: {
              definitionJson: input.definition,
              name: DETERGENTS_SCREENER_TITLE,
              status: "DRAFT",
              updatedByUserId: input.actorUserId
            },
            where: {
              id: existingDraft.id,
              studyId: study.id
            }
          });
          draftUpdated = updated.count === 1;
        } else {
          await transaction.questionnaireDraft.create({
            data: {
              createdByUserId: input.actorUserId,
              definitionJson: input.definition,
              name: DETERGENTS_SCREENER_TITLE,
              purpose: "SCREENER",
              status: "DRAFT",
              studyId: study.id,
              updatedByUserId: input.actorUserId
            },
            select: draftSelect
          });
          draftCreated = true;
        }

        return {
          activeVersionCreated: false,
          activeVersionReused: false,
          draftCreated,
          draftUpdated,
          matchedBy,
          matchedExistingStudy: !studyCreated,
          partialStudyUpdated,
          portalConfigUpserted: true,
          studyActivated: false,
          studyCreated,
          studyId: study.id,
          studyResetToDraft,
          versionNumber: 0
        };
      });
    }
  };
}

function isAdmin(actor: DetergentsTemplateActor | null): actor is DetergentsTemplateActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

export class DetergentsPartialStudyUnsafeError extends Error {
  constructor(public readonly studyId: string) {
    super("A detergents study with operational data cannot be reset to draft.");
    this.name = "DetergentsPartialStudyUnsafeError";
  }
}

async function countOperationalStudyRecords(
  transaction: DetergentsTemplateTransaction,
  studyId: string
): Promise<number> {
  const studyParticipants = await transaction.studyParticipant.count({ where: { studyId } });
  const screeningAttempts = await transaction.screeningAttempt.count({ where: { studyParticipant: { studyId } } });
  const screeningAnswers = await transaction.screeningAnswer.count({
    where: { screeningAttempt: { studyParticipant: { studyId } } }
  });
  const participantConsents = await transaction.participantConsent.count({
    where: { studyParticipant: { studyId } }
  });
  const participantEvidence = await transaction.participantEvidence.count({
    where: { studyParticipant: { studyId } }
  });
  const participantConfirmations = await transaction.participantConfirmation.count({ where: { studyId } });
  const participantReferenceCodes = await transaction.participantReferenceCode.count({
    where: { confirmation: { studyId } }
  });
  const participantActivities = await transaction.participantActivity.count({
    where: { studyParticipant: { studyId } }
  });
  const participantActivityEvidence = await transaction.participantActivityEvidence.count({
    where: { studyParticipant: { studyId } }
  });
  const researchResponses = await transaction.researchResponse.count({
    where: { participantActivity: { studyParticipant: { studyId } } }
  });

  return (
    studyParticipants +
    screeningAttempts +
    screeningAnswers +
    participantConsents +
    participantEvidence +
    participantConfirmations +
    participantReferenceCodes +
    participantActivities +
    participantActivityEvidence +
    researchResponses
  );
}
