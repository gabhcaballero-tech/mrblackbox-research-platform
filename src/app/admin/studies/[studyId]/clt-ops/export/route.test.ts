import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createCltOperationsRepository = vi.fn();
const buildCltOperationsTsv = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/clt-operations", () => ({
  buildCltOperationsTsv,
  createCltOperationsRepository
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("CLT operations export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the operational TSV export", async () => {
    const dashboard = { participants: [], study: { code: "FMASCULINA-NAVIGO-2026" } };
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    createCltOperationsRepository.mockReturnValue({
      getDashboard: vi.fn().mockResolvedValue(dashboard)
    });
    buildCltOperationsTsv.mockReturnValue({
      body: "\uFEFFFolio\tParticipante\r\nNAV-001\tAna\r\n",
      contentType: "text/tab-separated-values; charset=utf-8",
      filename: "ops.tsv",
      rowCount: 1
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/export"), {
      params: Promise.resolve({ studyId: "study-1" })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(createCltOperationsRepository().getDashboard).toHaveBeenCalledWith({ studyId: "study-1" });
    expect(buildCltOperationsTsv).toHaveBeenCalledWith({ dashboard });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="ops.tsv"');
    expect(await response.text()).toContain("NAV-001");
  });
});
