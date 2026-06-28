import { createHash, randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  createSupabaseEvidenceStorageClient,
  validateEvidenceUploadMetadata,
  type EvidenceStorageClient,
  type EvidenceUploadMetadata
} from "@/modules/participant-portal/evidence-storage";
import { buildResearchResponseKey } from "@/modules/responses";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import {
  NAVIGO_ACTIVITY_CODES,
  NAVIGO_T0_IDENTITY_QUESTION_ID,
  createNavigoMeasurementDefinition,
  resolveNavigoTimeZone,
  type NavigoActivityCode
} from "./definition";
import {
  buildNavigoActivityTimeline,
  buildNavigoRotationChecklist,
  buildNavigoStartT0PendingMessage,
  buildNavigoTsv,
  countNavigoMeasurementResponses,
  createNavigoRotationPlanCode,
  isNavigoT0Complete,
  isNavigoEmail,
  isNavigoPhone,
  navigoActivityLabel,
  normalizeNavigoEmail,
  normalizeNavigoFolio,
  normalizeNavigoParticipantName,
  normalizeNavigoPhone,
  normalizeNavigoRotationCode,
  prepareNavigoParticipantActivities,
  readNavigoIdentityStatusFromResponses,
  validateNavigoMeasurementAnswers,
  type NavigoActivityRecord,
  type NavigoAnswerInput,
  type NavigoParticipantImportRowInput,
  type NavigoRotationChecklist,
  type NavigoRotationImportRowInput,
  type NavigoScheduleRecord
} from "./service";
import {
  normalizeNavigoFaceVerificationForStorage,
  type NavigoFaceVerificationClientResult
} from "./face-verification-contract";
import { generateParticipantReferenceCode, generateReferenceCodes } from "@/modules/participant-portal/review";

export type NavigoInternalActor = {
  id: string;
  role: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
  status: "ACTIVE" | "INACTIVE";
};

export type NavigoStudySummary = {
  code: string;
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
  timeZoneIana: string;
};

export type NavigoParticipantListItem = {
  activities: NavigoActivityListItem[];
  alert: string;
  applicationStartedAt: Date | null;
  confirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
    screeningAttempt?: { evaluationJson: unknown } | null;
  } | null;
  hasRecoverableToken: boolean;
  participantLinkToken: string | null;
  id: string;
  participant: {
    email: string | null;
    name: string;
    phone: string | null;
  };
  registeredSelfie: {
    signedUrl: string;
  } | null;
  rotation: {
    checklist: NavigoRotationChecklist;
    leftCode: string | null;
    ready: boolean;
    rightCode: string | null;
    startPendingMessage: string | null;
  };
  rotationReady: boolean;
  status: "APPROVED" | "CONFIRMED" | "PENDING" | "REJECTED" | "TERMINATED";
};

export type NavigoActivityListItem = NavigoActivityRecord & {
  availability?: ReturnType<typeof buildNavigoActivityTimeline>[number]["availability"];
  code: NavigoActivityCode;
  activitySelfie: {
    id: string;
    internalNote: string | null;
    rejectionReason: string | null;
    reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
    reviewedAt: Date | null;
    signedUrl: string | null;
    uploadedAt: Date;
  } | null;
  evidenceCount: number;
  existingResponses: Record<string, unknown>;
  readableResponses: Array<{
    label: string;
    questionId: string;
    text: string;
    value: string;
  }>;
  responseCount: number;
};

export type NavigoAdminDashboard = {
  participants: NavigoParticipantListItem[];
  study: NavigoStudySummary;
  timeZoneIana: string;
};

