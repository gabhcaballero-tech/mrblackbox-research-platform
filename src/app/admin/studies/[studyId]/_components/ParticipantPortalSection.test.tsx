import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildDefaultParticipantPortalConfig } from "@/modules/participant-portal/admin-service";
import { ParticipantPortalSection } from "./ParticipantPortalSection";

vi.mock("@/modules/participant-portal/admin-actions", () => ({
  saveParticipantPortalConfigAction: vi.fn()
}));

describe("ParticipantPortalSection", () => {
  it("shows the participant portal section for ADMIN study configuration", () => {
    render(
      <ParticipantPortalSection
        data={{
          activeScreenerVersionId: "version-1",
          code: "FMASCULINA-NAVIGO-2026",
          effectiveConfig: buildDefaultParticipantPortalConfig(),
          id: "study-1",
          name: "Fragancia Masculina",
          portalConfig: null,
          status: "ACTIVE"
        }}
        studyId="study-1"
      />
    );

    expect(screen.getByText("Portal de participantes")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Habilitar portal público/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Versión del aviso")).toHaveValue("v1");
    expect(screen.getByLabelText("Prefijo de folio")).toHaveValue("NAV");
    expect(screen.getByText("Se generará al guardar.")).toBeInTheDocument();
  });
});
