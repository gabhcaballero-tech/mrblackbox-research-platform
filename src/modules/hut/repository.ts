import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
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
  getHutQuestions,
  getHutV5Definition,
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
import { createOneuiWhatsAppRepository, sendHutRegistrationWhatsApp, type OneuiWhatsAppRepository } from "@/modules/oneui-whatsapp";
import { whatsappAutomationStatusFromMessage, type WhatsAppAutomationStatus } from "@/modules/oneui-whatsapp/templates";
import {
  decryptHutPhaseCode,
  encryptHutPhaseCode,
  generateHutPhaseCode,
  hashHutPhaseCode,
  hutPhaseForSlot,
  hutSlotForPhase,
  resolveHutPhaseCodeSecret,
  type HutPhase,
  type HutPhaseCodeStatus
} from "./phase-codes";

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
  name: string;
  phone: string | null;
  origin: "CLT_HUT" | "HUT_DIRECTO";
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
  status: HutParticipantStatus;
  studyParticipantId: string | null;
  testMode: boolean;
  token: string;
  usedToleranceInCurrentBlock: boolean;
  visualOverrideEnabled: boolean;
  whatsappRegistration: WhatsAppAutomationStatus;
};

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
  productCode: string | null;
  signedUrl: string | null;
};

export type HutApplicationPhotoEntryAdmin = {
  capturedAt: Date;
  capturedLocalDate: string;
  capturedLocalTimezone: string;
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
  productCode: string | null;
  useDayNumber: number;
};

