import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createHutOperationsRepository = vi.fn();
const buildHutOperationsTsv = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/hut-operations", () => ({
  buildHutOperationsTsv,
  createHutOperationsRepository
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("HUT operations export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the operational HUT TSV export", async () => {
    const dashboard = { participants: [], study: { code: "FMASCULINA-NAVIGO-2026" } };
    const getDashboard = vi.fn().mockResolvedValue(dashboard);
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    createHutOperationsRepository.mockReturnValue({ getDashboard });
    buildHutOperationsTsv.mockReturnValue({
      body: "\uFEFFFolio HUT\tParticipante\r\nHUT-001\tAna\r\n",
      contentType: "text/tab-separated-values; charset=utf-8",
      filename: "hut-ops.tsv",
      rowCount: 1
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/export"), {
      params: Promise.resolve({ studyId: "study-1" })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(getDashboard).toHaveBeenCalledWith({ studyId: "study-1" });
    expect(buildHutOperationsTsv).toHaveBeenCalledWith({ dashboard });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="hut-ops.tsv"');
    expect(await response.text()).toContain("HUT-001");
  });
});
