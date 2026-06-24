"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CAPTCHA_ERROR_MESSAGE,
  CAPTCHA_REQUIRED_MESSAGE,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_FORMAT_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE,
  requestOtpLogin,
  signInWithPasswordWithCaptcha,
  verifyOtpLogin
} from "@/shared/auth/passwordless";
import { sanitizeInternalNextPath } from "@/shared/auth/routes";
import { createServerSupabaseClient } from "@/shared/auth/supabase/server";

const INTERNAL_OTP_COOLDOWN_COOKIE = "internal_login_otp_cooldown_until";
const INTERNAL_OTP_COOLDOWN_SECONDS = 60;

function loginPathWithError(nextPath: string, error: "captcha" | "credentials") {
  return `/login?error=${error}&next=${encodeURIComponent(nextPath)}`;
}

function otpRequestPath(input: {
  email?: string;
  error?: "captcha" | "cooldown" | "email";
  nextPath: string;
}) {
  const params = new URLSearchParams({
    mode: "otp",
    next: input.nextPath
  });

  if (input.email) {
    params.set("email", input.email);
  }

  if (input.error) {
    params.set("otpError", input.error);
  }

  return `/login?${params.toString()}`;
}

function otpVerifyPath(input: {
  email: string;
  error?: "format" | "invalid" | "unauthorized";
  nextPath: string;
  sent?: boolean;
}) {
  const params = new URLSearchParams({
    email: input.email,
    mode: "otp",
    next: input.nextPath,
    step: "verify"
  });

  if (input.error) {
    params.set("otpError", input.error);
  }

  if (input.sent) {
    params.set("sent", "1");
  }

  return `/login?${params.toString()}`;
}

export async function signInWithPasswordAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const captchaToken = String(formData.get("captchaToken") ?? "");
  const nextPath = sanitizeInternalNextPath(formData.get("next"));
  const supabase = await createServerSupabaseClient();

  const result = await signInWithPasswordWithCaptcha({
    captchaToken,
    email,
    password,
    supabase
  });

  if (result === "SUCCESS") {
    redirect(nextPath);
  }

  redirect(loginPathWithError(nextPath, result === "CAPTCHA_ERROR" ? "captcha" : "credentials"));
}

export async function requestOtpLoginAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextPath = sanitizeInternalNextPath(formData.get("next"));
  const cookieStore = await cookies();
  const cooldownUntil = Number(cookieStore.get(INTERNAL_OTP_COOLDOWN_COOKIE)?.value ?? "0");

  if (cooldownUntil > Date.now()) {
    redirect(otpRequestPath({ email, error: "cooldown", nextPath }));
  }

  const result = await requestOtpLogin({
    captchaToken: String(formData.get("captchaToken") ?? ""),
    email,
    next: formData.get("next"),
    supabase
  });

  if (!result.ok) {
    const error =
      result.message === OTP_INVALID_EMAIL_MESSAGE
        ? "email"
        : result.message === CAPTCHA_REQUIRED_MESSAGE || result.message === CAPTCHA_ERROR_MESSAGE
          ? "captcha"
          : "email";

    redirect(otpRequestPath({ email, error, nextPath: result.nextPath }));
  }

  cookieStore.set(INTERNAL_OTP_COOLDOWN_COOKIE, String(Date.now() + INTERNAL_OTP_COOLDOWN_SECONDS * 1000), {
    httpOnly: true,
    maxAge: INTERNAL_OTP_COOLDOWN_SECONDS,
    path: "/login",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  redirect(otpVerifyPath({ email: result.email, nextPath: result.nextPath, sent: true }));
}

export async function verifyOtpLoginAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const result = await verifyOtpLogin({
    email: String(formData.get("email") ?? ""),
    next: formData.get("next"),
    supabase,
    token: String(formData.get("token") ?? "")
  });

  if (!result.ok) {
    if (result.message === OTP_UNAUTHORIZED_MESSAGE) {
      redirect(
        otpVerifyPath({
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          error: "unauthorized",
          nextPath: result.nextPath
        })
      );
    }

    if (result.message === OTP_INVALID_MESSAGE) {
      redirect(
        otpVerifyPath({
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          error: "invalid",
          nextPath: result.nextPath
        })
      );
    }

    if (result.message === OTP_INVALID_FORMAT_MESSAGE) {
      redirect(
        otpVerifyPath({
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          error: "format",
          nextPath: result.nextPath
        })
      );
    }
  }

  redirect(result.nextPath);
}
