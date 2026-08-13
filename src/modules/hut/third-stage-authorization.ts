import { HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING } from "./second-stage-authorization";

export const HUT_THIRD_STAGE_AUTHORIZED_REASON = "THIRD_STAGE_AUTHORIZED";

export type HutThirdStageAuthorizationSummary = {
  actorUserId: string | null;
  accessCode: string | null;
  accessType: "ENCUESTADOR" | "SUPERVISOR" | "ADMIN" | null;
  authorizedAt: Date;
  authorizedAtMexicoCity: string | null;
};

export type HutThirdStageAuthorizationParticipant = {
  questionnaireAttempt?: {
    answers?: Array<{
      questionCode: string;
    }> | null;
    visits?: Array<{
      section: string;
      status: string;
    }> | null;
  } | null;
  thirdStageAuthorization?: HutThirdStageAuthorizationSummary | null;
};

export function isThirdStageAuthorized(participant: HutThirdStageAuthorizationParticipant): boolean {
  return Boolean(participant.thirdStageAuthorization ?? hasLegacyThirdStageProgress(participant));
}

export function hasLegacyThirdStageProgress(participant: HutThirdStageAuthorizationParticipant): boolean {
  return Boolean(
    participant.questionnaireAttempt?.visits?.some((visit) =>
      ["EVALUACION_SEGUNDO_PERFUME", "COMPARATIVA"].includes(visit.section)
    ) ||
      participant.questionnaireAttempt?.answers?.some((answer) => isThirdStageQuestionCode(answer.questionCode))
  );
}

export function getThirdStageAuthorizationWarnings(
  participant: HutThirdStageAuthorizationParticipant
): Array<typeof HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING> {
  if (!participant.thirdStageAuthorization && hasLegacyThirdStageProgress(participant)) {
    return [HUT_LEGACY_PROGRESS_WITHOUT_EVENT_WARNING];
  }
  return [];
}

function isThirdStageQuestionCode(questionCode: string): boolean {
  return (
    /^HUT_P(?:[1-9]|1[0-9]|2[0-3])B(?:_|$)/.test(questionCode) ||
    /^HUT_P2[4-7](?:_|$)/.test(questionCode)
  );
}

export function isThirdStageAuthorizationAuditJson(value: unknown): value is {
  accessCode?: unknown;
  accessType?: unknown;
  action: typeof HUT_THIRD_STAGE_AUTHORIZED_REASON;
  authorizedAtMexicoCity?: unknown;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    "action" in value &&
    (value as { action?: unknown }).action === HUT_THIRD_STAGE_AUTHORIZED_REASON
  );
}
