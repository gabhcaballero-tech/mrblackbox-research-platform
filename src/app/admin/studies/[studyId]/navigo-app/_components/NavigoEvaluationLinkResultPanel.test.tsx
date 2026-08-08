import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavigoEvaluationLinkResultPanel } from "./NavigoEvaluationLinkResultPanel";

describe("NavigoEvaluationLinkResultPanel", () => {
  it("shows the evaluation link details and copies the link", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, {
      clipboard: { writeText }
    });

    render(
      <NavigoEvaluationLinkResultPanel
        folio="NAV-001"
        generatedAtLabel="08/08/2026 01:45 a.m."
        phone="5512345678"
        url="https://example.test/p/token/activities"
        whatsappStatus="ENVIADO"
      />
    );

    expect(screen.getByText("NAV-001")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
    expect(screen.getByText("https://example.test/p/token/activities")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp: Enviado correctamente/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.test/p/token/activities"));
    expect(screen.getByRole("button", { name: "Enlace copiado" })).toBeInTheDocument();
  });

  it("keeps the copy action visible when WhatsApp fails", () => {
    render(
      <NavigoEvaluationLinkResultPanel
        folio="NAV-001"
        generatedAtLabel="08/08/2026 01:45 a.m."
        phone="5512345678"
        url="https://example.test/p/token/activities"
        whatsappError="Meta no disponible"
        whatsappStatus="ERROR"
      />
    );

    expect(screen.getByText(/WhatsApp: No se pudo enviar/)).toBeInTheDocument();
    expect(screen.getByText("Meta no disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeInTheDocument();
  });
});
