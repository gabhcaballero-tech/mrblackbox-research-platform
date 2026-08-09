import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHutQuestionnaireAttemptAction, saveHutQuestionnaireAnswerForFieldAction } from "./actions";
import { createHutRepository } from "./repository";
import { requireCapability } from "@/shared/auth/session";

const resetQuestionnaireAttemptMock = vi.fn();
const saveQuestionnaireAnswerMock = vi.fn();

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
    resetQuestionnaireAttempt: resetQuestionnaireAttemptMock,
    saveQuestionnaireAnswer: saveQuestionnaireAnswerMock
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
    saveQuestionnaireAnswerMock.mockResolvedValue({
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

  it("redirige a la siguiente pregunta al guardar desde campo", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ id: "field-user-1" } as never);
    const formData = new FormData();
    formData.set("HUT_EVA1_GUSTO", "6");
    formData.set("returnQuestionCode", "HUT_EVA1_ATRIBUTOS");

    await expect(
      saveHutQuestionnaireAnswerForFieldAction("HUT-121", "participant-1", "study-1", "HUT_EVA1_GUSTO", formData)
    ).rejects.toThrow("REDIRECT:/field/hut?folio=HUT-121&hutMessage=Guardado+correctamente&questionCode=HUT_EVA1_ATRIBUTOS");

    expect(requireCapability).toHaveBeenCalledWith("field:access");
    expect(saveQuestionnaireAnswerMock).toHaveBeenCalledWith({
      actorUserId: "field-user-1",
      answerInput: {
        HUT_EVA1_GUSTO: "6",
        returnQuestionCode: "HUT_EVA1_ATRIBUTOS"
      },
      participantId: "participant-1",
      questionCode: "HUT_EVA1_GUSTO",
      studyId: "study-1"
    });
  });

  it("vuelve al resumen al guardar la ultima pregunta desde campo", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ id: "field-user-1" } as never);
    const formData = new FormData();
    formData.set("HUT_COMP_RAZONES", "Prefiere el primero");
    formData.set("returnQuestionCode", "__HUT_SUMMARY__");

    await expect(
      saveHutQuestionnaireAnswerForFieldAction("HUT-121", "participant-1", "study-1", "HUT_COMP_RAZONES", formData)
    ).rejects.toThrow("REDIRECT:/field/hut?folio=HUT-121&hutMessage=Evaluacion+completada");
  });
});
