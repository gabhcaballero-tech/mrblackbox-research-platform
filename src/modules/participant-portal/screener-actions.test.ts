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
    identity: { email: null, id: "public-identity-1", source: "PUBLIC_SESSION" },
    status: "allowed"
  }))
}));

vi.mock("./access-mode", () => ({
  allowsDirectParticipantAccess: vi.fn((studyCode: string) => studyCode === "FMASCULINA-NAVIGO-2026" || studyCode === "DETERGENTES-ROPA-2026")
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

  it("allows a public portal session to save an answer without a Supabase login", async () => {
    const { saveParticipantPortalScreenerAnswer } = await import("./screener-service");

    vi.mocked(saveParticipantPortalScreenerAnswer).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        closed: false,
        nextQuestionId: "F1_CIUDAD",
        status: "STARTED"
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
    ).rejects.toThrow("redirect:/participar/DETERGENTES-ROPA-2026/filtro?question=F1_CIUDAD");

    expect(saveParticipantPortalScreenerAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { email: null, id: "public-identity-1", source: "PUBLIC_SESSION" },
        studyCode: "DETERGENTES-ROPA-2026"
      })
    );
  });

  it("redirects direct public visitors without a public session to registration", async () => {
    const { getParticipantPortalAuth } = await import("@/shared/auth/participant-portal");

    vi.mocked(getParticipantPortalAuth).mockResolvedValueOnce({ status: "no_session" });

    const formData = new FormData();
    formData.set("value", "RECLUTADORA");

    await expect(
      saveParticipantPortalScreenerAnswerAction(
        "DETERGENTES-ROPA-2026",
        "attempt-1",
        "F0_RECLUTADOR",
        formData
      )
    ).rejects.toThrow("redirect:/participar/DETERGENTES-ROPA-2026/inicio");
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
