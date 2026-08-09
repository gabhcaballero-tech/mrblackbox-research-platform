import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHutQuestionnaireAttemptAction } from "./actions";
import { createHutRepository } from "./repository";
import { requireCapability } from "@/shared/auth/session";

const resetQuestionnaireAttemptMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
}));

vi.mock("@/shared/auth/session", () => ({
  requireCapability: vi.fn()
}));

vi.mock("./repository", () => ({
  createHutRepository: vi.fn(() => ({
    resetQuestionnaireAttempt: resetQuestionnaireAttemptMock
  }))
}));

describe("HUT admin reset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQuestionnaireAttemptMock.mockResolvedValue({
      data: { participantId: "participant-1" },
      message: "Evaluacion HUT reseteada.",
      ok: true
    });
  });

  it("bloquea reset de encuesta HUT si el usuario no es ADMIN", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new Error("unauthorized"));

    await expect(
      resetHutQuestionnaireAttemptAction("study-1", "participant-1", new FormData())
    ).rejects.toThrow("unauthorized");

    expect(requireCapability).toHaveBeenCalledWith("admin:access");
    expect(createHutRepository).not.toHaveBeenCalled();
    expect(resetQuestionnaireAttemptMock).not.toHaveBeenCalled();
  });
});
