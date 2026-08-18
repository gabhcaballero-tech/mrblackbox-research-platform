import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const buildFinalAnalyticExport = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/exports", () => ({
  buildFinalAnalyticExport
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("final analytic export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a downloadable two-sheet Excel export", async () => {
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    buildFinalAnalyticExport.mockResolvedValue({
      body: '<Workbook><Worksheet ss:Name="REPORTE CLT"/><Worksheet ss:Name="REPORTE HUT"/></Workbook>',
      contentType: "application/vnd.ms-excel; charset=utf-8",
      filename: "reporte.xls",
      rowCount: { reporteClt: 1, reporteHut: 1 },
      sheets: ["REPORTE CLT", "REPORTE HUT"]
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/analytic-export"), {
      params: Promise.resolve({ studyId: "study-1" })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(buildFinalAnalyticExport).toHaveBeenCalledWith({ studyId: "study-1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="reporte.xls"');
    expect(response.headers.get("Content-Type")).toBe("application/vnd.ms-excel; charset=utf-8");
    expect(await response.text()).toContain("REPORTE CLT");
  });
});