export type NavigoStartT0Result =
  | {
      linkToken: string;
      message: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoParticipantLinkResult =
  | {
      linkToken: string;
      message: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoMaintenanceResult =
  | {
      message: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoConfigureRotationInput = {
  actorUserId: string;
  leftFragranceCode: string;
  rightFragranceCode: string;
  studyParticipantId: string;
  triangularCode1?: string | null;
  triangularCode2?: string | null;
};

export type NavigoRotationImportPreviewRow = NavigoRotationImportRowInput & {
  errors: string[];
  existingRotation: boolean;
  rowNumber: number;
  t0Started: boolean;
  updatable: boolean;
};

export type NavigoRotationImportPreview = {
  rows: NavigoRotationImportPreviewRow[];
  summary: {
    duplicateFolios: number;
    foundFolios: number;
    rowsWithError: number;
    t0Started: number;
    totalRows: number;
    updatable: number;
    validRows: number;
    missingFolios: number;
  };
};

export type NavigoParticipantRegistrationInput = {
  actorUserId: string;
  celular: string;
  correo?: string | null;
  folio: string;
  generateLink?: boolean;
  nombre: string;
  observaciones?: string | null;
  primeraFragancia: string;
  reclutador?: string | null;
  segundaFragancia: string;
  studyId: string;
};

export type NavigoParticipantImportPreviewRow = NavigoParticipantImportRowInput & {
  celularDuplicado: boolean;
  errors: string[];
  existingFolio: boolean;
  existingParticipant: boolean;
  folioNuevo: boolean;
  rowNumber: number;
  rotationComplete: boolean;
  updatable: boolean;
};

export type NavigoParticipantImportPreview = {
  rows: NavigoParticipantImportPreviewRow[];
  summary: {
    duplicatePhones: number;
    existingFolios: number;
    newFolios: number;
    phoneDuplicates: number;
    rotationComplete: number;
    rowsWithError: number;
    totalRows: number;
    validRows: number;
  };
};

export type NavigoParticipantImportResult = {
  created: number;
  errors: number;
  linksCreated: number;
  omitted: number;
  preview: NavigoParticipantImportPreview;
  updated: number;
};

export type NavigoBulkLinkResult = {
  created: number;
  errors: number;
  existing: number;
  regenerated: number;
};

export type NavigoLinksExportResult = {
  body: string;
  filename: string;
};

export type NavigoParticipantActivitiesView =
  | {
      message: string;
      ok: false;
    }
  | {
      data: {
        blindLabels: {
          left: string;
          right: string;
        };
        folio: string;
        testMode: boolean;
        nextActivity: ReturnType<typeof buildNavigoActivityTimeline>[number] | null;
        participantName: string;
        study: NavigoStudySummary;
        timeline: ReturnType<typeof buildNavigoActivityTimeline>;
        timeZoneIana: string;
      };
      ok: true;
    };

export type NavigoActivityCaptureView =
  | {
      message: string;
      ok: false;
    }
  | {
      data: {
        activity: ReturnType<typeof buildNavigoActivityTimeline>[number];
        blindLabels: {
          left: string;
          right: string;
        };
        existingResponses: Record<string, unknown>;
        folio: string;
        participantName: string;
        questions: ReturnType<typeof createNavigoMeasurementDefinition>["questions"];
        registeredSelfie: {
          signedUrl: string;
        } | null;
        selfieReviewStatus: "APPROVED" | "PENDING" | "REJECTED" | null;
        selfieCount: number;
        study: NavigoStudySummary;
        testMode: boolean;
        timeZoneIana: string;
      };
      ok: true;
    };

export type NavigoSignedActivityUpload = {
  metadata: EvidenceUploadMetadata;
  privateStorageKey: string;
  storageBucket: string;
  token: string;
};

export type NavigoActionResult<T = unknown> =
  | {
      data: T;
      ok: true;
    }
  | {
      data?: T;
      message: string;
      ok: false;
    };

export type NavigoAppRepository = {
  applyParticipantImport: (input: {
    actorUserId: string;
    generateLinks?: boolean;
    rows: NavigoParticipantImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoParticipantImportResult>>;
  configureParticipantRotation: (input: NavigoConfigureRotationInput) => Promise<NavigoActionResult<{
    rotationCode: string;
    leftFragranceCode: string;
    rightFragranceCode: string;
  }>>;
  confirmActivitySelfieUpload: (input: {
    activityId: string;
    metadata: EvidenceUploadMetadata & {
      faceVerification?: NavigoFaceVerificationClientResult | null;
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<NavigoActionResult<{
    internalNote: string | null;
    reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
    selfieCount: number;
  }>>;
  confirmT0Identity: (input: {
    activityId: string;
    identityConfirmed: "NO" | "YES";
    now?: Date;
    token: string;
  }) => Promise<NavigoActionResult<{ identityStatus: "CONFIRMED" | "REJECTED" }>>;
  getActivityCaptureView: (input: {
    activityId: string;
    now?: Date;
    storage?: EvidenceStorageClient;
    testMode?: boolean;
    token: string;
  }) => Promise<NavigoActivityCaptureView>;
  getAdminDashboard: (studyId: string, now?: Date) => Promise<NavigoAdminDashboard | null>;
  getParticipantActivitiesView: (input: { now?: Date; testMode?: boolean; token: string }) => Promise<NavigoParticipantActivitiesView>;
  generateParticipantLink: (input: {
    actorUserId: string;
    forceRegenerate?: boolean;
    now?: Date;
    studyParticipantId: string;
  }) => Promise<NavigoParticipantLinkResult>;
  generateParticipantLinksForStudy: (input: {
    actorUserId: string;
    forceRegenerate?: boolean;
    now?: Date;
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoBulkLinkResult>>;
  exportLinksAndRotation: (input: {
    now?: Date;
    requestOrigin: string;
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoLinksExportResult>>;
  previewParticipantImport: (input: {
    rows: NavigoParticipantImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoParticipantImportPreview>>;
  previewRotationImport: (input: {
    rows: NavigoRotationImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationImportPreview>>;
  registerDirectParticipant: (input: NavigoParticipantRegistrationInput) => Promise<NavigoActionResult<{
    linkToken: string | null;
    studyParticipantId: string;
  }>>;
  applyRotationImport: (input: {
    actorUserId: string;
    rows: NavigoRotationImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationImportPreview>>;
  requestActivitySelfieUpload: (input: {
    activityId: string;
    metadata: EvidenceUploadMetadata;
    storage?: EvidenceStorageClient;
    token: string;
  }) => Promise<NavigoActionResult<NavigoSignedActivityUpload>>;
  reviewActivityIdentity: (input: {
    actorUserId: string;
    evidenceId: string;
    internalNote?: string | null;
    rejectionReason?: string | null;
    status: "APPROVED" | "PENDING" | "REJECTED";
    studyId: string;
  }) => Promise<NavigoMaintenanceResult>;
  resetParticipantApp: (input: {
    actorUserId: string;
    reason: string;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult>;
  deleteParticipantStagesFrom: (input: {
    actorUserId: string;
    fromCode: NavigoActivityCode;
    reason: string;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult>;
  startT0: (input: {
    actorUserId: string;
    applicationStartedAt: Date;
    now?: Date;
    studyParticipantId: string;
    t0Answers: NavigoAnswerInput;
  }) => Promise<NavigoStartT0Result>;
  submitActivityResponses: (input: {
    activityId: string;
    answers: NavigoAnswerInput;
    now?: Date;
    testMode?: boolean;
    token: string;
  }) => Promise<NavigoActionResult<{ completedAt: Date }>>;
};

type Delegate = {
  create?: (args: unknown) => Promise<unknown>;
  createMany?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
};

type NavigoPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: NavigoTransactionClient) => Promise<T>) => Promise<T>;
  activitySchedule: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  participantArmAssignment: Delegate;
  participantConfirmation: Delegate;
  participantProfile: Delegate;
  participantReferenceCode: Delegate;
  participantRotationAssignment: Delegate;
  questionnaireVersion: Delegate;
  researchResponse: Delegate;
  rotationPlan: Delegate;
  rotationPlanArm: Delegate;
  screeningAttempt: Delegate;
  studyArm: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
  studyProduct: Delegate;
};

type NavigoTransactionClient = Omit<NavigoPrismaClient, "$connect" | "$disconnect" | "$transaction"> & {
  applicationTimeEvent: Delegate;
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const activitySelect = {
  activitySchedule: {
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      questionnaireVersionId: true,
      sortOrder: true,
      status: true,
      type: true,
      windowEndsMinutes: true,
      windowStartsMinutes: true
    }
  },
  activityScheduleId: true,
  actualCompletedAt: true,
  actualStartedAt: true,
  availableFrom: true,
  availableUntil: true,
  id: true,
  occurrenceKey: true,
  participantActivityEvidence: {
    select: {
      id: true,
      internalNote: true,
      participantActivityId: true,
      privateStorageKey: true,
      rejectionReason: true,
      reviewStatus: true,
      reviewedAt: true,
      storageBucket: true,
      uploadedAt: true,
      type: true
    }
  },
  responses: {
    select: {
      answerJson: true,
      questionId: true
    }
  },
  scheduledAt: true,
  status: true
} as const;

const participantSelect = {
  applicationStartedAt: true,
  id: true,
  participantConfirmation: {
    select: {
      folio: true,
      screeningAttempt: {
        select: {
          evaluationJson: true
        }
      },
      referenceCodes: {
        orderBy: { slot: "asc" },
        select: {
          code: true,
          slot: true
        }
      }
    }
  },
  participantProfile: {
    select: {
      email: true,
      id: true,
      name: true,
      phone: true
    }
  },
  participantEvidence: {
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      privateStorageKey: true,
      storageBucket: true,
      type: true
    },
    take: 1,
    where: { type: "SELFIE_IDENTIFICATION" }
  },
  participantScreeningReviews: {
    orderBy: { createdAt: "desc" },
    select: {
      status: true
    },
    take: 1
  },
  rotationAssignment: {
    select: {
      rotationCode: true,
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
          studyArm: {
            select: {
              code: true,
              label: true,
              sortOrder: true
            }
          },
          studyProduct: {
            select: {
              displayLabel: true,
              id: true,
              internalCode: true
            }
          }
        }
      }
    }
  },
  screeningStatus: true,
  study: {
    select: studySelect
  }
} as const;

const participantWithActivitiesSelect = {
  ...participantSelect,
  accessTokens: {
    orderBy: { createdAt: "desc" },
    select: {
      expiresAt: true,
      id: true,
      status: true,
      tokenHash: true
    },
    take: 1,
    where: { status: "ACTIVE" }
  },
  activities: {
    orderBy: {
      scheduledAt: "asc"
    },
    select: activitySelect,
    where: {
      activitySchedule: {
        code: {
          in: NAVIGO_ACTIVITY_CODES
        }
      }
    }
  }
} as const;

const participantImportLookupSelect = {
  id: true,
  participantConfirmation: {
    select: {
      folio: true
    }
  },
  participantProfile: {
    select: {
      email: true,
      id: true,
      name: true,
      phone: true
    }
  }
} as const;

type StudyRecord = NavigoStudySummary;
type ParticipantImportLookupRecord = {
  id: string;
  participantConfirmation: {
    folio: string;
  } | null;
  participantProfile: {
    email: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
};
type ParticipantRecord = {
  accessTokens?: Array<{ expiresAt: Date; id: string; status: string; tokenHash: string }>;
  activities?: ActivityRecord[];
  applicationStartedAt: Date | null;
  id: string;
  participantConfirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
    screeningAttempt?: { evaluationJson: unknown } | null;
  } | null;
  participantEvidence: Array<{
    id: string;
    privateStorageKey: string;
    storageBucket: string;
    type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  }>;
  participantProfile: { email: string | null; id: string; name: string; phone: string | null };
  participantScreeningReviews: Array<{ status: "APPROVED" | "PENDING" | "REJECTED" }>;
  rotationAssignment: {
    rotationCode: string;
    arms: Array<{
      applicationOrder: number;
      participantVisibleLabel: string;
      studyArm: { code: string; label: string; sortOrder: number };
      studyProduct: { displayLabel: string; id: string; internalCode: string };
    }>;
  } | null;
  screeningStatus: "INCOMPLETE" | "NOT_STARTED" | "PASSED" | "PENDING_REVIEW" | "STARTED" | "TERMINATED";
  study: StudyRecord;
};
type ActivityRecord = NavigoActivityRecord & {
  activitySchedule: NavigoScheduleRecord & { questionnaireVersionId: string | null };
  id: string;
  participantActivityEvidence: Array<{
    id: string;
    internalNote: string | null;
    participantActivityId: string;
    privateStorageKey: string;
    rejectionReason: string | null;
    reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
    reviewedAt: Date | null;
    storageBucket: string;
    type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
    uploadedAt: Date;
  }>;
  responses: Array<{ answerJson: unknown; questionId: string }>;
};
type ConfirmationWithParticipant = {
  folio: string;
  studyParticipant: ParticipantRecord;
};

export function createNavigoAppRepository(prismaClient?: NavigoPrismaClient): NavigoAppRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as NavigoPrismaClient);
  }

  async function getParticipantByToken(token: string, prisma: NavigoPrismaClient | NavigoTransactionClient, now = new Date()) {
    const record = (await prisma.participantAccessToken.findFirst?.({
      select: {
        expiresAt: true,
        id: true,
        lastUsedAt: true,
        status: true,
        studyParticipant: {
          select: participantWithActivitiesSelect
        },
        studyParticipantId: true,
        tokenHash: true
      },
      where: {
        status: "ACTIVE",
        tokenHash: hashToken(token)
      }
    })) as
      | {
          expiresAt: Date;
          id: string;
          status: "ACTIVE" | "EXPIRED" | "REVOKED";
          studyParticipant: ParticipantRecord;
        }
      | null;

    if (!record || record.expiresAt.getTime() < now.getTime()) {
      return null;
    }

    await prisma.participantAccessToken.update?.({
      data: { lastUsedAt: now },
      where: { id: record.id }
    });

    return record.studyParticipant;
  }

  async function resetOrDeleteNavigoStages({
    actorUserId,
    fromCode,
    mode,
    reason,
    studyParticipantId
  }: {
    actorUserId: string;
    fromCode: NavigoActivityCode;
    mode: "delete-from-stage" | "reset-app";
    reason: string;
    studyParticipantId: string;
  }): Promise<NavigoMaintenanceResult> {
    const prisma = await getPrisma();
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const participant = (await tx.studyParticipant.findUnique?.({
        select: participantWithActivitiesSelect,
        where: { id: studyParticipantId }
      })) as ParticipantRecord | null;

      if (!participant) {
        return { message: "No encontramos el participante.", ok: false };
      }

      if (participant.study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite estas correcciones.", ok: false };
      }

      const codesToDelete = navigoCodesFrom(fromCode);
      const activitiesToDelete = (participant.activities ?? []).filter((activity) =>
        codesToDelete.includes(activity.activitySchedule.code)
      );
      const activityIds = activitiesToDelete.map((activity) => activity.id);

      if (activityIds.length > 0) {
        await tx.researchResponse.deleteMany?.({
          where: {
            participantActivityId: { in: activityIds }
          }
        });
        await tx.participantActivityEvidence.deleteMany?.({
          where: {
            participantActivityId: { in: activityIds }
          }
        });
        await tx.participantActivity.deleteMany?.({
          where: {
            id: { in: activityIds }
          }
        });
      }

      if (fromCode === "T0_SALON") {
        await tx.studyParticipant.update?.({
          data: {
            applicationStartedAt: null,
            applicationStartedAtCorrectedAt: now,
            operationalStatus: "CREATED"
          },
          where: { id: participant.id }
        });
        await tx.participantAccessToken.updateMany?.({
          data: {
            revokedAt: now,
            revokedByUserId: actorUserId,
            revocationReason: "REGENERATED",
            status: "REVOKED"
          },
          where: {
            status: "ACTIVE",
            studyParticipantId: participant.id
          }
        });
      } else if (participant.applicationStartedAt) {
        await recreatePendingNavigoActivities({
          now,
          participant,
          prisma: tx,
          remainingActivities: (participant.activities ?? [])
            .filter((activity) => !activityIds.includes(activity.id))
            .map(toNavigoActivityRecord)
        });
      }

      await tx.applicationTimeEvent.create?.({
        data: {
          activityStateAtEvent: activityStateAtEvent((participant.activities ?? []).map(toNavigoActivityRecord)),
          createdByUserId: actorUserId,
          eventType: "CORRECTED",
          newApplicationStartedAt: participant.applicationStartedAt ?? now,
          previousApplicationStartedAt: participant.applicationStartedAt,
          reason: `${mode === "reset-app" ? "Reinicio App Navigo" : `Eliminacion de etapa ${fromCode} y posteriores`}: ${reason}`,
          studyParticipantId: participant.id,
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
        }
      });

      return {
        message:
          mode === "reset-app"
            ? "App Navigo reiniciada correctamente."
            : "Etapas seleccionadas eliminadas correctamente.",
        ok: true
      };
    });
  }

  return {
    async registerDirectParticipant(input) {
      const normalized = normalizeNavigoParticipantRegistrationInput(input);

      if (!normalized.ok) {
        return {
          message: normalized.message,
          ok: false
        };
      }

      const prisma = await getPrisma();
      const now = new Date();

      try {
        return await prisma.$transaction(async (tx) => {
          const study = (await tx.study.findUnique?.({
            select: studySelect,
            where: { id: input.studyId }
          })) as StudyRecord | null;

          if (!study || study.code !== NAVIGO_STUDY_CODE) {
            return { message: "Solo el estudio Navigo permite registrar participantes directos.", ok: false };
          }

          const registered = await upsertNavigoDirectParticipant({
            actorUserId: input.actorUserId,
            generateLink: Boolean(input.generateLink),
            now,
            prisma: tx,
            row: normalized.data,
            study
          });

          return {
            data: {
              linkToken: registered.linkToken,
              studyParticipantId: registered.participant.id
            },
            ok: true
          };
        });
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : "No fue posible registrar el participante.",
          ok: false
        };
      }
    },

    async configureParticipantRotation(input) {
      const leftFragranceCode = normalizeNavigoRotationCode(input.leftFragranceCode);
      const rightFragranceCode = normalizeNavigoRotationCode(input.rightFragranceCode);

      if (!leftFragranceCode || !rightFragranceCode) {
        return {
          message: "Captura los codigos de primera y segunda fragancia.",
          ok: false
        };
      }

      if (leftFragranceCode === rightFragranceCode) {
        return {
          message: "Los codigos de brazo izquierdo y derecho deben ser distintos.",
          ok: false
        };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        if (participant.study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite configurar rotacion de App Navigo.", ok: false };
        }

        if (!participant.participantConfirmation || participantStatus(participant) !== "APPROVED") {
          return { message: "Solo participantes confirmados con folio pueden recibir rotacion.", ok: false };
        }

        if (hasT0Started(participant)) {
          return { message: "No se puede modificar rotacion porque T0 ya fue iniciado.", ok: false };
        }

        const studyId = participant.study.id;
        const rotationCode = createNavigoRotationPlanCode({
          folio: participant.participantConfirmation.folio,
          leftFragranceCode,
          rightFragranceCode
        });
        const leftArm = (await tx.studyArm.upsert?.({
          create: {
            code: "LEFT",
            label: "Brazo izquierdo",
            sortOrder: 1,
            studyId
          },
          update: {
            label: "Brazo izquierdo",
            sortOrder: 1
          },
          where: {
            studyId_code: {
              code: "LEFT",
              studyId
            }
          }
        })) as { id: string };
        const rightArm = (await tx.studyArm.upsert?.({
          create: {
            code: "RIGHT",
            label: "Brazo derecho",
            sortOrder: 2,
            studyId
          },
          update: {
            label: "Brazo derecho",
            sortOrder: 2
          },
          where: {
            studyId_code: {
              code: "RIGHT",
              studyId
            }
          }
        })) as { id: string };
        const leftProduct = (await tx.studyProduct.upsert?.({
          create: {
            displayLabel: "Primera fragancia",
            internalCode: leftFragranceCode,
            isSensitive: true,
            realName: leftFragranceCode,
            studyId
          },
          update: {
            displayLabel: "Primera fragancia",
            isSensitive: true
          },
          where: {
            studyId_internalCode: {
              internalCode: leftFragranceCode,
              studyId
            }
          }
        })) as { id: string };
        const rightProduct = (await tx.studyProduct.upsert?.({
          create: {
            displayLabel: "Segunda fragancia",
            internalCode: rightFragranceCode,
            isSensitive: true,
            realName: rightFragranceCode,
            studyId
          },
          update: {
            displayLabel: "Segunda fragancia",
            isSensitive: true
          },
          where: {
            studyId_internalCode: {
              internalCode: rightFragranceCode,
              studyId
            }
          }
        })) as { id: string };
        const rotationPlan = (await tx.rotationPlan.upsert?.({
          create: {
            assignmentModeAllowed: "MANUAL",
            name: rotationCode,
            rotationCode,
            status: "ACTIVE",
            studyId
          },
          select: {
            id: true
          },
          update: {
            assignmentModeAllowed: "MANUAL",
            name: rotationCode,
            status: "ACTIVE"
          },
          where: {
            studyId_rotationCode: {
              rotationCode,
              studyId
            }
          }
        })) as { id: string };

        await tx.rotationPlanArm.deleteMany?.({
          where: { rotationPlanId: rotationPlan.id }
        });
        await tx.rotationPlanArm.createMany?.({
          data: [
            {
              applicationOrder: 1,
              participantVisibleLabel: "Primera fragancia",
              rotationPlanId: rotationPlan.id,
              studyArmId: leftArm.id,
              studyProductId: leftProduct.id
            },
            {
              applicationOrder: 2,
              participantVisibleLabel: "Segunda fragancia",
              rotationPlanId: rotationPlan.id,
              studyArmId: rightArm.id,
              studyProductId: rightProduct.id
            }
          ]
        });

        const rotationAssignment = (await tx.participantRotationAssignment.upsert?.({
          create: {
            assignedByUserId: input.actorUserId,
            assignmentMode: "MANUAL_COVER_CODE",
            rotationCode,
            rotationPlanId: rotationPlan.id,
            studyParticipantId: participant.id
          },
          select: { id: true },
          update: {
            changedAt: new Date(),
            rotationCode,
            rotationPlanId: rotationPlan.id
          },
          where: {
            studyParticipantId: participant.id
          }
        })) as { id: string };

        await tx.participantArmAssignment.upsert?.({
          create: {
            applicationOrder: 1,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Primera fragancia",
            studyArmId: leftArm.id,
            studyParticipantId: participant.id,
            studyProductId: leftProduct.id
          },
          update: {
            applicationOrder: 1,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Primera fragancia",
            studyProductId: leftProduct.id
          },
          where: {
            studyParticipantId_studyArmId: {
              studyArmId: leftArm.id,
              studyParticipantId: participant.id
            }
          }
        });
        await tx.participantArmAssignment.upsert?.({
          create: {
            applicationOrder: 2,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Segunda fragancia",
            studyArmId: rightArm.id,
            studyParticipantId: participant.id,
            studyProductId: rightProduct.id
          },
          update: {
            applicationOrder: 2,
            participantRotationAssignmentId: rotationAssignment.id,
            participantVisibleLabel: "Segunda fragancia",
            studyProductId: rightProduct.id
          },
          where: {
            studyParticipantId_studyArmId: {
              studyArmId: rightArm.id,
              studyParticipantId: participant.id
            }
          }
        });

        return {
          data: {
            leftFragranceCode,
            rotationCode,
            rightFragranceCode
          },
          ok: true
        };
      });
    },

    async getAdminDashboard(studyId, now = new Date()) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: studyId }
      })) as StudyRecord | null;

      if (!study) {
        return null;
      }

      const participants = (await prisma.studyParticipant.findMany?.({
        orderBy: {
          participantConfirmation: {
            folioSequence: "asc"
          }
        },
        select: participantWithActivitiesSelect,
        where: {
          participantConfirmation: {
            isNot: null
          },
          studyId
        }
      })) as ParticipantRecord[];

      const storage = createSupabaseEvidenceStorageClient();

      return {
        participants: await Promise.all(participants.map((participant) => toDashboardParticipant(participant, now, storage))),
        study,
        timeZoneIana: resolveNavigoTimeZone(study.timeZoneIana)
      };
    },

    async resetParticipantApp(input) {
      return resetOrDeleteNavigoStages({
        actorUserId: input.actorUserId,
        fromCode: "T0_SALON",
        mode: "reset-app",
        reason: input.reason,
        studyParticipantId: input.studyParticipantId
      });
    },

    async deleteParticipantStagesFrom(input) {
      return resetOrDeleteNavigoStages({
        actorUserId: input.actorUserId,
        fromCode: input.fromCode,
        mode: "delete-from-stage",
        reason: input.reason,
        studyParticipantId: input.studyParticipantId
      });
    },

    async previewRotationImport(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as StudyRecord | null;

      if (!study || study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
      }

      const preview = await buildRotationImportPreview({
        prisma,
        rows: input.rows,
        studyId: input.studyId
      });

      return { data: preview, ok: true };
    },

    async applyRotationImport(input) {
      const prisma = await getPrisma();

      try {
        return await prisma.$transaction(async (tx) => {
          const study = (await tx.study.findUnique?.({
            select: studySelect,
            where: { id: input.studyId }
          })) as StudyRecord | null;

          if (!study || study.code !== NAVIGO_STUDY_CODE) {
            return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
          }

          const preview = await buildRotationImportPreview({
            prisma: tx,
            rows: input.rows,
            studyId: input.studyId
          });

          if (preview.summary.rowsWithError > 0) {
            return {
              data: preview,
              message: "Corrige los errores de la previsualizacion antes de aplicar la importacion.",
              ok: false
            };
          }

          const confirmations = await findConfirmationsByFolio({
            prisma: tx,
            rows: input.rows,
            studyId: input.studyId
          });

          for (const row of preview.rows) {
            const confirmation = confirmations.get(row.folio);

            if (!confirmation) {
              throw new NavigoRotationApplyError({
                folio: row.folio,
                message: `No se encontro confirmacion para el folio ${row.folio}.`,
                step: "confirmation"
              });
            }

            await upsertParticipantRotationForCodes({
              actorUserId: input.actorUserId,
              leftFragranceCode: row.primeraFragancia,
              participant: confirmation.studyParticipant,
              prisma: tx,
              rightFragranceCode: row.segundaFragancia
            });
          }

          const appliedPreview = await buildRotationImportPreview({
            prisma: tx,
            rows: input.rows,
            studyId: input.studyId
          });

          return {
            data: appliedPreview,
            ok: true
          };
        });
      } catch (error) {
        const failure = toNavigoRotationApplyFailure(error);
        logNavigoRotationApplyFailure({
          error,
          folio: failure.folio,
          message: failure.logMessage,
          step: failure.step,
          studyId: input.studyId
        });

        let preview: NavigoRotationImportPreview | undefined;
        try {
          preview = await buildRotationImportPreview({
            prisma,
            rows: input.rows,
            studyId: input.studyId
          });
        } catch (previewError) {
          logNavigoRotationApplyFailure({
            error: previewError,
            folio: failure.folio,
            message: sanitizeRotationImportLogMessage(previewError),
            step: "preview-after-failure",
            studyId: input.studyId
          });
        }

        return {
          data: preview,
          message: failure.message,
          ok: false
        };
      }
    },

    async previewParticipantImport(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as StudyRecord | null;

      if (!study || study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite importar participantes.", ok: false };
      }

      let preview: NavigoParticipantImportPreview;

      try {
        preview = await buildParticipantImportPreview({
          prisma,
          rows: input.rows,
          studyId: input.studyId
        });
      } catch (error) {
        logNavigoParticipantImportRepositoryError({
          error,
          step: "preview",
          studyId: input.studyId
        });
        return {
          message: "No fue posible validar participantes existentes. Intenta nuevamente.",
          ok: false
        };
      }

      return { data: preview, ok: true };
    },

    async applyParticipantImport(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const study = (await tx.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as StudyRecord | null;

        if (!study || study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite importar participantes.", ok: false };
        }

          let preview: NavigoParticipantImportPreview;

          try {
            preview = await buildParticipantImportPreview({
              prisma: tx,
              rows: input.rows,
              studyId: input.studyId
            });
          } catch (error) {
            logNavigoParticipantImportRepositoryError({
              error,
              step: "preview-before-apply",
              studyId: input.studyId
            });
            return {
              message: "No fue posible validar participantes existentes. Intenta nuevamente.",
              ok: false
            };
          }

        if (preview.summary.rowsWithError > 0) {
          return {
            data: {
              created: 0,
              errors: preview.summary.rowsWithError,
              linksCreated: 0,
              omitted: preview.summary.rowsWithError,
              preview,
              updated: 0
            },
            message: "Corrige los errores de la previsualizacion antes de aplicar la importacion.",
            ok: false
          };
        }

        let created = 0;
        let linksCreated = 0;
        let updated = 0;

        for (const row of preview.rows) {
          const result = await upsertNavigoDirectParticipant({
            actorUserId: input.actorUserId,
            generateLink: Boolean(input.generateLinks),
            now,
            prisma: tx,
            row,
            study
          });
          if (result.createdProfile || result.createdStudyParticipant || result.createdConfirmation) {
            created += 1;
          } else {
            updated += 1;
          }
          if (result.linkToken) {
            linksCreated += 1;
          }
        }

        const nextPreview = await buildParticipantImportPreview({
          prisma: tx,
          rows: input.rows,
          studyId: input.studyId
        });

        return {
          data: {
            created,
            errors: 0,
            linksCreated,
            omitted: 0,
            preview: nextPreview,
            updated
          },
          ok: true
        };
      });
    },

    async startT0(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        const guard = validateParticipantForT0(participant);

        if (!guard.ok) {
          return guard;
        }

        const study = participant.study;
        const timeZoneIana = resolveNavigoTimeZone(study.timeZoneIana);
        const schedules = (await tx.activitySchedule.findMany?.({
          orderBy: { sortOrder: "asc" },
          select: {
            code: true,
              id: true,
              offsetMinutes: true,
              questionnaireVersionId: true,
              sortOrder: true,
              status: true,
            type: true,
            windowEndsMinutes: true,
            windowStartsMinutes: true
          },
          where: {
            code: {
              in: NAVIGO_ACTIVITY_CODES
            },
            status: "ACTIVE",
            studyId: study.id
          }
        })) as NavigoScheduleRecord[];

        const existingActivities = (participant.activities ?? []).map(toNavigoActivityRecord);
        const applicationStartedAt = input.applicationStartedAt;
        const prepared = prepareNavigoParticipantActivities({
          existingActivities,
          now,
          participant: {
            applicationStartedAt,
            id: participant.id,
            reviewStatus: participantStatus(participant),
            studyCode: study.code,
            timeZoneIana
          },
          schedules
        });

        if (!prepared.ok) {
          return {
            message: prepared.message,
            ok: false
          };
        }

        const previousApplicationStartedAt = participant.applicationStartedAt;
        const validation = validateNavigoMeasurementAnswers({ input: input.t0Answers });
        if (!validation.ok) {
          return { message: "Completa AP1-AP7 para guardar T0.", ok: false };
        }

        const questionnaireVersionId = schedules.find((schedule) => schedule.questionnaireVersionId)?.questionnaireVersionId;
        if (!questionnaireVersionId) {
          return { message: "No encontramos cuestionario AP1 a AP7 para T0.", ok: false };
        }
        const existingT0Activity = (participant.activities ?? []).find((activity) => activity.activitySchedule.code === "T0_SALON");
        let t0ActivityId: string | null = null;

        await tx.studyParticipant.update?.({
          data: {
            applicationStartedAt,
            applicationStartedAtRegisteredAt: now,
            applicationStartedAtRegisteredByUserId: input.actorUserId,
            operationalStatus: "IN_PROGRESS"
          },
          where: { id: participant.id }
        });

        await tx.applicationTimeEvent.create?.({
          data: {
            activityStateAtEvent: activityStateAtEvent(existingActivities),
            createdByUserId: input.actorUserId,
            eventType: previousApplicationStartedAt ? "CORRECTED" : "REGISTERED",
            newApplicationStartedAt: applicationStartedAt,
            previousApplicationStartedAt,
            reason: previousApplicationStartedAt
              ? "Correccion operativa de T0 desde App Navigo."
              : "Registro de T0 desde App Navigo.",
            studyParticipantId: participant.id,
            timeZoneIana
          }
        });

        for (const activity of prepared.created) {
          const isT0 = activity.code === "T0_SALON";
          const created = (await tx.participantActivity.create?.({
            data: {
              activityScheduleId: activity.activityScheduleId,
              actualCompletedAt: isT0 ? applicationStartedAt : null,
              actualStartedAt: isT0 ? applicationStartedAt : null,
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              lastSavedAt: isT0 ? now : null,
              occurrenceKey: activity.occurrenceKey,
              scheduledAt: activity.scheduledAt,
              status: isT0 ? "COMPLETED" : activity.status,
              studyParticipantId: activity.studyParticipantId
            },
            select: { id: true }
          })) as { id: string } | undefined;
          if (isT0 && created?.id) {
            t0ActivityId = created.id;
          }
        }

        for (const activity of prepared.updated) {
          const updated = (await tx.participantActivity.update?.({
            data: {
              actualCompletedAt: activity.activityScheduleId === existingT0Activity?.activityScheduleId ? applicationStartedAt : undefined,
              actualStartedAt: activity.activityScheduleId === existingT0Activity?.activityScheduleId ? applicationStartedAt : undefined,
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              lastSavedAt: activity.activityScheduleId === existingT0Activity?.activityScheduleId ? now : undefined,
              scheduledAt: activity.scheduledAt,
              status: activity.activityScheduleId === existingT0Activity?.activityScheduleId ? "COMPLETED" : activity.status
            },
            select: { id: true },
            where: {
              studyParticipantId_activityScheduleId_occurrenceKey: {
                activityScheduleId: activity.activityScheduleId,
                occurrenceKey: "DEFAULT",
                studyParticipantId: participant.id
              }
            }
          })) as { id: string } | undefined;
          if (activity.activityScheduleId === existingT0Activity?.activityScheduleId && updated?.id) {
            t0ActivityId = updated.id;
          }
        }

        if (existingT0Activity) {
          const updatedT0 = (await tx.participantActivity.update?.({
            data: {
              actualCompletedAt: applicationStartedAt,
              actualStartedAt: applicationStartedAt,
              availableFrom: applicationStartedAt,
              availableUntil: applicationStartedAt,
              lastSavedAt: now,
              scheduledAt: applicationStartedAt,
              status: "COMPLETED"
            },
            select: { id: true },
            where: { id: existingT0Activity.id }
          })) as { id: string } | undefined;
          t0ActivityId = updatedT0?.id ?? existingT0Activity.id;
        }

        if (!t0ActivityId) {
          return { message: "No fue posible preparar T0 para guardar respuestas.", ok: false };
        }

        await saveNavigoMeasurementResponses({
          activityId: t0ActivityId,
          answers: validation.answers,
          prisma: tx,
          questionnaireVersionId
        });

        const linkToken = await ensureParticipantAccessToken({
          actorUserId: input.actorUserId,
          now,
          participant,
          prisma: tx
        });

        return {
          linkToken,
          message: "T0 iniciado correctamente.",
          ok: true
        };
      });
    },

    async getParticipantActivitiesView(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await getParticipantByToken(input.token, prisma, now);

      if (!participant) {
        return {
          message: "Este enlace no es valido o ha expirado.",
          ok: false
        };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const timeline = buildNavigoActivityTimeline({
        activities: (participant.activities ?? []).map(toNavigoActivityRecord),
        now,
        testMode: Boolean(input.testMode)
      });

      return {
        data: {
          blindLabels: resolveBlindLabels(participant),
          folio: participant.participantConfirmation?.folio ?? "Sin folio",
          nextActivity: getFirstIncompleteMeasurement(timeline),
          participantName: participant.participantProfile.name,
          study: participant.study,
          testMode: Boolean(input.testMode),
          timeline,
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
        },
        ok: true
      };
    },

    async getActivityCaptureView(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await getParticipantByToken(input.token, prisma, now);

      if (!participant) {
        return {
          message: "Este enlace no es valido o ha expirado.",
          ok: false
        };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return {
          message: "No encontramos esta evaluacion para tu enlace.",
          ok: false
        };
      }

      const timeline = buildNavigoActivityTimeline({
        activities: (participant.activities ?? []).map(toNavigoActivityRecord),
        now,
        testMode: Boolean(input.testMode)
      });
      const timelineActivity = timeline.find((item) => item.id === activity.id);

      if (!timelineActivity || !timelineActivity.availability.canCapture) {
        return {
          message: availabilityMessage(timelineActivity?.availability),
          ok: false
        };
      }

      const activitySelfie = getActivitySelfie(activity);

      return {
        data: {
          activity: timelineActivity,
          blindLabels: resolveBlindLabels(participant),
          existingResponses: Object.fromEntries(activity.responses.map((response) => [response.questionId, response.answerJson])),
          folio: participant.participantConfirmation?.folio ?? "Sin folio",
          participantName: participant.participantProfile.name,
          questions: createNavigoMeasurementDefinition().questions,
          registeredSelfie: await createRegisteredSelfiePreview({
            participant,
            storage: input.storage ?? createSupabaseEvidenceStorageClient()
          }),
          selfieReviewStatus: activitySelfie?.reviewStatus ?? null,
          selfieCount: getActivitySelfieCount(activity),
          study: participant.study,
          testMode: Boolean(input.testMode),
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
        },
        ok: true
      };
    },

    async generateParticipantLink(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        const guard = validateParticipantForT0(participant);

        if (!guard.ok) {
          return guard;
        }

        const t0 = await ensureNavigoT0Activity({
          now,
          participant,
          prisma: tx
        });

        if (!t0.ok) {
          return t0;
        }

        const linkToken = await ensureParticipantAccessToken({
          actorUserId: input.actorUserId,
          forceRegenerate: input.forceRegenerate,
          now,
          participant,
          prisma: tx
        });

        return {
          linkToken,
          message: input.forceRegenerate ? "Link participante regenerado correctamente." : "Link participante generado correctamente.",
          ok: true
        };
      });
    },

    async generateParticipantLinksForStudy(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const study = (await tx.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as StudyRecord | null;

        if (!study || study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite generar enlaces masivos.", ok: false };
        }

        const participants = (await tx.studyParticipant.findMany?.({
          orderBy: {
            participantConfirmation: {
              folioSequence: "asc"
            }
          },
          select: participantWithActivitiesSelect,
          where: {
            participantConfirmation: { isNot: null },
            studyId: input.studyId
          }
        })) as ParticipantRecord[];

        let created = 0;
        let existing = 0;
        let regenerated = 0;
        let errors = 0;

        for (const participant of participants) {
          const guard = validateParticipantForT0(participant);
          if (!guard.ok) {
            errors += 1;
            continue;
          }

          const hadActive = Boolean(participant.accessTokens?.[0]);
          await ensureNavigoT0Activity({ now, participant, prisma: tx });
          await ensureParticipantAccessToken({
            actorUserId: input.actorUserId,
            forceRegenerate: Boolean(input.forceRegenerate),
            now,
            participant,
            prisma: tx
          });

          if (hadActive && input.forceRegenerate) {
            regenerated += 1;
          } else if (hadActive) {
            existing += 1;
          } else {
            created += 1;
          }
        }

        return {
          data: { created, errors, existing, regenerated },
          ok: true
        };
      });
    },

    async exportLinksAndRotation(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as StudyRecord | null;

      if (!study || study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite exportar enlaces y rotacion.", ok: false };
      }

      const participants = (await prisma.studyParticipant.findMany?.({
        orderBy: {
          participantConfirmation: {
            folioSequence: "asc"
          }
        },
        select: participantWithActivitiesSelect,
        where: {
          participantConfirmation: { isNot: null },
          studyId: input.studyId
        }
      })) as ParticipantRecord[];
      const dashboard = {
        participants: await Promise.all(
          participants.map((participant) =>
            toDashboardParticipant(participant, input.now ?? new Date(), createSupabaseEvidenceStorageClient())
          )
        ),
        study,
        timeZoneIana: resolveNavigoTimeZone(study.timeZoneIana)
      };

      return {
        data: {
          body: buildNavigoLinksRotationTsv({
            dashboard,
            now: input.now ?? new Date(),
            requestOrigin: input.requestOrigin
          }),
          filename: `${dashboard.study.code}_links_rotacion_${formatDateForFilename(input.now ?? new Date(), dashboard.timeZoneIana)}.tsv`
        },
        ok: true
      };
    },

    async requestActivitySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await getParticipantByToken(input.token, prisma);

      if (!participant) {
        return { message: "Este enlace no es valido o ha expirado.", ok: false };
      }

      const safe = validateParticipantForToken(participant);
      if (!safe.ok) {
        return safe;
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
      }

      if (activity.activitySchedule.code === "T0_SALON") {
        return { message: "T0 no requiere selfie nueva. Confirma la identidad contra la foto registrada.", ok: false };
      }

      if (getActivitySelfieCount(activity) > 0) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      const metadata = validateEvidenceUploadMetadata({
        maxImageBytes: 8388608,
        metadata: input.metadata
      });
      const privateStorageKey = buildActivityEvidenceStorageKey({
        activityId: activity.id,
        evidenceType: metadata.evidenceType,
        extension: metadata.extension,
        participantProfileId: participant.participantProfile.id,
        studyId: participant.study.id
      });
      const storage = input.storage ?? createSupabaseEvidenceStorageClient();
      const signed = await storage.createSignedUploadUrl({
        bucket: PARTICIPANT_EVIDENCE_BUCKET,
        contentType: metadata.mimeType,
        privateStorageKey
      });

      if (!signed.token) {
        return { message: "No fue posible preparar la carga. Intenta de nuevo.", ok: false };
      }

      return {
        data: {
          metadata,
          privateStorageKey,
          storageBucket: PARTICIPANT_EVIDENCE_BUCKET,
          token: signed.token
        },
        ok: true
      };
    },

    async reviewActivityIdentity(input) {
      if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
        return { message: "Captura el motivo cuando la identidad no coincide.", ok: false };
      }

      const prisma = await getPrisma();
      const evidence = (await prisma.participantActivityEvidence.findFirst?.({
        select: {
          id: true,
          internalNote: true,
          participantActivity: {
            select: {
              studyParticipant: {
                select: {
                  studyId: true
                }
              }
            }
          },
          type: true
        },
        where: {
          id: input.evidenceId,
          type: "SELFIE_IDENTIFICATION"
        }
      })) as { id: string; internalNote: string | null; participantActivity: { studyParticipant: { studyId: string } }; type: "SELFIE_IDENTIFICATION" } | null;

      if (!evidence || evidence.participantActivity.studyParticipant.studyId !== input.studyId) {
        return { message: "No encontramos la selfie de esta toma para el estudio.", ok: false };
      }

      await prisma.participantActivityEvidence.update?.({
        data: {
          internalNote: input.internalNote?.trim() || evidence.internalNote || (input.status === "PENDING" ? "Requiere revisión manual de identidad." : null),
          rejectionReason: input.status === "REJECTED" ? input.rejectionReason?.trim() : null,
          reviewStatus: input.status,
          reviewedAt: new Date(),
          reviewedByUserId: input.actorUserId
        },
        where: { id: input.evidenceId }
      });

      return {
        message:
          input.status === "APPROVED"
            ? "Identidad marcada como coincidente."
            : input.status === "REJECTED"
              ? "Incidencia de identidad registrada."
              : "Identidad marcada para revisión.",
        ok: true
      };
    },

    async confirmActivitySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await getParticipantByToken(input.token, prisma);

      if (!participant) {
        return { message: "Este enlace no es valido o ha expirado.", ok: false };
      }

      const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
      if (!activity) {
        return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
      }

      if (activity.activitySchedule.code === "T0_SALON") {
        return { message: "T0 no requiere selfie nueva. Confirma la identidad contra la foto registrada.", ok: false };
      }

      if (input.metadata.evidenceType !== "SELFIE_IDENTIFICATION") {
        return { message: "Esta evaluacion solo permite selfie de identificacion.", ok: false };
      }

      if (getActivitySelfieCount(activity) > 0) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      assertActivityEvidenceKeyBelongsToActivity({
        activityId: activity.id,
        participantProfileId: participant.participantProfile.id,
        privateStorageKey: input.metadata.privateStorageKey,
        studyId: participant.study.id
      });

      const faceVerification = normalizeNavigoFaceVerificationForStorage(input.metadata.faceVerification);

      await prisma.participantActivityEvidence.create?.({
        data: {
          extension: extensionFromFilename(input.metadata.originalFilename),
          internalNote: faceVerification.internalNote,
          mimeType: input.metadata.mimeType,
          originalFilename: input.metadata.originalFilename,
          participantActivityId: activity.id,
          privateStorageKey: input.metadata.privateStorageKey,
          rejectionReason: faceVerification.rejectionReason,
          sizeBytes: input.metadata.sizeBytes,
          storageBucket: input.metadata.storageBucket,
          studyParticipantId: participant.id,
          reviewStatus: faceVerification.reviewStatus,
          type: "SELFIE_IDENTIFICATION"
        }
      });

      return {
        data: {
          internalNote: faceVerification.internalNote,
          reviewStatus: faceVerification.reviewStatus,
          selfieCount: 1
        },
        ok: true
      };
    },

    async confirmT0Identity(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await getParticipantByToken(input.token, tx, now);
        if (!participant) {
          return { message: "Este enlace no es valido o ha expirado.", ok: false };
        }

        const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
        if (!activity || activity.activitySchedule.code !== "T0_SALON") {
          return { message: "No encontramos T0 para este enlace.", ok: false };
        }

        const questionnaireVersionId = await resolveNavigoMeasurementQuestionnaireVersionId({
          participant,
          prisma: tx
        });
        if (!questionnaireVersionId) {
          return { message: "No encontramos cuestionario AP1 a AP7 para T0.", ok: false };
        }

        const applicationStartedAt = participant.applicationStartedAt ?? now;
        if (!participant.applicationStartedAt) {
          await tx.studyParticipant.update?.({
            data: {
              applicationStartedAt,
              applicationStartedAtRegisteredAt: now,
              operationalStatus: "IN_PROGRESS"
            },
            where: { id: participant.id }
          });
        }

        await saveNavigoMeasurementResponses({
          activityId: activity.id,
          answers: [
            {
              answerJson: { value: input.identityConfirmed },
              questionId: NAVIGO_T0_IDENTITY_QUESTION_ID
            }
          ],
          prisma: tx,
          questionnaireVersionId
        });

        await tx.participantActivity.update?.({
          data: {
            actualStartedAt: activity.actualStartedAt ?? applicationStartedAt,
            lastSavedAt: now,
            status: input.identityConfirmed === "YES" ? "STARTED" : "INCOMPLETE"
          },
          where: { id: activity.id }
        });

        if (input.identityConfirmed === "NO") {
          return {
            data: { identityStatus: "REJECTED" },
            ok: true
          };
        }

        return {
          data: { identityStatus: "CONFIRMED" },
          ok: true
        };
      });
    },

    async submitActivityResponses(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await getParticipantByToken(input.token, tx, now);
        if (!participant) {
          return { message: "Este enlace no es valido o ha expirado.", ok: false };
        }

        const activity = (participant.activities ?? []).find((item) => item.id === input.activityId);
        if (!activity) {
          return { message: "No encontramos esta evaluacion para tu enlace.", ok: false };
        }

        const timeline = buildNavigoActivityTimeline({
          activities: (participant.activities ?? []).map(toNavigoActivityRecord),
          now,
          testMode: Boolean(input.testMode)
        });
        const timelineActivity = timeline.find((item) => item.id === activity.id);

        if (!timelineActivity?.availability.canCapture) {
          return {
            message: availabilityMessage(timelineActivity?.availability),
            ok: false
          };
        }

        const isT0 = activity.activitySchedule.code === "T0_SALON";

        if (isT0) {
          const result = await submitNavigoT0FromParticipantLink({
            activity,
            answers: input.answers,
            now,
            participant,
            prisma: tx
          });

          if (!result.ok) {
            return { message: result.message, ok: false };
          }

          return {
            data: { completedAt: now },
            ok: true
          };
        }

        if (!hasApprovedActivitySelfie(activity)) {
          return { message: "Toma una selfie aprobada de esta evaluacion antes de guardar las respuestas.", ok: false };
        }

        const validation = validateNavigoMeasurementAnswers({ input: input.answers });
        if (!validation.ok) {
          return { message: validation.message, ok: false };
        }

        const questionnaireVersionId = activity.activitySchedule.questionnaireVersionId;
        if (!questionnaireVersionId) {
          return { message: "Esta evaluacion no tiene cuestionario configurado.", ok: false };
        }

        await saveNavigoMeasurementResponses({
          activityId: activity.id,
          answers: validation.answers,
          prisma: tx,
          questionnaireVersionId
        });

        await tx.participantActivity.update?.({
          data: {
            actualCompletedAt: now,
            actualStartedAt: activity.actualStartedAt ?? now,
            lastSavedAt: now,
            status: "COMPLETED"
          },
          where: { id: activity.id }
        });

        return {
          data: { completedAt: now },
          ok: true
        };
      });
    }
  };
}

