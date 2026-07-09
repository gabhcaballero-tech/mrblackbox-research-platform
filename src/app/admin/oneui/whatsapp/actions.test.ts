import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialOneuiWhatsAppReplyActionState } from "./action-state";
import { sendOneuiWhatsAppReplyAction } from "./actions";

const { requireInternalUserMock, revalidatePathMock, sendReplyMock } = vi.hoisted(() => ({
  requireInternalUserMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  sendReplyMock: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args)
}));

vi.mock("@/shared/auth/session", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args)
}));

vi.mock("@/modules/oneui-whatsapp", () => ({
  sendOneuiWhatsAppTextReply: (...args: unknown[]) => sendReplyMock(...args)
}));

describe("sendOneuiWhatsAppReplyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalUserMock.mockResolvedValue({ id: "user-1", role: "ADMIN", status: "ACTIVE" });
  });

  it("no permite enviar texto vacío", async () => {
    const formData = new FormData();
    formData.set("conversationId", "conversation-1");
    formData.set("bodyText", "   ");
    sendReplyMock.mockResolvedValue({
      code: "EMPTY_MESSAGE",
      message: "Escribe una respuesta antes de enviarla.",
      ok: false
    });

    const result = await sendOneuiWhatsAppReplyAction(initialOneuiWhatsAppReplyActionState, formData);

    expect(result).toEqual({
      error: "Escribe una respuesta antes de enviarla.",
      ok: false
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("devuelve error visible si falla Meta", async () => {
    const formData = new FormData();
    formData.set("conversationId", "conversation-1");
    formData.set("bodyText", "Hola");
    sendReplyMock.mockResolvedValue({
      code: "META_API_ERROR",
      message: "Invalid recipient",
      ok: false
    });

    const result = await sendOneuiWhatsAppReplyAction(initialOneuiWhatsAppReplyActionState, formData);

    expect(result).toEqual({
      error: "Invalid recipient",
      ok: false
    });
  });
});
