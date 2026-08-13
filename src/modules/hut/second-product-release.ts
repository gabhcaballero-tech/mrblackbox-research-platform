import type { HutPhaseCodeStatus } from "./phase-codes";

export const HUT_SECOND_PRODUCT_RELEASED_REASON = "SECOND_PRODUCT_RELEASED";

export type HutSecondProductReleaseSummary = {
  actorUserId: string | null;
  reasonDetail: string | null;
  releasedAt: Date;
  releasedAtMexicoCity: string | null;
};

export type HutSecondProductReleaseParticipant = {
  phaseCodes?: Array<{
    phase: string;
    status: HutPhaseCodeStatus | string;
  }> | null;
  secondProductRelease?: HutSecondProductReleaseSummary | null;
};

export function isSecondProductReleased(participant: HutSecondProductReleaseParticipant): boolean {
  return Boolean(participant.secondProductRelease ?? hasLegacyRegreso1Release(participant));
}

export function hasLegacyRegreso1Release(participant: HutSecondProductReleaseParticipant): boolean {
  const regreso1Code = participant.phaseCodes?.find((code) => code.phase === "REGRESO_1") ?? null;
  return regreso1Code ? ["USED", "VALIDATED"].includes(regreso1Code.status) : false;
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
