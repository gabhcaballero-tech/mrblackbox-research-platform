import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { formatDateTimeMexicoCity, MEXICO_CITY_TIME_ZONE } from "@/shared/utils/date-format";
import { DEFAULT_PUBLIC_APP_ORIGIN, resolveConfiguredPublicOrigin, resolvePublicLinkOrigin } from "@/shared/utils/request-origin";
import {
  applyHutMissedDay,
  applyHutVideoSubmission,
  buildHutTsv,
  createHutParticipantToken,
  createHutRegistrationToken,
  getHutCurrentAvailability,
  HUT_MAX_BLOCK_CALENDAR_DAYS,
  HUT_MAX_MISSED_DAYS_PER_BLOCK,
  HUT_REQUIRED_VIDEOS_PER_BLOCK,
  nextHutBlockDayNumber,
  nextHutVideoSequence,
  hutLocalDateKey,
  normalizeHutEmail,
  normalizeHutPhone,
  normalizeHutText,
  normalizeOptionalHutText,
  getHutQuestionTerminationDecision,
  parseHutQuestionAnswer,
  parseHutParticipantImportText,
  parseHutRegistrationSlotImportText,
  participantStatusForStartedBlock,
  type HutAnswerInput,
  type HutBlockStatus,
  type HutCallEvaluationStatus,
  type HutParticipantStatus
} from "./service";
import {
  getHutApplicableQuestions,
  getHutQuestionPairRotationAudit,
  getHutQuestions,
  getHutV5Definition,
  orderHutQuestionsForParticipant,
  type HutQuestionnaireSectionId
} from "./definition";
import {
  assertHutApplicationPhotoStorageKey,
  assertHutSelfieStorageKey,
  assertHutRegistrationSelfieStorageKey,
  assertHutVideoStorageKey,
  createHutSignedApplicationPhotoUpload,
  createHutSignedDailySelfieUpload,
  createHutSignedRegistrationSelfieUpload,
  createHutSignedReferenceSelfieUpload,
  createHutSignedVideoUpload,
  HUT_VIDEO_BUCKET,
  type HutApplicationPhotoUploadMetadata,
  type HutSignedApplicationPhotoUpload,
  type HutSelfieUploadMetadata,
  type HutSignedSelfieUpload,
  type HutSignedVideoUpload,
  type HutStorageClient,
  type HutVideoUploadMetadata
} from "./storage";
import { createSupabaseEvidenceStorageClient } from "@/modules/participant-portal/evidence-storage";
import {
  normalizeNavigoFaceVerificationForStorage,
  type NavigoFaceVerificationClientResult
} from "@/modules/navigo-app/face-verification-contract";
import {
  createOneuiWhatsAppRepository,
  publicOriginValidationAuditMetadata,
  sendHutCompletionWhatsApp,
  sendHutPhotoReminderWhatsApp,
  sendHutRegistrationWhatsApp,
  WHATSAPP_CONFIGURATION_MISSING_PUBLIC_ORIGIN,
  WHATSAPP_INVALID_PUBLIC_ORIGIN,
  type OneuiWhatsAppRepository
} from "@/modules/oneui-whatsapp";
import { whatsappAutomationStatusFromMessage, type WhatsAppAutomationStatus } from "@/modules/oneui-whatsapp/templates";
import {
  decryptHutPhaseCode,
  encryptHutPhaseCode,
  generateHutPhaseCode,
  hashHutPhaseCode,
  hutSlotForPhase,
  normalizeHutPhaseCode,
  resolveHutOperationalCode,
  resolveHutOperationalStageCode,
  resolveHutPhaseCodeSecret,
  type HutPhase,
  type HutPhaseCodeStatus
} from "./phase-codes";
import {
  buildHutPhotoTimeline,
  getHutPhotoTimelineSlotDefinition,
  getNextHutPhotoTimelineSlot,
  getNextPendingHutPhotoTimelineSlot,
  isLegacyMirroredPlacementPhoto,
  type HutPhotoTimelineManualOverride,
  type HutPhotoTimelineSlotId
} from "./photo-timeline";
import {
  HUT_SECOND_PRODUCT_RELEASED_REASON,
  getSecondProductReleaseWarnings,
  hasLegacySecondProductProgress,
  isSecondProductReleased,
  isSecondProductReleaseAuditJson,
  type HutSecondProductReleaseSummary
} from "./second-product-release";
import {
  getSecondStageAuthorizationWarnings,
  hasLegacyFirstPerfumeEvaluationProgress,
  HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING,
  HUT_SECOND_STAGE_AUTHORIZED_REASON,
  isSecondStageAuthorizationAuditJson,
  isSecondStageAuthorized,
  type HutSecondStageAuthorizationSummary
} from "./second-stage-authorization";
import { isHutOperationalPanelSection } from "./progress";
import {
  getThirdStageAuthorizationWarnings,
  HUT_THIRD_STAGE_AUTHORIZED_REASON,
  isThirdStageAuthorizationAuditJson,
  isThirdStageAuthorized,
  type HutThirdStageAuthorizationSummary
} from "./third-stage-authorization";

export type HutActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string };

export type HutPhaseCodeSummary = {
  created: number;
  existing: number;
  inconsistencies: string[];
};

export type HutPhaseCodeAdmin = {
  expiresAt: Date | null;
  label: string;
  legacySlot?: number | null;
  operationalSlot?: 1 | 2 | 3 | null;
  operationalSource?: "HISTORICAL_PHASE_CODE" | "MASTER_REFERENCE_CODE" | "NONE";
  phase: HutPhase;
  sentAt: Date | null;
  slot: number;
  status: HutPhaseCodeStatus | "MISSING";
  updatedAt: Date | null;
  usedAt: Date | null;
  validatedAt: Date | null;
};

export type HutStudySummary = {
  code: string;
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
  timeZoneIana: string;
};

