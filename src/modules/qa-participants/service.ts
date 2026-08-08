import type {
  QaParticipantCleanupReport,
  QaParticipantExecutionMode,
  QaParticipantRunStatus,
  QaParticipantScenario
} from "./types";

export const QA_PARTICIPANT_FOLIO_PREFIX = "QA-";

const qaScenarios = new Set<QaParticipantScenario>(["CLT_NAVIGO", "CLT_NAVIGO_HUT", "CLT_ONLY", "HUT_DIRECTO"]);
const qaExecutionModes = new Set<QaParticipantExecutionMode>(["FAST_FORWARD", "REALISTIC"]);
const qaRunStatuses = new Set<QaParticipantRunStatus>(["CLEANED", "CREATED", "FAILED"]);

export function isQaParticipantScenario(value: unknown): value is QaParticipantScenario {
  return typeof value === "string" && qaScenarios.has(value as QaParticipantScenario);
}

export function isQaParticipantExecutionMode(value: unknown): value is QaParticipantExecutionMode {
  return typeof value === "string" && qaExecutionModes.has(value as QaParticipantExecutionMode);
}

export function isQaParticipantRunStatus(value: unknown): value is QaParticipantRunStatus {
  return typeof value === "string" && qaRunStatuses.has(value as QaParticipantRunStatus);
}

export function normalizeQaParticipantFolio(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

export function assertSafeQaRunLinks(input: {
  hutParticipantId?: string | null;
  studyParticipantId?: string | null;
}): void {
  if (!input.studyParticipantId && !input.hutParticipantId) {
    return;
  }
}

export function createEmptyQaCleanupReport(input: {
  hutParticipantId: string | null;
  studyParticipantId: string | null;
}): QaParticipantCleanupReport {
  return {
    deleted: {},
    hutParticipantId: input.hutParticipantId,
    notes: [],
    participantProfile: null,
    studyParticipantId: input.studyParticipantId
  };
}

export function recordQaCleanupCount(
  report: QaParticipantCleanupReport,
  modelName: string,
  result: unknown
): void {
  const count = typeof result === "object" && result !== null && "count" in result && typeof result.count === "number" ? result.count : 0;
  report.deleted[modelName] = (report.deleted[modelName] ?? 0) + count;
}
