import { describe, expect, it, vi } from "vitest";
import ParticipantPortalSelfiePage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: "persona@example.com", id: "auth-user-1" },
    status: "allowed"
  }))
}));

vi.mock("@/modules/participant-portal/repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/evidence-repository", () => ({
  createParticipantPortalEvidenceRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/evidence-service", () => ({
  getParticipantPortalSelfieScreen: vi.fn(async () => ({
    data: {
      attemptId: "attempt-1",
      counts: { perfumePhotos: 0, selfie: 0 },
      selfieComplete: false,
      study: {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Fragancia Masculina"
      }
    },
    ok: true
  }))
}));

vi.mock("./ParticipantFinalSelfieStep", () => ({
  ParticipantFinalSelfieStep: () => <div>Selfie step</div>
}));

describe("ParticipantPortalSelfiePage", () => {
  it("redirects filter-only studies to result instead of showing the selfie screen", async () => {
    await expect(
      ParticipantPortalSelfiePage({
        params: Promise.resolve({ studyCode: "DETERGENTES-ROPA-2026" })
      })
    ).rejects.toThrow("redirect:/participar/DETERGENTES-ROPA-2026/resultado");
  });

  it("keeps the selfie screen for Navigo", async () => {
    const page = await ParticipantPortalSelfiePage({
      params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" })
    });

    expect(page).toBeTruthy();
  });
});