async function submitNavigoT0FromParticipantLink({
  activity,
  answers,
  now,
  participant,
  prisma
}: {
  activity: ActivityRecord;
  answers: NavigoAnswerInput;
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<NavigoActionResult<null>> {
  const timeZoneIana = resolveNavigoTimeZone(participant.study.timeZoneIana);
  const schedules = await getNavigoSchedules({
    participant,
    prisma
  });
  const questionnaireVersionId = schedules.find((schedule) => schedule.questionnaireVersionId)?.questionnaireVersionId;

  if (!questionnaireVersionId) {
    return { message: "No encontramos cuestionario AP1 a AP7 para T0.", ok: false };
  }

  const applicationStartedAt = participant.applicationStartedAt ?? now;

  if (!participant.applicationStartedAt) {
    await prisma.studyParticipant.update?.({
      data: {
        applicationStartedAt,
        applicationStartedAtRegisteredAt: now,
        operationalStatus: "IN_PROGRESS"
      },
      where: { id: participant.id }
    });
  }

  if (readNavigoIdentityStatusFromResponses(activity.responses) !== "CONFIRMED") {
    return {
      message: "Confirma primero que la persona coincide con la foto registrada.",
      ok: false
    };
  }

  const validation = validateNavigoMeasurementAnswers({ input: answers });
  if (!validation.ok) {
    return { message: validation.message, ok: false };
  }

  await saveNavigoMeasurementResponses({
    activityId: activity.id,
    answers: validation.answers,
    prisma,
    questionnaireVersionId
  });

  await prisma.participantActivity.update?.({
    data: {
      actualCompletedAt: now,
      actualStartedAt: activity.actualStartedAt ?? applicationStartedAt,
      availableFrom: applicationStartedAt,
      lastSavedAt: now,
      scheduledAt: applicationStartedAt,
      status: "COMPLETED"
    },
    where: { id: activity.id }
  });

  const prepared = prepareNavigoParticipantActivities({
    existingActivities: (participant.activities ?? []).map(toNavigoActivityRecord),
    now,
    participant: {
      applicationStartedAt,
      id: participant.id,
      reviewStatus: participantStatus(participant),
      studyCode: participant.study.code,
      timeZoneIana
    },
    schedules
  });

  if (!prepared.ok) {
    return { message: prepared.message, ok: false };
  }

  for (const preparedActivity of prepared.created.filter((item) => item.code !== "T0_SALON")) {
    await prisma.participantActivity.create?.({
      data: {
        activityScheduleId: preparedActivity.activityScheduleId,
        actualCompletedAt: null,
        actualStartedAt: null,
        availableFrom: preparedActivity.availableFrom,
        availableUntil: preparedActivity.availableUntil,
        occurrenceKey: preparedActivity.occurrenceKey,
        scheduledAt: preparedActivity.scheduledAt,
        status: preparedActivity.status,
        studyParticipantId: preparedActivity.studyParticipantId
      }
    });
  }

  for (const preparedActivity of prepared.updated.filter((item) => item.activityScheduleId !== activity.activityScheduleId)) {
    await prisma.participantActivity.update?.({
      data: {
        availableFrom: preparedActivity.availableFrom,
        availableUntil: preparedActivity.availableUntil,
        scheduledAt: preparedActivity.scheduledAt,
        status: preparedActivity.status
      },
      where: {
        studyParticipantId_activityScheduleId_occurrenceKey: {
          activityScheduleId: preparedActivity.activityScheduleId,
          occurrenceKey: "DEFAULT",
          studyParticipantId: participant.id
        }
      }
    });
  }

  return {
    data: null,
    ok: true
  };
}

async function getNavigoSchedules({
  participant,
  prisma
}: {
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<NavigoScheduleRecord[]> {
  return (await prisma.activitySchedule.findMany?.({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      questionnaireVersionId: true,
      sortOrder: true,
      status: true,
      type: true,
      windowEndsMinutes: true,
      windowStartsMinutes: true
    },
    where: {
      code: { in: NAVIGO_ACTIVITY_CODES },
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) as NavigoScheduleRecord[];
}

async function resolveNavigoMeasurementQuestionnaireVersionId({
  participant,
  prisma
}: {
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<string | null> {
  const schedules = await getNavigoSchedules({ participant, prisma });
  return schedules.find((schedule) => schedule.questionnaireVersionId)?.questionnaireVersionId ?? null;
}

async function saveNavigoMeasurementResponses({
  activityId,
  answers,
  prisma,
  questionnaireVersionId
}: {
  activityId: string;
  answers: Array<{ answerJson: unknown; questionId: string }>;
  prisma: NavigoTransactionClient;
  questionnaireVersionId: string;
}) {
  for (const answer of answers) {
    const responseKey = buildResearchResponseKey({
      context: { type: "none" },
      questionId: answer.questionId
    });
    await prisma.researchResponse.upsert?.({
      create: {
        answerJson: answer.answerJson,
        participantActivityId: activityId,
        questionId: answer.questionId,
        questionnaireVersionId,
        responseKey,
        validationStatus: "VALID"
      },
      update: {
        answerJson: answer.answerJson,
        validationStatus: "VALID"
      },
      where: {
        participantActivityId_responseKey: {
          participantActivityId: activityId,
          responseKey
        }
      }
    });
  }
}

function navigoCodesFrom(fromCode: NavigoActivityCode): NavigoActivityCode[] {
  const start = NAVIGO_ACTIVITY_CODES.indexOf(fromCode);
  return start < 0 ? [] : NAVIGO_ACTIVITY_CODES.slice(start);
}

async function recreatePendingNavigoActivities({
  now,
  participant,
  prisma,
  remainingActivities
}: {
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
  remainingActivities: NavigoActivityRecord[];
}) {
  if (!participant.applicationStartedAt) {
    return;
  }

  const schedules = (await prisma.activitySchedule.findMany?.({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      questionnaireVersionId: true,
      sortOrder: true,
      status: true,
      type: true,
      windowEndsMinutes: true,
      windowStartsMinutes: true
    },
    where: {
      code: { in: NAVIGO_ACTIVITY_CODES },
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) as NavigoScheduleRecord[];

  const prepared = prepareNavigoParticipantActivities({
    existingActivities: remainingActivities,
    now,
    participant: {
      applicationStartedAt: participant.applicationStartedAt,
      id: participant.id,
      reviewStatus: participantStatus(participant),
      studyCode: participant.study.code,
      timeZoneIana: participant.study.timeZoneIana
    },
    schedules
  });

  if (!prepared.ok) {
    return;
  }

  for (const activity of prepared.created) {
    await prisma.participantActivity.create?.({
      data: {
        activityScheduleId: activity.activityScheduleId,
        actualCompletedAt: null,
        actualStartedAt: null,
        availableFrom: activity.availableFrom,
        availableUntil: activity.availableUntil,
        occurrenceKey: activity.occurrenceKey,
        scheduledAt: activity.scheduledAt,
        status: activity.status,
        studyParticipantId: activity.studyParticipantId
      }
    });
  }

  for (const activity of prepared.updated) {
    await prisma.participantActivity.update?.({
      data: {
        availableFrom: activity.availableFrom,
        availableUntil: activity.availableUntil,
        scheduledAt: activity.scheduledAt,
        status: activity.status
      },
      where: {
        studyParticipantId_activityScheduleId_occurrenceKey: {
          activityScheduleId: activity.activityScheduleId,
          occurrenceKey: "DEFAULT",
          studyParticipantId: participant.id
        }
      }
    });
  }
}

async function ensureNavigoT0Activity({
  now,
  participant,
  prisma
}: {
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<NavigoActionResult<{ activityId: string }>> {
  const existingT0 = (participant.activities ?? []).find((activity) => activity.activitySchedule.code === "T0_SALON");

  if (existingT0) {
    return {
      data: { activityId: existingT0.id },
      ok: true
    };
  }

  const schedule = (await prisma.activitySchedule.findFirst?.({
    select: {
      code: true,
      id: true,
      offsetMinutes: true,
      questionnaireVersionId: true,
      sortOrder: true,
      status: true,
      type: true,
      windowEndsMinutes: true,
      windowStartsMinutes: true
    },
    where: {
      code: "T0_SALON",
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) as NavigoScheduleRecord | null;

  if (!schedule) {
    return { message: "No encontramos la actividad T0 configurada para Navigo.", ok: false };
  }

  const created = (await prisma.participantActivity.create?.({
    data: {
      activityScheduleId: schedule.id,
      actualCompletedAt: null,
      actualStartedAt: null,
      availableFrom: now,
      availableUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      occurrenceKey: "DEFAULT",
      scheduledAt: now,
      status: "AVAILABLE",
      studyParticipantId: participant.id
    },
    select: { id: true }
  })) as { id: string } | undefined;

  if (!created?.id) {
    return { message: "No fue posible preparar T0 para el enlace participante.", ok: false };
  }

  return {
    data: { activityId: created.id },
    ok: true
  };
}

async function createRegisteredSelfiePreview({
  participant,
  storage
}: {
  participant: ParticipantRecord;
  storage: EvidenceStorageClient;
}): Promise<{ signedUrl: string } | null> {
  const selfie = participant.participantEvidence.find((evidence) => evidence.type === "SELFIE_IDENTIFICATION");

  if (!selfie) {
    return null;
  }

  let signedUrl: string;

  try {
    signedUrl = await storage.createSignedReadUrl({
      bucket: selfie.storageBucket,
      expiresInSeconds: 300,
      privateStorageKey: selfie.privateStorageKey
    });
  } catch (error) {
    const code = error instanceof Error ? error.name : "UNKNOWN";
    console.error(
      `navigo t0 registered selfie signed read failed: step=createSignedReadUrl bucket=${selfie.storageBucket} code=${code}`
    );
    return null;
  }

  return { signedUrl };
}

async function createActivitySelfieReadUrl({
  evidence,
  storage
}: {
  evidence: ActivityRecord["participantActivityEvidence"][number];
  storage: EvidenceStorageClient;
}): Promise<string | null> {
  try {
    return await storage.createSignedReadUrl({
      bucket: evidence.storageBucket,
      expiresInSeconds: 300,
      privateStorageKey: evidence.privateStorageKey
    });
  } catch (error) {
    const code = error instanceof Error ? error.name : "UNKNOWN";
    console.error(
      `navigo activity selfie signed read failed: step=createSignedReadUrl bucket=${evidence.storageBucket} code=${code}`
    );
    return null;
  }
}

function createReadableNavigoResponses(
  responses: Array<{ answerJson: unknown; questionId: string }>
): NavigoActivityListItem["readableResponses"] {
  const questions = createNavigoMeasurementDefinition().questions;

  return questions.map((question) => {
    const response = responses.find((item) => item.questionId === question.id);
    const value = readResponseValue(response?.answerJson);

    return {
      label: value === null ? "Sin respuesta" : readableNavigoAnswerLabel(question, value),
      questionId: question.id,
      text: question.text,
      value: value === null ? "" : String(value)
    };
  });
}

function readableNavigoAnswerLabel(question: ReturnType<typeof createNavigoMeasurementDefinition>["questions"][number], value: string | number): string {
  if (question.type === "single_choice") {
    return question.options.find((option) => option.value === value)?.label ?? String(value);
  }

  if (question.type === "scale") {
    if (question.id === "AP3_INTENSIDAD_PRIMERA" || question.id === "AP4_INTENSIDAD_SEGUNDA") {
      return navigoIntensityLabel(Number(value));
    }

    return `${value} / ${question.max}`;
  }

  return String(value);
}

function navigoIntensityLabel(value: number): string {
  return (
    {
      1: "Extremadamente débil",
      2: "Muy débil",
      3: "Algo débil",
      4: "Ni débil, ni fuerte",
      5: "Algo fuerte",
      6: "Muy fuerte",
      7: "Extremadamente fuerte"
    }[value] ?? String(value)
  );
}

function readResponseValue(answer: unknown): string | number | null {
  if (typeof answer === "object" && answer !== null && "value" in answer) {
    const value = (answer as { value?: unknown }).value;
    return typeof value === "string" || typeof value === "number" ? value : null;
  }

  return null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function toDashboardParticipant(
  participant: ParticipantRecord,
  now: Date,
  storage: EvidenceStorageClient
): Promise<NavigoParticipantListItem> {
  const activities = await Promise.all((participant.activities ?? []).map((activity) => toActivityListItem(activity, storage)));
  const timeline = buildNavigoActivityTimeline({ activities, now });
  const activitiesWithAvailability = activities.map((activity) => ({
    ...activity,
    availability: timeline.find((item) => item.id === activity.id)?.availability
  }));
  const rotation = buildParticipantRotationSummary(participant);
  const alert =
    timeline.find((activity) => activity.availability.reason === "AFTER_WINDOW")
      ? "Requiere contacto"
      : timeline.find((activity) => activity.availability.canCapture)
        ? "Evaluacion disponible"
        : participant.applicationStartedAt
          ? "Seguimiento en curso"
          : "T0 pendiente";

  return {
    activities: activitiesWithAvailability,
    alert,
    applicationStartedAt: participant.applicationStartedAt,
    confirmation: participant.participantConfirmation,
    hasRecoverableToken: Boolean(participant.accessTokens?.[0]),
    id: participant.id,
    participant: {
      email: participant.participantProfile.email,
      name: participant.participantProfile.name,
      phone: participant.participantProfile.phone
    },
    registeredSelfie: await createRegisteredSelfiePreview({
      participant,
      storage
    }),
    rotation,
    rotationReady: rotation.ready,
    participantLinkToken: participant.accessTokens?.[0]?.id ?? null,
    status: participantStatus(participant)
  };
}

async function buildParticipantImportPreview({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoParticipantImportRowInput[];
  studyId: string;
}): Promise<NavigoParticipantImportPreview> {
  const folios = [...new Set(rows.map((row) => row.folio).filter(Boolean))];
  const phones = [...new Set(rows.map((row) => row.celular).filter(Boolean))];
  const existingByFolio = await findNavigoParticipantsByFolio({ folios, prisma, studyId });
  const existingByPhone = await findNavigoParticipantsByPhone({ phones, prisma, studyId });
  const duplicatedFolios = duplicates(rows.map((row) => row.folio).filter(Boolean));
  const duplicatedPhones = duplicates(rows.map((row) => row.celular).filter(Boolean));

  const previewRows = rows.map((row, index): NavigoParticipantImportPreviewRow => {
    const errors: string[] = [];
    const folioParticipant = row.folio ? existingByFolio.get(row.folio) ?? null : null;
    const phoneParticipant = row.celular ? existingByPhone.get(row.celular) ?? null : null;

    if (!row.folio) {
      errors.push("folio vacio");
    } else if (duplicatedFolios.has(row.folio)) {
      errors.push("folio duplicado en archivo");
    }
    if (!row.nombre) {
      errors.push("nombre vacio");
    }
    if (!row.celular) {
      errors.push("celular vacio");
    } else if (!isNavigoPhone(row.celular)) {
      errors.push("formato de celular invalido");
    } else if (duplicatedPhones.has(row.celular)) {
      errors.push("celular duplicado en archivo");
    }
    if (row.correo && !isNavigoEmail(row.correo)) {
      errors.push("formato de correo invalido");
    }
    if (!row.primeraFragancia) {
      errors.push("primera fragancia vacia");
    }
    if (!row.segundaFragancia) {
      errors.push("segunda fragancia vacia");
    }
    if (row.primeraFragancia && row.primeraFragancia === row.segundaFragancia) {
      errors.push("primera y segunda fragancia deben ser distintas");
    }
    if (folioParticipant && phoneParticipant && folioParticipant.id !== phoneParticipant.id) {
      errors.push("folio ya existe con otro celular");
    }
    if (phoneParticipant && !folioParticipant && phoneParticipant.participantConfirmation?.folio) {
      errors.push("celular ya existe con otro folio");
    }

    return {
      ...row,
      celularDuplicado: Boolean(phoneParticipant),
      errors,
      existingFolio: Boolean(folioParticipant),
      existingParticipant: Boolean(phoneParticipant),
      folioNuevo: !folioParticipant,
      rotationComplete: Boolean(row.primeraFragancia && row.segundaFragancia && row.primeraFragancia !== row.segundaFragancia),
      rowNumber: index + 2,
      updatable: errors.length === 0
    };
  });

  return {
    rows: previewRows,
    summary: {
      duplicatePhones: duplicatedPhones.size,
      existingFolios: previewRows.filter((row) => row.existingFolio).length,
      newFolios: previewRows.filter((row) => row.folioNuevo && row.folio).length,
      phoneDuplicates: previewRows.filter((row) => row.celularDuplicado).length,
      rotationComplete: previewRows.filter((row) => row.rotationComplete).length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.errors.length === 0).length
    }
  };
}

async function buildRotationImportPreview({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationImportRowInput[];
  studyId: string;
}): Promise<NavigoRotationImportPreview> {
  const confirmations = await findConfirmationsByFolio({ prisma, rows, studyId });
  const seenFolios = new Set<string>();
  const duplicateFolios = new Set<string>();

  for (const row of rows) {
    if (!row.folio) {
      continue;
    }
    if (seenFolios.has(row.folio)) {
      duplicateFolios.add(row.folio);
    }
    seenFolios.add(row.folio);
  }

  const previewRows = rows.map((row, index): NavigoRotationImportPreviewRow => {
    const errors: string[] = [];
    const confirmation = row.folio ? confirmations.get(row.folio) : null;

    if (!row.folio) {
      errors.push("folio vacio");
    } else if (duplicateFolios.has(row.folio)) {
      errors.push("folio duplicado dentro del archivo");
    } else if (!confirmation) {
      errors.push("folio no encontrado");
    }

    if (!row.primeraFragancia) {
      errors.push("primera fragancia vacia");
    }
    if (!row.segundaFragancia) {
      errors.push("segunda fragancia vacia");
    }

    const participant = confirmation?.studyParticipant ?? null;
    const t0Started = participant ? hasT0Started(participant) : false;
    const existingRotation = Boolean(participant?.rotationAssignment?.arms.length);

    if (participant && participantStatus(participant) !== "APPROVED") {
      errors.push("participante no confirmado");
    }

    if (t0Started) {
      errors.push("No se puede modificar rotacion porque T0 ya fue iniciado.");
    }

    return {
      ...row,
      errors,
      existingRotation,
      rowNumber: index + 2,
      t0Started,
      updatable: errors.length === 0
    };
  });

  return {
    rows: previewRows,
    summary: {
      duplicateFolios: duplicateFolios.size,
      foundFolios: previewRows.filter((row) => row.folio && confirmations.has(row.folio)).length,
      missingFolios: previewRows.filter((row) => row.errors.includes("folio no encontrado")).length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      t0Started: previewRows.filter((row) => row.t0Started).length,
      totalRows: previewRows.length,
      updatable: previewRows.filter((row) => row.updatable).length,
      validRows: previewRows.filter((row) => row.errors.length === 0).length
    }
  };
}

async function findConfirmationsByFolio({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationImportRowInput[];
  studyId: string;
}): Promise<Map<string, ConfirmationWithParticipant>> {
  const folios = [...new Set(rows.map((row) => row.folio).filter(Boolean))];

  if (folios.length === 0) {
    return new Map();
  }

  const confirmations = (await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      studyParticipant: {
        select: participantWithActivitiesSelect
      }
    },
    where: {
      folio: {
        in: folios
      },
      studyId
    }
  })) as ConfirmationWithParticipant[];

  return new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));
}

async function findNavigoParticipantsByFolio({
  folios,
  prisma,
  studyId
}: {
  folios: string[];
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  studyId: string;
}): Promise<Map<string, ParticipantImportLookupRecord>> {
  if (folios.length === 0) {
    return new Map();
  }

  const confirmations = (await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      studyParticipant: {
        select: participantImportLookupSelect
      }
    },
    where: {
      folio: { in: folios },
      studyId
    }
  })) as Array<{ folio: string; studyParticipant: ParticipantImportLookupRecord }>;

  return new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation.studyParticipant]));
}

async function findNavigoParticipantsByPhone({
  phones,
  prisma,
  studyId
}: {
  phones: string[];
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  studyId: string;
}): Promise<Map<string, ParticipantImportLookupRecord>> {
  if (phones.length === 0) {
    return new Map();
  }

  const participants = (await prisma.studyParticipant.findMany?.({
    select: participantImportLookupSelect,
    where: {
      participantProfile: {
        is: {
          phone: { in: phones }
        }
      },
      studyId
    }
  })) as ParticipantImportLookupRecord[];

  const entries = participants
    .map((participant): [string, ParticipantImportLookupRecord] | null =>
      participant.participantProfile.phone ? [participant.participantProfile.phone, participant] : null
    )
    .filter((entry): entry is [string, ParticipantImportLookupRecord] => entry !== null);

  return new Map(entries);
}

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }

  return repeated;
}

function normalizeNavigoParticipantRegistrationInput(
  input: NavigoParticipantRegistrationInput
): NavigoActionResult<NavigoParticipantImportRowInput> {
  const data: NavigoParticipantImportRowInput = {
    celular: normalizeNavigoPhone(input.celular),
    correo: normalizeNavigoEmail(input.correo ?? ""),
    folio: normalizeNavigoFolio(input.folio),
    nombre: normalizeNavigoParticipantName(input.nombre),
    observaciones: input.observaciones ? normalizeNavigoParticipantName(input.observaciones) : null,
    primeraFragancia: normalizeNavigoRotationCode(input.primeraFragancia),
    reclutador: input.reclutador ? normalizeNavigoParticipantName(input.reclutador) : null,
    segundaFragancia: normalizeNavigoRotationCode(input.segundaFragancia)
  };
  const errors: string[] = [];

  if (!data.folio) errors.push("Captura el folio.");
  if (!data.nombre) errors.push("Captura el nombre.");
  if (!data.celular) errors.push("Captura el celular.");
  if (data.celular && !isNavigoPhone(data.celular)) errors.push("Captura un celular valido a 10 digitos o con clave +52.");
  if (data.correo && !isNavigoEmail(data.correo)) errors.push("Captura un correo valido.");
  if (!data.primeraFragancia || !data.segundaFragancia) errors.push("Captura primera y segunda fragancia.");
  if (data.primeraFragancia && data.primeraFragancia === data.segundaFragancia) {
    errors.push("Los codigos de primera y segunda fragancia deben ser distintos.");
  }

  if (errors.length > 0) {
    return { message: errors.join(" "), ok: false };
  }

  return { data, ok: true };
}

async function upsertNavigoDirectParticipant({
  actorUserId,
  generateLink,
  now,
  prisma,
  row,
  study
}: {
  actorUserId: string;
  generateLink: boolean;
  now: Date;
  prisma: NavigoTransactionClient;
  row: NavigoParticipantImportRowInput;
  study: StudyRecord;
}): Promise<{
  createdConfirmation: boolean;
  createdProfile: boolean;
  createdStudyParticipant: boolean;
  linkToken: string | null;
  participant: ParticipantRecord;
}> {
  const byFolio = (await findNavigoParticipantsByFolio({ folios: [row.folio], prisma, studyId: study.id })).get(row.folio) ?? null;
  const byPhone = (await findNavigoParticipantsByPhone({ phones: [row.celular], prisma, studyId: study.id })).get(row.celular) ?? null;

  if (byFolio && byPhone && byFolio.id !== byPhone.id) {
    throw new Error("El folio ya existe con otro celular.");
  }
  if (byPhone?.participantConfirmation?.folio && byPhone.participantConfirmation.folio !== row.folio) {
    throw new Error("El celular ya existe con otro folio.");
  }

  let profile = byPhone?.participantProfile ?? byFolio?.participantProfile ?? null;
  const createdProfile = !profile;

  if (!profile) {
    profile = (await prisma.participantProfile.create?.({
      data: {
        createdByUserId: actorUserId,
        email: row.correo,
        name: row.nombre,
        phone: row.celular,
        status: "ACTIVE"
      },
      select: { email: true, id: true, name: true, phone: true }
    })) as { email: string | null; id: string; name: string; phone: string | null };
  } else {
    await prisma.participantProfile.update?.({
      data: {
        email: row.correo,
        name: row.nombre,
        phone: row.celular
      },
      where: { id: profile.id }
    });
  }

  const existingParticipant = byPhone ?? byFolio ?? null;
  const createdStudyParticipant = !existingParticipant;

  if (!existingParticipant) {
    await prisma.studyParticipant.create?.({
      data: {
        createdByUserId: actorUserId,
        operationalStatus: "ASSIGNED",
        participantProfileId: profile.id,
        screeningStatus: "PASSED",
        studyId: study.id
      }
    });
  } else {
    await prisma.studyParticipant.update?.({
      data: {
        operationalStatus: "ASSIGNED",
        screeningStatus: "PASSED"
      },
      where: { id: existingParticipant.id }
    });
  }

  let participant = (await prisma.studyParticipant.findUnique?.({
    select: participantWithActivitiesSelect,
    where: {
      participantProfileId_studyId: {
        participantProfileId: profile.id,
        studyId: study.id
      }
    }
  })) as ParticipantRecord | null;

  if (!participant) {
    throw new Error("No fue posible preparar el participante.");
  }

  const createdConfirmation = !participant.participantConfirmation;
  if (!participant.participantConfirmation) {
    const questionnaireVersionId = await resolveActiveScreenerVersionId({ prisma, studyId: study.id });
    if (!questionnaireVersionId) {
      throw new Error("El estudio no tiene una version activa de screener para trazabilidad.");
    }

    const attempt = (await prisma.screeningAttempt.create?.({
      data: {
        completedAt: now,
        evaluationJson: {
          directSource: "APP_NAVIGO_DIRECT",
          observaciones: row.observaciones,
          reclutador: row.reclutador
        },
        fieldUserId: actorUserId,
        questionnaireVersionId,
        source: "FIELD",
        status: "PASSED",
        studyParticipantId: participant.id
      },
      select: { id: true }
    })) as { id: string };
    const confirmation = (await prisma.participantConfirmation.create?.({
      data: {
        approvedAt: now,
        approvedByUserId: actorUserId,
        folio: row.folio,
        folioSequence: parseFolioSequence(row.folio),
        manualMessageStatus: "NOT_SENT",
        screeningAttemptId: attempt.id,
        studyId: study.id,
        studyParticipantId: participant.id
      },
      select: { id: true }
    })) as { id: string };
    const referenceCodes = generateReferenceCodes({
      codeGenerator: generateParticipantReferenceCode,
      existingReferenceCodes: await listExistingReferenceCodes(prisma)
    });

    await prisma.participantReferenceCode.createMany?.({
      data: referenceCodes.map((code) => ({
        code: code.code,
        confirmationId: confirmation.id,
        slot: code.slot
      }))
    });
  }

  participant = (await prisma.studyParticipant.findUnique?.({
    select: participantWithActivitiesSelect,
    where: { id: participant.id }
  })) as ParticipantRecord;

  await upsertParticipantRotationForCodes({
    actorUserId,
    leftFragranceCode: row.primeraFragancia,
    participant,
    prisma,
    rightFragranceCode: row.segundaFragancia
  });

  participant = (await prisma.studyParticipant.findUnique?.({
    select: participantWithActivitiesSelect,
    where: { id: participant.id }
  })) as ParticipantRecord;

  let linkToken: string | null = null;
  if (generateLink) {
    await ensureNavigoT0Activity({ now, participant, prisma });
    linkToken = await ensureParticipantAccessToken({ actorUserId, now, participant, prisma });
  }

  return {
    createdConfirmation,
    createdProfile,
    createdStudyParticipant,
    linkToken,
    participant
  };
}

function logNavigoParticipantImportRepositoryError({
  error,
  step,
  studyId
}: {
  error: unknown;
  step: "preview" | "preview-before-apply";
  studyId: string;
}) {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`navigo participant import failed: step=${step} studyId=${studyId} message=${message}`);
}

async function upsertParticipantRotationForCodes({
  actorUserId,
  leftFragranceCode,
  participant,
  prisma,
  rightFragranceCode
}: {
  actorUserId: string;
  leftFragranceCode: string;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
  rightFragranceCode: string;
}) {
  if (!participant.participantConfirmation) {
    throw new Error("Participant confirmation is required for Navigo rotation.");
  }

  const studyId = participant.study.id;
  const folio = participant.participantConfirmation.folio;
  const rotationCode = createNavigoRotationPlanCode({
    folio,
    leftFragranceCode,
    rightFragranceCode
  });
  const leftArm = await resolveNavigoStudyArm({
    code: "LEFT",
    folio,
    label: "Brazo izquierdo",
    preferredSortOrder: 1,
    prisma,
    studyId,
    userMessage: "No se pudo crear la asignacion de brazo izquierdo."
  });
  const rightArm = await resolveNavigoStudyArm({
    code: "RIGHT",
    folio,
    label: "Brazo derecho",
    preferredSortOrder: 2,
    prisma,
    studyId,
    userMessage: "No se pudo crear la asignacion de brazo derecho."
  });
  const leftProduct = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.studyProduct.upsert?.({
        create: {
          displayLabel: "Primera fragancia",
          internalCode: leftFragranceCode,
          isSensitive: true,
          realName: leftFragranceCode,
          studyId
        },
        update: {
          displayLabel: "Primera fragancia",
          isSensitive: true
        },
        where: {
          studyId_internalCode: {
            internalCode: leftFragranceCode,
            studyId
          }
        }
      }) as Promise<{ id: string }>,
    step: "study-product-left",
    userMessage: "No se pudo crear el producto de brazo izquierdo."
  });
  const rightProduct = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.studyProduct.upsert?.({
        create: {
          displayLabel: "Segunda fragancia",
          internalCode: rightFragranceCode,
          isSensitive: true,
          realName: rightFragranceCode,
          studyId
        },
        update: {
          displayLabel: "Segunda fragancia",
          isSensitive: true
        },
        where: {
          studyId_internalCode: {
            internalCode: rightFragranceCode,
            studyId
          }
        }
      }) as Promise<{ id: string }>,
    step: "study-product-right",
    userMessage: "No se pudo crear el producto de brazo derecho."
  });
  const rotationPlan = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.rotationPlan.upsert?.({
        create: {
          assignmentModeAllowed: "MANUAL",
          name: rotationCode,
          rotationCode,
          status: "ACTIVE",
          studyId
        },
        select: {
          id: true
        },
        update: {
          assignmentModeAllowed: "MANUAL",
          name: rotationCode,
          status: "ACTIVE"
        },
        where: {
          studyId_rotationCode: {
            rotationCode,
            studyId
          }
        }
      }) as Promise<{ id: string }>,
    step: "rotation-plan",
    userMessage: "Faltan datos requeridos para crear RotationPlan."
  });

  await runNavigoRotationImportStep({
    folio,
    operation: async () => {
      await prisma.rotationPlanArm.deleteMany?.({
        where: { rotationPlanId: rotationPlan.id }
      });
      await prisma.rotationPlanArm.createMany?.({
        data: [
          {
            applicationOrder: 1,
            participantVisibleLabel: "Primera fragancia",
            rotationPlanId: rotationPlan.id,
            studyArmId: leftArm.id,
            studyProductId: leftProduct.id
          },
          {
            applicationOrder: 2,
            participantVisibleLabel: "Segunda fragancia",
            rotationPlanId: rotationPlan.id,
            studyArmId: rightArm.id,
            studyProductId: rightProduct.id
          }
        ]
      });
      return { id: rotationPlan.id };
    },
    step: "rotation-plan-arms",
    userMessage: "No se pudieron guardar los brazos del plan de rotacion."
  });

  const rotationAssignment = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.participantRotationAssignment.upsert?.({
        create: {
          assignedByUserId: actorUserId,
          assignmentMode: "MANUAL_COVER_CODE",
          rotationCode,
          rotationPlanId: rotationPlan.id,
          studyParticipantId: participant.id
        },
        select: { id: true },
        update: {
          changedAt: new Date(),
          rotationCode,
          rotationPlanId: rotationPlan.id
        },
        where: {
          studyParticipantId: participant.id
        }
      }) as Promise<{ id: string }>,
    step: "participant-rotation-assignment",
    userMessage: "No se pudo crear la asignacion de rotacion del participante."
  });

  await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.participantArmAssignment.upsert?.({
        create: {
          applicationOrder: 1,
          participantRotationAssignmentId: rotationAssignment.id,
          participantVisibleLabel: "Primera fragancia",
          studyArmId: leftArm.id,
          studyParticipantId: participant.id,
          studyProductId: leftProduct.id
        },
        update: {
          applicationOrder: 1,
          participantRotationAssignmentId: rotationAssignment.id,
          participantVisibleLabel: "Primera fragancia",
          studyProductId: leftProduct.id
        },
        where: {
          studyParticipantId_studyArmId: {
            studyArmId: leftArm.id,
            studyParticipantId: participant.id
          }
        }
      }) as Promise<{ id: string }>,
    step: "participant-arm-left",
    userMessage: "No se pudo crear la asignacion de brazo izquierdo."
  });
  await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.participantArmAssignment.upsert?.({
        create: {
          applicationOrder: 2,
          participantRotationAssignmentId: rotationAssignment.id,
          participantVisibleLabel: "Segunda fragancia",
          studyArmId: rightArm.id,
          studyParticipantId: participant.id,
          studyProductId: rightProduct.id
        },
        update: {
          applicationOrder: 2,
          participantRotationAssignmentId: rotationAssignment.id,
          participantVisibleLabel: "Segunda fragancia",
          studyProductId: rightProduct.id
        },
        where: {
          studyParticipantId_studyArmId: {
            studyArmId: rightArm.id,
            studyParticipantId: participant.id
          }
        }
      }) as Promise<{ id: string }>,
    step: "participant-arm-right",
    userMessage: "No se pudo crear la asignacion de brazo derecho."
  });

  return {
    rotationCode
  };
}

