import { afterEach, describe, expect, it, vi } from "vitest";
import { saveParticipantPortalScreenerAnswerAction } from "./screener-actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: "persona@example.com", id: "auth-user-1" },
    status: "allowed"
  }))
}));

vi.mock("./repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("./screener-repository", () => ({
  createParticipantPortalScreenerRepository: vi.fn(() => ({}))
}));

vi.mock("./screener-service", () => ({
  saveParticipantPortalScreenerAnswer: vi.fn()
}));

describe("participant portal screener actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects filter-only studies directly to result after a passed filter", async () => {
    const { saveParticipantPortalScreenerAnswer } = await import("./screener-service");

    vi.mocked(saveParticipantPortalScreenerAnswer).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        closed: true,
        nextQuestionId: null,
        status: "PASSED"
      },
      ok: true
    });

    const formData = new FormData();
    formData.set("value", "RECLUTADORA");

    await expect(
      saveParticipantPortalScreenerAnswerAction(
        "DETERGENTES-ROPA-2026",
        "attempt-1",
        "F0_RECLUTADOR",
        formData
      )
    ).rejects.toThrow("redirect:/participar/DETERGENTES-ROPA-2026/resultado");
  });

  it("keeps the selfie redirect for Navigo after a passed filter", async () => {
    const { saveParticipantPortalScreenerAnswer } = await import("./screener-service");

    vi.mocked(saveParticipantPortalScreenerAnswer).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        closed: true,
        nextQuestionId: null,
        status: "PASSED"
      },
      ok: true
    });

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(
      saveParticipantPortalScreenerAnswerAction(
        "FMASCULINA-NAVIGO-2026",
        "attempt-1",
        "CONSENTIMIENTO",
        formData
      )
    ).rejects.toThrow("redirect:/participar/FMASCULINA-NAVIGO-2026/selfie");
  });
});
