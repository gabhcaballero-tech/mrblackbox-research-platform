import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldSelfiePage from "./page";
import { PUBLIC_FIELD_ACTOR } from "@/modules/field/service";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

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
    getFieldSelfieScreen: vi.fn(async () => ({
      data: {
        attemptId: "attempt-1",
        counts: {
          perfumePhotos: 0,
          selfie: 0
        },
        selfieComplete: false,
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina"
        }
      },
      ok: true
    }))
  };
});

vi.mock("./FieldSelfieStep", () => ({
  FieldSelfieStep: ({ screen }: { screen: { attemptId: string } }) => (
    <div data-testid="field-selfie-step">Selfie {screen.attemptId}</div>
  )
}));

describe("Field selfie page", () => {
  it("renders the public field selfie step without an internal session", async () => {
    render(
      await FieldSelfiePage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Fragancia Masculina")).toBeInTheDocument();
    expect(screen.getByText("Toma una selfie final para enviar la participación a revisión.")).toBeInTheDocument();
    expect(screen.getByTestId("field-selfie-step")).toHaveTextContent("Selfie attempt-1");
  });
});
