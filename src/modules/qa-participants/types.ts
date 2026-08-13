export type QaParticipantScenario = "CLT_NAVIGO" | "CLT_NAVIGO_HUT" | "CLT_ONLY" | "HUT_DIRECTO";

export type QaParticipantExecutionMode = "FAST_FORWARD" | "REALISTIC";

export type QaParticipantRunStatus = "CLEANED" | "CREATED" | "FAILED";

export type QaParticipantCleanupReport = {
  deleted: Record<string, number>;
  hutParticipantId: string | null;
  notes: string[];
  participantProfile: QaParticipantProfileCleanup | null;
  studyParticipantId: string | null;
};

export type QaParticipantProfileCleanupAction =
  | "DELETE_AFTER_CLEANUP"
  | "DELETED_ORPHAN"
  | "NOT_FOUND"
  | "NOT_LINKED"
  | "PRESERVE_HAS_PARTICIPATIONS";

export type QaParticipantProfileCleanup = {
  action: QaParticipantProfileCleanupAction;
  email: string | null;
  id: string | null;
  name: string | null;
  phone: string | null;
  remainingParticipations: number | null;
  status: string | null;
};

export type OrphanParticipantProfileRelationCounts = Record<string, number>;

export type OrphanParticipantProfilePreviewItem = {
  createdAt: Date;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
  reason: string;
  relationCounts: OrphanParticipantProfileRelationCounts;
  status: string;
  updatedAt: Date;
};

export type OrphanParticipantProfileConservedItem = OrphanParticipantProfilePreviewItem & {
  conservationReason: string;
};

export type OrphanParticipantProfilePreview = {
  candidateCount: number;
  candidates: OrphanParticipantProfilePreviewItem[];
  conserved: OrphanParticipantProfileConservedItem[];
  evaluatedAt: string;
  evaluatedCount: number;
  limit: number;
};

export type CleanupOrphanParticipantProfilesReport = {
  cleanedAt: string;
  cleanedByUserId: string;
  deleted: OrphanParticipantProfilePreviewItem[];
  deletionCounts: Record<string, number>;
  preserved: OrphanParticipantProfileConservedItem[];
  preview: OrphanParticipantProfilePreview;
};

export type LegacyQaCleanupAuthorizedFolio = "NAV-104" | "NAV-106" | "NAV-110" | "NAV-115" | "NAV-117";

export type LegacyQaCleanupFolioPreview = {
  folio: string;
  found: boolean;
  hutParticipantId: string | null;
  participantName: string | null;
  participantProfile: QaParticipantProfileCleanup | null;
  relationCounts: Record<string, number>;
  studyParticipantId: string | null;
};

export type LegacyQaCleanupPreview = {
  authorizedFolios: string[];
  blockedFolios: string[];
  folios: LegacyQaCleanupFolioPreview[];
  rotationPlans: LegacyQaRotationPlanPreview[];
  studyId: string;
};

export type LegacyQaCleanupReport = {
  authorizedFolios: string[];
  blockedFolios: string[];
  cleanedAt: string;
  cleanedByUserId: string;
  folios: Array<LegacyQaCleanupFolioPreview & {
    cleanupReport: QaParticipantCleanupReport | null;
  }>;
  rotationCleanup: {
    blockedPlans: LegacyQaRotationPlanPreview[];
    deleted: Record<string, number>;
    plans: LegacyQaRotationPlanPreview[];
  };
  studyId: string;
};

export type LegacyQaRotationPlanPreview = {
  arms: Array<{
    applicationOrder: number;
    sampleKey: string;
  }>;
  assignedParticipants: Array<{
    folio: string | null;
    isAuthorizedLegacyQaFolio: boolean;
    isQaRun: boolean;
    name: string | null;
    studyParticipantId: string;
  }>;
  blockReasons: string[];
  id: string;
  isOfficialRotation: boolean;
  name: string;
  rotationCode: string;
  willDelete: boolean;
};

export type QaParticipantRunSummary = {
  cleanupReportJson: unknown | null;
  cleanedAt: Date | null;
  cleanedByUserId: string | null;
  createdAt: Date;
  createdByEmail?: string | null;
  createdByUserId: string;
  createdByUserName?: string | null;
  executionMode: QaParticipantExecutionMode;
  folio: string | null;
  hutParticipantId: string | null;
  id: string;
  reportJson: unknown | null;
  scenario: QaParticipantScenario;
  status: QaParticipantRunStatus;
  studyId: string;
  studyParticipantId: string | null;
  updatedAt: Date;
};

export type QaApprovedProtocol = "CLT_NAVIGO_HUT" | "HUT_DIRECTO";

export type QaApprovedParticipantSummary = {
  codes: Array<{
    code: string;
    slot: 1 | 2 | 3;
  }>;
  folio: string;
  hutParticipantId: string | null;
  participantName: string;
  protocol: QaApprovedProtocol;
  qaWhatsappOverridePhone: string;
  run: QaParticipantRunSummary;
  studyParticipantId: string;
  whatsapp: {
    error: string | null;
    metaMessageId: string | null;
    sentAt: Date | null;
    status: "ERROR" | "NO_ENVIADO" | "ENVIADO";
    templateName: string;
  };
};

export type QaParticipantActionResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type QaParticipantScenarioReport = {
  createdAt: string;
  executionMode: QaParticipantExecutionMode;
  links: {
    ctlPublic?: string;
    hutParticipant?: string;
    navigoParticipant?: string;
  };
  objects: {
    ctlSessionId?: string;
    hutParticipantId?: string;
    hutQuestionnaireAttemptId?: string;
    participantAccessTokenId?: string;
    participantConfirmationId?: string;
    participantProfileId?: string;
    rotationAssignmentId?: string;
    screeningAttemptId?: string;
    studyParticipantId?: string;
    triangularRotationAssignmentId?: string;
  };
  qa: true;
  referenceCodes: Array<{
    code?: string;
    generated: boolean;
    slot: 1 | 2 | 3;
  }>;
  rotations: {
    ctlTriangular?: {
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
    hut?: {
      eva1: string;
      eva2: string;
    };
    navigo?: {
      armAssignmentCount: number;
      firstFragrance: string;
      rotationCode: string;
      secondFragrance: string;
    };
  };
  scenario: QaParticipantScenario;
  skippedExternalEffects: string[];
  status: "CREATED" | "FAILED";
};
