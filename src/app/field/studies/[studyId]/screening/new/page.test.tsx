import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewScreeningPage from "./page";
import { PUBLIC_FIELD_ACTOR } from "@/modules/field/service";

vi.mock("@/modules/field/auth", () => ({
  getFieldActorForRequest: vi.fn(async () => PUBLIC_FIELD_ACTOR)
}));

vi.mock("@/modules/field/repository", () => ({
  createFieldRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/field/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/field/service")>();

  return {
    ...actual,
    getFieldStudy: vi.fn(async () => ({
      data: {
        activeScreenerVersion: {
          definitionHash: "hash",
          definitionJson: {},
          id: "version-1",
          publishedAt: new Date("2026-06-23T10:00:00Z"),
          status: "ACTIVE",
          versionNumber: 1
        },
        code: "FMASCULINA-NAVIGO-2026",
        createdByUserId: "admin-1",
        id: "study-1",
        name: "Fragancia Masculina",
        status: "ACTIVE",
        timeZoneIana: "America/Mexico_City"
      },
      ok: true
    }))
  };
});

vi.mock("../../../../_components/ParticipantStartForm", () => ({
  ParticipantStartForm: ({ studyId }: { studyId: string }) => (
    <div data-testid="participant-start-form">Inicio publico {studyId}</div>
  )
}));

describe("NewScreeningPage public access", () => {
  it("shows the V2 migration message instead of the V1 screening form", async () => {
    render(
      await NewScreeningPage({
        params: Promise.resolve({ studyId: "study-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("Filtro cerrado · Fragancia Masculina")).toBeInTheDocument();
    expect(screen.getByText("Registro migrado a V2")).toBeInTheDocument();
    expect(screen.getByText("Este estudio ahora se gestiona en la plataforma V2. Por favor continúe el registro en V2.")).toBeInTheDocument();
    expect(screen.queryByTestId("participant-start-form")).not.toBeInTheDocument();
    expect(screen.queryByText("Volver al estudio")).not.toBeInTheDocument();
  });

  it("shows a clear unavailable message instead of the generic field error", async () => {
    const { getFieldStudy } = await import("@/modules/field/service");

    vi.mocked(getFieldStudy).mockResolvedValueOnce({
      code: "STUDY_NOT_AVAILABLE",
      message: "El cuestionario no está disponible.",
      ok: false
    });

    render(
      await NewScreeningPage({
        params: Promise.resolve({ studyId: "study-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("El cuestionario no está disponible.")).toBeInTheDocument();
    expect(screen.queryByText("Campo no disponible")).not.toBeInTheDocument();
  });
});
