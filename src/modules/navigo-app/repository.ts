import { createHash, randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  buildEvidenceStorageKey,
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
  resolveNavigoVisualVerificationMode,
  type NavigoActivityCode,
  type NavigoVisualVerificationMode
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
    screeningAttempt?: { evaluationJson: unknown; id: string } | null;
  } | null;
  hasRecoverableToken: boolean;
  participantLinkToken: string | null;
  id: string;
  visualVerificationMode: NavigoVisualVerificationMode;
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
  unchanged: boolean;
  rowNumber: number;
  rotationComplete: boolean;
  updatable: boolean;
};

export type NavigoParticipantImportPreview = {
  rows: NavigoParticipantImportPreviewRow[];
  summary: {
    duplicatePhones: number;
    existingParticipants: number;
    newParticipants: number;
    omitted: number;
    phoneDuplicates: number;
    rotationComplete: number;
    rowsWithError: number;
    totalRows: number;
    updatable: number;
    validRows: number;
  };
};

export type NavigoParticipantImportResult = {
  applyErrors: Array<{
    folio: string;
    message: string;
    rowNumber: number;
    step: string;
  }>;
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
        requiresSelfie: boolean;
        selfieCapturePurpose: NavigoSelfieCapturePurpose | null;
        selfieReviewStatus: "APPROVED" | "PENDING" | "REJECTED" | null;
        selfieCount: number;
        study: NavigoStudySummary;
        testMode: boolean;
        timeZoneIana: string;
        visualVerificationMode: NavigoVisualVerificationMode;
        visualVerificationStatus: NavigoVisualVerificationStatus;
      };
      ok: true;
    };

export type NavigoSignedActivityUpload = {
  metadata: EvidenceUploadMetadata;
  privateStorageKey: string;
  storageBucket: string;
  token: string;
};

