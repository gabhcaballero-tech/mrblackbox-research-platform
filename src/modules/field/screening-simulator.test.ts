import { describe, expect, it } from "vitest";
import {
  formatFieldScreeningSimulationReport,
  runFieldScreeningSimulation,
  simulateAbandonAndResume,
  simulateEligibleParticipant,
  simulateF6IncompleteEvidence,
  simulateHutNavigoFlag,
  simulateTermination
} from "./screening-simulator";

describe("field screening simulator", () => {
  it("runs all required field screening scenarios without production data", async () => {
    const report = await runFieldScreeningSimulation();

    expect(report.simulationMode).toBe(true);
    expect(report.cases.map((item) => item.caseId)).toEqual([
      "ELIGIBLE_PARTICIPANT",
      "F6_INCOMPLETE_EVIDENCE",
      "ABANDON_AND_RESUME",
      "TERMINATION",
      "HUT_DECISION_OUTSIDE_SCREENING"
    ]);
    expect(report.cases.every((item) => item.result === "OK")).toBe(true);
  });

  it("creates an eligible field attempt with folio and three reference codes", async () => {
    const result = await simulateEligibleParticipant();

    expect(result).toMatchObject({
      caseId: "ELIGIBLE_PARTICIPANT",
      codeGenerated: true,
      evidence: "COMPLETE",
      result: "OK",
      state: "PASSED"
    });
    expect(result.folio).toMatch(/^SIM-\d{3}$/);
    expect(result.notes).toContain("Codigos 1,2,3 generados: SI");
  });

  it("keeps F6 pending when perfume evidence is incomplete and allows retry", async () => {
    const result = await simulateF6IncompleteEvidence();

    expect(result).toMatchObject({
      caseId: "F6_INCOMPLETE_EVIDENCE",
      evidence: "INCOMPLETE",
      result: "OK",
      state: "INCOMPLETE"
    });
    expect(result.notes).toContain("Continuar sin foto fue bloqueado: SI");
    expect(result.notes).toContain("F6 permanecio pendiente: SI");
    expect(result.notes).toContain("Reintento despues de evidencia valida permitido: SI");
  });

  it("resumes the same open field attempt without creating a duplicate", async () => {
    const result = await simulateAbandonAndResume();

    expect(result).toMatchObject({
      caseId: "ABANDON_AND_RESUME",
      result: "OK",
      state: "INCOMPLETE"
    });
    expect(result.notes).toContain("Mismo intento disponible: SI");
    expect(result.notes).toContain("Pregunta pendiente al reanudar: F2_EDAD");
    expect(result.notes).toContain("Intentos creados: 1");
  });

  it("terminates with code, reason, and closure diagnostics", async () => {
    const result = await simulateTermination();

    expect(result).toMatchObject({
      caseId: "TERMINATION",
      result: "OK",
      state: "TERMINATED"
    });
    expect(result.notes).toContain("terminationCode: GENERO_NO_ELEGIBLE");
    expect(result.notes).toContain("closureDiagnostics: TERMINATED");
  });

  it("keeps the HUT decision outside screening", async () => {
    const result = await simulateHutNavigoFlag();

    expect(result).toMatchObject({
      caseId: "HUT_DECISION_OUTSIDE_SCREENING",
      evidence: "COMPLETE",
      result: "OK",
      state: "PASSED"
    });
    expect(result.notes).toContain("Pregunta HUT legacy en screener: NO");
    expect(result.notes).toContain("Decision HUT fuera del screening: SI");
  });

  it("formats the simulator report with requested operational fields", async () => {
    const report = await runFieldScreeningSimulation();
    const formatted = formatFieldScreeningSimulationReport(report);

    expect(formatted).toContain("Caso: ELIGIBLE_PARTICIPANT");
    expect(formatted).toContain("Resultado: OK");
    expect(formatted).toContain("Estado: PASSED");
    expect(formatted).toContain("Evidencia: COMPLETE");
    expect(formatted).toContain("Folio: SIM-001");
    expect(formatted).toContain("Codigo generado: SI");
  });
});
