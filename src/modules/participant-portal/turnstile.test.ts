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
      token: "captcha-token",
      verifier
    });

    expect(result).toEqual({ ok: true });
    expect(verifier).toHaveBeenCalledWith({
      ipAddress: "127.0.0.1",
      secret: "secret",
      token: "captcha-token"
    });
  });
});