async function resolveActiveScreenerVersionId({
  prisma,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  studyId: string;
}): Promise<string | null> {
  const version = (await prisma.questionnaireVersion.findFirst?.({
    orderBy: { versionNumber: "desc" },
    select: { id: true },
    where: {
      status: "ACTIVE",
      studyId
    }
  })) as { id: string } | null;

  return version?.id ?? null;
}

async function listExistingReferenceCodes(prisma: NavigoPrismaClient | NavigoTransactionClient): Promise<string[]> {
  const codes = (await prisma.participantReferenceCode.findMany?.({
    select: { code: true }
  })) as Array<{ code: string }>;

  return codes.map((code) => code.code);
}

function parseFolioSequence(folio: string): number {
  const match = /(\d+)$/.exec(folio);
  const sequence = match ? Number(match[1]) : Number.NaN;

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("El folio debe terminar con una secuencia numerica.");
  }

  return sequence;
}

function buildNavigoLinksRotationTsv({
  dashboard,
  now,
  requestOrigin
}: {
  dashboard: NavigoAdminDashboard;
  now: Date;
  requestOrigin: string;
}): string {
  const header = [
    "Folio",
    "Nombre",
    "Celular",
    "Correo",
    "Reclutador",
    "Link participante",
    "Primera fragancia / brazo izquierdo",
    "Segunda fragancia / brazo derecho",
    "Estado participante",
    "Estado App",
    "T0 estado",
    "T0 hora",
    "T2 estado",
    "T2 hora ideal",
    "T2 hora real",
    "T4 estado",
    "T4 hora ideal",
    "T4 hora real",
    "T8 estado",
    "T8 hora ideal",
    "T8 hora real",
    "Ultima actualizacion",
    "Incidencias"
  ];
  const rows = dashboard.participants.map((participant) => {
    const activities = new Map(participant.activities.map((activity) => [activity.code, activity]));
    const t0 = activities.get("T0_SALON");
    const t2 = activities.get("T2_HORAS");
    const t4 = activities.get("T4_HORAS");
    const t8 = activities.get("T8_HORAS");
    const link = participant.participantLinkToken
      ? new URL(`/p/${encodeURIComponent(participant.participantLinkToken)}/activities`, requestOrigin).toString()
      : "";

    return [
      participant.confirmation?.folio ?? "",
      participant.participant.name,
      participant.participant.phone,
      participant.participant.email,
      readDirectMetadata(participant)?.reclutador ?? "",
      link,
      participant.rotation.leftCode,
      participant.rotation.rightCode,
      participant.status,
      participant.alert,
      exportActivityStatus(t0),
      exportActivityTime(t0?.actualCompletedAt ?? t0?.actualStartedAt ?? null, dashboard.timeZoneIana),
      exportActivityStatus(t2),
      exportActivityTime(t2?.scheduledAt ?? null, dashboard.timeZoneIana),
      exportActivityTime(t2?.actualCompletedAt ?? t2?.actualStartedAt ?? null, dashboard.timeZoneIana),
      exportActivityStatus(t4),
      exportActivityTime(t4?.scheduledAt ?? null, dashboard.timeZoneIana),
      exportActivityTime(t4?.actualCompletedAt ?? t4?.actualStartedAt ?? null, dashboard.timeZoneIana),
      exportActivityStatus(t8),
      exportActivityTime(t8?.scheduledAt ?? null, dashboard.timeZoneIana),
      exportActivityTime(t8?.actualCompletedAt ?? t8?.actualStartedAt ?? null, dashboard.timeZoneIana),
      exportActivityTime(now, dashboard.timeZoneIana),
      [readDirectMetadata(participant)?.observaciones, participant.alert].filter(Boolean).join(" | ")
    ];
  });

  return buildNavigoTsv([header, ...rows]);
}

