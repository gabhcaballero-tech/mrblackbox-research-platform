import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { processWebhookMock } = vi.hoisted(() => ({
  processWebhookMock: vi.fn()
}));

vi.mock("@/modules/oneui-whatsapp", () => ({
  processOneuiWhatsAppWebhookPayload: (...args: unknown[]) => processWebhookMock(...args)
}));

describe("WhatsApp webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-secret";
  });

  it("devuelve el challenge cuando el verify token es correcto", async () => {
    const response = await GET(
      new NextRequest(
        "https://research.oneui.com.mx/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=abc123"
      )
    );

    await expect(response.text()).resolves.toBe("abc123");
    expect(response.status).toBe(200);
  });

  it("devuelve 403 cuando el verify token es incorrecto", async () => {
    const response = await GET(
      new NextRequest(
        "https://research.oneui.com.mx/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123"
      )
    );

    expect(response.status).toBe(403);
  });

  it("procesa POST y responde 200 sin exponer tokens en logs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.WHATSAPP_ACCESS_TOKEN = "access-token-that-must-not-appear";
    processWebhookMock.mockRejectedValue(new Error(process.env.WHATSAPP_ACCESS_TOKEN));

    const response = await POST(
      new NextRequest("https://research.oneui.com.mx/api/whatsapp/webhook", {
        body: JSON.stringify({ entry: [] }),
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to process WhatsApp webhook payload.");
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(process.env.WHATSAPP_ACCESS_TOKEN);

    consoleErrorSpy.mockRestore();
  });
});