export type NavigoSelfieCapturePurpose = "activity_verification" | "reference_capture";
export type NavigoVisualVerificationStatus =
  | "failed"
  | "matched"
  | "not_required"
  | "pending_review"
  | "reference_created"
  | "uncertain"
  | null;

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
  updateParticipantVisualVerificationMode: (input: {
    actorUserId: string;
    mode: NavigoVisualVerificationMode;
    studyParticipantId: string;
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
  applicationTimeEvent: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  participantArmAssignment: Delegate;
  participantConfirmation: Delegate;
  participantEvidence: Delegate;
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
  visualVerificationMode: true,
  participantConfirmation: {
    select: {
      folio: true,
      screeningAttempt: {
        select: {
          id: true,
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
      folio: true,
      screeningAttempt: {
        select: {
          id: true,
          evaluationJson: true
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
  rotationAssignment: {
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          studyArm: {
            select: {
              code: true
            }
          },
          studyProduct: {
            select: {
              internalCode: true
            }
          }
        }
      }
    }
  }
} as const;

type StudyRecord = NavigoStudySummary;
type ParticipantImportLookupRecord = {
  id: string;
  participantConfirmation: {
    folio: string;
    screeningAttempt?: { evaluationJson: unknown; id: string } | null;
  } | null;
  participantProfile: {
    email: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
  rotationAssignment: {
    arms: Array<{
      applicationOrder: number;
      studyArm: { code: string };
      studyProduct: { internalCode: string };
    }>;
  } | null;
};
type ParticipantRecord = {
  accessTokens?: Array<{ expiresAt: Date; id: string; status: string; tokenHash: string }>;
  activities?: ActivityRecord[];
  applicationStartedAt: Date | null;
  id: string;
  participantConfirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
    screeningAttempt?: { evaluationJson: unknown; id: string } | null;
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
  visualVerificationMode: string | null;
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

    async updateParticipantVisualVerificationMode(input) {
      const mode = resolveNavigoVisualVerificationMode(input.mode);
      const prisma = await getPrisma();

      const participant = (await prisma.studyParticipant.findUnique?.({
        select: participantWithActivitiesSelect,
        where: { id: input.studyParticipantId }
      })) as ParticipantRecord | null;

      if (!participant) {
        return { message: "No encontramos el participante.", ok: false };
      }

      if (participant.study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite configurar identificacion visual.", ok: false };
      }

      if (participant.applicationStartedAt || hasT0Started(participant)) {
        return { message: "La identificacion visual solo puede cambiarse antes de iniciar T0.", ok: false };
      }

      await prisma.studyParticipant.update?.({
        data: {
          visualVerificationMode: mode
        },
        where: { id: participant.id }
      });

      return {
        message:
          mode === "disabled"
            ? "Identificacion visual marcada como no requerida para este participante."
            : "Identificacion visual marcada como requerida para este participante.",
        ok: true
      };
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
            applyErrors: [],
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
      const applyErrors: NavigoParticipantImportResult["applyErrors"] = [];

      for (const row of preview.rows) {
        try {
          const result = await prisma.$transaction(async (tx) =>
            upsertNavigoDirectParticipant({
              actorUserId: input.actorUserId,
              generateLink: Boolean(input.generateLinks),
              now,
              prisma: tx,
              row,
              rowNumber: row.rowNumber,
              study
            })
          );

          if (result.createdProfile || result.createdStudyParticipant || result.createdConfirmation) {
            created += 1;
          } else {
            updated += 1;
          }
          if (result.linkToken) {
            linksCreated += 1;
          }
        } catch (error) {
          const failure = toNavigoParticipantImportApplyFailure(error, {
            folio: row.folio,
            rowNumber: row.rowNumber
          });

          logNavigoParticipantImportApplyFailure({
            code: failure.code,
            folio: failure.folio,
            message: failure.logMessage,
            rowNumber: failure.rowNumber,
            step: failure.step,
            studyId: input.studyId
          });

          applyErrors.push({
            folio: failure.folio,
            message: failure.message,
            rowNumber: failure.rowNumber,
            step: failure.step
          });
        }
      }

      const nextPreview = await buildParticipantImportPreview({
        prisma,
        rows: input.rows,
        studyId: input.studyId
      });

      if (applyErrors.length > 0) {
        return {
          data: {
            applyErrors,
            created,
            errors: applyErrors.length,
            linksCreated,
            omitted: applyErrors.length,
            preview: nextPreview,
            updated
          },
          message: "La previsualizacion sigue siendo valida, pero ocurrio un error al aplicar algunas filas.",
          ok: false
        };
      }

      return {
        data: {
          applyErrors: [],
          created,
          errors: 0,
          linksCreated,
          omitted: 0,
          preview: nextPreview,
          updated
        },
        ok: true
      };
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

      const visualVerificationMode = resolveParticipantVisualVerificationMode(participant);
      const selfieCapturePurpose = resolveSelfieCapturePurpose({
        activity,
        mode: visualVerificationMode,
        participant
      });

      if (
        visualVerificationMode === "required" &&
        !hasRegisteredSelfie(participant) &&
        activity.activitySchedule.code !== "T0_SALON"
      ) {
        return {
          message: "No encontramos una foto registrada para comparar. Contacta al supervisor antes de continuar.",
          ok: false
        };
      }

      const activitySelfie = getActivitySelfie(activity);
      const requiresSelfie = selfieCapturePurpose !== null;

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
            storage: input.storage
          }),
          requiresSelfie,
          selfieCapturePurpose,
          selfieReviewStatus: activitySelfie?.reviewStatus ?? null,
          selfieCount: getActivitySelfieCount(activity),
          study: participant.study,
          testMode: Boolean(input.testMode),
          timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana),
          visualVerificationMode,
          visualVerificationStatus: resolveVisualVerificationStatus({
            activity,
            mode: visualVerificationMode,
            participant,
            purpose: selfieCapturePurpose
          })
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
      const timeZoneIana = resolveNavigoTimeZone(study.timeZoneIana);

      return {
        data: {
          body: buildNavigoLinksRotationTsv({
            participants,
            requestOrigin: input.requestOrigin
          }),
          filename: `${study.code}_links_rotacion_${formatDateForFilename(input.now ?? new Date(), timeZoneIana)}.tsv`
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

      const purpose = resolveSelfieCapturePurpose({
        activity,
        mode: resolveParticipantVisualVerificationMode(participant),
        participant
      });

      if (!purpose) {
        return { message: selfieNotRequiredMessage({ activity, participant }), ok: false };
      }

      if (purpose === "activity_verification" && getActivitySelfieCount(activity) > 0) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      const metadata = validateEvidenceUploadMetadata({
        maxImageBytes: 8388608,
        metadata: input.metadata
      });
      if (purpose === "reference_capture" && !getReferenceScreeningAttemptId(participant)) {
        return { message: "No encontramos el intento de filtro para preparar la selfie de referencia.", ok: false };
      }
      const privateStorageKey =
        purpose === "reference_capture"
          ? buildReferenceSelfieStorageKey({ metadata, participant })
          : buildActivityEvidenceStorageKey({
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

      if (input.metadata.evidenceType !== "SELFIE_IDENTIFICATION") {
        return { message: "Esta evaluacion solo permite selfie de identificacion.", ok: false };
      }

      const purpose = resolveSelfieCapturePurpose({
        activity,
        mode: resolveParticipantVisualVerificationMode(participant),
        participant
      });

      if (!purpose) {
        return { message: selfieNotRequiredMessage({ activity, participant }), ok: false };
      }

      if (purpose === "activity_verification" && getActivitySelfieCount(activity) > 0) {
        return { message: "Ya existe una selfie registrada para esta evaluacion.", ok: false };
      }

      if (purpose === "reference_capture") {
        return saveReferenceSelfieFromActivity({
          activity,
          metadata: input.metadata,
          participant,
          prisma
        });
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

        if (resolveParticipantVisualVerificationMode(participant) === "required" && !hasApprovedActivitySelfie(activity)) {
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
  storage?: EvidenceStorageClient;
}): Promise<{ signedUrl: string } | null> {
  const selfie = participant.participantEvidence.find((evidence) => evidence.type === "SELFIE_IDENTIFICATION");

  if (!selfie) {
    return null;
  }

  let signedUrl: string;

  try {
    const storageClient = storage ?? createSupabaseEvidenceStorageClient();
    signedUrl = await storageClient.createSignedReadUrl({
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
    visualVerificationMode: resolveParticipantVisualVerificationMode(participant),
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
    const matchedParticipant = phoneParticipant ?? folioParticipant;

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

    const unchanged = matchedParticipant ? isSameNavigoParticipantImportRow(matchedParticipant, row) : false;

    return {
      ...row,
      celularDuplicado: Boolean(phoneParticipant),
      errors,
      existingFolio: Boolean(folioParticipant),
      existingParticipant: Boolean(matchedParticipant),
      folioNuevo: !folioParticipant,
      unchanged,
      rotationComplete: Boolean(row.primeraFragancia && row.segundaFragancia && row.primeraFragancia !== row.segundaFragancia),
      rowNumber: index + 2,
      updatable: errors.length === 0 && Boolean(matchedParticipant) && !unchanged
    };
  });

  return {
    rows: previewRows,
    summary: {
      duplicatePhones: duplicatedPhones.size,
      existingParticipants: previewRows.filter((row) => row.existingParticipant).length,
      newParticipants: previewRows.filter((row) => !row.existingParticipant && row.folio && row.celular).length,
      omitted: previewRows.filter((row) => row.errors.length > 0).length,
      phoneDuplicates: previewRows.filter((row) => row.celularDuplicado).length,
      rotationComplete: previewRows.filter((row) => row.rotationComplete).length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      totalRows: previewRows.length,
      updatable: previewRows.filter((row) => row.updatable).length,
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

function isSameNavigoParticipantImportRow(
  participant: ParticipantImportLookupRecord,
  row: NavigoParticipantImportRowInput
): boolean {
  const directMetadata = readNavigoDirectImportMetadata(participant);
  const leftArm = participant.rotationAssignment?.arms.find(
    (arm) => arm.studyArm.code.toUpperCase() === "LEFT" || arm.applicationOrder === 1
  );
  const rightArm = participant.rotationAssignment?.arms.find(
    (arm) => arm.studyArm.code.toUpperCase() === "RIGHT" || arm.applicationOrder === 2
  );

  return (
    participant.participantConfirmation?.folio === row.folio &&
    participant.participantProfile.name === row.nombre &&
    participant.participantProfile.phone === row.celular &&
    (participant.participantProfile.email ?? null) === (row.correo ?? null) &&
    (leftArm?.studyProduct.internalCode ?? null) === row.primeraFragancia &&
    (rightArm?.studyProduct.internalCode ?? null) === row.segundaFragancia &&
    (directMetadata.reclutador ?? null) === (row.reclutador ?? null) &&
    (directMetadata.observaciones ?? null) === (row.observaciones ?? null)
  );
}

function readNavigoDirectImportMetadata(
  participant: ParticipantImportLookupRecord
): { observaciones?: string | null; reclutador?: string | null } {
  const metadata = participant.participantConfirmation?.screeningAttempt?.evaluationJson;

  if (typeof metadata === "object" && metadata !== null && "directSource" in metadata) {
    return metadata as { observaciones?: string | null; reclutador?: string | null };
  }

  return {};
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
  rowNumber,
  study
}: {
  actorUserId: string;
  generateLink: boolean;
  now: Date;
  prisma: NavigoTransactionClient;
  row: NavigoParticipantImportRowInput;
  rowNumber?: number;
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
    throw new NavigoParticipantImportApplyError({
      folio: row.folio,
      message: buildNavigoParticipantImportRowMessage({
        folio: row.folio,
        message: "el folio ya existe con otro celular.",
        rowNumber
      }),
      rowNumber,
      step: "participant-folio-conflict"
    });
  }
  if (byPhone?.participantConfirmation?.folio && byPhone.participantConfirmation.folio !== row.folio) {
    throw new NavigoParticipantImportApplyError({
      folio: row.folio,
      message: buildNavigoParticipantImportRowMessage({
        folio: row.folio,
        message: "el celular ya existe con otro folio.",
        rowNumber
      }),
      rowNumber,
      step: "participant-phone-conflict"
    });
  }

  let profile = byPhone?.participantProfile ?? byFolio?.participantProfile ?? null;
  const createdProfile = !profile;

  if (!profile) {
    profile = await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.participantProfile.create?.({
          data: {
            createdByUserId: actorUserId,
            email: row.correo,
            name: row.nombre,
            phone: row.celular,
            status: "ACTIVE"
          },
          select: { email: true, id: true, name: true, phone: true }
        }) as Promise<{ email: string | null; id: string; name: string; phone: string | null }>,
      rowNumber,
      step: "participant-profile-create",
      userMessage: "no se pudo crear ParticipantProfile."
    });
  } else {
    const existingProfileId = profile.id;
    await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.participantProfile.update?.({
          data: {
            email: row.correo,
            name: row.nombre,
            phone: row.celular
          },
          where: { id: existingProfileId }
        }) as Promise<unknown>,
      rowNumber,
      step: "participant-profile-update",
      userMessage: "no se pudo actualizar ParticipantProfile."
    });
  }

  if (!profile) {
    throw new NavigoParticipantImportApplyError({
      folio: row.folio,
      message: buildNavigoParticipantImportRowMessage({
        folio: row.folio,
        message: "no se pudo resolver ParticipantProfile.",
        rowNumber
      }),
      rowNumber,
      step: "participant-profile-resolve"
    });
  }

  const existingParticipant = byPhone ?? byFolio ?? null;
  const createdStudyParticipant = !existingParticipant;

  if (!existingParticipant) {
    await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.studyParticipant.create?.({
          data: {
            createdByUserId: actorUserId,
            operationalStatus: "ASSIGNED",
            participantProfileId: profile.id,
            screeningStatus: "PASSED",
            studyId: study.id
          }
        }) as Promise<unknown>,
      rowNumber,
      step: "study-participant-create",
      userMessage: "no se pudo crear StudyParticipant."
    });
  } else {
    await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.studyParticipant.update?.({
          data: {
            operationalStatus: "ASSIGNED",
            screeningStatus: "PASSED"
          },
          where: { id: existingParticipant.id }
        }) as Promise<unknown>,
      rowNumber,
      step: "study-participant-update",
      userMessage: "no se pudo actualizar StudyParticipant."
    });
  }

  let participant = await runNavigoParticipantImportStep({
    folio: row.folio,
    operation: () =>
      prisma.studyParticipant.findUnique?.({
        select: participantWithActivitiesSelect,
        where: {
          participantProfileId_studyId: {
            participantProfileId: profile.id,
            studyId: study.id
          }
        }
      }) as Promise<ParticipantRecord | null>,
    rowNumber,
    step: "study-participant-load",
    userMessage: "no se pudo cargar StudyParticipant."
  });

  if (!participant) {
    throw new NavigoParticipantImportApplyError({
      folio: row.folio,
      message: buildNavigoParticipantImportRowMessage({
        folio: row.folio,
        message: "no fue posible preparar el participante.",
        rowNumber
      }),
      rowNumber,
      step: "study-participant-load"
    });
  }

  const createdConfirmation = !participant.participantConfirmation;
  if (!participant.participantConfirmation) {
    const questionnaireVersionId = await resolveActiveScreenerVersionId({ prisma, studyId: study.id });
    if (!questionnaireVersionId) {
      throw new NavigoParticipantImportApplyError({
        folio: row.folio,
        message: buildNavigoParticipantImportRowMessage({
          folio: row.folio,
          message: "el estudio no tiene una version activa de screener para trazabilidad.",
          rowNumber
        }),
        rowNumber,
        step: "questionnaire-version-active"
      });
    }

    const attempt = await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.screeningAttempt.create?.({
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
        }) as Promise<{ id: string }>,
      rowNumber,
      step: "screening-attempt-create",
      userMessage: "no se pudo crear ScreeningAttempt."
    });
    const confirmation = await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.participantConfirmation.create?.({
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
        }) as Promise<{ id: string }>,
      rowNumber,
      step: "participant-confirmation-create",
      userMessage: "no se pudo crear ParticipantConfirmation."
    });
    const referenceCodes = generateReferenceCodes({
      codeGenerator: generateParticipantReferenceCode,
      existingReferenceCodes: await listExistingReferenceCodes(prisma)
    });

    await runNavigoParticipantImportStep({
      folio: row.folio,
      operation: () =>
        prisma.participantReferenceCode.createMany?.({
          data: referenceCodes.map((code) => ({
            code: code.code,
            confirmationId: confirmation.id,
            slot: code.slot
          }))
        }) as Promise<unknown>,
      rowNumber,
      step: "participant-reference-codes-create",
      userMessage: "no se pudieron crear los codigos de referencia."
    });
  }

  participant = await runNavigoParticipantImportStep({
    folio: row.folio,
    operation: () =>
      prisma.studyParticipant.findUnique?.({
        select: participantWithActivitiesSelect,
        where: { id: participant.id }
      }) as Promise<ParticipantRecord | null>,
    rowNumber,
    step: "study-participant-reload-before-rotation",
    userMessage: "no se pudo recargar StudyParticipant antes de la rotacion."
  });

  try {
    await upsertParticipantRotationForCodes({
      actorUserId,
      leftFragranceCode: row.primeraFragancia,
      participant,
      prisma,
      rightFragranceCode: row.segundaFragancia
    });
  } catch (error) {
    throw toNavigoParticipantImportApplyError(error, {
      folio: row.folio,
      rowNumber
    });
  }

  participant = await runNavigoParticipantImportStep({
    folio: row.folio,
    operation: () =>
      prisma.studyParticipant.findUnique?.({
        select: participantWithActivitiesSelect,
        where: { id: participant.id }
      }) as Promise<ParticipantRecord | null>,
    rowNumber,
    step: "study-participant-reload-after-rotation",
    userMessage: "no se pudo recargar StudyParticipant despues de la rotacion."
  });

  let linkToken: string | null = null;
  if (generateLink) {
    const t0 = await ensureNavigoT0Activity({ now, participant, prisma });
    if (!t0.ok) {
      throw new NavigoParticipantImportApplyError({
        folio: row.folio,
        logMessage: t0.message,
        message: buildNavigoParticipantImportRowMessage({
          folio: row.folio,
          message: "no se pudo preparar T0 para generar el enlace.",
          rowNumber
        }),
        rowNumber,
        step: "participant-t0-prepare"
      });
    }

    try {
      linkToken = await ensureParticipantAccessToken({ actorUserId, now, participant, prisma });
    } catch (error) {
      throw toNavigoParticipantImportApplyError(error, {
        folio: row.folio,
        rowNumber,
        stepOverride: "participant-access-token",
        userMessageOverride: "no se pudo crear o reutilizar ParticipantAccessToken."
      });
    }
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

async function runNavigoParticipantImportStep<T>({
  folio,
  operation,
  rowNumber,
  step,
  userMessage
}: {
  folio: string;
  operation: () => Promise<T | null | undefined>;
  rowNumber?: number;
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
    throw new NavigoParticipantImportApplyError({
      code: getPrismaErrorCode(error),
      folio,
      logMessage: sanitizeRotationImportLogMessage(error),
      message: buildNavigoParticipantImportRowMessage({
        folio,
        message: userMessage,
        rowNumber
      }),
      rowNumber,
      step
    });
  }
}

function buildNavigoParticipantImportRowMessage({
  folio,
  message,
  rowNumber
}: {
  folio: string;
  message: string;
  rowNumber?: number;
}) {
  return `Fila ${rowNumber ?? "?"} / ${folio}: ${message}`;
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
  const currentLeftCode = getAssignedArm(participant, "LEFT", 1)?.studyProduct.internalCode ?? null;
  const currentRightCode = getAssignedArm(participant, "RIGHT", 2)?.studyProduct.internalCode ?? null;

  if (
    hasT0Started(participant) &&
    ((currentLeftCode && currentLeftCode !== leftFragranceCode) ||
      (currentRightCode && currentRightCode !== rightFragranceCode))
  ) {
    throw new NavigoRotationApplyError({
      folio,
      logMessage: "t0 already started for participant rotation update",
      message: "No se puede actualizar la rotacion porque T0 ya fue iniciado.",
      step: "rotation-locked-after-t0"
    });
  }

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
  participants,
  requestOrigin
}: {
  participants: ParticipantRecord[];
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
    "Estado participante"
  ];
  const rows = participants.map((participant) => {
    const rotation = buildParticipantRotationSummary(participant);
    const directMetadata = readDirectMetadata(participant);
    const participantLinkToken = participant.accessTokens?.[0]?.id ?? null;
    const link = participantLinkToken
      ? new URL(`/p/${encodeURIComponent(participantLinkToken)}/activities`, requestOrigin).toString()
      : "";

    return [
      participant.participantConfirmation?.folio ?? "",
      participant.participantProfile.name,
      participant.participantProfile.phone,
      participant.participantProfile.email,
      directMetadata?.reclutador ?? "",
      link,
      rotation.leftCode,
      rotation.rightCode,
      participantStatus(participant)
    ];
  });

  return buildNavigoTsv([header, ...rows]);
}

