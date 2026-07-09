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
  it("renders the new field screening form without an internal session", async () => {
    render(
      await NewScreeningPage({
        params: Promise.resolve({ studyId: "study-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("Iniciar filtro · Fragancia Masculina")).toBeInTheDocument();
    expect(screen.getByTestId("participant-start-form")).toHaveTextContent("Inicio publico study-1");
    expect(screen.queryByText("Volver al estudio")).not.toBeInTheDocument();
  });
});