export type HutAdminParticipant = {
  applicationEvidence: HutApplicationEvidenceAdmin[];
  applicationPhotoEntries: HutApplicationPhotoEntryAdmin[];
  availability: {
    blockNumber?: number;
    expectedVideoSequence?: number;
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: HutBlockSummary | null;
  block2: HutBlockSummary | null;
  call1: HutCallSummary | null;
  call2: HutCallSummary | null;
  currentBlockNumber: number;
  currentVideoSequence: number;
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  identityReview: HutIdentityReviewSummary;
  link: string;
  legacyMirroredPlacementPhoto: boolean;
  name: string;
  phone: string | null;
  origin: "CLT_HUT" | "HUT_DIRECTO";
  photoSlotOverrides: HutPhotoTimelineManualOverride[];
  product2GateOpen: boolean;
  recruiter: string | null;
  phaseCodes: HutPhaseCodeAdmin[];
  protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  questionnaire: HutQuestionnaireAdminSummary | null;
  reminderPending: boolean;
  referenceSelfie: {
    capturedAt: Date;
    signedUrl: string | null;
    status: "COMPLETE" | "MISSING";
  };
  registrationSlot: {
    folio: string;
    id: string;
    status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  } | null;
  secondFragranceRightArm: string | null;
  secondStageAuthorization: HutSecondStageAuthorizationSummary | null;
  secondProductRelease: HutSecondProductReleaseSummary | null;
  thirdStageAuthorization: HutThirdStageAuthorizationSummary | null;
  status: HutParticipantStatus;
  studyParticipantId: string | null;
  testMode: boolean;
  token: string;
  usedToleranceInCurrentBlock: boolean;
  visualOverrideEnabled: boolean;
  whatsappRegistration: WhatsAppAutomationStatus;
  warnings: HutOperationalCompatibilityWarning[];
};

export type HutOperationalCompatibilityWarning = typeof HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING;

export type HutRegistrationSlotAdmin = {
  email: string | null;
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  link: string;
  participantId: string | null;
  participantLink: string | null;
  participantName: string | null;
  phone: string | null;
  referenceSelfieStatus: "COMPLETE" | "MISSING";
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
};

export type HutBlockSummary = {
  blockNumber: number;
  disqualificationReason: string | null;
  missedDaysCount: number;
  status: HutBlockStatus;
  submittedVideosCount: number;
  videos: HutVideoSummary[];
};

export type HutCallSummary = {
  blockNumber: number;
  completedAt: Date | null;
  evaluatorName: string | null;
  notes: string | null;
  status: HutCallEvaluationStatus;
};

export type HutApplicationEvidenceAdmin = {
  capturedAt: Date;
  phase: HutPhase;
  privateStorageKey?: string | null;
  productCode: string | null;
  signedUrl: string | null;
};

export type HutApplicationPhotoEntryAdmin = {
  capturedAt: Date;
  capturedLocalDate: string;
  capturedLocalTimezone: string;
  privateStorageKey?: string | null;
  productCode: string | null;
  signedUrl: string | null;
  useDayNumber: number;
};

export type HutQuestionnaireAttemptSummary = {
  completedAt: Date | null;
  id: string;
  participantId: string;
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING" | "TERMINATED";
  terminatedAt: Date | null;
  terminationReason: string | null;
};

export type HutQuestionnaireProgressSummary = {
  attemptId: string;
  completedAt: Date | null;
  section: HutQuestionnaireSectionId;
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
};

export type HutQuestionnaireState = {
  answers: Record<string, unknown>;
  applicableQuestionCodes: string[];
  attempt: HutQuestionnaireAttemptSummary;
  filterStatus: "COMPLETED" | "PENDING" | "REJECTED";
  omittedQuestionCodes: string[];
  participantOrigin: "CLT_HUT" | "HUT_DIRECTO";
  visits: HutQuestionnaireProgressSummary[];
};

export type HutQuestionnaireAdminAnswer = {
  answerValue: unknown;
  label: string;
  questionCode: string;
  section: HutQuestionnaireSectionId | null;
};

export type HutQuestionnaireAdminSummary = {
  answeredRequired: number;
  answers: HutQuestionnaireAdminAnswer[];
  attempt: HutQuestionnaireAttemptSummary;
  omittedQuestionCodes: string[];
  totalRequired: number;
  visits: HutQuestionnaireProgressSummary[];
};

export type HutApplicationPhotoEntrySummary = {
  capturedAt: Date;
  capturedLocalDate: string;
  capturedLocalTimezone: string;
  id: string;
  privateStorageKey?: string | null;
  productCode: string | null;
  useDayNumber: number;
};

export type HutPhotoReminderSendResult = {
  generatedAt: Date;
  hutUrl: string;
  phone: string;
  slotId: HutPhotoTimelineSlotId;
  templateName: string;
  whatsappError: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: "ERROR" | "ENVIADO";
};

export type HutPhotoReminderProcessResult = {
  failed: Array<{ message: string; participantId: string; slotId: HutPhotoTimelineSlotId | null }>;
  processed: number;
  sent: number;
  skipped: number;
};

type HutPhotoReminderExclusionReason =
  | "DELIVERY_NOT_REMINDABLE"
  | "HUT_COMPLETED"
  | "HUT_DISQUALIFIED"
  | "NOT_APPLICATION_PHOTO"
  | "NO_STARTED"
  | "OUTSIDE_OPERATIONAL_WINDOW"
  | "PHONE_MISSING"
  | "QA_PARTICIPANT"
  | "RECENT_REMINDER"
  | "SLOT_NOT_AVAILABLE"
  | "WAITING_CLT"
  | "WAITING_DELIVERY";

export type HutApplicationPhotoDailyAvailability = {
  available: boolean;
  capturedLocalDate: string;
  existingEntry: HutApplicationPhotoEntrySummary | null;
  nextAvailableLocalDate: string | null;
  reason:
    | "AVAILABLE"
    | "FILTER_PENDING"
    | "LEGACY_PROTOCOL"
    | "PHOTO_ALREADY_CAPTURED_TODAY"
    | "RESERVED_WITHOUT_OPERATIONAL_IDENTITY"
    | "WAIT_UNTIL_NEXT_DAY";
  slotId: HutPhotoTimelineSlotId | null;
};

export type HutFieldPhotoSummary = {
  capturedAt: Date;
  capturedLocalDate: string | null;
  phase: HutPhase | null;
  productCode: string | null;
  signedUrl: string | null;
  source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
  useDayNumber: number | null;
};

export type HutFieldQuestionnaireWorkspace = {
  participant: {
    email: string | null;
    hutFolio: string | null;
    id: string;
    name: string;
    navFolio: string | null;
    origin: "CLT_HUT" | "HUT_DIRECTO";
    phone: string | null;
    protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
    status: HutParticipantStatus;
    studyId: string;
    testMode: boolean;
  };
  phaseCodes: HutPhaseCodeAdmin[];
  photos: HutFieldPhotoSummary[];
  photoSlotOverrides: HutPhotoTimelineManualOverride[];
  product2GateOpen: boolean;
  secondStageAuthorized: boolean;
  thirdStageAuthorized: boolean;
  questionnaire: HutQuestionnaireState;
  legacyMirroredPlacementPhoto: boolean;
  rotation: {
    eva1: string | null;
    eva2: string | null;
  };
  warnings: HutOperationalCompatibilityWarning[];
};

export type HutVideoSummary = {
  sequenceNumber: number;
  signedUrl: string | null;
  status: string;
  submittedAt: Date | null;
};

export type HutIdentityReviewItem = {
  attemptSignedUrl: string | null;
  blockNumber: number;
  reviewLabel: string;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  sequenceNumber: number;
  similarityPercentage: number | null;
  status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
  verificationDate: Date | null;
  verificationId: string | null;
  reviewNotes: string | null;
};

export type HutIdentityReviewSummary = {
  items: HutIdentityReviewItem[];
  lastReviewedAt: Date | null;
  lastStatus: string | null;
  referenceSignedUrl: string | null;
  summaryLabel: "FALLIDA" | "OK" | "PENDIENTE" | "REVISION_REQUERIDA" | "SIN_SELFIE_BASE";
};

export type HutAdminDashboard = {
  participants: HutAdminParticipant[];
  reservedNavReconciliation: HutReservedNavReconciliationPreview;
  registrationSlots: HutRegistrationSlotAdmin[];
  study: HutStudySummary;
};

export type HutReservedNavReconciliationRow = {
  canApply: boolean;
  currentName: string | null;
  currentOrigin: "CLT_HUT" | "HUT_DIRECTO";
  eva1: string | null;
  eva2: string | null;
  existingPhotoCount: number;
  existingPhaseCount: number;
  hutFolio: string;
  hutParticipantId: string;
  navEmail: string | null;
  navFolio: string;
  navName: string | null;
  navPhone: string | null;
  navStudyParticipantId: string | null;
  nextOrigin: "CLT_HUT";
  reason: string;
  registrationSlotId: string | null;
  studyParticipantId: string | null;
};

export type HutReservedNavReconciliationPreview = {
  rows: HutReservedNavReconciliationRow[];
  summary: {
    alreadyLinked: number;
    applicable: number;
    blocked: number;
    missingNav: number;
    missingSlot: number;
    total: number;
  };
};

export type HutRegistrationView = {
  firstFragranceLeftArm: string;
  folio: string;
  participantLink: string | null;
  participantName: string | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  studyName: string;
};

export type HutPortalView = {
  applicationEvidence: Array<{
    capturedAt: Date;
    phase: HutPhase;
    productCode: string | null;
  }>;
  applicationPhotoEntries: Array<{
    capturedAt: Date;
    capturedLocalDate: string;
    productCode: string | null;
    useDayNumber: number;
  }>;
  availableApplicationPhoto: {
    phase: HutPhase;
    productCode: string | null;
    slotId: HutPhotoTimelineSlotId;
  } | null;
  availableUpload: {
    blockNumber: number;
    sequenceNumber: number;
  } | null;
  availability: {
    blockNumber?: number;
    expectedVideoSequence?: number;
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: HutBlockSummary | null;
  block2: HutBlockSummary | null;
  folio: string | null;
  message: string;
  name: string;
  legacyMirroredPlacementPhoto: boolean;
  operationalIdentityMissing: boolean;
  phaseGate: {
    label: string;
    phase: HutPhase;
    required: boolean;
    status: HutPhaseCodeStatus | "MISSING";
  } | null;
  participantId: string;
  origin: "CLT_HUT" | "HUT_DIRECTO";
  photoSlotOverrides: HutPhotoTimelineManualOverride[];
  product2GateOpen: boolean;
  protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  status: HutParticipantStatus;
  studyName: string;
  testMode: boolean;
  token: string;
  rotation: {
    firstFragranceLeftArm: string | null;
    secondFragranceRightArm: string | null;
  };
};

export type HutRepository = {
  completeCallEvaluation: (input: {
    blockNumber: 1 | 2;
    evaluatorName?: string | null;
    notes?: string | null;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  createParticipant: (input: {
    email?: string | null;
    firstFragranceLeftArm?: string | null;
    folio?: string | null;
    name: string;
    phone?: string | null;
    recruiter?: string | null;
    requestOrigin: string;
    secondFragranceRightArm?: string | null;
    slotId?: string | null;
    startDate?: Date | null;
    studyId: string;
    protocolVersion?: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  }) => Promise<HutActionResult<{ link: string; participantId: string }>>;
  createRegistrationSlot: (input: {
    firstFragranceLeftArm: string;
    folio: string;
    requestOrigin: string;
    secondFragranceRightArm: string;
    studyId: string;
  }) => Promise<HutActionResult<{ link: string; slotId: string }>>;
  exportProgress: (input: {
    now?: Date;
    requestOrigin: string;
    studyId: string;
  }) => Promise<HutActionResult<{ body: string; filename: string }>>;
  getAdminDashboard: (input: {
    requestOrigin: string;
    storage?: HutStorageClient;
    studyId: string;
  }) => Promise<HutAdminDashboard | null>;
  getPortalView: (token: string) => Promise<HutActionResult<HutPortalView>>;
  getQuestionnaireState: (input: {
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<HutQuestionnaireState>>;
  getQuestionnaireStateByToken: (token: string) => Promise<HutActionResult<HutQuestionnaireState>>;
  getRegistrationView: (token: string, requestOrigin: string) => Promise<HutActionResult<HutRegistrationView>>;
  ensureQuestionnaireAttempt: (input: {
    now?: Date;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<HutQuestionnaireAttemptSummary>>;
  ensureQuestionnaireSectionProgress: (input: {
    attemptId?: string;
    now?: Date;
    participantId: string;
    section: HutQuestionnaireSectionId;
    studyId: string;
  }) => Promise<HutActionResult<HutQuestionnaireProgressSummary>>;
  importParticipants: (input: {
    requestOrigin: string;
    startDate?: Date | null;
    studyId: string;
    text: string;
  }) => Promise<HutActionResult<{ created: number; skipped: number }>>;
  importRegistrationSlots: (input: {
    requestOrigin: string;
    studyId: string;
    text: string;
  }) => Promise<HutActionResult<{ created: number; skipped: number }>>;
  markMissedDay: (input: {
    participantId: string;
    reminderSent?: boolean;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  syncParticipantProfileFromLinkedNav: (input: {
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{
    email: string | null;
    name: string;
    participantId: string;
    phone: string | null;
  }>>;
  previewReservedHutNavReconciliation: (input: {
    studyId: string;
  }) => Promise<HutActionResult<HutReservedNavReconciliationPreview>>;
  reconcileReservedHutNavParticipants: (input: {
    confirmation: string;
    studyId: string;
  }) => Promise<HutActionResult<{ skipped: number; updated: number }>>;
  reconcileReservedHutParticipantForStudyParticipant: (input: {
    studyParticipantId: string;
  }) => Promise<HutActionResult<{ hutFolio: string | null; participantId: string | null; updated: boolean }>>;
  resetReferenceSelfie: (input: {
    confirmation: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  resetVideoSubmission: (input: {
    blockNumber: 1 | 2;
    confirmation: string;
    participantId: string;
    sequenceNumber: number;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  resetCallEvaluation: (input: {
    blockNumber: 1 | 2;
    confirmation: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  resetApplicationPhotoEvidence: (input: {
    actorUserId: string;
    confirmation: string;
    participantId: string;
    phase: HutPhase;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; phase: HutPhase }>>;
  resetQuestionnaireAttempt: (input: {
    actorUserId: string;
    confirmation: string;
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  authorizeSecondStage: (input: {
    accessCode?: string | null;
    accessType: "ADMIN" | "ENCUESTADOR" | "SUPERVISOR";
    actorUserId?: string | null;
    code: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ authorizedAt: Date; participantId: string }>>;
  authorizeThirdStage: (input: {
    accessCode?: string | null;
    accessType: "ADMIN" | "ENCUESTADOR" | "SUPERVISOR";
    actorUserId?: string | null;
    code: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ authorizedAt: Date; participantId: string }>>;
  assignParticipantRotation: (input: {
    firstFragranceLeftArm?: string | null;
    folio?: string | null;
    participantId: string;
    secondFragranceRightArm?: string | null;
    slotId?: string | null;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  deleteParticipant: (input: {
    confirmation: string;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  reactivateParticipant: (input: {
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  requestVideoUpload: (input: {
    metadata: HutVideoUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedVideoUpload>>;
  requestReferenceSelfieUpload: (input: {
    actorUserId: string;
    metadata: HutSelfieUploadMetadata;
    participantId: string;
    requestOrigin: string;
    storage?: HutStorageClient;
    studyId: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload>>;
  confirmReferenceSelfieUpload: (input: {
    actorUserId: string;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    participantId: string;
    requestOrigin: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  requestRegistrationSelfieUpload: (input: {
    metadata: HutSelfieUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload>>;
  completeRegistration: (input: {
    email?: string | null;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    name: string;
    phone: string;
    recruiter?: string | null;
    requestOrigin: string;
    token: string;
  }) => Promise<HutActionResult<{ participantLink: string; participantId: string }>>;
  sendRegistrationWhatsApp: (input: {
    force?: boolean;
    participantId: string;
    requestOrigin: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  sendPhotoReminderWhatsApp: (input: {
    actorUserId: string;
    now?: Date;
    participantId: string;
    reason?: string;
    requestOrigin: string;
    source?: "MANUAL_ADMIN" | "MANUAL_SUPPORT";
    studyId: string;
  }) => Promise<HutActionResult<HutPhotoReminderSendResult>>;
  processPhotoWhatsAppReminders: (input: {
    now?: Date;
    requestOrigin: string;
    studyId?: string;
  }) => Promise<HutActionResult<HutPhotoReminderProcessResult>>;
  requestDailySelfieUpload: (input: {
    metadata: HutSelfieUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload & { referenceSelfieSignedUrl: string }>>;
  requestApplicationPhotoUpload: (input: {
    metadata: HutApplicationPhotoUploadMetadata;
    now?: Date;
    slotId?: HutPhotoTimelineSlotId | null;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedApplicationPhotoUpload & { phase: HutPhase; productCode: string | null }>>;
  confirmDailySelfieUpload: (input: {
    faceVerification?: NavigoFaceVerificationClientResult | null;
    metadata: HutSelfieUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<HutActionResult<{ status: "MATCHED" | "NOT_MATCHED" | "UNCERTAIN" | "PENDING_REVIEW" }>>;
  confirmApplicationPhotoUpload: (input: {
    metadata: HutApplicationPhotoUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    now?: Date;
    slotId?: HutPhotoTimelineSlotId | null;
    token: string;
  }) => Promise<HutActionResult<{ phase: HutPhase }>>;
  setVisualOverride: (input: {
    actorUserId: string;
    enabled: boolean;
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  setTestMode: (input: {
    enabled: boolean;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  reviewVisualVerification: (input: {
    actorUserId: string;
    decision: "approve" | "pending" | "reject";
    participantId: string;
    reason: string;
    studyId: string;
    verificationId: string;
  }) => Promise<HutActionResult<{ participantId: string; verificationId: string }>>;
  confirmVideoUpload: (input: {
    metadata: HutVideoUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    token: string;
  }) => Promise<HutActionResult<{ blockNumber: number; sequenceNumber: number }>>;
  startBlock: (input: {
    blockNumber: 1 | 2;
    participantId: string;
    startDate: Date;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string }>>;
  ensureHutPhaseCodesForParticipant: (input: {
    now?: Date;
    participantId: string;
    secret?: string;
    studyId: string;
  }) => Promise<HutActionResult<HutPhaseCodeSummary>>;
  recoverPhaseCode: (input: {
    participantId: string;
    phase: HutPhase;
    secret?: string;
    studyId: string;
  }) => Promise<HutActionResult<{ code: string; phase: HutPhase }>>;
  regeneratePhaseCode: (input: {
    participantId: string;
    phase: HutPhase;
    secret?: string;
    studyId: string;
  }) => Promise<HutActionResult<{ code: string; phase: HutPhase }>>;
  revokePhaseCode: (input: {
    participantId: string;
    phase: HutPhase;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; phase: HutPhase }>>;
  saveQuestionnaireAnswer: (input: {
    answerInput: HutAnswerInput;
    actorUserId?: string | null;
    fieldAccessAudit?: {
      accessType: "ENCUESTADOR" | "SUPERVISOR";
      code: string;
    } | null;
    now?: Date;
    participantId: string;
    questionCode: string;
    studyId: string;
  }) => Promise<HutActionResult<{ answerValue: unknown; questionCode: string; terminated?: boolean; visitProgressId: string | null }>>;
  saveQuestionnaireAnswerByToken: (input: {
    answerInput: HutAnswerInput;
    now?: Date;
    questionCode: string;
    token: string;
  }) => Promise<HutActionResult<{ answerValue: unknown; questionCode: string; terminated?: boolean; visitProgressId: string | null }>>;
  completeQuestionnaireSection: (input: {
    actorUserId?: string | null;
    attemptId?: string;
    now?: Date;
    participantId: string;
    section: HutQuestionnaireSectionId;
    studyId: string;
  }) => Promise<HutActionResult<HutQuestionnaireProgressSummary>>;
  getApplicationPhotoDailyAvailability: (input: {
    now?: Date;
    participantId: string;
    studyId: string;
  }) => Promise<HutActionResult<HutApplicationPhotoDailyAvailability>>;
  getApplicationPhotoDailyAvailabilityByToken: (input: {
    now?: Date;
    token: string;
  }) => Promise<HutActionResult<HutApplicationPhotoDailyAvailability>>;
  getFieldQuestionnaireWorkspace: (input: {
    folio: string;
    storage?: HutStorageClient;
  }) => Promise<HutActionResult<HutFieldQuestionnaireWorkspace>>;
  recordApplicationPhotoEntry: (input: {
    extension: string;
    mimeType: string;
    now?: Date;
    originalFilename?: string | null;
    participantId: string;
    privateStorageKey: string;
    productCode?: string | null;
    sizeBytes: number;
    storageBucket: string;
    studyId: string;
    useDayNumber: number;
  }) => Promise<HutActionResult<HutApplicationPhotoEntrySummary>>;
  requestManualDeliveryEvidenceUpload: (input: {
    metadata: HutApplicationPhotoUploadMetadata;
    participantId: string;
    storage?: HutStorageClient;
    studyId: string;
  }) => Promise<HutActionResult<HutSignedApplicationPhotoUpload & { productCode: string | null }>>;
  confirmManualDeliveryEvidenceUpload: (input: {
    actorUserId: string;
    capturedAt?: Date;
    metadata: HutApplicationPhotoUploadMetadata & {
      privateStorageKey: string;
      storageBucket: string;
    };
    participantId: string;
    reason?: string | null;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; useDayNumber: number }>>;
  moveInitialEvidenceToDelivery: (input: {
    actorUserId: string;
    confirmation: string;
    participantId: string;
    reason?: string | null;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; useDayNumber: number }>>;
  releaseApplicationPhotoSlot: (input: {
    actorUserId: string;
    participantId: string;
    reason: string;
    slotId: HutPhotoTimelineSlotId;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; slotId: HutPhotoTimelineSlotId }>>;
  releaseSecondProduct: (input: {
    actorUserId: string;
    participantId: string;
    reason: string;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; releasedAt: Date }>>;
  requestApplicationPhotoSlotRepeat: (input: {
    actorUserId: string;
    participantId: string;
    reason: string;
    slotId: HutPhotoTimelineSlotId;
    studyId: string;
  }) => Promise<HutActionResult<{ participantId: string; slotId: HutPhotoTimelineSlotId }>>;
  validatePhaseCode: (input: {
    code: string;
    phase: HutPhase;
    token: string;
  }) => Promise<HutActionResult<{ phase: HutPhase }>>;
};

type PrismaModel = {
  count?: (args: unknown) => Promise<number>;
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
};

type HutPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: HutPrismaClient) => Promise<T>) => Promise<T>;
  auditLog: PrismaModel;
  hutBlock: PrismaModel;
  hutCallEvaluation: PrismaModel;
  hutDailyCheck: PrismaModel;
  hutApplicationEvidence: PrismaModel;
  hutApplicationPhotoEntry: PrismaModel;
  hutAnswer: PrismaModel;
  hutParticipant: PrismaModel;
  hutParticipantPhaseCode: PrismaModel;
  hutQuestionnaireAttempt: PrismaModel;
  hutReferenceSelfie: PrismaModel;
  hutRegistrationSlot: PrismaModel;
  hutVisitProgress: PrismaModel;
  hutVideoSubmission: PrismaModel;
  hutVisualVerification: PrismaModel;
  participantConfirmation: PrismaModel;
  study: PrismaModel;
};

type HutParticipantRecord = {
  applicationEvidence?: HutApplicationEvidenceRecord[];
  applicationPhotoEntries?: HutApplicationPhotoEntryRecord[];
  blocks: HutBlockRecord[];
  callEvaluations: HutCallRecord[];
  currentBlockNumber: number;
  currentVideoSequence: number;
  dailyChecks?: HutDailyCheckRecord[];
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  phone: string | null;
  origin?: "CLT_HUT" | "HUT_DIRECTO";
  phaseCodes?: HutPhaseCodeRecord[];
  protocolVersion?: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  qaParticipantRun?: { id: string } | null;
  questionnaireAttempt?: HutQuestionnaireAttemptRecord | null;
  recruiter: string | null;
  startDate: Date | null;
  status: HutParticipantStatus;
  study: HutStudySummary;
  studyId: string;
  studyParticipant?: {
    ctlSessions?: Array<{
      completedAt: Date | null;
      id: string;
      status: string;
    }>;
    id?: string;
    participantConfirmation?: {
      folio: string;
      referenceCodes?: HutReferenceCodeRecord[];
    } | null;
    participantProfile: {
      email: string | null;
      name: string;
      phone: string | null;
    };
  } | null;
  studyParticipantId?: string | null;
  testMode: boolean;
  token: string;
  referenceSelfie: HutReferenceSelfieRecord | null;
  registrationSlot?: HutRegistrationSlotRecord | null;
  secondFragranceRightArm: string | null;
  secondStageAuthorization?: HutSecondStageAuthorizationSummary | null;
  secondProductRelease?: HutSecondProductReleaseSummary | null;
  thirdStageAuthorization?: HutThirdStageAuthorizationSummary | null;
  videoSubmissions?: HutVideoRecord[];
  visualOverrideEnabled: boolean;
  visualOverrideReason: string | null;
  visualVerifications?: HutVisualVerificationRecord[];
};

type HutRegistrationSlotRecord = {
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  participant: (Pick<HutParticipantRecord, "email" | "id" | "name" | "phone" | "referenceSelfie" | "token">) | null;
  participantId: string | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  study: HutStudySummary;
  studyId: string;
};

type HutReferenceSelfieRecord = {
  capturedAt: Date;
  privateStorageKey: string;
  storageBucket: string;
};

type HutBlockRecord = {
  blockNumber: 1 | 2;
  disqualificationReason: string | null;
  id: string;
  maxMissedDaysAllowed: number;
  missedDaysCount: number;
  requiredVideos: number;
  startDate: Date | null;
  status: HutBlockStatus;
  submittedVideosCount: number;
};

type HutCallRecord = {
  blockNumber: 1 | 2;
  completedAt: Date | null;
  evaluatorName: string | null;
  notes: string | null;
  status: HutCallEvaluationStatus;
};

type HutApplicationEvidenceRecord = {
  capturedAt: Date;
  id: string;
  phase: HutPhase;
  privateStorageKey: string;
  productCode: string | null;
  storageBucket: string;
};

type HutPhaseCodeRecord = {
  codeHash: string;
  createdAt?: Date | null;
  encryptedCode: string;
  expiresAt?: Date | null;
  id: string;
  participantId: string;
  phase: HutPhase;
  sentAt?: Date | null;
  slot: number;
  status: HutPhaseCodeStatus;
  updatedAt?: Date | null;
  usedAt?: Date | null;
  validatedAt?: Date | null;
};

type HutReferenceCodeRecord = {
  code: string;
  slot: number;
};

type HutNavReconciliationConfirmationRecord = {
  folio: string;
  id: string;
  studyId: string;
  studyParticipant: {
    id: string;
    participantProfile: {
      email: string | null;
      name: string;
      phone: string | null;
    };
  };
};

type HutDailyCheckRecord = {
  blockId: string;
  blockDayNumber: number;
  date: Date;
  status: string;
};

type HutVideoRecord = {
  blockNumber: number;
  id?: string;
  privateStorageKey?: string;
  sequenceNumber: number;
  status?: string;
  storageBucket?: string;
  submittedAt?: Date;
};

type HutVisualVerificationRecord = {
  attemptSelfieKey: string;
  attemptStorageBucket: string;
  blockNumber: number;
  id: string;
  overrideReason: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  sequenceNumber: number;
  similarityScore: number | null;
  status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
  verificationDate: Date;
};

type HutQuestionnaireAttemptRecord = {
  answers?: HutAnswerRecord[];
  completedAt: Date | null;
  id: string;
  participantId: string;
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING" | "TERMINATED";
  terminatedAt: Date | null;
  terminationReason: string | null;
  visits?: HutVisitProgressRecord[];
};

type HutVisitProgressRecord = {
  attemptId: string;
  completedAt: Date | null;
  id: string;
  section: HutQuestionnaireSectionId;
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
};

type HutAnswerRecord = {
  answerJson: unknown;
  id: string;
  questionCode: string;
  visitProgressId: string | null;
};

type HutApplicationPhotoEntryRecord = {
  capturedAt: Date;
  capturedLocalDate: string;
  capturedLocalTimezone: string;
  id: string;
  participantId: string;
  privateStorageKey?: string;
  productCode: string | null;
  storageBucket?: string;
  useDayNumber: number;
};

const studySelect = {
  code: true,
  id: true,
  name: true,
  status: true,
  timeZoneIana: true
} as const;

const participantSelect = {
  applicationEvidence: {
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      id: true,
      phase: true,
      privateStorageKey: true,
      productCode: true,
      storageBucket: true
    }
  },
  applicationPhotoEntries: {
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      capturedLocalDate: true,
      capturedLocalTimezone: true,
      id: true,
      participantId: true,
      privateStorageKey: true,
      productCode: true,
      storageBucket: true,
      useDayNumber: true
    }
  },
  blocks: {
    orderBy: { blockNumber: "asc" },
    select: {
      blockNumber: true,
      disqualificationReason: true,
      id: true,
      maxMissedDaysAllowed: true,
      missedDaysCount: true,
      requiredVideos: true,
      startDate: true,
      status: true,
      submittedVideosCount: true
    }
  },
  callEvaluations: {
    orderBy: { blockNumber: "asc" },
    select: {
      blockNumber: true,
      completedAt: true,
      evaluatorName: true,
      notes: true,
      status: true
    }
  },
  currentBlockNumber: true,
  currentVideoSequence: true,
  dailyChecks: {
    orderBy: { blockDayNumber: "asc" },
    select: {
      blockId: true,
      blockDayNumber: true,
      date: true,
      status: true
    }
  },
  email: true,
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  name: true,
  origin: true,
  phone: true,
  phaseCodes: {
    orderBy: { slot: "asc" },
    select: {
      codeHash: true,
      createdAt: true,
      encryptedCode: true,
      expiresAt: true,
      id: true,
      participantId: true,
      phase: true,
      sentAt: true,
      slot: true,
      status: true,
      updatedAt: true,
      usedAt: true,
      validatedAt: true
    }
  },
  qaParticipantRun: {
    select: { id: true }
  },
  questionnaireAttempt: {
    select: {
      completedAt: true,
      id: true,
      participantId: true,
      startedAt: true,
      status: true,
      terminatedAt: true,
      terminationReason: true,
      answers: {
        orderBy: { questionCode: "asc" },
        select: {
          answerJson: true,
          id: true,
          questionCode: true,
          visitProgressId: true
        }
      },
      visits: {
        orderBy: { section: "asc" },
        select: {
          attemptId: true,
          completedAt: true,
          id: true,
          section: true,
          startedAt: true,
          status: true
        }
      }
    }
  },
  recruiter: true,
  protocolVersion: true,
  referenceSelfie: {
    select: {
      capturedAt: true,
      privateStorageKey: true,
      storageBucket: true
    }
  },
  registrationSlot: {
    select: {
      firstFragranceLeftArm: true,
      folio: true,
      id: true,
      participantId: true,
      registrationToken: true,
      secondFragranceRightArm: true,
      status: true
    }
  },
  secondFragranceRightArm: true,
  startDate: true,
  status: true,
  study: { select: studySelect },
  studyId: true,
  studyParticipant: {
    select: {
      id: true,
      participantConfirmation: {
        select: {
          folio: true,
          referenceCodes: {
            orderBy: { slot: "asc" },
            select: {
              code: true,
              slot: true
            }
          }
        }
      },
      ctlSessions: {
        orderBy: { completedAt: "desc" },
        select: {
          completedAt: true,
          id: true,
          status: true
        }
      },
      participantProfile: {
        select: {
          email: true,
          name: true,
          phone: true
        }
      }
    }
  },
  studyParticipantId: true,
  testMode: true,
  token: true,
  visualOverrideEnabled: true,
  visualOverrideReason: true,
  visualVerifications: {
    orderBy: { createdAt: "desc" },
    select: {
      attemptSelfieKey: true,
      attemptStorageBucket: true,
      blockNumber: true,
      id: true,
      overrideReason: true,
      reviewedAt: true,
      reviewedByUserId: true,
      sequenceNumber: true,
      similarityScore: true,
      status: true,
      verificationDate: true
    }
  },
  videoSubmissions: {
    orderBy: [{ blockNumber: "asc" }, { sequenceNumber: "asc" }],
    select: {
      blockNumber: true,
      id: true,
      privateStorageKey: true,
      sequenceNumber: true,
      status: true,
      storageBucket: true,
      submittedAt: true
    }
  }
} as const;

const registrationSlotSelect = {
  firstFragranceLeftArm: true,
  folio: true,
  id: true,
  participant: {
    select: {
      email: true,
      id: true,
      name: true,
      phone: true,
      referenceSelfie: {
        select: {
          capturedAt: true,
          privateStorageKey: true,
          storageBucket: true
        }
      },
      token: true
    }
  },
  participantId: true,
  registrationToken: true,
  secondFragranceRightArm: true,
  status: true,
  study: { select: studySelect },
  studyId: true
} as const;

const hutQuestionnaireAttemptSelect = {
  completedAt: true,
  id: true,
  participantId: true,
  startedAt: true,
  status: true,
  terminatedAt: true,
  terminationReason: true
} as const;

const hutQuestionnaireStateSelect = {
  ...hutQuestionnaireAttemptSelect,
  answers: {
    orderBy: { questionCode: "asc" },
    select: {
      answerJson: true,
      id: true,
      questionCode: true,
      visitProgressId: true
    }
  },
  visits: {
    orderBy: { section: "asc" },
    select: {
      attemptId: true,
      completedAt: true,
      id: true,
      section: true,
      startedAt: true,
      status: true
    }
  }
} as const;

const hutVisitProgressSelect = {
  attemptId: true,
  completedAt: true,
  id: true,
  section: true,
  startedAt: true,
  status: true
} as const;

const hutApplicationPhotoEntrySelect = {
  capturedAt: true,
  capturedLocalDate: true,
  capturedLocalTimezone: true,
  id: true,
  participantId: true,
  privateStorageKey: true,
  productCode: true,
  storageBucket: true,
  useDayNumber: true
} as const;

export function createHutRepository(prismaClient?: HutPrismaClient, whatsappRepository?: OneuiWhatsAppRepository): HutRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as HutPrismaClient);
  }

  function getWhatsAppRepository() {
    if (whatsappRepository) {
      return whatsappRepository;
    }
    if (prismaClient) {
      return createNoopOneuiWhatsAppRepository();
    }
    return whatsappRepository ?? createOneuiWhatsAppRepository();
  }

  async function findParticipant(prisma: HutPrismaClient, participantId: string) {
    return (await prisma.hutParticipant.findUnique?.({
      select: participantSelect,
      where: { id: participantId }
    })) as HutParticipantRecord | null;
  }

  async function findParticipantByToken(prisma: HutPrismaClient, token: string) {
    return (await prisma.hutParticipant.findUnique?.({
      select: participantSelect,
      where: { token }
    })) as HutParticipantRecord | null;
  }

  return {
    async createParticipant(input) {
      const name = normalizeHutText(input.name);

      if (!name) {
        return { message: "Captura el nombre del participante HUT.", ok: false };
      }

      const phone = normalizeHutPhone(input.phone);
      const email = normalizeHutEmail(input.email);
      const recruiter = normalizeOptionalHutText(input.recruiter);
      const manualRotation = normalizeManualRotation({
        firstFragranceLeftArm: input.firstFragranceLeftArm,
        folio: input.folio,
        secondFragranceRightArm: input.secondFragranceRightArm
      });
      if (!manualRotation.ok) {
        return { message: manualRotation.message, ok: false };
      }
      const prisma = await getPrisma();

      const result: HutActionResult<{ link: string; participantId: string }> = await prisma.$transaction(async (tx) => {
        const study = (await tx.study.findUnique?.({
          select: studySelect,
          where: { id: input.studyId }
        })) as HutStudySummary | null;

        if (!study) {
          return { message: "No encontramos el estudio.", ok: false };
        }

        const slot = input.slotId
          ? ((await tx.hutRegistrationSlot.findUnique?.({
              select: registrationSlotSelect,
              where: { id: input.slotId }
            })) as HutRegistrationSlotRecord | null)
          : null;

        if (input.slotId && (!slot || slot.studyId !== input.studyId)) {
          return { message: "No encontramos el folio HUT seleccionado.", ok: false };
        }
        if (slot && (slot.status !== "AVAILABLE" || slot.participantId)) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const rotation = slot
          ? {
              firstFragranceLeftArm: slot.firstFragranceLeftArm,
              folio: slot.folio,
              secondFragranceRightArm: slot.secondFragranceRightArm
            }
          : manualRotation.data;

        if (rotation?.folio) {
          const duplicate = await findParticipantByFolio(tx, {
            folio: rotation.folio,
            studyId: input.studyId
          });
          if (duplicate) {
            return { message: "Ya existe un participante HUT con ese folio.", ok: false };
          }
        }

        const existing = await findExistingParticipant(tx, {
          email,
          phone,
          studyId: input.studyId
        });

        if (existing) {
          return {
            data: {
              link: participantLink(input.requestOrigin, existing.token),
              participantId: existing.id
            },
            message: "El participante HUT ya existia; se reutilizo su enlace.",
            ok: true
          };
        }

        const token = createHutParticipantToken();
        const startsNow = Boolean(input.startDate);
        const protocolVersion = input.protocolVersion ?? "APPLICATION_PHOTO";
        const participant = (await tx.hutParticipant.create?.({
          data: {
            currentBlockNumber: 1,
            currentVideoSequence: 1,
            email,
            firstFragranceLeftArm: rotation?.firstFragranceLeftArm ?? null,
            folio: rotation?.folio ?? null,
            name,
            origin: "HUT_DIRECTO",
            phone,
            protocolVersion,
            recruiter,
            secondFragranceRightArm: rotation?.secondFragranceRightArm ?? null,
            startDate: input.startDate ?? null,
            status: startsNow ? "BLOCK_1_IN_PROGRESS" : "NOT_STARTED",
            studyId: input.studyId,
            token
          }
        })) as { id: string };

        if (protocolVersion === "LEGACY_VIDEO") {
          await createHutParticipantFoundation(tx, {
            participantId: participant.id,
            startDate: input.startDate ?? null,
            startsNow
          });
        }

        if (slot) {
          await tx.hutRegistrationSlot.update?.({
            data: {
              participantId: participant.id,
              registeredAt: new Date(),
              status: "REGISTERED"
            },
            where: { id: slot.id }
          });
        }

        return {
          data: {
            link: participantLink(input.requestOrigin, token),
            participantId: participant.id
          },
          message: "Participante HUT creado correctamente.",
          ok: true
        };
      });

      return result;
    },

    async createRegistrationSlot(input) {
      const folio = normalizeHutText(input.folio);
      const firstFragranceLeftArm = normalizeHutText(input.firstFragranceLeftArm);
      const secondFragranceRightArm = normalizeHutText(input.secondFragranceRightArm);

      if (!folio) {
        return { message: "Captura el folio HUT.", ok: false };
      }
      if (!firstFragranceLeftArm || !secondFragranceRightArm) {
        return { message: "Captura ambas fragancias o brazos de la rotacion.", ok: false };
      }

      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as HutStudySummary | null;

      if (!study) {
        return { message: "No encontramos el estudio.", ok: false };
      }

      const participantWithFolio = await findParticipantByFolio(prisma, {
        folio,
        studyId: input.studyId
      });
      if (participantWithFolio) {
        return { message: "Ya existe un participante HUT con ese folio.", ok: false };
      }

      const existing = (await prisma.hutRegistrationSlot.findFirst?.({
        select: registrationSlotSelect,
        where: {
          folio,
          studyId: input.studyId
        }
      })) as HutRegistrationSlotRecord | null;

      if (existing) {
        return {
          data: {
            link: registrationLink(input.requestOrigin, existing.registrationToken),
            slotId: existing.id
          },
          message: "El folio HUT ya existia; se reutilizo su link de registro.",
          ok: true
        };
      }

      const token = createHutRegistrationToken();
      const slot = (await prisma.hutRegistrationSlot.create?.({
        data: {
          firstFragranceLeftArm,
          folio,
          registrationToken: token,
          secondFragranceRightArm,
          studyId: input.studyId
        }
      })) as { id: string };

      return {
        data: {
          link: registrationLink(input.requestOrigin, token),
          slotId: slot.id
        },
        message: "Folio HUT creado correctamente.",
        ok: true
      };
    },

    async importParticipants(input) {
      const rows = parseHutParticipantImportText(input.text);
      const repository = createHutRepository(await getPrisma(), getWhatsAppRepository());
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const result = await repository.createParticipant({
          ...row,
          requestOrigin: input.requestOrigin,
          startDate: input.startDate,
          studyId: input.studyId
        });

        if (result.ok && result.message?.includes("creado")) {
          created += 1;
        } else {
          skipped += 1;
        }
      }

      return {
        data: { created, skipped },
        message: `Importacion HUT completada. Creados: ${created}. Omitidos/reutilizados: ${skipped}.`,
        ok: true
      };
    },

    async importRegistrationSlots(input) {
      const rows = parseHutRegistrationSlotImportText(input.text);
      const repository = createHutRepository(await getPrisma(), getWhatsAppRepository());
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const result = await repository.createRegistrationSlot({
          ...row,
          requestOrigin: input.requestOrigin,
          studyId: input.studyId
        });

        if (result.ok && result.message?.includes("creado")) {
          created += 1;
        } else {
          skipped += 1;
        }
      }

      return {
        data: { created, skipped },
        message: `Importacion de folios HUT completada. Creados: ${created}. Omitidos/reutilizados: ${skipped}.`,
        ok: true
      };
    },

    async getAdminDashboard(input) {
      const prisma = await getPrisma();
      const study = (await prisma.study.findUnique?.({
        select: studySelect,
        where: { id: input.studyId }
      })) as HutStudySummary | null;

      if (!study) {
        return null;
      }

      const participants = (await prisma.hutParticipant.findMany?.({
        orderBy: [{ createdAt: "asc" }],
        select: participantSelect,
        where: {
          qaParticipantRun: { is: null },
          studyId: input.studyId
        }
      })) as HutParticipantRecord[];
      const registrationSlots = (await prisma.hutRegistrationSlot.findMany?.({
        orderBy: [{ folio: "asc" }],
        select: registrationSlotSelect,
        where: { studyId: input.studyId }
      })) as HutRegistrationSlotRecord[];
      const reservedNavReconciliation = await buildReservedHutNavReconciliationPreview(prisma, input.studyId);

      return {
        participants: await Promise.all(
          participants.map(async (participant) => {
            await attachSecondStageAuthorization(prisma, participant);
            await attachSecondProductRelease(prisma, participant);
            await attachThirdStageAuthorization(prisma, participant);
            return toAdminParticipant(
              participant,
              input.requestOrigin,
              input.storage,
              getWhatsAppRepository(),
              await readActiveHutPhotoSlotOverrides(prisma, participant.id)
            );
          })
        ),
        reservedNavReconciliation,
        registrationSlots: registrationSlots.map((slot) => toAdminRegistrationSlot(slot, input.requestOrigin)),
        study
      };
    },

    async getPortalView(token) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }
      await attachSecondStageAuthorization(prisma, participant);
      await attachSecondProductRelease(prisma, participant);
      await attachThirdStageAuthorization(prisma, participant);

      return {
        data: toPortalView(participant, await readActiveHutPhotoSlotOverrides(prisma, participant.id)),
        ok: true
      };
    },

    async ensureQuestionnaireAttempt(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      const prepared = await ensureHutQuestionnaireAttemptForParticipant(prisma, input);

      if (!prepared.ok) {
        return { message: prepared.message, ok: false };
      }

      return {
        data: prepared.data,
        message: "Intento HUT v5 preparado correctamente.",
        ok: true
      };
    },

    async ensureQuestionnaireSectionProgress(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      return ensureHutQuestionnaireSectionProgressInternal(prisma, input);
    },

    async completeQuestionnaireSection(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (
        participantOrigin(participant) === "HUT_DIRECTO"
        && input.section !== "FILTROS"
        && hutFilterStatusFromParticipant(participant) !== "COMPLETED"
      ) {
        return {
          message: "Completa los filtros HUT antes de cerrar esta seccion.",
          ok: false
        };
      }
      await attachSecondStageAuthorization(prisma, participant);
      await attachThirdStageAuthorization(prisma, participant);
      if (input.section === "EVALUACION_PRIMER_PERFUME" && !isHutFirstEvaluationGateOpen(participant)) {
        return {
          message: secondStageAuthorizationRequiredMessage(participant),
          ok: false
        };
      }
      if (requiresSecondProductDeliveryConfirmationForSection(input.section) && !isFirstFragranceEvaluationCompleted(participant)) {
        return {
          message: "Completa primero la evaluacion del primer perfume antes de confirmar entrega del segundo producto.",
          ok: false
        };
      }
      if (requiresThirdStageAuthorizationForSection(input.section) && !isHutFinalStageGateOpen(participant)) {
        return {
          message: "Autoriza primero la etapa final con el codigo maestro slot 3.",
          ok: false
        };
      }

      const prepared = await ensureHutQuestionnaireAttemptForParticipant(prisma, input);

      if (!prepared.ok) {
        return { message: prepared.message, ok: false };
      }

      const now = input.now ?? new Date();
      const visit = (await prisma.hutVisitProgress.upsert?.({
        create: {
          attemptId: prepared.data.id,
          completedAt: now,
          section: input.section,
          startedAt: now,
          status: "COMPLETED"
        },
        select: hutVisitProgressSelect,
        update: {
          completedAt: now,
          status: "COMPLETED"
        },
        where: {
          attemptId_section: {
            attemptId: prepared.data.id,
            section: input.section
          }
        }
      })) as HutVisitProgressRecord;

      const attemptAfterVisit = (await prisma.hutQuestionnaireAttempt.findUnique?.({
        select: hutQuestionnaireStateSelect,
        where: { participantId: participant.id }
      })) as HutQuestionnaireAttemptRecord | null;
      const finalCompletionReady = attemptAfterVisit
        ? isHutQuestionnaireFinalCompletionReady({
            attempt: attemptAfterVisit,
            participant,
            recentlyCompletedSection: input.section,
            visit
          })
        : false;

      if (attemptAfterVisit && finalCompletionReady && attemptAfterVisit.status !== "COMPLETED") {
        await prisma.hutQuestionnaireAttempt.update?.({
          data: {
            completedAt: now,
            status: "COMPLETED"
          },
          where: { id: attemptAfterVisit.id }
        });
      }

      if (finalCompletionReady && participant.status !== "COMPLETED") {
        await prisma.hutParticipant.update?.({
          data: {
            status: "COMPLETED"
          },
          where: { id: participant.id }
        });
      }

      const completionMessageSent = finalCompletionReady
        ? await sendHutCompletionMessageIfReady({
            actorUserId: input.actorUserId ?? null,
            now,
            participant,
            prisma,
            recentlyCompletedSection: input.section,
            visit,
            whatsappRepository: getWhatsAppRepository()
          })
        : false;

      return {
        data: toVisitProgressSummary(visit),
        message: completionMessageSent
          ? "Participacion HUT finalizada correctamente."
          : "Seccion HUT v5 completada correctamente.",
        ok: true
      };
    },

    async saveQuestionnaireAnswer(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }

      const question = getHutQuestions().find((candidate) => candidate.code === input.questionCode);
      if (!question) {
        return { message: "No encontramos la pregunta HUT.", ok: false };
      }

      const attempt = await ensureHutQuestionnaireAttemptForParticipant(prisma, input);
      if (!attempt.ok) {
        return { message: attempt.message, ok: false };
      }
      if (attempt.data.status === "TERMINATED") {
        return {
          message: "La entrevista HUT ya fue terminada y no permite capturar preguntas posteriores.",
          ok: false
        };
      }

      const existingAnswers = (await prisma.hutAnswer.findMany?.({
        select: {
          answerJson: true,
          id: true,
          questionCode: true,
          visitProgressId: true
        },
        where: { attemptId: attempt.data.id }
      })) as HutAnswerRecord[];
      const answerLookup = Object.fromEntries(existingAnswers.map((answer) => [answer.questionCode, answer.answerJson]));
      const origin = participantOrigin(participant);
      const applicableCodes = new Set(
        getHutApplicableQuestions({
          answers: {
            ...answerLookup,
            ...input.answerInput
          },
          context: { participantOrigin: origin },
          definition: getHutV5Definition()
        }).map((candidate) => candidate.code)
      );

      if (!applicableCodes.has(question.code)) {
        return {
          message: "Esta pregunta HUT se omite para este participante.",
          ok: false
        };
      }
      if (
        origin === "HUT_DIRECTO"
        && question.section !== "FILTROS"
        && hutFilterStatus({
          answers: answerLookup,
          attemptStatus: attempt.data.status,
          participantOrigin: origin
        }) !== "COMPLETED"
      ) {
        return {
          message: "Completa los filtros HUT antes de continuar el protocolo.",
          ok: false
        };
      }
      await attachSecondStageAuthorization(prisma, participant);
      await attachThirdStageAuthorization(prisma, participant);
      if (requiresSecondStageAuthorizationForQuestion(question) && !isHutFirstEvaluationGateOpen(participant)) {
        return {
          message: secondStageAuthorizationRequiredMessage(participant),
          ok: false
        };
      }
      if (requiresSecondProductDeliveryConfirmationForQuestion(question) && !isFirstFragranceEvaluationCompleted(participant)) {
        return {
          message: "Completa primero la evaluacion del primer perfume antes de confirmar entrega del segundo producto.",
          ok: false
        };
      }
      if (requiresThirdStageAuthorizationForQuestion(question) && !isHutFinalStageGateOpen(participant)) {
        return {
          message: "Autoriza primero la etapa final con el codigo maestro slot 3.",
          ok: false
        };
      }

      const parsed = parseHutQuestionAnswer(question.code, input.answerInput);
      if (!parsed.ok) {
        return { message: parsed.message, ok: false };
      }
      if (!parsed.answer) {
        return { message: "No hay respuesta HUT para guardar.", ok: false };
      }

      const progress = await ensureHutQuestionnaireSectionProgressInternal(prisma, {
        attemptId: attempt.data.id,
        now: input.now,
        participantId: participant.id,
        section: question.section,
        studyId: input.studyId
      });
      if (!progress.ok) {
        return { message: progress.message, ok: false };
      }

      const now = input.now ?? new Date();
      const questionPairRotationAudit = getHutQuestionPairRotationAudit({
        participantId: participant.id,
        questionCode: question.code
      });
      await prisma.hutAnswer.upsert?.({
        create: {
          answerJson: parsed.answer.answerValue,
          answeredAt: now,
          attemptId: attempt.data.id,
          questionCode: question.code,
          visitProgressId: progress.data.id
        },
        update: {
          answerJson: parsed.answer.answerValue,
          answeredAt: now,
          visitProgressId: progress.data.id
        },
        where: {
          attemptId_questionCode: {
            attemptId: attempt.data.id,
            questionCode: question.code
          }
        }
      });
      const fieldAccessAudit = input.fieldAccessAudit
        ? {
            accessType: input.fieldAccessAudit.accessType,
            codeMasked: maskFieldAccessCode(input.fieldAccessAudit.code)
          }
        : null;

      const termination = getHutQuestionTerminationDecision(question, parsed.answer.answerValue);
      if (termination.terminates) {
        await prisma.hutQuestionnaireAttempt.update?.({
          data: {
            completedAt: null,
            status: "TERMINATED",
            terminatedAt: now,
            terminationReason: `${question.code}: ${termination.reason}`
          },
          where: { id: attempt.data.id }
        });
        await prisma.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId ?? null,
            afterJson: toAuditJson({
              answerValue: parsed.answer.answerValue,
              fieldAccess: fieldAccessAudit,
              questionPairRotation: questionPairRotationAudit,
              questionCode: question.code,
              status: "TERMINATED",
              terminationReason: termination.reason
            }),
            beforeJson: toAuditJson({
              status: attempt.data.status
            }),
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: termination.reason
          }
        });

        return {
          data: {
            answerValue: parsed.answer.answerValue,
            questionCode: question.code,
            terminated: true,
            visitProgressId: progress.data.id
          },
          message: "Respuesta HUT guardada. El participante no cumple el filtro para continuar.",
          ok: true
        };
      }

      if (fieldAccessAudit) {
        await prisma.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId ?? null,
            afterJson: toAuditJson({
              fieldAccess: fieldAccessAudit,
              questionPairRotation: questionPairRotationAudit,
              questionCode: question.code,
              status: "ANSWER_SAVED"
            }),
            beforeJson: null,
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: "Captura HUT de campo"
          }
        });
      }

      if (question.code === "HUT_V2_CONFIRMACION_ENTREGA" && parsed.answer.answerValue === "1") {
        await ensureSecondProductReleasedFromDeliveryConfirmation({
          actorUserId: input.actorUserId ?? null,
          participant,
          prisma
        });
      }

      return {
        data: {
          answerValue: parsed.answer.answerValue,
          questionCode: question.code,
          visitProgressId: progress.data.id
        },
        message: "Respuesta HUT guardada correctamente.",
        ok: true
      };
    },

    async saveQuestionnaireAnswerByToken(input) {
      void input;
      return { message: "El cuestionario HUT debe ser capturado por un encuestador autorizado.", ok: false };
    },

    async getQuestionnaireState(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }

      const attempt = await ensureHutQuestionnaireAttemptForParticipant(prisma, input);
      if (!attempt.ok) {
        return { message: attempt.message, ok: false };
      }

      const state = (await prisma.hutQuestionnaireAttempt.findUnique?.({
        select: hutQuestionnaireStateSelect,
        where: { id: attempt.data.id }
      })) as HutQuestionnaireAttemptRecord | null;

      if (!state) {
        return { message: "No encontramos el intento HUT v5.", ok: false };
      }

      const answers = Object.fromEntries((state.answers ?? []).map((answer) => [answer.questionCode, answer.answerJson]));
      const origin = participantOrigin(participant);
      const applicableQuestionCodes = orderHutQuestionsForParticipant(getHutApplicableQuestions({
        answers,
        context: { participantOrigin: origin },
        definition: getHutV5Definition()
      }), participant.id).map((question) => question.code);
      const applicableSet = new Set(applicableQuestionCodes);
      const omittedQuestionCodes = getHutQuestions()
        .map((question) => question.code)
        .filter((code) => !applicableSet.has(code));

      return {
        data: {
          answers,
          applicableQuestionCodes,
          attempt: toQuestionnaireAttemptSummary(state),
          filterStatus: hutFilterStatus({
            answers,
            attemptStatus: state.status,
            participantOrigin: origin
          }),
          omittedQuestionCodes,
          participantOrigin: origin,
          visits: (state.visits ?? []).map(toVisitProgressSummary)
        },
        ok: true
      };
    },

    async getQuestionnaireStateByToken(token) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      return createHutRepository(prisma, getWhatsAppRepository()).getQuestionnaireState({
        participantId: participant.id,
        studyId: participant.studyId
      });
    },

    async getFieldQuestionnaireWorkspace(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantForFieldHutCapture(prisma, input.folio);

      if (!participant) {
        return { message: "No encontramos un participante HUT con ese folio.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }
      await attachSecondStageAuthorization(prisma, participant);
      await attachSecondProductRelease(prisma, participant);
      await attachThirdStageAuthorization(prisma, participant);

      const questionnaire = await createHutRepository(prisma, getWhatsAppRepository()).getQuestionnaireState({
        participantId: participant.id,
        studyId: participant.studyId
      });
      if (!questionnaire.ok) {
        return { message: questionnaire.message, ok: false };
      }

      return {
        data: {
          participant: {
            email: participant.email,
            hutFolio: participant.folio,
            id: participant.id,
            name: hutParticipantDisplayName(participant),
            navFolio: participant.studyParticipant?.participantConfirmation?.folio ?? null,
            origin: participantOrigin(participant),
            phone: participant.phone,
            protocolVersion: participant.protocolVersion ?? "LEGACY_VIDEO",
            status: participant.status,
            studyId: participant.studyId,
            testMode: participant.testMode
          },
          phaseCodes: toAdminPhaseCodes(participant),
          photoSlotOverrides: await readActiveHutPhotoSlotOverrides(prisma, participant.id),
          photos: await toFieldPhotoSummaries(participant, input.storage),
          product2GateOpen: isHutProduct2GateOpen(participant),
          secondStageAuthorized: isHutFirstEvaluationGateOpen(participant),
          thirdStageAuthorized: isHutFinalStageGateOpen(participant),
          questionnaire: questionnaire.data,
          legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
          rotation: {
            eva1: participant.firstFragranceLeftArm,
            eva2: participant.secondFragranceRightArm
          },
          warnings: hutOperationalCompatibilityWarnings(participant)
        },
        ok: true
      };
    },

    async getApplicationPhotoDailyAvailability(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      const capturedLocalDate = hutLocalDateKey(input.now ?? new Date());
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return {
          data: {
            available: false,
            capturedLocalDate,
            existingEntry: null,
            nextAvailableLocalDate: null,
            reason: "RESERVED_WITHOUT_OPERATIONAL_IDENTITY",
            slotId: null
          },
          ok: true
        };
      }

      if (!isApplicationPhotoProtocol(participant)) {
        return {
          data: {
            available: false,
            capturedLocalDate,
            existingEntry: null,
            nextAvailableLocalDate: null,
            reason: "LEGACY_PROTOCOL",
            slotId: null
          },
          ok: true
        };
      }
      if (participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED") {
        return {
          data: {
            available: false,
            capturedLocalDate,
            existingEntry: null,
            nextAvailableLocalDate: null,
            reason: "FILTER_PENDING",
            slotId: null
          },
          ok: true
        };
      }
      await attachSecondProductRelease(prisma, participant);
      const now = input.now ?? new Date();
      const manualOverrides = await readActiveHutPhotoSlotOverrides(prisma, participant.id);
      const expectedSlot = expectedApplicationPhotoSlot(participant, now, manualOverrides);
      const nextPendingSlot = nextPendingApplicationPhotoSlot(participant, now, manualOverrides);

      const existing = (await prisma.hutApplicationPhotoEntry.findFirst?.({
        select: hutApplicationPhotoEntrySelect,
        where: {
          capturedLocalDate,
          participantId: participant.id
        }
      })) as HutApplicationPhotoEntryRecord | null;

      return {
        data: {
          available: Boolean(expectedSlot) && (participant.testMode || !existing || Boolean(expectedSlot?.manualOverride)),
          capturedLocalDate,
          existingEntry: existing ? toApplicationPhotoEntrySummary(existing) : null,
          nextAvailableLocalDate: existing && !participant.testMode && !expectedSlot?.manualOverride
            ? nextLocalDateKey(capturedLocalDate)
            : nextPendingSlot?.availableAt && !expectedSlot
              ? hutLocalDateKey(nextPendingSlot.availableAt)
              : null,
          reason: expectedSlot?.manualOverride
            ? "AVAILABLE"
            : existing && !participant.testMode
            ? "PHOTO_ALREADY_CAPTURED_TODAY"
            : expectedSlot
              ? "AVAILABLE"
              : nextPendingSlot?.availableAt
                ? "WAIT_UNTIL_NEXT_DAY"
                : "AVAILABLE",
          slotId: expectedSlot?.id ?? null
        },
        ok: true
      };
    },

    async getApplicationPhotoDailyAvailabilityByToken(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      return createHutRepository(prisma, getWhatsAppRepository()).getApplicationPhotoDailyAvailability({
        now: input.now,
        participantId: participant.id,
        studyId: participant.studyId
      });
    },

    async recordApplicationPhotoEntry(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "Este participante conserva el flujo HUT historico.", ok: false };
        }
        if (participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED") {
          return { message: "Completa los filtros HUT antes de registrar fotografias.", ok: false };
        }
        const capturedLocalDate = applicationPhotoCapturedLocalDate({
          now,
          testMode: participant.testMode,
          useDayNumber: input.useDayNumber
        });
        const existing = (await tx.hutApplicationPhotoEntry.findFirst?.({
          select: hutApplicationPhotoEntrySelect,
          where: {
            capturedLocalDate: hutLocalDateKey(now),
            participantId: participant.id
          }
        })) as HutApplicationPhotoEntryRecord | null;

        if (existing && !participant.testMode) {
          return {
            message: "Ya existe una foto de aplicacion registrada para el dia de hoy.",
            ok: false
          };
        }

        const existingSlotPhoto = await findApplicationPhotoEntryByUseDayNumber(tx, participant.id, input.useDayNumber);
        if (existingSlotPhoto) {
          return {
            message: "Esta foto HUT ya fue registrada.",
            ok: false
          };
        }

        const entry = (await tx.hutApplicationPhotoEntry.create?.({
          data: {
            capturedAt: now,
            capturedLocalDate,
            capturedLocalTimezone: "America/Mexico_City",
            extension: input.extension,
            mimeType: input.mimeType,
            originalFilename: input.originalFilename ?? null,
            participantId: participant.id,
            privateStorageKey: input.privateStorageKey,
            productCode: input.productCode ?? null,
            sizeBytes: input.sizeBytes,
            storageBucket: input.storageBucket,
            useDayNumber: input.useDayNumber
          },
          select: hutApplicationPhotoEntrySelect
        })) as HutApplicationPhotoEntryRecord;

        return {
          data: toApplicationPhotoEntrySummary(entry),
          message: "Foto diaria de aplicacion registrada correctamente.",
          ok: true
        };
      });
    },

    async requestManualDeliveryEvidenceUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "La recuperacion de entrega aplica solo al protocolo APPLICATION_PHOTO.", ok: false };
      }
      if (blockingApplicationPhotoEntryByUseDayNumber(participant, 0)) {
        return { message: "Este participante ya tiene evidencia de entrega registrada.", ok: false };
      }

      try {
        const signed = await createHutSignedApplicationPhotoUpload({
          metadata: input.metadata,
          participantId: participant.id,
          phase: "COLOCACION",
          storage: input.storage,
          studyId: participant.studyId
        });

        return {
          data: {
            ...signed,
            productCode: participant.firstFragranceLeftArm
          },
          ok: true
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la evidencia de entrega.", ok: false };
      }
    },

    async confirmManualDeliveryEvidenceUpload(input) {
      const prisma = await getPrisma();
      const capturedAt = input.capturedAt ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "La recuperacion de entrega aplica solo al protocolo APPLICATION_PHOTO.", ok: false };
        }
        if (blockingApplicationPhotoEntryByUseDayNumber(participant, 0)) {
          return { message: "Este participante ya tiene evidencia de entrega registrada.", ok: false };
        }
        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la evidencia de entrega.", ok: false };
        }

        try {
          assertHutApplicationPhotoStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la evidencia de entrega.", ok: false };
        }

        const capturedLocalDate = hutLocalDateKey(capturedAt);
        const existingLocalDate = (participant.applicationPhotoEntries ?? []).find(
          (entry) => entry.capturedLocalDate === capturedLocalDate
        ) ?? null;
        if (existingLocalDate && !participant.testMode) {
          return {
            message: "Ya existe una foto HUT registrada para esa fecha local. Ajusta la fecha de entrega o revisa el historial.",
            ok: false
          };
        }

        const beforeJson = toAuditJson({
          participant: hutParticipantAuditSnapshot(participant),
          recovery: {
            capturedAt,
            capturedLocalDate,
            type: "DELIVERY_MANUAL_RECOVERY"
          }
        });
        const entry = (await tx.hutApplicationPhotoEntry.create?.({
          data: {
            capturedAt,
            capturedLocalDate,
            capturedLocalTimezone: "America/Mexico_City",
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            productCode: participant.firstFragranceLeftArm,
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket,
            useDayNumber: 0
          },
          select: hutApplicationPhotoEntrySelect
        })) as HutApplicationPhotoEntryRecord;

        await tx.hutParticipant.update?.({
          data: nextApplicationPhotoParticipantStateForSlot("DELIVERY"),
          where: { id: participant.id }
        });
        await tx.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId,
            afterJson: toAuditJson({
              action: "HUT_DELIVERY_EVIDENCE_MANUAL_RECOVERY",
              entry,
              reasonDetail: input.reason?.trim() || null,
              recoveredAt: new Date(),
              type: "DELIVERY_MANUAL_RECOVERY"
            }),
            beforeJson,
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: "HUT_LINK_RECOVERY"
          }
        });

        return {
          data: { participantId: participant.id, useDayNumber: 0 },
          message: "Evidencia de entrega registrada. Producto 1 Dia 1 queda como siguiente actividad pendiente.",
          ok: true
        };
      });
    },

    async moveInitialEvidenceToDelivery(input) {
      if (input.confirmation.trim() !== "MOVER ENTREGA HUT") {
        return { message: "Escribe MOVER ENTREGA HUT para confirmar.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "La regularizacion de entrega aplica solo al protocolo APPLICATION_PHOTO.", ok: false };
        }
        if (blockingApplicationPhotoEntryByUseDayNumber(participant, 0)) {
          return { message: "Este participante ya tiene evidencia de entrega registrada.", ok: false };
        }

        const sourceEvidence = participant.applicationEvidence?.find((evidence) => evidence.phase === "COLOCACION") ?? null;
        if (!sourceEvidence) {
          return { message: "No encontramos una evidencia inicial COLOCACION para mover a entrega.", ok: false };
        }
        const mirroredDay1Entry = (participant.applicationPhotoEntries ?? []).find((entry) =>
          applicationPhotoEntryMatchesEvidence(entry, sourceEvidence)
        ) ?? null;
        const beforeJson = toAuditJson({
          participant: hutParticipantAuditSnapshot(participant),
          sourceEvidence,
          sourcePhotoEntry: mirroredDay1Entry
        });
        let deliveryEntry: HutApplicationPhotoEntryRecord | null = null;

        if (mirroredDay1Entry) {
          deliveryEntry = (await tx.hutApplicationPhotoEntry.update?.({
            data: {
              useDayNumber: 0
            },
            select: hutApplicationPhotoEntrySelect,
            where: { id: mirroredDay1Entry.id }
          })) as HutApplicationPhotoEntryRecord;
        } else {
          deliveryEntry = (await tx.hutApplicationPhotoEntry.create?.({
            data: {
              capturedAt: sourceEvidence.capturedAt,
              capturedLocalDate: hutLocalDateKey(sourceEvidence.capturedAt),
              capturedLocalTimezone: "America/Mexico_City",
              extension: extensionFromFilename(sourceEvidence.privateStorageKey),
              mimeType: "image/jpeg",
              originalFilename: null,
              participantId: participant.id,
              privateStorageKey: sourceEvidence.privateStorageKey,
              productCode: sourceEvidence.productCode,
              sizeBytes: 0,
              storageBucket: sourceEvidence.storageBucket,
              useDayNumber: 0
            },
            select: hutApplicationPhotoEntrySelect
          })) as HutApplicationPhotoEntryRecord;
        }

        await tx.hutParticipant.update?.({
          data: nextApplicationPhotoParticipantStateForSlot("DELIVERY"),
          where: { id: participant.id }
        });
        await tx.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId,
            afterJson: toAuditJson({
              action: "HUT_INITIAL_EVIDENCE_MOVED_TO_DELIVERY",
              deliveryEntry,
              reasonDetail: input.reason?.trim() || null,
              sourceEvidence,
              updatedAt: new Date()
            }),
            beforeJson,
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: "HUT_LINK_RECOVERY"
          }
        });

        return {
          data: { participantId: participant.id, useDayNumber: 0 },
          message: "Evidencia inicial regularizada como entrega. Producto 1 Dia 1 queda pendiente para captura real.",
          ok: true
        };
      });
    },

    async releaseApplicationPhotoSlot(input) {
      const prisma = await getPrisma();
      const reason = input.reason.trim();
      if (!reason) {
        return { message: "El motivo es obligatorio para liberar un slot fotografico.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "El control manual de slots aplica solo a APPLICATION_PHOTO.", ok: false };
      }
      const definition = getHutPhotoTimelineSlotDefinition(input.slotId);
      if (!definition?.participantTask) {
        return { message: "Este slot HUT no requiere captura fotografica.", ok: false };
      }
      if (definition.useDayNumber !== null && blockingApplicationPhotoEntryByUseDayNumber(participant, definition.useDayNumber)) {
        return { message: "Este slot ya tiene foto. Usa solicitar repeticion si necesitas una nueva captura.", ok: false };
      }

      await createHutPhotoSlotOverrideAudit({
        actorUserId: input.actorUserId,
        participant,
        prisma,
        reason,
        slotId: input.slotId,
        type: "RELEASE"
      });

      return {
        data: { participantId: participant.id, slotId: input.slotId },
        message: "Slot fotografico liberado manualmente.",
        ok: true
      };
    },

    async releaseSecondProduct(input) {
      const prisma = await getPrisma();
      const reason = input.reason.trim();
      if (!reason) {
        return { message: "El motivo es obligatorio para liberar el segundo producto.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "La liberacion de segundo producto aplica solo a APPLICATION_PHOTO.", ok: false };
      }
      await attachSecondProductRelease(prisma, participant);

      if (!isFirstFragranceEvaluationCompleted(participant)) {
        return { message: "Completa primero la evaluacion del primer perfume antes de liberar Producto 2.", ok: false };
      }
      if (isSecondProductReleased(participant)) {
        return {
          data: {
            participantId: participant.id,
            releasedAt: participant.secondProductRelease?.releasedAt ?? new Date()
          },
          message: "El segundo producto ya estaba liberado.",
          ok: true
        };
      }

      const releasedAt = new Date();
      await createHutSecondProductReleaseAudit({
        actorUserId: input.actorUserId,
        participant,
        prisma,
        reason,
        releasedAt
      });
      participant.secondProductRelease = {
        actorUserId: input.actorUserId,
        reasonDetail: reason,
        releasedAt,
        releasedAtMexicoCity: formatDateTimeMexicoCity(releasedAt)
      };

      return {
        data: { participantId: participant.id, releasedAt },
        message: "Segundo producto liberado correctamente.",
        ok: true
      };
    },

    async authorizeSecondStage(input) {
      const prisma = await getPrisma();
      const submittedCode = normalizeHutPhaseCode(input.code);
      if (!submittedCode) {
        return { message: "Captura el codigo maestro para autorizar la segunda etapa.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "La autorizacion de segunda etapa aplica solo a APPLICATION_PHOTO.", ok: false };
      }
      await attachSecondStageAuthorization(prisma, participant);

      if (!isProduct1PhotoCycleComplete(participant)) {
        return { message: "Completa primero las fotografias del Producto 1 antes de autorizar la segunda etapa.", ok: false };
      }
      if (isSecondStageAuthorized(participant)) {
        return {
          data: {
            authorizedAt: participant.secondStageAuthorization?.authorizedAt ?? new Date(),
            participantId: participant.id
          },
          message: "La segunda etapa ya estaba autorizada.",
          ok: true
        };
      }

      const resolution = resolveHutOperationalStageCode(participant, "SECOND_STAGE");
      if (resolution.source === "NO_OPERATIONAL_CODE") {
        return {
          message: hutOperationalCodeUnavailableMessage(resolution.reason, resolution.slot),
          ok: false
        };
      }
      if (resolution.source === "LEGACY_PHASE_CODE") {
        return {
          data: {
            authorizedAt: new Date(),
            participantId: participant.id
          },
          message: "La segunda etapa ya estaba autorizada por codigo historico.",
          ok: true
        };
      }
      if (normalizeHutPhaseCode(resolution.code) !== submittedCode) {
        return { message: `El codigo maestro slot ${resolution.slot} no es correcto.`, ok: false };
      }

      const authorizedAt = new Date();
      await createHutSecondStageAuthorizationAudit({
        accessCode: input.accessCode ?? null,
        accessType: input.accessType,
        actorUserId: input.actorUserId ?? null,
        authorizedAt,
        participant,
        prisma
      });
      participant.secondStageAuthorization = {
        accessCode: input.accessCode ?? null,
        accessType: input.accessType,
        actorUserId: input.actorUserId ?? null,
        authorizedAt,
        authorizedAtMexicoCity: formatDateTimeMexicoCity(authorizedAt)
      };

      return {
        data: { authorizedAt, participantId: participant.id },
        message: "Segunda etapa autorizada. Ya puedes iniciar la evaluacion del primer perfume.",
        ok: true
      };
    },

    async authorizeThirdStage(input) {
      const prisma = await getPrisma();
      const submittedCode = normalizeHutPhaseCode(input.code);
      if (!submittedCode) {
        return { message: "Captura el codigo maestro slot 3 para autorizar la etapa final.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "La autorizacion de etapa final aplica solo a APPLICATION_PHOTO.", ok: false };
      }
      await attachSecondProductRelease(prisma, participant);
      await attachThirdStageAuthorization(prisma, participant);

      if (!isFirstFragranceEvaluationCompleted(participant)) {
        return { message: "Completa primero la evaluacion del primer perfume antes de autorizar la etapa final.", ok: false };
      }
      if (!isSecondProductReleased(participant)) {
        return { message: "Libera primero el segundo producto antes de autorizar la etapa final.", ok: false };
      }
      if (isThirdStageAuthorized(participant)) {
        return {
          data: {
            authorizedAt: participant.thirdStageAuthorization?.authorizedAt ?? new Date(),
            participantId: participant.id
          },
          message: "La etapa final ya estaba autorizada.",
          ok: true
        };
      }

      const resolution = resolveHutOperationalStageCode(participant, "THIRD_STAGE");
      if (resolution.source === "NO_OPERATIONAL_CODE") {
        return {
          message: hutOperationalCodeUnavailableMessage(resolution.reason, resolution.slot),
          ok: false
        };
      }
      if (resolution.source === "LEGACY_PHASE_CODE") {
        return {
          data: {
            authorizedAt: new Date(),
            participantId: participant.id
          },
          message: "La etapa final ya estaba autorizada por codigo historico.",
          ok: true
        };
      }
      if (normalizeHutPhaseCode(resolution.code) !== submittedCode) {
        return { message: `El codigo maestro slot ${resolution.slot} no es correcto.`, ok: false };
      }

      const authorizedAt = new Date();
      await createHutThirdStageAuthorizationAudit({
        accessCode: input.accessCode ?? null,
        accessType: input.accessType,
        actorUserId: input.actorUserId ?? null,
        authorizedAt,
        participant,
        prisma
      });
      participant.thirdStageAuthorization = {
        accessCode: input.accessCode ?? null,
        accessType: input.accessType,
        actorUserId: input.actorUserId ?? null,
        authorizedAt,
        authorizedAtMexicoCity: formatDateTimeMexicoCity(authorizedAt)
      };

      return {
        data: { authorizedAt, participantId: participant.id },
        message: "Etapa final autorizada. Ya puedes confirmar uso del segundo perfume y capturar comparativa.",
        ok: true
      };
    },

    async requestApplicationPhotoSlotRepeat(input) {
      const prisma = await getPrisma();
      const reason = input.reason.trim();
      if (!reason) {
        return { message: "El motivo es obligatorio para solicitar repeticion.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "El control manual de slots aplica solo a APPLICATION_PHOTO.", ok: false };
      }
      const definition = getHutPhotoTimelineSlotDefinition(input.slotId);
      if (!definition?.participantTask) {
        return { message: "Este slot HUT no requiere captura fotografica.", ok: false };
      }
      if (definition.useDayNumber !== null && !blockingApplicationPhotoEntryByUseDayNumber(participant, definition.useDayNumber)) {
        return { message: "Este slot aun no tiene foto registrada para solicitar repeticion.", ok: false };
      }

      await createHutPhotoSlotOverrideAudit({
        actorUserId: input.actorUserId,
        participant,
        prisma,
        reason,
        slotId: input.slotId,
        type: "REPEAT"
      });

      return {
        data: { participantId: participant.id, slotId: input.slotId },
        message: "Repeticion de slot fotografico solicitada.",
        ok: true
      };
    },

    async getRegistrationView(token, requestOrigin) {
      const prisma = await getPrisma();
      const slot = (await prisma.hutRegistrationSlot.findUnique?.({
        select: registrationSlotSelect,
        where: { registrationToken: token }
      })) as HutRegistrationSlotRecord | null;

      if (!slot) {
        return { message: "Este link de registro HUT no es valido.", ok: false };
      }

      return {
        data: {
          firstFragranceLeftArm: slot.firstFragranceLeftArm,
          folio: slot.folio,
          participantLink: slot.participant ? participantLink(requestOrigin, slot.participant.token) : null,
          participantName: slot.participant?.name ?? null,
          registrationToken: slot.registrationToken,
          secondFragranceRightArm: slot.secondFragranceRightArm,
          status: slot.status,
          studyName: slot.study.name
        },
        ok: true
      };
    },

    async startBlock(input) {
      const prisma = await getPrisma();

      const result: HutActionResult<{ participantId: string }> = await prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }

        if (participant.status === "DISQUALIFIED" || participant.status === "COMPLETED") {
          return { message: "Este participante ya no puede iniciar otro bloque.", ok: false };
        }

        if (input.blockNumber === 2 && !callForBlock(participant, 1, "COMPLETED")) {
          return { message: "Completa la evaluacion telefonica 1 antes de iniciar el bloque 2.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block) {
          return { message: "No encontramos el bloque HUT.", ok: false };
        }

        await tx.hutBlock.update?.({
          data: {
            startDate: input.startDate,
            status: "IN_PROGRESS"
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: input.blockNumber,
            currentVideoSequence: Math.min(block.submittedVideosCount + 1, block.requiredVideos),
            startDate: input.blockNumber === 1 ? input.startDate : participant.startDate,
            status: participantStatusForStartedBlock(input.blockNumber)
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: `Bloque ${input.blockNumber} iniciado correctamente.`,
          ok: true
        };
      });

      return result;
    },

    async markMissedDay(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "El participante no tiene un bloque activo.", ok: false };
        }

        const blockDayNumber = nextBlockDayNumber(participant, block);
        if (blockDayNumber > HUT_MAX_BLOCK_CALENDAR_DAYS) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: "Excedio la duracion maxima de 4 dias calendario del bloque."
          });
          return {
            data: { participantId: participant.id },
            message: "Participante marcado como no apto por exceder la tolerancia del bloque.",
            ok: true
          };
        }

        const decision = applyHutMissedDay(block);
        await tx.hutDailyCheck.create?.({
          data: {
            blockDayNumber,
            blockId: block.id,
            blockNumber: block.blockNumber,
            date: now,
            expectedVideoSequence: nextHutVideoSequence(block) ?? block.requiredVideos,
            participantId: participant.id,
            reminderSentAt: input.reminderSent ? now : null,
            status: input.reminderSent && !decision.disqualified ? "REMINDER_SENT" : decision.reminderStatus
          }
        });

        if (decision.disqualified) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: decision.disqualificationReason
          });
          return {
            data: { participantId: participant.id },
            message: "Participante marcado como no apto por exceder la tolerancia total del bloque.",
            ok: true
          };
        }

        await tx.hutBlock.update?.({
          data: {
            missedDaysCount: decision.missedDaysCount
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            status: decision.participantStatus
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: "Dia omitido registrado. La tolerancia del bloque quedo consumida.",
          ok: true
        };
      });
    },

    async syncParticipantProfileFromLinkedNav(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const profileData = linkedNavProfileData(participant);

        if (!profileData) {
          return { message: "Este HUT no tiene un participante NAV vinculado.", ok: false };
        }

        await tx.hutParticipant.update?.({
          data: profileData,
          where: { id: participant.id }
        });

        return {
          data: {
            email: profileData.email,
            name: profileData.name,
            participantId: participant.id,
            phone: profileData.phone
          },
          message: "Datos HUT sincronizados desde el participante NAV vinculado.",
          ok: true
        };
      });
    },

    async previewReservedHutNavReconciliation(input) {
      const prisma = await getPrisma();
      const preview = await buildReservedHutNavReconciliationPreview(prisma, input.studyId);

      return {
        data: preview,
        ok: true
      };
    },

    async reconcileReservedHutNavParticipants(input) {
      if (normalizeHutText(input.confirmation) !== "RECONCILIAR HUT") {
        return { message: "Escribe RECONCILIAR HUT para aplicar la reconciliacion.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const preview = await buildReservedHutNavReconciliationPreview(tx, input.studyId);
        const rows = preview.rows.filter((row) => row.canApply);

        for (const row of rows) {
          await tx.hutParticipant.update?.({
            data: {
              email: row.navEmail,
              name: row.navName ?? row.currentName ?? row.hutFolio,
              origin: row.nextOrigin,
              phone: row.navPhone,
              studyParticipantId: row.navStudyParticipantId
            },
            where: { id: row.hutParticipantId }
          });
        }

        return {
          data: {
            skipped: preview.rows.length - rows.length,
            updated: rows.length
          },
          message: `Reconciliacion HUT completada. Actualizados: ${rows.length}. Omitidos: ${preview.rows.length - rows.length}.`,
          ok: true
        };
      });
    },

    async reconcileReservedHutParticipantForStudyParticipant(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const confirmation = (await tx.participantConfirmation.findFirst?.({
          select: {
            folio: true,
            studyId: true
          },
          where: { studyParticipantId: input.studyParticipantId }
        })) as { folio: string; studyId: string } | null;

        if (!confirmation) {
          return {
            data: { hutFolio: null, participantId: null, updated: false },
            message: "El participante NAV aun no tiene folio confirmado.",
            ok: true
          };
        }

        const hutFolio = navFolioToReservedHutFolio(confirmation.folio);
        if (!hutFolio) {
          return {
            data: { hutFolio: null, participantId: null, updated: false },
            message: "El folio NAV no corresponde al rango HUT reservado.",
            ok: true
          };
        }

        const preview = await buildReservedHutNavReconciliationPreview(tx, confirmation.studyId, [hutFolio]);
        const row = preview.rows.find((item) => item.hutFolio === hutFolio) ?? null;

        if (!row || !row.canApply) {
          return {
            data: { hutFolio, participantId: row?.hutParticipantId ?? null, updated: false },
            message: row?.reason ?? "No hay HUT reservado para reconciliar.",
            ok: true
          };
        }

        await tx.hutParticipant.update?.({
          data: {
            email: row.navEmail,
            name: row.navName ?? row.currentName ?? row.hutFolio,
            origin: row.nextOrigin,
            phone: row.navPhone,
            studyParticipantId: row.navStudyParticipantId
          },
          where: { id: row.hutParticipantId }
        });

        return {
          data: { hutFolio, participantId: row.hutParticipantId, updated: true },
          message: "HUT reservado reconciliado con participante NAV.",
          ok: true
        };
      });
    },

    async assignParticipantRotation(input) {
      const manualRotation = normalizeManualRotation({
        firstFragranceLeftArm: input.firstFragranceLeftArm,
        folio: input.folio,
        secondFragranceRightArm: input.secondFragranceRightArm
      });
      if (!input.slotId && !manualRotation.ok) {
        return { message: manualRotation.message, ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const slot = input.slotId
          ? ((await tx.hutRegistrationSlot.findUnique?.({
              select: registrationSlotSelect,
              where: { id: input.slotId }
            })) as HutRegistrationSlotRecord | null)
          : null;

        if (input.slotId && (!slot || slot.studyId !== input.studyId)) {
          return { message: "No encontramos el folio HUT seleccionado.", ok: false };
        }
        if (slot && (slot.status !== "AVAILABLE" || slot.participantId)) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const rotation = slot
          ? {
              firstFragranceLeftArm: slot.firstFragranceLeftArm,
              folio: slot.folio,
              secondFragranceRightArm: slot.secondFragranceRightArm
            }
          : manualRotation.ok
            ? manualRotation.data
            : null;

        if (!rotation) {
          return { message: "Captura folio y rotacion HUT.", ok: false };
        }

        const duplicate = await findParticipantByFolio(tx, {
          excludeParticipantId: participant.id,
          folio: rotation.folio,
          studyId: input.studyId
        });
        if (duplicate) {
          return { message: "Ya existe un participante HUT con ese folio.", ok: false };
        }

        const profileData = linkedNavProfileData(participant);

        await releaseParticipantRegistrationSlot(tx, participant.id);
        await tx.hutParticipant.update?.({
          data: {
            firstFragranceLeftArm: rotation.firstFragranceLeftArm,
            folio: rotation.folio,
            ...(profileData ?? {}),
            secondFragranceRightArm: rotation.secondFragranceRightArm
          },
          where: { id: participant.id }
        });

        if (slot) {
          await tx.hutRegistrationSlot.update?.({
            data: {
              participantId: participant.id,
              registeredAt: new Date(),
              status: "REGISTERED"
            },
            where: { id: slot.id }
          });
        }

        return {
          data: { participantId: participant.id },
          message: "Folio y rotacion asignados correctamente.",
          ok: true
        };
      });
    },

    async deleteParticipant(input) {
      if (input.confirmation.trim() !== "ELIMINAR PARTICIPANTE HUT") {
        return { message: "Escribe ELIMINAR PARTICIPANTE HUT para confirmar.", ok: false };
      }

      const prisma = await getPrisma();

      const result: HutActionResult<{ participantId: string }> = await prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        await releaseParticipantRegistrationSlot(tx, participant.id);
        await tx.hutVisualVerification.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutVideoSubmission.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutDailyCheck.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutApplicationEvidence?.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutCallEvaluation.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutReferenceSelfie.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutBlock.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutParticipantPhaseCode.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutParticipant.delete?.({ where: { id: participant.id } });

        return {
          data: { participantId: participant.id },
          message: "Participante HUT eliminado correctamente. El folio asociado quedo disponible.",
          ok: true
        };
      });

      return result;
    },

    async sendRegistrationWhatsApp(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }

      const link = participantLink(input.requestOrigin, participant.token);
      const result = await sendHutRegistrationWhatsAppForParticipant({
        force: input.force ?? true,
        link,
        participantId: participant.id,
        prisma,
        whatsappRepository: getWhatsAppRepository()
      });

      if (!result.ok) {
        return { message: result.message, ok: false };
      }

      return {
        data: { participantId: participant.id },
        message: "WhatsApp de registro HUT enviado correctamente.",
        ok: true
      };
    },

    async sendPhotoReminderWhatsApp(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      await attachSecondProductRelease(prisma, participant);

      const prepared = await prepareHutPhotoReminder({
        enforceRecentDedupe: false,
        now,
        participant,
        prisma
      });
      if (!prepared.ok) {
        return { message: prepared.message, ok: false };
      }

      const result = await sendHutPhotoReminderForParticipant({
        actorUserId: input.actorUserId,
        manualReason: input.reason,
        participant,
        requestOrigin: input.requestOrigin,
        source: input.source ?? "MANUAL_ADMIN",
        ...prepared.data,
        now,
        prisma,
        whatsappRepository: getWhatsAppRepository()
      });

      return result.ok
        ? {
            data: result.data,
            message: "Recordatorio HUT enviado correctamente.",
            ok: true
          }
        : result;
    },

    async processPhotoWhatsAppReminders(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participants = (await prisma.hutParticipant.findMany?.({
        select: participantSelect,
        where: {
          ...(input.studyId ? { studyId: input.studyId } : {}),
          protocolVersion: "APPLICATION_PHOTO",
          qaParticipantRun: { is: null },
          status: { notIn: ["COMPLETED", "DISQUALIFIED"] }
        }
      })) as HutParticipantRecord[];
      const summary: HutPhotoReminderProcessResult = {
        failed: [],
        processed: participants.length,
        sent: 0,
        skipped: 0
      };

      for (const participant of participants) {
        await attachSecondProductRelease(prisma, participant);
        if (!isWithinHutPhotoReminderOperationalWindow(now)) {
          summary.skipped += 1;
          await auditSkippedHutPhotoReminder({
            decision: hutPhotoReminderExcluded(
              participant,
              now,
              ["OUTSIDE_OPERATIONAL_WINDOW"],
              hutPhotoReminderExclusionMessage("OUTSIDE_OPERATIONAL_WINDOW")
            ),
            now,
            participant,
            prisma
          });
          continue;
        }

        const prepared = await prepareHutPhotoReminder({
          enforceRecentDedupe: true,
          now,
          participant,
          prisma
        });

        if (!prepared.ok) {
          summary.skipped += 1;
          await auditSkippedHutPhotoReminder({
            decision: prepared,
            now,
            participant,
            prisma
          });
          continue;
        }

        const result = await sendHutPhotoReminderForParticipant({
          actorUserId: null,
          participant,
          requestOrigin: input.requestOrigin,
          source: "CRON",
          ...prepared.data,
          now,
          prisma,
          whatsappRepository: getWhatsAppRepository()
        });

        if (result.ok && result.data.whatsappStatus === "ENVIADO") {
          summary.sent += 1;
        } else {
          summary.failed.push({
            message: result.ok ? result.data.whatsappError ?? "No fue posible enviar el recordatorio HUT." : result.message,
            participantId: participant.id,
            slotId: prepared.data.slot.id as HutPhotoTimelineSlotId
          });
        }
      }

      return { data: summary, ok: true };
    },

    async resetReferenceSelfie(input) {
      if (input.confirmation.trim() !== "ELIMINAR SELFIE DE REGISTRO") {
        return { message: "Escribe ELIMINAR SELFIE DE REGISTRO para confirmar.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        await tx.hutVisualVerification.deleteMany?.({ where: { participantId: participant.id } });
        await tx.hutReferenceSelfie.deleteMany?.({ where: { participantId: participant.id } });

        return {
          data: { participantId: participant.id },
          message: "Selfie de registro eliminada. Las verificaciones diarias deberan repetirse.",
          ok: true
        };
      });
    },

    async resetVideoSubmission(input) {
      const expectedConfirmation = `RESTABLECER VIDEO ${input.sequenceNumber}`;
      const completedEvaluationConfirmation = `${expectedConfirmation} CON EVALUACION`;
      const confirmation = input.confirmation.trim();
      if (confirmation !== expectedConfirmation && confirmation !== completedEvaluationConfirmation) {
        return { message: `Escribe ${expectedConfirmation} para confirmar.`, ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block) {
          return { message: "No encontramos el bloque HUT.", ok: false };
        }

        const call = callByNumber(participant, input.blockNumber);
        if (call?.status === "COMPLETED" && confirmation !== completedEvaluationConfirmation) {
          return {
            message: `La evaluacion ${input.blockNumber} ya esta completada. Escribe ${completedEvaluationConfirmation} para restablecer el video y la evaluacion.`,
            ok: false
          };
        }

        await tx.hutVisualVerification.deleteMany?.({
          where: {
            blockNumber: input.blockNumber,
            participantId: participant.id,
            sequenceNumber: { gte: input.sequenceNumber }
          }
        });
        await tx.hutVideoSubmission.deleteMany?.({
          where: {
            blockNumber: input.blockNumber,
            participantId: participant.id,
            sequenceNumber: { gte: input.sequenceNumber }
          }
        });
        await tx.hutDailyCheck.deleteMany?.({
          where: {
            blockId: block.id,
            expectedVideoSequence: { gte: input.sequenceNumber },
            participantId: participant.id
          }
        });
        await tx.hutCallEvaluation.update?.({
          data: {
            completedAt: null,
            evaluatorName: null,
            notes: null,
            status: "PENDING"
          },
          where: {
            participantId_blockNumber: {
              blockNumber: input.blockNumber,
              participantId: participant.id
            }
          }
        });

        const remainingVideos = participant.videoSubmissions?.filter(
          (video) => video.blockNumber === input.blockNumber && video.sequenceNumber < input.sequenceNumber
        ).length ?? 0;
        const nextSequence = Math.min(remainingVideos + 1, block.requiredVideos);
        await tx.hutBlock.update?.({
          data: {
            completedAt: null,
            status: block.startDate ? "IN_PROGRESS" : "NOT_STARTED",
            submittedVideosCount: remainingVideos
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: input.blockNumber,
            currentVideoSequence: nextSequence,
            status: block.startDate ? participantStatusForStartedBlock(input.blockNumber) : "NOT_STARTED"
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: `Video ${input.sequenceNumber} restablecido. El siguiente esperado vuelve a ser video ${nextSequence}.`,
          ok: true
        };
      });
    },

    async resetCallEvaluation(input) {
      const expectedConfirmation = `RESTABLECER EVALUACION ${input.blockNumber}`;
      const block2Confirmation = `${expectedConfirmation} CON BLOQUE 2`;
      const confirmation = input.confirmation.trim();
      if (confirmation !== expectedConfirmation && confirmation !== block2Confirmation) {
        return { message: `Escribe ${expectedConfirmation} para confirmar.`, ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block) {
          return { message: "No encontramos el bloque HUT.", ok: false };
        }

        const block2HasProgress =
          input.blockNumber === 1 &&
          (participant.videoSubmissions?.some((video) => video.blockNumber === 2) ||
            blockByNumber(participant, 2)?.status !== "NOT_STARTED");
        if (block2HasProgress && confirmation !== block2Confirmation) {
          return {
            message: `El bloque 2 ya tiene avance. Escribe ${block2Confirmation} para restablecer el bloque 1 completo.`,
            ok: false
          };
        }

        await tx.hutVisualVerification.deleteMany?.({
          where: {
            blockNumber: input.blockNumber,
            participantId: participant.id
          }
        });
        await tx.hutVideoSubmission.deleteMany?.({
          where: {
            blockNumber: input.blockNumber,
            participantId: participant.id
          }
        });
        await tx.hutDailyCheck.deleteMany?.({
          where: {
            blockId: block.id,
            participantId: participant.id
          }
        });
        await tx.hutCallEvaluation.update?.({
          data: {
            completedAt: null,
            evaluatorName: null,
            notes: null,
            status: "PENDING"
          },
          where: {
            participantId_blockNumber: {
              blockNumber: input.blockNumber,
              participantId: participant.id
            }
          }
        });
        await tx.hutBlock.update?.({
          data: {
            completedAt: null,
            disqualificationReason: null,
            disqualifiedAt: null,
            missedDaysCount: 0,
            startDate: null,
            status: "NOT_STARTED",
            submittedVideosCount: 0
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: input.blockNumber,
            currentVideoSequence: 1,
            status: "NOT_STARTED"
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: `Bloque ${input.blockNumber} restablecido. El Video 1 esta disponible para iniciar de nuevo.`,
          ok: true
        };
      });
    },

    async resetApplicationPhotoEvidence(input) {
      if (input.confirmation.trim() !== "RESET EVIDENCIA HUT") {
        return { message: "Escribe RESET EVIDENCIA HUT para confirmar.", ok: false };
      }
      if (!input.reason.trim()) {
        return { message: "Captura el motivo del reset de evidencia fotografica.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "El reset de evidencia fotografica aplica solo al protocolo APPLICATION_PHOTO.", ok: false };
        }

        const evidence = participant.applicationEvidence?.find((item) => item.phase === input.phase) ?? null;
        if (!evidence) {
          return { message: "No hay evidencia fotografica registrada para esa fase.", ok: false };
        }

        const matchingDailyEntries = (participant.applicationPhotoEntries ?? []).filter(
          (entry) => entry.privateStorageKey === evidence.privateStorageKey
        );
        const beforeJson = toAuditJson({
          evidence,
          matchingDailyEntries,
          participant: {
            firstFragranceLeftArm: participant.firstFragranceLeftArm,
            folio: participant.folio,
            id: participant.id,
            secondFragranceRightArm: participant.secondFragranceRightArm,
            status: participant.status,
            studyParticipantId: participant.studyParticipantId
          }
        });

        await tx.hutApplicationPhotoEntry.deleteMany?.({
          where: {
            participantId: participant.id,
            privateStorageKey: evidence.privateStorageKey
          }
        });
        await tx.hutApplicationEvidence.deleteMany?.({
          where: {
            participantId: participant.id,
            phase: input.phase
          }
        });
        await tx.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId,
            afterJson: toAuditJson({
              action: "HUT_APPLICATION_PHOTO_EVIDENCE_RESET",
              phase: input.phase,
              resetAt: new Date()
            }),
            beforeJson,
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: input.reason.trim()
          }
        });

        return {
          data: { participantId: participant.id, phase: input.phase },
          message: "Evidencia fotografica reseteada. La fase queda lista para nueva captura.",
          ok: true
        };
      });
    },

    async resetQuestionnaireAttempt(input) {
      if (input.confirmation.trim() !== "RESET ENCUESTA HUT") {
        return { message: "Escribe RESET ENCUESTA HUT para confirmar.", ok: false };
      }
      if (!input.reason.trim()) {
        return { message: "Captura el motivo del reset de evaluacion HUT.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "El reset de encuesta HUT aplica solo al protocolo APPLICATION_PHOTO.", ok: false };
        }
        if (!participant.questionnaireAttempt) {
          return { message: "Este participante no tiene encuesta HUT iniciada.", ok: false };
        }

        const attempt = participant.questionnaireAttempt;
        const answerCount = attempt.answers?.length ?? 0;
        const visitCount = attempt.visits?.length ?? 0;
        const beforeJson = toAuditJson({
          answerCount,
          attempt,
          participant: {
            firstFragranceLeftArm: participant.firstFragranceLeftArm,
            folio: participant.folio,
            id: participant.id,
            secondFragranceRightArm: participant.secondFragranceRightArm,
            status: participant.status,
            studyParticipantId: participant.studyParticipantId
          },
          visitCount
        });

        await tx.hutAnswer.deleteMany?.({
          where: {
            attemptId: attempt.id
          }
        });
        await tx.hutVisitProgress.deleteMany?.({
          where: {
            attemptId: attempt.id
          }
        });
        await tx.hutQuestionnaireAttempt.update?.({
          data: {
            completedAt: null,
            startedAt: null,
            status: "PENDING",
            terminatedAt: null,
            terminationReason: null
          },
          where: { id: attempt.id }
        });
        await tx.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId,
            afterJson: toAuditJson({
              action: "HUT_QUESTIONNAIRE_ATTEMPT_RESET",
              answerCount,
              resetAt: new Date(),
              visitCount
            }),
            beforeJson,
            entityId: participant.id,
            entityType: "HutParticipant",
            reason: input.reason.trim()
          }
        });

        return {
          data: { participantId: participant.id },
          message: "Evaluacion HUT reseteada. Las fotos, fases, codigos y rotacion se conservaron.",
          ok: true
        };
      });
    },

    async completeCallEvaluation(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, input.blockNumber);
        if (!block || block.status !== "CALL_PENDING") {
          return { message: "El bloque todavia no esta listo para evaluacion telefonica.", ok: false };
        }

        await tx.hutCallEvaluation.update?.({
          data: {
            completedAt: now,
            evaluatorName: normalizeOptionalHutText(input.evaluatorName),
            notes: input.notes?.trim() || null,
            status: "COMPLETED"
          },
          where: {
            participantId_blockNumber: {
              blockNumber: input.blockNumber,
              participantId: participant.id
            }
          }
        });
        await tx.hutBlock.update?.({
          data: {
            completedAt: now,
            status: "COMPLETED"
          },
          where: { id: block.id }
        });

        if (input.blockNumber === 2) {
          await tx.hutParticipant.update?.({
            data: {
              status: "COMPLETED"
            },
            where: { id: participant.id }
          });
        } else {
          await tx.hutParticipant.update?.({
            data: {
              currentBlockNumber: 2,
              currentVideoSequence: 1,
              status: "NOT_STARTED"
            },
            where: { id: participant.id }
          });
        }

        return {
          data: { participantId: participant.id },
          message:
            input.blockNumber === 2
              ? "Evaluacion final completada. Participacion HUT finalizada."
              : "Evaluacion 1 completada. Ya puedes iniciar el bloque 2.",
          ok: true
        };
      });
    },

    async reactivateParticipant(input) {
      if (!input.reason.trim()) {
        return { message: "Captura el motivo de reactivacion.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const block = blockByNumber(participant, participant.currentBlockNumber as 1 | 2) ?? blockByNumber(participant, 1);
        if (!block) {
          return { message: "No encontramos el bloque a reactivar.", ok: false };
        }

        await tx.hutBlock.update?.({
          data: {
            disqualificationReason: null,
            status: "IN_PROGRESS"
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            status: participantStatusForStartedBlock(block.blockNumber),
            currentVideoSequence: nextHutVideoSequence(block) ?? block.requiredVideos
          },
          where: { id: participant.id }
        });

        return {
          data: { participantId: participant.id },
          message: "Participante HUT reactivado manualmente por supervisor/admin.",
          ok: true
        };
      });
    },

    async requestVideoUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      const block = activeBlock(participant);
      if (!block) {
        return { message: "No hay videos disponibles para subir en este momento.", ok: false };
      }

      const phaseBlock = pendingHutPhaseMessage(participant);
      if (phaseBlock) {
        return { message: phaseBlock, ok: false };
      }

      const availability = currentAvailability(participant, block, new Date());
      if (availability.reason !== "AVAILABLE_FOR_VIDEO") {
        return { message: videoUnavailableMessage(availability.reason), ok: false };
      }

      const sequenceNumber = nextHutVideoSequence(block);
      if (!sequenceNumber) {
        return { message: "Este bloque ya tiene todos sus videos.", ok: false };
      }

      try {
        const signed = await createHutSignedVideoUpload({
          blockNumber: block.blockNumber,
          metadata: input.metadata,
          participantId: participant.id,
          sequenceNumber,
          storage: input.storage,
          studyId: participant.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la carga del video.", ok: false };
      }
    },

    async requestReferenceSelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      if (participant.referenceSelfie && hasStartedHutBlockOneEvidence(participant)) {
        return { message: "La selfie de registro sólo puede reemplazarse antes de iniciar el Bloque 1.", ok: false };
      }

      try {
        const signed = await createHutSignedReferenceSelfieUpload({
          metadata: input.metadata,
          participantId: participant.id,
          storage: input.storage,
          studyId: participant.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie de registro.", ok: false };
      }
    },

    async confirmReferenceSelfieUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      const result: HutActionResult<{ participantId: string }> = await prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        if (participant.referenceSelfie && hasStartedHutBlockOneEvidence(participant)) {
          return { message: "La selfie de registro sólo puede reemplazarse antes de iniciar el Bloque 1.", ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la selfie de registro.", ok: false };
        }

        try {
          assertHutSelfieStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie de registro.", ok: false };
        }

        const existing = (await tx.hutReferenceSelfie.findFirst?.({
          select: { id: true },
          where: { participantId: participant.id }
        })) as { id: string } | null;
        const data = {
          capturedAt: now,
          capturedByRole: "INTERNAL_USER",
          capturedByUserId: input.actorUserId,
          extension: extensionFromFilename(input.metadata.originalFilename),
          mimeType: input.metadata.mimeType,
          originalFilename: input.metadata.originalFilename,
          privateStorageKey: input.metadata.privateStorageKey,
          sizeBytes: input.metadata.sizeBytes,
          storageBucket: input.metadata.storageBucket
        };

        if (existing) {
          await tx.hutReferenceSelfie.update?.({
            data,
            where: { id: existing.id }
          });
        } else {
          await tx.hutReferenceSelfie.create?.({
            data: {
              ...data,
              participantId: participant.id
            }
          });
        }

        return {
          data: { participantId: participant.id },
          message: "Selfie de registro guardada correctamente.",
          ok: true
        };
      });

      if (!result.ok) {
        return result;
      }

      const savedParticipant = await findParticipant(prisma, result.data.participantId);
      const link = savedParticipant ? participantLink(input.requestOrigin, savedParticipant.token) : "";
      const whatsappResult = await sendHutRegistrationWhatsAppForParticipant({
        force: false,
        link,
        participantId: result.data.participantId,
        prisma,
        whatsappRepository: getWhatsAppRepository()
      });

      if (!whatsappResult.ok) {
        return {
          data: result.data,
          message: `Selfie de registro guardada correctamente. ${whatsappResult.message}`,
          ok: true
        };
      }

      return {
        data: result.data,
        message: "Selfie de registro guardada correctamente. WhatsApp de registro HUT enviado correctamente.",
        ok: true
      };
    },

    async requestRegistrationSelfieUpload(input) {
      const prisma = await getPrisma();
      const slot = (await prisma.hutRegistrationSlot.findUnique?.({
        select: registrationSlotSelect,
        where: { registrationToken: input.token }
      })) as HutRegistrationSlotRecord | null;

      if (!slot) {
        return { message: "Este link de registro HUT no es valido.", ok: false };
      }
      if (slot.status !== "AVAILABLE" || slot.participantId) {
        return { message: "Este folio ya fue registrado.", ok: false };
      }

      try {
        const signed = await createHutSignedRegistrationSelfieUpload({
          metadata: input.metadata,
          slotId: slot.id,
          storage: input.storage,
          studyId: slot.studyId
        });
        return { data: signed, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie de registro.", ok: false };
      }
    },

    async completeRegistration(input) {
      const name = normalizeHutText(input.name);
      const phone = normalizeHutPhone(input.phone);
      const email = normalizeHutEmail(input.email);
      const recruiter = normalizeOptionalHutText(input.recruiter);

      if (!name) {
        return { message: "Captura el nombre del participante.", ok: false };
      }
      if (!phone) {
        return { message: "Captura el celular del participante.", ok: false };
      }
      if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
        return { message: "No fue posible validar la selfie de registro.", ok: false };
      }

      const prisma = await getPrisma();
      const now = new Date();

      const result: HutActionResult<{ participantId: string; participantLink: string }> = await prisma.$transaction(async (tx) => {
        const slot = (await tx.hutRegistrationSlot.findUnique?.({
          select: registrationSlotSelect,
          where: { registrationToken: input.token }
        })) as HutRegistrationSlotRecord | null;

        if (!slot) {
          return { message: "Este link de registro HUT no es valido.", ok: false };
        }
        if (slot.status !== "AVAILABLE" || slot.participantId) {
          return { message: "Este folio ya fue registrado.", ok: false };
        }

        const duplicate = await findParticipantByFolio(tx, {
          folio: slot.folio,
          studyId: slot.studyId
        });
        if (duplicate) {
          return { message: "Ya existe un participante HUT con ese folio.", ok: false };
        }

        try {
          assertHutRegistrationSelfieStorageKey({
            privateStorageKey: input.metadata.privateStorageKey,
            slotId: slot.id,
            studyId: slot.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie de registro.", ok: false };
        }

        const token = createHutParticipantToken();
        const participant = (await tx.hutParticipant.create?.({
          data: {
            currentBlockNumber: 1,
            currentVideoSequence: 1,
            email,
            firstFragranceLeftArm: slot.firstFragranceLeftArm,
            folio: slot.folio,
            name,
            origin: "HUT_DIRECTO",
            phone,
            protocolVersion: "LEGACY_VIDEO",
            recruiter,
            secondFragranceRightArm: slot.secondFragranceRightArm,
            startDate: now,
            status: "BLOCK_1_IN_PROGRESS",
            studyId: slot.studyId,
            token
          }
        })) as { id: string };

        await createHutParticipantFoundation(tx, {
          participantId: participant.id,
          startDate: now,
          startsNow: true
        });

        await tx.hutReferenceSelfie.create?.({
          data: {
            capturedAt: now,
            capturedByRole: "FIELD_REGISTRATION",
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket
          }
        });

        await tx.hutRegistrationSlot.update?.({
          data: {
            participantId: participant.id,
            registeredAt: now,
            status: "REGISTERED"
          },
          where: { id: slot.id }
        });

        return {
          data: {
            participantId: participant.id,
            participantLink: participantLink(input.requestOrigin, token)
          },
          message: "Registro HUT completado correctamente.",
          ok: true
        };
      });

      if (result.ok) {
        await sendHutRegistrationWhatsAppForParticipant({
          link: result.data.participantLink,
          participantId: result.data.participantId,
          prisma,
          whatsappRepository: getWhatsAppRepository()
        });
      }

      return result;
    },

    async requestDailySelfieUpload(input) {
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }

      const block = activeBlock(participant);
      if (!block) {
        return { message: "No hay actividad HUT disponible.", ok: false };
      }

      const phaseBlock = pendingHutPhaseMessage(participant);
      if (phaseBlock) {
        return { message: phaseBlock, ok: false };
      }

      const availability = currentAvailability(participant, block, new Date());
      if (availability.reason !== "AVAILABLE_FOR_SELFIE") {
        return { message: videoUnavailableMessage(availability.reason), ok: false };
      }

      if (!participant.referenceSelfie) {
        return { message: "Tu registro aun no esta completo. Contacta al encuestador.", ok: false };
      }

      try {
        const storage = input.storage ?? createSupabaseEvidenceStorageClient();
        const [signed, referenceSelfieSignedUrl] = await Promise.all([
          createHutSignedDailySelfieUpload({
            blockNumber: block.blockNumber,
            metadata: input.metadata,
            participantId: participant.id,
            sequenceNumber: availability.expectedVideoSequence,
            storage,
            studyId: participant.studyId
          }),
          storage.createSignedReadUrl({
            bucket: participant.referenceSelfie.storageBucket,
            expiresInSeconds: 60 * 10,
            privateStorageKey: participant.referenceSelfie.privateStorageKey
          })
        ]);
        return { data: { ...signed, referenceSelfieSignedUrl }, ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la selfie diaria.", ok: false };
      }
    },

    async requestApplicationPhotoUpload(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }
      if (isReservedHutWithoutOperationalIdentity(participant)) {
        return { message: reservedHutOperationalIdentityMessage(), ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }
      if (participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED") {
        return { message: "Completa los filtros HUT antes de registrar fotografias.", ok: false };
      }
      await attachSecondProductRelease(prisma, participant);

      const manualOverrides = await readActiveHutPhotoSlotOverrides(prisma, participant.id);
      const slotResult = resolveRequestedApplicationPhotoSlot(participant, input.slotId ?? null, now, manualOverrides);
      if (!slotResult.ok) {
        return { message: slotResult.message, ok: false };
      }
      const slot = slotResult.slot;
      if (!slot) {
        return { message: "No hay foto de aplicacion pendiente.", ok: false };
      }

      if (slot.useDayNumber !== null) {
        const capturedLocalDate = hutLocalDateKey(now);
        const manualOverride = Boolean(slot.manualOverride);
        const repeatOverride = slot.manualOverride?.type === "REPEAT";
        const existingDailyPhoto = blockingApplicationPhotoEntryByLocalDate(participant, capturedLocalDate, slot.useDayNumber);
        if (existingDailyPhoto && !participant.testMode && !manualOverride) {
          return { message: "Ya existe una foto de aplicacion registrada para el dia de hoy.", ok: false };
        }

        const existingSlotPhoto = blockingApplicationPhotoEntryByUseDayNumber(participant, slot.useDayNumber);
        if (existingSlotPhoto && !repeatOverride) {
          return { message: "Esta foto HUT ya fue registrada.", ok: false };
        }
      }
      const phase = storagePhaseForApplicationPhotoSlot(slot.id);

      try {
        const signed = await createHutSignedApplicationPhotoUpload({
          metadata: input.metadata,
          participantId: participant.id,
          phase,
          storage: input.storage,
          studyId: participant.studyId
        });
        return {
          data: {
            ...signed,
            phase,
            productCode: slot.productCode
          },
          ok: true
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la foto de aplicacion.", ok: false };
      }
    },

    async confirmApplicationPhotoUpload(input) {
      const prisma = await getPrisma();
      const now = input.now ?? new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "Este participante conserva el flujo HUT historico.", ok: false };
        }
        if (participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED") {
          return { message: "Completa los filtros HUT antes de registrar fotografias.", ok: false };
        }
        await attachSecondProductRelease(tx, participant);

        const manualOverrides = await readActiveHutPhotoSlotOverrides(tx, participant.id);
        const slotResult = resolveRequestedApplicationPhotoSlot(participant, input.slotId ?? null, now, manualOverrides);
        if (!slotResult.ok) {
          return { message: slotResult.message, ok: false };
        }
        const slot = slotResult.slot;
        if (!slot) {
          return { message: "No hay foto de aplicacion pendiente.", ok: false };
        }
        const phase = storagePhaseForApplicationPhotoSlot(slot.id);
        const capturedLocalDate = applicationPhotoCapturedLocalDate({
          now,
          testMode: participant.testMode,
          useDayNumber: slot.useDayNumber
        });

        if (slot.useDayNumber !== null) {
          const manualOverride = Boolean(slot.manualOverride);
          const repeatOverride = slot.manualOverride?.type === "REPEAT";
          const existingDailyPhoto = blockingApplicationPhotoEntryByLocalDate(participant, hutLocalDateKey(now), slot.useDayNumber);
          if (existingDailyPhoto && !participant.testMode && !manualOverride) {
            return { message: "Ya existe una foto de aplicacion registrada para el dia de hoy.", ok: false };
          }

          const existingSlotPhoto = blockingApplicationPhotoEntryByUseDayNumber(participant, slot.useDayNumber);
          if (existingSlotPhoto && !repeatOverride) {
            return { message: "Esta foto HUT ya fue registrada.", ok: false };
          }
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la foto de aplicacion.", ok: false };
        }

        try {
          assertHutApplicationPhotoStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la foto de aplicacion.", ok: false };
        }

        const repeatOverride = slot.manualOverride?.type === "REPEAT";
        const storeProduct1Day1AsDailyEntry = repeatOverride || (slot.id === "PRODUCT_1_DAY_1" && hasLegacyMirroredPlacementPhoto(participant));

        if (slot.id === "PRODUCT_1_DAY_1" && !storeProduct1Day1AsDailyEntry) {
          await tx.hutApplicationEvidence.create?.({
            data: {
              capturedAt: now,
              extension: extensionFromFilename(input.metadata.originalFilename),
              mimeType: input.metadata.mimeType,
              originalFilename: input.metadata.originalFilename,
              participantId: participant.id,
              phase,
              privateStorageKey: input.metadata.privateStorageKey,
              productCode: slot.productCode,
              sizeBytes: input.metadata.sizeBytes,
              storageBucket: input.metadata.storageBucket
            }
          });
        } else if (slot.useDayNumber !== null) {
          await tx.hutApplicationPhotoEntry.create?.({
            data: {
              capturedAt: now,
              capturedLocalDate,
              capturedLocalTimezone: "America/Mexico_City",
              extension: extensionFromFilename(input.metadata.originalFilename),
              mimeType: input.metadata.mimeType,
              originalFilename: input.metadata.originalFilename,
              participantId: participant.id,
              privateStorageKey: input.metadata.privateStorageKey,
              productCode: slot.productCode,
              sizeBytes: input.metadata.sizeBytes,
              storageBucket: input.metadata.storageBucket,
              useDayNumber: slot.useDayNumber
            }
          });
        }

        const phaseCode = slot.id === "PRODUCT_1_DAY_1"
          ? participant.phaseCodes?.find((code) => code.phase === phase) ?? null
          : null;
        if (phaseCode?.status === "VALIDATED") {
          await tx.hutParticipantPhaseCode.update?.({
            data: {
              status: "USED",
              usedAt: now
            },
            where: { id: phaseCode.id }
          });
        }

        await tx.hutParticipant.update?.({
          data: nextApplicationPhotoParticipantStateForSlot(slot.id),
          where: { id: participant.id }
        });
        if (slot.manualOverride) {
          await createHutPhotoSlotOverrideUsedAudit({
            actorUserId: slot.manualOverride.actorUserId ?? null,
            participant,
            prisma: tx,
            slotId: slot.id,
            type: slot.manualOverride.type,
            usedAt: now
          });
        }

        return {
          data: { phase },
          message: slot.id === "PRODUCT_2_DAY_3_MORNING" ? "Foto registrada correctamente. Espera la Evaluacion 2." : "Foto registrada correctamente.",
          ok: true
        };
      });
    },

    async confirmDailySelfieUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "No hay actividad HUT disponible.", ok: false };
        }

        const phaseBlock = pendingHutPhaseMessage(participant);
        if (phaseBlock) {
          return { message: phaseBlock, ok: false };
        }

        const availability = currentAvailability(participant, block, now);
        if (availability.reason !== "AVAILABLE_FOR_SELFIE") {
          return { message: videoUnavailableMessage(availability.reason), ok: false };
        }

        if (!participant.referenceSelfie) {
          return { message: "Tu registro aun no esta completo. Contacta al encuestador.", ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar la selfie diaria.", ok: false };
        }

        try {
          assertHutSelfieStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar la selfie diaria.", ok: false };
        }

        const normalized = normalizeNavigoFaceVerificationForStorage(input.faceVerification);
        const status = hutVisualStatusFromReview(normalized.reviewStatus);
        await tx.hutVisualVerification.create?.({
          data: {
            attemptExtension: extensionFromFilename(input.metadata.originalFilename),
            attemptMimeType: input.metadata.mimeType,
            attemptOriginalFilename: input.metadata.originalFilename,
            attemptSelfieKey: input.metadata.privateStorageKey,
            attemptSizeBytes: input.metadata.sizeBytes,
            attemptStorageBucket: input.metadata.storageBucket,
            blockId: block.id,
            blockNumber: block.blockNumber,
            participantId: participant.id,
            referenceSelfieKey: participant.referenceSelfie.privateStorageKey,
            sequenceNumber: availability.expectedVideoSequence,
            similarityScore: input.faceVerification?.score ?? null,
            status,
            verificationDate: now
          }
        });

        return {
          data: { status },
          message:
            status === "MATCHED"
              ? "Identidad confirmada. Ya puedes subir tu video."
              : "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.",
          ok: true
        };
      });
    },

    async setVisualOverride(input) {
      if (input.enabled && !input.reason.trim()) {
        return { message: "Captura el motivo del override visual.", ok: false };
      }

      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      await prisma.hutParticipant.update?.({
        data: {
          visualOverrideAt: input.enabled ? new Date() : null,
          visualOverrideByUserId: input.enabled ? input.actorUserId : null,
          visualOverrideEnabled: input.enabled,
          visualOverrideReason: input.enabled ? input.reason.trim() : null
        },
        where: { id: participant.id }
      });

      return {
        data: { participantId: participant.id },
        message: input.enabled ? "Override visual habilitado para este participante." : "Override visual deshabilitado.",
        ok: true
      };
    },

    async setTestMode(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      await prisma.hutParticipant.update?.({
        data: {
          testMode: input.enabled
        },
        where: { id: participant.id }
      });

      return {
        data: { participantId: participant.id },
        message: input.enabled ? "Modo prueba HUT activado para este participante." : "Modo prueba HUT desactivado.",
        ok: true
      };
    },

    async reviewVisualVerification(input) {
      const reason = input.reason.trim();
      if (!reason) {
        return { message: "Captura una nota obligatoria para la revision manual.", ok: false };
      }

      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const verification = participant.visualVerifications?.find((item) => item.id === input.verificationId) ?? null;
        if (!verification) {
          return { message: "No encontramos la verificacion visual.", ok: false };
        }

        const status =
          input.decision === "approve"
            ? "MATCHED"
            : input.decision === "reject"
              ? "NOT_MATCHED"
              : "PENDING_REVIEW";

        await tx.hutVisualVerification.update?.({
          data: {
            overrideReason: reason,
            reviewedAt: new Date(),
            reviewedByUserId: input.actorUserId,
            status
          },
          where: { id: verification.id }
        });

        return {
          data: { participantId: participant.id, verificationId: verification.id },
          message:
            input.decision === "approve"
              ? "Identidad aprobada manualmente."
              : input.decision === "reject"
                ? "Identidad marcada como no coincidente."
                : "Verificacion visual marcada en revision.",
          ok: true
        };
      });
    },

    async confirmVideoUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }

        const block = activeBlock(participant);
        if (!block) {
          return { message: "No hay videos disponibles para confirmar.", ok: false };
        }

        const phaseForVideo = expectedHutPhaseForParticipant(participant);
        const phaseCodeForVideo = phaseForVideo
          ? participant.phaseCodes?.find((code) => code.phase === phaseForVideo) ?? null
          : null;
        const phaseBlock = pendingHutPhaseMessage(participant);
        if (phaseBlock) {
          return { message: phaseBlock, ok: false };
        }

        const availability = currentAvailability(participant, block, now);
        if (availability.reason !== "AVAILABLE_FOR_VIDEO") {
          return { message: videoUnavailableMessage(availability.reason), ok: false };
        }

        if (input.metadata.storageBucket !== HUT_VIDEO_BUCKET) {
          return { message: "No fue posible validar el video cargado.", ok: false };
        }

        try {
          assertHutVideoStorageKey({
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            studyId: participant.studyId
          });
        } catch (error) {
          return { message: error instanceof Error ? error.message : "No fue posible validar el video cargado.", ok: false };
        }

        const sequenceNumber = nextHutVideoSequence(block);
        if (!sequenceNumber) {
          return { message: "Este bloque ya tiene todos sus videos.", ok: false };
        }

        const blockDayNumber = nextBlockDayNumber(participant, block);
        if (blockDayNumber > HUT_MAX_BLOCK_CALENDAR_DAYS) {
          await disqualifyParticipant(tx, {
            block,
            participant,
            reason: "Excedio la duracion maxima de 4 dias calendario del bloque."
          });
          return { message: "No es posible continuar porque se excedio la tolerancia del bloque.", ok: false };
        }

        const decision = applyHutVideoSubmission(block);
        const video = (await tx.hutVideoSubmission.create?.({
          data: {
            blockId: block.id,
            blockNumber: block.blockNumber,
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            privateStorageKey: input.metadata.privateStorageKey,
            sequenceNumber,
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket,
            submittedAt: now,
            status: "SUBMITTED"
          }
        })) as { id: string } | undefined;
        const verification = latestVerificationForSequence(participant, block.blockNumber, sequenceNumber);
        if (verification && video?.id) {
          await tx.hutVisualVerification.update?.({
            data: { videoSubmissionId: video.id },
            where: { id: verification.id }
          });
        }
        await tx.hutDailyCheck.create?.({
          data: {
            blockDayNumber,
            blockId: block.id,
            blockNumber: block.blockNumber,
            date: now,
            expectedVideoSequence: sequenceNumber,
            participantId: participant.id,
            status: "COMPLETED"
          }
        });
        await tx.hutBlock.update?.({
          data: {
            completedAt: decision.blockStatus === "CALL_PENDING" ? now : null,
            status: decision.blockStatus,
            submittedVideosCount: decision.submittedVideosCount
          },
          where: { id: block.id }
        });
        await tx.hutParticipant.update?.({
          data: {
            currentBlockNumber: block.blockNumber,
            currentVideoSequence: decision.nextVideoSequence,
            status: decision.participantStatus
          },
          where: { id: participant.id }
        });
        if (phaseCodeForVideo?.status === "VALIDATED") {
          await tx.hutParticipantPhaseCode.update?.({
            data: {
              status: "USED",
              usedAt: now
            },
            where: { id: phaseCodeForVideo.id }
          });
        }

        return {
          data: {
            blockNumber: block.blockNumber,
            sequenceNumber
          },
          message:
            decision.blockStatus === "CALL_PENDING"
              ? "Video recibido. Tu etapa de videos esta completa."
              : "Video recibido correctamente.",
          ok: true
        };
      });
    },

    async ensureHutPhaseCodesForParticipant(input) {
      const prisma = await getPrisma();
      void input.now;
      void input.secret;

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      return {
        data: {
          created: 0,
          existing: participant.phaseCodes?.length ?? 0,
          inconsistencies: []
        },
        message: "Los codigos HUT de fase se conservan solo como historico. La fuente operativa es ParticipantReferenceCode.",
        ok: true
      };
    },

    async recoverPhaseCode(input) {
      const prisma = await getPrisma();

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      if (isApplicationPhotoProtocol(participant)) {
        const resolution = resolveHutOperationalCode(participant, input.phase);

        if (resolution.source === "MASTER_REFERENCE_CODE") {
          return {
            data: {
              code: resolution.code,
              phase: input.phase
            },
            ok: true
          };
        }

        if (resolution.source === "NO_OPERATIONAL_CODE") {
          return {
            message: hutOperationalCodeUnavailableMessage(resolution.reason, resolution.slot),
            ok: false
          };
        }
      }

      const secret = input.secret ?? resolveHutPhaseCodeSecret();

      if (!secret) {
        return { message: "No fue posible recuperar el codigo HUT.", ok: false };
      }

      const phaseCode = participant.phaseCodes?.find((code) => code.phase === input.phase) ?? null;
      if (!phaseCode) {
        return { message: "No encontramos el codigo de esta fase HUT.", ok: false };
      }
      if (phaseCode.status === "REVOKED" || phaseCode.status === "EXPIRED") {
        return { message: "Este codigo HUT ya no esta vigente.", ok: false };
      }

      try {
        return {
          data: {
            code: decryptHutPhaseCode(phaseCode.encryptedCode, secret),
            phase: input.phase
          },
          ok: true
        };
      } catch {
        return { message: "No fue posible descifrar el codigo HUT.", ok: false };
      }
    },

    async regeneratePhaseCode(input) {
      const prisma = await getPrisma();
      const secret = input.secret ?? resolveHutPhaseCodeSecret();

      if (!secret) {
        return { message: "No fue posible regenerar el codigo HUT.", ok: false };
      }

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);
        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const slot = hutSlotForPhase(input.phase);
        const nextCode = await generateUniqueHutPhaseCode(tx, secret);
        const data = {
          codeHash: hashHutPhaseCode(nextCode, secret),
          encryptedCode: encryptHutPhaseCode(nextCode, secret),
          encryptionVersion: 1,
          expiresAt: null,
          sentAt: null,
          status: "GENERATED" as const,
          usedAt: null,
          validatedAt: null
        };
        const existing = participant.phaseCodes?.find((code) => code.phase === input.phase) ?? null;

        if (existing) {
          await tx.hutParticipantPhaseCode.update?.({
            data,
            where: { id: existing.id }
          });
        } else {
          await tx.hutParticipantPhaseCode.create?.({
            data: {
              ...data,
              participantId: participant.id,
              phase: input.phase,
              slot
            }
          });
        }

        return {
          data: {
            code: nextCode,
            phase: input.phase
          },
          message: "Codigo HUT regenerado correctamente. Muestralo ahora; no se guardara en texto plano.",
          ok: true
        };
      });
    },

    async revokePhaseCode(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);
        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        const phaseCode = participant.phaseCodes?.find((code) => code.phase === input.phase) ?? null;
        if (!phaseCode) {
          return { message: "No encontramos el codigo de esta fase HUT.", ok: false };
        }

        await tx.hutParticipantPhaseCode.update?.({
          data: {
            status: "REVOKED"
          },
          where: { id: phaseCode.id }
        });

        return {
          data: {
            participantId: participant.id,
            phase: input.phase
          },
          message: "Codigo HUT revocado correctamente.",
          ok: true
        };
      });
    },

    async validatePhaseCode(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }
        if (isReservedHutWithoutOperationalIdentity(participant)) {
          return { message: reservedHutOperationalIdentityMessage(), ok: false };
        }
        const expectedPhase = expectedHutPhaseForParticipant(participant);
        if (expectedPhase !== input.phase) {
          return { message: "Este codigo no corresponde a la fase actual.", ok: false };
        }

        if (isApplicationPhotoProtocol(participant)) {
          const resolution = resolveHutOperationalCode(participant, input.phase);

          if (resolution.source === "LEGACY_PHASE_CODE") {
            return {
              data: { phase: input.phase },
              message: "Codigo HUT ya validado para esta fase.",
              ok: true
            };
          }

          if (resolution.source === "NO_OPERATIONAL_CODE") {
            return {
              message: hutOperationalCodeUnavailableMessage(resolution.reason, resolution.slot),
              ok: false
            };
          }

          if (normalizeHutPhaseCode(resolution.code) !== normalizeHutPhaseCode(input.code)) {
            return { message: "El codigo HUT no es correcto.", ok: false };
          }

          return {
            data: { phase: input.phase },
            message: "Codigo HUT validado correctamente.",
            ok: true
          };
        }

        const secret = resolveHutPhaseCodeSecret();

        if (!secret) {
          return { message: "No fue posible validar el codigo HUT.", ok: false };
        }

        const phaseCode = participant.phaseCodes?.find((code) => code.phase === input.phase) ?? null;
        if (!phaseCode) {
          return { message: "No encontramos el codigo de esta fase HUT.", ok: false };
        }

        if (phaseCode.status === "USED" || phaseCode.status === "VALIDATED") {
          return {
            data: { phase: input.phase },
            message: "Codigo HUT ya validado para esta fase.",
            ok: true
          };
        }
        if (phaseCode.status === "EXPIRED" || phaseCode.status === "REVOKED") {
          return { message: "Este codigo HUT ya no esta vigente.", ok: false };
        }

        if (phaseCode.codeHash !== hashHutPhaseCode(input.code, secret)) {
          return { message: "El codigo HUT no es correcto.", ok: false };
        }

        const now = new Date();
        await tx.hutParticipantPhaseCode.update?.({
          data: {
            status: "VALIDATED",
            validatedAt: now
          },
          where: { id: phaseCode.id }
        });

        return {
          data: { phase: input.phase },
          message: "Codigo HUT validado correctamente.",
          ok: true
        };
      });
    },

    async exportProgress(input) {
      const dashboard = await createHutRepository(await getPrisma(), getWhatsAppRepository()).getAdminDashboard({
        requestOrigin: input.requestOrigin,
        studyId: input.studyId
      });

      if (!dashboard) {
        return { message: "No encontramos el estudio.", ok: false };
      }

      const rows = [
        [
          "ID",
          "Folio",
          "Nombre",
          "Celular",
          "Correo",
          "Reclutador",
          "Primera fragancia / brazo izquierdo",
          "Segunda fragancia / brazo derecho",
          "Link participante",
          "Estado general",
          "Bloque actual",
          "Video esperado",
          "Videos enviados bloque 1",
          "Dias omitidos bloque 1",
          "Evaluacion 1",
          "Videos enviados bloque 2",
          "Dias omitidos bloque 2",
          "Evaluacion 2",
          "No apto / motivo"
        ],
        ...dashboard.participants.map((participant) => [
          participant.id,
          participant.folio,
          participant.name,
          participant.phone,
          participant.email,
          participant.recruiter,
          participant.firstFragranceLeftArm,
          participant.secondFragranceRightArm,
          participant.link,
          participant.status,
          participant.currentBlockNumber,
          participant.currentVideoSequence,
          participant.block1?.submittedVideosCount ?? 0,
          participant.block1?.missedDaysCount ?? 0,
          participant.call1?.status ?? "PENDING",
          participant.block2?.submittedVideosCount ?? 0,
          participant.block2?.missedDaysCount ?? 0,
          participant.call2?.status ?? "PENDING",
          participant.block1?.disqualificationReason ?? participant.block2?.disqualificationReason ?? ""
        ]),
        [],
        [
          "Folio",
          "Link de registro",
          "Link participante",
          "Estado",
          "Nombre participante",
          "Celular",
          "Primera fragancia / brazo izquierdo",
          "Segunda fragancia / brazo derecho",
          "Selfie de registro"
        ],
        ...dashboard.registrationSlots.map((slot) => [
          slot.folio,
          slot.link,
          slot.participantLink,
          slot.status,
          slot.participantName,
          slot.phone,
          slot.firstFragranceLeftArm,
          slot.secondFragranceRightArm,
          slot.referenceSelfieStatus
        ])
      ];

      const now = input.now ?? new Date();
      return {
        data: {
          body: buildHutTsv(rows),
          filename: `${dashboard.study.code}_hut_avance_${dateForFilename(now)}.tsv`
        },
        ok: true
      };
    }
  };
}

