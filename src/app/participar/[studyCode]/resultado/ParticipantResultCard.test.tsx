import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipantResultCard } from "./ParticipantResultCard";

describe("ParticipantResultCard", () => {
  it("shows approved folio and three codes without raw JSON or internal reasons", () => {
    render(
      <ParticipantResultCard
        result={{
          confirmation: {
            codes: [
              { code: "4821", slot: 1 },
              { code: "7710", slot: 2 },
              { code: "9034", slot: 3 }
            ],
            folio: "NAV-001",
            participantName: "Gabriela"
          },
          kind: "APPROVED",
          message: "Conserva estos códigos. Te serán solicitados durante tu evaluación.",
          showEvidenceLink: false,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByText("NAV-001")).toBeInTheDocument();
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getByText("7710")).toBeInTheDocument();
    expect(screen.getByText("9034")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar datos" })).toBeInTheDocument();
    expect(screen.queryByText(/answerJson|rejectionReason|NO_USUARIO_NAVIGO/)).not.toBeInTheDocument();
  });

  it("shows evidence link when evidence is pending", () => {
    render(
      <ParticipantResultCard
        result={{
          kind: "PENDING_EVIDENCE",
          message: "Completa tus evidencias para continuar con la revisión.",
          showEvidenceLink: true,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Continuar con evidencias" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/evidencias"
    );
  });
});
