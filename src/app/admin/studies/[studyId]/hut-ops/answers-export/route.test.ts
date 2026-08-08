import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createHutOperationsRepository = vi.fn();
const buildHutAnswersTsv = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/hut-operations", () => ({
  buildHutAnswersTsv,
  createHutOperationsRepository
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("HUT operations answers export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the HUT answers TSV export", async () => {
    const dashboard = {
      participants: [{ answerGroups: [], hutFolio: "HUT-001", id: "hut-1" }],
      study: { code: "FMASCULINA-NAVIGO-2026" }
    };
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    createHutOperationsRepository.mockReturnValue({
      getDashboard: vi.fn().mockResolvedValue(dashboard)
    });
    buildHutAnswersTsv.mockReturnValue({
      body: "\uFEFFFolio HUT\tHUT_PARTICIPO_CLT\r\nHUT-001\tSI\r\n",
      contentType: "text/tab-separated-values; charset=utf-8",
      filename: "hut-answers.tsv",
      rowCount: 1
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/answers-export"), {
      params: Promise.resolve({ studyId: "study-1" })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(buildHutAnswersTsv).toHaveBeenCalledWith({
      dashboard,
      details: dashboard.participants
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="hut-answers.tsv"');
    expect(await response.text()).toContain("HUT-001");
  });
});
