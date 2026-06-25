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

export type DetergentsTemplateVersionRecord = {
  definitionHash: string;
  id: string;
  status: "ACTIVE" | "RETIRED";
  versionNumber: number;
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
  activeVersionCreated: boolean;
  activeVersionReused: boolean;
  draftCreated: boolean;
  matchedBy: "CODE" | "NAME" | "NONE";
  matchedExistingStudy: boolean;
  partialStudyUpdated: boolean;
  portalConfigUpserted: boolean;
  studyActivated: boolean;
  studyCreated: boolean;
  studyId: string;
  versionNumber: number;
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
          "Se encontro un estudio parcial relacionado con detergentes, pero ya tiene datos operativos. Archivarlo o limpiarlo antes de cargar la plantilla definitiva.",
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

type DetergentsTemplatePrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: DetergentsTemplateTransaction) => Promise<T>) => Promise<T>;
};

type DetergentsTemplateTransaction = {
  participantPortalStudyConfig: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  questionnaireDraft: {
    create: (args: unknown) => Promise<DetergentsTemplateDraftRecord>;
    findFirst: (args: unknown) => Promise<DetergentsTemplateDraftRecord | null>;
  };
  questionnaireVersion: {
    create: (args: unknown) => Promise<DetergentsTemplateVersionRecord>;
    findFirst: (args: unknown) => Promise<DetergentsTemplateVersionRecord | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  study: {
    create: (args: unknown) => Promise<DetergentsTemplateStudyRecord>;
    findFirst: (args: unknown) => Promise<DetergentsTemplateStudyRecord | null>;
    findUnique: (args: unknown) => Promise<DetergentsTemplateStudyRecord | null>;
    update: (args: unknown) => Promise<DetergentsTemplateStudyRecord>;
  };
  studyParticipant: {
    count: (args: unknown) => Promise<number>;
  };
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

const versionSelect = {
  definitionHash: true,
  id: true,
  status: true,
  versionNumber: true
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
        let studyCreated = false;
        let partialStudyUpdated = false;

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

        if (study && study.code !== input.study.code) {
          const participantsCount = await transaction.studyParticipant.count({
            where: { studyId: study.id }
          });

          if (participantsCount > 0) {
            throw new DetergentsPartialStudyUnsafeError(study.id);
          }

          study = await transaction.study.update({
            data: {
              code: input.study.code,
              name: input.study.name,
              timeZoneIana: input.study.timeZoneIana
            },
            select: studySelect,
            where: { id: study.id }
          });
          partialStudyUpdated = true;
        } else if (study && (study.name !== input.study.name || study.timeZoneIana !== input.study.timeZoneIana)) {
          study = await transaction.study.update({
            data: {
              name: input.study.name,
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

        const activeVersion = await transaction.questionnaireVersion.findFirst({
          orderBy: { versionNumber: "desc" },
          select: versionSelect,
          where: {
            questionnaireDraft: { purpose: "SCREENER" },
            status: "ACTIVE",
            studyId: study.id
          }
        });

        let activeVersionReused = activeVersion?.definitionHash === input.definitionHash;
        let activeVersionCreated = false;
        let draftCreated = false;
        let versionNumber = activeVersion?.versionNumber ?? 0;

        if (!activeVersionReused) {
          const draft = await transaction.questionnaireDraft.create({
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

          const latestVersion = await transaction.questionnaireVersion.findFirst({
            orderBy: { versionNumber: "desc" },
            select: versionSelect,
            where: {
              questionnaireDraft: { purpose: "SCREENER" },
              studyId: study.id
            }
          });

          await transaction.questionnaireVersion.updateMany({
            data: {
              retiredAt: new Date(),
              retiredByUserId: input.actorUserId,
              status: "RETIRED"
            },
            where: {
              questionnaireDraft: { purpose: "SCREENER" },
              status: "ACTIVE",
              studyId: study.id
            }
          });

          const version = await transaction.questionnaireVersion.create({
            data: {
              definitionHash: input.definitionHash,
              definitionJson: input.definition,
              publishedByUserId: input.actorUserId,
              questionnaireDraftId: draft.id,
              status: "ACTIVE",
              studyId: study.id,
              versionNumber: (latestVersion?.versionNumber ?? 0) + 1
            },
            select: versionSelect
          });
          activeVersionCreated = true;
          activeVersionReused = false;
          versionNumber = version.versionNumber;
        }

        let studyActivated = false;
        if (study.status === "DRAFT") {
          study = await transaction.study.update({
            data: { status: "ACTIVE" },
            select: studySelect,
            where: { id: study.id }
          });
          studyActivated = true;
        }

        return {
          activeVersionCreated,
          activeVersionReused,
          draftCreated,
          matchedBy,
          matchedExistingStudy: !studyCreated,
          partialStudyUpdated,
          portalConfigUpserted: true,
          studyActivated,
          studyCreated,
          studyId: study.id,
          versionNumber
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
    super("A partial detergents study already has operational data.");
    this.name = "DetergentsPartialStudyUnsafeError";
  }
}
