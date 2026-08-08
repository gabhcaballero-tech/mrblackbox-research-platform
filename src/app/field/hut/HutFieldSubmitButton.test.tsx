import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFormStatus } from "react-dom";
import { HutFieldSubmitButton } from "./HutFieldSubmitButton";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: vi.fn()
  };
});

describe("HutFieldSubmitButton", () => {
  it("muestra estado de guardado y bloquea doble clic", () => {
    vi.mocked(useFormStatus).mockReturnValue({
      action: "/field/hut",
      data: new FormData(),
      method: "post",
      pending: true
    } as ReturnType<typeof useFormStatus>);

    render(<HutFieldSubmitButton />);

    expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled();
  });

  it("muestra accion normal cuando no esta guardando", () => {
    vi.mocked(useFormStatus).mockReturnValue({
      action: null,
      data: null,
      method: null,
      pending: false
    } as ReturnType<typeof useFormStatus>);

    render(<HutFieldSubmitButton />);

    expect(screen.getByRole("button", { name: "Guardar respuesta" })).toBeEnabled();
  });
});
