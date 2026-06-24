import { CAPTCHA_REQUIRED_MESSAGE } from "@/shared/auth/passwordless";

export type TurnstileVerificationResult =
  | { ok: true }
  | {
      code: "CONFIGURATION_ERROR" | "TURNSTILE_ERROR" | "VALIDATION_ERROR";
      message: string;
      ok: false;
      reason?: string;
    };

export type TurnstileVerifier = (input: {
  ipAddress: string | null;
  secret: string;
  studyCode?: string;
  token: string;
}) => Promise<TurnstileVerificationResult>;

const TURNSTILE_RETRY_MESSAGE =
  "La verificación de seguridad venció. Vuelve a completar la verificación e intenta de nuevo.";
const TURNSTILE_CONFIGURATION_MESSAGE =
  "La verificación de seguridad no está configurada. Contacta a tu reclutador.";
const TURNSTILE_CONFIGURATION_REASONS = new Set([
  "invalid-input-secret",
  "missing-input-secret"
]);

export async function verifyParticipantPortalTurnstile({
  ipAddress,
  secret = process.env.TURNSTILE_SECRET_KEY ?? process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ?? "",
  studyCode,
  token,
  verifier = cloudflareTurnstileVerifier
}: {
  ipAddress: string | null;
  secret?: string;
  studyCode?: string;
  token: string;
  verifier?: TurnstileVerifier;
}): Promise<TurnstileVerificationResult> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return {
      code: "VALIDATION_ERROR",
      message: CAPTCHA_REQUIRED_MESSAGE,
      ok: false
    };
  }

  if (!secret.trim()) {
    return {
      code: "CONFIGURATION_ERROR",
      message: TURNSTILE_CONFIGURATION_MESSAGE,
      ok: false
    };
  }

  return verifier({
    ipAddress,
    secret,
    studyCode,
    token: normalizedToken
  });
}

async function cloudflareTurnstileVerifier({
  ipAddress,
  secret,
  studyCode,
  token
}: {
  ipAddress: string | null;
  secret: string;
  studyCode?: string;
  token: string;
}): Promise<TurnstileVerificationResult> {
  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);

  if (ipAddress) {
    formData.set("remoteip", ipAddress);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      body: formData,
      method: "POST"
    });
    const payload = await response.json() as { "error-codes"?: unknown; success?: unknown };

    if (payload.success === true) {
      return { ok: true };
    }

    const reason = firstTurnstileReason(payload["error-codes"]);
    logTurnstileFailure({ reason, studyCode });

    if (TURNSTILE_CONFIGURATION_REASONS.has(reason)) {
      return {
        code: "CONFIGURATION_ERROR",
        message: TURNSTILE_CONFIGURATION_MESSAGE,
        ok: false,
        reason
      };
    }

    return {
      code: "TURNSTILE_ERROR",
      message: TURNSTILE_RETRY_MESSAGE,
      ok: false,
      reason
    };
  } catch {
    logTurnstileFailure({ reason: "request-failed", studyCode });
  }

  return {
    code: "TURNSTILE_ERROR",
    message: TURNSTILE_RETRY_MESSAGE,
    ok: false,
    reason: "request-failed"
  };
}

function firstTurnstileReason(errorCodes: unknown): string {
  if (Array.isArray(errorCodes)) {
    const firstCode = errorCodes.find((code): code is string => typeof code === "string" && code.trim().length > 0);

    if (firstCode) {
      return firstCode;
    }
  }

  return "unknown";
}

function logTurnstileFailure({
  reason,
  studyCode
}: {
  reason: string;
  studyCode?: string;
}) {
  const suffix = studyCode ? ` studyCode=${studyCode}` : "";
  console.error(`participant portal turnstile failed: code=TURNSTILE_ERROR reason=${reason}${suffix}`);
}