async function findExistingParticipant(
  prisma: HutPrismaClient,
  input: { email: string | null; phone: string | null; studyId: string }
) {
  const or = [
    input.phone ? { phone: input.phone } : null,
    input.email ? { email: input.email } : null
  ].filter(Boolean);

  if (or.length === 0) {
    return null;
  }

  return (await prisma.hutParticipant.findFirst?.({
    select: {
      id: true,
      token: true
    },
    where: {
      OR: or,
      studyId: input.studyId
    }
  })) as { id: string; token: string } | null;
}

async function findParticipantByFolio(
  prisma: HutPrismaClient,
  input: { excludeParticipantId?: string; folio: string; studyId: string }
) {
  const participant = (await prisma.hutParticipant.findFirst?.({
    select: {
      id: true,
      token: true
    },
    where: {
      folio: input.folio,
      studyId: input.studyId
    }
  })) as { id: string; token: string } | null;

  if (participant && participant.id !== input.excludeParticipantId) {
    return participant;
  }

  return null;
}

function normalizeManualRotation(input: {
  firstFragranceLeftArm?: string | null;
  folio?: string | null;
  secondFragranceRightArm?: string | null;
}):
  | { ok: true; data: { firstFragranceLeftArm: string; folio: string; secondFragranceRightArm: string } | null }
  | { ok: false; message: string } {
  const folio = normalizeHutText(input.folio);
  const firstFragranceLeftArm = normalizeHutText(input.firstFragranceLeftArm);
  const secondFragranceRightArm = normalizeHutText(input.secondFragranceRightArm);

  if (!folio && !firstFragranceLeftArm && !secondFragranceRightArm) {
    return { data: null, ok: true };
  }
  if (!folio || !firstFragranceLeftArm || !secondFragranceRightArm) {
    return { message: "Captura folio, primera fragancia y segunda fragancia.", ok: false };
  }

  return {
    data: {
      firstFragranceLeftArm,
      folio,
      secondFragranceRightArm
    },
    ok: true
  };
}

