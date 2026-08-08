import type { QaParticipantScenario } from "@/modules/qa-participants";

export type QaE2eValidationStatus = "FAIL" | "PASS";

export type QaE2eValidationCheck = {
  cause?: string;
  id?: string | null;
  label: string;
  status: QaE2eValidationStatus;
};

export type QaE2eValidationBlock = {
  checks: QaE2eValidationCheck[];
  status: QaE2eValidationStatus;
  title: string;
};

export type QaE2eValidationLinks = {
  adminCtl?: string;
  ctlPublic?: string;
  hutParticipant?: string;
  navigoParticipant?: string;
};

export type QaE2eValidationReport = {
  blocks: QaE2eValidationBlock[];
  generatedAt: Date;
  links: QaE2eValidationLinks;
  relatedIds: Record<string, string | null>;
  runId: string;
  scenario: QaParticipantScenario;
  status: QaE2eValidationStatus;
  studyId: string;
};
