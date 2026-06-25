import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetergentsTemplateButton } from "./DetergentsTemplateButton";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh
  })
}));

describe("DetergentsTemplateButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calls the template endpoint and opens the editable screener draft on success", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        data: {
          studyId: "study-detergents"
        },
        ok: true
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DetergentsTemplateButton studyId="fallback-study" />);

    fireEvent.click(screen.getByRole("button", { name: "Cargar plantilla de detergentes" }));

    expect(screen.getByRole("button", { name: "Cargando plantilla..." })).toBeDisabled();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/admin/studies/templates/detergents", {
        method: "POST"
      });
    });
    expect(
      await screen.findByText(
        "Plantilla cargada como borrador editable. Revisa el cuestionario antes de publicarlo."
      )
    ).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/admin/studies/study-detergents/screener");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a safe error when the detergents study already has operational data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          message:
            "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro.",
          ok: false
        }),
        ok: false
      }))
    );

    render(<DetergentsTemplateButton studyId="study-detergents" />);

    fireEvent.click(screen.getByRole("button", { name: "Cargar plantilla de detergentes" }));

    expect(
      await screen.findByText(
        "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro."
      )
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
