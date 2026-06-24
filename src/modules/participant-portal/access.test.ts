import { describe, expect, it, vi } from "vitest";
import { getInternalRouteDecision } from "@/shared/auth/routes";
import { resolveInternalUserAccess } from "@/shared/auth/session";
import {
  PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE,
  PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE,
  PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE,
  PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
  hashPortalValue,
  requestParticipantPortalOtp,
  verifyParticipantPortalOtp
} from "./access";
import type { ParticipantPortalRepository, ParticipantPortalStudyRecord } from "./repository";

const now = new Date("2026-06-23T12:00:00.000Z");
const hashSecret = "test-secret-value";
const studyCode = "FMASCULINA-NAVIGO-2026";
const participantUserId = "11111111-1111-4111-8111-111111111111";

function activePortalStudy(overrides: Partial<ParticipantPortalStudyRecord> = {}): ParticipantPortalStudyRecord {
  return {
    activeScreenerVersionId: "version-1",
    code: studyCode,
    id: "study-1",
    name: "Fragancia Masculina",
    portalConfig: {
      enabled: true,
      evidenceRetentionDays: 30,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      maxImageBytes: 8388608,
      maxOtpAttempts: 5,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1,
      nextFolioSequence: 1,
      privacyNoticeHash: "notice-hash",
      privacyNoticeText: "Aviso de privacidad.",
      privacyNoticeVersion: "v1",
      otpCooldownSeconds: 60
    },
    status: "ACTIVE",
    ...overrides
  };
}

function createRepository({
  failedAttempts = 0,
  internalUser = null,
  recentRequest = null,
  study = activePortalStudy()
}: {
  failedAttempts?: number;
  internalUser?: { id: string } | null;
  recentRequest?: { requestedAt: Date } | null;
  study?: ParticipantPortalStudyRecord | null;
} = {}) {
  const logs: Array<{ emailHash: string; ipHash: string | null; purpose: string }> = [];
  const repository: ParticipantPortalRepository = {
    countOtpLogsSince: vi.fn(async () => failedAttempts + logs.filter((log) => log.purpose === "OTP_VERIFY_FAILED").length),
    createOtpLog: vi.fn(async (input) => {
      logs.push({
        emailHash: input.emailHash,
        ipHash: input.ipHash,
        purpose: input.purpose
      });
    }),
    findInternalUserByAuthUserId: vi.fn(async () => internalUser),
    findRecentOtpRequest: vi.fn(async () => recentRequest),
    getStudyByCode: vi.fn(async () => study)
  };

  return { logs, repository };
}

function supabaseMock({
  userId = participantUserId,
  verifyError = null
}: {
  userId?: string | null;
  verifyError?: unknown;
} = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { email: "persona@example.com", id: userId } : null },
        error: null
      })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: verifyError }))
    }
  };
}

