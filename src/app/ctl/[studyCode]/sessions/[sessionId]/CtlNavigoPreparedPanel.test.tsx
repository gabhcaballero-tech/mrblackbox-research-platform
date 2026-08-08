import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPublicCtlNavigoEvaluationLinkWhatsAppAction } from "@/modules/ctl/public-actions";
import { CtlNavigoPreparedPanel } from "./CtlNavigoPreparedPanel";

vi.mock("@/modules/ctl/public-actions", () => ({
  sendPublicCtlNavigoEvaluationLinkWhatsAppAction: vi.fn()
}));

const sendActionMock = vi.mocked(sendPublicCtlNavigoEvaluationLinkWhatsAppAction);

describe("CtlNavigoPreparedPanel", () => {
  beforeEach(() => {
    sendActionMock.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn()
      }
    });
  });

  it("shows the prepared Navigo block with link, T0 and follow-up times", () => {
    renderPanel();

    expect(screen.getByText("NAVIGO preparado")).toBeInTheDocument();
    expect(screen.getByText("NAV-001")).toBeInTheDocument();
    expect(screen.getByText("08/08/2026 12:30 a.m.")).toBeInTheDocument();
    expect(screen.getByText("08/08/2026 03:30 a.m.")).toBeInTheDocument();
    expect(screen.getByText("https://example.test/p/token-1/activities")).toBeInTheDocument();
  });

  it("copies the visible evaluation link", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.test/p/token-1/activities")
    );
    expect(screen.getByRole("button", { name: "Enlace copiado" })).toBeInTheDocument();
  });

  it("sends the same Navigo evaluation link and changes the button to sent", async () => {
    sendActionMock.mockResolvedValue({
      data: {
        evaluationUrl: "https://example.test/p/token-1/activities",
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        message: "Enlace de evaluacion enviado por WhatsApp.",
        phone: "+525512345678",
        whatsappError: null,
        whatsappMessageId: "wamid-1",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace al panelista" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Enlace enviado" })).toBeInTheDocument());
    expect(sendActionMock).toHaveBeenCalledWith(
      "FMASCULINA-NAVIGO-2026",
      "session-1",
      "https://example.test"
    );
    expect(screen.getByText("WhatsApp: ✓ Enviado correctamente")).toBeInTheDocument();
    expect(screen.getByText("Telefono destino: +525512345678")).toBeInTheDocument();
    expect(screen.getByText("https://example.test/p/token-1/activities")).toBeInTheDocument();
  });

  it("keeps the link available when WhatsApp fails", async () => {
    sendActionMock.mockResolvedValue({
      data: {
        evaluationUrl: "https://example.test/p/token-1/activities",
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

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace al panelista" }));

    await waitFor(() => expect(screen.getByText("Meta no disponible")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeInTheDocument();
    expect(screen.getByText("https://example.test/p/token-1/activities")).toBeInTheDocument();
  });
});

function renderPanel() {
  render(
    <CtlNavigoPreparedPanel
      activities={[
        { availableFromLabel: "08/08/2026 03:30 a.m.", code: "T3_HORAS" },
        { availableFromLabel: "08/08/2026 05:00 a.m.", code: "T4_5_HORAS" },
        { availableFromLabel: "08/08/2026 06:30 a.m.", code: "T6_HORAS" }
      ]}
      evaluationUrl="https://example.test/p/token-1/activities"
      firstSampleKey="247"
      folio="NAV-001"
      requestOrigin="https://example.test"
      secondSampleKey="583"
      sessionId="session-1"
      studyCode="FMASCULINA-NAVIGO-2026"
      t0Label="08/08/2026 12:30 a.m."
    />
  );
}