async function releaseParticipantRegistrationSlot(tx: HutPrismaClient, participantId: string) {
  await tx.hutRegistrationSlot.updateMany?.({
    data: {
      participantId: null,
      registeredAt: null,
      status: "AVAILABLE"
    },
    where: { participantId }
  });
}

async function ensureHutQuestionnaireAttemptForParticipant(
  prisma: HutPrismaClient,
  input: {
    now?: Date;
    participantId: string;
    studyId: string;
  }
): Promise<HutActionResult<HutQuestionnaireAttemptSummary>> {
  const participant = (await prisma.hutParticipant.findUnique?.({
    select: {
      id: true,
      protocolVersion: true,
      studyId: true
    },
    where: { id: input.participantId }
  })) as Pick<HutParticipantRecord, "id" | "protocolVersion" | "studyId"> | null;

  if (!participant || participant.studyId !== input.studyId) {
    return { message: "No encontramos el participante HUT.", ok: false };
  }
  if (!isApplicationPhotoProtocol(participant)) {
    return { message: "Este participante conserva el flujo HUT historico.", ok: false };
  }

  const now = input.now ?? new Date();
  const attempt = (await prisma.hutQuestionnaireAttempt.upsert?.({
    create: {
      participantId: participant.id,
      startedAt: now,
      status: "PENDING"
    },
    select: hutQuestionnaireAttemptSelect,
    update: {},
    where: { participantId: participant.id }
  })) as HutQuestionnaireAttemptRecord;

  return {
    data: toQuestionnaireAttemptSummary(attempt),
    ok: true
  };
}

