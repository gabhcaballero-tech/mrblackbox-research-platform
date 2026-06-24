import { createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizePortalEmail,
  participantPortalOtpRequestSchema,
  participantPortalStudyCodeSchema,
  participantPortalVerifyOtpSchema
} from "./validation";
import type {
  ParticipantPortalRepository,
  ParticipantPortalStudyRecord
} from "./repository";

export const PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE =
  "El portal de participación no está disponible en este momento.";
export const PARTICIPANT_PORTAL_OTP_SENT_MESSAGE =
  "Si los datos son válidos, recibirás un código de acceso por correo.";
export const PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE = "El código no es válido o ya venció.";
export const PARTICIPANT_PORTAL_REQUEST_NEW_CODE_MESSAGE = "Solicita un código nuevo.";
export const PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE =
  "Se alcanzó el número máximo de intentos. Solicita un código nuevo.";
export const PARTICIPANT_PORTAL_VERIFIED_MESSAGE = "Código verificado correctamente.";
export const PARTICIPANT_PORTAL_INTERNAL_USER_MESSAGE =
  "Este acceso está reservado para participantes.";

export const PARTICIPANT_PORTAL_OTP_WINDOW_SECONDS = 600;

export type ParticipantPortalAvailability =
  | {
      ok: true;
      study: ParticipantPortalStudyRecord & {
        activeScreenerVersionId: string;
        portalConfig: NonNullable<ParticipantPortalStudyRecord["portalConfig"]>;
      };
    }
  | {
      message: string;
      ok: false;
    };

export type ParticipantPortalSupabaseClient = {
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
      options: {
        captchaToken: string;
        shouldCreateUser: true;
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

export type ParticipantPortalRequestOtpResult =
  | {
      email: string;
      message: string;
      ok: true;
      sentToSupabase: boolean;
    }
  | {
      message: string;
      ok: false;
      reason: "PORTAL_UNAVAILABLE" | "VALIDATION_ERROR";
    };

export type ParticipantPortalVerifyOtpResult =
  | {
      message: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
      reason: "INTERNAL_USER" | "INVALID_CODE" | "MAX_ATTEMPTS" | "PORTAL_UNAVAILABLE" | "VALIDATION_ERROR";
    };

export async function getParticipantPortalAvailability({
  repository,
  studyCode
}: {
  repository: ParticipantPortalRepository;
  studyCode: string;
}): Promise<ParticipantPortalAvailability> {
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(studyCode);

  if (!parsedStudyCode.success) {
    return unavailable();
  }

  const study = await repository.getStudyByCode(parsedStudyCode.data);

  if (
    !study ||
    study.status !== "ACTIVE" ||
    !study.activeScreenerVersionId ||
    !study.portalConfig ||
    !study.portalConfig.enabled
  ) {
    return unavailable();
  }

  return {
    ok: true,
    study: {
      ...study,
      activeScreenerVersionId: study.activeScreenerVersionId,
      portalConfig: study.portalConfig
    }
  };
}

export async function requestParticipantPortalOtp({
  captchaToken,
  email,
  hashSecret,
  ipAddress,
  now = new Date(),
  repository,
  studyCode,
  supabase
}: {
  captchaToken: string;
  email: string;
  hashSecret: string;
  ipAddress?: string | null;
  now?: Date;
  repository: ParticipantPortalRepository;
  studyCode: string;
  supabase: ParticipantPortalSupabaseClient;
}): Promise<ParticipantPortalRequestOtpResult> {
  const availability = await getParticipantPortalAvailability({ repository, studyCode });

  if (!availability.ok) {
    return {
      message: availability.message,
      ok: false,
      reason: "PORTAL_UNAVAILABLE"
    };
  }

  const parsed = participantPortalOtpRequestSchema.safeParse({
    captchaToken,
    email: normalizePortalEmail(email)
  });

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Revisa los datos capturados.",
      ok: false,
      reason: "VALIDATION_ERROR"
    };
  }

  const emailHash = hashPortalValue(parsed.data.email, hashSecret);
  const cooldownStart = new Date(now.getTime() - availability.study.portalConfig.otpCooldownSeconds * 1000);
  const recentRequest = await repository.findRecentOtpRequest({
    emailHash,
    since: cooldownStart
  });

  if (recentRequest) {
    return {
      email: parsed.data.email,
      message: PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
      ok: true,
      sentToSupabase: false
    };
  }

  try {
    await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        captchaToken: parsed.data.captchaToken,
        shouldCreateUser: true
      }
    });
  } catch {
    // Keep public response generic; Supabase details must not be exposed.
  }

  await repository.createOtpLog({
    emailHash,
    ipHash: ipAddress ? hashPortalValue(ipAddress, hashSecret) : null,
    purpose: "OTP_REQUEST",
    requestedAt: now
  });

  return {
    email: parsed.data.email,
    message: PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
    ok: true,
    sentToSupabase: true
  };
}