function readDirectMetadata(participant: NavigoParticipantListItem): { observaciones?: string | null; reclutador?: string | null } | null {
  const metadata = participant.confirmation?.screeningAttempt?.evaluationJson;
  if (typeof metadata === "object" && metadata !== null && "directSource" in metadata) {
    return metadata as { observaciones?: string | null; reclutador?: string | null };
  }

  return null;
}

function exportActivityStatus(activity: NavigoActivityListItem | undefined): string {
  if (!activity) {
    return "Pendiente";
  }

  return navigoActivityLabel(activity.code) && activity.status ? activity.status : "Pendiente";
}

function exportActivityTime(value: Date | null, timeZoneIana: string): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: resolveNavigoTimeZone(timeZoneIana)
  }).format(value);
}

function formatDateForFilename(value: Date, timeZoneIana: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: resolveNavigoTimeZone(timeZoneIana),
    year: "numeric"
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

async function resolveNavigoStudyArm({
  code,
  folio,
  label,
  preferredSortOrder,
  prisma,
  studyId,
  userMessage
}: {
  code: "LEFT" | "RIGHT";
  folio: string;
  label: string;
  preferredSortOrder: number;
  prisma: NavigoTransactionClient;
  studyId: string;
  userMessage: string;
}): Promise<{ id: string }> {
  let existing: { id: string; sortOrder: number } | null;
  try {
    existing = (await prisma.studyArm.findFirst?.({
      select: { id: true, sortOrder: true },
      where: { code, studyId }
    })) as { id: string; sortOrder: number } | null;
  } catch (error) {
    throw new NavigoRotationApplyError({
      code: getPrismaErrorCode(error),
      folio,
      logMessage: sanitizeRotationImportLogMessage(error),
      message: isLikelyDatabaseError(error) ? "Error de base de datos al guardar la rotacion. Revisa logs." : userMessage,
      step: `study-arm-${code.toLowerCase()}-lookup`
    });
  }

  if (existing) {
    await runNavigoRotationImportStep({
      folio,
      operation: async () => {
        await prisma.studyArm.update?.({
          data: { label },
          where: { id: existing.id }
        });
        return existing;
      },
      step: `study-arm-${code.toLowerCase()}-update`,
      userMessage
    });

    return existing;
  }

  const sortOrder = await resolveAvailableStudyArmSortOrder({
    folio,
    preferredSortOrder,
    prisma,
    studyId,
    userMessage
  });

  return runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.studyArm.create?.({
        data: {
          code,
          label,
          sortOrder,
          studyId
        },
        select: { id: true }
      }) as Promise<{ id: string }>,
    step: `study-arm-${code.toLowerCase()}-create`,
    userMessage
  });
}