async function ensureHutQuestionnaireSectionProgressInternal(
  prisma: HutPrismaClient,
  input: {
    attemptId?: string;
    now?: Date;
    participantId: string;
    section: HutQuestionnaireSectionId;
    studyId: string;
  }
): Promise<HutActionResult<HutQuestionnaireProgressSummary & { id: string }>> {
  const prepared = input.attemptId
    ? {
        data: {
          completedAt: null,
          id: input.attemptId,
          participantId: input.participantId,
          startedAt: null,
          status: "IN_PROGRESS" as const,
          terminatedAt: null,
          terminationReason: null
        },
        ok: true as const
      }
    : await ensureHutQuestionnaireAttemptForParticipant(prisma, input);

  if (!prepared.ok) {
    return { message: prepared.message, ok: false };
  }

  const now = input.now ?? new Date();
  const visit = (await prisma.hutVisitProgress.upsert?.({
    create: {
      attemptId: prepared.data.id,
      section: input.section,
      startedAt: now,
      status: "IN_PROGRESS"
    },
    select: hutVisitProgressSelect,
    update: {
      startedAt: now,
      status: "IN_PROGRESS"
    },
    where: {
      attemptId_section: {
        attemptId: prepared.data.id,
        section: input.section
      }
    }
  })) as HutVisitProgressRecord;

  await prisma.hutQuestionnaireAttempt.update?.({
    data: {
      startedAt: prepared.data.startedAt ?? now,
      status: prepared.data.status === "PENDING" ? "IN_PROGRESS" : prepared.data.status
    },
    where: { id: prepared.data.id }
  });

  return {
    data: {
      ...toVisitProgressSummary(visit),
      id: visit.id
    },
    message: "Seccion HUT v5 iniciada correctamente.",
    ok: true
  };
}

function toQuestionnaireAttemptSummary(attempt: HutQuestionnaireAttemptRecord): HutQuestionnaireAttemptSummary {
  return {
    completedAt: attempt.completedAt,
    id: attempt.id,
    participantId: attempt.participantId,
    startedAt: attempt.startedAt,
    status: attempt.status,
    terminatedAt: attempt.terminatedAt,
    terminationReason: attempt.terminationReason
  };
}

function toVisitProgressSummary(visit: HutVisitProgressRecord): HutQuestionnaireProgressSummary {
  return {
    attemptId: visit.attemptId,
    completedAt: visit.completedAt,
    section: visit.section,
    startedAt: visit.startedAt,
    status: visit.status
  };
}

function toApplicationPhotoEntrySummary(entry: HutApplicationPhotoEntryRecord): HutApplicationPhotoEntrySummary {
  return {
    capturedAt: entry.capturedAt,
    capturedLocalDate: entry.capturedLocalDate,
    capturedLocalTimezone: entry.capturedLocalTimezone,
    id: entry.id,
    productCode: entry.productCode,
    useDayNumber: entry.useDayNumber
  };
}

