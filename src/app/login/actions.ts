"use server";

import { redirect } from "next/navigation";
import {
  requestOtpLogin,
  verifyOtpLogin,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE
} from "@/shared/auth/passwordless";
import { sanitizeInternalNextPath } from "@/shared/auth/routes";
import { createServerSupabaseClient } from "@/shared/auth/supabase/server";

function loginPathWithError(nextPath: string) {
  return `/login?error=credentials&next=${encodeURIComponent(nextPath)}`;
}

function otpRequestPath(input: {
  email?: string;
  error?: "email";
  nextPath: string;
  sent?: boolean;
}) {
  const params = new URLSearchParams({
    mode: "otp",
    next: input.nextPath
  });

  if (input.email) {
    params.set("email", input.email);
  }

  if (input.sent) {
    params.set("sent", "1");
  }

  if (input.error) {
    params.set("otpError", input.error);
  }

  return `/login?${params.toString()}`;
}

function otpVerifyPath(input: {
  email: string;
  error?: "invalid" | "unauthorized";
  nextPath: string;
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

  return `/login?${params.toString()}`;
}

export async function signInWithPasswordAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeInternalNextPath(formData.get("next"));

  if (!email || !password) {
    redirect(loginPathWithError(nextPath));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(loginPathWithError(nextPath));
  }

  redirect(nextPath);
}

export async function requestOtpLoginAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const result = await requestOtpLogin({
    email: String(formData.get("email") ?? ""),
    next: formData.get("next"),
    supabase
  });

  if (!result.ok) {
    redirect(otpRequestPath({ error: "email", nextPath: result.nextPath }));
  }

  redirect(otpVerifyPath({ email: result.email, nextPath: result.nextPath }));
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

    redirect(
      otpVerifyPath({
        email: String(formData.get("email") ?? "").trim().toLowerCase(),
        error: result.message === OTP_INVALID_EMAIL_MESSAGE || result.message === OTP_INVALID_MESSAGE ? "invalid" : "invalid",
        nextPath: result.nextPath
      })
    );
  }

  redirect(result.nextPath);
}
