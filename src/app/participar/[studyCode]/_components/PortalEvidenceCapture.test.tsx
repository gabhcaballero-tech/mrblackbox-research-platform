import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalEvidenceCapture } from "./PortalEvidenceCapture";

vi.mock("@/modules/participant-portal/evidence-actions", () => ({
  confirmParticipantEvidenceUploadAction: vi.fn(),
  requestParticipantEvidenceUploadAction: vi.fn()
}));

describe("PortalEvidenceCapture", () => {
  it("uses fallback capture user for selfie", () => {
    render(
      <PortalEvidenceCapture
        buttonLabel="Abrir camara"
        captureFacingMode="user"
        currentCount={0}
        description="Descripcion"
        emptyState="Sin selfie"
        evidenceType="SELFIE_IDENTIFICATION"
        maxCount={1}
        minRequired={1}
        studyCode="FMASCULINA-NAVIGO-2026"
        title="Selfie"
      />
    );

    const input = screen.getByLabelText("Si la camara no se abre, usa este respaldo");
    expect(input).toHaveAttribute("capture", "user");
  });

  it("uses fallback capture environment for perfume photos", () => {
    render(
      <PortalEvidenceCapture
        buttonLabel="Tomar foto del perfume"
        captureFacingMode="environment"
        currentCount={0}
        description="Descripcion"
        emptyState="Sin fotos"
        evidenceType="PERFUME_PHOTO"
        maxCount={5}
        minRequired={1}
        studyCode="FMASCULINA-NAVIGO-2026"
        title="Perfumes"
      />
    );

    const input = screen.getByLabelText("Si la camara no se abre, usa este respaldo");
    expect(input).toHaveAttribute("capture", "environment");
  });
});
