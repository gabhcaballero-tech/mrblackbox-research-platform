import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldEvidencePage from "./page";
import { getFieldEvidenceScreen, PUBLIC_FIELD_ACTOR } from "@/modules/field/service";

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
    getFieldEvidenceScreen: vi.fn(async () => ({
      data: fieldEvidenceScreen(),
      ok: true
    }))
  };
});

vi.mock("./FieldPerfumeEvidenceStep", () => ({
  FieldPerfumeEvidenceStep: ({ screen }: { screen: { attemptId: string } }) => (
    <div data-testid="field-perfume-evidence-step">Evidencias {screen.attemptId}</div>
  )
}));

describe("Field evidence page", () => {
  it("renders the public field perfume evidence step without an internal session", async () => {
    render(
      await FieldEvidencePage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    );

    expect(screen.getByText("Fragancia Masculina")).toBeInTheDocument();
    expect(screen.getByText("Agrega fotos de las marcas de perfumes que usas para completar la evidencia del filtro.")).toBeInTheDocument();
    expect(screen.getByTestId("field-perfume-evidence-step")).toHaveTextContent("Evidencias attempt-1");
  });

  it("redirects to selfie when perfume photos are opened before selfie", async () => {
    vi.mocked(getFieldEvidenceScreen).mockResolvedValueOnce({
      data: fieldEvidenceScreen({ perfumePhotos: 0, selfie: 0 }),
      ok: true
    });

    await expect(
      FieldEvidencePage({
        params: Promise.resolve({ attemptId: "attempt-1" })
      })
    ).rejects.toThrow("redirect:/field/screening/attempt-1/selfie");
  });
});

function fieldEvidenceScreen(counts = { perfumePhotos: 0, selfie: 1 }) {
  return {
    attemptId: "attempt-1",
    canFinalizeReview: false,
    config: {
      maxImageBytes: 8388608,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1
    },
    counts,
    evidenceComplete: false,
    status: "PASSED" as const,
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina"
    }
  };
}
