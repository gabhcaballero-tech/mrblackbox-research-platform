import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNavigoParticipantLinksWhatsAppAction } from "@/modules/navigo-app/actions";
import { NavigoEvaluationLinkSendPanel } from "./NavigoEvaluationLinkSendPanel";

vi.mock("@/modules/navigo-app/actions", () => ({
  sendNavigoParticipantLinksWhatsAppAction: vi.fn()
}));

const mockedSendAction = vi.mocked(sendNavigoParticipantLinksWhatsAppAction);

describe("NavigoEvaluationLinkSendPanel", () => {
  beforeEach(() => {
    mockedSendAction.mockReset();
  });

  it("changes the button state and shows the sent Navigo link", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: null,
        message: "Enlace Navigo enviado por WhatsApp.",
        navigoUrl: "https://example.test/p/token/activities",
        phone: "+525512345678",
        requestedLinkType: "NAVIGO",
        sentLinkType: "NAVIGO",
        warnings: [],
        whatsappError: null,
        whatsappMessageId: "wamid-evaluation-link",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace Navigo" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar enlace Navigo" })).toBeInTheDocument());
    expect(screen.getByText("https://example.test/p/token/activities")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp: Enviado correctamente/)).toBeInTheDocument();
    expect(screen.getByText("08/08/2026, 01:45 hrs CDMX")).toBeInTheDocument();
    expect(mockedSendAction).toHaveBeenCalledWith("study-1", "participant-1", "https://example.test", "NAVIGO");
  });

  it("sends the HUT link and keeps it visible for copying", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: "https://example.test/hut/p/hut-token",
        message: "Enlace HUT enviado por WhatsApp.",
        navigoUrl: "https://example.test/p/token/activities",
        phone: "+525512345678",
        requestedLinkType: "HUT",
        sentLinkType: "HUT",
        warnings: [],
        whatsappError: null,
        whatsappMessageId: "wamid-hut-link",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace HUT" }));

    await waitFor(() => expect(screen.getByText("https://example.test/hut/p/hut-token")).toBeInTheDocument());
    expect(screen.getByText("Enlace fotografico HUT")).toBeInTheDocument();
    expect(mockedSendAction).toHaveBeenCalledWith("study-1", "participant-1", "https://example.test", "HUT");
  });

  it("shows warnings when combined sending falls back to a single available link", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: null,
        message: "Enlace Navigo enviado por WhatsApp.",
        navigoUrl: "https://example.test/p/token/activities",
        phone: "+525512345678",
        requestedLinkType: "BOTH",
        sentLinkType: "NAVIGO",
        warnings: ["Se enviara solo Navigo porque falta enlace HUT."],
        whatsappError: null,
        whatsappMessageId: "wamid-navigo-only",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar ambos enlaces" }));

    await waitFor(() => expect(screen.getByText("Se enviara solo Navigo porque falta enlace HUT.")).toBeInTheDocument());
  });

  it("shows an inline error without navigating when the action fails", async () => {
    mockedSendAction.mockResolvedValue({
      message: "El participante no tiene telefono capturado.",
      ok: false
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace Navigo" }));

    await waitFor(() => expect(screen.getByText("El participante no tiene telefono capturado.")).toBeInTheDocument());
    expect(screen.queryByText("https://example.test/p/token/activities")).not.toBeInTheDocument();
  });
});

function renderPanel() {
  render(
    <NavigoEvaluationLinkSendPanel
      canSend
      participantId="participant-1"
      requestOrigin="https://example.test"
      studyId="study-1"
      timeZoneIana="America/Mexico_City"
    />
  );
}
