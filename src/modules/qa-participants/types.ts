export type QaParticipantScenario = "CLT_NAVIGO" | "CLT_NAVIGO_HUT" | "CLT_ONLY" | "HUT_DIRECTO";

export type QaParticipantExecutionMode = "FAST_FORWARD" | "REALISTIC";

export type QaParticipantRunStatus = "CLEANED" | "CREATED" | "FAILED";

export type QaParticipantCleanupReport = {
  deleted: Record<string, number>;
  hutParticipantId: string | null;
  notes: string[];
  studyParticipantId: string | null;
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