export type HutApplicationPhotoDailyAvailability = {
  available: boolean;
  capturedLocalDate: string;
  existingEntry: HutApplicationPhotoEntrySummary | null;
  nextAvailableLocalDate: string | null;
  reason: "AVAILABLE" | "LEGACY_PROTOCOL" | "PHOTO_ALREADY_CAPTURED_TODAY";
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
  registrationSlots: HutRegistrationSlotAdmin[];
  study: HutStudySummary;
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
  availableApplicationPhoto: {
    phase: HutPhase;
    productCode: string | null;
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
  phaseGate: {
    label: string;
    phase: HutPhase;
    required: boolean;
    status: HutPhaseCodeStatus | "MISSING";
  } | null;
  participantId: string;
  origin: "CLT_HUT" | "HUT_DIRECTO";
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
  requestDailySelfieUpload: (input: {
    metadata: HutSelfieUploadMetadata;
    storage?: HutStorageClient;
    token: string;
  }) => Promise<HutActionResult<HutSignedSelfieUpload & { referenceSelfieSignedUrl: string }>>;
  requestApplicationPhotoUpload: (input: {
    metadata: HutApplicationPhotoUploadMetadata;
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
    now?: Date;
    participantId: string;
    questionCode: string;
    studyId: string;
  }) => Promise<HutActionResult<{ answerValue: unknown; questionCode: string; visitProgressId: string | null }>>;
  saveQuestionnaireAnswerByToken: (input: {
    answerInput: HutAnswerInput;
    now?: Date;
    questionCode: string;
    token: string;
  }) => Promise<HutActionResult<{ answerValue: unknown; questionCode: string; visitProgressId: string | null }>>;
  completeQuestionnaireSection: (input: {
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

type HutParticipantConfirmationCodeSourceRecord = {
  folio: string;
  id: string;
  referenceCodes: HutReferenceCodeRecord[];
  studyId: string;
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
      folio: true,
      id: true,
      registrationToken: true,
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

      return {
        participants: await Promise.all(
        participants.map((participant) => toAdminParticipant(participant, input.requestOrigin, input.storage, getWhatsAppRepository()))
        ),
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

      return {
        data: toPortalView(participant),
        ok: true
      };
    },

    async ensureQuestionnaireAttempt(input) {
      const prisma = await getPrisma();
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
      return ensureHutQuestionnaireSectionProgressInternal(prisma, input);
    },

    async completeQuestionnaireSection(input) {
      const prisma = await getPrisma();
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

      return {
        data: toVisitProgressSummary(visit),
        message: "Seccion HUT v5 completada correctamente.",
        ok: true
      };
    },

    async saveQuestionnaireAnswer(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
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
      const applicableCodes = new Set(
        getHutApplicableQuestions({
          answers: {
            ...answerLookup,
            ...input.answerInput
          },
          context: { participantOrigin: participantOrigin(participant) },
          definition: getHutV5Definition()
        }).map((candidate) => candidate.code)
      );

      if (!applicableCodes.has(question.code)) {
        return {
          message: "Esta pregunta HUT se omite para este participante.",
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
      const prisma = await getPrisma();
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }

      const phaseGate = currentHutPhaseGate(participant);
      if (phaseGate?.required) {
        return { message: `Captura el codigo de ${phaseGate.label} antes de continuar.`, ok: false };
      }

      const phase = expectedApplicationPhotoPhase(participant);
      if (!phase) {
        return { message: "No hay cuestionario HUT pendiente.", ok: false };
      }

      const question = getHutQuestions().find((candidate) => candidate.code === input.questionCode);
      if (!question || !hutQuestionnaireSectionsForPhase(phase).includes(question.section)) {
        return { message: "Esta pregunta HUT no corresponde a la fase actual.", ok: false };
      }

      return createHutRepository(prisma, getWhatsAppRepository()).saveQuestionnaireAnswer({
        answerInput: input.answerInput,
        now: input.now,
        participantId: participant.id,
        questionCode: input.questionCode,
        studyId: participant.studyId
      });
    },

    async getQuestionnaireState(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
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
      const applicableQuestionCodes = getHutApplicableQuestions({
        answers,
        context: { participantOrigin: participantOrigin(participant) },
        definition: getHutV5Definition()
      }).map((question) => question.code);
      const applicableSet = new Set(applicableQuestionCodes);
      const omittedQuestionCodes = getHutQuestions()
        .map((question) => question.code)
        .filter((code) => !applicableSet.has(code));

      return {
        data: {
          answers,
          applicableQuestionCodes,
          attempt: toQuestionnaireAttemptSummary(state),
          omittedQuestionCodes,
          participantOrigin: participantOrigin(participant),
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

    async getApplicationPhotoDailyAvailability(input) {
      const prisma = await getPrisma();
      const participant = await findParticipant(prisma, input.participantId);

      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
      }

      const capturedLocalDate = hutLocalDateKey(input.now ?? new Date());
      if (!isApplicationPhotoProtocol(participant)) {
        return {
          data: {
            available: false,
            capturedLocalDate,
            existingEntry: null,
            nextAvailableLocalDate: null,
            reason: "LEGACY_PROTOCOL"
          },
          ok: true
        };
      }

      const existing = (await prisma.hutApplicationPhotoEntry.findFirst?.({
        select: hutApplicationPhotoEntrySelect,
        where: {
          capturedLocalDate,
          participantId: participant.id
        }
      })) as HutApplicationPhotoEntryRecord | null;

      return {
        data: {
          available: !existing,
          capturedLocalDate,
          existingEntry: existing ? toApplicationPhotoEntrySummary(existing) : null,
          nextAvailableLocalDate: existing ? nextLocalDateKey(capturedLocalDate) : null,
          reason: existing ? "PHOTO_ALREADY_CAPTURED_TODAY" : "AVAILABLE"
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
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "Este participante conserva el flujo HUT historico.", ok: false };
        }

        const capturedLocalDate = hutLocalDateKey(now);
        const existing = (await tx.hutApplicationPhotoEntry.findFirst?.({
          select: hutApplicationPhotoEntrySelect,
          where: {
            capturedLocalDate,
            participantId: participant.id
          }
        })) as HutApplicationPhotoEntryRecord | null;

        if (existing) {
          return {
            message: "Ya existe una foto de aplicacion registrada para el dia de hoy.",
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
      const participant = await findParticipantByToken(prisma, input.token);

      if (!participant) {
        return { message: "Este enlace HUT no es valido.", ok: false };
      }
      if (!isApplicationPhotoProtocol(participant)) {
        return { message: "Este participante conserva el flujo HUT historico.", ok: false };
      }

      const phase = expectedApplicationPhotoPhase(participant);
      if (!phase) {
        return { message: "No hay foto de aplicacion pendiente.", ok: false };
      }

      const phaseBlock = pendingHutPhaseMessage(participant);
      if (phaseBlock) {
        return { message: phaseBlock, ok: false };
      }

      const questionnaireReady = await hutQuestionnaireReadyForPhase(prisma, participant, phase);
      if (!questionnaireReady.ok) {
        return { message: questionnaireReady.message, ok: false };
      }

      const capturedLocalDate = hutLocalDateKey(new Date());
      const existingDailyPhoto = (await prisma.hutApplicationPhotoEntry.findFirst?.({
        select: hutApplicationPhotoEntrySelect,
        where: {
          capturedLocalDate,
          participantId: participant.id
        }
      })) as HutApplicationPhotoEntryRecord | null;
      if (existingDailyPhoto) {
        return { message: "Ya existe una foto de aplicacion registrada para el dia de hoy.", ok: false };
      }

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
            productCode: hutProductCodeForPhase(participant, phase)
          },
          ok: true
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : "No fue posible preparar la foto de aplicacion.", ok: false };
      }
    },

    async confirmApplicationPhotoUpload(input) {
      const prisma = await getPrisma();
      const now = new Date();

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }
        if (!isApplicationPhotoProtocol(participant)) {
          return { message: "Este participante conserva el flujo HUT historico.", ok: false };
        }

        const phase = expectedApplicationPhotoPhase(participant);
        if (!phase) {
          return { message: "No hay foto de aplicacion pendiente.", ok: false };
        }

        const phaseBlock = pendingHutPhaseMessage(participant);
        if (phaseBlock) {
          return { message: phaseBlock, ok: false };
        }

        const questionnaireReady = await hutQuestionnaireReadyForPhase(tx, participant, phase);
        if (!questionnaireReady.ok) {
          return { message: questionnaireReady.message, ok: false };
        }

        const capturedLocalDate = hutLocalDateKey(now);
        const existingDailyPhoto = (await tx.hutApplicationPhotoEntry.findFirst?.({
          select: hutApplicationPhotoEntrySelect,
          where: {
            capturedLocalDate,
            participantId: participant.id
          }
        })) as HutApplicationPhotoEntryRecord | null;
        if (existingDailyPhoto) {
          return { message: "Ya existe una foto de aplicacion registrada para el dia de hoy.", ok: false };
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

        await tx.hutApplicationEvidence.create?.({
          data: {
            capturedAt: now,
            extension: extensionFromFilename(input.metadata.originalFilename),
            mimeType: input.metadata.mimeType,
            originalFilename: input.metadata.originalFilename,
            participantId: participant.id,
            phase,
            privateStorageKey: input.metadata.privateStorageKey,
            productCode: hutProductCodeForPhase(participant, phase),
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket
          }
        });

        const existingPhotoCount = (await tx.hutApplicationPhotoEntry.count?.({
          where: { participantId: participant.id }
        })) as number | undefined;
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
            productCode: hutProductCodeForPhase(participant, phase),
            sizeBytes: input.metadata.sizeBytes,
            storageBucket: input.metadata.storageBucket,
            useDayNumber: (existingPhotoCount ?? 0) + 1
          }
        });

        const phaseCode = participant.phaseCodes?.find((code) => code.phase === phase) ?? null;
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
          data: nextApplicationPhotoParticipantState(phase),
          where: { id: participant.id }
        });

        return {
          data: { phase },
          message: phase === "REGRESO_2" ? "Foto registrada. Tu participacion HUT esta completa." : "Foto registrada correctamente.",
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
      const now = input.now ?? new Date();
      const secret = input.secret ?? resolveHutPhaseCodeSecret();

      if (!secret) {
        return { message: "No fue posible preparar codigos HUT seguros.", ok: false };
      }

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipant(tx, input.participantId);

        if (!participant || participant.studyId !== input.studyId) {
          return { message: "No encontramos el participante HUT.", ok: false };
        }

        if (!participant.folio) {
          return { message: "El participante HUT no tiene folio para sincronizar codigos.", ok: false };
        }

        const existingCodes = (await tx.hutParticipantPhaseCode.findMany?.({
          select: {
            codeHash: true,
            encryptedCode: true,
            id: true,
            participantId: true,
            phase: true,
            slot: true,
            status: true
          },
          where: { participantId: participant.id }
        })) as HutPhaseCodeRecord[];
        const inconsistencies = phaseCodeInconsistencies(existingCodes);
        const existingByPhase = new Map(existingCodes.map((code) => [code.phase, code]));
        const missingPhases = ([1, 2, 3] as const)
          .map((slot) => ({ phase: hutPhaseForSlot(slot), slot }))
          .filter((item): item is { phase: HutPhase; slot: 1 | 2 | 3 } => Boolean(item.phase))
          .filter((item) => !existingByPhase.has(item.phase));

        if (inconsistencies.length > 0) {
          return {
            message: `No se sincronizaron codigos HUT: ${inconsistencies.join(" ")}`,
            ok: false
          };
        }

        if (missingPhases.length === 0) {
          return {
            data: {
              created: 0,
              existing: existingCodes.length,
              inconsistencies: []
            },
            message: "Codigos HUT de fase ya estaban sincronizados.",
            ok: true
          };
        }

        const confirmation = (await tx.participantConfirmation.findFirst?.({
          select: {
            folio: true,
            id: true,
            referenceCodes: {
              orderBy: { slot: "asc" },
              select: {
                code: true,
                slot: true
              }
            },
            studyId: true
          },
          where: {
            folio: participant.folio,
            studyId: input.studyId
          }
        })) as HutParticipantConfirmationCodeSourceRecord | null;

        if (!confirmation) {
          return { message: "No encontramos codigos de referencia para este folio.", ok: false };
        }

        const sourceBySlot = new Map(confirmation.referenceCodes.map((code) => [code.slot, code]));
        const missingSourceSlots = missingPhases
          .filter((item) => !sourceBySlot.get(item.slot)?.code)
          .map((item) => item.slot);

        if (missingSourceSlots.length > 0) {
          return {
            message: `Faltan codigos de referencia para slots: ${missingSourceSlots.join(", ")}.`,
            ok: false
          };
        }

        let created = 0;
        for (const missing of missingPhases) {
          const source = sourceBySlot.get(missing.slot);

          if (!source) {
            continue;
          }

          await tx.hutParticipantPhaseCode.create?.({
            data: {
              codeHash: hashHutPhaseCode(source.code, secret),
              encryptedCode: encryptHutPhaseCode(source.code, secret),
              encryptionVersion: 1,
              participantId: participant.id,
              phase: missing.phase,
              slot: missing.slot,
              status: "GENERATED",
              validatedAt: null,
              usedAt: null,
              sentAt: null,
              expiresAt: null,
              createdAt: now
            }
          });
          created += 1;
        }

        return {
          data: {
            created,
            existing: existingCodes.length,
            inconsistencies: []
          },
          message: "Codigos HUT de fase sincronizados correctamente.",
          ok: true
        };
      });
    },

    async recoverPhaseCode(input) {
      const prisma = await getPrisma();
      const secret = input.secret ?? resolveHutPhaseCodeSecret();

      if (!secret) {
        return { message: "No fue posible recuperar el codigo HUT.", ok: false };
      }

      const participant = await findParticipant(prisma, input.participantId);
      if (!participant || participant.studyId !== input.studyId) {
        return { message: "No encontramos el participante HUT.", ok: false };
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
      const secret = resolveHutPhaseCodeSecret();

      if (!secret) {
        return { message: "No fue posible validar el codigo HUT.", ok: false };
      }

      return prisma.$transaction(async (tx) => {
        const participant = await findParticipantByToken(tx, input.token);

        if (!participant) {
          return { message: "Este enlace HUT no es valido.", ok: false };
        }
        const expectedPhase = expectedHutPhaseForParticipant(participant);
        if (expectedPhase !== input.phase) {
          return { message: "Este codigo no corresponde a la fase actual.", ok: false };
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
  whatsappRepository?: OneuiWhatsAppRepository
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
      productCode: evidence.productCode,
      signedUrl: await signedStorageUrl(evidence.privateStorageKey, evidence.storageBucket, storage)
    }))
  );
  const applicationPhotoEntries = await Promise.all(
    (participant.applicationPhotoEntries ?? []).map(async (entry) => ({
      capturedAt: entry.capturedAt,
      capturedLocalDate: entry.capturedLocalDate,
      capturedLocalTimezone: entry.capturedLocalTimezone,
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
    name: participant.name,
    origin: participantOrigin(participant),
    phaseCodes: toAdminPhaseCodes(participant),
    phone: participant.phone,
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
    studyParticipantId: participant.studyParticipantId ?? null,
    testMode: participant.testMode,
    token: participant.token,
    usedToleranceInCurrentBlock: Boolean(block && block.missedDaysCount >= block.maxMissedDaysAllowed),
    visualOverrideEnabled: participant.visualOverrideEnabled,
    whatsappRegistration
  };
}

function toAdminPhaseCodes(participant: HutParticipantRecord): HutPhaseCodeAdmin[] {
  return ([1, 2, 3] as const).map((slot) => {
    const phase = hutPhaseForSlot(slot);
    const code = phase ? participant.phaseCodes?.find((item) => item.phase === phase) ?? null : null;

    return {
      expiresAt: code?.expiresAt ?? null,
      label: phase ? hutPhaseLabel(phase) : `Fase ${slot}`,
      phase: phase ?? "COLOCACION",
      sentAt: code?.sentAt ?? null,
      slot,
      status: code?.status ?? "MISSING",
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

function toPortalView(participant: HutParticipantRecord): HutPortalView {
  if (isApplicationPhotoProtocol(participant)) {
    return toApplicationPhotoPortalView(participant);
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
      message:
        "Gracias por tu participacion. Por las reglas del estudio, no es posible continuar con esta etapa. El equipo podra contactarte si requiere informacion adicional.",
      name: hutParticipantDisplayName(participant),
      origin: participantOrigin(participant),
      phaseGate,
      participantId: participant.id,
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
    message: hutPortalMessage(participant),
    name: hutParticipantDisplayName(participant),
    origin: participantOrigin(participant),
    phaseGate,
    participantId: participant.id,
    protocolVersion: "LEGACY_VIDEO",
    rotation: hutParticipantRotation(participant),
    status: participant.status,
    studyName: participant.study.name,
    testMode: participant.testMode,
    token: participant.token
  };
}

function toApplicationPhotoPortalView(participant: HutParticipantRecord): HutPortalView {
  const phaseGate = currentHutPhaseGate(participant);
  const nextPhase = expectedApplicationPhotoPhase(participant);
  const evidence = applicationEvidenceSummary(participant);
  const availableApplicationPhoto = nextPhase && !phaseGate?.required
    ? {
        phase: nextPhase,
        productCode: hutProductCodeForPhase(participant, nextPhase)
      }
    : null;

  return {
    applicationEvidence: evidence,
    availableApplicationPhoto,
    availableUpload: null,
    availability: {
      nextAvailableAt: null,
      reason: availableApplicationPhoto ? "AVAILABLE_FOR_APPLICATION_PHOTO" : nextPhase ? "WAITING_FOR_PHASE_CODE" : "COMPLETE"
    },
    block1: null,
    block2: null,
    folio: participant.folio,
    message: applicationPhotoPortalMessage(participant),
    name: hutParticipantDisplayName(participant),
    origin: participantOrigin(participant),
    phaseGate,
    participantId: participant.id,
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

function hutParticipantRotation(participant: HutParticipantRecord): HutPortalView["rotation"] {
  return {
    firstFragranceLeftArm: participant.firstFragranceLeftArm,
    secondFragranceRightArm: participant.secondFragranceRightArm
  };
}

function currentHutPhaseGate(participant: HutParticipantRecord): HutPortalView["phaseGate"] {
  if (!isApplicationPhotoProtocol(participant)) {
    return null;
  }

  const phase = expectedApplicationPhotoPhase(participant);
  const phaseCode = phase ? participant.phaseCodes?.find((code) => code.phase === phase) ?? null : null;

  if (!phase) {
    return null;
  }

  return {
    label: hutPhaseLabel(phase),
    phase,
    required: !phaseCode || (phaseCode.status !== "USED" && phaseCode.status !== "VALIDATED"),
    status: phaseCode?.status ?? "MISSING"
  };
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
  const captured = new Set((participant.applicationEvidence ?? []).map((evidence) => evidence.phase));

  if (!captured.has("COLOCACION")) {
    return "COLOCACION";
  }
  if (!captured.has("REGRESO_1")) {
    return "REGRESO_1";
  }
  if (!captured.has("REGRESO_2")) {
    return "REGRESO_2";
  }

  return null;
}

function hutProductCodeForPhase(participant: HutParticipantRecord, phase: HutPhase): string | null {
  if (phase === "COLOCACION") {
    return participant.firstFragranceLeftArm;
  }

  return participant.secondFragranceRightArm;
}

function hutQuestionnaireSectionsForPhase(phase: HutPhase): HutQuestionnaireSectionId[] {
  if (phase === "COLOCACION") {
    return ["DATOS_GENERALES", "FILTROS", "PRIMERA_VISITA"];
  }
  if (phase === "REGRESO_1") {
    return ["EVALUACION_PRIMER_PERFUME", "SEGUNDA_VISITA"];
  }

  return ["EVALUACION_SEGUNDO_PERFUME", "COMPARATIVA"];
}

async function hutQuestionnaireReadyForPhase(
  prisma: HutPrismaClient,
  participant: HutParticipantRecord,
  phase: HutPhase
): Promise<{ ok: true } | { message: string; ok: false }> {
  const attempt = (await prisma.hutQuestionnaireAttempt.findUnique?.({
    select: hutQuestionnaireStateSelect,
    where: { participantId: participant.id }
  })) as HutQuestionnaireAttemptRecord | null;

  if (!attempt) {
    return { message: "Completa el cuestionario HUT antes de registrar la foto de aplicacion.", ok: false };
  }

  const answers = Object.fromEntries((attempt.answers ?? []).map((answer) => [answer.questionCode, answer.answerJson]));
  const sections = new Set(hutQuestionnaireSectionsForPhase(phase));
  const pending = getHutApplicableQuestions({
    answers,
    context: { participantOrigin: participantOrigin(participant) },
    definition: getHutV5Definition()
  }).filter((question) => sections.has(question.section) && question.required && !(question.code in answers));

  if (pending.length > 0) {
    return {
      message: "Completa el cuestionario HUT antes de registrar la foto de aplicacion.",
      ok: false
    };
  }

  return { ok: true };
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

function nextApplicationPhotoParticipantState(phase: HutPhase): Partial<Pick<HutParticipantRecord, "currentBlockNumber" | "currentVideoSequence" | "status">> {
  if (phase === "COLOCACION") {
    return {
      currentBlockNumber: 1,
      currentVideoSequence: 1,
      status: "BLOCK_1_CALL_PENDING"
    };
  }
  if (phase === "REGRESO_1") {
    return {
      currentBlockNumber: 2,
      currentVideoSequence: 1,
      status: "BLOCK_2_CALL_PENDING"
    };
  }

  return {
    currentBlockNumber: 2,
    currentVideoSequence: 1,
    status: "COMPLETED"
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

function applicationPhotoPortalMessage(participant: HutParticipantRecord): string {
  if (participant.status === "COMPLETED") {
    return "Tu participacion HUT esta completa. Gracias por tu tiempo.";
  }

  const phase = expectedApplicationPhotoPhase(participant);
  if (!phase) {
    return "No hay fotos HUT pendientes.";
  }

  return `Tienes pendiente registrar la foto de aplicacion de ${hutPhaseLabel(phase)}.`;
}

function hutPhaseLabel(phase: HutPhase): string {
  const labels: Record<HutPhase, string> = {
    COLOCACION: "Colocacion / Entrega 1",
    REGRESO_1: "Regreso 1 / Evaluacion 1 / Entrega 2",
    REGRESO_2: "Regreso 2 / Evaluacion 2"
  };
  return labels[phase];
}

function pendingHutPhaseMessage(participant: HutParticipantRecord): string | null {
  const phaseGate = currentHutPhaseGate(participant);

  return phaseGate?.required
    ? `Captura el codigo de ${phaseGate.label} antes de continuar.`
    : null;
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

function phaseCodeInconsistencies(codes: HutPhaseCodeRecord[]): string[] {
  const messages: string[] = [];
  const seenPhases = new Set<HutPhase>();
  const seenSlots = new Set<number>();

  for (const code of codes) {
    const expectedPhase = hutPhaseForSlot(code.slot);

    if (!expectedPhase) {
      messages.push(`Slot ${code.slot} no corresponde a una fase HUT.`);
    } else if (code.phase !== expectedPhase) {
      messages.push(`Slot ${code.slot} esta asociado a ${code.phase}, pero corresponde a ${expectedPhase}.`);
    }

    if (seenPhases.has(code.phase)) {
      messages.push(`La fase ${code.phase} esta duplicada.`);
    }
    seenPhases.add(code.phase);

    if (seenSlots.has(code.slot)) {
      messages.push(`El slot ${code.slot} esta duplicado.`);
    }
    seenSlots.add(code.slot);
  }

  return messages;
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
  return new URL(`/hut/p/${encodeURIComponent(token)}`, requestOrigin).toString();
}

function registrationLink(requestOrigin: string, token: string) {
  return new URL(`/hut/register/${encodeURIComponent(token)}`, requestOrigin).toString();
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
