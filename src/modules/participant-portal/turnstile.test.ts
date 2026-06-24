import { describe, expect, it, vi } from "vitest";
import { CAPTCHA_REQUIRED_MESSAGE } from "@/shared/auth/passwordless";
import { verifyParticipantPortalTurnstile } from "./turnstile";

describe("participant portal Turnstile", () => {
  it("requires a token for direct public registration", async () => {
    const result = await verifyParticipantPortalTurnstile({
      ipAddress: "127.0.0.1",
      secret: "secret",
      token: ""
    });

    expect(result).toEqual({
      code: "VALIDATION_ERROR",
      message: CAPTCHA_REQUIRED_MESSAGE,
      ok: false
    });
  });

  it("uses the injected verifier without exposing secrets", async () => {
    const verifier = vi.fn(async () => ({ ok: true as const }));
    const result = await verifyParticipantPortalTurnstile({
      ipAddress: "127.0.0.1",
      secret: "secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token: "captcha-token",
      verifier
    });

    expect(result).toEqual({ ok: true });
    expect(verifier).toHaveBeenCalledWith({
      ipAddress: "127.0.0.1",
      secret: "secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token: "captcha-token"
    });
  });

  it("maps timeout-or-duplicate to a retry message and logs the Cloudflare reason safely", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await verifyParticipantPortalTurnstile({
      ipAddress: "127.0.0.1",
      secret: "secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token: "captcha-token",
      verifier: async () => ({
        code: "TURNSTILE_ERROR",
        message: "La verificación de seguridad venció. Vuelve a completar la verificación e intenta de nuevo.",
        ok: false,
        reason: "timeout-or-duplicate"
      })
    });

    expect(result).toEqual({
      code: "TURNSTILE_ERROR",
      message: "La verificación de seguridad venció. Vuelve a completar la verificación e intenta de nuevo.",
      ok: false,
      reason: "timeout-or-duplicate"
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns configuration error when the secret is missing", async () => {
    const result = await verifyParticipantPortalTurnstile({
      ipAddress: "127.0.0.1",
      secret: "",
      token: "captcha-token"
    });

    expect(result).toEqual({
      code: "CONFIGURATION_ERROR",
      message: "La verificación de seguridad no está configurada. Contacta a tu reclutador.",
      ok: false
    });
  });

  it("logs Cloudflare reasons without token or secret when verification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        "error-codes": ["invalid-input-response"],
        success: false
      })
    })) as unknown as typeof fetch;

    const result = await verifyParticipantPortalTurnstile({
      ipAddress: "127.0.0.1",
      secret: "server-secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token: "captcha-token"
    });

    expect(result).toEqual({
      code: "TURNSTILE_ERROR",
      message: "La verificación de seguridad venció. Vuelve a completar la verificación e intenta de nuevo.",
      ok: false,
      reason: "invalid-input-response"
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "participant portal turnstile failed: code=TURNSTILE_ERROR reason=invalid-input-response studyCode=FMASCULINA-NAVIGO-2026"
    );
    expect(errorSpy.mock.calls.join(" ")).not.toContain("captcha-token");
    expect(errorSpy.mock.calls.join(" ")).not.toContain("server-secret");

    global.fetch = originalFetch;
    errorSpy.mockRestore();
  });
});
