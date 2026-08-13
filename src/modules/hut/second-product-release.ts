import type { HutPhaseCodeStatus } from "./phase-codes";
import { HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING } from "./second-stage-authorization";

export const HUT_SECOND_PRODUCT_RELEASED_REASON = "SECOND_PRODUCT_RELEASED";

export type HutSecondProductReleaseSummary = {
  actorUserId: string | null;
  reasonDetail: string | null;
  releasedAt: Date;
  releasedAtMexicoCity: string | null;
};

export type HutSecondProductReleaseParticipant = {
  applicationEvidence?: Array<{
    phase: string;
  }> | null;
  applicationPhotoEntries?: Array<{
    useDayNumber: number;
  }> | null;
  phaseCodes?: Array<{
    phase: string;
    status: HutPhaseCodeStatus | string;
  }> | null;
  questionnaireAttempt?: {
    answers?: Array<{
      questionCode: string;
    }> | null;
    visits?: Array<{
      section: string;
      status: string;
    }> | null;
  } | null;
  secondProductRelease?: HutSecondProductReleaseSummary | null;
};

export function isSecondProductReleased(participant: HutSecondProductReleaseParticipant): boolean {
  return Boolean(participant.secondProductRelease ?? hasLegacySecondProductProgress(participant));
}

export function hasLegacyRegreso1Release(participant: HutSecondProductReleaseParticipant): boolean {
  const regreso1Code = participant.phaseCodes?.find((code) => code.phase === "REGRESO_1") ?? null;
  return regreso1Code ? ["USED", "VALIDATED"].includes(regreso1Code.status) : false;
}

export function hasLegacySecondProductProgress(participant: HutSecondProductReleaseParticipant): boolean {
  return Boolean(
    hasLegacyRegreso1Release(participant) ||
      participant.applicationPhotoEntries?.some((entry) => product2UseDayNumbers.has(entry.useDayNumber)) ||
      participant.applicationEvidence?.some((evidence) => evidence.phase === "REGRESO_2") ||
      participant.questionnaireAttempt?.visits?.some((visit) =>
        ["EVALUACION_SEGUNDO_PERFUME", "SEGUNDA_VISITA", "COMPARATIVA"].includes(visit.section)
      ) ||
      participant.questionnaireAttempt?.answers?.some((answer) => isSecondProductOrComparativeQuestionCode(answer.questionCode))
  );
}

export function getSecondProductReleaseWarnings(
  participant: HutSecondProductReleaseParticipant
): Array<typeof HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING> {
  if (!participant.secondProductRelease && hasLegacySecondProductProgress(participant)) {
    return [HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING];
  }
  return [];
}

const product2UseDayNumbers = new Set<number>([4, 5, 6]);

function isSecondProductOrComparativeQuestionCode(questionCode: string): boolean {
  return (
    /^HUT_P(?:[1-9]|1[0-9]|2[0-3])B(?:_|$)/.test(questionCode) ||
    /^HUT_P2[4-7](?:_|$)/.test(questionCode) ||
    questionCode.startsWith("HUT_V2_")
  );
}

export function isSecondProductReleaseAuditJson(value: unknown): value is {
  action: typeof HUT_SECOND_PRODUCT_RELEASED_REASON;
  reasonDetail?: unknown;
  releasedAtMexicoCity?: unknown;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    "action" in value &&
    (value as { action?: unknown }).action === HUT_SECOND_PRODUCT_RELEASED_REASON
  );
}