async function resolveAvailableStudyArmSortOrder({
  folio,
  preferredSortOrder,
  prisma,
  studyId,
  userMessage
}: {
  folio: string;
  preferredSortOrder: number;
  prisma: NavigoTransactionClient;
  studyId: string;
  userMessage: string;
}): Promise<number> {
  let existingAtPreferred: { id: string } | null;
  try {
    existingAtPreferred = (await prisma.studyArm.findFirst?.({
      select: { id: true },
      where: {
        sortOrder: preferredSortOrder,
        studyId
      }
    })) as { id: string } | null;
  } catch (error) {
    throw new NavigoRotationApplyError({
      code: getPrismaErrorCode(error),
      folio,
      logMessage: sanitizeRotationImportLogMessage(error),
      message: isLikelyDatabaseError(error) ? "Error de base de datos al guardar la rotacion. Revisa logs." : userMessage,
      step: "study-arm-sort-order-lookup"
    });
  }

  if (!existingAtPreferred) {
    return preferredSortOrder;
  }

  const arms = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.studyArm.findMany?.({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
        take: 1,
        where: { studyId }
      }) as Promise<Array<{ sortOrder: number }>>,
    step: "study-arm-next-sort-order",
    userMessage
  });

  return Math.max(preferredSortOrder, (arms[0]?.sortOrder ?? preferredSortOrder) + 1);
}

