import type {
  QaParticipantCleanupReport,
  QaParticipantExecutionMode,
  QaParticipantRunStatus,
  QaParticipantScenario,
  QaApprovedProtocol
} from "./types";

export const QA_PARTICIPANT_FOLIO_PREFIX = "QA-";
export const APPROVED_QA_FOLIOS_CLT_NAVIGO_HUT = ["NAV-301", "NAV-302", "NAV-303", "NAV-304", "NAV-305"] as const;
export const APPROVED_QA_FOLIOS_HUT_DIRECTO = ["NAV-306", "NAV-307", "NAV-308", "NAV-309", "NAV-310"] as const;
export const APPROVED_QA_FOLIOS = [
  ...APPROVED_QA_FOLIOS_CLT_NAVIGO_HUT,
  ...APPROVED_QA_FOLIOS_HUT_DIRECTO
] as const;

const qaScenarios = new Set<QaParticipantScenario>(["CLT_NAVIGO", "CLT_NAVIGO_HUT", "CLT_ONLY", "HUT_DIRECTO"]);
const qaExecutionModes = new Set<QaParticipantExecutionMode>(["FAST_FORWARD", "REALISTIC"]);
const qaRunStatuses = new Set<QaParticipantRunStatus>(["CLEANED", "CREATED", "FAILED"]);
const qaApprovedProtocols = new Set<QaApprovedProtocol>(["CLT_NAVIGO_HUT", "HUT_DIRECTO"]);
const approvedQaFolios = new Set<string>(APPROVED_QA_FOLIOS);
const approvedQaCltNavigoHutFolios = new Set<string>(APPROVED_QA_FOLIOS_CLT_NAVIGO_HUT);
const approvedQaHutDirectoFolios = new Set<string>(APPROVED_QA_FOLIOS_HUT_DIRECTO);

export function isQaParticipantScenario(value: unknown): value is QaParticipantScenario {
  return typeof value === "string" && qaScenarios.has(value as QaParticipantScenario);
}

export function isQaParticipantExecutionMode(value: unknown): value is QaParticipantExecutionMode {
  return typeof value === "string" && qaExecutionModes.has(value as QaParticipantExecutionMode);
}

export function isQaParticipantRunStatus(value: unknown): value is QaParticipantRunStatus {
  return typeof value === "string" && qaRunStatuses.has(value as QaParticipantRunStatus);
}

export function isQaApprovedProtocol(value: unknown): value is QaApprovedProtocol {
  return typeof value === "string" && qaApprovedProtocols.has(value as QaApprovedProtocol);
}

export function normalizeQaParticipantFolio(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

export function normalizeApprovedQaFolio(value: string | null | undefined): string | null {
  const folio = normalizeQaParticipantFolio(value);
  return folio && approvedQaFolios.has(folio) ? folio : null;
}

export function isApprovedQaFolioProtocolAllowed(folio: string, protocol: QaApprovedProtocol): boolean {
  return protocol === "CLT_NAVIGO_HUT"
    ? approvedQaCltNavigoHutFolios.has(folio)
    : approvedQaHutDirectoFolios.has(folio);
}

export function parseNavFolioSequence(folio: string): number | null {
  const match = /^NAV-(\d{3})$/.exec(folio);
  return match ? Number(match[1]) : null;
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
