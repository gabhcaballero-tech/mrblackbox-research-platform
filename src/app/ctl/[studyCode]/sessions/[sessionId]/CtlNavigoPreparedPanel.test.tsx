import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPublicCtlParticipantLinksWhatsAppAction } from "@/modules/ctl/public-actions";
import { CtlNavigoPreparedPanel } from "./CtlNavigoPreparedPanel";

vi.mock("@/modules/ctl/public-actions", () => ({
  sendPublicCtlParticipantLinksWhatsAppAction: vi.fn()
}));

const sendActionMock = vi.mocked(sendPublicCtlParticipantLinksWhatsAppAction);

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
    expect(screen.getByRole("button", { name: "Enviar enlace Navigo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar enlace HUT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar ambos enlaces" })).toBeInTheDocument();
  });

  it("copies the visible evaluation link", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.test/p/token-1/activities")
    );
    expect(screen.getByRole("button", { name: "Enlace copiado" })).toBeInTheDocument();
  });

  it("sends Navigo link and changes the button to resend", async () => {
    sendActionMock.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: null,
        message: "Enlace Navigo enviado por WhatsApp.",
        navigoUrl: "https://example.test/p/token-1/activities",
        phone: "+525512345678",
        requestedLinkType: "NAVIGO",
        sentLinkType: "NAVIGO",
        warnings: [],
        whatsappError: null,
        whatsappMessageId: "wamid-1",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace Navigo" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar enlace Navigo" })).toBeInTheDocument());
    expect(sendActionMock).toHaveBeenCalledWith(
      "FMASCULINA-NAVIGO-2026",
      "session-1",
      "https://example.test",
      "NAVIGO"
    );
    expect(screen.getByText("WhatsApp: Enviado correctamente")).toBeInTheDocument();
    expect(screen.getByText("Telefono destino: +525512345678")).toBeInTheDocument();
  });

  it("sends HUT link and displays it for backup", async () => {
    sendActionMock.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: "https://example.test/hut/p/hut-token",
        message: "Enlace HUT enviado por WhatsApp.",
        navigoUrl: "https://example.test/p/token-1/activities",
        phone: "+525512345678",
        requestedLinkType: "HUT",
        sentLinkType: "HUT",
        warnings: [],
        whatsappError: null,
        whatsappMessageId: "wamid-hut",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace HUT" }));

    await waitFor(() => expect(screen.getByText("https://example.test/hut/p/hut-token")).toBeInTheDocument());
    expect(sendActionMock).toHaveBeenCalledWith(
      "FMASCULINA-NAVIGO-2026",
      "session-1",
      "https://example.test",
      "HUT"
    );
  });

  it("keeps available links visible when WhatsApp fails", async () => {
    sendActionMock.mockResolvedValue({
      data: {
        folio: "NAV-001",
        generatedAtIso: "2026-08-08T07:45:00.000Z",
        hutUrl: "https://example.test/hut/p/hut-token",
        message: "Enlace preparado. WhatsApp fallo; copia el enlace disponible para compartirlo manualmente.",
        navigoUrl: "https://example.test/p/token-1/activities",
        phone: "+525512345678",
        requestedLinkType: "BOTH",
        sentLinkType: "BOTH",
        warnings: [],
        whatsappError: "Meta no disponible",
        whatsappMessageId: null,
        whatsappStatus: "ERROR"
      },
      ok: true
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Enviar ambos enlaces" }));

    await waitFor(() => expect(screen.getByText("Meta no disponible")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Copiar enlace" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("https://example.test/p/token-1/activities")).toBeInTheDocument();
    expect(screen.getByText("https://example.test/hut/p/hut-token")).toBeInTheDocument();
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