async function runNavigoRotationImportStep<T>({
  folio,
  operation,
  step,
  userMessage
}: {
  folio: string;
  operation: () => Promise<T | null | undefined>;
  step: string;
  userMessage: string;
}): Promise<T> {
  try {
    const result = await operation();

    if (result === null || result === undefined) {
      throw new Error("Prisma operation did not return a record.");
    }

    return result;
  } catch (error) {
    throw new NavigoRotationApplyError({
      code: getPrismaErrorCode(error),
      folio,
      logMessage: sanitizeRotationImportLogMessage(error),
      message: isLikelyDatabaseError(error) ? "Error de base de datos al guardar la rotacion. Revisa logs." : userMessage,
      step
    });
  }
}

class NavigoRotationApplyError extends Error {
  code?: string;
  folio?: string;
  logMessage: string;
  step: string;

  constructor({
    code,
    folio,
    logMessage,
    message,
    step
  }: {
    code?: string;
    folio?: string;
    logMessage?: string;
    message: string;
    step: string;
  }) {
    super(message);
    this.name = "NavigoRotationApplyError";
    this.code = code;
    this.folio = folio;
    this.logMessage = logMessage ?? message;
    this.step = step;
  }
}

function toNavigoRotationApplyFailure(error: unknown): {
  folio?: string;
  logMessage: string;
  message: string;
  step: string;
} {
  if (error instanceof NavigoRotationApplyError) {
    return {
      folio: error.folio,
      logMessage: error.logMessage,
      message: error.message,
      step: error.step
    };
  }

  const code = getPrismaErrorCode(error);
  return {
    logMessage: sanitizeRotationImportLogMessage(error),
    message: code ? "Error de base de datos al guardar la rotacion. Revisa logs." : "No fue posible guardar la rotacion. Revisa logs.",
    step: "apply"
  };
}

