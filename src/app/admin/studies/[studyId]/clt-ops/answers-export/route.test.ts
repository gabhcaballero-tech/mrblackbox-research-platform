import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createCltOperationsRepository = vi.fn();
const buildCltAnswersTsv = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/clt-operations", () => ({
  buildCltAnswersTsv,
  createCltOperationsRepository
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("CLT operations answers export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the CTL answers TSV export", async () => {
    const dashboard = {
      participants: [{ answerGroups: [], folio: "NAV-001", id: "session-1" }],
      study: { code: "FMASCULINA-NAVIGO-2026" }
    };
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    createCltOperationsRepository.mockReturnValue({
      getDashboard: vi.fn().mockResolvedValue(dashboard)
    });
    buildCltAnswersTsv.mockReturnValue({
      body: "\uFEFFFolio\tP1\r\nNAV-001\t1\r\n",
      contentType: "text/tab-separated-values; charset=utf-8",
      filename: "answers.tsv",
      rowCount: 1
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/answers-export"), {
      params: Promise.resolve({ studyId: "study-1" })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(buildCltAnswersTsv).toHaveBeenCalledWith({
      dashboard,
      details: dashboard.participants
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="answers.tsv"');
    expect(await response.text()).toContain("NAV-001");
  });
});
