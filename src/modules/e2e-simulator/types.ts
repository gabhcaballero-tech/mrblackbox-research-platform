import type { ScreenerDefinition } from "@/modules/screener";
import type {
  NavigoHutRotationWorkbookRowInput,
  NavigoRotationWorkbookRowInput
} from "@/modules/navigo-app/rotation-workbook";
import type { SimulationActivitySchedulePreview, SimulationClock } from "./clock";

export type SimulationMode = true;

export type SimulationCheckStatus = "BLOCKED" | "OK" | "PENDING";

export type SimulationCheck = {
  code: string;
  detail?: string;
  label: string;
  status: SimulationCheckStatus;
};

export type SimulationReportSection = {
  checks: SimulationCheck[];
  status: SimulationCheckStatus;
  title: string;
};

export type NavigoHommeSimulationParticipantFixture = {
  email: string;
  externalReference: string;
  name: string;
  phone: string;
  screeningAnswers: Record<string, unknown>;
};

export type NavigoHommeSimulationRotationFixtures = {
  ctl: NavigoRotationWorkbookRowInput;
  hut: NavigoHutRotationWorkbookRowInput;
};

export type NavigoHommeSimulationFixtures = {
  participant: NavigoHommeSimulationParticipantFixture;
  rotations: NavigoHommeSimulationRotationFixtures;
};

export type NavigoHommePrecheckStudy = {
  activeScreenerDefinitionJson: unknown | null;
  code: string;
  id: string;
  name: string;
  status: string;
};

export type NavigoHommeSimulatorRepository = {
  getStudyByCode: (studyCode: string) => Promise<NavigoHommePrecheckStudy | null>;
};

export type NavigoHommeSimulatorServiceCatalog = {
  ctl: {
    canClaimFolio: boolean;
    canCompleteCtl: boolean;
    canCreateInterviewerCode: boolean;
    canSaveAnswers: boolean;
  };
  hut: {
    canCreateParticipant: boolean;
    canCreateRegistrationSlot: boolean;
    canEnsurePhaseCodes: boolean;
    canValidatePhase: boolean;
  };
  navigo: {
    canCreateActivities: boolean;
    canCreateToken: boolean;
    canRegisterInitialApplication: boolean;
    canReleaseParticipant: boolean;
  };
  screening: {
    canCreateAttempt: boolean;
    canSaveAnswers: boolean;
  };
};

export type NavigoHommePrecheckReport = {
  fixtures: NavigoHommeSimulationFixtures;
  generatedAt: Date;
  screenerDefinition: ScreenerDefinition | null;
  sections: SimulationReportSection[];
  simulationMode: SimulationMode;
  status: SimulationCheckStatus;
  study: NavigoHommePrecheckStudy | null;
  studyCode: string;
};

export type NavigoHommeSimulationParticipantResult = {
  confirmationId?: string | null;
  folio: string;
  participantId: string;
  participantName: string;
  referenceCodes: Array<{ generated: boolean; slot: 1 | 2 | 3 }>;
  screeningAttemptId: string;
  screeningStatus: "PASSED";
};

export type NavigoHommeSimulationRotationResult = {
  ctl: {
    ready: boolean;
    triangularAssignmentId?: string | null;
  };
  hut: {
    ready: boolean;
    hutParticipantId?: string | null;
    registrationSlotId?: string | null;
  };
  navigo: {
    armAssignmentCount: number;
    ready: boolean;
    rotationAssignmentId?: string | null;
  };
};

export type NavigoHommeSimulationReadinessResult = {
  candidateHut: boolean;
  ctlReady: boolean;
  reasons: string[];
  rotationsComplete: boolean;
};

export type NavigoHommeSimulationExecutionPort = {
  applyRotationFixtures: (input: {
    clock: SimulationClock;
    fixtures: NavigoHommeSimulationFixtures;
    participant: NavigoHommeSimulationParticipantResult;
    study: NavigoHommePrecheckStudy;
  }) => Promise<NavigoHommeSimulationRotationResult>;
  createScreeningParticipant: (input: {
    clock: SimulationClock;
    fixtures: NavigoHommeSimulationFixtures;
    study: NavigoHommePrecheckStudy;
  }) => Promise<NavigoHommeSimulationParticipantResult>;
  validateInitialReadiness: (input: {
    clock: SimulationClock;
    fixtures: NavigoHommeSimulationFixtures;
    participant: NavigoHommeSimulationParticipantResult;
    rotations: NavigoHommeSimulationRotationResult;
    study: NavigoHommePrecheckStudy;
  }) => Promise<NavigoHommeSimulationReadinessResult>;
};

export type NavigoHommePhase2Report = {
  activitySchedulePreview: SimulationActivitySchedulePreview[];
  fixtures: NavigoHommeSimulationFixtures;
  generatedAt: Date;
  participant: NavigoHommeSimulationParticipantResult | null;
  precheck: NavigoHommePrecheckReport;
  readiness: NavigoHommeSimulationReadinessResult | null;
  rotations: NavigoHommeSimulationRotationResult | null;
  sections: SimulationReportSection[];
  simulationMode: SimulationMode;
  status: SimulationCheckStatus;
  studyCode: string;
};