function logNavigoRotationApplyFailure({
  error,
  folio,
  message,
  step,
  studyId
}: {
  error: unknown;
  folio?: string;
  message: string;
  step: string;
  studyId: string;
}) {
  const code = getPrismaErrorCode(error) ?? "UNKNOWN";
  console.error(
    `navigo rotation import apply failed: studyId=${studyId} folio=${folio ?? "unknown"} step=${step} code=${code} message=${message}`
  );
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function isLikelyDatabaseError(error: unknown): boolean {
  return Boolean(getPrismaErrorCode(error));
}

function sanitizeRotationImportLogMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "unknown");

  return raw.replace(/\s+/g, " ").slice(0, 220);
}

function buildParticipantRotationSummary(participant: ParticipantRecord): NavigoParticipantListItem["rotation"] {
  const leftArm = getAssignedArm(participant, "LEFT", 1);
  const rightArm = getAssignedArm(participant, "RIGHT", 2);
  const approvalComplete = participantStatus(participant) === "APPROVED";
  const folioComplete = Boolean(participant.participantConfirmation);
  const readiness = {
    approvalComplete,
    folioComplete,
    leftArmComplete: Boolean(leftArm),
    rightArmComplete: Boolean(rightArm)
  };

  return {
    checklist: buildNavigoRotationChecklist(readiness),
    leftCode: leftArm?.studyProduct.internalCode ?? null,
    ready: Boolean(approvalComplete && folioComplete && leftArm && rightArm),
    rightCode: rightArm?.studyProduct.internalCode ?? null,
    startPendingMessage: buildNavigoStartT0PendingMessage(readiness)
  };
}

async function toActivityListItem(activity: ActivityRecord, storage: EvidenceStorageClient): Promise<NavigoActivityListItem> {
  const record = toNavigoActivityRecord(activity);
  const activitySelfie = getActivitySelfie(activity);
  return {
    ...record,
    activitySelfie: activitySelfie
      ? {
          id: activitySelfie.id,
          internalNote: activitySelfie.internalNote,
          rejectionReason: activitySelfie.rejectionReason,
          reviewStatus: activitySelfie.reviewStatus,
          reviewedAt: activitySelfie.reviewedAt,
          signedUrl: await createActivitySelfieReadUrl({
            evidence: activitySelfie,
            storage
          }),
          uploadedAt: activitySelfie.uploadedAt
        }
      : null,
    code: activity.activitySchedule.code,
    evidenceCount: getActivitySelfieCount(activity),
    existingResponses: Object.fromEntries(activity.responses.map((response) => [response.questionId, response.answerJson])),
    readableResponses: createReadableNavigoResponses(activity.responses),
    responseCount: countNavigoMeasurementResponses(activity.responses)
  };
}

function toNavigoActivityRecord(activity: ActivityRecord): NavigoActivityRecord & { code: NavigoActivityCode } {
  const identityStatus = readNavigoIdentityStatusFromResponses(activity.responses);
  const responseCount = countNavigoMeasurementResponses(activity.responses);
  const isIncompleteT0 = activity.activitySchedule.code === "T0_SALON" && !isNavigoT0Complete({
    identityStatus,
    responseCount,
    status: activity.status
  });

  return {
    activityScheduleId: activity.activityScheduleId,
    actualCompletedAt: activity.actualCompletedAt,
    actualStartedAt: activity.actualStartedAt,
    availableFrom: activity.availableFrom,
    availableUntil: activity.availableUntil,
    code: activity.activitySchedule.code,
    id: activity.id,
    identityStatus: activity.activitySchedule.code === "T0_SALON" ? identityStatus : undefined,
    identityReviewStatus: getActivitySelfie(activity)?.reviewStatus,
    occurrenceKey: activity.occurrenceKey,
    responseCount,
    scheduledAt: activity.scheduledAt,
    selfieCount: getActivitySelfieCount(activity),
    status: isIncompleteT0 ? "STARTED" : activity.status
  };
}

function validateParticipantForT0(participant: ParticipantRecord | null): NavigoStartT0Result {
  if (!participant) {
    return { message: "No encontramos el participante.", ok: false };
  }

  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return { message: "Solo el estudio Navigo permite iniciar App Navigo.", ok: false };
  }

  if (!participant.participantConfirmation) {
    return { message: "Solo participantes confirmados con folio pueden iniciar T0.", ok: false };
  }

  if (participantStatus(participant) !== "APPROVED" && participantStatus(participant) !== "CONFIRMED") {
    return { message: "Pendiente para iniciar T0: aprobacion del participante.", ok: false };
  }

  const rotation = buildParticipantRotationSummary(participant);

  if (!rotation.ready) {
    return { message: rotation.startPendingMessage ?? "Pendiente para iniciar T0: configuracion de rotacion.", ok: false };
  }

  return { linkToken: "", message: "ok", ok: true };
}

function validateParticipantForToken(
  participant: ParticipantRecord
): NavigoParticipantActivitiesView | { ok: true } {
  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return {
      message: "No encontramos una participacion activa para este enlace.",
      ok: false
    };
  }

  if (!participant.participantConfirmation) {
    return {
      message: "No encontramos una participacion activa para este enlace.",
      ok: false
    };
  }

  if (participantStatus(participant) !== "APPROVED" && participantStatus(participant) !== "CONFIRMED") {
    return {
      message: "No encontramos una participacion activa para este enlace.",
      ok: false
    };
  }

  const rotation = buildParticipantRotationSummary(participant);
  if (!rotation.ready) {
    return {
      message: rotation.startPendingMessage ?? "La participacion aun no esta lista para App Navigo.",
      ok: false
    };
  }

  return { ok: true };
}

function participantStatus(participant: ParticipantRecord): NavigoParticipantListItem["status"] {
  const reviewStatus = participant.participantScreeningReviews[0]?.status;

  if (reviewStatus === "REJECTED" || participant.screeningStatus === "TERMINATED") {
    return participant.screeningStatus === "TERMINATED" ? "TERMINATED" : "REJECTED";
  }

  if (participant.participantConfirmation || reviewStatus === "APPROVED") {
    return "APPROVED";
  }

  return "PENDING";
}

function activityStateAtEvent(activities: NavigoActivityRecord[]): "COMPLETED_EXISTS" | "NONE_STARTED" | "SOME_STARTED" {
  if (activities.some((activity) => activity.actualCompletedAt || activity.status === "COMPLETED")) {
    return "COMPLETED_EXISTS";
  }

  if (activities.some((activity) => activity.actualStartedAt || activity.status === "STARTED" || activity.status === "INCOMPLETE")) {
    return "SOME_STARTED";
  }

  return "NONE_STARTED";
}

function hasT0Started(participant: ParticipantRecord): boolean {
  if (participant.applicationStartedAt) {
    return true;
  }

  return (participant.activities ?? []).some(
    (activity) =>
      activity.actualStartedAt ||
      activity.actualCompletedAt ||
      activity.status === "COMPLETED" ||
      activity.status === "STARTED" ||
      activity.status === "INCOMPLETE"
  );
}

async function ensureParticipantAccessToken({
  actorUserId,
  forceRegenerate = false,
  now,
  participant,
  prisma
}: {
  actorUserId: string;
  forceRegenerate?: boolean;
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<string> {
  const activeToken = participant.accessTokens?.[0];

  if (!forceRegenerate && activeToken && activeToken.tokenHash === hashToken(activeToken.id) && activeToken.expiresAt.getTime() > now.getTime()) {
    return activeToken.id;
  }

  if (activeToken) {
    await prisma.participantAccessToken.updateMany?.({
      data: {
        revokedAt: now,
        revokedByUserId: actorUserId,
        revocationReason: "REGENERATED",
        status: "REVOKED"
      },
      where: {
        status: "ACTIVE",
        studyParticipantId: participant.id
      }
    });
  }

  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.participantAccessToken.create?.({
    data: {
      createdByUserId: actorUserId,
      expiresAt,
      id: token,
      status: "ACTIVE",
      studyParticipantId: participant.id,
      tokenHash: hashToken(token)
    }
  });

  return token;
}

function getFirstIncompleteMeasurement(timeline: ReturnType<typeof buildNavigoActivityTimeline>) {
  return timeline.find((activity) => activity.status !== "COMPLETED") ?? null;
}

function resolveBlindLabels(participant: ParticipantRecord) {
  const leftArm = getAssignedArm(participant, "LEFT", 1);
  const rightArm = getAssignedArm(participant, "RIGHT", 2);

  return {
    left: leftArm?.studyProduct.internalCode || leftArm?.participantVisibleLabel || "Primera fragancia",
    right: rightArm?.studyProduct.internalCode || rightArm?.participantVisibleLabel || "Segunda fragancia"
  };
}

function getAssignedArm(participant: ParticipantRecord, code: "LEFT" | "RIGHT", order: number) {
  const arms = participant.rotationAssignment?.arms ?? [];

  return (
    arms.find((arm) => arm.studyArm.code.toUpperCase() === code) ??
    arms.find((arm) => arm.applicationOrder === order) ??
    null
  );
}

function getActivitySelfie(activity: Pick<ActivityRecord, "id" | "participantActivityEvidence">) {
  return activity.participantActivityEvidence.find(
    (evidence) => evidence.participantActivityId === activity.id && evidence.type === "SELFIE_IDENTIFICATION"
  ) ?? null;
}

function getActivitySelfieCount(activity: Pick<ActivityRecord, "id" | "participantActivityEvidence">): number {
  return activity.participantActivityEvidence.filter(
    (evidence) => evidence.participantActivityId === activity.id && evidence.type === "SELFIE_IDENTIFICATION"
  ).length;
}

function hasApprovedActivitySelfie(activity: Pick<ActivityRecord, "id" | "participantActivityEvidence">): boolean {
  return activity.participantActivityEvidence.some(
    (evidence) =>
      evidence.participantActivityId === activity.id &&
      evidence.reviewStatus === "APPROVED" &&
      evidence.type === "SELFIE_IDENTIFICATION"
  );
}

function availabilityMessage(availability: ReturnType<typeof buildNavigoActivityTimeline>[number]["availability"] | null | undefined): string {
  const reason = availability?.reason ?? "PREVIOUS_REQUIRED";
  if (reason === "BEFORE_WINDOW") {
    return "Aun no es momento de realizar esta evaluacion.";
  }

  if (reason === "AFTER_WINDOW") {
    return "Esta evaluacion esta fuera de la ventana permitida. Contacta a tu reclutador.";
  }

  if (reason === "ALREADY_COMPLETED") {
    return "Esta evaluacion ya fue registrada.";
  }

  if (reason === "IDENTITY_REVIEW_REQUIRED") {
    return "Tu participación requiere revisión de identidad. Contacta a tu reclutador.";
  }

  if (reason === "PREVIOUS_REQUIRED") {
    return previousActivityRequiredMessage(availability && "blockedByCode" in availability ? availability.blockedByCode : undefined);
  }

  return "Debes completar la evaluacion anterior antes de continuar.";
}

function previousActivityRequiredMessage(blockedByCode: NavigoActivityCode | undefined): string {
  if (blockedByCode === "T2_HORAS") {
    return "Completa primero la evaluacion de 2 horas.";
  }

  if (blockedByCode === "T4_HORAS") {
    return "Completa primero la evaluacion de 4 horas.";
  }

  return "La evaluacion 0 en salon aun no esta completa.";
}

function buildActivityEvidenceStorageKey({
  activityId,
  evidenceType,
  extension,
  participantProfileId,
  studyId
}: {
  activityId: string;
  evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  extension: string;
  participantProfileId: string;
  studyId: string;
}) {
  const safeExtension = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();

  return [
    "studies",
    studyId,
    "participants",
    participantProfileId,
    "activities",
    activityId,
    evidenceType.toLowerCase(),
    `${randomUUID()}.${safeExtension}`
  ].join("/");
}

function assertActivityEvidenceKeyBelongsToActivity({
  activityId,
  participantProfileId,
  privateStorageKey,
  studyId
}: {
  activityId: string;
  participantProfileId: string;
  privateStorageKey: string;
  studyId: string;
}) {
  assertEvidenceStorageKeyBelongsToAttempt({
    attemptId: activityId,
    participantProfileId,
    privateStorageKey: privateStorageKey.replace(`/activities/${activityId}/`, `/screening-attempts/${activityId}/`),
    studyId
  });
}

function extensionFromFilename(filename: string): string {
  const extension = filename.trim().toLowerCase().split(".").pop() ?? "jpg";
  return extension === "jpeg" ? "jpg" : extension;
}
