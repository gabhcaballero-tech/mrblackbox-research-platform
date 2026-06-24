import { sanitizeInternalNextPath } from "./routes";
import {
  getCurrentInternalAccess,
  type InternalAccessResult,
  type InternalUserReader
} from "./session";

export const OTP_GENERIC_SENT_MESSAGE = "Si el correo está autorizado, recibirás un código de acceso.";
export const OTP_INVALID_MESSAGE = "El código no es válido o ya venció. Solicita uno nuevo.";
export const OTP_UNAUTHORIZED_MESSAGE = "Tu usuario no está autorizado para acceder. Contacta a un administrador.";
export const OTP_INVALID_EMAIL_MESSAGE = "Ingresa un correo electrónico válido.";

type OtpSupabaseClient = {
  auth: {
    getClaims?: () => Promise<{
      data: { claims?: { email?: unknown; sub?: unknown } } | null;
      error: unknown;
    }>;
    getUser: () => Promise<{
      data: { user: { email?: string | null; id: string } | null };
      error: unknown;
    }>;
    signInWithOtp: (input: {
      email: string;
      options: { shouldCreateUser: false };
    }) => Promise<{ error: unknown }>;
    signOut: () => Promise<unknown>;
    verifyOtp: (input: {
      email: string;
      token: string;
      type: "email";
    }) => Promise<{ error: unknown }>;
  };
};

export type RequestOtpLoginResult =
  | {
      email: string;
      message: string;
      nextPath: string;
      ok: true;
    }
  | {
      message: string;
      nextPath: string;
      ok: false;
    };

export type VerifyOtpLoginResult =
  | {
      nextPath: string;
      ok: true;
    }
  | {
      message: string;
      nextPath: string;
      ok: false;
      reason: "INVALID_CODE" | "UNAUTHORIZED" | "VALIDATION_ERROR";
    };

type RequestOtpLoginInput = {
  email: string;
  next: unknown;
  supabase: OtpSupabaseClient;
};

type VerifyOtpLoginInput = {
  email: string;
  internalUserReader?: InternalUserReader;
  next: unknown;
  supabase: OtpSupabaseClient;
  token: string;
};

export async function requestOtpLogin({
  email,
  next,
  supabase
}: RequestOtpLoginInput): Promise<RequestOtpLoginResult> {
  const nextPath = sanitizeInternalNextPath(next);
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return {
      message: OTP_INVALID_EMAIL_MESSAGE,
      nextPath,
      ok: false
    };
  }

  try {
    await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false
      }
    });
  } catch {
    // Keep the response indistinguishable from an unknown or unauthorized email.
  }

  return {
    email: normalizedEmail,
    message: OTP_GENERIC_SENT_MESSAGE,
    nextPath,
    ok: true
  };
}

export async function verifyOtpLogin({
  email,
  internalUserReader,
  next,
  supabase,
  token
}: VerifyOtpLoginInput): Promise<VerifyOtpLoginResult> {
  const nextPath = sanitizeInternalNextPath(next);
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = token.trim();

  if (!isValidEmail(normalizedEmail) || !/^\d{6}$/.test(normalizedToken)) {
    return {
      message: OTP_INVALID_MESSAGE,
      nextPath,
      ok: false,
      reason: "VALIDATION_ERROR"
    };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "email"
  });

  if (error) {
    return {
      message: OTP_INVALID_MESSAGE,
      nextPath,
      ok: false,
      reason: "INVALID_CODE"
    };
  }

  const access = await getCurrentInternalAccess({
    internalUserReader,
    supabase
  });

  if (isDeniedInternalAccess(access)) {
    await supabase.auth.signOut();

    return {
      message: OTP_UNAUTHORIZED_MESSAGE,
      nextPath,
      ok: false,
      reason: "UNAUTHORIZED"
    };
  }

  return {
    nextPath,
    ok: true
  };
}

function isDeniedInternalAccess(access: InternalAccessResult): access is Extract<InternalAccessResult, { status: "denied" }> {
  return access.status === "denied";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
