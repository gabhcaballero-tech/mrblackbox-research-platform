import { describe, expect, it } from "vitest";
import { buildEvidenceReviewPath } from "./evidence-review-navigation";

describe("evidence review navigation", () => {
  it("returns approval success to the final confirmation block", () => {
    expect(
      buildEvidenceReviewPath({
        attemptId: "attempt-1",
        focus: "confirmacion-final",
        key: "evidenceMessage",
        value: "Evidencia aprobada correctamente."
      })
    ).toBe(
      "/admin/screening-attempts/attempt-1?evidenceMessage=Evidencia+aprobada+correctamente.&evidenceFocus=confirmacion-final#confirmacion-final"
    );
  });

  it("returns participant edits to the participant data block", () => {
    expect(
      buildEvidenceReviewPath({
        attemptId: "attempt-1",
        focus: "datos-participante",
        key: "evidenceMessage",
        value: "Datos actualizados"
      })
    ).toContain("#datos-participante");
  });

  it("returns deletion errors to the dangerous cleanup zone", () => {
    const path = buildEvidenceReviewPath({
      attemptId: "attempt-1",
      focus: "zona-peligro",
      key: "evidenceError",
      value: "No se puede eliminar."
    });

    expect(path).toContain("evidenceFocus=zona-peligro");
    expect(path).toContain("#zona-peligro");
  });

  it("returns WhatsApp actions to the WhatsApp block", () => {
    expect(
      buildEvidenceReviewPath({
        attemptId: "attempt-1",
        focus: "whatsapp",
        key: "evidenceMessage",
        value: "Mensaje marcado como enviado."
      })
    ).toContain("#whatsapp");
  });
});
