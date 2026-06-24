import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
  registerParticipantInPortal
} from "./registration-service";
import { registerParticipantPortalAction } from "./registration-actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mocks.cookieSet
  })),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" }))
}));

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: "persona@example.com", id: "11111111-1111-4111-8111-111111111111" },
    status: "allowed"
  }))
}));

vi.mock("./turnstile", () => ({
  verifyParticipantPortalTurnstile: vi.fn(async () => ({ ok: true }))
}));

vi.mock("./access", () => ({
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE: "Portal no disponible.",
  extractClientIp: vi.fn(() => "127.0.0.1"),
  getParticipantPortalAvailability: vi.fn(async () => ({
    ok: true,
    study: {
      activeScreenerVersionId: "version-1",
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina",
      portalConfig: {
        enabled: true,
        privacyNoticeHash: "notice-hash",
        privacyNoticeText: "Aviso.",
        privacyNoticeVersion: "v1"
      },
      status: "ACTIVE"
    }
  }))
}));

vi.mock("./repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("./registration-repository", () => ({
  createParticipantPortalRegistrationRepository: vi.fn(() => ({}))
}));

vi.mock("./registration-service", async () => {
  const actual = await vi.importActual<typeof import("./registration-service")>("./registration-service");

  return {
    ...actual,
    registerParticipantInPortal: vi.fn()
  };
});

function buildFormData() {
  const formData = new FormData();
  formData.set("name", "PERSONA PARTICIPANTE");
  formData.set("phone", "5512345678");
  formData.set("confirmPhone", "5512345678");
  formData.set("consentPrivacy", "on");
  formData.set("consentSensitive", "on");
  return formData;
}

describe("registerParticipantPortalAction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns field errors and preserves captured values on validation failure", async () => {
    vi.mocked(registerParticipantInPortal).mockResolvedValueOnce({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        confirmPhone: ["El celular y la confirmación no coinciden."]
      },
      message: "Revisa los datos de registro.",
      ok: false
    });

    const result = await registerParticipantPortalAction(
      "FMASCULINA-NAVIGO-2026",
      { status: "idle" },
      buildFormData()
    );

    expect(result).toMatchObject({
      fieldErrors: {
        confirmPhone: ["El celular y la confirmación no coinciden."]
      },
      formValues: {
        confirmPhone: "5512345678",
        consentPrivacy: true,
        consentSensitive: true,
        name: "PERSONA PARTICIPANTE",
        phone: "5512345678"
      },
      message: "Revisa los datos de registro.",
      status: "error"
    });
  });

  it("returns the recruiter message without redirect when registration is blocked by duplicate data", async () => {
    vi.mocked(registerParticipantInPortal).mockResolvedValueOnce({
      code: "DUPLICATE_PROFILE_CONFLICT",
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      ok: false
    });

    const result = await registerParticipantPortalAction(
      "FMASCULINA-NAVIGO-2026",
      { status: "idle" },
      buildFormData()
    );

    expect(result).toMatchObject({
      formValues: {
        name: "PERSONA PARTICIPANTE",
        phone: "5512345678"
      },
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      status: "error"
    });
  });

  it("direct public registration validates Turnstile and creates an httpOnly public session cookie", async () => {
    vi.stubEnv("PARTICIPANT_PORTAL_HASH_SECRET", "test-secret");
    const { getParticipantPortalAuth } = await import("@/shared/auth/participant-portal");
    const { verifyParticipantPortalTurnstile } = await import("./turnstile");
    vi.mocked(getParticipantPortalAuth).mockResolvedValueOnce({ status: "no_session" });
    vi.mocked(registerParticipantInPortal).mockResolvedValueOnce({
      data: {
        consentReused: false,
        createdParticipantProfile: true,
        createdStudyParticipant: true,
        participantProfile: {
          createdByUserId: null,
          email: null,
          id: "profile-1",
          name: "PERSONA PARTICIPANTE",
          participantAuthUserId: "11111111-1111-4111-8111-111111111111",
          phone: "+525512345678"
        },
        screeningAttemptId: "attempt-1",
        screeningAttemptReused: false,
        studyParticipant: {
          createdByUserId: null,
          id: "study-participant-1",
          participantProfileId: "profile-1",
          screeningAttempts: [],
          studyId: "study-1"
        }
      },
      ok: true
    });
    const formData = buildFormData();
    formData.set("captchaToken", "captcha-token");

    await expect(
      registerParticipantPortalAction("FMASCULINA-NAVIGO-2026", { status: "idle" }, formData)
    ).rejects.toThrow("redirect:/participar/FMASCULINA-NAVIGO-2026/inicio?registered=1");

    expect(verifyParticipantPortalTurnstile).toHaveBeenCalledWith(expect.objectContaining({
      token: "captcha-token"
    }));
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "participant_portal_public_session_FMASCULINA-NAVIGO-2026",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: "/participar/FMASCULINA-NAVIGO-2026",
        sameSite: "lax"
      })
    );
  });
});
