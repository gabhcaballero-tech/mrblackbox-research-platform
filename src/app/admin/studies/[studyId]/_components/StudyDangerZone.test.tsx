import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyDangerZone } from "./StudyDangerZone";

vi.mock("@/modules/studies/actions", () => ({
  archiveStudyAction: vi.fn(),
  deleteEmptyStudyAction: vi.fn()
}));

describe("StudyDangerZone", () => {
  it("shows archive and delete confirmations when the study has no operational data", () => {
    render(
      <StudyDangerZone
        risk={{
          code: "DET-TEST",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          deletionBlockers: [],
          id: "study-1",
          name: "Detergentes prueba",
          status: "DRAFT",
          timeZoneIana: "America/Mexico_City",
          updatedAt: new Date("2026-01-01T10:00:00Z")
        }}
      />
    );

    expect(screen.getByText("Zona de riesgo")).toBeInTheDocument();
    expect(screen.getByLabelText("Escribe ARCHIVAR ESTUDIO para confirmar")).toBeInTheDocument();
    expect(screen.getByLabelText("Escribe ELIMINAR ESTUDIO para confirmar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar estudio de prueba" })).toBeEnabled();
  });

  it("disables hard deletion and explains the blocking relation when the study has data", () => {
    render(
      <StudyDangerZone
        risk={{
          code: "FMASCULINA-NAVIGO-2026",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          deletionBlockers: [
            {
              count: 2,
              key: "screeningAttempts",
              label: "intentos de screener"
            }
          ],
          id: "study-1",
          name: "Fragancia Masculina",
          status: "ACTIVE",
          timeZoneIana: "America/Mexico_City",
          updatedAt: new Date("2026-01-01T10:00:00Z")
        }}
      />
    );

    expect(screen.getByText("intentos de screener:")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar estudio de prueba" })).toBeDisabled();
    expect(screen.getByText(/Para conservar trazabilidad solo puede archivarse/)).toBeInTheDocument();
  });
});
