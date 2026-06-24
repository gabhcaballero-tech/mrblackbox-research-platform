import { sanitizeInternalNextPath } from "./routes";
import {
  getCurrentInternalAccess,
  type InternalAccessResult,
  type InternalUserReader
} from "./session";

export const OTP_GENERIC_SENT_MESSAGE = "Si el correo está autorizado, recibirás un código de acceso.";
export const OTP_INVALID_MESSAGE = "El código no es válido o ya venció. Solicita uno nuevo.";
export const OTP_INVALID_FORMAT_MESSAGE = "Ingresa el código numérico que recibiste por correo.";
export const OTP_SPAM_HINT_MESSAGE = "Revisa también la carpeta de spam o correo no deseado.";
export const OTP_UNAUTHORIZED_MESSAGE = "Tu usuario no está autorizado para acceder. Contacta a un administrador.";
export const OTP_INVALID_EMAIL_MESSAGE = "Ingresa un correo electrónico válido.";
export const CAPTCHA_REQUIRED_MESSAGE = "Completa la verificación de seguridad.";
export const CAPTCHA_ERROR_MESSAGE =
  "No fue posible validar la verificación de seguridad. Intenta nuevamente.";
export const OTP_COOLDOWN_MESSAGE = "Espera antes de solicitar un código nuevo.";

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
    signInWithPassword: (input: {
      email: string;
      options: { captchaToken: string };
      password: string;
    }) => Promise<{ error: unknown }>;
    signInWithOtp: (input: {
      email: string;
      options: {
        captchaToken: string;
        shouldCreateUser: false;
      };
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
  captchaToken: string;
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

type SignInWithPasswordInput = {
  captchaToken: string;
  email: string;
  password: string;
  supabase: OtpSupabaseClient;
};

export async function signInWithPasswordWithCaptcha({
  captchaToken,
  email,
  password,
  supabase
}: SignInWithPasswordInput): Promise<"CAPTCHA_ERROR" | "CREDENTIALS_ERROR" | "SUCCESS" | "VALIDATION_ERROR"> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCaptchaToken = captchaToken.trim();

  if (!normalizedEmail || !password) {
    return "VALIDATION_ERROR";
  }

  if (!normalizedCaptchaToken) {
    return "CAPTCHA_ERROR";
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    options: {
      captchaToken: normalizedCaptchaToken
    },
    password
  });

  if (!error) {
    return "SUCCESS";
  }

  return isCaptchaError(error) ? "CAPTCHA_ERROR" : "CREDENTIALS_ERROR";
}

export async function requestOtpLogin({
  captchaToken,
  email,
  next,
  supabase
}: RequestOtpLoginInput): Promise<RequestOtpLoginResult> {
  const nextPath = sanitizeInternalNextPath(next);
  const normalizedEmail = normalizeEmail(email);
  const normalizedCaptchaToken = captchaToken.trim();

  if (!isValidEmail(normalizedEmail)) {
    return {
      message: OTP_INVALID_EMAIL_MESSAGE,
      nextPath,
      ok: false
    };
  }

  if (!normalizedCaptchaToken) {
    return {
      message: CAPTCHA_REQUIRED_MESSAGE,
      nextPath,
      ok: false
    };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        captchaToken: normalizedCaptchaToken,
        shouldCreateUser: false
      }
    });

    if (error) {
      if (isCaptchaError(error)) {
        return {
          message: CAPTCHA_ERROR_MESSAGE,
          nextPath,
          ok: false
        };
      }
    }
  } catch (error) {
    if (isCaptchaError(error)) {
      return {
        message: CAPTCHA_ERROR_MESSAGE,
        nextPath,
        ok: false
      };
    }

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

  if (!isValidEmail(normalizedEmail) || !isValidOtpToken(token)) {
    return {
      message: OTP_INVALID_FORMAT_MESSAGE,
      nextPath,
      ok: false,
      reason: "VALIDATION_ERROR"
    };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: compactOtpToken(token),
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

function isDeniedInternalAccess(
  access: InternalAccessResult
): access is Extract<InternalAccessResult, { status: "denied" }> {
  return access.status === "denied";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function compactOtpToken(token: string): string {
  return token.replace(/\s+/g, "");
}

export function isValidOtpToken(token: string): boolean {
  const compactToken = compactOtpToken(token);
  return /^\d{6,8}$/.test(compactToken);
}

function isCaptchaError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("captcha");
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("captcha")
  );
}