function readDirectMetadata(participant: ParticipantRecord): { observaciones?: string | null; reclutador?: string | null } | null {
  const metadata = participant.participantConfirmation?.screeningAttempt?.evaluationJson;
  if (typeof metadata === "object" && metadata !== null && "directSource" in metadata) {
    return metadata as { observaciones?: string | null; reclutador?: string | null };
  }

  return null;
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

class NavigoParticipantImportApplyError extends Error {
  code?: string;
  folio: string;
  logMessage: string;
  rowNumber: number;
  step: string;

  constructor({
    code,
    folio,
    logMessage,
    message,
    rowNumber,
    step
  }: {
    code?: string;
    folio: string;
    logMessage?: string;
    message: string;
    rowNumber?: number;
    step: string;
  }) {
    super(message);
    this.name = "NavigoParticipantImportApplyError";
    this.code = code;
    this.folio = folio;
    this.logMessage = logMessage ?? message;
    this.rowNumber = rowNumber ?? -1;
    this.step = step;
  }
}

function toNavigoParticipantImportApplyError(
  error: unknown,
  input: {
    folio: string;
    rowNumber?: number;
    stepOverride?: string;
    userMessageOverride?: string;
  }
): NavigoParticipantImportApplyError {
  if (error instanceof NavigoParticipantImportApplyError) {
    return error;
  }

  if (error instanceof NavigoRotationApplyError) {
    return new NavigoParticipantImportApplyError({
      code: error.code,
      folio: input.folio,
      logMessage: error.logMessage,
      message: buildNavigoParticipantImportRowMessage({
        folio: input.folio,
        message: input.userMessageOverride ?? mapNavigoRotationStepToParticipantImportMessage(error.step),
        rowNumber: input.rowNumber
      }),
      rowNumber: input.rowNumber,
      step: input.stepOverride ?? error.step
    });
  }

  return new NavigoParticipantImportApplyError({
    code: getPrismaErrorCode(error),
    folio: input.folio,
    logMessage: sanitizeRotationImportLogMessage(error),
    message: buildNavigoParticipantImportRowMessage({
      folio: input.folio,
      message: input.userMessageOverride ?? "no fue posible aplicar la fila.",
      rowNumber: input.rowNumber
    }),
    rowNumber: input.rowNumber,
    step: input.stepOverride ?? "apply-row"
  });
}

function toNavigoParticipantImportApplyFailure(
  error: unknown,
  input: { folio: string; rowNumber: number }
): {
  code?: string;
  folio: string;
  logMessage: string;
  message: string;
  rowNumber: number;
  step: string;
} {
  const failure = toNavigoParticipantImportApplyError(error, input);

  return {
    code: failure.code,
    folio: failure.folio,
    logMessage: failure.logMessage,
    message: failure.message,
    rowNumber: failure.rowNumber,
    step: failure.step
  };
}

function mapNavigoRotationStepToParticipantImportMessage(step: string): string {
  switch (step) {
    case "study-arm-left-lookup":
    case "study-arm-left-update":
    case "study-arm-left-create":
      return "no se pudo crear o reutilizar StudyArm LEFT.";
    case "study-arm-right-lookup":
    case "study-arm-right-update":
    case "study-arm-right-create":
      return "no se pudo crear o reutilizar StudyArm RIGHT.";
    case "study-product-left":
      return "no se pudo crear StudyProduct para primera fragancia.";
    case "study-product-right":
      return "no se pudo crear StudyProduct para segunda fragancia.";
    case "rotation-plan":
      return "no se pudo crear RotationPlan.";
    case "rotation-plan-arms":
      return "no se pudieron guardar RotationPlanArm.";
    case "participant-rotation-assignment":
      return "no se pudo crear ParticipantRotationAssignment.";
    case "participant-arm-left":
      return "no se pudo crear ParticipantArmAssignment LEFT.";
    case "participant-arm-right":
      return "no se pudo crear ParticipantArmAssignment RIGHT.";
    case "rotation-locked-after-t0":
      return "no se puede actualizar la rotacion porque T0 ya fue iniciado.";
    default:
      return "no se pudo guardar la rotacion.";
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

function logNavigoParticipantImportApplyFailure({
  code,
  folio,
  message,
  rowNumber,
  step,
  studyId
}: {
  code?: string;
  folio: string;
  message: string;
  rowNumber: number;
  step: string;
  studyId: string;
}) {
  console.error(
    `navigo participant import apply failed: studyId=${studyId} row=${rowNumber} folio=${folio} step=${step} code=${code ?? "UNKNOWN"} message=${message}`
  );
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

function resolveParticipantVisualVerificationMode(
  participant: Pick<ParticipantRecord, "visualVerificationMode">
): NavigoVisualVerificationMode {
  return resolveNavigoVisualVerificationMode(participant.visualVerificationMode ?? process.env.NAVIGO_VISUAL_VERIFICATION_MODE);
}

function hasRegisteredSelfie(participant: Pick<ParticipantRecord, "participantEvidence">): boolean {
  return participant.participantEvidence.some((evidence) => evidence.type === "SELFIE_IDENTIFICATION");
}

function resolveSelfieCapturePurpose({
  activity,
  mode,
  participant
}: {
  activity: ActivityRecord;
  mode: NavigoVisualVerificationMode;
  participant: ParticipantRecord;
}): NavigoSelfieCapturePurpose | null {
  if (mode === "disabled") {
    return null;
  }

  if (!hasRegisteredSelfie(participant)) {
    return activity.activitySchedule.code === "T0_SALON" ? "reference_capture" : null;
  }

  return activity.activitySchedule.code === "T0_SALON" ? null : "activity_verification";
}

function resolveVisualVerificationStatus({
  activity,
  mode,
  participant,
  purpose
}: {
  activity: ActivityRecord;
  mode: NavigoVisualVerificationMode;
  participant: ParticipantRecord;
  purpose: NavigoSelfieCapturePurpose | null;
}): NavigoVisualVerificationStatus {
  if (mode === "disabled") {
    return "not_required";
  }

  if (purpose === "reference_capture") {
    return null;
  }

  if (activity.activitySchedule.code === "T0_SALON" && hasRegisteredSelfie(participant)) {
    return "matched";
  }

  const selfie = getActivitySelfie(activity);
  if (!selfie) {
    return null;
  }

  if (selfie.reviewStatus === "APPROVED") {
    return "matched";
  }

  if (selfie.reviewStatus === "REJECTED") {
    return "failed";
  }

  return "uncertain";
}

function selfieNotRequiredMessage({
  activity,
  participant
}: {
  activity: ActivityRecord;
  participant: ParticipantRecord;
}): string {
  if (resolveParticipantVisualVerificationMode(participant) === "disabled") {
    return "Este estudio no requiere selfie de identidad para esta evaluacion.";
  }

  if (!hasRegisteredSelfie(participant) && activity.activitySchedule.code !== "T0_SALON") {
    return "No encontramos una foto registrada para comparar. Contacta al supervisor antes de continuar.";
  }

  return "Esta evaluacion no requiere selfie nueva.";
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

function getReferenceScreeningAttemptId(participant: ParticipantRecord): string | null {
  return participant.participantConfirmation?.screeningAttempt?.id ?? null;
}

function buildReferenceSelfieStorageKey({
  metadata,
  participant
}: {
  metadata: EvidenceUploadMetadata & { extension: string };
  participant: ParticipantRecord;
}): string {
  const attemptId = getReferenceScreeningAttemptId(participant);

  if (!attemptId) {
    throw new Error("Missing screening attempt for Navigo reference selfie.");
  }

  return buildEvidenceStorageKey({
    attemptId,
    evidenceType: metadata.evidenceType,
    extension: metadata.extension,
    participantProfileId: participant.participantProfile.id,
    studyId: participant.study.id
  });
}

async function saveReferenceSelfieFromActivity({
  activity,
  metadata,
  participant,
  prisma
}: {
  activity: ActivityRecord;
  metadata: EvidenceUploadMetadata & {
    faceVerification?: NavigoFaceVerificationClientResult | null;
    privateStorageKey: string;
    storageBucket: string;
  };
  participant: ParticipantRecord;
  prisma: NavigoPrismaClient;
}): Promise<NavigoActionResult<{
  internalNote: string | null;
  reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
  selfieCount: number;
}>> {
  const attemptId = getReferenceScreeningAttemptId(participant);

  if (!attemptId) {
    return {
      message: "No encontramos el intento de filtro para guardar la selfie de referencia.",
      ok: false
    };
  }

  assertEvidenceStorageKeyBelongsToAttempt({
    attemptId,
    participantProfileId: participant.participantProfile.id,
    privateStorageKey: metadata.privateStorageKey,
    studyId: participant.study.id
  });

  await prisma.participantEvidence.create?.({
    data: {
      extension: extensionFromFilename(metadata.originalFilename),
      internalNote: "reference_created",
      mimeType: metadata.mimeType,
      originalFilename: metadata.originalFilename,
      privateStorageKey: metadata.privateStorageKey,
      rejectionReason: null,
      reviewStatus: "APPROVED",
      reviewedAt: new Date(),
      screeningAttemptId: attemptId,
      sizeBytes: metadata.sizeBytes,
      storageBucket: metadata.storageBucket,
      studyParticipantId: participant.id,
      type: "SELFIE_IDENTIFICATION"
    }
  });

  if (activity.activitySchedule.code === "T0_SALON") {
    const now = new Date();
    const questionnaireVersionId = await resolveNavigoMeasurementQuestionnaireVersionId({
      participant,
      prisma
    });

    if (questionnaireVersionId) {
      await saveNavigoMeasurementResponses({
        activityId: activity.id,
        answers: [
          {
            answerJson: { value: "YES" },
            questionId: NAVIGO_T0_IDENTITY_QUESTION_ID
          }
        ],
        prisma,
        questionnaireVersionId
      });
    }

    await prisma.participantActivity.update?.({
      data: {
        actualStartedAt: activity.actualStartedAt ?? now,
        lastSavedAt: now,
        status: "STARTED"
      },
      where: { id: activity.id }
    });
  }

  return {
    data: {
      internalNote: "reference_created",
      reviewStatus: "APPROVED",
      selfieCount: 1
    },
    ok: true
  };
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
