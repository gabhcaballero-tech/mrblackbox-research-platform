import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OneuiWhatsAppPage from "./page";

const { getInboxMock, redirectMock, requireInternalUserMock } = vi.hoisted(() => ({
  getInboxMock: vi.fn(),
  redirectMock: vi.fn(),
  requireInternalUserMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args)
}));

vi.mock("@/shared/auth/session", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args)
}));

vi.mock("@/modules/oneui-whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/modules/oneui-whatsapp")>(
    "@/modules/oneui-whatsapp"
  );

  return {
    ...actual,
    getOneuiWhatsAppInbox: (...args: unknown[]) => getInboxMock(...args)
  };
});

vi.mock("@/shared/ui/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock("@/shared/ui/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}));

vi.mock("@/shared/ui/StatusBadge", () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

describe("OneuiWhatsAppPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalUserMock.mockResolvedValue({ id: "user-1", role: "SUPERVISOR", status: "ACTIVE" });
    getInboxMock.mockResolvedValue({
      data: createInboxData(),
      ok: true
    });
  });

  it("lista conversaciones de ONEUI Research WhatsApp", async () => {
    render(await OneuiWhatsAppPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "ONEUI Research WhatsApp" })).toBeInTheDocument();
    expect(screen.getAllByText("Participante Uno").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5215512345678 / 5215512345678").length).toBeGreaterThan(0);
    expect(screen.getAllByText("General").length).toBeGreaterThan(0);
  });

  it("muestra mensajes de la conversación con estado y raw payload", async () => {
    render(
      await OneuiWhatsAppPage({
        searchParams: Promise.resolve({ conversationId: "conversation-1" })
      })
    );

    expect(screen.getAllByText("Hola, confirmo asistencia").length).toBeGreaterThan(0);
    expect(screen.getByText("Entrante")).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getAllByText("delivered").length).toBeGreaterThan(0);
    expect(screen.getByText("Raw payload")).toBeInTheDocument();
  });

  it("muestra caja de respuesta y no permite enviar vacío", async () => {
    render(await OneuiWhatsAppPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByPlaceholderText("Escribe una respuesta…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar respuesta" })).toBeDisabled();
  });

  it("bloquea respuesta libre cuando la ventana de 24 horas terminó", async () => {
    getInboxMock.mockResolvedValue({
      data: createInboxData({
        lastInboundAt: new Date("2026-07-07T21:00:00.000Z")
      }),
      ok: true
    });

    render(await OneuiWhatsAppPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText(
        "La ventana de atención de 24 horas terminó. Para escribir a este contacto se requiere una plantilla aprobada."
      )
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe una respuesta…")).toBeDisabled();
  });
});

function createInboxData(conversationOverrides: Record<string, unknown> = {}) {
  const conversation = {
    createdAt: new Date("2026-07-08T21:00:00.000Z"),
    id: "conversation-1",
    lastInboundAt: new Date(),
    lastMessageAt: new Date("2026-07-08T21:00:00.000Z"),
    lastOutboundAt: null,
    linkedParticipantId: null,
    linkedStudyId: null,
    phoneNumber: "5215512345678",
    profileName: "Participante Uno",
    sourceModule: "GENERAL" as const,
    updatedAt: new Date("2026-07-08T21:00:00.000Z"),
    waId: "5215512345678",
    ...conversationOverrides
  };
  const message = {
    bodyText: "Hola, confirmo asistencia",
    conversationId: "conversation-1",
    createdAt: new Date("2026-07-08T21:00:00.000Z"),
    direction: "INBOUND" as const,
    fromPhone: "5215512345678",
    id: "message-1",
    messageType: "text",
    metaMessageId: "wamid.inbound-1",
    rawPayload: { object: "whatsapp_business_account" },
    status: "delivered",
    timestamp: new Date("2026-07-08T21:00:00.000Z"),
    toPhone: "5215511303411",
    updatedAt: new Date("2026-07-08T21:00:00.000Z")
  };

  return {
    conversations: [
      {
        ...conversation,
        messages: [message]
      }
    ],
    selectedConversation: {
      ...conversation,
      messages: [message]
    }
  };
}
