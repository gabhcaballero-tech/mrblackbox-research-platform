import { describe, expect, it } from "vitest";
import { buildSpreadsheetXmlWorkbook } from "./analytic-export";

describe("final analytic export workbook", () => {
  it("creates a two-sheet Excel workbook without legacy report sheets", () => {
    const workbook = buildSpreadsheetXmlWorkbook([
      {
        columns: ["NAV_FOLIO", "NOMBRE", "P1"],
        name: "REPORTE CLT",
        rows: [["NAV-001", "Participante", "1"]]
      },
      {
        columns: ["NAV_FOLIO", "HUT_FOLIO", "HUT_P1A_USO_PERFUME"],
        name: "REPORTE HUT",
        rows: [["NAV-001", "HUT-001", "1"]]
      }
    ]);

    expect(workbook).toContain('ss:Name="REPORTE CLT"');
    expect(workbook).toContain('ss:Name="REPORTE HUT"');
    expect(workbook).not.toContain("REPORTE FILTRO");
    expect(workbook).not.toContain("REPORTE COMPLETO");
    expect(workbook).toContain("NAV-001");
  });
});
