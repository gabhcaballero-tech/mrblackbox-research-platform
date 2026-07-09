import { describe, expect, it, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureFilterOnlyConfirmation: vi.fn(),
  findLatestOutboundTemplateMessage: vi.fn(),
  getAttempt: vi.fn(),
  sendNavigoConfirmationWhatsApp: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("./auth", () => ({
  getFieldActorForRequest: vi.fn(async () => ({
    id: "PUBLIC_FIELD",
    role: "INTERVIEWER",
    status: "ACTIVE"
  }))
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

vi.mock("@/modules/oneui-whatsapp", () => ({
  createOneuiWhatsAppRepository: vi.fn(() => ({
    findLatestOutboundTemplateMessage: mocks.findLatestOutboundTemplateMessage
  })),
  sendNavigoConfirmationWhatsApp: mocks.sendNavigoConfirmationWhatsApp
}));

vi.mock("@/modules/participant-portal/screener-repository", () => ({
  createParticipantPortalScreenerRepository: vi.fn(() => ({
    ensureFilterOnlyConfirmation: mocks.ensureFilterOnlyConfirmation,
    getAttempt: mocks.getAttempt
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
    const { startFieldScreeningAttemptAction } = await import("./actions");
    const { PUBLIC_FIELD_ACTOR } = await import("./service");
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

  it("returns a visible error instead of throwing the field error boundary when start fails", async () => {
    const { startFieldScreeningAttemptAction } = await import("./actions");
    const { startFieldScreeningAttempt } = await import("./service");

    vi.mocked(startFieldScreeningAttempt).mockRejectedValueOnce(new Error("database unavailable"));

    const formData = new FormData();
    formData.set("name", "Persona publica");
    formData.set("phone", "5551112222");

    await expect(startFieldScreeningAttemptAction("study-1", {}, formData)).resolves.toEqual({
      error: "No fue posible iniciar el filtro. Intenta nuevamente.",
      values: {
        email: "",
        externalReference: "",
        name: "Persona publica",
        phone: "5551112222"
      }
    });
  });

  it("generates folio and codes but does not send final WhatsApp before selfie when review is required", async () => {
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { PUBLIC_FIELD_ACTOR } = await import("./service");
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
    mocks.ensureFilterOnlyConfirmation.mockResolvedValueOnce({
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
    mocks.getAttempt.mockResolvedValueOnce({
      id: "attempt-public-1",
      questionnaireVersion: {
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1"
        }
      },
      studyParticipant: {
        participantProfile: {
          name: "Persona publica",
          phone: "5551112222"
        }
      },
      studyParticipantId: "study-participant-1"
    });
    mocks.findLatestOutboundTemplateMessage.mockResolvedValueOnce(null);
    mocks.sendNavigoConfirmationWhatsApp.mockResolvedValueOnce({
      code: "SKIPPED",
      message: "WhatsApp rechazado en prueba.",
      ok: false
    });

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-public-1", "CONSENTIMIENTO", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1/selfie"
    );

    expect(saveFieldScreeningAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: PUBLIC_FIELD_ACTOR,
        attemptId: "attempt-public-1"
      })
    );
    expect(mocks.ensureFilterOnlyConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-public-1"
      })
    );
    expect(mocks.sendNavigoConfirmationWhatsApp).not.toHaveBeenCalled();
  });

  it("goes straight to result when a passed public field study does not require selfie", async () => {
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { saveFieldScreeningAnswer } = await import("./service");

    vi.mocked(saveFieldScreeningAnswer).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-detergents-1",
        closed: true,
        nextQuestionId: null,
        status: "PASSED"
      },
      ok: true
    });
    mocks.ensureFilterOnlyConfirmation.mockResolvedValueOnce({
      confirmation: {
        folio: "DET-001",
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
    mocks.getAttempt.mockResolvedValueOnce({
      id: "attempt-detergents-1",
      questionnaireVersion: {
        study: {
          code: "DETERGENTES-ROPA-2026",
          id: "study-detergents"
        }
      },
      studyParticipant: {
        participantProfile: {
          name: "Persona publica",
          phone: "5551112222"
        }
      },
      studyParticipantId: "study-participant-1"
    });
    mocks.findLatestOutboundTemplateMessage.mockResolvedValueOnce(null);
    mocks.sendNavigoConfirmationWhatsApp.mockResolvedValueOnce({
      code: "SKIPPED",
      message: "WhatsApp rechazado en prueba.",
      ok: false
    });

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-detergents-1", "CONSENTIMIENTO", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-detergents-1/result"
    );
    expect(mocks.sendNavigoConfirmationWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        folio: "DET-001",
        participantId: "study-participant-1",
        phone: "5551112222"
      })
    );
  });

  it("redirects back to the field question with a clear error when saving fails unexpectedly", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { saveFieldScreeningAnswer } = await import("./service");

    vi.mocked(saveFieldScreeningAnswer).mockRejectedValueOnce(new Error("database unavailable"));

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-public-1", "OP1_RECLUTADOR", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1?question=OP1_RECLUTADOR&error=No+se+pudo+guardar+la+respuesta.+Intenta+nuevamente."
    );

    consoleErrorSpy.mockRestore();
  });
});
