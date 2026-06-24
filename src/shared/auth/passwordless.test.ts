import { describe, expect, it, vi } from "vitest";
import {
  CAPTCHA_ERROR_MESSAGE,
  CAPTCHA_REQUIRED_MESSAGE,
  OTP_GENERIC_SENT_MESSAGE,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE,
  requestOtpLogin,
  signInWithPasswordWithCaptcha,
  verifyOtpLogin
} from "./passwordless";
import type { InternalUserRecord } from "./session";

const identity = {
  email: "entrevistador@example.com",
  id: "11111111-1111-4111-8111-111111111111"
};

function activeInternalUser(): InternalUserRecord {
  return {
    authUserId: identity.id,
    email: identity.email,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Entrevistador",
    role: "INTERVIEWER",
    status: "ACTIVE"
  };
}

function supabaseMock({
  passwordError = null,
  otpError = null,
  verifyError = null
}: {
  passwordError?: unknown;
  otpError?: unknown;
  verifyError?: unknown;
} = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: identity },
        error: null
      })),
      signInWithOtp: vi.fn(async () => ({ error: otpError })),
      signInWithPassword: vi.fn(async () => ({ error: passwordError })),
      signOut: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: verifyError }))
    }
  };
}

describe("passwordless login helpers", () => {
  it("sends captchaToken in password login", async () => {
    const supabase = supabaseMock();
    const result = await signInWithPasswordWithCaptcha({
      captchaToken: "turnstile-token",
      email: " Entrevistador@Example.com ",
      password: "secret",
      supabase
    });

    expect(result).toBe("SUCCESS");
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "entrevistador@example.com",
      options: { captchaToken: "turnstile-token" },
      password: "secret"
    });
  });

  it("requires captcha for password login", async () => {
    const supabase = supabaseMock();
    const result = await signInWithPasswordWithCaptcha({
      captchaToken: "",
      email: "entrevistador@example.com",
      password: "secret",
      supabase
    });

    expect(result).toBe("CAPTCHA_ERROR");
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("requests OTP with shouldCreateUser false and captchaToken", async () => {
    const supabase = supabaseMock();
    const result = await requestOtpLogin({
      captchaToken: "turnstile-token",
      email: " Entrevistador@Example.com ",
      next: "/field",
      supabase
    });

    expect(result).toEqual({
      email: "entrevistador@example.com",
      message: OTP_GENERIC_SENT_MESSAGE,
      nextPath: "/field",
      ok: true
    });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "entrevistador@example.com",
      options: { captchaToken: "turnstile-token", shouldCreateUser: false }
    });
  });

  it("requires captcha before requesting internal OTP", async () => {
    const supabase = supabaseMock();
    const result = await requestOtpLogin({
      captchaToken: "",
      email: "entrevistador@example.com",
      next: "/field",
      supabase
    });

    expect(result).toEqual({
      message: CAPTCHA_REQUIRED_MESSAGE,
      nextPath: "/field",
      ok: false
    });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("surfaces captcha validation errors without exposing Supabase internals", async () => {
    const supabase = supabaseMock({ otpError: new Error("captcha protection: request disallowed") });
    const result = await requestOtpLogin({
      captchaToken: "turnstile-token",
      email: "entrevistador@example.com",
      next: "/field",
      supabase
    });

    expect(result).toEqual({
      message: CAPTCHA_ERROR_MESSAGE,
      nextPath: "/field",
      ok: false
    });
  });

  it("does not reveal whether the email exists", async () => {
    const supabase = supabaseMock({ otpError: new Error("User not found") });
    const result = await requestOtpLogin({
      captchaToken: "turnstile-token",
      email: "nadie@example.com",
      next: "/field",
      supabase
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.message : "").toBe(OTP_GENERIC_SENT_MESSAGE);
  });

  it("validates email format before requesting OTP", async () => {
    const supabase = supabaseMock();
    const result = await requestOtpLogin({
      captchaToken: "turnstile-token",
      email: "correo-invalido",
      next: "/field",
      supabase
    });

    expect(result).toEqual({
      message: OTP_INVALID_EMAIL_MESSAGE,
      nextPath: "/field",
      ok: false
    });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("verifies a correct OTP and preserves the redirect", async () => {
    const supabase = supabaseMock();
    const result = await verifyOtpLogin({
      email: "entrevistador@example.com",
      internalUserReader: {
        findByAuthUserId: vi.fn(async () => activeInternalUser())
      },
      next: "/field/studies/study-1",
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      nextPath: "/field/studies/study-1",
      ok: true
    });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "entrevistador@example.com",
      token: "123456",
      type: "email"
    });
  });

  it("shows invalid message for expired or incorrect OTP", async () => {
    const supabase = supabaseMock({ verifyError: new Error("expired") });
    const result = await verifyOtpLogin({
      email: "entrevistador@example.com",
      next: "/field",
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      message: OTP_INVALID_MESSAGE,
      nextPath: "/field",
      ok: false,
      reason: "INVALID_CODE"
    });
  });

  it("blocks users without an active InternalUser after OTP verification", async () => {
    const supabase = supabaseMock();
    const result = await verifyOtpLogin({
      email: "entrevistador@example.com",
      internalUserReader: {
        findByAuthUserId: vi.fn(async () => null)
      },
      next: "/field",
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      message: OTP_UNAUTHORIZED_MESSAGE,
      nextPath: "/field",
      ok: false,
      reason: "UNAUTHORIZED"
    });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("rejects invalid token format without verifying against Supabase", async () => {
    const supabase = supabaseMock();
    const result = await verifyOtpLogin({
      email: "entrevistador@example.com",
      next: "/field",
      supabase,
      token: "12"
    });

    expect(result.ok).toBe(false);
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });
});