export async function verifyParticipantPortalOtp({
  email,
  hashSecret,
  ipAddress,
  now = new Date(),
  repository,
  studyCode,
  supabase,
  token
}: {
  email: string;
  hashSecret: string;
  ipAddress?: string | null;
  now?: Date;
  repository: ParticipantPortalRepository;
  studyCode: string;
  supabase: ParticipantPortalSupabaseClient;
  token: string;
}): Promise<ParticipantPortalVerifyOtpResult> {
  const availability = await getParticipantPortalAvailability({ repository, studyCode });

  if (!availability.ok) {
    return {
      message: availability.message,
      ok: false,
      reason: "PORTAL_UNAVAILABLE"
    };
  }

  const normalizedEmail = normalizePortalEmail(email);
  const parsed = participantPortalVerifyOtpSchema.safeParse({ token });
  const emailHash = hashPortalValue(normalizedEmail, hashSecret);
  const attemptsStart = new Date(now.getTime() - PARTICIPANT_PORTAL_OTP_WINDOW_SECONDS * 1000);
  const failedAttempts = await repository.countOtpLogsSince({
    emailHash,
    purpose: "OTP_VERIFY_FAILED",
    since: attemptsStart
  });

  if (failedAttempts >= availability.study.portalConfig.maxOtpAttempts) {
    return {
      message: PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE,
      ok: false,
      reason: "MAX_ATTEMPTS"
    };
  }

  if (!parsed.success || !isLikelyEmail(normalizedEmail)) {
    await logOtpVerifyFailure({ emailHash, hashSecret, ipAddress, now, repository });

    return {
      message: invalidCodeMessage(failedAttempts + 1, availability.study.portalConfig.maxOtpAttempts),
      ok: false,
      reason: failedAttempts + 1 >= availability.study.portalConfig.maxOtpAttempts ? "MAX_ATTEMPTS" : "VALIDATION_ERROR"
    };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: parsed.data.token,
    type: "email"
  });

  if (error) {
    await logOtpVerifyFailure({ emailHash, hashSecret, ipAddress, now, repository });

    return {
      message: invalidCodeMessage(failedAttempts + 1, availability.study.portalConfig.maxOtpAttempts),
      ok: false,
      reason: failedAttempts + 1 >= availability.study.portalConfig.maxOtpAttempts ? "MAX_ATTEMPTS" : "INVALID_CODE"
    };
  }

  const user = await getSupabaseAuthUser(supabase);

  if (!user) {
    return {
      message: PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE,
      ok: false,
      reason: "INVALID_CODE"
    };
  }

  const internalUser = await repository.findInternalUserByAuthUserId(user.id);

  if (internalUser) {
    await supabase.auth.signOut();

    return {
      message: PARTICIPANT_PORTAL_INTERNAL_USER_MESSAGE,
      ok: false,
      reason: "INTERNAL_USER"
    };
  }

  return {
    message: PARTICIPANT_PORTAL_VERIFIED_MESSAGE,
    ok: true
  };
}

export function hashPortalValue(value: string, secret: string): string {
  if (!secret) {
    throw new Error("PARTICIPANT_PORTAL_HASH_SECRET is required.");
  }

  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

export function portalHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
}

export function extractClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || headers.get("cf-connecting-ip") || headers.get("x-real-ip") || null;
}

function unavailable(): ParticipantPortalAvailability {
  return {
    message: PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
    ok: false
  };
}

function isLikelyEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function invalidCodeMessage(failedAttempts: number, maxAttempts: number): string {
  return failedAttempts >= maxAttempts
    ? PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE
    : PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE;
}

async function logOtpVerifyFailure({
  emailHash,
  hashSecret,
  ipAddress,
  now,
  repository
}: {
  emailHash: string;
  hashSecret: string;
  ipAddress?: string | null;
  now: Date;
  repository: ParticipantPortalRepository;
}) {
  await repository.createOtpLog({
    emailHash,
    ipHash: ipAddress ? hashPortalValue(ipAddress, hashSecret) : null,
    purpose: "OTP_VERIFY_FAILED",
    requestedAt: now
  });
}

async function getSupabaseAuthUser(supabase: ParticipantPortalSupabaseClient): Promise<{ id: string } | null> {
  if (typeof supabase.auth.getClaims === "function") {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;

    if (!error && typeof sub === "string") {
      return { id: sub };
    }
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id };
}
