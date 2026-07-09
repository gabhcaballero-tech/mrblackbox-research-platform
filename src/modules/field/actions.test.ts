import { describe, expect, it, vi, afterEach } from "vitest";
import {
  saveFieldScreeningAnswerAction,
  startFieldScreeningAttemptAction
} from "./actions";
import { PUBLIC_FIELD_ACTOR } from "./service";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("./auth", () => ({
  getFieldActorForRequest: vi.fn(async () => PUBLIC_FIELD_ACTOR)
}));

vi.mock("./repository", () => ({
  createFieldRepository: vi.fn(() => ({}))
}));

vi.mock("./service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service")>();

  return {
    ...actual,
    saveFieldScreeningAnswer: vi.fn(),
    startFieldScreeningAttempt: vi.fn()
  };
});

const ensureFilterOnlyConfirmation = vi.fn();

vi.mock("@/modules/participant-portal/screener-repository", () => ({
  createParticipantPortalScreenerRepository: vi.fn(() => ({
    ensureFilterOnlyConfirmation
  }))
}));

vi.mock("@/modules/participant-portal/review", () => ({
  generateParticipantReferenceCode: vi.fn(() => "A7K4")
}));

describe("field actions public access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a field screening attempt without an internal session", async () => {
    const { startFieldScreeningAttempt } = await import("./service");

    vi.mocked(startFieldScreeningAttempt).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-public-1",
        kind: "started",
        participantProfileId: "profile-1",
        reusedParticipantProfile: false,
        studyParticipantId: "study-participant-1"
      },
      ok: true
    });

    const formData = new FormData();
    formData.set("name", "Persona publica");
    formData.set("phone", "5551112222");

    await expect(startFieldScreeningAttemptAction("study-1", {}, formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1"
    );

    expect(startFieldScreeningAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: PUBLIC_FIELD_ACTOR,
        studyId: "study-1"
      })
    );
  });

  it("generates folio and codes when a public field screening finishes as eligible", async () => {
    const { saveFieldScreeningAnswer } = await import("./service");

    vi.mocked(saveFieldScreeningAnswer).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-public-1",
        closed: true,
        nextQuestionId: null,
        status: "PASSED"
      },
      ok: true
    });
    ensureFilterOnlyConfirmation.mockResolvedValueOnce({
      confirmation: {
        folio: "NAV-001",
        folioSequence: 1,
        referenceCodes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ]
      },
      created: true,
      ok: true
    });

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-public-1", "CONSENTIMIENTO", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1/result"
    );

    expect(saveFieldScreeningAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: PUBLIC_FIELD_ACTOR,
        attemptId: "attempt-public-1"
      })
    );
    expect(ensureFilterOnlyConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-public-1"
      })
    );
  });
});
