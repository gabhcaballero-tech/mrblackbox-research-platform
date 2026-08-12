import { createHash, randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { resolvePublicLinkOrigin } from "@/shared/utils/request-origin";
import {
  createOneuiWhatsAppRepository,
  publicOriginValidationAuditMetadata,
  sendHutParticipantLinkWhatsApp,
  sendNavigoHutLinksWhatsApp,
  sendNavigoEvaluationLinkWhatsApp,
  sendNavigoEvaluationReminderWhatsApp,
  type OneuiWhatsAppRepository
} from "@/modules/oneui-whatsapp";
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
  NAVIGO_LEGACY_ACTIVITY_CODES,
  NAVIGO_SUPPORTED_ACTIVITY_CODES,
  NAVIGO_T0_IDENTITY_QUESTION_ID,
  createNavigoMeasurementDefinition,
  createNavigoScheduleSeeds,
  isInitialNavigoEvaluation,
  isSupportedNavigoActivityCode,
  navigoComparativeNumericEquivalent,
  resolveNavigoTimeZone,
  resolveNavigoVisualVerificationMode,
  type NavigoActivityCode,
  type NavigoCurrentActivityCode,
  type NavigoScheduleSeed,
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
  resolveNavigoTimelineSequence,
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
import {
  createHutRegistrationToken,
  createHutParticipantToken
} from "@/modules/hut/service";
import {
  encryptHutPhaseCode,
  generateHutPhaseCode,
  hashHutPhaseCode,
  hutPhaseForSlot,
  resolveHutPhaseCodeSecret,
  type HutPhase
} from "@/modules/hut/phase-codes";
import type { NavigoHutRotationWorkbookRowInput, NavigoRotationWorkbookRowInput } from "./rotation-workbook";

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
  canChangeVisualVerificationMode: boolean;
  confirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
    screeningAttempt?: { evaluationJson: unknown; id: string } | null;
  } | null;
  ctl: {
    completed: boolean;
    completedAt: Date | null;
    interviewerName: string | null;
    sessionId: string | null;
    status: "CANCELLED" | "COMPLETED" | "IN_PROGRESS" | "PENDING" | null;
  };
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
  latestReminder: {
    sentAt: Date | null;
    source: string | null;
    status: string;
  } | null;
  reopenedAt: Date | null;
  reopenedBy: {
    name: string;
  } | null;
  reopenedByUserId: string | null;
  reopenReason: string | null;
  responseCount: number;
};

export type NavigoAdminDashboard = {
  participants: NavigoParticipantListItem[];
  rotationFolioReservations: NavigoRotationFolioReservation[];
  study: NavigoStudySummary;
  rotationConfig: NavigoStudyRotationConfiguration;
  timeZoneIana: string;
};

export type NavigoRotationFolioReservation = {
  folio: string;
  firstFragrance: string;
  secondFragrance: string;
  sourceFileName: string | null;
  importedAt: Date;
  status: "APPLIED_TO_PARTICIPANT" | "PENDING_PARTICIPANT";
  studyParticipantId: string | null;
  triangular1: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
  triangular2: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
};