async function generateUniqueHutPhaseCode(prisma: HutPrismaClient, secret: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateHutPhaseCode();
    const existing = await prisma.hutParticipantPhaseCode.findFirst?.({
      select: { id: true },
      where: { codeHash: hashHutPhaseCode(code, secret) }
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error("No fue posible generar un codigo HUT unico.");
}

async function toAdminParticipant(
  participant: HutParticipantRecord,
  requestOrigin: string,
  storage?: HutStorageClient,
  whatsappRepository?: OneuiWhatsAppRepository,
  photoSlotOverrides: HutPhotoTimelineManualOverride[] = []
): Promise<HutAdminParticipant> {
  const block1 = blockByNumber(participant, 1);
  const block2 = blockByNumber(participant, 2);
  const call1 = callByNumber(participant, 1);
  const call2 = callByNumber(participant, 2);
  const block = activeBlock(participant);
  const availability = block
    ? currentAvailability(participant, block, new Date())
    : { nextAvailableAt: null, reason: "BLOCK_NOT_ACTIVE" };
  const referenceSignedUrl = participant.referenceSelfie
    ? await signedStorageUrl(participant.referenceSelfie.privateStorageKey, participant.referenceSelfie.storageBucket, storage)
    : null;
  const identityReview = await buildIdentityReviewSummary(participant, referenceSignedUrl, storage);
  const applicationEvidence = await Promise.all(
    (participant.applicationEvidence ?? []).map(async (evidence) => ({
      capturedAt: evidence.capturedAt,
      phase: evidence.phase,
      privateStorageKey: evidence.privateStorageKey,
      productCode: evidence.productCode,
      signedUrl: await signedStorageUrl(evidence.privateStorageKey, evidence.storageBucket, storage)
    }))
  );
  const applicationPhotoEntries = await Promise.all(
    (participant.applicationPhotoEntries ?? []).map(async (entry) => ({
      capturedAt: entry.capturedAt,
      capturedLocalDate: entry.capturedLocalDate,
      capturedLocalTimezone: entry.capturedLocalTimezone,
      privateStorageKey: entry.privateStorageKey,
      productCode: entry.productCode,
      signedUrl:
        entry.privateStorageKey && entry.storageBucket
          ? await signedStorageUrl(entry.privateStorageKey, entry.storageBucket, storage)
          : null,
      useDayNumber: entry.useDayNumber
    }))
  );
  const questionnaire = toAdminQuestionnaireSummary(participant);
  const repository = whatsappRepository ?? createOneuiWhatsAppRepository();
  const whatsappRegistration = whatsappAutomationStatusFromMessage(
    await repository.findLatestOutboundTemplateMessage({
      linkedParticipantId: participant.id,
      linkedStudyId: participant.studyId,
      sourceModule: "HUT"
    })
  );

  return {
    applicationEvidence,
    applicationPhotoEntries,
    availability: {
      blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
      expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
      nextAvailableAt: availability.nextAvailableAt,
      reason: availability.reason
    },
    block1: block1 ? await toBlockSummary(block1, participant, storage) : null,
    block2: block2 ? await toBlockSummary(block2, participant, storage) : null,
    call1: call1 ? toCallSummary(call1) : null,
    call2: call2 ? toCallSummary(call2) : null,
    currentBlockNumber: participant.currentBlockNumber,
    currentVideoSequence: participant.currentVideoSequence,
    email: participant.email,
    firstFragranceLeftArm: participant.firstFragranceLeftArm,
    folio: participant.folio,
    id: participant.id,
    identityReview,
    link: participantLink(requestOrigin, participant.token),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    name: participant.name,
    origin: participantOrigin(participant),
    phaseCodes: toAdminPhaseCodes(participant),
    phone: participant.phone,
    photoSlotOverrides,
    product2GateOpen: isHutProduct2GateOpen(participant),
    secondStageAuthorization: participant.secondStageAuthorization ?? null,
    protocolVersion: participant.protocolVersion ?? "LEGACY_VIDEO",
    questionnaire,
    recruiter: participant.recruiter,
    reminderPending: Boolean(participant.dailyChecks?.some((check) => check.status === "REMINDER_PENDING")),
    referenceSelfie: participant.referenceSelfie
      ? {
          capturedAt: participant.referenceSelfie.capturedAt,
          signedUrl: referenceSignedUrl,
          status: "COMPLETE"
        }
      : {
          capturedAt: new Date(0),
          signedUrl: null,
          status: "MISSING"
        },
    registrationSlot: participant.registrationSlot
      ? {
          folio: participant.registrationSlot.folio,
          id: participant.registrationSlot.id,
          status: participant.registrationSlot.status
        }
      : null,
    status: participant.status,
    secondFragranceRightArm: participant.secondFragranceRightArm,
    secondProductRelease: participant.secondProductRelease ?? null,
    thirdStageAuthorization: participant.thirdStageAuthorization ?? null,
    studyParticipantId: participant.studyParticipantId ?? null,
    testMode: participant.testMode,
    token: participant.token,
    usedToleranceInCurrentBlock: Boolean(block && block.missedDaysCount >= block.maxMissedDaysAllowed),
    visualOverrideEnabled: participant.visualOverrideEnabled,
    whatsappRegistration,
    warnings: hutOperationalCompatibilityWarnings(participant)
  };
}

function toAdminPhaseCodes(participant: HutParticipantRecord): HutPhaseCodeAdmin[] {
  return (["COLOCACION", "REGRESO_1", "REGRESO_2"] as const).map((phase) => {
    const code = participant.phaseCodes?.find((item) => item.phase === phase) ?? null;
    const resolution = isApplicationPhotoProtocol(participant)
      ? resolveHutOperationalCode(participant, phase)
      : null;
    const operationalSlot = resolution?.source === "MASTER_REFERENCE_CODE"
      ? resolution.slot
      : resolution?.source === "NO_OPERATIONAL_CODE"
        ? resolution.slot
        : null;
    const operationalSource = resolution?.source === "MASTER_REFERENCE_CODE"
      ? "MASTER_REFERENCE_CODE"
      : resolution?.source === "LEGACY_PHASE_CODE"
        ? "HISTORICAL_PHASE_CODE"
        : "NONE";

    return {
      expiresAt: code?.expiresAt ?? null,
      label: hutOperationalPhaseCodeLabel(phase),
      legacySlot: code?.slot ?? null,
      operationalSlot,
      operationalSource,
      phase,
      sentAt: code?.sentAt ?? null,
      slot: code?.slot ?? operationalSlot ?? hutSlotForPhase(phase),
      status: code?.status ?? (operationalSource === "MASTER_REFERENCE_CODE" ? "GENERATED" : "MISSING"),
      updatedAt: code?.updatedAt ?? code?.createdAt ?? null,
      usedAt: code?.usedAt ?? null,
      validatedAt: code?.validatedAt ?? null
    };
  });
}

function toAdminQuestionnaireSummary(participant: HutParticipantRecord): HutQuestionnaireAdminSummary | null {
  const attempt = participant.questionnaireAttempt;
  if (!attempt) {
    return null;
  }

  const definition = getHutV5Definition();
  const questions = getHutQuestions(definition);
  const questionsByCode = new Map(questions.map((question) => [question.code, question]));
  const answers = Object.fromEntries((attempt.answers ?? []).map((answer) => [answer.questionCode, answer.answerJson]));
  const applicableQuestions = getHutApplicableQuestions({
    answers,
    context: { participantOrigin: participantOrigin(participant) },
    definition
  });
  const requiredQuestions = applicableQuestions.filter((question) => question.required);
  const answeredRequired = requiredQuestions.filter((question) => Object.prototype.hasOwnProperty.call(answers, question.code)).length;

  return {
    answeredRequired,
    answers: (attempt.answers ?? []).map((answer) => {
      const question = questionsByCode.get(answer.questionCode);
      return {
        answerValue: answer.answerJson,
        label: question?.label ?? answer.questionCode,
        questionCode: answer.questionCode,
        section: question?.section ?? null
      };
    }),
    attempt: toQuestionnaireAttemptSummary(attempt),
    omittedQuestionCodes: questions.filter((question) => !applicableQuestions.some((applicable) => applicable.code === question.code)).map((question) => question.code),
    totalRequired: requiredQuestions.length,
    visits: (attempt.visits ?? []).map(toVisitProgressSummary)
  };
}

async function sendHutCompletionMessageIfReady({
  actorUserId,
  now,
  participant,
  prisma,
  recentlyCompletedSection,
  visit,
  whatsappRepository
}: {
  actorUserId: string | null;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  recentlyCompletedSection: HutQuestionnaireSectionId;
  visit: HutVisitProgressRecord;
  whatsappRepository?: OneuiWhatsAppRepository;
}): Promise<boolean> {
  if (!isApplicationPhotoProtocol(participant) || participant.status === "DISQUALIFIED") {
    return false;
  }
  if (await hasHutCompletionMessageAudit(prisma, participant.id)) {
    return false;
  }

  const attempt = (await prisma.hutQuestionnaireAttempt.findUnique?.({
    select: hutQuestionnaireStateSelect,
    where: { participantId: participant.id }
  })) as HutQuestionnaireAttemptRecord | null;

  if (!attempt || attempt.status === "TERMINATED") {
    return false;
  }

  if (!isHutQuestionnaireFinalCompletionReady({ attempt, participant, recentlyCompletedSection, visit })) {
    return false;
  }

  const templateName = process.env.WHATSAPP_HUT_COMPLETION_TEMPLATE ?? "hut_completion_message";
  if (participant.qaParticipantRun) {
    await createHutCompletionMessageAudit({
      actorUserId,
      message: "Participante QA: no se envio WhatsApp real.",
      metaMessageId: null,
      now,
      participant,
      prisma,
      status: "SKIPPED",
      templateName
    });
    return true;
  }

  const result = await sendHutCompletionWhatsApp({
    now,
    participantId: participant.id,
    participantName: participant.name,
    phone: participant.phone,
    repository: whatsappRepository ?? createOneuiWhatsAppRepository(),
    studyId: participant.studyId
  });
  const whatsAppMessage = result.ok ? result.data : "data" in result ? result.data : undefined;

  await createHutCompletionMessageAudit({
    actorUserId,
    message: result.ok ? "Mensaje de cierre HUT enviado por WhatsApp." : result.message,
    metaMessageId: whatsAppMessage?.metaMessageId ?? null,
    now,
    participant,
    prisma,
    status: result.ok ? "ENVIADO" : "ERROR",
    templateName
  });

  return true;
}

function isHutQuestionnaireFinalCompletionReady({
  attempt,
  participant,
  recentlyCompletedSection,
  visit
}: {
  attempt: HutQuestionnaireAttemptRecord;
  participant: HutParticipantRecord;
  recentlyCompletedSection?: HutQuestionnaireSectionId;
  visit?: HutVisitProgressRecord;
}): boolean {
  if (!isApplicationPhotoProtocol(participant) || participant.status === "DISQUALIFIED" || attempt.status === "TERMINATED") {
    return false;
  }

  const answers = Object.fromEntries((attempt.answers ?? []).map((answer) => [answer.questionCode, answer.answerJson]));
  const applicableQuestions = getHutApplicableQuestions({
    answers,
    context: { participantOrigin: participantOrigin(participant) },
    definition: getHutV5Definition()
  }).filter((question) => question.required);
  const pendingQuestion = applicableQuestions.find((question) => !Object.prototype.hasOwnProperty.call(answers, question.code));

  if (pendingQuestion) {
    return false;
  }

  const completedSections = new Set(
    (attempt.visits ?? [])
      .filter((candidate) => candidate.status === "COMPLETED")
      .map((candidate) => candidate.section)
  );
  if (visit?.status === "COMPLETED" && recentlyCompletedSection) {
    completedSections.add(recentlyCompletedSection);
  }

  const operationalApplicableQuestions = applicableQuestions.filter((question) =>
    isHutOperationalPanelSection(question.section)
  );
  const requiredSections = new Set(operationalApplicableQuestions.map((question) => question.section));
  const hasPendingSection = [...requiredSections].some((section) => !completedSections.has(section));
  if (hasPendingSection) {
    return false;
  }

  const secondDeliverySectionCompleted = completedSections.has("SEGUNDA_VISITA");
  const secondUseSectionCompleted = completedSections.has("EVALUACION_SEGUNDO_PERFUME");
  if (!secondDeliverySectionCompleted || !secondUseSectionCompleted || !completedSections.has("COMPARATIVA")) {
    return false;
  }

  const secondDeliveryRequiredQuestions = operationalApplicableQuestions.filter((question) => question.section === "SEGUNDA_VISITA");
  const secondUseRequiredQuestions = operationalApplicableQuestions.filter((question) => question.section === "EVALUACION_SEGUNDO_PERFUME");
  const comparativeRequiredQuestions = operationalApplicableQuestions.filter((question) => question.section === "COMPARATIVA");
  if (secondDeliveryRequiredQuestions.length === 0 || secondUseRequiredQuestions.length === 0 || comparativeRequiredQuestions.length === 0) {
    return false;
  }

  const finalComparativeCodes = new Set([
    "HUT_P24_PREFERENCIA_GENERAL",
    "HUT_P25_COMPRA_PRIMERO",
    "HUT_P26_COMPRA_SEGUNDO",
    "HUT_P27_COMPARATIVA_ATRIBUTOS"
  ]);
  const applicableFinalComparativeCodes = comparativeRequiredQuestions
    .filter((question) => finalComparativeCodes.has(question.code))
    .map((question) => question.code);

  return (
    secondDeliveryRequiredQuestions.every((question) => Object.prototype.hasOwnProperty.call(answers, question.code)) &&
    secondUseRequiredQuestions.every((question) => Object.prototype.hasOwnProperty.call(answers, question.code)) &&
    applicableFinalComparativeCodes.length === finalComparativeCodes.size &&
    applicableFinalComparativeCodes.every((code) => Object.prototype.hasOwnProperty.call(answers, code))
  );
}

async function hasHutCompletionMessageAudit(prisma: HutPrismaClient, participantId: string): Promise<boolean> {
  const logs = (await prisma.auditLog.findMany?.({
    where: {
      entityId: participantId,
      entityType: "HutParticipant"
    }
  })) as Array<{ afterJson?: unknown; reason?: string | null }> | undefined;

  return Boolean(
    logs?.some((log) => {
      const metadata = isRecord(log.afterJson) ? log.afterJson : {};
      return (
        log.reason === "HUT_COMPLETION_MESSAGE" ||
        metadata.messageType === "HUT_COMPLETION_MESSAGE"
      );
    })
  );
}

async function createHutCompletionMessageAudit({
  actorUserId,
  message,
  metaMessageId,
  now,
  participant,
  prisma,
  status,
  templateName
}: {
  actorUserId: string | null;
  message: string;
  metaMessageId: string | null;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  status: "ENVIADO" | "ERROR" | "SKIPPED";
  templateName: string;
}) {
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        message,
        messageType: "HUT_COMPLETION_MESSAGE",
        metaMessageId,
        templateName,
        whatsappStatus: status
      }),
      beforeJson: null,
      createdAt: now,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: "HUT_COMPLETION_MESSAGE"
    }
  });
}

function hutFilterStatusFromParticipant(participant: HutParticipantRecord): HutQuestionnaireState["filterStatus"] {
  const attempt = participant.questionnaireAttempt;
  const answers = Object.fromEntries((attempt?.answers ?? []).map((answer) => [answer.questionCode, answer.answerJson]));

  return hutFilterStatus({
    answers,
    attemptStatus: attempt?.status ?? "PENDING",
    participantOrigin: participantOrigin(participant)
  });
}

function hutFilterStatus({
  answers,
  attemptStatus,
  participantOrigin
}: {
  answers: Record<string, unknown>;
  attemptStatus: HutQuestionnaireAttemptSummary["status"];
  participantOrigin: "CLT_HUT" | "HUT_DIRECTO";
}): HutQuestionnaireState["filterStatus"] {
  const filterQuestions = getHutApplicableQuestions({
    answers,
    context: { participantOrigin },
    definition: getHutV5Definition()
  }).filter((question) => question.section === "FILTROS" && question.required);

  const hasTerminatingFilterAnswer = filterQuestions.some((question) => {
    if (!Object.prototype.hasOwnProperty.call(answers, question.code)) {
      return false;
    }

    return getHutQuestionTerminationDecision(question, answers[question.code]).terminates;
  });

  if (attemptStatus === "TERMINATED" && hasTerminatingFilterAnswer) {
    return "REJECTED";
  }
  if (filterQuestions.every((question) => Object.prototype.hasOwnProperty.call(answers, question.code))) {
    return "COMPLETED";
  }

  return "PENDING";
}

async function sendHutRegistrationWhatsAppForParticipant({
  force,
  link,
  participantId,
  prisma,
  whatsappRepository
}: {
  force?: boolean;
  link: string;
  participantId: string;
  prisma: HutPrismaClient;
  whatsappRepository?: OneuiWhatsAppRepository;
}): Promise<HutActionResult<{ participantId: string }>> {
  const participant = (await prisma.hutParticipant.findUnique?.({
    select: participantSelect,
    where: { id: participantId }
  })) as HutParticipantRecord | null;
  if (!participant) {
    return { message: "No encontramos el participante HUT.", ok: false };
  }
  if (isLegacyVideoProtocol(participant) && !participant.referenceSelfie) {
    return { message: "Guarda la selfie de registro para habilitar el inicio del HUT.", ok: false };
  }
  if (participant.qaParticipantRun) {
    return { message: "Los participantes QA no envian WhatsApp real.", ok: false };
  }

  try {
    const repository = whatsappRepository ?? createOneuiWhatsAppRepository();
    const existingMessage = await repository.findLatestOutboundTemplateMessage({
      linkedParticipantId: participant.id,
      linkedStudyId: participant.studyId,
      sourceModule: "HUT"
    });

    const result = await sendHutRegistrationWhatsApp({
      existingMessage,
      firstFragranceLeftArm: participant.firstFragranceLeftArm,
      folio: participant.folio,
      force,
      link,
      participantId: participant.id,
      participantName: participant.name,
      phone: participant.phone,
      repository,
      secondFragranceRightArm: participant.secondFragranceRightArm,
      studyId: participant.studyId
    });

    if (!result.ok) {
      return { message: result.message, ok: false };
    }

    return { data: { participantId: participant.id }, ok: true };
  } catch (error) {
    console.error("hut whatsapp automation failed", {
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      participantId: participant.id,
      step: "send_registration_template",
      studyId: participant.studyId
    });
    return { message: "No fue posible enviar el WhatsApp de registro HUT.", ok: false };
  }
}

async function prepareHutPhotoReminder({
  enforceRecentDedupe,
  now,
  participant,
  prisma
}: {
  enforceRecentDedupe: boolean;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}): Promise<HutPhotoReminderEligibilityDecision> {
  return evaluateHutPhotoReminderEligibility({ enforceRecentDedupe, now, participant, prisma });
}

type HutPhotoReminderEligibilityDecision =
  | {
      data: { slot: NonNullable<ReturnType<typeof nextHutPhotoReminderCandidateSlot>> };
      ok: true;
    }
  | {
      exclusionReason: HutPhotoReminderExclusionReason;
      exclusionReasons: HutPhotoReminderExclusionReason[];
      message: string;
      ok: false;
      slotId: HutPhotoTimelineSlotId | null;
      slotTitle: string | null;
    };

async function evaluateHutPhotoReminderEligibility({
  enforceRecentDedupe,
  now,
  participant,
  prisma
}: {
  enforceRecentDedupe: boolean;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}): Promise<HutPhotoReminderEligibilityDecision> {
  const statusExclusions = hutPhotoReminderStatusExclusions(participant);
  if (statusExclusions.length > 0) {
    return hutPhotoReminderExcluded(participant, now, statusExclusions, hutPhotoReminderExclusionMessage(statusExclusions[0]));
  }

  const protocolExclusions = hutPhotoReminderProtocolExclusions(participant);
  if (protocolExclusions.length > 0) {
    return hutPhotoReminderExcluded(participant, now, protocolExclusions, hutPhotoReminderExclusionMessage(protocolExclusions[0]));
  }

  const manualOverrides = await readActiveHutPhotoSlotOverrides(prisma, participant.id);
  const slot = nextHutPhotoReminderCandidateSlot(participant, now, manualOverrides);
  if (!slot) {
    return hutPhotoReminderExcluded(participant, now, ["SLOT_NOT_AVAILABLE"], hutPhotoReminderExclusionMessage("SLOT_NOT_AVAILABLE"));
  }
  if (slot.id === "DELIVERY") {
    return hutPhotoReminderExcluded(
      participant,
      now,
      ["DELIVERY_NOT_REMINDABLE", ...protocolExclusions],
      hutPhotoReminderExclusionMessage("DELIVERY_NOT_REMINDABLE"),
      slot
    );
  }
  if (!participant.phone) {
    return hutPhotoReminderExcluded(participant, now, ["PHONE_MISSING"], hutPhotoReminderExclusionMessage("PHONE_MISSING"), slot);
  }
  if (participant.qaParticipantRun) {
    return hutPhotoReminderExcluded(participant, now, ["QA_PARTICIPANT"], hutPhotoReminderExclusionMessage("QA_PARTICIPANT"), slot);
  }
  if (enforceRecentDedupe && await hasRecentHutPhotoReminder(prisma, participant.id, slot.id as HutPhotoTimelineSlotId, now)) {
    return hutPhotoReminderExcluded(participant, now, ["RECENT_REMINDER"], hutPhotoReminderExclusionMessage("RECENT_REMINDER"), slot);
  }

  return { data: { slot }, ok: true };
}

async function sendHutPhotoReminderForParticipant({
  actorUserId,
  manualReason,
  now,
  participant,
  prisma,
  slot,
  source,
  whatsappRepository
}: {
  actorUserId: string | null;
  manualReason?: string;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  requestOrigin: string;
  slot: NonNullable<ReturnType<typeof nextHutPhotoReminderCandidateSlot>>;
  source: "CRON" | "MANUAL_ADMIN" | "MANUAL_SUPPORT";
  whatsappRepository?: OneuiWhatsAppRepository;
}): Promise<HutActionResult<HutPhotoReminderSendResult>> {
  const hutUrl = hutWhatsAppParticipantLink(participant.token);
  const templateName = process.env.WHATSAPP_HUT_PHOTO_REMINDER_TEMPLATE ?? "hut_photo_reminder";
  const hutUrlDomain = new URL(hutUrl).origin;

  const result = await sendHutPhotoReminderWhatsApp({
    hutUrl,
    now,
    participantId: participant.id,
    participantName: participant.name,
    phone: participant.phone,
    repository: whatsappRepository ?? createOneuiWhatsAppRepository(),
    studyId: participant.studyId
  });
  const whatsAppMessage = result.ok ? result.data : "data" in result ? result.data : undefined;
  const whatsappStatus = result.ok ? "ENVIADO" : "ERROR";
  const whatsappError = result.ok ? null : result.message;
  const publicOriginAudit = publicOriginValidationAuditMetadata(hutUrl);
  const publicOriginFailureCode = !result.ok && "code" in result && (
    result.code === WHATSAPP_CONFIGURATION_MISSING_PUBLIC_ORIGIN || result.code === WHATSAPP_INVALID_PUBLIC_ORIGIN
  )
    ? result.code
    : null;

  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: {
        deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
        deploymentUrl: process.env.VERCEL_URL ?? null,
        folio: participant.folio,
        generatedHutUrl: hutUrl,
        hutUrlAvailable: true,
        hutUrl,
        hutUrlDomain,
        message: result.ok ? "Recordatorio HUT enviado por WhatsApp." : result.message,
        metaMessageId: whatsAppMessage?.metaMessageId ?? null,
        manualReason: source === "CRON" ? null : manualReason?.trim() || null,
        reminderReason: "PHOTO_SLOT_AVAILABLE",
        reminderType: "HUT_PHOTO_REMINDER",
        participantId: participant.id,
        publicOriginDetected: publicOriginAudit.publicOriginDetected,
        publicOriginExpected: publicOriginAudit.publicOriginExpected,
        publicOriginFailureCode,
        publicOriginFailureMessage: publicOriginFailureCode ? publicOriginAudit.publicOriginFailureMessage : null,
        sentAtMexicoCity: formatDateTimeMexicoCity(now),
        source,
        slotId: slot.id,
        slotTitle: slot.title,
        templateName,
        whatsappStatus
      },
      beforeJson: null,
      createdAt: now,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: publicOriginFailureCode
        ? publicOriginFailureCode
        : source === "CRON" ? "HUT_PHOTO_REMINDER_CRON" : "HUT_PHOTO_REMINDER_MANUAL"
    }
  });

  return {
    data: {
      generatedAt: now,
      hutUrl,
      phone: participant.phone ?? "",
      slotId: slot.id as HutPhotoTimelineSlotId,
      templateName,
      whatsappError,
      whatsappMessageId: whatsAppMessage?.metaMessageId ?? null,
      whatsappStatus
    },
    ok: true
  };
}

async function auditSkippedHutPhotoReminder({
  decision,
  now,
  participant,
  prisma
}: {
  decision: Extract<HutPhotoReminderEligibilityDecision, { ok: false }>;
  now: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}) {
  const templateName = process.env.WHATSAPP_HUT_PHOTO_REMINDER_TEMPLATE ?? "hut_photo_reminder";

  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId: null,
      afterJson: toAuditJson({
        exclusionReason: decision.exclusionReason,
        exclusionReasons: decision.exclusionReasons,
        message: decision.message,
        reminderType: "HUT_PHOTO_REMINDER",
        source: "CRON",
        slotId: decision.slotId,
        slotTitle: decision.slotTitle,
        templateName,
        evaluatedAtMexicoCity: formatDateTimeMexicoCity(now),
        whatsappStatus: "OMITIDO"
      }),
      beforeJson: null,
      createdAt: now,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: "HUT_PHOTO_REMINDER_CRON_SKIPPED"
    }
  });
}

function nextHutPhotoReminderCandidateSlot(
  participant: HutParticipantRecord,
  now: Date,
  manualOverrides: HutPhotoTimelineManualOverride[] = []
) {
  return getNextHutPhotoTimelineSlot({
    applicationEvidence: applicationEvidenceSummary(participant),
    dailyEntries: applicationPhotoEntrySummary(participant),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    manualOverrides,
    now,
    photoCaptureBlocked: participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED",
    product2GateOpen: isHutProduct2GateOpen(participant),
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
}

function hutPhotoReminderStatusExclusions(participant: HutParticipantRecord): HutPhotoReminderExclusionReason[] {
  if (!isApplicationPhotoProtocol(participant)) {
    return ["NOT_APPLICATION_PHOTO"];
  }
  if (participant.status === "COMPLETED") {
    return ["HUT_COMPLETED"];
  }
  if (participant.status === "DISQUALIFIED") {
    return ["HUT_DISQUALIFIED"];
  }

  return [];
}

function hutPhotoReminderProtocolExclusions(participant: HutParticipantRecord): HutPhotoReminderExclusionReason[] {
  const reasons: HutPhotoReminderExclusionReason[] = [];
  if (!hasHutProtocolStarted(participant)) {
    reasons.push("NO_STARTED");
  }
  if (participantOrigin(participant) === "CLT_HUT" && !hasCompletedCltSession(participant)) {
    reasons.push("WAITING_CLT");
  }
  if (!hasHutDeliveryEvidence(participant)) {
    reasons.push("WAITING_DELIVERY");
  }

  return reasons;
}

function hutPhotoReminderExcluded(
  participant: HutParticipantRecord,
  now: Date,
  exclusionReasons: HutPhotoReminderExclusionReason[],
  message: string,
  slot?: ReturnType<typeof nextHutPhotoReminderCandidateSlot>
): Extract<HutPhotoReminderEligibilityDecision, { ok: false }> {
  const resolvedSlot = slot ?? nextHutPhotoReminderCandidateSlot(participant, now);
  const normalizedReasons = [...new Set(exclusionReasons)];
  return {
    exclusionReason: normalizedReasons[0] ?? "SLOT_NOT_AVAILABLE",
    exclusionReasons: normalizedReasons.length > 0 ? normalizedReasons : ["SLOT_NOT_AVAILABLE"],
    message,
    ok: false,
    slotId: resolvedSlot?.id ?? null,
    slotTitle: resolvedSlot?.title ?? null
  };
}

function hutPhotoReminderExclusionMessage(reason: HutPhotoReminderExclusionReason): string {
  const messages: Record<HutPhotoReminderExclusionReason, string> = {
    DELIVERY_NOT_REMINDABLE: "Entrega no genera recordatorio fotografico automatico.",
    HUT_COMPLETED: "La participacion HUT ya esta completada.",
    HUT_DISQUALIFIED: "El participante HUT esta descalificado.",
    NOT_APPLICATION_PHOTO: "Este participante no usa el protocolo de fotografia HUT.",
    NO_STARTED: "El protocolo HUT no ha iniciado.",
    OUTSIDE_OPERATIONAL_WINDOW: "El recordatorio HUT automatico solo se envia de 15:00 a 18:00 hrs CDMX.",
    PHONE_MISSING: "El participante HUT no tiene telefono capturado.",
    QA_PARTICIPANT: "Los participantes QA no envian WhatsApp real.",
    RECENT_REMINDER: "Ya se envio un recordatorio HUT para este slot en las ultimas 24 horas.",
    SLOT_NOT_AVAILABLE: "Este participante no tiene una fotografia HUT disponible para recordar.",
    WAITING_CLT: "CLT aun no esta completado.",
    WAITING_DELIVERY: "Aun no existe evidencia de entrega del primer producto."
  };

  return messages[reason];
}

function hasHutProtocolStarted(participant: HutParticipantRecord): boolean {
  return Boolean(
    participant.startDate ||
    participant.status !== "NOT_STARTED" ||
    participant.applicationPhotoEntries?.length ||
    participant.applicationEvidence?.length
  );
}

function hasCompletedCltSession(participant: HutParticipantRecord): boolean {
  return Boolean(participant.studyParticipant?.ctlSessions?.some((session) => session.status === "COMPLETED"));
}

function hasHutDeliveryEvidence(participant: HutParticipantRecord): boolean {
  return Boolean(
    participant.applicationPhotoEntries?.some((entry) => entry.useDayNumber === 0) ||
    participant.applicationEvidence?.some((evidence) => evidence.phase === "COLOCACION")
  );
}

function isHutProduct2GateOpen(participant: HutParticipantRecord): boolean {
  if (!participant.secondProductRelease && hasLegacySecondProductProgress(participant)) {
    return true;
  }
  return isFirstFragranceEvaluationCompleted(participant) && isSecondProductReleased(participant);
}

function isHutFirstEvaluationGateOpen(participant: HutParticipantRecord): boolean {
  if (!participant.secondStageAuthorization && hasLegacyFirstPerfumeEvaluationProgress(participant)) {
    return true;
  }
  return isProduct1PhotoCycleComplete(participant) && isSecondStageAuthorized(participant);
}

function isHutFinalStageGateOpen(participant: HutParticipantRecord): boolean {
  return isHutProduct2GateOpen(participant) && isThirdStageAuthorized(participant);
}

function hutOperationalCompatibilityWarnings(participant: HutParticipantRecord): HutOperationalCompatibilityWarning[] {
  return Array.from(
    new Set([
      ...getSecondStageAuthorizationWarnings(participant),
      ...getSecondProductReleaseWarnings(participant),
      ...getThirdStageAuthorizationWarnings(participant)
    ])
  );
}

function isFirstFragranceEvaluationCompleted(participant: HutParticipantRecord): boolean {
  return Boolean(
    participant.questionnaireAttempt?.visits?.some(
      (visit) => visit.section === "EVALUACION_PRIMER_PERFUME" && visit.status === "COMPLETED"
    )
  );
}

function isProduct1PhotoCycleComplete(participant: HutParticipantRecord): boolean {
  if (!isApplicationPhotoProtocol(participant)) {
    return true;
  }
  const timeline = buildHutPhotoTimeline({
    dailyEntries: (participant.applicationPhotoEntries ?? []).map((entry) => ({
      capturedAt: entry.capturedAt,
      capturedLocalDate: entry.capturedLocalDate,
      productCode: entry.productCode,
      useDayNumber: entry.useDayNumber
    })),
    applicationEvidence: (participant.applicationEvidence ?? []).map((evidence) => ({
      capturedAt: evidence.capturedAt,
      phase: evidence.phase,
      productCode: evidence.productCode
    })),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    product2GateOpen: false,
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
  const requiredSlots = new Set<HutPhotoTimelineSlotId>([
    "PRODUCT_1_DAY_1",
    "PRODUCT_1_DAY_2",
    "PRODUCT_1_DAY_3_MORNING"
  ]);

  return timeline
    .filter((slot) => requiredSlots.has(slot.id))
    .every((slot) => slot.status === "COMPLETED");
}

function requiresSecondStageAuthorizationForQuestion(question: { section: HutQuestionnaireSectionId }): boolean {
  return question.section === "EVALUACION_PRIMER_PERFUME";
}

function requiresSecondProductDeliveryConfirmationForQuestion(question: { section: HutQuestionnaireSectionId }): boolean {
  return requiresSecondProductDeliveryConfirmationForSection(question.section);
}

function requiresSecondProductDeliveryConfirmationForSection(section: HutQuestionnaireSectionId): boolean {
  return section === "SEGUNDA_VISITA";
}

function requiresThirdStageAuthorizationForQuestion(question: { section: HutQuestionnaireSectionId }): boolean {
  return requiresThirdStageAuthorizationForSection(question.section);
}

function requiresThirdStageAuthorizationForSection(section: HutQuestionnaireSectionId): boolean {
  return section === "EVALUACION_SEGUNDO_PERFUME" || section === "COMPARATIVA";
}

function secondStageAuthorizationRequiredMessage(participant: HutParticipantRecord): string {
  const resolution = resolveHutOperationalStageCode(participant, "SECOND_STAGE");
  const slot = resolution.source === "LEGACY_PHASE_CODE" ? 2 : resolution.slot ?? 2;
  return `Autoriza primero la segunda etapa con el codigo maestro slot ${slot}.`;
}

function isWithinHutPhotoReminderOperationalWindow(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: MEXICO_CITY_TIME_ZONE
  }).format(now));

  return hour >= 15 && hour < 18;
}

async function hasRecentHutPhotoReminder(
  prisma: HutPrismaClient,
  participantId: string,
  slotId: HutPhotoTimelineSlotId,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const logs = (await prisma.auditLog.findMany?.({
    orderBy: { createdAt: "desc" },
    select: {
      afterJson: true,
      createdAt: true
    },
    where: {
      action: "PARTICIPANT_MODIFIED",
      createdAt: { gte: since },
      entityId: participantId,
      entityType: "HutParticipant"
    }
  })) as Array<{ afterJson?: unknown; createdAt?: Date }> | undefined;

  return Boolean(logs?.some((log) => isMatchingCompletedHutPhotoReminder(log.afterJson, slotId)));
}

async function readActiveHutPhotoSlotOverrides(
  prisma: HutPrismaClient,
  participantId: string
): Promise<HutPhotoTimelineManualOverride[]> {
  const logs = (await prisma.auditLog.findMany?.({
    orderBy: { createdAt: "desc" },
    select: {
      actorUserId: true,
      afterJson: true,
      createdAt: true,
      reason: true
    },
    where: {
      action: "PARTICIPANT_MODIFIED",
      entityId: participantId,
      entityType: "HutParticipant"
    }
  })) as Array<{
    actorUserId?: string | null;
    afterJson?: unknown;
    createdAt?: Date;
    reason?: string | null;
  }> | undefined;
  const resolved = new Map<HutPhotoTimelineSlotId, HutPhotoTimelineManualOverride | null>();

  for (const log of logs ?? []) {
    const metadata = isRecord(log.afterJson) ? log.afterJson : {};
    const slotId = typeof metadata.slotId === "string" && getHutPhotoTimelineSlotDefinition(metadata.slotId)
      ? metadata.slotId as HutPhotoTimelineSlotId
      : null;
    if (!slotId || resolved.has(slotId)) {
      continue;
    }

    if (log.reason === "HUT_PHOTO_SLOT_OVERRIDE_USED") {
      resolved.set(slotId, null);
      continue;
    }
    if (log.reason === "HUT_PHOTO_SLOT_MANUAL_RELEASE" || metadata.overrideType === "RELEASE") {
      resolved.set(slotId, {
        actorUserId: log.actorUserId ?? null,
        createdAt: log.createdAt ?? new Date(0),
        reason: typeof metadata.reasonDetail === "string" ? metadata.reasonDetail : null,
        slotId,
        type: "RELEASE"
      });
      continue;
    }
    if (log.reason === "HUT_PHOTO_SLOT_REPEAT_REQUESTED" || metadata.overrideType === "REPEAT") {
      resolved.set(slotId, {
        actorUserId: log.actorUserId ?? null,
        createdAt: log.createdAt ?? new Date(0),
        reason: typeof metadata.reasonDetail === "string" ? metadata.reasonDetail : null,
        slotId,
        type: "REPEAT"
      });
    }
  }

  return [...resolved.values()].filter((override): override is HutPhotoTimelineManualOverride => Boolean(override));
}

async function attachSecondProductRelease(
  prisma: HutPrismaClient,
  participant: HutParticipantRecord
): Promise<HutParticipantRecord> {
  participant.secondProductRelease = await readSecondProductRelease(prisma, participant.id);
  return participant;
}

async function attachSecondStageAuthorization(
  prisma: HutPrismaClient,
  participant: HutParticipantRecord
): Promise<HutParticipantRecord> {
  participant.secondStageAuthorization = await readSecondStageAuthorization(prisma, participant.id);
  return participant;
}

async function attachThirdStageAuthorization(
  prisma: HutPrismaClient,
  participant: HutParticipantRecord
): Promise<HutParticipantRecord> {
  participant.thirdStageAuthorization = await readThirdStageAuthorization(prisma, participant.id);
  return participant;
}

async function readSecondStageAuthorization(
  prisma: HutPrismaClient,
  participantId: string
): Promise<HutSecondStageAuthorizationSummary | null> {
  const logs = (await prisma.auditLog.findMany?.({
    orderBy: { createdAt: "desc" },
    select: {
      actorUserId: true,
      afterJson: true,
      createdAt: true,
      reason: true
    },
    where: {
      action: "PARTICIPANT_MODIFIED",
      entityId: participantId,
      entityType: "HutParticipant",
      reason: HUT_SECOND_STAGE_AUTHORIZED_REASON
    }
  })) as Array<{
    actorUserId?: string | null;
    afterJson?: unknown;
    createdAt?: Date;
    reason?: string | null;
  }> | undefined;

  const log = (logs ?? []).find((candidate) =>
    candidate.reason === HUT_SECOND_STAGE_AUTHORIZED_REASON ||
    isSecondStageAuthorizationAuditJson(candidate.afterJson)
  );
  if (!log) {
    return null;
  }
  const metadata = isSecondStageAuthorizationAuditJson(log.afterJson) ? log.afterJson : null;
  const accessType = metadata?.accessType === "ENCUESTADOR" || metadata?.accessType === "SUPERVISOR" || metadata?.accessType === "ADMIN"
    ? metadata.accessType
    : null;
  return {
    accessCode: typeof metadata?.accessCode === "string" ? metadata.accessCode : null,
    accessType,
    actorUserId: log.actorUserId ?? null,
    authorizedAt: log.createdAt ?? new Date(0),
    authorizedAtMexicoCity: typeof metadata?.authorizedAtMexicoCity === "string" ? metadata.authorizedAtMexicoCity : null
  };
}

async function readSecondProductRelease(
  prisma: HutPrismaClient,
  participantId: string
): Promise<HutSecondProductReleaseSummary | null> {
  const logs = (await prisma.auditLog.findMany?.({
    orderBy: { createdAt: "desc" },
    select: {
      actorUserId: true,
      afterJson: true,
      createdAt: true,
      reason: true
    },
    where: {
      action: "PARTICIPANT_MODIFIED",
      entityId: participantId,
      entityType: "HutParticipant",
      reason: HUT_SECOND_PRODUCT_RELEASED_REASON
    }
  })) as Array<{
    actorUserId?: string | null;
    afterJson?: unknown;
    createdAt?: Date;
    reason?: string | null;
  }> | undefined;

  const log = (logs ?? []).find((candidate) =>
    candidate.reason === HUT_SECOND_PRODUCT_RELEASED_REASON ||
    isSecondProductReleaseAuditJson(candidate.afterJson)
  );
  if (!log) {
    return null;
  }
  const metadata = isSecondProductReleaseAuditJson(log.afterJson) ? log.afterJson : null;
  return {
    actorUserId: log.actorUserId ?? null,
    reasonDetail: typeof metadata?.reasonDetail === "string" ? metadata.reasonDetail : null,
    releasedAt: log.createdAt ?? new Date(0),
    releasedAtMexicoCity: typeof metadata?.releasedAtMexicoCity === "string" ? metadata.releasedAtMexicoCity : null
  };
}

async function readThirdStageAuthorization(
  prisma: HutPrismaClient,
  participantId: string
): Promise<HutThirdStageAuthorizationSummary | null> {
  const logs = (await prisma.auditLog.findMany?.({
    orderBy: { createdAt: "desc" },
    select: {
      actorUserId: true,
      afterJson: true,
      createdAt: true,
      reason: true
    },
    where: {
      action: "PARTICIPANT_MODIFIED",
      entityId: participantId,
      entityType: "HutParticipant",
      reason: HUT_THIRD_STAGE_AUTHORIZED_REASON
    }
  })) as Array<{
    actorUserId?: string | null;
    afterJson?: unknown;
    createdAt?: Date;
    reason?: string | null;
  }> | undefined;

  const log = (logs ?? []).find((candidate) =>
    candidate.reason === HUT_THIRD_STAGE_AUTHORIZED_REASON ||
    isThirdStageAuthorizationAuditJson(candidate.afterJson)
  );
  if (!log) {
    return null;
  }
  const metadata = isThirdStageAuthorizationAuditJson(log.afterJson) ? log.afterJson : null;
  const accessType = metadata?.accessType === "ENCUESTADOR" || metadata?.accessType === "SUPERVISOR" || metadata?.accessType === "ADMIN"
    ? metadata.accessType
    : null;
  return {
    accessCode: typeof metadata?.accessCode === "string" ? metadata.accessCode : null,
    accessType,
    actorUserId: log.actorUserId ?? null,
    authorizedAt: log.createdAt ?? new Date(0),
    authorizedAtMexicoCity: typeof metadata?.authorizedAtMexicoCity === "string" ? metadata.authorizedAtMexicoCity : null
  };
}

async function createHutPhotoSlotOverrideAudit({
  actorUserId,
  participant,
  prisma,
  reason,
  slotId,
  type
}: {
  actorUserId: string | null;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  reason: string;
  slotId: HutPhotoTimelineSlotId;
  type: "RELEASE" | "REPEAT";
}) {
  const now = new Date();
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        action: type === "RELEASE" ? "HUT_PHOTO_SLOT_MANUAL_RELEASE" : "HUT_PHOTO_SLOT_REPEAT_REQUESTED",
        overrideType: type,
        participant: hutParticipantAuditSnapshot(participant),
        reasonDetail: reason,
        slotId,
        updatedAtMexicoCity: formatDateTimeMexicoCity(now)
      }),
      beforeJson: null,
      createdAt: now,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: type === "RELEASE" ? "HUT_PHOTO_SLOT_MANUAL_RELEASE" : "HUT_PHOTO_SLOT_REPEAT_REQUESTED"
    }
  });
}

