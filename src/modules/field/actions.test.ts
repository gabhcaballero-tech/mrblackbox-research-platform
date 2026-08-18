import { describe, expect, it, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureFilterOnlyConfirmation: vi.fn(),
  applyStoredNavigoRotationForParticipantBestEffort: vi.fn(),
  findLatestOutboundTemplateMessage: vi.fn(),
  getAttempt: vi.fn(),
  sendNavigoConfirmationWhatsApp: vi.fn()
}));

const blockMessage = "Este estudio ahora se gestiona en la plataforma V2. Por favor continúe el registro en V2.";

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

vi.mock("@/modules/navigo-app/rotation-folio-application", () => ({
  applyStoredNavigoRotationForParticipantBestEffort: mocks.applyStoredNavigoRotationForParticipantBestEffort
}));

describe("field actions public access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks starting a field screening attempt from V1", async () => {
    const { startFieldScreeningAttemptAction } = await import("./actions");
    const { startFieldScreeningAttempt } = await import("./service");

    const formData = new FormData();
    formData.set("name", "Persona publica");
    formData.set("phone", "5551112222");

    await expect(startFieldScreeningAttemptAction("study-1", {}, formData)).resolves.toEqual({
      error: blockMessage,
      values: {
        email: "",
        externalReference: "",
        name: "Persona publica",
        phone: "5551112222"
      }
    });
    expect(startFieldScreeningAttempt).not.toHaveBeenCalled();
  });

  it("does not hit the start service while V1 screening is blocked", async () => {
    const { startFieldScreeningAttemptAction } = await import("./actions");
    const { startFieldScreeningAttempt } = await import("./service");

    const formData = new FormData();
    formData.set("name", "Persona publica");
    formData.set("phone", "5551112222");

    await expect(startFieldScreeningAttemptAction("study-1", {}, formData)).resolves.toEqual({
      error: blockMessage,
      values: {
        email: "",
        externalReference: "",
        name: "Persona publica",
        phone: "5551112222"
      }
    });
    expect(startFieldScreeningAttempt).not.toHaveBeenCalled();
  });

  it("blocks saving answers and does not generate folio or codes", async () => {
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { saveFieldScreeningAnswer } = await import("./service");
    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-public-1", "CONSENTIMIENTO", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1?question=CONSENTIMIENTO&error=Este+estudio+ahora+se+gestiona+en+la+plataforma+V2.+Por+favor+contin%C3%BAe+el+registro+en+V2."
    );

    expect(saveFieldScreeningAnswer).not.toHaveBeenCalled();
    expect(mocks.ensureFilterOnlyConfirmation).not.toHaveBeenCalled();
    expect(mocks.sendNavigoConfirmationWhatsApp).not.toHaveBeenCalled();
  });

  it("blocks saving answers for other studies while V1 screening is disabled", async () => {
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { saveFieldScreeningAnswer } = await import("./service");
    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-detergents-1", "CONSENTIMIENTO", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-detergents-1?question=CONSENTIMIENTO&error=Este+estudio+ahora+se+gestiona+en+la+plataforma+V2.+Por+favor+contin%C3%BAe+el+registro+en+V2."
    );
    expect(saveFieldScreeningAnswer).not.toHaveBeenCalled();
    expect(mocks.sendNavigoConfirmationWhatsApp).not.toHaveBeenCalled();
  });

  it("returns the V2 message before unexpected save failures can occur", async () => {
    const { saveFieldScreeningAnswerAction } = await import("./actions");
    const { saveFieldScreeningAnswer } = await import("./service");

    const formData = new FormData();
    formData.set("value", "SI");

    await expect(saveFieldScreeningAnswerAction("attempt-public-1", "OP1_RECLUTADOR", formData)).rejects.toThrow(
      "redirect:/field/screening/attempt-public-1?question=OP1_RECLUTADOR&error=Este+estudio+ahora+se+gestiona+en+la+plataforma+V2.+Por+favor+contin%C3%BAe+el+registro+en+V2."
    );

    expect(saveFieldScreeningAnswer).not.toHaveBeenCalled();
  });
});