export type NavigoStudyRotationConfiguration = {
  samples: Array<{
    displayLabel: string;
    id: string;
    internalName: string;
    sampleKey: string;
  }>;
  rotations: Array<{
    arms: Array<{
      applicationOrder: number;
      participantVisibleLabel: string;
      sampleKey: string;
    }>;
    name: string;
    rotationCode: string;
  }>;
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

export type NavigoEvaluationReminderProcessingResult = {
  failed: number;
  scanned: number;
  sent: number;
  skipped: number;
  results: Array<{
    activityCode: NavigoActivityCode;
    activityId: string;
    folio: string | null;
    message: string;
    participantId: string;
    status: "FAILED" | "SENT" | "SKIPPED";
    whatsappMessageId: string | null;
  }>;
};

export type NavigoEvaluationReminderManualSendResult = {
  activityCode: NavigoActivityCode;
  evaluationUrl: string;
  folio: string | null;
  generatedAt: Date;
  phone: string;
  whatsappError: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: "ERROR" | "ENVIADO";
};

export type NavigoEvaluationLinkWhatsAppSendResult = {
  evaluationUrl: string;
  folio: string | null;
  generatedAt: Date;
  phone: string;
  whatsappError: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: "ERROR" | "ENVIADO";
};

export type NavigoParticipantLinkSendType = "BOTH" | "HUT" | "NAVIGO";

export type NavigoParticipantLinksWhatsAppSendResult = {
  folio: string | null;
  generatedAt: Date;
  hutUrl: string | null;
  navigoUrl: string | null;
  phone: string;
  requestedLinkType: NavigoParticipantLinkSendType;
  sentLinkType: NavigoParticipantLinkSendType;
  warnings: string[];
  whatsappError: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: "ERROR" | "ENVIADO";
};

export type NavigoConfigureRotationInput = {
  actorUserId: string;
  leftFragranceCode: string;
  rightFragranceCode: string;
  studyParticipantId: string;
  triangularCode1?: string | null;
  triangularCode2?: string | null;
};

export type NavigoStudyRotationConfigInput = {
  actorUserId: string;
  firstInternalName: string;
  firstSampleKey: string;
  secondInternalName: string;
  secondSampleKey: string;
  studyId: string;
};

export type NavigoRotationImportPreviewRow = NavigoRotationImportRowInput & {
  errors: string[];
  existingRotation: boolean;
  existingStoredConfiguration: boolean;
  participantFound: boolean;
  pendingParticipant: boolean;
  rowNumber: number;
  t0Started: boolean;
  updatable: boolean;
};

export type NavigoRotationImportPreview = {
  rows: NavigoRotationImportPreviewRow[];
  summary: {
    duplicateFolios: number;
    existingStoredConfigurations: number;
    foundFolios: number;
    pendingParticipants: number;
    rowsWithError: number;
    t0Started: number;
    totalRows: number;
    updatable: number;
    validRows: number;
    missingFolios: number;
  };
};

export type NavigoRotationWorkbookPreviewRow = NavigoRotationImportPreviewRow & NavigoRotationWorkbookRowInput & {
  existingTriangularRotation: boolean;
  triangularComplete: boolean;
};

export type NavigoHutRotationWorkbookPreviewRow = NavigoHutRotationWorkbookRowInput & {
  errors: string[];
  existingHutParticipant: boolean;
  existingHutSlot: boolean;
  hasHutProgress: boolean;
  hutOrigin: "CLT_HUT" | "HUT_DIRECTO";
  linkedNavigoFolio: string | null;
  linkedStudyParticipantId: string | null;
  rowNumber: number;
  updatable: boolean;
};

export type NavigoRotationWorkbookPreview = {
  applyErrors?: Array<{
    folio: string;
    message: string;
    rowNumber: number;
    scope: "CLT" | "HUT";
    step: string;
  }>;
  hutRows: NavigoHutRotationWorkbookPreviewRow[];
  rows: NavigoRotationWorkbookPreviewRow[];
  summary: NavigoRotationImportPreview["summary"] & {
    existingTriangularRotations: number;
    hut: {
      existingParticipants: number;
      existingSlots: number;
      foundFolios: number;
      missingFolios: number;
      rowsWithError: number;
      totalRows: number;
      updatable: number;
      validRows: number;
      withProgress: number;
    };
    triangularComplete: number;
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
  primeraFragancia?: string | null;
  reclutador?: string | null;
  segundaFragancia?: string | null;
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
        applicationStartedAt: Date | null;
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
  clearParticipantRotation: (input: {
    actorUserId: string;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult>;
  applyStoredRotationForParticipant: (input: {
    actorUserId: string;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult>;
  configureStudyRotation: (input: NavigoStudyRotationConfigInput) => Promise<NavigoActionResult<NavigoStudyRotationConfiguration>>;
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
  previewRotationWorkbookImport: (input: {
    hutRows?: NavigoHutRotationWorkbookRowInput[];
    rows: NavigoRotationWorkbookRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationWorkbookPreview>>;
  registerDirectParticipant: (input: NavigoParticipantRegistrationInput) => Promise<NavigoActionResult<{
    linkToken: string | null;
    studyParticipantId: string;
  }>>;
  applyRotationImport: (input: {
    actorUserId: string;
    rows: NavigoRotationImportRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationImportPreview>>;
  applyRotationWorkbookImport: (input: {
    actorUserId: string;
    filename: string;
    hutRows?: NavigoHutRotationWorkbookRowInput[];
    rows: NavigoRotationWorkbookRowInput[];
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoRotationWorkbookPreview>>;
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
  releaseParticipantAfterCtl: (input: {
    actorUserId: string;
    now?: Date;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult>;
  registerInitialApplication: (input: {
    now?: Date;
    token: string;
  }) => Promise<NavigoActionResult<{
    applicationStartedAt: Date;
  }>>;
  recordApplicationStartedFromCtl: (input: {
    actorUserId: string;
    now?: Date;
    studyParticipantId: string;
  }) => Promise<NavigoMaintenanceResult & { applicationStartedAt?: Date }>;
  sendEvaluationLinkWhatsApp: (input: {
    actorUserId: string;
    now?: Date;
    requestOrigin: string;
    studyId: string;
    studyParticipantId: string;
  }) => Promise<NavigoActionResult<NavigoEvaluationLinkWhatsAppSendResult>>;
  sendParticipantLinksWhatsApp: (input: {
    actorUserId: string;
    linkType: NavigoParticipantLinkSendType;
    now?: Date;
    requestOrigin: string;
    studyId: string;
    studyParticipantId: string;
  }) => Promise<NavigoActionResult<NavigoParticipantLinksWhatsAppSendResult>>;
  processEvaluationWhatsAppReminders: (input: {
    now?: Date;
    requestOrigin: string;
    studyId?: string;
  }) => Promise<NavigoActionResult<NavigoEvaluationReminderProcessingResult>>;
  sendEvaluationReminderNow: (input: {
    actorUserId: string;
    now?: Date;
    participantActivityId: string;
    requestOrigin: string;
    studyId: string;
  }) => Promise<NavigoActionResult<NavigoEvaluationReminderManualSendResult>>;
  reopenActivityOutsideWindow: (input: {
    actorUserId: string;
    now?: Date;
    participantActivityId: string;
    reason: string;
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
  deleteParticipant: (input: {
    actorUserId: string;
    reason: string;
    studyId: string;
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
  delete?: (args: unknown) => Promise<unknown>;
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
  auditLog?: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantActivityEvidence: Delegate;
  participantArmAssignment: Delegate;
  participantAttributeOrder?: Delegate;
  participantConsent?: Delegate;
  participantConfirmation: Delegate;
  ctlSession?: Delegate;
  ctlTriangularRotationAssignment: Delegate;
  hutBlock?: Delegate;
  hutCallEvaluation?: Delegate;
  hutParticipant?: Delegate;
  hutParticipantPhaseCode?: Delegate;
  hutRegistrationSlot?: Delegate;
  participantEvidence: Delegate;
  participantProfile: Delegate;
  participantReferenceCode: Delegate;
  participantRotationAssignment: Delegate;
  participantScreeningReview?: Delegate;
  quotaEvaluation?: Delegate;
  questionnaireVersion: Delegate;
  reminderLog?: Delegate;
  researchResponse: Delegate;
  rotationPlan: Delegate;
  rotationPlanArm: Delegate;
  mediaEvidencePlaceholder?: Delegate;
  navigoRotationFolioConfiguration?: Delegate;
  screeningAnswer?: Delegate;
  screeningAttempt: Delegate;
  studyArm: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
  studyProduct: Delegate;
};

type NavigoTransactionClient = Omit<NavigoPrismaClient, "$connect" | "$disconnect" | "$transaction"> & {
  applicationTimeEvent: Delegate;
};

const NAVIGO_ROTATION_WORKBOOK_IMPORT_BATCH_SIZE = 25;
const NAVIGO_EVALUATION_REMINDER_TYPE = "NAVIGO_WHATSAPP_EVALUATION_REMINDER";
const NAVIGO_EVALUATION_REMINDER_SOURCE_CRON = "CRON";
const NAVIGO_EVALUATION_REMINDER_SOURCE_MANUAL_ADMIN = "MANUAL_ADMIN";

type DueNavigoReminderActivity = {
  activitySchedule: {
    code: string;
    id: string;
  };
  availableFrom: Date;
  id: string;
  reminders: Array<{
    id: string;
    metadataJson: unknown;
    status: string;
  }>;
  status: string;
  studyParticipant: {
    accessTokens: Array<{
      expiresAt: Date;
      id: string;
      status: string;
      tokenHash: string;
    }>;
    activities: Array<{
      activitySchedule: {
        code: string;
      };
      availableFrom: Date;
      id: string;
      status: string;
    }>;
    id: string;
    participantConfirmation: {
      folio: string;
    } | null;
    participantProfile: {
      name: string;
      phone: string | null;
    };
    qaParticipantRun: {
      id: string;
      status: string;
    } | null;
    study: NavigoStudySummary;
    studyId: string;
  };
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
  reopenedAt: true,
  reopenedBy: {
    select: {
      name: true
    }
  },
  reopenedByUserId: true,
  reopenReason: true,
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
  reminders: {
    select: {
      id: true,
      metadataJson: true,
      scheduledFor: true,
      sentAt: true,
      status: true
    },
    where: {
      channel: "INTERNAL_FOLLOWUP"
    }
  },
  scheduledAt: true,
  status: true
} as const;

const hutParticipantWorkbookSelect = {
  blocks: {
    select: {
      status: true,
      submittedVideosCount: true
    }
  },
  callEvaluations: {
    select: {
      completedAt: true,
      status: true
    }
  },
  dailyChecks: {
    select: { id: true }
  },
  email: true,
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  name: true,
  phone: true,
  phaseCodes: {
    select: {
      id: true,
      phase: true,
      slot: true,
      status: true
    }
  },
  secondFragranceRightArm: true,
  status: true,
  studyId: true,
  studyParticipantId: true,
  token: true,
  videoSubmissions: {
    select: { id: true }
  }
} as const;

const hutRegistrationSlotWorkbookSelect = {
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  participantId: true,
  registeredAt: true,
  secondFragranceRightArm: true,
  status: true,
  studyId: true
} as const;

const participantSelect = {
  applicationStartedAt: true,
  ctlSessions: {
    orderBy: { createdAt: "desc" },
    select: {
      completedAt: true,
      ctlInterviewerCode: { select: { label: true } },
      id: true,
      interviewer: { select: { name: true } },
      status: true
    },
    take: 5
  },
  id: true,
  hutParticipant: {
    select: {
      folio: true,
      id: true,
      token: true
    }
  },
  ctlTriangularRotationAssignment: {
    select: {
      id: true,
      triangular1Pr1: true,
      triangular1Pr2: true,
      triangular1Pr3: true,
      triangular1Verify: true,
      triangular2Pr1: true,
      triangular2Pr2: true,
      triangular2Pr3: true,
      triangular2Verify: true
    }
  },
  visualVerificationMode: true,
  participantConfirmation: {
    select: {
      id: true,
      folio: true,
      screeningAttempt: {
        select: {
          answers: {
            select: {
              answerJson: true,
              questionId: true
            }
          },
          id: true,
          evaluationJson: true,
          source: true
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
      participantAuthUserId: true,
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
          in: NAVIGO_SUPPORTED_ACTIVITY_CODES
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
    screeningAttempt?: {
      answers?: Array<{ answerJson: unknown; questionId: string }>;
      evaluationJson: unknown;
      id: string;
    } | null;
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
  ctlSessions?: Array<{
    completedAt: Date | null;
    ctlInterviewerCode: { label: string } | null;
    id: string;
    interviewer: { name: string } | null;
    status: "CANCELLED" | "COMPLETED" | "IN_PROGRESS" | "PENDING";
  }>;
  id: string;
  hutParticipant?: {
    folio: string | null;
    id: string;
    token: string;
  } | null;
  ctlTriangularRotationAssignment: {
    id: string;
    triangular1Pr1: string;
    triangular1Pr2: string;
    triangular1Pr3: string;
    triangular1Verify: string;
    triangular2Pr1: string;
    triangular2Pr2: string;
    triangular2Pr3: string;
    triangular2Verify: string;
  } | null;
  participantConfirmation: {
    id: string;
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
    screeningAttempt?: {
      answers?: Array<{ answerJson: unknown; questionId: string }>;
      evaluationJson: unknown;
      id: string;
      source?: string;
    } | null;
  } | null;
  participantEvidence: Array<{
    id: string;
    privateStorageKey: string;
    storageBucket: string;
    type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  }>;
  participantProfile: {
    email: string | null;
    id: string;
    name: string;
    participantAuthUserId?: string | null;
    phone: string | null;
  };
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
  reminders?: Array<{
    id: string;
    metadataJson: unknown;
    scheduledFor: Date | null;
    sentAt: Date | null;
    status: string;
  }>;
  reopenedAt?: Date | null;
  reopenedBy?: { name: string } | null;
  reopenedByUserId?: string | null;
  reopenReason?: string | null;
  responses: Array<{ answerJson: unknown; questionId: string }>;
};
type ConfirmationWithParticipant = {
  folio: string;
  studyParticipant: ParticipantRecord;
};
type NavigoRotationFolioConfigurationRecord = NavigoRotationWorkbookRowInput & {
  id: string;
  importedByUserId: string | null;
  sourceFileName: string | null;
  studyId: string;
};
type HutParticipantWorkbookRecord = {
  blocks?: Array<{ status: string; submittedVideosCount: number }>;
  callEvaluations?: Array<{ completedAt: Date | null; status: string }>;
  dailyChecks?: Array<{ id?: string }>;
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  phone: string | null;
  phaseCodes?: Array<{
    id: string;
    phase: HutPhase;
    slot: number;
    status: string;
  }>;
  secondFragranceRightArm: string | null;
  status: string;
  studyId: string;
  studyParticipantId: string | null;
  token: string;
  videoSubmissions?: Array<{ id?: string }>;
};
type HutRegistrationSlotWorkbookRecord = {
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  participantId: string | null;
  registeredAt: Date | null;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  studyId: string;
};

export function createNavigoAppRepository(
  prismaClient?: NavigoPrismaClient,
  whatsappRepository?: OneuiWhatsAppRepository
): NavigoAppRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as NavigoPrismaClient);
  }

  function getWhatsAppRepository() {
    return whatsappRepository ?? createOneuiWhatsAppRepository();
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

      const codesToDelete = mode === "reset-app"
        ? [...NAVIGO_SUPPORTED_ACTIVITY_CODES]
        : navigoCodesFrom(fromCode);
      const activitiesToDelete = (participant.activities ?? []).filter((activity) =>
        isSupportedNavigoActivityCode(activity.activitySchedule.code) && codesToDelete.includes(activity.activitySchedule.code)
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

      if (isInitialNavigoEvaluation(fromCode)) {
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

  async function deleteParticipantFromNavigo({
    actorUserId,
    reason,
    studyId,
    studyParticipantId
  }: {
    actorUserId: string;
    reason: string;
    studyId: string;
    studyParticipantId: string;
  }): Promise<NavigoMaintenanceResult> {
    void actorUserId;
    void reason;
    const prisma = await getPrisma();

    try {
      return await prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante.", ok: false };
        }

        if (participant.study.id !== studyId) {
          return { message: "No se puede eliminar porque el participante pertenece a otro estudio.", ok: false };
        }

        if (participant.study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite eliminar participantes desde App Navigo.", ok: false };
        }

        const confirmation = participant.participantConfirmation;
        const attemptId = confirmation?.screeningAttempt?.id ?? null;
        const directNavigoAttempt = isNavigoDirectScreeningAttempt(confirmation?.screeningAttempt ?? null);

        if (!confirmation || !attemptId || !directNavigoAttempt) {
          return {
            message: "No se puede eliminar porque existen relaciones fuera de App Navigo: screening_attempt real del filtro.",
            ok: false
          };
        }

        const unsupportedRelations = await findUnsupportedNavigoParticipantDeleteRelations(tx, {
          screeningAttemptId: attemptId,
          studyParticipantId: participant.id
        });

        if (unsupportedRelations.length > 0) {
          return {
            message: `No se puede eliminar porque existen relaciones fuera de App Navigo: ${unsupportedRelations.join(", ")}.`,
            ok: false
          };
        }

        await deleteNavigoAppOwnedRelations(tx, participant.id);
        await deleteDirectNavigoScreeningRelations(tx, {
          confirmationId: confirmation.id,
          screeningAttemptId: attemptId,
          studyParticipantId: participant.id
        });

        await tx.studyParticipant.deleteMany?.({
          where: { id: participant.id }
        });

        const profilePreserved = await deleteParticipantProfileIfOrphan(tx, participant.participantProfile);

        return {
          message: profilePreserved
            ? "Participante eliminado y folio liberado. El perfil global se conservó por seguridad."
            : "Participante eliminado y folio liberado.",
          ok: true
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible eliminar el participante.";

      return {
        message: `No se pudo eliminar el participante Navigo: ${message}`,
        ok: false
      };
    }
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
      let logStudyId = "unknown";

      try {
        return await prisma.$transaction(async (tx) => {
          const participant = (await tx.studyParticipant.findUnique?.({
            select: participantWithActivitiesSelect,
            where: { id: input.studyParticipantId }
          })) as ParticipantRecord | null;

          if (!participant) {
            return { message: "No encontramos el participante.", ok: false };
          }

          logStudyId = participant.study.id;

          if (participant.study.code !== NAVIGO_STUDY_CODE) {
            return { message: "Solo el estudio Navigo permite configurar rotacion de App Navigo.", ok: false };
          }

          if (!participant.participantConfirmation || participantStatus(participant) !== "APPROVED") {
            return { message: "Solo participantes confirmados con folio pueden recibir rotacion.", ok: false };
          }

          if (hasT0Started(participant)) {
            return { message: "No se puede modificar rotacion porque T0 ya fue iniciado.", ok: false };
          }

          const { rotationCode } = await upsertParticipantRotationForCodes({
            actorUserId: input.actorUserId,
            leftFragranceCode,
            participant,
            prisma: tx,
            rightFragranceCode
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
      } catch (error) {
        const failure = toNavigoRotationApplyFailure(error);
        logNavigoRotationApplyFailure({
          error,
          folio: failure.folio,
          message: failure.logMessage,
          step: failure.step,
          studyId: logStudyId
        });
        return {
          message: failure.message,
          ok: false
        };
      }
    },

    async applyStoredRotationForParticipant(input) {
      const prisma = await getPrisma();
      let logStudyId = "unknown";

      try {
        return await prisma.$transaction(async (tx) => {
          const participant = (await tx.studyParticipant.findUnique?.({
            select: participantWithActivitiesSelect,
            where: { id: input.studyParticipantId }
          })) as ParticipantRecord | null;

          if (!participant) {
            return { message: "No encontramos el participante.", ok: false };
          }

          logStudyId = participant.study.id;

          const applied = await applyStoredNavigoRotationForParticipantInTransaction({
            actorUserId: input.actorUserId,
            participant,
            prisma: tx
          });

          return {
            message: applied
              ? "Rotacion oficial importada aplicada al participante."
              : "No hay rotacion oficial importada pendiente para este folio.",
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
          studyId: logStudyId
        });
        return {
          message: failure.message,
          ok: false
        };
      }
    },

    async clearParticipantRotation(input) {
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
          return { message: "Solo el estudio Navigo permite limpiar rotacion.", ok: false };
        }

        if (hasT0Started(participant)) {
          return { message: "No se puede limpiar rotacion porque T0 ya fue iniciado.", ok: false };
        }

        await tx.participantArmAssignment.deleteMany?.({
          where: { studyParticipantId: participant.id }
        });
        await tx.participantRotationAssignment.deleteMany?.({
          where: { studyParticipantId: participant.id }
        });

        return {
          message: "Rotacion provisional limpiada. Folio y codigos se conservaron.",
          ok: true
        };
      });
    },

    async configureStudyRotation(input) {
      const firstSampleKey = normalizeNavigoRotationCode(input.firstSampleKey);
      const secondSampleKey = normalizeNavigoRotationCode(input.secondSampleKey);
      const firstInternalName = normalizeNavigoParticipantName(input.firstInternalName);
      const secondInternalName = normalizeNavigoParticipantName(input.secondInternalName);

      if (!firstInternalName || !secondInternalName || !firstSampleKey || !secondSampleKey) {
        return { message: "Captura nombre interno y clave real para ambas fragancias.", ok: false };
      }

      if (firstSampleKey === secondSampleKey) {
        return { message: "Las claves reales de muestra deben ser distintas.", ok: false };
      }

      const prisma = await getPrisma();

      try {
        return await prisma.$transaction(async (tx) => {
          const study = (await tx.study.findUnique?.({
            select: studySelect,
            where: { id: input.studyId }
          })) as StudyRecord | null;

          if (!study || study.code !== NAVIGO_STUDY_CODE) {
            return { message: "Solo el estudio Navigo permite configurar muestras reales.", ok: false };
          }

          const leftArm = await resolveNavigoStudyArm({
            code: "LEFT",
            folio: "STUDY_CONFIG",
            label: "Brazo izquierdo",
            preferredSortOrder: 1,
            prisma: tx,
            studyId: study.id,
            userMessage: "No se pudo preparar el brazo izquierdo."
          });
          const rightArm = await resolveNavigoStudyArm({
            code: "RIGHT",
            folio: "STUDY_CONFIG",
            label: "Brazo derecho",
            preferredSortOrder: 2,
            prisma: tx,
            studyId: study.id,
            userMessage: "No se pudo preparar el brazo derecho."
          });
          const firstProduct = await upsertNavigoStudyProduct({
            displayLabel: firstInternalName,
            folio: "STUDY_CONFIG",
            internalName: firstInternalName,
            prisma: tx,
            sampleKey: firstSampleKey,
            studyId: study.id
          });
          const secondProduct = await upsertNavigoStudyProduct({
            displayLabel: secondInternalName,
            folio: "STUDY_CONFIG",
            internalName: secondInternalName,
            prisma: tx,
            sampleKey: secondSampleKey,
            studyId: study.id
          });

          await upsertNavigoStudyRotationPlan({
            firstProductId: firstProduct.id,
            folio: "STUDY_CONFIG",
            leftArmId: leftArm.id,
            name: "Rotacion 1",
            prisma: tx,
            rightArmId: rightArm.id,
            rotationCode: "ROTACION_1",
            secondProductId: secondProduct.id,
            studyId: study.id
          });
          await upsertNavigoStudyRotationPlan({
            firstProductId: secondProduct.id,
            folio: "STUDY_CONFIG",
            leftArmId: leftArm.id,
            name: "Rotacion 2",
            prisma: tx,
            rightArmId: rightArm.id,
            rotationCode: "ROTACION_2",
            secondProductId: firstProduct.id,
            studyId: study.id
          });

          return {
            data: await loadNavigoStudyRotationConfiguration(tx, study.id),
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
        return {
          message: failure.message,
          ok: false
        };
      }
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
        return { message: "Solo el estudio Navigo permite configurar identificación visual.", ok: false };
      }

      if (participant.applicationStartedAt || hasT0Started(participant)) {
        return { message: "La identificación visual solo puede cambiarse antes de iniciar T0.", ok: false };
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
            ? "Identificación visual marcada como no requerida para este participante."
            : "Identificación visual marcada como requerida para este participante.",
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
          qaParticipantRun: { is: null },
          studyId
        }
      })) as ParticipantRecord[];

      const storage = createSupabaseEvidenceStorageClient();

      return {
        participants: await Promise.all(participants.map((participant) => toDashboardParticipant(participant, now, storage))),
        rotationFolioReservations: await loadNavigoRotationFolioReservations(prisma, studyId),
        rotationConfig: await loadNavigoStudyRotationConfiguration(prisma, studyId),
        study,
        timeZoneIana: resolveNavigoTimeZone(study.timeZoneIana)
      };
    },

    async resetParticipantApp(input) {
      return resetOrDeleteNavigoStages({
        actorUserId: input.actorUserId,
        fromCode: NAVIGO_ACTIVITY_CODES[0],
        mode: "reset-app",
        reason: input.reason,
        studyParticipantId: input.studyParticipantId
      });
    },

    async deleteParticipant(input) {
      return deleteParticipantFromNavigo(input);
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

    async previewRotationWorkbookImport(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as StudyRecord | null;

      if (!study || study.code !== NAVIGO_STUDY_CODE) {
        return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
      }

      const preview = await buildRotationWorkbookImportPreview({
        hutRows: input.hutRows ?? [],
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

    async applyRotationWorkbookImport(input) {
      const prisma = await getPrisma();

      try {
        const study = (await prisma.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as StudyRecord | null;

        if (!study || study.code !== NAVIGO_STUDY_CODE) {
          return { message: "Solo el estudio Navigo permite importar rotacion.", ok: false };
        }

        const preview = await buildRotationWorkbookImportPreview({
          hutRows: input.hutRows ?? [],
          prisma,
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

        const applyErrors: NonNullable<NavigoRotationWorkbookPreview["applyErrors"]> = [];

        await applyRotationWorkbookRowsInBatches({
          actorUserId: input.actorUserId,
          filename: input.filename,
          onError: (error) => applyErrors.push(error),
          prisma,
          rows: preview.rows,
          studyId: input.studyId
        });

        await applyHutRotationWorkbookRowsInBatches({
          onError: (error) => applyErrors.push(error),
          prisma,
          rows: preview.hutRows,
          studyId: input.studyId
        });

        const appliedPreview = await buildRotationWorkbookImportPreview({
          hutRows: input.hutRows ?? [],
          prisma,
          rows: input.rows,
          studyId: input.studyId
        });
        const data = {
          ...appliedPreview,
          applyErrors
        };

        if (applyErrors.length > 0) {
          return {
            data,
            message: "La previsualizacion era valida, pero algunas filas no pudieron aplicarse. Revisa los folios reportados.",
            ok: false
          };
        }

        return {
          data,
          ok: true
        };
      } catch (error) {
        const failure = toNavigoRotationApplyFailure(error);
        logNavigoRotationApplyFailure({
          error,
          folio: failure.folio,
          message: failure.logMessage,
          step: failure.step,
          studyId: input.studyId
        });

        let preview: NavigoRotationWorkbookPreview | undefined;
        try {
          preview = await buildRotationWorkbookImportPreview({
            hutRows: input.hutRows ?? [],
            prisma,
            rows: input.rows,
            studyId: input.studyId
          });
        } catch (previewError) {
          logNavigoRotationApplyFailure({
            error: previewError,
            folio: failure.folio,
            message: sanitizeRotationImportLogMessage(previewError),
            step: "preview-workbook-after-failure",
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
              ? "Correccion operativa de aplicacion inicial desde App Navigo."
              : "Registro de aplicacion inicial desde App Navigo.",
            studyParticipantId: participant.id,
            timeZoneIana
          }
        });

        for (const activity of prepared.created) {
          await tx.participantActivity.create?.({
            data: {
              activityScheduleId: activity.activityScheduleId,
              actualCompletedAt: null,
              actualStartedAt: null,
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              lastSavedAt: null,
              occurrenceKey: activity.occurrenceKey,
              scheduledAt: activity.scheduledAt,
              status: activity.status,
              studyParticipantId: activity.studyParticipantId
            }
          });
        }

        for (const activity of prepared.updated) {
          await tx.participantActivity.update?.({
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

        const linkToken = await ensureParticipantAccessToken({
          actorUserId: input.actorUserId,
          now,
          participant,
          prisma: tx
        });

        return {
          linkToken,
          message: "Aplicacion inicial registrada correctamente. Las evaluaciones se calcularon desde ese momento.",
          ok: true
        };
      });
    },

    async getParticipantActivitiesView(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      let participant = await getParticipantByToken(input.token, prisma, now);

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

      participant = await ensureCurrentNavigoActivitiesForParticipant({
        now,
        participant,
        prisma
      });

      const timeline = buildNavigoActivityTimeline({
        activities: (participant.activities ?? []).map(toNavigoActivityRecord),
        now,
        testMode: Boolean(input.testMode)
      });

      return {
        data: {
          blindLabels: resolveBlindLabels(participant),
          applicationStartedAt: participant.applicationStartedAt,
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
      let participant = await getParticipantByToken(input.token, prisma, now);

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

      participant = await ensureCurrentNavigoActivitiesForParticipant({
        now,
        participant,
        prisma
      });

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
        !isInitialNavigoEvaluation(activity.activitySchedule.code)
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

    async registerInitialApplication(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        let participant = await getParticipantByToken(input.token, tx, now);

        if (!participant) {
          return { message: "Este enlace no es valido o ha expirado.", ok: false };
        }

        const safe = validateParticipantForToken(participant);
        if (!safe.ok) {
          return safe;
        }

        const existingApplicationStartedAt = participant.applicationStartedAt;
        if (existingApplicationStartedAt) {
          participant = await ensureCurrentNavigoActivitiesForParticipant({
            now,
            participant,
            prisma: tx
          });

          return {
            data: {
              applicationStartedAt: existingApplicationStartedAt
            },
            ok: true
          };
        }

        await ensureCurrentNavigoSchedulesForParticipant({ participant, prisma: tx });
        const schedules = await getNavigoSchedules({ participant, prisma: tx });
        const prepared = prepareNavigoParticipantActivities({
          existingActivities: (participant.activities ?? []).map(toNavigoActivityRecord),
          now,
          participant: {
            applicationStartedAt: now,
            id: participant.id,
            reviewStatus: participantStatus(participant),
            studyCode: participant.study.code,
            timeZoneIana: participant.study.timeZoneIana
          },
          schedules
        });

        if (!prepared.ok) {
          return { message: prepared.message, ok: false };
        }

        await tx.studyParticipant.update?.({
          data: {
            applicationStartedAt: now,
            applicationStartedAtRegisteredAt: now,
            operationalStatus: "IN_PROGRESS"
          },
          where: { id: participant.id }
        });

        for (const activity of prepared.created) {
          await tx.participantActivity.create?.({
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
          await tx.participantActivity.update?.({
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

        return {
          data: {
            applicationStartedAt: now
          },
          ok: true
        };
      });
    },

    async recordApplicationStartedFromCtl(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant) {
          return { message: "No encontramos el participante para registrar T0 desde CTL.", ok: false };
        }

        if (participant.applicationStartedAt) {
          await ensureCurrentNavigoActivitiesForParticipant({
            now,
            participant,
            prisma: tx
          });
          return {
            applicationStartedAt: participant.applicationStartedAt,
            message: "La aplicacion inicial ya estaba registrada.",
            ok: true
          };
        }

        await ensureCurrentNavigoSchedulesForParticipant({ participant, prisma: tx });
        const schedules = await getNavigoSchedules({ participant, prisma: tx });
        const prepared = prepareNavigoParticipantActivities({
          existingActivities: (participant.activities ?? []).map(toNavigoActivityRecord),
          now,
          participant: {
            applicationStartedAt: now,
            id: participant.id,
            reviewStatus: participantStatus(participant),
            studyCode: participant.study.code,
            timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
          },
          schedules
        });

        if (!prepared.ok) {
          return { message: prepared.message, ok: false };
        }

        const timeZoneIana = resolveNavigoTimeZone(participant.study.timeZoneIana);
        await tx.studyParticipant.update?.({
          data: {
            applicationStartedAt: now,
            applicationStartedAtRegisteredAt: now,
            applicationStartedAtRegisteredByUserId: input.actorUserId,
            operationalStatus: "IN_PROGRESS"
          },
          where: { id: participant.id }
        });

        await tx.applicationTimeEvent.create?.({
          data: {
            activityStateAtEvent: activityStateAtEvent((participant.activities ?? []).map(toNavigoActivityRecord)),
            createdByUserId: input.actorUserId,
            eventType: "REGISTERED",
            newApplicationStartedAt: now,
            previousApplicationStartedAt: null,
            reason: "Registro automatico de aplicacion inicial al entrar a comparativa 15 minutos en CTL.",
            studyParticipantId: participant.id,
            timeZoneIana
          }
        });

        for (const activity of prepared.created) {
          await tx.participantActivity.create?.({
            data: {
              activityScheduleId: activity.activityScheduleId,
              actualCompletedAt: null,
              actualStartedAt: null,
              availableFrom: activity.availableFrom,
              availableUntil: activity.availableUntil,
              lastSavedAt: null,
              occurrenceKey: activity.occurrenceKey,
              scheduledAt: activity.scheduledAt,
              status: activity.status,
              studyParticipantId: activity.studyParticipantId
            }
          });
        }

        for (const activity of prepared.updated) {
          await tx.participantActivity.update?.({
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

        return {
          applicationStartedAt: now,
          message: "Aplicacion inicial registrada automaticamente desde CTL.",
          ok: true
        };
      });
    },

    async sendEvaluationLinkWhatsApp(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const publicRequestOrigin = resolvePublicLinkOrigin(input.requestOrigin);

      const prepared: NavigoActionResult<{
        evaluationUrl: string;
        folio: string;
        participantId: string;
        participantName: string;
        phone: string;
        studyId: string;
      }> = await prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant || participant.study.id !== input.studyId) {
          return { message: "No encontramos el participante en este estudio.", ok: false as const };
        }

        if (!participant.participantProfile.phone) {
          return { message: "El participante no tiene telefono capturado.", ok: false as const };
        }

        const folio = participant.participantConfirmation?.folio ?? null;

        if (!folio) {
          return { message: "El participante no tiene folio capturado.", ok: false as const };
        }

        const linkToken = await ensureParticipantAccessToken({
          actorUserId: input.actorUserId,
          now,
          participant,
          prisma: tx
        });
        const evaluationUrl = new URL(`/p/${encodeURIComponent(linkToken)}/activities`, publicRequestOrigin).toString();

        return {
          data: {
            evaluationUrl,
            folio,
            participantId: participant.id,
            participantName: participant.participantProfile.name,
            phone: participant.participantProfile.phone,
            studyId: participant.study.id
          },
          ok: true as const
        };
      });

      if (!prepared.ok) {
        return { message: prepared.message, ok: false };
      }

      const result = await sendNavigoEvaluationLinkWhatsApp({
        evaluationUrl: prepared.data.evaluationUrl,
        folio: prepared.data.folio,
        now,
        participantId: prepared.data.participantId,
        participantName: prepared.data.participantName,
        phone: prepared.data.phone,
        repository: getWhatsAppRepository(),
        studyId: prepared.data.studyId
      });

      const data: NavigoEvaluationLinkWhatsAppSendResult = {
        evaluationUrl: prepared.data.evaluationUrl,
        folio: prepared.data.folio,
        generatedAt: now,
        phone: prepared.data.phone,
        whatsappError: result.ok ? null : result.message,
        whatsappMessageId: result.ok ? result.data.metaMessageId : "data" in result ? result.data?.metaMessageId ?? null : null,
        whatsappStatus: result.ok ? "ENVIADO" : "ERROR"
      };

      return {
        data,
        ok: true
      };
    },

    async sendParticipantLinksWhatsApp(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const publicRequestOrigin = resolvePublicLinkOrigin(input.requestOrigin);

      const prepared: NavigoActionResult<{
        folio: string;
        hutParticipantId: string | null;
        hutUrl: string | null;
        navigoUrl: string | null;
        participantId: string;
        participantName: string;
        phone: string;
        sentLinkType: NavigoParticipantLinkSendType;
        studyId: string;
        warnings: string[];
      }> = await prisma.$transaction(async (tx) => {
        const participant = (await tx.studyParticipant.findUnique?.({
          select: participantWithActivitiesSelect,
          where: { id: input.studyParticipantId }
        })) as ParticipantRecord | null;

        if (!participant || participant.study.id !== input.studyId) {
          return { message: "No encontramos el participante en este estudio.", ok: false as const };
        }

        if (!participant.participantProfile.phone) {
          return { message: "El participante no tiene telefono capturado.", ok: false as const };
        }

        const folio = participant.participantConfirmation?.folio ?? null;

        if (!folio) {
          return { message: "El participante no tiene folio capturado.", ok: false as const };
        }

        const wantsNavigo = input.linkType === "NAVIGO" || input.linkType === "BOTH";
        const wantsHut = input.linkType === "HUT" || input.linkType === "BOTH";
        let navigoUrl: string | null = null;
        let hutUrl: string | null = null;
        const warnings: string[] = [];

        if (wantsNavigo) {
          const linkToken = await ensureParticipantAccessToken({
            actorUserId: input.actorUserId,
            now,
            participant,
            prisma: tx
          });
          navigoUrl = new URL(`/p/${encodeURIComponent(linkToken)}/activities`, publicRequestOrigin).toString();
        } else {
          const activeToken = participant.accessTokens?.[0] ?? null;
          if (activeToken && activeToken.tokenHash === hashToken(activeToken.id) && activeToken.expiresAt.getTime() > now.getTime()) {
            navigoUrl = new URL(`/p/${encodeURIComponent(activeToken.id)}/activities`, publicRequestOrigin).toString();
          }
        }

        if (wantsHut || input.linkType === "BOTH") {
          if (participant.hutParticipant?.token) {
            hutUrl = new URL(`/hut/p/${encodeURIComponent(participant.hutParticipant.token)}`, publicRequestOrigin).toString();
          } else {
            warnings.push("El participante no tiene enlace HUT activo.");
          }
        } else if (participant.hutParticipant?.token) {
          hutUrl = new URL(`/hut/p/${encodeURIComponent(participant.hutParticipant.token)}`, publicRequestOrigin).toString();
        }

        const sentLinkType = resolveAvailableLinkType({ hutUrl, navigoUrl, requested: input.linkType });

        if (!sentLinkType) {
          return {
            message: input.linkType === "HUT"
              ? "El participante no tiene enlace HUT activo."
              : "El participante no tiene enlaces disponibles para enviar.",
            ok: false as const
          };
        }

        if (input.linkType === "BOTH" && sentLinkType !== "BOTH") {
          warnings.push(
            sentLinkType === "NAVIGO"
              ? "Se enviara solo Navigo porque falta enlace HUT."
              : "Se enviara solo HUT porque falta enlace Navigo."
          );
        }

        return {
          data: {
            folio,
            hutParticipantId: participant.hutParticipant?.id ?? null,
            hutUrl,
            navigoUrl,
            participantId: participant.id,
            participantName: participant.participantProfile.name,
            phone: participant.participantProfile.phone,
            sentLinkType,
            studyId: participant.study.id,
            warnings
          },
          ok: true as const
        };
      });

      if (!prepared.ok) {
        return { message: prepared.message, ok: false };
      }

      const repository = getWhatsAppRepository();
      const result = await sendParticipantLinksByType({
        folio: prepared.data.folio,
        hutUrl: prepared.data.hutUrl,
        navigoUrl: prepared.data.navigoUrl,
        now,
        participantId: prepared.data.sentLinkType === "HUT"
          ? prepared.data.hutParticipantId ?? prepared.data.participantId
          : prepared.data.participantId,
        participantName: prepared.data.participantName,
        phone: prepared.data.phone,
        repository,
        sentLinkType: prepared.data.sentLinkType,
        studyId: prepared.data.studyId
      });
      const whatsAppMessage = result.ok ? result.data : "data" in result ? result.data : undefined;
      const publicOriginAudit = publicOriginValidationAuditMetadata(prepared.data.hutUrl);

      await prisma.auditLog?.create?.({
        data: {
          action: "PARTICIPANT_MODIFIED",
          actorUserId: input.actorUserId,
          afterJson: {
            deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            deploymentUrl: process.env.VERCEL_URL ?? null,
            folio: prepared.data.folio,
            generatedHutUrl: prepared.data.hutUrl,
            generatedNavigoUrl: prepared.data.navigoUrl,
            hutParticipantId: prepared.data.hutParticipantId,
            hutUrlAvailable: Boolean(prepared.data.hutUrl),
            hutUrlDomain: prepared.data.hutUrl ? new URL(prepared.data.hutUrl).origin : null,
            linkTypeSent: prepared.data.sentLinkType,
            linkTypeRequested: input.linkType,
            message: result.ok ? "Enlace enviado por WhatsApp." : result.message,
            metaMessageId: whatsAppMessage?.metaMessageId ?? null,
            navigoUrlAvailable: Boolean(prepared.data.navigoUrl),
            origin: "MANUAL",
            participantId: prepared.data.participantId,
            publicOriginDetected: publicOriginAudit.publicOriginDetected,
            publicOriginExpected: publicOriginAudit.publicOriginExpected,
            publicOriginFailureCode: result.ok ? null : publicOriginAudit.publicOriginFailureCode,
            publicOriginFailureMessage: result.ok ? null : publicOriginAudit.publicOriginFailureMessage,
            sentAtMexicoCity: formatDateTimeMexicoCity(now),
            templateName: templateNameForParticipantLinks(prepared.data.sentLinkType),
            warnings: prepared.data.warnings,
            whatsappStatus: result.ok ? "ENVIADO" : "ERROR"
          },
          beforeJson: null,
          entityId: prepared.data.participantId,
          entityType: "StudyParticipant",
          reason: `Envio manual de enlace ${input.linkType}`
        }
      });

      const data: NavigoParticipantLinksWhatsAppSendResult = {
        folio: prepared.data.folio,
        generatedAt: now,
        hutUrl: prepared.data.hutUrl,
        navigoUrl: prepared.data.navigoUrl,
        phone: prepared.data.phone,
        requestedLinkType: input.linkType,
        sentLinkType: prepared.data.sentLinkType,
        warnings: prepared.data.warnings,
        whatsappError: result.ok ? null : result.message,
        whatsappMessageId: whatsAppMessage?.metaMessageId ?? null,
        whatsappStatus: result.ok ? "ENVIADO" : "ERROR"
      };

      return {
        data,
        ok: true
      };
    },

    async processEvaluationWhatsAppReminders(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const reminderLog = prisma.reminderLog;

      if (!reminderLog) {
        return { message: "La auditoria de recordatorios no esta disponible.", ok: false };
      }

      const dueActivities = (await prisma.participantActivity.findMany?.({
        orderBy: [
          { availableFrom: "asc" },
          { scheduledAt: "asc" }
        ],
        select: {
          activitySchedule: {
            select: {
              code: true,
              id: true
            }
          },
          availableFrom: true,
          id: true,
          reminders: {
            select: {
              id: true,
              metadataJson: true,
              status: true
            },
            where: {
              channel: "INTERNAL_FOLLOWUP"
            }
          },
          status: true,
          studyParticipant: {
            select: {
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
                select: {
                  activitySchedule: {
                    select: {
                      code: true
                    }
                  },
                  availableFrom: true,
                  id: true,
                  status: true
                },
                where: {
                  activitySchedule: {
                    code: { in: NAVIGO_ACTIVITY_CODES },
                    status: "ACTIVE"
                  }
                }
              },
              id: true,
              participantConfirmation: {
                select: {
                  folio: true
                }
              },
              participantProfile: {
                select: {
                  name: true,
                  phone: true
                }
              },
              qaParticipantRun: {
                select: {
                  id: true,
                  status: true
                }
              },
              study: {
                select: studySelect
              },
              studyId: true
            }
          }
        },
        where: {
          activitySchedule: {
            code: { in: NAVIGO_ACTIVITY_CODES },
            status: "ACTIVE"
          },
          availableFrom: {
            lte: now
          },
          status: {
            not: "COMPLETED"
          },
          studyParticipant: {
            ...(input.studyId ? { studyId: input.studyId } : {}),
            qaParticipantRun: {
              is: null
            }
          }
        }
      })) as DueNavigoReminderActivity[];

      const report: NavigoEvaluationReminderProcessingResult = {
        failed: 0,
        results: [],
        scanned: dueActivities.length,
        sent: 0,
        skipped: 0
      };

      const selectedActivities = selectNextDueReminderActivities(dueActivities);

      for (const activity of selectedActivities) {
        const sent = await sendNavigoEvaluationReminderForActivity({
          activity,
          actorUserId: null,
          now,
          reminderLog,
          repository: getWhatsAppRepository(),
          requestOrigin: input.requestOrigin,
          source: NAVIGO_EVALUATION_REMINDER_SOURCE_CRON
        });
        report[sent.reportKey] += 1;
        report.results.push(sent.result);
      }

      return { data: report, ok: true };
    },

    async sendEvaluationReminderNow(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const reminderLog = prisma.reminderLog;

      if (!reminderLog) {
        return { message: "La auditoria de recordatorios no esta disponible.", ok: false };
      }

      const activities = (await prisma.participantActivity.findMany?.({
        select: {
          activitySchedule: {
            select: {
              code: true,
              id: true
            }
          },
          availableFrom: true,
          id: true,
          reminders: {
            select: {
              id: true,
              metadataJson: true,
              status: true
            },
            where: {
              channel: "INTERNAL_FOLLOWUP"
            }
          },
          status: true,
          studyParticipant: {
            select: {
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
                select: {
                  activitySchedule: {
                    select: {
                      code: true
                    }
                  },
                  availableFrom: true,
                  id: true,
                  status: true
                },
                where: {
                  activitySchedule: {
                    code: { in: NAVIGO_ACTIVITY_CODES },
                    status: "ACTIVE"
                  }
                }
              },
              id: true,
              participantConfirmation: {
                select: {
                  folio: true
                }
              },
              participantProfile: {
                select: {
                  name: true,
                  phone: true
                }
              },
              qaParticipantRun: {
                select: {
                  id: true,
                  status: true
                }
              },
              study: {
                select: studySelect
              },
              studyId: true
            }
          }
        },
        where: {
          id: input.participantActivityId,
          studyParticipant: {
            qaParticipantRun: { is: null },
            studyId: input.studyId
          }
        }
      })) as DueNavigoReminderActivity[];
      const activity = activities[0] ?? null;

      if (!activity) {
        return { message: "No encontramos la actividad Navigo.", ok: false };
      }

      const activityCode = String(activity.activitySchedule.code) as NavigoActivityCode;

      if (!NAVIGO_ACTIVITY_CODES.includes(activityCode as NavigoCurrentActivityCode)) {
        return { message: "La actividad seleccionada no permite recordatorio Navigo.", ok: false };
      }

      if (activity.status === "COMPLETED") {
        return { message: "La evaluacion ya esta completada.", ok: false };
      }

      if (activity.availableFrom.getTime() > now.getTime()) {
        return { message: "La evaluacion aun no esta disponible.", ok: false };
      }

      const nextPendingCode = getNextPendingNavigoActivityCode(activity.studyParticipant.activities);

      if (nextPendingCode !== activityCode) {
        return { message: "Completa la evaluacion anterior antes de enviar este recordatorio.", ok: false };
      }

      const sent = await sendNavigoEvaluationReminderForActivity({
        activity,
        actorUserId: input.actorUserId,
        now,
        reminderLog,
        repository: getWhatsAppRepository(),
        requestOrigin: input.requestOrigin,
        source: NAVIGO_EVALUATION_REMINDER_SOURCE_MANUAL_ADMIN
      });

      if (sent.result.status === "SKIPPED") {
        return { message: sent.result.message, ok: false };
      }

      return {
        data: {
          activityCode,
          evaluationUrl: sent.evaluationUrl,
          folio: sent.result.folio,
          generatedAt: now,
          phone: sent.phone,
          whatsappError: sent.result.status === "FAILED" ? sent.result.message : null,
          whatsappMessageId: sent.result.whatsappMessageId,
          whatsappStatus: sent.result.status === "SENT" ? "ENVIADO" : "ERROR"
        },
        ok: true
      };
    },

    async reopenActivityOutsideWindow(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const reason = input.reason.trim();

      if (!reason) {
        return { message: "Captura el motivo de la reapertura.", ok: false };
      }

      const activity = (await prisma.participantActivity.findFirst?.({
        select: {
          activitySchedule: {
            select: {
              code: true
            }
          },
          availableUntil: true,
          id: true,
          reopenedAt: true,
          status: true,
          studyParticipant: {
            select: {
              participantConfirmation: {
                select: {
                  folio: true
                }
              },
              studyId: true
            }
          }
        },
        where: {
          id: input.participantActivityId,
          studyParticipant: {
            qaParticipantRun: { is: null },
            studyId: input.studyId
          }
        }
      })) as {
        activitySchedule: { code: string };
        availableUntil: Date;
        id: string;
        reopenedAt: Date | null;
        status: string;
        studyParticipant: { participantConfirmation: { folio: string } | null; studyId: string };
      } | null;

      if (!activity) {
        return { message: "No encontramos la actividad Navigo.", ok: false };
      }

      if (!isSupportedNavigoActivityCode(activity.activitySchedule.code)) {
        return { message: "La actividad seleccionada no pertenece al protocolo Navigo activo.", ok: false };
      }

      if (isInitialNavigoEvaluation(activity.activitySchedule.code)) {
        return { message: "T0 se controla desde CTL y no se reabre desde esta accion.", ok: false };
      }

      if (activity.status === "COMPLETED") {
        return { message: "La evaluacion ya esta completada.", ok: false };
      }

      if (activity.availableUntil.getTime() >= now.getTime()) {
        return { message: "La evaluacion todavia esta dentro de su ventana operativa.", ok: false };
      }

      await prisma.participantActivity.update?.({
        data: {
          reopenedAt: now,
          reopenedByUserId: input.actorUserId,
          reopenReason: reason,
          status: "REOPENED"
        },
        where: { id: activity.id }
      });

      return {
        message: `Evaluacion ${activity.activitySchedule.code} reabierta manualmente para ${activity.studyParticipant.participantConfirmation?.folio ?? "participante sin folio"}.`,
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
            qaParticipantRun: { is: null },
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
          qaParticipantRun: { is: null },
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

    async releaseParticipantAfterCtl(input) {
      const prisma = await getPrisma();
      return prisma.$transaction((tx) =>
        releaseNavigoParticipantForCtl({
          actorUserId: input.actorUserId,
          now: input.now,
          prisma: tx,
          studyParticipantId: input.studyParticipantId
        })
      );
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
        if (!activity || !isInitialNavigoEvaluation(activity.activitySchedule.code)) {
          return { message: "No encontramos T0 para este enlace.", ok: false };
        }

        const questionnaireVersionId = await resolveNavigoMeasurementQuestionnaireVersionId({
          participant,
          prisma: tx
        });
        if (!questionnaireVersionId) {
          return { message: "No encontramos cuestionario AP1 a AP7 para T0.", ok: false };
        }

        const applicationStartedAt = participant.applicationStartedAt ?? (activity.activitySchedule.code === "T0_SALON" ? now : null);
        if (!applicationStartedAt) {
          return { message: "Registra primero la aplicacion inicial de fragancia.", ok: false };
        }

        if (!participant.applicationStartedAt && activity.activitySchedule.code === "T0_SALON") {
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
            actualStartedAt: activity.actualStartedAt ?? now,
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

        const isT0 = isInitialNavigoEvaluation(activity.activitySchedule.code);

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

        if (resolveParticipantVisualVerificationMode(participant) === "required" && !hasActivitySelfie(activity)) {
          return { message: "Toma y guarda la selfie de esta evaluacion antes de guardar las respuestas.", ok: false };
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

export async function releaseNavigoParticipantForCtl({
  actorUserId,
  now = new Date(),
  prisma,
  studyParticipantId
}: {
  actorUserId: string;
  now?: Date;
  prisma: NavigoTransactionClient;
  studyParticipantId: string;
}): Promise<NavigoMaintenanceResult & { linkToken?: string }> {
  let participant = (await prisma.studyParticipant.findUnique?.({
    select: participantWithActivitiesSelect,
    where: { id: studyParticipantId }
  })) as ParticipantRecord | null;

  if (!participant) {
    return { message: "No encontramos el participante para liberar Navigo.", ok: false };
  }

  const releaseGuard = validateParticipantForCtlRelease(participant);
  if (!releaseGuard.ok) {
    return releaseGuard;
  }

  await ensureCurrentNavigoSchedulesForParticipant({ participant, prisma });

  if (!buildParticipantRotationSummary(participant).ready) {
    const rotationResult = await assignNavigoRotationFromStudyConfig({
      actorUserId,
      participant,
      prisma
    });

    if (!rotationResult.ok) {
      return rotationResult;
    }

    participant = ((await prisma.studyParticipant.findUnique?.({
      select: participantWithActivitiesSelect,
      where: { id: studyParticipantId }
    })) as ParticipantRecord | null) ?? participant;
  }

  const guard = validateParticipantForT0(participant);
  if (!guard.ok) {
    return { message: guard.message, ok: false };
  }

  const linkToken = await ensureParticipantAccessToken({
    actorUserId,
    now,
    participant,
    prisma
  });

  if (!participant.applicationStartedAt) {
    await prisma.studyParticipant.update?.({
      data: {
        operationalStatus: "ASSIGNED"
      },
      where: { id: participant.id }
    });
  }

  return {
    linkToken,
    message: "Navigo liberado correctamente.",
    ok: true
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
  const questionnaireVersionId = await resolveNavigoMeasurementQuestionnaireVersionId({
    participant,
    prisma
  });

  if (!questionnaireVersionId) {
    return { message: "No encontramos cuestionario AP1 a AP7 para T0.", ok: false };
  }

  const applicationStartedAt = participant.applicationStartedAt ?? (activity.activitySchedule.code === "T0_SALON" ? now : null);
  const schedules = (participant.activities ?? [])
    .map((participantActivity) => participantActivity.activitySchedule)
    .filter((schedule) => isSupportedNavigoActivityCode(schedule.code)) as NavigoScheduleRecord[];

  if (!applicationStartedAt) {
    return {
      message: "Registra primero la aplicacion inicial de fragancia.",
      ok: false
    };
  }

  if (!participant.applicationStartedAt && activity.activitySchedule.code === "T0_SALON") {
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
      actualStartedAt: activity.actualStartedAt ?? now,
      lastSavedAt: now,
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

  for (const preparedActivity of prepared.created.filter((item) => !isInitialNavigoEvaluation(item.code))) {
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
  prisma: NavigoPrismaClient | NavigoTransactionClient;
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

type NavigoScheduleRow = {
  code: string | null;
  id: string;
  name: string;
  offsetMinutes: number;
  questionnaireVersionId: string | null;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
  type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
  windowEndsMinutes: number;
  windowStartsMinutes: number;
};

async function ensureCurrentNavigoSchedulesForParticipant({
  participant,
  prisma
}: {
  participant: ParticipantRecord;
  prisma: NavigoPrismaClient | NavigoTransactionClient;
}): Promise<void> {
  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return;
  }

  const version = (await prisma.questionnaireVersion.findFirst?.({
    orderBy: { versionNumber: "desc" },
    select: { id: true },
    where: {
      questionnaireDraft: {
        purpose: "MEASUREMENT"
      },
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) as { id: string } | null;

  if (!version) {
    return;
  }

  const seeds = createNavigoScheduleSeeds(version.id);
  const activeCodes = seeds.map((seed) => seed.code);
  const existingSchedules = (await prisma.activitySchedule.findMany?.({
    select: {
      code: true,
      id: true,
      name: true,
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
        in: [...activeCodes, ...NAVIGO_LEGACY_ACTIVITY_CODES]
      },
      studyId: participant.study.id
    }
  })) as NavigoScheduleRow[];
  const schedulesByCode = new Map(
    existingSchedules
      .filter((schedule): schedule is NavigoScheduleRow & { code: string } => Boolean(schedule.code))
      .map((schedule) => [schedule.code, schedule])
  );

  for (const seed of seeds) {
    const sortOrder = resolveNavigoScheduleSortOrder({
      code: seed.code,
      existingSchedules,
      preferredSortOrder: seed.sortOrder,
      type: seed.type
    });
    const existing = schedulesByCode.get(seed.code);

    if (!existing) {
      const created = (await prisma.activitySchedule.create?.({
        data: toRepositoryScheduleData({
          seed,
          sortOrder,
          studyId: participant.study.id
        })
      })) as { id?: string } | undefined;
      existingSchedules.push({
        ...toRepositoryScheduleData({
          seed,
          sortOrder,
          studyId: participant.study.id
        }),
        id: created?.id ?? `created-${seed.code}`
      });
      continue;
    }

    if (repositoryScheduleNeedsUpdate(existing, seed, sortOrder)) {
      await prisma.activitySchedule.update?.({
        data: toRepositoryScheduleUpdateData({ seed, sortOrder }),
        where: { id: existing.id }
      });
      Object.assign(existing, toRepositoryScheduleUpdateData({ seed, sortOrder }));
    }
  }

  for (const legacy of existingSchedules.filter((schedule) => NAVIGO_LEGACY_ACTIVITY_CODES.includes(schedule.code as never))) {
    if (legacy.status === "ACTIVE") {
      await prisma.activitySchedule.update?.({
        data: {
          status: "INACTIVE"
        },
        where: { id: legacy.id }
      });
      legacy.status = "INACTIVE";
    }
  }
}

function resolveNavigoScheduleSortOrder({
  code,
  existingSchedules,
  preferredSortOrder,
  type
}: {
  code: string;
  existingSchedules: NavigoScheduleRow[];
  preferredSortOrder: number;
  type: NavigoScheduleSeed["type"];
}): number {
  const conflicting = existingSchedules.find(
    (schedule) => schedule.code !== code && schedule.type === type && schedule.sortOrder === preferredSortOrder
  );

  if (!conflicting) {
    return preferredSortOrder;
  }

  return (
    Math.max(
      preferredSortOrder,
      ...existingSchedules.filter((schedule) => schedule.type === type).map((schedule) => schedule.sortOrder)
    ) + 1
  );
}

function repositoryScheduleNeedsUpdate(
  existing: NavigoScheduleRow,
  seed: NavigoScheduleSeed,
  sortOrder: number
): boolean {
  return (
    existing.name !== seed.name ||
    existing.offsetMinutes !== seed.offsetMinutes ||
    existing.questionnaireVersionId !== seed.questionnaireVersionId ||
    existing.sortOrder !== sortOrder ||
    existing.status !== "ACTIVE" ||
    existing.type !== seed.type ||
    existing.windowEndsMinutes !== seed.windowEndsMinutes ||
    existing.windowStartsMinutes !== seed.windowStartsMinutes
  );
}

function toRepositoryScheduleData({
  seed,
  sortOrder,
  studyId
}: {
  seed: NavigoScheduleSeed;
  sortOrder: number;
  studyId: string;
}) {
  return {
    code: seed.code,
    name: seed.name,
    offsetMinutes: seed.offsetMinutes,
    questionnaireVersionId: seed.questionnaireVersionId,
    sortOrder,
    status: "ACTIVE" as const,
    studyId,
    type: seed.type,
    windowEndsMinutes: seed.windowEndsMinutes,
    windowStartsMinutes: seed.windowStartsMinutes
  };
}

function toRepositoryScheduleUpdateData({
  seed,
  sortOrder
}: {
  seed: NavigoScheduleSeed;
  sortOrder: number;
}) {
  return {
    name: seed.name,
    offsetMinutes: seed.offsetMinutes,
    questionnaireVersionId: seed.questionnaireVersionId,
    sortOrder,
    status: "ACTIVE",
    type: seed.type,
    windowEndsMinutes: seed.windowEndsMinutes,
    windowStartsMinutes: seed.windowStartsMinutes
  };
}

async function ensureCurrentNavigoActivitiesForParticipant({
  now,
  participant,
  prisma
}: {
  now: Date;
  participant: ParticipantRecord;
  prisma: NavigoPrismaClient | NavigoTransactionClient;
}): Promise<ParticipantRecord> {
  if (!participant.applicationStartedAt) {
    return participant;
  }

  if (hasLegacyNavigoActivities(participant.activities ?? [])) {
    return participant;
  }

  await ensureCurrentNavigoSchedulesForParticipant({ participant, prisma });

  const schedules = await getNavigoSchedules({ participant, prisma });
  const prepared = prepareNavigoParticipantActivities({
    existingActivities: (participant.activities ?? []).map(toNavigoActivityRecord),
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

  if (!prepared.ok || (prepared.created.length === 0 && prepared.updated.length === 0)) {
    return participant;
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

  return ((await prisma.studyParticipant.findUnique?.({
    select: participantWithActivitiesSelect,
    where: { id: participant.id }
  })) as ParticipantRecord | null) ?? participant;
}

function hasLegacyNavigoActivities(activities: NonNullable<ParticipantRecord["activities"]>): boolean {
  return activities.some((activity) =>
    NAVIGO_LEGACY_ACTIVITY_CODES.includes(String(activity.activitySchedule.code) as never)
  );
}

type NavigoEvaluationReminderSource =
  | typeof NAVIGO_EVALUATION_REMINDER_SOURCE_CRON
  | typeof NAVIGO_EVALUATION_REMINDER_SOURCE_MANUAL_ADMIN;

type NavigoEvaluationReminderSendOutcome = {
  evaluationUrl: string;
  phone: string;
  reportKey: "failed" | "sent" | "skipped";
  result: NavigoEvaluationReminderProcessingResult["results"][number];
};

function selectNextDueReminderActivities(dueActivities: DueNavigoReminderActivity[]): DueNavigoReminderActivity[] {
  const grouped = new Map<string, DueNavigoReminderActivity[]>();

  for (const activity of dueActivities) {
    grouped.set(activity.studyParticipant.id, [
      ...(grouped.get(activity.studyParticipant.id) ?? []),
      activity
    ]);
  }

  return [...grouped.values()].flatMap((activities) => {
    const nextCode = getNextPendingNavigoActivityCode(activities[0]?.studyParticipant.activities ?? []);

    if (!nextCode) {
      return [];
    }

    const selected = activities.find((activity) => activity.activitySchedule.code === nextCode);

    return selected ? [selected] : [];
  });
}

function getNextPendingNavigoActivityCode(
  activities: Array<{ activitySchedule: { code: string }; status: string }>
): NavigoCurrentActivityCode | null {
  return NAVIGO_ACTIVITY_CODES.find((code) =>
    activities.some((activity) => activity.activitySchedule.code === code && activity.status !== "COMPLETED")
  ) ?? null;
}

function resolveAvailableLinkType({
  hutUrl,
  navigoUrl,
  requested
}: {
  hutUrl: string | null;
  navigoUrl: string | null;
  requested: NavigoParticipantLinkSendType;
}): NavigoParticipantLinkSendType | null {
  if (requested === "NAVIGO") {
    return navigoUrl ? "NAVIGO" : null;
  }

  if (requested === "HUT") {
    return hutUrl ? "HUT" : null;
  }

  if (navigoUrl && hutUrl) {
    return "BOTH";
  }

  if (navigoUrl) {
    return "NAVIGO";
  }

  return hutUrl ? "HUT" : null;
}

async function sendParticipantLinksByType({
  folio,
  hutUrl,
  navigoUrl,
  now,
  participantId,
  participantName,
  phone,
  repository,
  sentLinkType,
  studyId
}: {
  folio: string;
  hutUrl: string | null;
  navigoUrl: string | null;
  now: Date;
  participantId: string;
  participantName: string;
  phone: string;
  repository: OneuiWhatsAppRepository;
  sentLinkType: NavigoParticipantLinkSendType;
  studyId: string;
}) {
  if (sentLinkType === "BOTH") {
    return sendNavigoHutLinksWhatsApp({
      hutUrl: hutUrl ?? "",
      navigoUrl: navigoUrl ?? "",
      now,
      participantId,
      participantName,
      phone,
      repository,
      studyId
    });
  }

  if (sentLinkType === "HUT") {
    return sendHutParticipantLinkWhatsApp({
      hutUrl: hutUrl ?? "",
      now,
      participantId,
      participantName,
      phone,
      repository,
      studyId
    });
  }

  return sendNavigoEvaluationLinkWhatsApp({
    evaluationUrl: navigoUrl ?? "",
    folio,
    now,
    participantId,
    participantName,
    phone,
    repository,
    studyId
  });
}

function templateNameForParticipantLinks(linkType: NavigoParticipantLinkSendType): string {
  if (linkType === "BOTH") {
    return "navigo_hut_links";
  }

  return linkType === "HUT" ? "hut_link_participant" : "navigo_acceso_evaluaciones";
}

async function sendNavigoEvaluationReminderForActivity({
  activity,
  actorUserId,
  now,
  reminderLog,
  repository,
  requestOrigin,
  source
}: {
  activity: DueNavigoReminderActivity;
  actorUserId: string | null;
  now: Date;
  reminderLog: Delegate;
  repository: OneuiWhatsAppRepository;
  requestOrigin: string;
  source: NavigoEvaluationReminderSource;
}): Promise<NavigoEvaluationReminderSendOutcome> {
  const activityCode = String(activity.activitySchedule.code) as NavigoActivityCode;
  const participant = activity.studyParticipant;
  const folio = participant.participantConfirmation?.folio ?? null;
  const existingReminder = activity.reminders.some((log) =>
    log.status === "COMPLETED" && isNavigoEvaluationReminderLog(log.metadataJson, activityCode)
  );

  if (existingReminder) {
    return {
      evaluationUrl: "",
      phone: participant.participantProfile.phone ?? "",
      reportKey: "skipped",
      result: {
        activityCode,
        activityId: activity.id,
        folio,
        message: "Recordatorio ya registrado previamente.",
        participantId: participant.id,
        status: "SKIPPED",
        whatsappMessageId: null
      }
    };
  }

  const activeToken = participant.accessTokens[0] ?? null;
  const linkToken = activeToken && activeToken.tokenHash === hashToken(activeToken.id) && activeToken.expiresAt.getTime() > now.getTime()
    ? activeToken.id
    : null;
  const participantName = participant.participantProfile.name;
  const participantPhone = participant.participantProfile.phone;

  if (!participantPhone || !linkToken) {
    return {
      evaluationUrl: "",
      phone: participantPhone ?? "",
      reportKey: "skipped",
      result: {
        activityCode,
        activityId: activity.id,
        folio,
        message: !participantPhone
          ? "Participante sin telefono para WhatsApp."
          : "Participante sin enlace activo vigente.",
        participantId: participant.id,
        status: "SKIPPED",
        whatsappMessageId: null
      }
    };
  }

  const evaluationUrl = new URL(`/p/${encodeURIComponent(linkToken)}/activities`, resolvePublicLinkOrigin(requestOrigin)).toString();
  const baseMetadata = {
    activityCode,
    adminUserId: actorUserId,
    reminderType: NAVIGO_EVALUATION_REMINDER_TYPE,
    source,
    templateName: "navigo_recordatorio_evaluacion",
    timeZoneIana: resolveNavigoTimeZone(participant.study.timeZoneIana)
  };
  const plannedLog = (await reminderLog.create?.({
    data: {
      channel: "INTERNAL_FOLLOWUP",
      metadataJson: baseMetadata,
      participantActivityId: activity.id,
      scheduledFor: activity.availableFrom,
      status: "PLANNED"
    },
    select: { id: true }
  })) as { id: string };

  const result = await sendNavigoEvaluationReminderWhatsApp({
    activityCode,
    evaluationUrl,
    now,
    participantId: participant.id,
    participantName,
    phone: participantPhone,
    repository,
    studyId: participant.study.id
  });
  const whatsAppMessage = result.ok ? result.data : "data" in result ? result.data : undefined;

  await reminderLog.update?.({
    data: {
      metadataJson: {
        ...baseMetadata,
        message: result.ok ? "Recordatorio enviado." : result.message,
        metaMessageId: whatsAppMessage?.metaMessageId ?? null,
        status: result.ok ? "SENT" : "FAILED",
        whatsappMessageId: whatsAppMessage?.id ?? null
      },
      sentAt: result.ok ? now : null,
      status: result.ok ? "COMPLETED" : "CANCELLED"
    },
    where: { id: plannedLog.id }
  });

  if (result.ok) {
    return {
      evaluationUrl,
      phone: participantPhone,
      reportKey: "sent",
      result: {
        activityCode,
        activityId: activity.id,
        folio,
        message: "Recordatorio enviado por WhatsApp.",
        participantId: participant.id,
        status: "SENT",
        whatsappMessageId: result.data.id
      }
    };
  }

  return {
    evaluationUrl,
    phone: participantPhone,
    reportKey: "failed",
    result: {
      activityCode,
      activityId: activity.id,
      folio,
      message: result.message,
      participantId: participant.id,
      status: "FAILED",
      whatsappMessageId: whatsAppMessage?.id ?? null
    }
  };
}

function isNavigoEvaluationReminderLog(metadataJson: unknown, activityCode: NavigoActivityCode): boolean {
  if (!metadataJson || typeof metadataJson !== "object") {
    return false;
  }

  const metadata = metadataJson as { activityCode?: unknown; reminderType?: unknown; source?: unknown };

  return metadata.activityCode === activityCode && (
    metadata.reminderType === NAVIGO_EVALUATION_REMINDER_TYPE ||
    metadata.source === NAVIGO_EVALUATION_REMINDER_TYPE
  );
}

function readReminderSource(metadataJson: unknown): string | null {
  if (!metadataJson || typeof metadataJson !== "object") {
    return null;
  }

  const metadata = metadataJson as { source?: unknown };
  return typeof metadata.source === "string" ? metadata.source : null;
}

async function resolveNavigoMeasurementQuestionnaireVersionId({
  participant,
  prisma
}: {
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<string | null> {
  const schedules = await getNavigoSchedules({ participant, prisma });
  const scheduleVersionId = schedules.find((schedule) => schedule.questionnaireVersionId)?.questionnaireVersionId ?? null;

  if (scheduleVersionId) {
    return scheduleVersionId;
  }

  const version = (await prisma.questionnaireVersion.findFirst?.({
    orderBy: { versionNumber: "desc" },
    select: { id: true },
    where: {
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) as { id: string } | null;

  return version?.id ?? null;
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
  const sequence = resolveNavigoTimelineSequence([fromCode]);
  const start = sequence.indexOf(fromCode);
  return start < 0 ? [] : [...sequence.slice(start)];
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
    const label = question.options.find((option) => option.value === value)?.label ?? String(value);
    const numericEquivalent = navigoComparativeNumericEquivalent(question.id, value);

    return numericEquivalent ? `${numericEquivalent} - ${label}` : label;
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
  const ctl = buildParticipantCtlSummary(participant);
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
    canChangeVisualVerificationMode: !hasT0Started(participant),
    confirmation: participant.participantConfirmation,
    ctl,
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

function buildParticipantCtlSummary(participant: ParticipantRecord): NavigoParticipantListItem["ctl"] {
  const sessions = participant.ctlSessions ?? [];
  const completed = sessions.find((session) => session.status === "COMPLETED") ?? null;
  const visible = completed ?? sessions[0] ?? null;

  return {
    completed: Boolean(completed),
    completedAt: completed?.completedAt ?? null,
    interviewerName: visible?.interviewer?.name ?? visible?.ctlInterviewerCode?.label ?? null,
    sessionId: visible?.id ?? null,
    status: visible?.status ?? null
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
      rotationComplete: false,
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
  allowMissingFolios = false,
  prisma,
  rows,
  studyId
}: {
  allowMissingFolios?: boolean;
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationImportRowInput[];
  studyId: string;
}): Promise<NavigoRotationImportPreview> {
  const confirmations = await findConfirmationsByFolio({ prisma, rows, studyId });
  const storedConfigurations = await findNavigoRotationFolioConfigurationsByFolio({ prisma, rows, studyId });
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
    const existingStoredConfiguration = row.folio ? storedConfigurations.has(row.folio) : false;
    const participantFound = Boolean(confirmation);

    if (!row.folio) {
      errors.push("folio vacio");
    } else if (!isValidNavigoImportedFolio(row.folio)) {
      errors.push("folio invalido");
    } else if (duplicateFolios.has(row.folio)) {
      errors.push("folio duplicado dentro del archivo");
    } else if (!allowMissingFolios && !confirmation) {
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
      existingStoredConfiguration,
      participantFound,
      pendingParticipant: !participantFound,
      rowNumber: index + 2,
      t0Started,
      updatable: errors.length === 0
    };
  });

  return {
    rows: previewRows,
    summary: {
      duplicateFolios: duplicateFolios.size,
      existingStoredConfigurations: previewRows.filter((row) => row.existingStoredConfiguration).length,
      foundFolios: previewRows.filter((row) => row.folio && confirmations.has(row.folio)).length,
      missingFolios: previewRows.filter((row) => row.folio && !confirmations.has(row.folio)).length,
      pendingParticipants: previewRows.filter((row) => row.pendingParticipant && row.errors.length === 0).length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      t0Started: previewRows.filter((row) => row.t0Started).length,
      totalRows: previewRows.length,
      updatable: previewRows.filter((row) => row.updatable).length,
      validRows: previewRows.filter((row) => row.errors.length === 0).length
    }
  };
}

async function buildRotationWorkbookImportPreview({
  hutRows,
  prisma,
  rows,
  studyId
}: {
  hutRows?: NavigoHutRotationWorkbookRowInput[];
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoRotationWorkbookRowInput[];
  studyId: string;
}): Promise<NavigoRotationWorkbookPreview> {
  const basePreview = await buildRotationImportPreview({ allowMissingFolios: true, prisma, rows, studyId });
  const hutPreview = await buildHutRotationWorkbookPreview({
    prisma,
    rows: hutRows ?? [],
    studyId
  });
  const previewRows = basePreview.rows.map((row, index): NavigoRotationWorkbookPreviewRow => {
    const workbookRow = rows[index] ?? {
      folio: row.folio,
      primeraFragancia: row.primeraFragancia,
      segundaFragancia: row.segundaFragancia,
      triangular1Pr1: "",
      triangular1Pr2: "",
      triangular1Pr3: "",
      triangular1Verify: "",
      triangular2Pr1: "",
      triangular2Pr2: "",
      triangular2Pr3: "",
      triangular2Verify: ""
    };
    const errors = [...row.errors, ...validateTriangularRotationRow(workbookRow)];

    return {
      ...row,
      ...workbookRow,
      errors,
      existingTriangularRotation: false,
      triangularComplete: errors.length === 0,
      updatable: errors.length === 0
    };
  });

  const confirmations = await findConfirmationsByFolio({ prisma, rows, studyId });
  const rowsWithTriangularState = previewRows.map((row) => {
    const participant = confirmations.get(row.folio)?.studyParticipant ?? null;
    const existingTriangularRotation = Boolean(participant?.ctlTriangularRotationAssignment);

    return {
      ...row,
      existingTriangularRotation,
      triangularComplete: validateTriangularRotationRow(row).length === 0
    };
  });

  return {
    hutRows: hutPreview.rows,
    rows: rowsWithTriangularState,
    summary: {
      ...basePreview.summary,
      existingTriangularRotations: rowsWithTriangularState.filter((row) => row.existingTriangularRotation).length,
      hut: hutPreview.summary,
      rowsWithError: rowsWithTriangularState.filter((row) => row.errors.length > 0).length + hutPreview.summary.rowsWithError,
      triangularComplete: rowsWithTriangularState.filter((row) => row.triangularComplete).length,
      updatable: rowsWithTriangularState.filter((row) => row.updatable).length,
      validRows: rowsWithTriangularState.filter((row) => row.errors.length === 0).length
    }
  };
}

async function applyRotationWorkbookRowsInBatches({
  actorUserId,
  filename,
  onError,
  prisma,
  rows,
  studyId
}: {
  actorUserId: string;
  filename: string;
  onError: (error: NonNullable<NavigoRotationWorkbookPreview["applyErrors"]>[number]) => void;
  prisma: NavigoPrismaClient;
  rows: NavigoRotationWorkbookPreviewRow[];
  studyId: string;
}) {
  const batches = chunkRows(rows, NAVIGO_ROTATION_WORKBOOK_IMPORT_BATCH_SIZE);

  for (const [batchIndex, batch] of batches.entries()) {
    try {
      await prisma.$transaction(async (tx) => {
        await applyRotationWorkbookRowsInTransaction({
          actorUserId,
          filename,
          prisma: tx,
          rows: batch,
          studyId
        });
      });
      logNavigoRotationWorkbookBatchProgress({
        batchIndex,
        rowCount: batch.length,
        scope: "CLT",
        studyId
      });
    } catch (error) {
      await applyRotationWorkbookRowsIndividually({
        actorUserId,
        error,
        filename,
        onError,
        prisma,
        rows: batch,
        studyId
      });
    }
  }
}

async function applyRotationWorkbookRowsIndividually({
  actorUserId,
  error,
  filename,
  onError,
  prisma,
  rows,
  studyId
}: {
  actorUserId: string;
  error: unknown;
  filename: string;
  onError: (error: NonNullable<NavigoRotationWorkbookPreview["applyErrors"]>[number]) => void;
  prisma: NavigoPrismaClient;
  rows: NavigoRotationWorkbookPreviewRow[];
  studyId: string;
}) {
  if (rows.length <= 1) {
    onError(toWorkbookApplyError(error, rows[0], "CLT"));
    return;
  }

  logNavigoRotationApplyFailure({
    error,
    folio: rows[0]?.folio,
    message: sanitizeRotationImportLogMessage(error),
    step: "workbook-batch-clt",
    studyId
  });

  for (const row of rows) {
    try {
      await prisma.$transaction(async (tx) => {
        await applyRotationWorkbookRowsInTransaction({
          actorUserId,
          filename,
          prisma: tx,
          rows: [row],
          studyId
        });
      });
    } catch (rowError) {
      onError(toWorkbookApplyError(rowError, row, "CLT"));
      logNavigoRotationApplyFailure({
        error: rowError,
        folio: row.folio,
        message: sanitizeRotationImportLogMessage(rowError),
        step: toNavigoRotationApplyFailure(rowError).step,
        studyId
      });
    }
  }
}

async function applyRotationWorkbookRowsInTransaction({
  actorUserId,
  filename,
  prisma,
  rows,
  studyId
}: {
  actorUserId: string;
  filename: string;
  prisma: NavigoTransactionClient;
  rows: NavigoRotationWorkbookPreviewRow[];
  studyId: string;
}) {
  const confirmations = await findConfirmationsByFolio({
    prisma,
    rows,
    studyId
  });

  for (const row of rows) {
    await upsertNavigoRotationFolioConfiguration({
      actorUserId,
      filename,
      prisma,
      row,
      studyId
    });

    const confirmation = confirmations.get(row.folio);

    if (!confirmation) {
      continue;
    }

    await upsertParticipantRotationForCodes({
      actorUserId,
      leftFragranceCode: row.primeraFragancia,
      participant: confirmation.studyParticipant,
      prisma,
      rightFragranceCode: row.segundaFragancia
    });

    await upsertCtlTriangularRotationAssignment({
      actorUserId,
      filename,
      prisma,
      row,
      studyParticipantId: confirmation.studyParticipant.id
    });
  }
}

async function upsertNavigoRotationFolioConfiguration({
  actorUserId,
  filename,
  prisma,
  row,
  studyId
}: {
  actorUserId: string;
  filename: string;
  prisma: NavigoTransactionClient;
  row: NavigoRotationWorkbookRowInput;
  studyId: string;
}) {
  await runNavigoRotationImportStep({
    folio: row.folio,
    operation: () =>
      prisma.navigoRotationFolioConfiguration?.upsert?.({
        create: {
          firstFragrance: row.primeraFragancia,
          folio: row.folio,
          importedByUserId: actorUserId,
          secondFragrance: row.segundaFragancia,
          sourceFileName: filename,
          studyId,
          triangular1Pr1: row.triangular1Pr1,
          triangular1Pr2: row.triangular1Pr2,
          triangular1Pr3: row.triangular1Pr3,
          triangular1Verify: row.triangular1Verify,
          triangular2Pr1: row.triangular2Pr1,
          triangular2Pr2: row.triangular2Pr2,
          triangular2Pr3: row.triangular2Pr3,
          triangular2Verify: row.triangular2Verify
        },
        update: {
          firstFragrance: row.primeraFragancia,
          importedAt: new Date(),
          importedByUserId: actorUserId,
          secondFragrance: row.segundaFragancia,
          sourceFileName: filename,
          triangular1Pr1: row.triangular1Pr1,
          triangular1Pr2: row.triangular1Pr2,
          triangular1Pr3: row.triangular1Pr3,
          triangular1Verify: row.triangular1Verify,
          triangular2Pr1: row.triangular2Pr1,
          triangular2Pr2: row.triangular2Pr2,
          triangular2Pr3: row.triangular2Pr3,
          triangular2Verify: row.triangular2Verify
        },
        where: {
          studyId_folio: {
            folio: row.folio,
            studyId
          }
        }
      }) as Promise<unknown>,
    step: "navigo-rotation-folio-configuration",
    userMessage: "No se pudo guardar la configuracion oficial de rotacion por folio."
  });
}

async function applyStoredNavigoRotationForParticipantInTransaction({
  actorUserId,
  participant,
  prisma
}: {
  actorUserId: string;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<boolean> {
  const confirmation = participant.participantConfirmation;

  if (!confirmation || participant.study.code !== NAVIGO_STUDY_CODE || participantStatus(participant) !== "APPROVED") {
    return false;
  }

  const configuration = (await prisma.navigoRotationFolioConfiguration?.findUnique?.({
    select: {
      firstFragrance: true,
      folio: true,
      importedByUserId: true,
      secondFragrance: true,
      sourceFileName: true,
      studyId: true,
      triangular1Pr1: true,
      triangular1Pr2: true,
      triangular1Pr3: true,
      triangular1Verify: true,
      triangular2Pr1: true,
      triangular2Pr2: true,
      triangular2Pr3: true,
      triangular2Verify: true
    },
    where: {
      studyId_folio: {
        folio: confirmation.folio,
        studyId: participant.study.id
      }
    }
  })) as {
    firstFragrance: string;
    folio: string;
    importedByUserId: string | null;
    secondFragrance: string;
    sourceFileName: string | null;
    studyId: string;
    triangular1Pr1: string;
    triangular1Pr2: string;
    triangular1Pr3: string;
    triangular1Verify: string;
    triangular2Pr1: string;
    triangular2Pr2: string;
    triangular2Pr3: string;
    triangular2Verify: string;
  } | null | undefined;

  if (!configuration) {
    return false;
  }

  await upsertParticipantRotationForCodes({
    actorUserId,
    leftFragranceCode: configuration.firstFragrance,
    participant,
    prisma,
    rightFragranceCode: configuration.secondFragrance
  });

  await upsertCtlTriangularRotationAssignment({
    actorUserId: configuration.importedByUserId ?? actorUserId,
    filename: configuration.sourceFileName ?? "ROTACIONES NAVIGO.xlsx",
    prisma,
    row: {
      folio: configuration.folio,
      primeraFragancia: configuration.firstFragrance,
      segundaFragancia: configuration.secondFragrance,
      triangular1Pr1: configuration.triangular1Pr1,
      triangular1Pr2: configuration.triangular1Pr2,
      triangular1Pr3: configuration.triangular1Pr3,
      triangular1Verify: configuration.triangular1Verify,
      triangular2Pr1: configuration.triangular2Pr1,
      triangular2Pr2: configuration.triangular2Pr2,
      triangular2Pr3: configuration.triangular2Pr3,
      triangular2Verify: configuration.triangular2Verify
    },
    studyParticipantId: participant.id
  });

  return true;
}

async function applyHutRotationWorkbookRowsInBatches({
  onError,
  prisma,
  rows,
  studyId
}: {
  onError: (error: NonNullable<NavigoRotationWorkbookPreview["applyErrors"]>[number]) => void;
  prisma: NavigoPrismaClient;
  rows: NavigoHutRotationWorkbookPreviewRow[];
  studyId: string;
}) {
  const batches = chunkRows(rows, NAVIGO_ROTATION_WORKBOOK_IMPORT_BATCH_SIZE);

  for (const [batchIndex, batch] of batches.entries()) {
    try {
      await prisma.$transaction(async (tx) => {
        await applyHutRotationWorkbookRows({
          prisma: tx,
          rows: batch,
          studyId
        });
      });
      logNavigoRotationWorkbookBatchProgress({
        batchIndex,
        rowCount: batch.length,
        scope: "HUT",
        studyId
      });
    } catch (error) {
      await applyHutRotationWorkbookRowsIndividually({
        error,
        onError,
        prisma,
        rows: batch,
        studyId
      });
    }
  }
}

async function applyHutRotationWorkbookRowsIndividually({
  error,
  onError,
  prisma,
  rows,
  studyId
}: {
  error: unknown;
  onError: (error: NonNullable<NavigoRotationWorkbookPreview["applyErrors"]>[number]) => void;
  prisma: NavigoPrismaClient;
  rows: NavigoHutRotationWorkbookPreviewRow[];
  studyId: string;
}) {
  if (rows.length <= 1) {
    onError(toWorkbookApplyError(error, rows[0], "HUT"));
    return;
  }

  logNavigoRotationApplyFailure({
    error,
    folio: rows[0]?.folio,
    message: sanitizeRotationImportLogMessage(error),
    step: "workbook-batch-hut",
    studyId
  });

  for (const row of rows) {
    try {
      await prisma.$transaction(async (tx) => {
        await applyHutRotationWorkbookRows({
          prisma: tx,
          rows: [row],
          studyId
        });
      });
    } catch (rowError) {
      onError(toWorkbookApplyError(rowError, row, "HUT"));
      logNavigoRotationApplyFailure({
        error: rowError,
        folio: row.folio,
        message: sanitizeRotationImportLogMessage(rowError),
        step: toNavigoRotationApplyFailure(rowError).step,
        studyId
      });
    }
  }
}

function toWorkbookApplyError(
  error: unknown,
  row: { folio: string; rowNumber: number } | undefined,
  scope: "CLT" | "HUT"
): NonNullable<NavigoRotationWorkbookPreview["applyErrors"]>[number] {
  const failure = toNavigoRotationApplyFailure(error);

  return {
    folio: failure.folio ?? row?.folio ?? "",
    message: failure.message,
    rowNumber: row?.rowNumber ?? -1,
    scope,
    step: failure.step
  };
}

function chunkRows<T>(rows: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }

  return batches;
}

function logNavigoRotationWorkbookBatchProgress({
  batchIndex,
  rowCount,
  scope,
  studyId
}: {
  batchIndex: number;
  rowCount: number;
  scope: "CLT" | "HUT";
  studyId: string;
}) {
  console.info(`navigo rotation workbook batch applied: scope=${scope} batch=${batchIndex + 1} rows=${rowCount} studyId=${studyId}`);
}

async function buildHutRotationWorkbookPreview({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: NavigoHutRotationWorkbookRowInput[];
  studyId: string;
}): Promise<{
  rows: NavigoHutRotationWorkbookPreviewRow[];
  summary: NavigoRotationWorkbookPreview["summary"]["hut"];
}> {
  const rowsWithNavigoFolio = rows.map((row) => ({
    ...row,
    linkedNavigoFolio: hutFolioToNavigoFolio(row.folio)
  }));
  const confirmations = await findConfirmationsByFolio({
    prisma,
    rows: rowsWithNavigoFolio.map((row) => ({ folio: row.linkedNavigoFolio ?? row.folio })),
    studyId
  });
  const hutParticipants = await findHutParticipantsByFolio({ folios: rows.map((row) => row.folio), prisma, studyId });
  const hutSlots = await findHutRegistrationSlotsByFolio({ folios: rows.map((row) => row.folio), prisma, studyId });
  const phaseCodeSecretReady = rows.length === 0 || Boolean(resolveHutPhaseCodeSecret());
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

  const previewRows = rowsWithNavigoFolio.map((row, index): NavigoHutRotationWorkbookPreviewRow => {
    const errors: string[] = [];
    const confirmationFolio = row.linkedNavigoFolio ?? row.folio;
    const confirmation = confirmationFolio ? confirmations.get(confirmationFolio) : null;
    const hutParticipant = row.folio ? hutParticipants.get(row.folio) ?? null : null;
    const hutSlot = row.folio ? hutSlots.get(row.folio) ?? null : null;
    const hasHutProgress = hutParticipant ? hutParticipantHasProgress(hutParticipant) : false;
    const hutOrigin = confirmation ? "CLT_HUT" : "HUT_DIRECTO";

    if (!row.folio) {
      errors.push("folio HUT vacio");
    } else if (duplicateFolios.has(row.folio)) {
      errors.push("folio HUT duplicado dentro del archivo");
    }
    if (!row.hutEva1) {
      errors.push("EVA1 HUT vacia");
    }
    if (!row.hutEva2) {
      errors.push("EVA2 HUT vacia");
    }
    if (!phaseCodeSecretReady) {
      errors.push("falta configuracion segura para codigos HUT");
    }
    if (confirmation && participantStatus(confirmation.studyParticipant) !== "APPROVED") {
      errors.push(`participante ${confirmationFolio} no confirmado para HUT`);
    }
    if (hutParticipant?.studyParticipantId && confirmation && hutParticipant.studyParticipantId !== confirmation.studyParticipant.id) {
      errors.push("participante HUT vinculado a otro StudyParticipant");
    }
    if (hutParticipant && hasHutProgress && hutRotationDiffers(hutParticipant, row)) {
      errors.push("participante HUT con avance; no se sobrescribe rotacion");
    }
    if (hutSlot?.participantId && hutParticipant && hutSlot.participantId !== hutParticipant.id) {
      errors.push("slot HUT registrado a otro participante");
    }

    return {
      ...row,
      errors,
      existingHutParticipant: Boolean(hutParticipant),
      existingHutSlot: Boolean(hutSlot),
      hasHutProgress,
      hutOrigin,
      linkedNavigoFolio: row.linkedNavigoFolio,
      linkedStudyParticipantId: hutParticipant?.studyParticipantId ?? confirmation?.studyParticipant.id ?? null,
      rowNumber: index + 2,
      updatable: errors.length === 0
    };
  });

  return {
    rows: previewRows,
    summary: {
      existingParticipants: previewRows.filter((row) => row.existingHutParticipant).length,
      existingSlots: previewRows.filter((row) => row.existingHutSlot).length,
      foundFolios: previewRows.filter((row) => row.hutOrigin === "CLT_HUT").length,
      missingFolios: previewRows.filter((row) => row.hutOrigin === "HUT_DIRECTO").length,
      rowsWithError: previewRows.filter((row) => row.errors.length > 0).length,
      totalRows: previewRows.length,
      updatable: previewRows.filter((row) => row.updatable).length,
      validRows: previewRows.filter((row) => row.errors.length === 0).length,
      withProgress: previewRows.filter((row) => row.hasHutProgress).length
    }
  };
}

async function applyHutRotationWorkbookRows({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoTransactionClient;
  rows: NavigoHutRotationWorkbookRowInput[];
  studyId: string;
}) {
  if (rows.length === 0) {
    return;
  }

  const preview = await buildHutRotationWorkbookPreview({ prisma, rows, studyId });
  if (preview.summary.rowsWithError > 0) {
    const firstError = preview.rows.find((row) => row.errors.length > 0);
    throw new NavigoRotationApplyError({
      folio: firstError?.folio,
      message: `No se aplico HUT: ${firstError?.errors.join("; ") ?? "corrige la previsualizacion HUT"}.`,
      step: "hut-preview"
    });
  }

  const rowsWithNavigoFolio = rows.map((row) => ({
    ...row,
    linkedNavigoFolio: hutFolioToNavigoFolio(row.folio)
  }));
  const confirmations = await findConfirmationsByFolio({
    prisma,
    rows: rowsWithNavigoFolio.map((row) => ({ folio: row.linkedNavigoFolio ?? row.folio })),
    studyId
  });
  for (const row of rows) {
    const linkedNavigoFolio = hutFolioToNavigoFolio(row.folio);
    const confirmation = confirmations.get(linkedNavigoFolio ?? row.folio) ?? null;

    const participant = await upsertHutParticipantFromWorkbookRow({
      prisma,
      row,
      studyParticipant: confirmation?.studyParticipant ?? null,
      studyId
    });

    await upsertHutRegistrationSlotFromWorkbookRow({
      participantId: participant.id,
      prisma,
      row,
      studyId
    });

    await ensureHutPhaseCodesForWorkbookParticipant({
      participant,
      prisma,
      referenceCodes: confirmation?.studyParticipant.participantConfirmation?.referenceCodes ?? []
    });
  }
}

async function upsertHutParticipantFromWorkbookRow({
  prisma,
  row,
  studyParticipant,
  studyId
}: {
  prisma: NavigoTransactionClient;
  row: NavigoHutRotationWorkbookRowInput;
  studyId: string;
  studyParticipant: ParticipantRecord | null;
}): Promise<HutParticipantWorkbookRecord> {
  const existingByStudyParticipant = studyParticipant && prisma.hutParticipant?.findFirst
    ? ((await prisma.hutParticipant.findFirst({
        select: hutParticipantWorkbookSelect,
        where: {
          studyId,
          studyParticipantId: studyParticipant.id
        }
      })) as HutParticipantWorkbookRecord | null)
    : null;
  const existingByFolio = prisma.hutParticipant?.findFirst
    ? ((await prisma.hutParticipant.findFirst({
        select: hutParticipantWorkbookSelect,
        where: {
          folio: row.folio,
          studyId
        }
      })) as HutParticipantWorkbookRecord | null)
    : null;
  const existing = existingByStudyParticipant ?? existingByFolio;

  if (existing) {
    const hasProgress = hutParticipantHasProgress(existing);
    const rotationDiffers = hutRotationDiffers(existing, row);
    const data: Record<string, unknown> = {
      origin: studyParticipant ? "CLT_HUT" : "HUT_DIRECTO",
      protocolVersion: "APPLICATION_PHOTO"
    };
    if (studyParticipant) {
      data.email = studyParticipant.participantProfile.email ?? null;
      data.name = studyParticipant.participantProfile.name;
      data.phone = studyParticipant.participantProfile.phone ?? null;
      data.studyParticipantId = existing.studyParticipantId ?? studyParticipant.id;
    }

    if (!hasProgress || !rotationDiffers) {
      data.firstFragranceLeftArm = row.hutEva1;
      data.folio = row.folio;
      data.secondFragranceRightArm = row.hutEva2;
    }

    const updated = prisma.hutParticipant?.update
      ? ((await prisma.hutParticipant.update({
          data,
          select: hutParticipantWorkbookSelect,
          where: { id: existing.id }
        })) as HutParticipantWorkbookRecord)
      : { ...existing, ...data } as HutParticipantWorkbookRecord;

    return updated;
  }

  if (!prisma.hutParticipant?.create) {
    throw new NavigoRotationApplyError({
      folio: row.folio,
      message: "No se pudo crear participante HUT.",
      step: "hut-participant"
    });
  }

  const created = (await prisma.hutParticipant.create({
    data: {
      currentBlockNumber: 1,
      currentVideoSequence: 1,
      email: studyParticipant?.participantProfile.email ?? null,
      firstFragranceLeftArm: row.hutEva1,
      folio: row.folio,
      name: studyParticipant?.participantProfile.name ?? row.folio,
      origin: studyParticipant ? "CLT_HUT" : "HUT_DIRECTO",
      phone: studyParticipant?.participantProfile.phone ?? null,
      protocolVersion: "APPLICATION_PHOTO",
      recruiter: null,
      secondFragranceRightArm: row.hutEva2,
      startDate: null,
      status: "NOT_STARTED",
      studyId,
      studyParticipantId: studyParticipant?.id ?? null,
      token: createHutParticipantToken()
    },
    select: hutParticipantWorkbookSelect
  })) as HutParticipantWorkbookRecord;

  return created;
}

async function upsertHutRegistrationSlotFromWorkbookRow({
  participantId,
  prisma,
  row,
  studyId
}: {
  participantId: string;
  prisma: NavigoTransactionClient;
  row: NavigoHutRotationWorkbookRowInput;
  studyId: string;
}) {
  const existing = prisma.hutRegistrationSlot?.findUnique
    ? ((await prisma.hutRegistrationSlot.findUnique({
        select: hutRegistrationSlotWorkbookSelect,
        where: {
          studyId_folio: {
            folio: row.folio,
            studyId
          }
        }
      })) as HutRegistrationSlotWorkbookRecord | null)
    : null;

  if (existing) {
    const nextStatus = existing.status === "CANCELLED" ? "CANCELLED" : "REGISTERED";
    await prisma.hutRegistrationSlot?.update?.({
      data: {
        firstFragranceLeftArm: row.hutEva1,
        participantId: existing.participantId ?? participantId,
        registeredAt: nextStatus === "REGISTERED" ? existing.registeredAt ?? new Date() : existing.registeredAt,
        secondFragranceRightArm: row.hutEva2,
        status: nextStatus
      },
      where: { id: existing.id }
    });
    return;
  }

  await prisma.hutRegistrationSlot?.create?.({
    data: {
      firstFragranceLeftArm: row.hutEva1,
      folio: row.folio,
      participantId,
      registeredAt: new Date(),
      registrationToken: createHutRegistrationToken(),
      secondFragranceRightArm: row.hutEva2,
      status: "REGISTERED",
      studyId
    }
  });
}

async function ensureHutPhaseCodesForWorkbookParticipant({
  participant,
  prisma,
  referenceCodes
}: {
  participant: HutParticipantWorkbookRecord;
  prisma: NavigoTransactionClient;
  referenceCodes: Array<{ code: string; slot: number }>;
}) {
  const secret = resolveHutPhaseCodeSecret();
  if (!secret) {
    throw new NavigoRotationApplyError({
      folio: participant.folio ?? undefined,
      message: "No se pudieron preparar codigos HUT seguros.",
      step: "hut-phase-secret"
    });
  }

  const existingCodes = participant.phaseCodes ?? [];
  const existingByPhase = new Map(existingCodes.map((code) => [code.phase, code]));
  const referenceBySlot = new Map(referenceCodes.map((code) => [code.slot, code]));

  for (const slot of [1, 2, 3] as const) {
    const phase = hutPhaseForSlot(slot);
    if (!phase || existingByPhase.has(phase)) {
      continue;
    }

    const code = referenceBySlot.get(slot)?.code ?? generateHutPhaseCode();

    await prisma.hutParticipantPhaseCode?.create?.({
      data: {
        codeHash: hashHutPhaseCode(code, secret),
        encryptedCode: encryptHutPhaseCode(code, secret),
        encryptionVersion: 1,
        participantId: participant.id,
        phase,
        slot,
        status: "GENERATED"
      }
    });
  }
}

function hutParticipantHasProgress(participant: HutParticipantWorkbookRecord): boolean {
  return Boolean(
    participant.status !== "NOT_STARTED" ||
      participant.videoSubmissions?.length ||
      participant.dailyChecks?.length ||
      participant.blocks?.some((block) => block.status !== "NOT_STARTED" || block.submittedVideosCount > 0) ||
      participant.callEvaluations?.some((call) => call.status !== "PENDING" || call.completedAt)
  );
}

function hutRotationDiffers(participant: HutParticipantWorkbookRecord, row: NavigoHutRotationWorkbookRowInput): boolean {
  return participant.firstFragranceLeftArm !== row.hutEva1 || participant.secondFragranceRightArm !== row.hutEva2;
}

function hutFolioToNavigoFolio(folio: string): string | null {
  const match = normalizeNavigoFolio(folio).match(/^HUT-(\d+)$/);
  if (!match?.[1]) {
    return null;
  }

  return `NAV-${match[1].padStart(3, "0")}`;
}

function isValidNavigoImportedFolio(folio: string): boolean {
  return /^NAV-\d{3,}$/.test(normalizeNavigoFolio(folio));
}

function validateTriangularRotationRow(row: NavigoTriangularRotationLike): string[] {
  const errors: string[] = [];
  const triangular1 = [row.triangular1Pr1, row.triangular1Pr2, row.triangular1Pr3];
  const triangular2 = [row.triangular2Pr1, row.triangular2Pr2, row.triangular2Pr3];

  for (const [label, value] of [
    ["PR1", row.triangular1Pr1],
    ["PR2", row.triangular1Pr2],
    ["PR3", row.triangular1Pr3],
    ["VERI_1", row.triangular1Verify],
    ["PR4", row.triangular2Pr1],
    ["PR5", row.triangular2Pr2],
    ["PR6", row.triangular2Pr3],
    ["VERI_2", row.triangular2Verify]
  ] as const) {
    if (!value) {
      errors.push(`${label} vacio`);
    }
  }

  if (row.triangular1Verify && !triangular1.includes(row.triangular1Verify)) {
    errors.push("VERI_1 no coincide con PR1/PR2/PR3");
  }
  if (row.triangular2Verify && !triangular2.includes(row.triangular2Verify)) {
    errors.push("VERI_2 no coincide con PR4/PR5/PR6");
  }

  return errors;
}

type NavigoTriangularRotationLike = Pick<
  NavigoRotationWorkbookRowInput,
  | "triangular1Pr1"
  | "triangular1Pr2"
  | "triangular1Pr3"
  | "triangular1Verify"
  | "triangular2Pr1"
  | "triangular2Pr2"
  | "triangular2Pr3"
  | "triangular2Verify"
>;

async function findConfirmationsByFolio({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: Array<{ folio: string }>;
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

async function findNavigoRotationFolioConfigurationsByFolio({
  prisma,
  rows,
  studyId
}: {
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  rows: Array<{ folio: string }>;
  studyId: string;
}): Promise<Map<string, NavigoRotationFolioConfigurationRecord>> {
  const folios = [...new Set(rows.map((row) => row.folio).filter(Boolean))];

  if (folios.length === 0 || !prisma.navigoRotationFolioConfiguration?.findMany) {
    return new Map();
  }

  const configurations = (await prisma.navigoRotationFolioConfiguration.findMany({
    select: {
      firstFragrance: true,
      folio: true,
      id: true,
      importedByUserId: true,
      secondFragrance: true,
      sourceFileName: true,
      studyId: true,
      triangular1Pr1: true,
      triangular1Pr2: true,
      triangular1Pr3: true,
      triangular1Verify: true,
      triangular2Pr1: true,
      triangular2Pr2: true,
      triangular2Pr3: true,
      triangular2Verify: true
    },
    where: {
      folio: { in: folios },
      studyId
    }
  })) as Array<{
    firstFragrance: string;
    folio: string;
    id: string;
    importedByUserId: string | null;
    secondFragrance: string;
    sourceFileName: string | null;
    studyId: string;
    triangular1Pr1: string;
    triangular1Pr2: string;
    triangular1Pr3: string;
    triangular1Verify: string;
    triangular2Pr1: string;
    triangular2Pr2: string;
    triangular2Pr3: string;
    triangular2Verify: string;
  }>;

  return new Map(configurations.map((configuration) => [
    configuration.folio,
    {
      folio: configuration.folio,
      id: configuration.id,
      importedByUserId: configuration.importedByUserId,
      primeraFragancia: configuration.firstFragrance,
      segundaFragancia: configuration.secondFragrance,
      sourceFileName: configuration.sourceFileName,
      studyId: configuration.studyId,
      triangular1Pr1: configuration.triangular1Pr1,
      triangular1Pr2: configuration.triangular1Pr2,
      triangular1Pr3: configuration.triangular1Pr3,
      triangular1Verify: configuration.triangular1Verify,
      triangular2Pr1: configuration.triangular2Pr1,
      triangular2Pr2: configuration.triangular2Pr2,
      triangular2Pr3: configuration.triangular2Pr3,
      triangular2Verify: configuration.triangular2Verify
    }
  ]));
}

async function findHutParticipantsByFolio({
  folios,
  prisma,
  studyId
}: {
  folios: string[];
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  studyId: string;
}): Promise<Map<string, HutParticipantWorkbookRecord>> {
  const normalizedFolios = [...new Set(folios.filter(Boolean))];
  if (normalizedFolios.length === 0 || !prisma.hutParticipant?.findMany) {
    return new Map();
  }

  const participants = (await prisma.hutParticipant.findMany({
    select: hutParticipantWorkbookSelect,
    where: {
      folio: { in: normalizedFolios },
      studyId
    }
  })) as HutParticipantWorkbookRecord[];

  return new Map(participants.map((participant) => [participant.folio ?? "", participant]));
}

async function findHutRegistrationSlotsByFolio({
  folios,
  prisma,
  studyId
}: {
  folios: string[];
  prisma: NavigoPrismaClient | NavigoTransactionClient;
  studyId: string;
}): Promise<Map<string, HutRegistrationSlotWorkbookRecord>> {
  const normalizedFolios = [...new Set(folios.filter(Boolean))];
  if (normalizedFolios.length === 0 || !prisma.hutRegistrationSlot?.findMany) {
    return new Map();
  }

  const slots = (await prisma.hutRegistrationSlot.findMany({
    select: hutRegistrationSlotWorkbookSelect,
    where: {
      folio: { in: normalizedFolios },
      studyId
    }
  })) as HutRegistrationSlotWorkbookRecord[];

  return new Map(slots.map((slot) => [slot.folio, slot]));
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

  return (
    participant.participantConfirmation?.folio === row.folio &&
    participant.participantProfile.name === row.nombre &&
    participant.participantProfile.phone === row.celular &&
    (participant.participantProfile.email ?? null) === (row.correo ?? null) &&
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
    primeraFragancia: normalizeNavigoRotationCode(input.primeraFragancia ?? ""),
    reclutador: input.reclutador ? normalizeNavigoParticipantName(input.reclutador) : null,
    segundaFragancia: normalizeNavigoRotationCode(input.segundaFragancia ?? "")
  };
  const errors: string[] = [];

  if (!data.folio) errors.push("Captura el folio.");
  if (!data.nombre) errors.push("Captura el nombre.");
  if (!data.celular) errors.push("Captura el celular.");
  if (data.celular && !isNavigoPhone(data.celular)) errors.push("Captura un celular valido a 10 digitos o con clave +52.");
  if (data.correo && !isNavigoEmail(data.correo)) errors.push("Captura un correo valido.");
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
    step: "study-participant-reload-after-confirmation",
    userMessage: "no se pudo recargar StudyParticipant despues de crear folio y codigos."
  });

  await applyStoredNavigoRotationForParticipantInTransaction({
    actorUserId,
    participant,
    prisma
  });

  let linkToken: string | null = null;
  if (generateLink && hasCompletedCtlSession(participant)) {
    const release = await releaseNavigoParticipantForCtl({
      actorUserId,
      now,
      prisma,
      studyParticipantId: participant.id
    });
    if (!release.ok) {
      throw new NavigoParticipantImportApplyError({
        folio: row.folio,
        logMessage: release.message,
        message: buildNavigoParticipantImportRowMessage({
          folio: row.folio,
          message: "no se pudo liberar Navigo para generar el enlace.",
          rowNumber
        }),
        rowNumber,
        step: "participant-navigo-release"
      });
    }
    linkToken = release.linkToken ?? null;
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
  const leftProduct = await upsertNavigoStudyProduct({
    displayLabel: "Primera fragancia",
    folio,
    internalName: leftFragranceCode,
    prisma,
    sampleKey: leftFragranceCode,
    studyId,
    step: "study-product-left",
    userMessage: "No se pudo crear el producto de brazo izquierdo."
  });
  const rightProduct = await upsertNavigoStudyProduct({
    displayLabel: "Segunda fragancia",
    folio,
    internalName: rightFragranceCode,
    prisma,
    sampleKey: rightFragranceCode,
    studyId,
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

async function upsertCtlTriangularRotationAssignment({
  actorUserId,
  filename,
  prisma,
  row,
  studyParticipantId
}: {
  actorUserId: string;
  filename: string;
  prisma: NavigoTransactionClient;
  row: NavigoRotationWorkbookRowInput;
  studyParticipantId: string;
}) {
  await runNavigoRotationImportStep({
    folio: row.folio,
    operation: () =>
      prisma.ctlTriangularRotationAssignment.upsert?.({
        create: {
          importedByUserId: actorUserId,
          sourceFileName: filename,
          studyParticipantId,
          triangular1Pr1: row.triangular1Pr1,
          triangular1Pr2: row.triangular1Pr2,
          triangular1Pr3: row.triangular1Pr3,
          triangular1Verify: row.triangular1Verify,
          triangular2Pr1: row.triangular2Pr1,
          triangular2Pr2: row.triangular2Pr2,
          triangular2Pr3: row.triangular2Pr3,
          triangular2Verify: row.triangular2Verify
        },
        update: {
          importedAt: new Date(),
          importedByUserId: actorUserId,
          sourceFileName: filename,
          triangular1Pr1: row.triangular1Pr1,
          triangular1Pr2: row.triangular1Pr2,
          triangular1Pr3: row.triangular1Pr3,
          triangular1Verify: row.triangular1Verify,
          triangular2Pr1: row.triangular2Pr1,
          triangular2Pr2: row.triangular2Pr2,
          triangular2Pr3: row.triangular2Pr3,
          triangular2Verify: row.triangular2Verify
        },
        where: { studyParticipantId }
      }) as Promise<unknown>,
    step: "ctl-triangular-rotation-assignment",
    userMessage: "No se pudo guardar la rotacion triangular CTL."
  });
}

async function upsertNavigoStudyProduct({
  displayLabel,
  folio,
  internalName,
  prisma,
  sampleKey,
  step = "study-product",
  studyId,
  userMessage = "No se pudo crear el producto de estudio."
}: {
  displayLabel: string;
  folio: string;
  internalName: string;
  prisma: NavigoTransactionClient;
  sampleKey: string;
  step?: string;
  studyId: string;
  userMessage?: string;
}) {
  return runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.studyProduct.upsert?.({
        create: {
          displayLabel,
          internalCode: sampleKey,
          isSensitive: true,
          realName: internalName,
          studyId
        },
        update: {
          displayLabel,
          isSensitive: true,
          realName: internalName
        },
        where: {
          studyId_internalCode: {
            internalCode: sampleKey,
            studyId
          }
        }
      }) as Promise<{ id: string }>,
    step,
    userMessage
  });
}

async function upsertNavigoStudyRotationPlan({
  firstProductId,
  folio,
  leftArmId,
  name,
  prisma,
  rightArmId,
  rotationCode,
  secondProductId,
  studyId
}: {
  firstProductId: string;
  folio: string;
  leftArmId: string;
  name: string;
  prisma: NavigoTransactionClient;
  rightArmId: string;
  rotationCode: string;
  secondProductId: string;
  studyId: string;
}) {
  const rotationPlan = await runNavigoRotationImportStep({
    folio,
    operation: () =>
      prisma.rotationPlan.upsert?.({
        create: {
          assignmentModeAllowed: "MANUAL",
          name,
          rotationCode,
          status: "ACTIVE",
          studyId
        },
        select: {
          id: true
        },
        update: {
          assignmentModeAllowed: "MANUAL",
          name,
          status: "ACTIVE"
        },
        where: {
          studyId_rotationCode: {
            rotationCode,
            studyId
          }
        }
      }) as Promise<{ id: string }>,
    step: "study-rotation-plan",
    userMessage: "No se pudo crear el plan de rotacion del estudio."
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
            studyArmId: leftArmId,
            studyProductId: firstProductId
          },
          {
            applicationOrder: 2,
            participantVisibleLabel: "Segunda fragancia",
            rotationPlanId: rotationPlan.id,
            studyArmId: rightArmId,
            studyProductId: secondProductId
          }
        ]
      });
      return { id: rotationPlan.id };
    },
    step: "study-rotation-plan-arms",
    userMessage: "No se pudieron guardar los brazos del plan de rotacion del estudio."
  });

  return rotationPlan;
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

async function loadNavigoStudyRotationConfiguration(
  prisma: NavigoPrismaClient | NavigoTransactionClient,
  studyId: string
): Promise<NavigoStudyRotationConfiguration> {
  const products = (await prisma.studyProduct.findMany?.({
    orderBy: { internalCode: "asc" },
    select: {
      displayLabel: true,
      id: true,
      internalCode: true,
      realName: true
    },
    where: { studyId }
  })) as Array<{ displayLabel: string; id: string; internalCode: string; realName: string }> | undefined;
  const rotationPlans = (await prisma.rotationPlan.findMany?.({
    orderBy: { rotationCode: "asc" },
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
          studyProduct: {
            select: {
              internalCode: true
            }
          }
        }
      },
      name: true,
      rotationCode: true
    },
    where: {
      status: "ACTIVE",
      studyId
    }
  })) as
    | Array<{
        arms: Array<{
          applicationOrder: number;
          participantVisibleLabel: string;
          studyProduct: { internalCode: string };
        }>;
        name: string;
        rotationCode: string;
      }>
    | undefined;

  return {
    samples: (products ?? []).map((product) => ({
      displayLabel: product.displayLabel,
      id: product.id,
      internalName: product.realName,
      sampleKey: product.internalCode
    })),
    rotations: (rotationPlans ?? []).map((plan) => ({
      arms: plan.arms.map((arm) => ({
        applicationOrder: arm.applicationOrder,
        participantVisibleLabel: arm.participantVisibleLabel,
        sampleKey: arm.studyProduct.internalCode
      })),
      name: plan.name,
      rotationCode: plan.rotationCode
    }))
  };
}

async function loadNavigoRotationFolioReservations(
  prisma: NavigoPrismaClient | NavigoTransactionClient,
  studyId: string
): Promise<NavigoRotationFolioReservation[]> {
  if (!prisma.navigoRotationFolioConfiguration?.findMany) {
    return [];
  }

  const configurations = (await prisma.navigoRotationFolioConfiguration.findMany({
    orderBy: { folio: "asc" },
    select: {
      firstFragrance: true,
      folio: true,
      importedAt: true,
      secondFragrance: true,
      sourceFileName: true,
      triangular1Pr1: true,
      triangular1Pr2: true,
      triangular1Pr3: true,
      triangular1Verify: true,
      triangular2Pr1: true,
      triangular2Pr2: true,
      triangular2Pr3: true,
      triangular2Verify: true,
    },
    where: { studyId }
  })) as Array<{
    firstFragrance: string;
    folio: string;
    importedAt: Date;
    secondFragrance: string;
    sourceFileName: string | null;
    triangular1Pr1: string;
    triangular1Pr2: string;
    triangular1Pr3: string;
    triangular1Verify: string;
    triangular2Pr1: string;
    triangular2Pr2: string;
    triangular2Pr3: string;
    triangular2Verify: string;
  }>;

  if (configurations.length === 0) {
    return [];
  }

  const confirmations = (await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      studyParticipant: {
        select: {
          ctlTriangularRotationAssignment: {
            select: {
              id: true
            }
          },
          id: true,
          rotationAssignment: {
            select: {
              id: true
            }
          }
        }
      }
    },
    where: {
      folio: {
        in: configurations.map((configuration) => configuration.folio)
      },
      studyId
    }
  })) as
    | Array<{
        folio: string;
        studyParticipant: {
          ctlTriangularRotationAssignment: { id: string } | null;
          id: string;
          rotationAssignment: { id: string } | null;
        };
      }>
    | undefined;

  const confirmationByFolio = new Map((confirmations ?? []).map((confirmation) => [confirmation.folio, confirmation]));

  return configurations.map((configuration) => {
    const confirmation = confirmationByFolio.get(configuration.folio);
    const isApplied = Boolean(
      confirmation?.studyParticipant.rotationAssignment && confirmation.studyParticipant.ctlTriangularRotationAssignment
    );

    return {
      firstFragrance: configuration.firstFragrance,
      folio: configuration.folio,
      importedAt: configuration.importedAt,
      secondFragrance: configuration.secondFragrance,
      sourceFileName: configuration.sourceFileName,
      status: isApplied ? "APPLIED_TO_PARTICIPANT" : "PENDING_PARTICIPANT",
      studyParticipantId: confirmation?.studyParticipant.id ?? null,
      triangular1: {
        pr1: configuration.triangular1Pr1,
        pr2: configuration.triangular1Pr2,
        pr3: configuration.triangular1Pr3,
        verify: configuration.triangular1Verify
      },
      triangular2: {
        pr1: configuration.triangular2Pr1,
        pr2: configuration.triangular2Pr2,
        pr3: configuration.triangular2Pr3,
        verify: configuration.triangular2Verify
      }
    };
  });
}

type NavigoStudyRotationPlanRecord = {
  arms: Array<{
    applicationOrder: number;
    participantVisibleLabel: string;
    studyArmId: string;
    studyProductId: string;
  }>;
  id: string;
  name: string;
  rotationCode: string;
};

async function assignNavigoRotationFromStudyConfig({
  actorUserId,
  participant,
  prisma
}: {
  actorUserId: string;
  participant: ParticipantRecord;
  prisma: NavigoTransactionClient;
}): Promise<NavigoMaintenanceResult> {
  if (participant.rotationAssignment) {
    return { message: "Rotacion existente conservada.", ok: true };
  }

  if (hasT0Started(participant)) {
    return { message: "No se puede asignar rotacion porque T0 ya fue iniciado.", ok: false };
  }

  const plans = ((await prisma.rotationPlan.findMany?.({
    orderBy: { rotationCode: "asc" },
    select: {
      arms: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
          studyArmId: true,
          studyProductId: true
        }
      },
      id: true,
      name: true,
      rotationCode: true
    },
    where: {
      status: "ACTIVE",
      studyId: participant.study.id
    }
  })) ?? []) as NavigoStudyRotationPlanRecord[];

  const validPlans = plans.filter((plan) => {
    const orders = plan.arms.map((arm) => arm.applicationOrder).sort();
    return plan.arms.length === 2 && orders[0] === 1 && orders[1] === 2;
  });

  if (validPlans.length === 0) {
    return { message: "No se puede liberar Navigo: configura las rotaciones del estudio.", ok: false };
  }

  const assignments = ((await prisma.participantRotationAssignment.findMany?.({
    select: {
      rotationPlanId: true
    },
    where: {
      rotationPlanId: {
        in: validPlans.map((plan) => plan.id)
      }
    }
  })) ?? []) as Array<{ rotationPlanId: string }>;
  const usageByPlan = new Map<string, number>();
  for (const assignment of assignments) {
    usageByPlan.set(assignment.rotationPlanId, (usageByPlan.get(assignment.rotationPlanId) ?? 0) + 1);
  }
  const selected = [...validPlans].sort((left, right) => {
    const usageDelta = (usageByPlan.get(left.id) ?? 0) - (usageByPlan.get(right.id) ?? 0);
    return usageDelta !== 0 ? usageDelta : left.rotationCode.localeCompare(right.rotationCode);
  })[0];

  if (!selected) {
    return { message: "No se pudo resolver una rotacion valida para Navigo.", ok: false };
  }

  const rotationAssignment = (await prisma.participantRotationAssignment.upsert?.({
    create: {
      assignedByUserId: actorUserId,
      assignmentMode: "AUTOMATIC",
      rotationCode: selected.rotationCode,
      rotationPlanId: selected.id,
      studyParticipantId: participant.id
    },
    select: { id: true },
    update: {},
    where: {
      studyParticipantId: participant.id
    }
  })) as { id: string };

  for (const arm of selected.arms) {
    await prisma.participantArmAssignment.upsert?.({
      create: {
        applicationOrder: arm.applicationOrder,
        participantRotationAssignmentId: rotationAssignment.id,
        participantVisibleLabel: arm.participantVisibleLabel,
        studyArmId: arm.studyArmId,
        studyParticipantId: participant.id,
        studyProductId: arm.studyProductId
      },
      update: {
        applicationOrder: arm.applicationOrder,
        participantRotationAssignmentId: rotationAssignment.id,
        participantVisibleLabel: arm.participantVisibleLabel,
        studyProductId: arm.studyProductId
      },
      where: {
        studyParticipantId_studyArmId: {
          studyArmId: arm.studyArmId,
          studyParticipantId: participant.id
        }
      }
    });
  }

  return { message: "Rotacion asignada desde configuracion del estudio.", ok: true };
}

async function deleteNavigoAppOwnedRelations(
  tx: NavigoTransactionClient,
  studyParticipantId: string
) {
  const activities = (await tx.participantActivity.findMany?.({
    select: { id: true },
    where: { studyParticipantId }
  })) as Array<{ id: string }> | undefined;
  const activityIds = (activities ?? []).map((activity) => activity.id);

  if (activityIds.length > 0) {
    await tx.researchResponse.deleteMany?.({
      where: { participantActivityId: { in: activityIds } }
    });
    await tx.participantActivityEvidence.deleteMany?.({
      where: { participantActivityId: { in: activityIds } }
    });
    await tx.reminderLog?.deleteMany?.({
      where: { participantActivityId: { in: activityIds } }
    });
    await tx.mediaEvidencePlaceholder?.deleteMany?.({
      where: { participantActivityId: { in: activityIds } }
    });
    await tx.participantActivity.deleteMany?.({
      where: { id: { in: activityIds } }
    });
  }

  await tx.applicationTimeEvent.deleteMany?.({
    where: { studyParticipantId }
  });
  await tx.participantAttributeOrder?.deleteMany?.({
    where: { studyParticipantId }
  });
  await tx.participantArmAssignment.deleteMany?.({
    where: { studyParticipantId }
  });
  await tx.participantRotationAssignment.deleteMany?.({
    where: { studyParticipantId }
  });
  await tx.participantAccessToken.deleteMany?.({
    where: { studyParticipantId }
  });
  await tx.ctlSession?.deleteMany?.({
    where: { studyParticipantId }
  });
}

async function deleteDirectNavigoScreeningRelations(
  tx: NavigoTransactionClient,
  input: {
    confirmationId: string;
    screeningAttemptId: string;
    studyParticipantId: string;
  }
) {
  await tx.participantReferenceCode.deleteMany?.({
    where: { confirmationId: input.confirmationId }
  });
  await tx.participantConfirmation.deleteMany?.({
    where: { id: input.confirmationId }
  });
  await tx.participantScreeningReview?.deleteMany?.({
    where: { screeningAttemptId: input.screeningAttemptId }
  });
  await tx.participantEvidence.deleteMany?.({
    where: {
      screeningAttemptId: input.screeningAttemptId,
      studyParticipantId: input.studyParticipantId
    }
  });
  await tx.screeningAnswer?.deleteMany?.({
    where: { screeningAttemptId: input.screeningAttemptId }
  });
  await tx.screeningAttempt.deleteMany?.({
    where: { id: input.screeningAttemptId }
  });
}

async function findUnsupportedNavigoParticipantDeleteRelations(
  tx: NavigoTransactionClient,
  input: {
    screeningAttemptId: string;
    studyParticipantId: string;
  }
): Promise<string[]> {
  const blockers: string[] = [];
  const extraAttempts = (await tx.screeningAttempt.findMany?.({
    select: { id: true },
    where: {
      id: { not: input.screeningAttemptId },
      studyParticipantId: input.studyParticipantId
    }
  })) as Array<{ id: string }> | undefined;

  if ((extraAttempts ?? []).length > 0) {
    blockers.push("screening_attempts adicionales");
  }

  const extraParticipantEvidence = (await tx.participantEvidence.findMany?.({
    select: { id: true },
    where: {
      screeningAttemptId: { not: input.screeningAttemptId },
      studyParticipantId: input.studyParticipantId
    }
  })) as Array<{ id: string }> | undefined;

  if ((extraParticipantEvidence ?? []).length > 0) {
    blockers.push("participant_evidence fuera de App Navigo");
  }

  const participantConsents = (await tx.participantConsent?.findMany?.({
    select: { id: true },
    where: { studyParticipantId: input.studyParticipantId }
  })) as Array<{ id: string }> | undefined;

  if ((participantConsents ?? []).length > 0) {
    blockers.push("participant_consents");
  }

  const quotaEvaluations = (await tx.quotaEvaluation?.findMany?.({
    select: { id: true },
    where: { studyParticipantId: input.studyParticipantId }
  })) as Array<{ id: string }> | undefined;

  if ((quotaEvaluations ?? []).length > 0) {
    blockers.push("quota_evaluations");
  }

  return blockers;
}

async function deleteParticipantProfileIfOrphan(
  tx: NavigoTransactionClient,
  participantProfile: ParticipantRecord["participantProfile"]
): Promise<boolean> {
  if (participantProfile.participantAuthUserId) {
    return true;
  }

  const remainingParticipations = (await tx.studyParticipant.findMany?.({
    select: { id: true },
    where: { participantProfileId: participantProfile.id }
  })) as Array<{ id: string }> | undefined;

  if ((remainingParticipations ?? []).length > 0) {
    return true;
  }

  await tx.participantProfile.deleteMany?.({
    where: { id: participantProfile.id }
  });

  return false;
}

function isNavigoDirectScreeningAttempt(
  screeningAttempt: { evaluationJson: unknown; id: string; source?: string } | null
): boolean {
  if (!screeningAttempt || screeningAttempt.source !== "FIELD") {
    return false;
  }

  const metadata = screeningAttempt.evaluationJson;

  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "directSource" in metadata &&
    metadata.directSource === "APP_NAVIGO_DIRECT"
  );
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
  const publicRequestOrigin = resolvePublicLinkOrigin(requestOrigin);
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
      ? new URL(`/p/${encodeURIComponent(participantLinkToken)}/activities`, publicRequestOrigin).toString()
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
    const code = getPrismaErrorCode(error);
    throw new NavigoRotationApplyError({
      code,
      folio,
      logMessage: sanitizeRotationImportLogMessage(error),
      message: buildNavigoRotationStepErrorMessage({ code, step, userMessage }),
      step
    });
  }
}

function buildNavigoRotationStepErrorMessage({
  code,
  step,
  userMessage
}: {
  code?: string;
  step: string;
  userMessage: string;
}): string {
  if (code === "P2002" && step.startsWith("study-arm-")) {
    return "No se pudo guardar la rotacion porque ya existe un brazo con ese orden. Actualiza la configuracion e intenta nuevamente.";
  }

  return code ? "Error de base de datos al guardar la rotacion. Revisa logs." : userMessage;
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
    case "navigo-rotation-folio-configuration":
      return "no se pudo guardar NavigoRotationFolioConfiguration.";
    case "ctl-triangular-rotation-assignment":
      return "no se pudo guardar CtlTriangularRotationAssignment.";
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
    latestReminder: getLatestNavigoEvaluationReminder(activity),
    readableResponses: createReadableNavigoResponses(activity.responses),
    reopenedAt: activity.reopenedAt ?? null,
    reopenedBy: activity.reopenedBy ?? null,
    reopenedByUserId: activity.reopenedByUserId ?? null,
    reopenReason: activity.reopenReason ?? null,
    responseCount: countNavigoMeasurementResponses(activity.responses)
  };
}

function getLatestNavigoEvaluationReminder(activity: ActivityRecord): NavigoActivityListItem["latestReminder"] {
  const activityCode = isSupportedNavigoActivityCode(activity.activitySchedule.code)
    ? activity.activitySchedule.code
    : null;

  if (!activityCode) {
    return null;
  }

  const reminders = (activity.reminders ?? [])
    .filter((reminder) => isNavigoEvaluationReminderLog(reminder.metadataJson, activityCode))
    .sort((left, right) => {
      const leftTime = (left.sentAt ?? left.scheduledFor)?.getTime() ?? 0;
      const rightTime = (right.sentAt ?? right.scheduledFor)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  const latest = reminders[0] ?? null;

  if (!latest) {
    return null;
  }

  return {
    sentAt: latest.sentAt ?? latest.scheduledFor,
    source: readReminderSource(latest.metadataJson),
    status: latest.status
  };
}

function toNavigoActivityRecord(activity: ActivityRecord): NavigoActivityRecord & { code: NavigoActivityCode } {
  const identityStatus = readNavigoIdentityStatusFromResponses(activity.responses);
  const responseCount = countNavigoMeasurementResponses(activity.responses);
  const isInitialEvaluation = isInitialNavigoEvaluation(activity.activitySchedule.code);
  const code = isSupportedNavigoActivityCode(activity.activitySchedule.code)
    ? activity.activitySchedule.code
    : NAVIGO_ACTIVITY_CODES[0];
  const isIncompleteT0 = isInitialEvaluation && !isNavigoT0Complete({
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
    code,
    id: activity.id,
    identityStatus: isInitialEvaluation ? identityStatus : undefined,
    identityReviewStatus: getActivitySelfie(activity)?.reviewStatus,
    occurrenceKey: activity.occurrenceKey,
    reopenedAt: activity.reopenedAt ?? null,
    reopenedByUserId: activity.reopenedByUserId ?? null,
    reopenReason: activity.reopenReason ?? null,
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

  if (!hasCompletedCtlSession(participant)) {
    return { message: "Pendiente para iniciar T0: completar CTL presencial.", ok: false };
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

  if (!hasCompletedCtlSession(participant)) {
    return {
      message: "Tu evaluacion presencial aun no ha sido completada. Espera indicaciones de tu encuestador.",
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

function validateParticipantForCtlRelease(participant: ParticipantRecord): NavigoMaintenanceResult {
  if (participant.study.code !== NAVIGO_STUDY_CODE) {
    return { message: "Solo el estudio Navigo puede liberarse desde CTL.", ok: false };
  }

  if (!participant.participantConfirmation) {
    return { message: "No se puede liberar Navigo porque falta folio.", ok: false };
  }

  if (participant.participantConfirmation.referenceCodes.length < 3) {
    return { message: "No se puede liberar Navigo porque faltan codigos asignados.", ok: false };
  }

  if (participantStatus(participant) !== "APPROVED" && participantStatus(participant) !== "CONFIRMED") {
    return { message: "No se puede liberar Navigo porque el participante no esta aprobado.", ok: false };
  }

  if (!hasCompletedCtlSession(participant)) {
    return { message: "No se puede liberar Navigo porque CTL no esta completado.", ok: false };
  }

  return { message: "ok", ok: true };
}

function hasCompletedCtlSession(participant: Pick<ParticipantRecord, "ctlSessions">): boolean {
  return (participant.ctlSessions ?? []).some((session) => session.status === "COMPLETED");
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
  participant: Pick<ParticipantRecord, "study" | "visualVerificationMode">
): NavigoVisualVerificationMode {
  if (participant.visualVerificationMode) {
    return resolveNavigoVisualVerificationMode(participant.visualVerificationMode);
  }

  if (!resolveNavigoFaceVerificationRequiredForStudy(participant.study)) {
    return "disabled";
  }

  return resolveNavigoVisualVerificationMode(process.env.NAVIGO_VISUAL_VERIFICATION_MODE);
}

function resolveNavigoFaceVerificationRequiredForStudy(study: Pick<NavigoStudySummary, "code">): boolean {
  if (study.code === NAVIGO_STUDY_CODE) {
    return false;
  }

  return true;
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
    return isInitialNavigoEvaluation(activity.activitySchedule.code) ? "reference_capture" : null;
  }

  return isInitialNavigoEvaluation(activity.activitySchedule.code) ? null : "activity_verification";
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

  if (isInitialNavigoEvaluation(activity.activitySchedule.code) && hasRegisteredSelfie(participant)) {
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

  if (!hasRegisteredSelfie(participant) && !isInitialNavigoEvaluation(activity.activitySchedule.code)) {
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

function hasActivitySelfie(activity: Pick<ActivityRecord, "id" | "participantActivityEvidence">): boolean {
  return activity.participantActivityEvidence.some(
    (evidence) =>
      evidence.participantActivityId === activity.id &&
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
  if (!blockedByCode) {
    return "Completa primero la evaluacion anterior.";
  }

  if (blockedByCode === "T0_15_MIN") {
    return "Completa primero la evaluacion T0 de 15 minutos.";
  }

  if (blockedByCode === "T3_HORAS") {
    return "Completa primero la evaluacion de 3 horas.";
  }

  if (blockedByCode === "T4_5_HORAS") {
    return "Completa primero la evaluacion de 4.5 horas.";
  }

  if (blockedByCode === "T6_HORAS") {
    return "Completa primero la evaluacion de 6 horas.";
  }

  if (blockedByCode === "T2_HORAS") {
    return "Completa primero la evaluacion historica de 2 horas.";
  }

  if (blockedByCode === "T4_HORAS") {
    return "Completa primero la evaluacion historica de 4 horas.";
  }

  return "La evaluacion inicial aun no esta completa.";
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

  if (isInitialNavigoEvaluation(activity.activitySchedule.code)) {
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
