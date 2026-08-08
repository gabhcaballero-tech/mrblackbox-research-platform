import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNavigoEvaluationLinkWhatsAppAction } from "@/modules/navigo-app/actions";
import { NavigoEvaluationLinkSendPanel } from "./NavigoEvaluationLinkSendPanel";

vi.mock("@/modules/navigo-app/actions", () => ({
  sendNavigoEvaluationLinkWhatsAppAction: vi.fn()
}));

const mockedSendAction = vi.mocked(sendNavigoEvaluationLinkWhatsAppAction);

describe("NavigoEvaluationLinkSendPanel", () => {
  beforeEach(() => {
    mockedSendAction.mockReset();
  });

  it("changes the button state and shows the sent evaluation link", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        evaluationUrl: "https://example.test/p/token/activities",
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        message: "Enlace de evaluacion enviado por WhatsApp.",
        phone: "+525512345678",
        whatsappError: null,
        whatsappMessageId: "wamid-evaluation-link",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    render(
      <NavigoEvaluationLinkSendPanel
        canSend
        participantId="participant-1"
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de evaluacion al panelista" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Enlace enviado" })).toBeInTheDocument());
    expect(screen.getByText("https://example.test/p/token/activities")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp: Enviado correctamente/)).toBeInTheDocument();
    expect(screen.getByText(/08\/08\/26/)).toBeInTheDocument();
    expect(mockedSendAction).toHaveBeenCalledWith("study-1", "participant-1", "https://example.test");
  });

  it("keeps the link visible for copying when WhatsApp fails", async () => {
    mockedSendAction.mockResolvedValue({
      data: {
        evaluationUrl: "https://example.test/p/token/activities",
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        message: "Enlace generado. WhatsApp fallo; copia el enlace para compartirlo manualmente.",
        phone: "+525512345678",
        whatsappError: "Meta no disponible",
        whatsappMessageId: null,
        whatsappStatus: "ERROR"
      },
      ok: true
    });

    render(
      <NavigoEvaluationLinkSendPanel
        canSend
        participantId="participant-1"
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de evaluacion al panelista" }));

    await waitFor(() => expect(screen.getByText("https://example.test/p/token/activities")).toBeInTheDocument());
    expect(screen.getByText(/WhatsApp: No se pudo enviar/)).toBeInTheDocument();
    expect(screen.getByText("Meta no disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeInTheDocument();
  });

  it("shows an inline error without navigating when the action fails", async () => {
    mockedSendAction.mockResolvedValue({
      message: "El participante no tiene telefono capturado.",
      ok: false
    });

    render(
      <NavigoEvaluationLinkSendPanel
        canSend
        participantId="participant-1"
        requestOrigin="https://example.test"
        studyId="study-1"
        timeZoneIana="America/Mexico_City"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de evaluacion al panelista" }));

    await waitFor(() => expect(screen.getByText("El participante no tiene telefono capturado.")).toBeInTheDocument());
    expect(screen.queryByText("https://example.test/p/token/activities")).not.toBeInTheDocument();
  });
});
