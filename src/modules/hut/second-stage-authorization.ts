import type { HutPhaseCodeStatus } from "./phase-codes";

export const HUT_SECOND_STAGE_AUTHORIZED_REASON = "SECOND_STAGE_AUTHORIZED";
export const HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING = "LEGACY_PROGRESS_WITHOUT_EVENT";

export type HutSecondStageAuthorizationSummary = {
  actorUserId: string | null;
  accessCode: string | null;
  accessType: "ENCUESTADOR" | "SUPERVISOR" | "ADMIN" | null;
  authorizedAt: Date;
  authorizedAtMexicoCity: string | null;
};

export type HutSecondStageAuthorizationParticipant = {
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
  secondStageAuthorization?: HutSecondStageAuthorizationSummary | null;
};

export function isSecondStageAuthorized(participant: HutSecondStageAuthorizationParticipant): boolean {
  return Boolean(participant.secondStageAuthorization ?? hasLegacySecondStageAuthorization(participant));
}

export function hasLegacySecondStageAuthorization(participant: HutSecondStageAuthorizationParticipant): boolean {
  const regreso1Code = participant.phaseCodes?.find((code) => code.phase === "REGRESO_1") ?? null;
  return Boolean(
    (regreso1Code && ["USED", "VALIDATED"].includes(regreso1Code.status)) ||
      hasLegacyFirstPerfumeEvaluationProgress(participant)
  );
}

export function hasLegacyFirstPerfumeEvaluationProgress(
  participant: HutSecondStageAuthorizationParticipant
): boolean {
  return Boolean(
    participant.questionnaireAttempt?.visits?.some((visit) => visit.section === "EVALUACION_PRIMER_PERFUME") ||
      participant.questionnaireAttempt?.answers?.some((answer) => isFirstPerfumeEvaluationQuestionCode(answer.questionCode))
  );
}

export function getSecondStageAuthorizationWarnings(
  participant: HutSecondStageAuthorizationParticipant
): Array<typeof HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING> {
  if (!participant.secondStageAuthorization && hasLegacySecondStageAuthorization(participant)) {
    return [HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING];
  }
  return [];
}

function isFirstPerfumeEvaluationQuestionCode(questionCode: string): boolean {
  return /^HUT_P(?:[1-9]|1[0-9]|2[0-3])A(?:_|$)/.test(questionCode);
}

export function isSecondStageAuthorizationAuditJson(value: unknown): value is {
  accessCode?: unknown;
  accessType?: unknown;
  action: typeof HUT_SECOND_STAGE_AUTHORIZED_REASON;
  authorizedAtMexicoCity?: unknown;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    "action" in value &&
    (value as { action?: unknown }).action === HUT_SECOND_STAGE_AUTHORIZED_REASON
  );
}
