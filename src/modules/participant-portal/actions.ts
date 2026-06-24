"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  extractClientIp,
  requestParticipantPortalOtp,
  verifyParticipantPortalOtp
} from "./access";
import { createParticipantPortalRepository } from "./repository";
import { participantPortalStudyCodeSchema } from "./validation";
import { otpEmailCookieName } from "./cookies";
import { createServerSupabaseClient } from "@/shared/auth/supabase/server";

export async function requestParticipantPortalOtpAction(formData: FormData): Promise<void> {
  const studyCode = normalizeStudyCodeOrRedirect(formData.get("studyCode"));
  const headerStore = await headers();
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const result = await requestParticipantPortalOtp({
    captchaToken: String(formData.get("captchaToken") ?? ""),
    email: String(formData.get("email") ?? ""),
    hashSecret: getParticipantPortalHashSecret(),
    ipAddress: extractClientIp(headerStore),
    repository: createParticipantPortalRepository(),
    studyCode,
    supabase
  });

  if (!result.ok) {
    redirect(`/participar/${encodeURIComponent(studyCode)}?error=${result.reason.toLowerCase()}`);
  }

  cookieStore.set(otpEmailCookieName(studyCode), result.email, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: `/participar/${studyCode}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  redirect(`/participar/${encodeURIComponent(studyCode)}/verificar?sent=1`);
}

export async function verifyParticipantPortalOtpAction(formData: FormData): Promise<void> {
  const studyCode = normalizeStudyCodeOrRedirect(formData.get("studyCode"));
  const cookieStore = await cookies();
  const email = cookieStore.get(otpEmailCookieName(studyCode))?.value;

  if (!email) {
    redirect(`/participar/${encodeURIComponent(studyCode)}`);
  }

  const headerStore = await headers();
  const supabase = await createServerSupabaseClient();
  const result = await verifyParticipantPortalOtp({
    email,
    hashSecret: getParticipantPortalHashSecret(),
    ipAddress: extractClientIp(headerStore),
    repository: createParticipantPortalRepository(),
    studyCode,
    supabase,
    token: String(formData.get("token") ?? "")
  });

  if (!result.ok) {
    const error =
      result.reason === "MAX_ATTEMPTS"
        ? "max"
        : result.reason === "VALIDATION_ERROR"
          ? "format"
        : result.reason === "INTERNAL_USER"
          ? "internal"
          : result.reason === "PORTAL_UNAVAILABLE"
            ? "unavailable"
            : "invalid";

    redirect(`/participar/${encodeURIComponent(studyCode)}/verificar?error=${error}`);
  }

  cookieStore.delete(otpEmailCookieName(studyCode));
  redirect(`/participar/${encodeURIComponent(studyCode)}/inicio`);
}

function normalizeStudyCodeOrRedirect(value: unknown): string {
  const parsed = participantPortalStudyCodeSchema.safeParse(String(value ?? ""));

  if (!parsed.success) {
    redirect("/");
  }

  return parsed.data;
}

function getParticipantPortalHashSecret(): string {
  const secret = process.env.PARTICIPANT_PORTAL_HASH_SECRET;

  if (!secret) {
    throw new Error("PARTICIPANT_PORTAL_HASH_SECRET is required.");
  }

  return secret;
}