describe("participant portal access", () => {
  it("blocks disabled portal, inactive study and missing active screener generically", async () => {
    for (const study of [
      activePortalStudy({ portalConfig: { ...activePortalStudy().portalConfig!, enabled: false } }),
      activePortalStudy({ status: "DRAFT" }),
      activePortalStudy({ activeScreenerVersionId: null })
    ]) {
      const { repository } = createRepository({ study });
      const result = await requestParticipantPortalOtp({
        captchaToken: "captcha",
        email: "persona@example.com",
        hashSecret,
        now,
        repository,
        studyCode,
        supabase: supabaseMock()
      });

      expect(result).toEqual({
        message: PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
        ok: false,
        reason: "PORTAL_UNAVAILABLE"
      });
    }
  });

  it("requires valid email and Turnstile token before requesting OTP", async () => {
    const { repository } = createRepository();
    const supabase = supabaseMock();

    const invalidEmail = await requestParticipantPortalOtp({
      captchaToken: "captcha",
      email: "correo-invalido",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase
    });
    const missingTurnstile = await requestParticipantPortalOtp({
      captchaToken: "",
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase
    });

    expect(invalidEmail.ok).toBe(false);
    expect(missingTurnstile.ok).toBe(false);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("requests participant OTP with shouldCreateUser true and captchaToken", async () => {
    const { repository } = createRepository();
    const supabase = supabaseMock();
    const result = await requestParticipantPortalOtp({
      captchaToken: "turnstile-token",
      email: " Persona@Example.com ",
      hashSecret,
      ipAddress: "203.0.113.10",
      now,
      repository,
      studyCode,
      supabase
    });

    expect(result).toEqual({
      email: "persona@example.com",
      message: PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
      ok: true,
      sentToSupabase: true
    });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "persona@example.com",
      options: {
        captchaToken: "turnstile-token",
        shouldCreateUser: true
      }
    });
  });

  it("keeps messages generic and does not enumerate emails", async () => {
    const { repository } = createRepository();
    const result = await requestParticipantPortalOtp({
      captchaToken: "turnstile-token",
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase: supabaseMock()
    });

    expect(result.ok ? result.message : "").toBe(PARTICIPANT_PORTAL_OTP_SENT_MESSAGE);
    expect(result.ok ? result.message : "").not.toContain("persona@example.com");
  });

  it("respects cooldown by emailHash", async () => {
    const { repository } = createRepository({ recentRequest: { requestedAt: now } });
    const supabase = supabaseMock();
    const result = await requestParticipantPortalOtp({
      captchaToken: "turnstile-token",
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase
    });

    expect(result.ok ? result.sentToSupabase : true).toBe(false);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("stores only HMAC hashes for email and IP", async () => {
    const { logs, repository } = createRepository();
    await requestParticipantPortalOtp({
      captchaToken: "turnstile-token",
      email: "persona@example.com",
      hashSecret,
      ipAddress: "203.0.113.10",
      now,
      repository,
      studyCode,
      supabase: supabaseMock()
    });

    expect(logs[0]?.emailHash).toBe(hashPortalValue("persona@example.com", hashSecret));
    expect(logs[0]?.emailHash).not.toBe("persona@example.com");
    expect(logs[0]?.ipHash).not.toBe("203.0.113.10");
  });

  it("valid 6-digit code verifies the Supabase session without creating ParticipantProfile", async () => {
    const { repository } = createRepository();
    const supabase = supabaseMock();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      message: "Código verificado correctamente.",
      ok: true
    });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "persona@example.com",
      token: "123456",
      type: "email"
    });
    expect(Object.keys(repository)).not.toContain("createParticipantProfile");
  });

  it("accepts an 8-digit participant OTP and removes spaces before verifying", async () => {
    const { repository } = createRepository();
    const supabase = supabaseMock();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase,
      token: "12 34 56 78"
    });

    expect(result).toEqual({
      message: "Código verificado correctamente.",
      ok: true
    });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "persona@example.com",
      token: "12345678",
      type: "email"
    });
  });

  it("invalid code logs failure and shows generic message", async () => {
    const { logs, repository } = createRepository();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase: supabaseMock({ verifyError: new Error("expired") }),
      token: "123456"
    });

    expect(result).toEqual({
      message: PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE,
      ok: false,
      reason: "INVALID_CODE"
    });
    expect(logs[0]?.purpose).toBe("OTP_VERIFY_FAILED");
  });

  it("rejects letters and symbols in participant OTP format", async () => {
    const { logs, repository } = createRepository();
    const supabase = supabaseMock();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase,
      token: "12A4-678"
    });

    expect(result).toEqual({
      message: PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE,
      ok: false,
      reason: "VALIDATION_ERROR"
    });
    expect(logs[0]?.purpose).toBe("OTP_VERIFY_FAILED");
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("blocks verification after maximum attempts", async () => {
    const { repository } = createRepository({ failedAttempts: 5 });
    const supabase = supabaseMock();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      message: PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE,
      ok: false,
      reason: "MAX_ATTEMPTS"
    });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("blocks InternalUser from using the participant portal", async () => {
    const { repository } = createRepository({ internalUser: { id: "internal-1" } });
    const supabase = supabaseMock();
    const result = await verifyParticipantPortalOtp({
      email: "persona@example.com",
      hashSecret,
      now,
      repository,
      studyCode,
      supabase,
      token: "123456"
    });

    expect(result).toEqual({
      message: "Este acceso está reservado para participantes.",
      ok: false,
      reason: "INTERNAL_USER"
    });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("participant without InternalUser cannot enter internal admin or field areas", () => {
    expect(getInternalRouteDecision("/admin", true)).toEqual({ action: "allow" });
    expect(
      resolveInternalUserAccess({
        identity: { email: "persona@example.com", id: participantUserId },
        internalUser: null,
        requiredCapability: "admin:access"
      })
    ).toMatchObject({
      code: "NO_INTERNAL_USER",
      status: "denied"
    });
    expect(
      resolveInternalUserAccess({
        identity: { email: "persona@example.com", id: participantUserId },
        internalUser: null,
        requiredCapability: "field:access"
      })
    ).toMatchObject({
      code: "NO_INTERNAL_USER",
      status: "denied"
    });
  });

  it("does not print secrets or raw identifiers in hashes", () => {
    const hash = hashPortalValue("persona@example.com", hashSecret);

    expect(hash).not.toContain("persona");
    expect(hash).not.toContain(hashSecret);
  });
});
