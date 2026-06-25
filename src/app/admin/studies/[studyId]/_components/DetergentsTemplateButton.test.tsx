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

  it("calls the detergent template endpoint and redirects to the study screener on success", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DetergentsTemplateButton studyId="study-detergents" />);

    fireEvent.click(screen.getByRole("button", { name: "Cargar plantilla de detergentes" }));

    expect(screen.getByRole("button", { name: "Cargando plantilla..." })).toBeDisabled();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/admin/studies/templates/detergents", {
        method: "POST"
      });
    });
    expect(await screen.findByText("Plantilla de detergentes cargada correctamente.")).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/admin/studies/study-detergents/screener");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a safe error when a partial detergent study already has data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          message:
            "Se encontro un estudio parcial relacionado con detergentes, pero ya tiene datos operativos.",
          ok: false
        }),
        ok: false
      }))
    );

    render(<DetergentsTemplateButton studyId="study-detergents" />);

    fireEvent.click(screen.getByRole("button", { name: "Cargar plantilla de detergentes" }));

    expect(
      await screen.findByText(
        "Ya existe un estudio de detergentes con datos registrados. No se actualizó automáticamente para evitar pérdida de información."
      )
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
