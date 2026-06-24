import { CAPTCHA_ERROR_MESSAGE, CAPTCHA_REQUIRED_MESSAGE } from "@/shared/auth/passwordless";

export type TurnstileVerificationResult =
  | { ok: true }
  | {
      code: "CONFIGURATION_ERROR" | "TURNSTILE_ERROR" | "VALIDATION_ERROR";
      message: string;
      ok: false;
    };

export type TurnstileVerifier = (input: {
  ipAddress: string | null;
  secret: string;
  token: string;
}) => Promise<TurnstileVerificationResult>;

export async function verifyParticipantPortalTurnstile({
  ipAddress,
  secret = process.env.TURNSTILE_SECRET_KEY ?? process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ?? "",
  token,
  verifier = cloudflareTurnstileVerifier
}: {
  ipAddress: string | null;
  secret?: string;
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
      message: "La verificación de seguridad no está configurada. Contacta a tu reclutador.",
      ok: false
    };
  }

  return verifier({
    ipAddress,
    secret,
    token: normalizedToken
  });
}

async function cloudflareTurnstileVerifier({
  ipAddress,
  secret,
  token
}: {
  ipAddress: string | null;
  secret: string;
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
    const payload = await response.json() as { success?: unknown };

    if (payload.success === true) {
      return { ok: true };
    }
  } catch {
    // Public message stays generic; no secrets or tokens are logged.
  }

  return {
    code: "TURNSTILE_ERROR",
    message: CAPTCHA_ERROR_MESSAGE,
    ok: false
  };
}
