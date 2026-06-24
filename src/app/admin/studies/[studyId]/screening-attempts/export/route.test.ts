import { afterEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createScreeningSupervisionRepository = vi.fn();
const exportScreeningAttemptsCsvForStudy = vi.fn();
const notFound = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability
}));

vi.mock("@/modules/screening-supervision/repository", () => ({
  createScreeningSupervisionRepository
}));

vi.mock("@/modules/screening-supervision/export", () => ({
  exportScreeningAttemptsCsvForStudy
}));

vi.mock("next/navigation", () => ({
  notFound
}));

describe("screening attempts export route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a downloadable CSV attachment with the current filters", async () => {
    requireCapability.mockResolvedValue({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    createScreeningSupervisionRepository.mockReturnValue({ kind: "repo" });
    exportScreeningAttemptsCsvForStudy.mockResolvedValue({
      data: {
        contentType: "text/csv; charset=utf-8",
        csv: "\uFEFFColumna A;Columna B\r\nÁRBOL;C TÍPICO\r\n",
        filename: "FMASCULINA-NAVIGO-2026_intentos_screener_2026-06-24.csv",
        rowCount: 1
      },
      ok: true
    });

    const { GET } = await import("./route");
    const request = new Request(
      "https://example.com/admin/studies/study-1/screening-attempts/export?participantQuery=Gabriela&status=PASSED"
    );

    const response = await GET(request, {
      params: Promise.resolve({
        studyId: "study-1"
      })
    });

    expect(requireCapability).toHaveBeenCalledWith("screening:review");
    expect(exportScreeningAttemptsCsvForStudy).toHaveBeenCalledWith({
      actor: { id: "admin-1", role: "ADMIN", status: "ACTIVE" },
      filters: {
        participantQuery: "Gabriela",
        status: "PASSED"
      },
      repository: { kind: "repo" },
      studyId: "study-1"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="FMASCULINA-NAVIGO-2026_intentos_screener_2026-06-24.csv"'
    );

    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const body = await response.text();

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(body).toContain(";");
    expect(body).toContain("ÁRBOL");
  });

  it("returns 403 when the actor cannot export", async () => {
    requireCapability.mockResolvedValue({ id: "user-1", role: "INTERVIEWER", status: "ACTIVE" });
    createScreeningSupervisionRepository.mockReturnValue({ kind: "repo" });
    exportScreeningAttemptsCsvForStudy.mockResolvedValue({
      code: "UNAUTHORIZED",
      message: "No tienes permiso para exportar intentos de screener.",
      ok: false
    });

    const { GET } = await import("./route");
    const request = new Request("https://example.com/admin/studies/study-1/screening-attempts/export");
    const response = await GET(request, {
      params: Promise.resolve({
        studyId: "study-1"
      })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tienes permiso para exportar intentos de screener."
    });
  });
});