async function createHutSecondProductReleaseAudit({
  actorUserId,
  participant,
  prisma,
  reason,
  releasedAt
}: {
  actorUserId: string | null;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  reason: string;
  releasedAt: Date;
}) {
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        action: HUT_SECOND_PRODUCT_RELEASED_REASON,
        participant: hutParticipantAuditSnapshot(participant),
        reasonDetail: reason,
        releasedAtMexicoCity: formatDateTimeMexicoCity(releasedAt)
      }),
      beforeJson: null,
      createdAt: releasedAt,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: HUT_SECOND_PRODUCT_RELEASED_REASON
    }
  });
}

async function createHutSecondStageAuthorizationAudit({
  accessCode,
  accessType,
  actorUserId,
  authorizedAt,
  participant,
  prisma
}: {
  accessCode: string | null;
  accessType: "ADMIN" | "ENCUESTADOR" | "SUPERVISOR";
  actorUserId: string | null;
  authorizedAt: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}) {
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        accessCode,
        accessType,
        action: HUT_SECOND_STAGE_AUTHORIZED_REASON,
        authorizedAtMexicoCity: formatDateTimeMexicoCity(authorizedAt),
        participant: hutParticipantAuditSnapshot(participant)
      }),
      beforeJson: null,
      createdAt: authorizedAt,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: HUT_SECOND_STAGE_AUTHORIZED_REASON
    }
  });
}

async function ensureSecondProductReleasedFromDeliveryConfirmation({
  actorUserId,
  participant,
  prisma
}: {
  actorUserId: string | null;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}): Promise<void> {
  await attachSecondProductRelease(prisma, participant);
  if (isSecondProductReleased(participant)) {
    return;
  }
  if (!isFirstFragranceEvaluationCompleted(participant)) {
    return;
  }

  const releasedAt = new Date();
  await createHutSecondProductReleaseAudit({
    actorUserId,
    participant,
    prisma,
    reason: "Confirmacion de entrega del segundo perfume.",
    releasedAt
  });
  participant.secondProductRelease = {
    actorUserId,
    reasonDetail: "Confirmacion de entrega del segundo perfume.",
    releasedAt,
    releasedAtMexicoCity: formatDateTimeMexicoCity(releasedAt)
  };
}

async function createHutThirdStageAuthorizationAudit({
  accessCode,
  accessType,
  actorUserId,
  authorizedAt,
  participant,
  prisma
}: {
  accessCode: string | null;
  accessType: "ADMIN" | "ENCUESTADOR" | "SUPERVISOR";
  actorUserId: string | null;
  authorizedAt: Date;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
}) {
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        accessCode,
        accessType,
        action: HUT_THIRD_STAGE_AUTHORIZED_REASON,
        authorizedAtMexicoCity: formatDateTimeMexicoCity(authorizedAt),
        participant: hutParticipantAuditSnapshot(participant)
      }),
      beforeJson: null,
      createdAt: authorizedAt,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: HUT_THIRD_STAGE_AUTHORIZED_REASON
    }
  });
}

async function createHutPhotoSlotOverrideUsedAudit({
  actorUserId,
  participant,
  prisma,
  slotId,
  type,
  usedAt
}: {
  actorUserId: string | null;
  participant: HutParticipantRecord;
  prisma: HutPrismaClient;
  slotId: HutPhotoTimelineSlotId;
  type: "RELEASE" | "REPEAT";
  usedAt: Date;
}) {
  const auditedAt = new Date();
  await prisma.auditLog.create?.({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: toAuditJson({
        action: "HUT_PHOTO_SLOT_OVERRIDE_USED",
        overrideType: type,
        slotId,
        usedAtMexicoCity: formatDateTimeMexicoCity(usedAt)
      }),
      beforeJson: null,
      createdAt: auditedAt,
      entityId: participant.id,
      entityType: "HutParticipant",
      reason: "HUT_PHOTO_SLOT_OVERRIDE_USED"
    }
  });
}

function isMatchingCompletedHutPhotoReminder(afterJson: unknown, slotId: HutPhotoTimelineSlotId): boolean {
  if (!afterJson || typeof afterJson !== "object") {
    return false;
  }
  const metadata = afterJson as {
    reminderType?: unknown;
    slotId?: unknown;
    templateName?: unknown;
    whatsappStatus?: unknown;
  };

  return metadata.reminderType === "HUT_PHOTO_REMINDER"
    && metadata.slotId === slotId
    && metadata.templateName === "hut_photo_reminder"
    && metadata.whatsappStatus === "ENVIADO";
}

function hasStartedHutBlockOneEvidence(participant: HutParticipantRecord): boolean {
  const blockOne = blockByNumber(participant, 1);
  if (!blockOne) {
    return false;
  }

  return (
    blockOne.submittedVideosCount > 0 ||
    Boolean(participant.videoSubmissions?.some((video) => video.blockNumber === 1)) ||
    Boolean(participant.dailyChecks?.some((check) => check.blockId === blockOne.id)) ||
    Boolean(participant.visualVerifications?.some((verification) => verification.blockNumber === 1))
  );
}

function toAdminRegistrationSlot(slot: HutRegistrationSlotRecord, requestOrigin: string): HutRegistrationSlotAdmin {
  return {
    email: slot.participant?.email ?? null,
    firstFragranceLeftArm: slot.firstFragranceLeftArm,
    folio: slot.folio,
    id: slot.id,
    link: registrationLink(requestOrigin, slot.registrationToken),
    participantId: slot.participantId,
    participantLink: slot.participant ? participantLink(requestOrigin, slot.participant.token) : null,
    participantName: slot.participant?.name ?? null,
    phone: slot.participant?.phone ?? null,
    referenceSelfieStatus: slot.participant?.referenceSelfie ? "COMPLETE" : "MISSING",
    secondFragranceRightArm: slot.secondFragranceRightArm,
    status: slot.status
  };
}

function toPortalView(
  participant: HutParticipantRecord,
  manualOverrides: HutPhotoTimelineManualOverride[] = []
): HutPortalView {
  if (isApplicationPhotoProtocol(participant)) {
    return toApplicationPhotoPortalView(participant, manualOverrides);
  }

  const block = activeBlock(participant);
  const block1 = blockByNumber(participant, 1);
  const block2 = blockByNumber(participant, 2);
  const phaseGate = currentHutPhaseGate(participant);
  const availability = block
    ? currentAvailability(participant, block, new Date())
    : { nextAvailableAt: null, reason: "BLOCK_NOT_ACTIVE" };

  if (participant.status === "DISQUALIFIED") {
    return {
      applicationEvidence: applicationEvidenceSummary(participant),
      applicationPhotoEntries: applicationPhotoEntrySummary(participant),
      availableApplicationPhoto: null,
      availableUpload: null,
      availability: {
        blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
        expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
        nextAvailableAt: availability.nextAvailableAt,
        reason: availability.reason
      },
      block1: block1 ? toBasicBlockSummary(block1) : null,
      block2: block2 ? toBasicBlockSummary(block2) : null,
      folio: participant.folio,
      legacyMirroredPlacementPhoto: false,
      message:
        "Gracias por tu participacion. Por las reglas del estudio, no es posible continuar con esta etapa. El equipo podra contactarte si requiere informacion adicional.",
      name: hutParticipantDisplayName(participant),
      operationalIdentityMissing: isReservedHutWithoutOperationalIdentity(participant),
      origin: participantOrigin(participant),
      phaseGate,
      participantId: participant.id,
      product2GateOpen: false,
      photoSlotOverrides: [],
      protocolVersion: "LEGACY_VIDEO",
      rotation: hutParticipantRotation(participant),
      status: participant.status,
      studyName: participant.study.name,
      testMode: participant.testMode,
      token: participant.token
    };
  }

  const availableUpload = block && availability.reason === "AVAILABLE_FOR_VIDEO" && !phaseGate?.required
    ? {
        blockNumber: block.blockNumber,
        sequenceNumber: nextHutVideoSequence(block) ?? block.requiredVideos
      }
    : null;

  return {
    applicationEvidence: applicationEvidenceSummary(participant),
    applicationPhotoEntries: applicationPhotoEntrySummary(participant),
    availableApplicationPhoto: null,
    availableUpload,
    availability: {
      blockNumber: "blockNumber" in availability ? availability.blockNumber : undefined,
      expectedVideoSequence: "expectedVideoSequence" in availability ? availability.expectedVideoSequence : undefined,
      nextAvailableAt: availability.nextAvailableAt,
      reason: availability.reason
    },
    block1: block1 ? toBasicBlockSummary(block1) : null,
    block2: block2 ? toBasicBlockSummary(block2) : null,
    folio: participant.folio,
    legacyMirroredPlacementPhoto: false,
    message: hutPortalMessage(participant),
    name: hutParticipantDisplayName(participant),
    operationalIdentityMissing: isReservedHutWithoutOperationalIdentity(participant),
    origin: participantOrigin(participant),
    phaseGate,
    participantId: participant.id,
    product2GateOpen: false,
    photoSlotOverrides: [],
    protocolVersion: "LEGACY_VIDEO",
    rotation: hutParticipantRotation(participant),
    status: participant.status,
    studyName: participant.study.name,
    testMode: participant.testMode,
    token: participant.token
  };
}

function toApplicationPhotoPortalView(
  participant: HutParticipantRecord,
  manualOverrides: HutPhotoTimelineManualOverride[] = []
): HutPortalView {
  const now = new Date();
  const evidence = applicationEvidenceSummary(participant);
  const entries = applicationPhotoEntrySummary(participant);
  const operationalIdentityMissing = isReservedHutWithoutOperationalIdentity(participant);
  const filterBlocksPhotoCapture = participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED";
  const legacyMirroredPlacementPhoto = hasLegacyMirroredPlacementPhoto(participant);
  const product2GateOpen = isHutProduct2GateOpen(participant);
  const nextAvailableSlot = operationalIdentityMissing || filterBlocksPhotoCapture ? null : expectedApplicationPhotoSlot(participant, now, manualOverrides);
  const nextPendingSlot = operationalIdentityMissing || filterBlocksPhotoCapture ? null : nextPendingApplicationPhotoSlot(participant, now, manualOverrides);
  const availableApplicationPhoto = nextAvailableSlot
    ? {
        phase: storagePhaseForApplicationPhotoSlot(nextAvailableSlot.id),
        productCode: nextAvailableSlot.productCode,
        slotId: nextAvailableSlot.id
      }
    : null;
  const nextAvailableAt = nextPendingSlot?.status === "PROGRAMMED" ? nextPendingSlot.availableAt : null;
  const waitingProduct2Gate = Boolean(nextPendingSlot && !availableApplicationPhoto && !nextAvailableAt);

  return {
    applicationEvidence: evidence,
    applicationPhotoEntries: entries,
    availableApplicationPhoto,
    availableUpload: null,
    availability: {
      nextAvailableAt,
      reason: operationalIdentityMissing
        ? "RESERVED_WITHOUT_OPERATIONAL_IDENTITY"
        : filterBlocksPhotoCapture
        ? "FILTER_PENDING"
          : availableApplicationPhoto
          ? "AVAILABLE_FOR_APPLICATION_PHOTO"
          : nextAvailableAt
            ? "WAIT_UNTIL_NEXT_DAY"
            : waitingProduct2Gate
              ? "WAITING_PRODUCT_2_GATE"
            : "COMPLETE"
    },
    block1: null,
    block2: null,
    folio: participant.folio,
    legacyMirroredPlacementPhoto,
    message: operationalIdentityMissing ? reservedHutOperationalIdentityMessage() : applicationPhotoPortalMessage(participant),
    name: hutParticipantDisplayName(participant),
    operationalIdentityMissing,
    origin: participantOrigin(participant),
    phaseGate: null,
    participantId: participant.id,
    photoSlotOverrides: manualOverrides,
    product2GateOpen,
    protocolVersion: "APPLICATION_PHOTO",
    rotation: hutParticipantRotation(participant),
    status: participant.status,
    studyName: participant.study.name,
    testMode: participant.testMode,
    token: participant.token
  };
}

function hutParticipantDisplayName(participant: HutParticipantRecord): string {
  return participant.studyParticipant?.participantProfile.name ?? participant.name;
}

function isReservedHutWithoutOperationalIdentity(participant: HutParticipantRecord): boolean {
  const name = normalizeHutText(participant.name);
  return participantOrigin(participant) === "HUT_DIRECTO"
    && !participant.studyParticipant?.id
    && !normalizeHutPhone(participant.phone)
    && !normalizeHutEmail(participant.email)
    && /^HUT-\d+$/i.test(name);
}

function reservedHutOperationalIdentityMessage(): string {
  return "Este folio HUT esta reservado y aun no tiene identidad operativa asignada. Contacta al equipo del estudio para activarlo.";
}

function hutParticipantRotation(participant: HutParticipantRecord): HutPortalView["rotation"] {
  return {
    firstFragranceLeftArm: participant.firstFragranceLeftArm,
    secondFragranceRightArm: participant.secondFragranceRightArm
  };
}

async function findParticipantForFieldHutCapture(
  prisma: HutPrismaClient,
  folio: string
): Promise<HutParticipantRecord | null> {
  const normalized = normalizeHutText(folio);
  if (!normalized) {
    return null;
  }

  const hutFolio = normalized.startsWith("HUT-") ? normalized : navFolioToReservedHutFolio(normalized);
  if (hutFolio) {
    const participant = (await prisma.hutParticipant.findFirst?.({
      select: participantSelect,
      where: {
        folio: hutFolio,
        qaParticipantRun: { is: null }
      }
    })) as HutParticipantRecord | null;
    if (participant) {
      return participant;
    }
  }

  const navFolio = normalized.startsWith("NAV-") ? normalized : hutFolioToReservedNavFolio(normalized);
  if (!navFolio) {
    return null;
  }

  const confirmation = (await prisma.participantConfirmation.findFirst?.({
    select: {
      studyParticipant: {
        select: { id: true }
      }
    },
    where: { folio: navFolio }
  })) as { studyParticipant?: { id: string } | null } | null;
  const studyParticipantId = confirmation?.studyParticipant?.id ?? null;
  if (!studyParticipantId) {
    return null;
  }

  return (await prisma.hutParticipant.findFirst?.({
    select: participantSelect,
    where: {
      qaParticipantRun: { is: null },
      studyParticipantId
    }
  })) as HutParticipantRecord | null;
}

async function toFieldPhotoSummaries(
  participant: HutParticipantRecord,
  storage?: HutStorageClient
): Promise<HutFieldPhotoSummary[]> {
  const phasePhotos = await Promise.all(
    (participant.applicationEvidence ?? []).map(async (evidence) => ({
      capturedAt: evidence.capturedAt,
      capturedLocalDate: null,
      phase: evidence.phase,
      productCode: evidence.productCode,
      signedUrl: await signedStorageUrl(evidence.privateStorageKey, evidence.storageBucket, storage),
      source: "PHASE_EVIDENCE" as const,
      useDayNumber: null
    }))
  );
  const dailyPhotos = await Promise.all(
    (participant.applicationPhotoEntries ?? []).map(async (entry) => ({
      capturedAt: entry.capturedAt,
      capturedLocalDate: entry.capturedLocalDate,
      phase: null,
      productCode: entry.productCode,
      signedUrl: await signedStorageUrl(entry.privateStorageKey, entry.storageBucket, storage),
      source: "DAILY_ENTRY" as const,
      useDayNumber: entry.useDayNumber
    }))
  );

  return [...phasePhotos, ...dailyPhotos].sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());
}

function currentHutPhaseGate(participant: HutParticipantRecord): HutPortalView["phaseGate"] {
  void participant;
  return null;
}


function expectedHutPhaseForParticipant(participant: HutParticipantRecord): HutPhase | null {
  if (isApplicationPhotoProtocol(participant)) {
    return expectedApplicationPhotoPhase(participant);
  }

  if (participant.status === "BLOCK_1_IN_PROGRESS") {
    return "COLOCACION";
  }
  if (participant.status === "BLOCK_1_CALL_PENDING") {
    return "REGRESO_1";
  }
  if (participant.status === "BLOCK_2_IN_PROGRESS") {
    const regreso1 = participant.phaseCodes?.find((code) => code.phase === "REGRESO_1");
    return regreso1?.status === "USED" ? null : "REGRESO_1";
  }
  if (participant.status === "BLOCK_2_CALL_PENDING") {
    return "REGRESO_2";
  }

  return null;
}

function expectedApplicationPhotoPhase(participant: HutParticipantRecord): HutPhase | null {
  const slot = expectedApplicationPhotoSlot(participant);
  return slot ? storagePhaseForApplicationPhotoSlot(slot.id) : null;
}

