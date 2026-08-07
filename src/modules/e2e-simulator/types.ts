import type { ScreenerDefinition } from "@/modules/screener";
import type {
  NavigoHutRotationWorkbookRowInput,
  NavigoRotationWorkbookRowInput
} from "@/modules/navigo-app/rotation-workbook";

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
