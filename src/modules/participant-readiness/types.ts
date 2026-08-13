export type ParticipantProtocolType = "CLT_NAVIGO_HUT" | "HUT_DIRECTO";

export type ParticipantOperationalStage =
  | "SCREENING"
  | "CLT"
  | "NAVIGO"
  | "HUT";

export type ParticipantCurrentStage =
  | "NO_IDENTITY"
  | "SCREENING_PENDING"
  | "SCREENING_COMPLETED"
  | "CLT_READY"
  | "CLT_COMPLETED"
  | "NAVIGO_READY"
  | "HUT_READY"
  | "HUT_COMPLETED";

export type ParticipantStageReadinessStatus =
  | "BLOCKED"
  | "COMPLETED"
  | "NOT_APPLICABLE"
  | "PENDING"
  | "READY";

export type ParticipantReadinessReason = {
  code: string;
  message: string;
  stage: ParticipantOperationalStage;
};

export type ParticipantStageReadiness = {
  applicable: boolean;
  blockingReasons: ParticipantReadinessReason[];
  completed: boolean;
  ready: boolean;
  status: ParticipantStageReadinessStatus;
  warnings: ParticipantReadinessReason[];
};

export type ParticipantOperationalReadiness = {
  blockingReasons: ParticipantReadinessReason[];
  currentStage: ParticipantCurrentStage;
  nextAllowedStage: ParticipantOperationalStage | null;
  participantId: string | null;
  protocolType: ParticipantProtocolType;
  stages: {
    clt: ParticipantStageReadiness;
    hut: ParticipantStageReadiness;
    navigo: ParticipantStageReadiness;
    screening: ParticipantStageReadiness;
  };
  warnings: ParticipantReadinessReason[];
};

export type ParticipantReadinessReferenceCode = {
  slot: number;
};

export type ParticipantReadinessRotationArm = {
  applicationOrder: number;
  studyProduct?: {
    internalCode: string | null;
  } | null;
};

export type ParticipantReadinessActivity = {
  activitySchedule?: {
    code: string | null;
  } | null;
  status: string;
};

export type ParticipantReadinessAccessToken = {
  expiresAt: Date | null;
  status: string;
};

export type ParticipantReadinessCtlSession = {
  status: string;
};

export type ParticipantReadinessHutPhaseCode = {
  phase: string;
  status: string;
};

export type ParticipantReadinessHutPhotoEntry = {
  useDayNumber: number;
};

export type ParticipantReadinessHutEvidence = {
  phase: string;
};

export type ParticipantReadinessHutVisit = {
  section: string;
  status: string;
};

export type ParticipantReadinessHutParticipant = {
  applicationEvidence?: ParticipantReadinessHutEvidence[];
  applicationPhotoEntries?: ParticipantReadinessHutPhotoEntry[];
  firstFragranceLeftArm?: string | null;
  folio?: string | null;
  id: string;
  name: string;
  origin: "CLT_HUT" | "HUT_DIRECTO" | string;
  phaseCodes?: ParticipantReadinessHutPhaseCode[];
  phone?: string | null;
  email?: string | null;
  protocolVersion: string;
  questionnaireAttempt?: {
    status: string;
    visits?: ParticipantReadinessHutVisit[];
  } | null;
  secondFragranceRightArm?: string | null;
  status: string;
  studyParticipantId?: string | null;
};

export type ParticipantReadinessInput = {
  accessTokens?: ParticipantReadinessAccessToken[];
  activities?: ParticipantReadinessActivity[];
  applicationStartedAt?: Date | null;
  ctlSessions?: ParticipantReadinessCtlSession[];
  ctlTriangularRotationAssignment?: unknown | null;
  hutParticipant?: ParticipantReadinessHutParticipant | null;
  id: string | null;
  operationalStatus?: string | null;
  participantConfirmation?: {
    referenceCodes?: ParticipantReadinessReferenceCode[];
    screeningAttempt?: {
      status: string;
    } | null;
  } | null;
  participantScreeningReviews?: Array<{
    status: string;
  }>;
  rotationAssignment?: {
    arms?: ParticipantReadinessRotationArm[];
  } | null;
  screeningStatus?: string | null;
};