function expectedApplicationPhotoSlot(
  participant: HutParticipantRecord,
  now = new Date(),
  manualOverrides: HutPhotoTimelineManualOverride[] = []
) {
  return getNextHutPhotoTimelineSlot({
    applicationEvidence: applicationEvidenceSummary(participant),
    dailyEntries: applicationPhotoEntrySummary(participant),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    manualOverrides,
    now,
    product2GateOpen: isHutProduct2GateOpen(participant),
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
}

function nextPendingApplicationPhotoSlot(
  participant: HutParticipantRecord,
  now = new Date(),
  manualOverrides: HutPhotoTimelineManualOverride[] = []
) {
  return getNextPendingHutPhotoTimelineSlot({
    applicationEvidence: applicationEvidenceSummary(participant),
    dailyEntries: applicationPhotoEntrySummary(participant),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    manualOverrides,
    now,
    product2GateOpen: isHutProduct2GateOpen(participant),
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
}

function resolveRequestedApplicationPhotoSlot(
  participant: HutParticipantRecord,
  requestedSlotId: HutPhotoTimelineSlotId | null,
  now = new Date(),
  manualOverrides: HutPhotoTimelineManualOverride[] = []
):
  | { ok: true; slot: NonNullable<ReturnType<typeof expectedApplicationPhotoSlot>> | null }
  | { message: string; ok: false } {
  const timeline = buildHutPhotoTimeline({
    applicationEvidence: applicationEvidenceSummary(participant),
    dailyEntries: applicationPhotoEntrySummary(participant),
    legacyMirroredPlacementPhoto: hasLegacyMirroredPlacementPhoto(participant),
    manualOverrides,
    now,
    product2GateOpen: isHutProduct2GateOpen(participant),
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
  const expected = timeline.find((slot) => slot.participantTask && slot.status === "AVAILABLE") ?? null;
  if (!requestedSlotId) {
    return { ok: true, slot: expected };
  }

  const requested = timeline.find((slot) => slot.id === requestedSlotId) ?? null;
  if (!requested || !requested.participantTask) {
    return { message: "Este slot fotografico HUT no existe o no requiere captura.", ok: false };
  }
  if (requested.evidence && !requested.manualOverride) {
    return { message: "Esta foto HUT ya fue registrada.", ok: false };
  }
  if (requested.status !== "AVAILABLE") {
    return { message: "Esta foto HUT aun no esta disponible.", ok: false };
  }

  return { ok: true, slot: requested };
}

function storagePhaseForApplicationPhotoSlot(slotId: HutPhotoTimelineSlotId): HutPhase {
  if (slotId === "PRODUCT_2_DAY_1" || slotId === "PRODUCT_2_DAY_2" || slotId === "PRODUCT_2_DAY_3_MORNING") {
    return "REGRESO_2";
  }

  return "COLOCACION";
}

function nextLocalDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1));

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function applicationPhotoCapturedLocalDate({
  now,
  testMode,
  useDayNumber
}: {
  now: Date;
  testMode: boolean;
  useDayNumber: number | null;
}): string {
  const capturedLocalDate = hutLocalDateKey(now);
  if (!testMode || useDayNumber === null) {
    return capturedLocalDate;
  }

  return offsetLocalDateKey(capturedLocalDate, Math.max(0, useDayNumber));
}

function hasLegacyMirroredPlacementPhoto(participant: HutParticipantRecord): boolean {
  const colocacionEvidence = participant.applicationEvidence?.find((evidence) => evidence.phase === "COLOCACION") ?? null;
  const deliveryEntry = participant.applicationPhotoEntries?.find((entry) => entry.useDayNumber === 0) ?? null;
  const day1Entry = participant.applicationPhotoEntries?.find((entry) =>
    isLegacyMirroredPlacementPhoto({
      colocacionEvidence,
      day1Entry: entry,
      deliveryEntry
    })
  ) ?? null;

  return Boolean(day1Entry);
}

function isLegacyMirroredPlacementEntry(
  participant: HutParticipantRecord,
  entry: HutApplicationPhotoEntryRecord | null | undefined
): boolean {
  if (!entry) {
    return false;
  }
  const colocacionEvidence = participant.applicationEvidence?.find((evidence) => evidence.phase === "COLOCACION") ?? null;
  const deliveryEntry = participant.applicationPhotoEntries?.find((candidate) => candidate.useDayNumber === 0) ?? null;

  return isLegacyMirroredPlacementPhoto({
    colocacionEvidence,
    day1Entry: entry,
    deliveryEntry
  });
}

function applicationPhotoEntryMatchesEvidence(
  entry: HutApplicationPhotoEntryRecord,
  evidence: HutApplicationEvidenceRecord
): boolean {
  return entry.privateStorageKey === evidence.privateStorageKey
    && entry.capturedAt.getTime() === evidence.capturedAt.getTime()
    && entry.productCode === evidence.productCode;
}

function hutParticipantAuditSnapshot(participant: HutParticipantRecord) {
  return {
    firstFragranceLeftArm: participant.firstFragranceLeftArm,
    folio: participant.folio,
    id: participant.id,
    origin: participantOrigin(participant),
    protocolVersion: participant.protocolVersion,
    secondFragranceRightArm: participant.secondFragranceRightArm,
    status: participant.status,
    studyParticipantId: participant.studyParticipantId
  };
}

function blockingApplicationPhotoEntryByUseDayNumber(
  participant: HutParticipantRecord,
  useDayNumber: number
): HutApplicationPhotoEntryRecord | null {
  return participant.applicationPhotoEntries?.find((entry) =>
    entry.useDayNumber === useDayNumber && !(useDayNumber === 1 && isLegacyMirroredPlacementEntry(participant, entry))
  ) ?? null;
}

function blockingApplicationPhotoEntryByLocalDate(
  participant: HutParticipantRecord,
  capturedLocalDate: string,
  useDayNumber: number | null
): HutApplicationPhotoEntryRecord | null {
  return participant.applicationPhotoEntries?.find((entry) =>
    entry.capturedLocalDate === capturedLocalDate
    && !(useDayNumber === 1 && entry.useDayNumber === 0)
    && !(useDayNumber === 1 && isLegacyMirroredPlacementEntry(participant, entry))
  ) ?? null;
}

async function findApplicationPhotoEntryByUseDayNumber(
  prisma: HutPrismaClient,
  participantId: string,
  useDayNumber: number
): Promise<HutApplicationPhotoEntryRecord | null> {
  return (await prisma.hutApplicationPhotoEntry.findFirst?.({
    select: hutApplicationPhotoEntrySelect,
    where: {
      participantId,
      useDayNumber
    }
  })) as HutApplicationPhotoEntryRecord | null;
}

function offsetLocalDateKey(dateKey: string, days: number): string {
  let current = dateKey;
  for (let index = 0; index < days; index += 1) {
    current = nextLocalDateKey(current);
  }
  return current;
}

function nextApplicationPhotoParticipantStateForSlot(
  slotId: HutPhotoTimelineSlotId
): Partial<Pick<HutParticipantRecord, "currentBlockNumber" | "currentVideoSequence" | "status">> {
  if (slotId === "DELIVERY" || slotId === "PRODUCT_1_DAY_1" || slotId === "PRODUCT_1_DAY_2") {
    return {
      currentBlockNumber: 1,
      currentVideoSequence: 1,
      status: "BLOCK_1_IN_PROGRESS"
    };
  }
  if (slotId === "PRODUCT_1_DAY_3_MORNING") {
    return {
      currentBlockNumber: 1,
      currentVideoSequence: 3,
      status: "BLOCK_1_CALL_PENDING"
    };
  }
  if (slotId === "PRODUCT_2_DAY_1" || slotId === "PRODUCT_2_DAY_2") {
    return {
      currentBlockNumber: 2,
      currentVideoSequence: 1,
      status: "BLOCK_2_IN_PROGRESS"
    };
  }

  return {
    currentBlockNumber: 2,
    currentVideoSequence: 3,
    status: "BLOCK_2_CALL_PENDING"
  };
}

function isApplicationPhotoProtocol(participant: Pick<HutParticipantRecord, "protocolVersion">): boolean {
  return participant.protocolVersion === "APPLICATION_PHOTO";
}

function isLegacyVideoProtocol(participant: Pick<HutParticipantRecord, "protocolVersion">): boolean {
  return participant.protocolVersion === "LEGACY_VIDEO";
}

function participantOrigin(participant: Pick<HutParticipantRecord, "origin" | "studyId"> & { studyParticipantId?: string | null }): "CLT_HUT" | "HUT_DIRECTO" {
  return participant.origin ?? (participant.studyParticipantId ? "CLT_HUT" : "HUT_DIRECTO");
}

function toAuditJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskFieldAccessCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized.length <= 2) {
    return normalized ? "**" : "";
  }

  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

const RESERVED_HUT_NAV_MIN_NUMBER = 1;
const RESERVED_HUT_NAV_MAX_NUMBER = 156;

function hutFolioToReservedNavFolio(folio: string | null | undefined): string | null {
  const match = normalizeHutText(folio).match(/^HUT-(\d{3})$/);
  if (!match) {
    return null;
  }

  const folioNumber = Number(match[1]);
  if (folioNumber < RESERVED_HUT_NAV_MIN_NUMBER || folioNumber > RESERVED_HUT_NAV_MAX_NUMBER) {
    return null;
  }

  return `NAV-${match[1]}`;
}

function navFolioToReservedHutFolio(folio: string | null | undefined): string | null {
  const match = normalizeHutText(folio).match(/^NAV-(\d{3})$/);
  if (!match) {
    return null;
  }

  const folioNumber = Number(match[1]);
  if (folioNumber < RESERVED_HUT_NAV_MIN_NUMBER || folioNumber > RESERVED_HUT_NAV_MAX_NUMBER) {
    return null;
  }

  return `HUT-${match[1]}`;
}

async function buildReservedHutNavReconciliationPreview(
  prisma: HutPrismaClient,
  studyId: string,
  hutFolios?: string[]
): Promise<HutReservedNavReconciliationPreview> {
  const normalizedHutFolios = hutFolios?.map((folio) => normalizeHutText(folio)).filter(Boolean) ?? null;
  const participants = (await prisma.hutParticipant.findMany?.({
    orderBy: [{ folio: "asc" }],
    select: participantSelect,
    where: {
      qaParticipantRun: { is: null },
      ...(normalizedHutFolios ? { folio: { in: normalizedHutFolios } } : {}),
      studyId
    }
  })) as HutParticipantRecord[];
  const reservedParticipants = participants.filter((participant) => hutFolioToReservedNavFolio(participant.folio));
  const navFolios = reservedParticipants
    .map((participant) => hutFolioToReservedNavFolio(participant.folio))
    .filter((folio): folio is string => Boolean(folio));
  const confirmations = await findHutNavReconciliationConfirmations(prisma, studyId, navFolios);
  const slots = await findHutRegistrationSlotsForReconciliation(
    prisma,
    studyId,
    reservedParticipants.map((participant) => normalizeHutText(participant.folio))
  );
  const studyParticipantUsage = new Map<string, string[]>();

  for (const participant of participants) {
    if (!participant.studyParticipantId) {
      continue;
    }
    const participantIds = studyParticipantUsage.get(participant.studyParticipantId) ?? [];
    participantIds.push(participant.id);
    studyParticipantUsage.set(participant.studyParticipantId, participantIds);
  }

  const rows = reservedParticipants.map((participant): HutReservedNavReconciliationRow => {
    const hutFolio = normalizeHutText(participant.folio);
    const navFolio = hutFolioToReservedNavFolio(participant.folio) ?? "";
    const confirmation = confirmations.get(navFolio) ?? null;
    const navStudyParticipantId = confirmation?.studyParticipant.id ?? null;
    const slot = participant.registrationSlot ?? slots.get(hutFolio) ?? null;
    const currentOrigin = participantOrigin(participant);
    const hasDifferentLinkedStudyParticipant = Boolean(
      participant.studyParticipantId && navStudyParticipantId && participant.studyParticipantId !== navStudyParticipantId
    );
    const linkedParticipantsForNav = navStudyParticipantId ? studyParticipantUsage.get(navStudyParticipantId) ?? [] : [];
    const hasOtherHutParticipantForNav = linkedParticipantsForNav.some((participantId) => participantId !== participant.id);
    const hasSlotParticipantConflict = Boolean(slot?.participantId && slot.participantId !== participant.id);
    const alreadyLinked = currentOrigin === "CLT_HUT" && participant.studyParticipantId === navStudyParticipantId && Boolean(navStudyParticipantId);
    const missingNav = !confirmation;
    const missingSlot = !slot;
    const canApply =
      !alreadyLinked &&
      !missingNav &&
      !missingSlot &&
      !hasDifferentLinkedStudyParticipant &&
      !hasOtherHutParticipantForNav &&
      !hasSlotParticipantConflict;
    const reason = reconciliationReason({
      alreadyLinked,
      canApply,
      hasDifferentLinkedStudyParticipant,
      hasOtherHutParticipantForNav,
      hasSlotParticipantConflict,
      missingNav,
      missingSlot
    });

    return {
      canApply,
      currentName: participant.name ?? null,
      currentOrigin,
      eva1: participant.firstFragranceLeftArm ?? slot?.firstFragranceLeftArm ?? null,
      eva2: participant.secondFragranceRightArm ?? slot?.secondFragranceRightArm ?? null,
      existingPhotoCount: (participant.applicationEvidence?.length ?? 0) + (participant.applicationPhotoEntries?.length ?? 0),
      existingPhaseCount: participant.phaseCodes?.length ?? 0,
      hutFolio,
      hutParticipantId: participant.id,
      navEmail: confirmation?.studyParticipant.participantProfile.email ?? null,
      navFolio,
      navName: confirmation?.studyParticipant.participantProfile.name ?? null,
      navPhone: confirmation?.studyParticipant.participantProfile.phone ?? null,
      navStudyParticipantId,
      nextOrigin: "CLT_HUT",
      reason,
      registrationSlotId: slot?.id ?? null,
      studyParticipantId: participant.studyParticipantId ?? null
    };
  });

  return {
    rows,
    summary: {
      alreadyLinked: rows.filter((row) => row.reason === "Ya vinculado correctamente.").length,
      applicable: rows.filter((row) => row.canApply).length,
      blocked: rows.filter((row) => !row.canApply).length,
      missingNav: rows.filter((row) => row.reason === "Pendiente NAV equivalente.").length,
      missingSlot: rows.filter((row) => row.reason === "Falta HutRegistrationSlot.").length,
      total: rows.length
    }
  };
}

async function findHutNavReconciliationConfirmations(
  prisma: HutPrismaClient,
  studyId: string,
  folios: string[]
): Promise<Map<string, HutNavReconciliationConfirmationRecord>> {
  const uniqueFolios = [...new Set(folios.filter(Boolean))];
  if (uniqueFolios.length === 0) {
    return new Map();
  }

  const confirmations = (await prisma.participantConfirmation.findMany?.({
    select: {
      folio: true,
      id: true,
      studyId: true,
      studyParticipant: {
        select: {
          id: true,
          participantProfile: {
            select: {
              email: true,
              name: true,
              phone: true
            }
          }
        }
      }
    },
    where: {
      folio: { in: uniqueFolios },
      studyId
    }
  })) as HutNavReconciliationConfirmationRecord[];

  return new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));
}

async function findHutRegistrationSlotsForReconciliation(
  prisma: HutPrismaClient,
  studyId: string,
  folios: string[]
): Promise<Map<string, HutRegistrationSlotRecord>> {
  const uniqueFolios = [...new Set(folios.filter(Boolean))];
  if (uniqueFolios.length === 0) {
    return new Map();
  }

  const slots = (await prisma.hutRegistrationSlot.findMany?.({
    select: registrationSlotSelect,
    where: {
      folio: { in: uniqueFolios },
      studyId
    }
  })) as HutRegistrationSlotRecord[];

  return new Map(slots.map((slot) => [slot.folio, slot]));
}

function reconciliationReason({
  alreadyLinked,
  canApply,
  hasDifferentLinkedStudyParticipant,
  hasOtherHutParticipantForNav,
  hasSlotParticipantConflict,
  missingNav,
  missingSlot
}: {
  alreadyLinked: boolean;
  canApply: boolean;
  hasDifferentLinkedStudyParticipant: boolean;
  hasOtherHutParticipantForNav: boolean;
  hasSlotParticipantConflict: boolean;
  missingNav: boolean;
  missingSlot: boolean;
}): string {
  if (canApply) {
    return "Listo para reconciliar.";
  }
  if (alreadyLinked) {
    return "Ya vinculado correctamente.";
  }
  if (missingNav) {
    return "Pendiente NAV equivalente.";
  }
  if (missingSlot) {
    return "Falta HutRegistrationSlot.";
  }
  if (hasDifferentLinkedStudyParticipant) {
    return "Conflicto: HUT vinculado a otro StudyParticipant.";
  }
  if (hasOtherHutParticipantForNav) {
    return "Conflicto: otro HUT ya usa el StudyParticipant NAV.";
  }
  if (hasSlotParticipantConflict) {
    return "Conflicto: el slot HUT pertenece a otro participante.";
  }

  return "No aplicable.";
}

function linkedNavProfileData(
  participant: Pick<HutParticipantRecord, "studyParticipant" | "studyParticipantId">
): { email: string | null; name: string; phone: string | null } | null {
  const profile = participant.studyParticipant?.participantProfile ?? null;
  if (!participant.studyParticipantId || !profile) {
    return null;
  }

  return {
    email: profile.email,
    name: profile.name,
    phone: profile.phone
  };
}

function applicationEvidenceSummary(participant: HutParticipantRecord): HutPortalView["applicationEvidence"] {
  return (participant.applicationEvidence ?? []).map((evidence) => ({
    capturedAt: evidence.capturedAt,
    phase: evidence.phase,
    productCode: evidence.productCode
  }));
}

function applicationPhotoEntrySummary(participant: HutParticipantRecord): HutPortalView["applicationPhotoEntries"] {
  return (participant.applicationPhotoEntries ?? []).map((entry) => ({
    capturedAt: entry.capturedAt,
    capturedLocalDate: entry.capturedLocalDate,
    productCode: entry.productCode,
    useDayNumber: entry.useDayNumber
  }));
}

function applicationPhotoPortalMessage(participant: HutParticipantRecord): string {
  if (participant.status === "COMPLETED") {
    return "Tu participacion HUT esta completa. Gracias por tu tiempo.";
  }
  if (participantOrigin(participant) === "HUT_DIRECTO" && hutFilterStatusFromParticipant(participant) !== "COMPLETED") {
    return "Filtro HUT pendiente. El encuestador debe completar los filtros antes de iniciar las fotografias.";
  }

  const slot = nextPendingApplicationPhotoSlot(participant);
  if (!slot) {
    return "No hay fotos HUT pendientes.";
  }
  if (slot.status === "PROGRAMMED" && slot.availableDate) {
    return `Tu siguiente fotografia estara disponible a partir de ${slot.availableDate}.`;
  }

  return `Tienes pendiente registrar: ${slot.title}.`;
}

function hutOperationalPhaseCodeLabel(phase: HutPhase): string {
  const labels: Record<HutPhase, string> = {
    COLOCACION: "HUT inicial / Producto 1",
    REGRESO_1: "HUT seguimiento / Producto 2",
    REGRESO_2: "Sin codigo nuevo / Historico"
  };
  return labels[phase];
}

function pendingHutPhaseMessage(participant: HutParticipantRecord): string | null {
  const phaseGate = currentHutPhaseGate(participant);

  return phaseGate?.required
    ? `Captura el codigo de ${phaseGate.label} antes de continuar.`
    : null;
}

function hutOperationalCodeUnavailableMessage(reason: "MISSING_MASTER_REFERENCE_CODE" | "NO_CODE_FOR_PHASE", slot: 1 | 2 | 3 | null): string {
  if (reason === "NO_CODE_FOR_PHASE") {
    return "Esta fase HUT no requiere un codigo operativo nuevo.";
  }

  return slot
    ? `No encontramos el codigo maestro slot ${slot} para esta fase HUT.`
    : "No encontramos el codigo maestro para esta fase HUT.";
}

function hutPortalMessage(participant: HutParticipantRecord): string {
  switch (participant.status) {
    case "BLOCK_1_IN_PROGRESS":
    case "BLOCK_2_IN_PROGRESS":
      return "Tienes una actividad HUT disponible.";
    case "BLOCK_1_CALL_PENDING":
      return "Tu primera etapa de videos esta completa. El equipo te contactara para tu evaluacion.";
    case "BLOCK_2_CALL_PENDING":
      return "Tu segunda etapa de videos esta completa. El equipo te contactara para tu evaluacion final.";
    case "COMPLETED":
      return "Tu participacion HUT esta completa. Gracias por tu tiempo.";
    default:
      return "Aun no tienes actividades HUT disponibles. Espera indicaciones del equipo.";
  }
}

async function toBlockSummary(
  block: HutBlockRecord,
  participant: HutParticipantRecord,
  storage?: HutStorageClient
): Promise<HutBlockSummary> {
  return {
    ...toBasicBlockSummary(block),
    videos: await buildVideoSummaries(block, participant, storage)
  };
}

function toBasicBlockSummary(block: HutBlockRecord): HutBlockSummary {
  return {
    blockNumber: block.blockNumber,
    disqualificationReason: block.disqualificationReason,
    missedDaysCount: block.missedDaysCount,
    status: block.status,
    submittedVideosCount: block.submittedVideosCount,
    videos: []
  };
}

function toCallSummary(call: HutCallRecord): HutCallSummary {
  return {
    blockNumber: call.blockNumber,
    completedAt: call.completedAt,
    evaluatorName: call.evaluatorName,
    notes: call.notes,
    status: call.status
  };
}

async function buildVideoSummaries(
  block: HutBlockRecord,
  participant: HutParticipantRecord,
  storage?: HutStorageClient
): Promise<HutVideoSummary[]> {
  const videos = participant.videoSubmissions?.filter((video) => video.blockNumber === block.blockNumber) ?? [];

  return Promise.all(
    Array.from({ length: block.requiredVideos }, async (_, index) => {
      const sequenceNumber = index + 1;
      const video = videos.find((item) => item.sequenceNumber === sequenceNumber);
      return {
        sequenceNumber,
        signedUrl: video ? await signedVideoUrl(video, storage) : null,
        status: video?.status ?? "PENDING",
        submittedAt: video?.submittedAt ?? null
      };
    })
  );
}

async function signedVideoUrl(video: HutVideoRecord, storage?: HutStorageClient): Promise<string | null> {
  return signedStorageUrl(video.privateStorageKey ?? null, video.storageBucket ?? null, storage);
}

async function signedStorageUrl(
  privateStorageKey: string | null | undefined,
  storageBucket: string | null | undefined,
  storage?: HutStorageClient
): Promise<string | null> {
  if (!privateStorageKey || !storageBucket) {
    return null;
  }

  try {
    return await (storage ?? createSupabaseEvidenceStorageClient()).createSignedReadUrl({
      bucket: storageBucket,
      expiresInSeconds: 60 * 10,
      privateStorageKey
    });
  } catch {
    return null;
  }
}

async function buildIdentityReviewSummary(
  participant: HutParticipantRecord,
  referenceSignedUrl: string | null,
  storage?: HutStorageClient
): Promise<HutIdentityReviewSummary> {
  const items = await Promise.all(
    [1, 2].flatMap((blockNumber) =>
      Array.from({ length: HUT_REQUIRED_VIDEOS_PER_BLOCK }, (_, index) =>
        buildIdentityReviewItem(participant, blockNumber as 1 | 2, index + 1, storage)
      )
    )
  );

  const reviewedItems = items.filter((item) => item.reviewedAt);
  const latestReviewed = reviewedItems.sort((left, right) => (right.reviewedAt?.getTime() ?? 0) - (left.reviewedAt?.getTime() ?? 0))[0] ?? null;
  const effectiveItems = items.filter((item) => item.verificationId);
  const summaryLabel = participant.referenceSelfie
    ? effectiveItems.some((item) => item.status === "NOT_MATCHED")
      ? "FALLIDA"
      : effectiveItems.some((item) => item.status === "UNCERTAIN" || item.status === "PENDING_REVIEW")
        ? "REVISION_REQUERIDA"
        : effectiveItems.some((item) => item.status === "MATCHED" || item.status === "NOT_REQUIRED_BY_OVERRIDE")
          ? "OK"
          : "PENDIENTE"
    : "SIN_SELFIE_BASE";

  return {
    items,
    lastReviewedAt: latestReviewed?.reviewedAt ?? null,
    lastStatus: latestReviewed ? latestReviewed.reviewLabel : effectiveItems[0]?.reviewLabel ?? null,
    referenceSignedUrl,
    summaryLabel
  };
}

async function buildIdentityReviewItem(
  participant: HutParticipantRecord,
  blockNumber: 1 | 2,
  sequenceNumber: number,
  storage?: HutStorageClient
): Promise<HutIdentityReviewItem> {
  const verification =
    participant.visualVerifications?.find(
      (item) => item.blockNumber === blockNumber && item.sequenceNumber === sequenceNumber
    ) ?? null;

  return {
    attemptSignedUrl: verification
      ? await signedStorageUrl(verification.attemptSelfieKey, verification.attemptStorageBucket, storage)
      : null,
    blockNumber,
    reviewLabel: verification ? visualVerificationLabel(verification.status, Boolean(verification.reviewedAt)) : "Pendiente",
    reviewedAt: verification?.reviewedAt ?? null,
    reviewedByUserId: verification?.reviewedByUserId ?? null,
    reviewNotes: verification?.overrideReason ?? null,
    sequenceNumber,
    similarityPercentage: verification?.similarityScore != null ? Math.round(verification.similarityScore * 100) : null,
    status: verification?.status ?? "PENDING",
    verificationDate: verification?.verificationDate ?? null,
    verificationId: verification?.id ?? null
  };
}

function visualVerificationLabel(
  status: HutVisualVerificationRecord["status"],
  reviewedManually: boolean
): string {
  if (reviewedManually && status === "MATCHED") {
    return "Aprobada manualmente";
  }
  if (reviewedManually && status === "NOT_MATCHED") {
    return "Rechazada manualmente";
  }

  const labels: Record<HutVisualVerificationRecord["status"], string> = {
    MATCHED: "OK",
    NOT_MATCHED: "No coincide",
    NOT_REQUIRED_BY_OVERRIDE: "Override visual",
    PENDING: "Pendiente",
    PENDING_REVIEW: "Revisión requerida",
    UNCERTAIN: "Revisión requerida"
  };
  return labels[status];
}

function blockByNumber(participant: HutParticipantRecord, blockNumber: 1 | 2) {
  return participant.blocks.find((block) => block.blockNumber === blockNumber) ?? null;
}

function callByNumber(participant: HutParticipantRecord, blockNumber: 1 | 2) {
  return participant.callEvaluations.find((call) => call.blockNumber === blockNumber) ?? null;
}

function callForBlock(participant: HutParticipantRecord, blockNumber: 1 | 2, status: HutCallEvaluationStatus) {
  return callByNumber(participant, blockNumber)?.status === status;
}

function activeBlock(participant: HutParticipantRecord) {
  return participant.blocks.find((block) => block.status === "IN_PROGRESS") ?? null;
}

function nextBlockDayNumber(participant: HutParticipantRecord, block: HutBlockRecord): number {
  return nextHutBlockDayNumber(participant.dailyChecks?.filter((check) => check.blockId === block.id) ?? []);
}

function currentAvailability(participant: HutParticipantRecord, block: HutBlockRecord, now: Date) {
  const sequenceNumber = nextHutVideoSequence(block) ?? block.requiredVideos;
  const latestVerification = latestVerificationForSequence(participant, block.blockNumber, sequenceNumber);

  return getHutCurrentAvailability({
    block,
    dailyChecks: participant.dailyChecks?.filter((check) => check.blockId === block.id) ?? [],
    hasReferenceSelfie: Boolean(participant.referenceSelfie),
    hasVisualOverride: participant.visualOverrideEnabled,
    latestVerificationStatus: latestVerification?.status ?? null,
    now,
    testMode: participant.testMode,
    timeZoneIana: participant.study.timeZoneIana || "America/Mexico_City"
  });
}

function latestVerificationForSequence(
  participant: HutParticipantRecord,
  blockNumber: number,
  sequenceNumber: number
) {
  return (
    participant.visualVerifications?.find(
      (verification) =>
        verification.blockNumber === blockNumber && verification.sequenceNumber === sequenceNumber
    ) ?? null
  );
}

function hutVisualStatusFromReview(reviewStatus: "APPROVED" | "PENDING" | "REJECTED") {
  if (reviewStatus === "APPROVED") {
    return "MATCHED" as const;
  }
  if (reviewStatus === "REJECTED") {
    return "NOT_MATCHED" as const;
  }

  return "UNCERTAIN" as const;
}

function videoUnavailableMessage(reason: string) {
  if (reason === "WAIT_UNTIL_5_AM") {
    return "Este video aún no está disponible. Intenta nuevamente mañana a partir de las 5:00 a.m.";
  }
  if (reason === "WAIT_UNTIL_NEXT_DAY") {
    return "Este video aún no está disponible. Intenta nuevamente mañana a partir de las 5:00 a.m.";
  }
  if (reason === "MISSING_REFERENCE_SELFIE") {
    return "Tu registro aun no esta completo. Contacta al encuestador.";
  }
  if (reason === "AVAILABLE_FOR_SELFIE") {
    return "Antes de subir tu video, tomaremos una selfie para confirmar tu identidad.";
  }
  if (reason === "VISUAL_VERIFICATION_FAILED" || reason === "VISUAL_VERIFICATION_PENDING") {
    return "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.";
  }

  return "No hay videos disponibles para subir en este momento.";
}

async function disqualifyParticipant(
  prisma: HutPrismaClient,
  input: { block: HutBlockRecord; participant: HutParticipantRecord; reason: string }
) {
  const now = new Date();
  await prisma.hutBlock.update?.({
    data: {
      disqualificationReason: input.reason,
      disqualifiedAt: now,
      status: "DISQUALIFIED"
    },
    where: { id: input.block.id }
  });
  await prisma.hutParticipant.update?.({
    data: {
      status: "DISQUALIFIED"
    },
    where: { id: input.participant.id }
  });
}

function participantLink(requestOrigin: string, token: string) {
  return new URL(`/hut/p/${encodeURIComponent(token)}`, resolvePublicLinkOrigin(requestOrigin)).toString();
}

function hutWhatsAppParticipantLink(token: string): string {
  const origin = resolveConfiguredPublicOrigin() ?? DEFAULT_PUBLIC_APP_ORIGIN;
  return new URL(`/hut/p/${encodeURIComponent(token)}`, origin).toString();
}

function registrationLink(requestOrigin: string, token: string) {
  return new URL(`/hut/register/${encodeURIComponent(token)}`, resolvePublicLinkOrigin(requestOrigin)).toString();
}

async function createHutParticipantFoundation(
  tx: HutPrismaClient,
  input: { participantId: string; startDate: Date | null; startsNow: boolean }
) {
  await tx.hutBlock.create?.({
    data: {
      blockNumber: 1,
      maxMissedDaysAllowed: HUT_MAX_MISSED_DAYS_PER_BLOCK,
      participantId: input.participantId,
      requiredVideos: HUT_REQUIRED_VIDEOS_PER_BLOCK,
      startDate: input.startDate,
      status: input.startsNow ? "IN_PROGRESS" : "NOT_STARTED"
    }
  });
  await tx.hutBlock.create?.({
    data: {
      blockNumber: 2,
      maxMissedDaysAllowed: HUT_MAX_MISSED_DAYS_PER_BLOCK,
      participantId: input.participantId,
      requiredVideos: HUT_REQUIRED_VIDEOS_PER_BLOCK,
      status: "NOT_STARTED"
    }
  });
  await tx.hutCallEvaluation.create?.({
    data: {
      blockNumber: 1,
      participantId: input.participantId,
      status: "PENDING"
    }
  });
  await tx.hutCallEvaluation.create?.({
    data: {
      blockNumber: 2,
      participantId: input.participantId,
      status: "PENDING"
    }
  });
}

function extensionFromFilename(filename: string): string {
  return filename.trim().toLowerCase().split(".").pop() ?? "";
}

function dateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createNoopOneuiWhatsAppRepository(): OneuiWhatsAppRepository {
  return {
    async createOutboundMessage(input) {
      const now = new Date();
      return {
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        createdAt: now,
        direction: "OUTBOUND",
        fromPhone: input.fromPhone,
        id: "noop-whatsapp-message",
        messageType: input.messageType ?? "template",
        metaMessageId: null,
        rawPayload: input.rawPayload,
        status: "pending",
        timestamp: input.timestamp,
        toPhone: input.toPhone,
        updatedAt: now
      };
    },
    async findLatestOutboundTemplateMessage() {
      return null;
    },
    async getConversationWithMessages() {
      return null;
    },
    async listConversations() {
      return [];
    },
    async markOutboundMessageAccepted(input) {
      const now = new Date();
      return {
        bodyText: null,
        conversationId: "noop-whatsapp-conversation",
        createdAt: now,
        direction: "OUTBOUND",
        fromPhone: "",
        id: input.messageId,
        messageType: "template",
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: input.status,
        timestamp: input.timestamp,
        toPhone: "",
        updatedAt: now
      };
    },
    async markOutboundMessageFailed(input) {
      const now = new Date();
      return {
        bodyText: null,
        conversationId: "noop-whatsapp-conversation",
        createdAt: now,
        direction: "OUTBOUND",
        fromPhone: "",
        id: input.messageId,
        messageType: "template",
        metaMessageId: null,
        rawPayload: input.rawPayload,
        status: input.status,
        timestamp: now,
        toPhone: "",
        updatedAt: now
      };
    },
    async saveInboundMessage(input) {
      const now = new Date();
      return {
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        createdAt: now,
        direction: "INBOUND",
        fromPhone: input.fromPhone,
        id: "noop-whatsapp-inbound-message",
        messageType: input.messageType,
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: null,
        timestamp: input.timestamp,
        toPhone: input.toPhone,
        updatedAt: now
      };
    },
    async saveStatusEvent(input) {
      return {
        createdAt: new Date(),
        id: "noop-whatsapp-status-event",
        messageId: null,
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: input.status,
        timestamp: input.timestamp
      };
    },
    async upsertInboundConversation(input) {
      const now = new Date();
      return {
        createdAt: now,
        id: "noop-whatsapp-conversation",
        lastInboundAt: input.lastInboundAt,
        lastMessageAt: input.lastInboundAt,
        lastOutboundAt: null,
        linkedParticipantId: null,
        linkedStudyId: null,
        phoneNumber: input.phoneNumber,
        profileName: input.profileName,
        sourceModule: "GENERAL",
        updatedAt: now,
        waId: input.waId
      };
    },
    async upsertOutboundConversation(input) {
      const now = new Date();
      return {
        createdAt: now,
        id: "noop-whatsapp-conversation",
        lastInboundAt: null,
        lastMessageAt: now,
        lastOutboundAt: now,
        linkedParticipantId: input.linkedParticipantId ?? null,
        linkedStudyId: input.linkedStudyId ?? null,
        phoneNumber: input.phoneNumber,
        profileName: input.profileName ?? null,
        sourceModule: input.sourceModule,
        updatedAt: now,
        waId: input.waId
      };
    }
  };
}
