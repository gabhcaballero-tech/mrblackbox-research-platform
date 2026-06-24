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
              { code: "A7K4", slot: 1 },
              { code: "M3P9", slot: 2 },
              { code: "T8R2", slot: 3 }
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
    expect(screen.getByText("A7K4")).toBeInTheDocument();
    expect(screen.getByText("M3P9")).toBeInTheDocument();
    expect(screen.getByText("T8R2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar datos" })).toBeInTheDocument();
    expect(screen.queryByText(/answerJson|rejectionReason|NO_USUARIO_NAVIGO/)).not.toBeInTheDocument();
  });

  it("shows selfie link when preliminary eligible evidence is still pending", () => {
    render(
      <ParticipantResultCard
        result={{
          kind: "PENDING_EVIDENCE",
          message: "Toma tu selfie final para enviar tu participación a revisión.",
          showEvidenceLink: true,
          study: {
            code: "FMASCULINA-NAVIGO-2026",
            id: "study-1",
            name: "Fragancia Masculina"
          }
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Continuar con selfie" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/selfie"
    );
  });
});
