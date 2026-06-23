import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerOptionActionState } from "@/modules/screener/actions";
import { OptionAddForm } from "./OptionAddForm";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh
  })
}));

vi.mock("@/modules/screener/actions", () => ({
  addScreenerOptionAction: vi.fn()
}));

const optionActionTypes = [
  "CONTINUE",
  "TERMINATE",
  "FLAG",
  "PENDING_REVIEW"
] as const;

function renderForm(
  action: (
    studyId: string,
    questionId: string,
    formData: FormData
  ) => Promise<ScreenerOptionActionState>
) {
  return render(
    <OptionAddForm
      action={action}
      optionActionTypes={[...optionActionTypes]}
      questionId="q-gender"
      readOnly={false}
      studyId="study-1"
    />
  );
}

function fillOption(value: string, label: string) {
  fireEvent.change(screen.getByLabelText(/Valor/), {
    target: { value }
  });
  fireEvent.change(screen.getByLabelText(/Etiqueta/), {
    target: { value: label }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("OptionAddForm", () => {
  it("conserva los valores mientras espera al servidor y limpia solo después de éxito", async () => {
    const save = deferred<ScreenerOptionActionState>();
    const action = vi.fn(() => save.promise);

    renderForm(action);
    fillOption("HOMBRE", "Hombre");
    fireEvent.click(screen.getByRole("button", { name: /Agregar/ }));

    expect(screen.getByLabelText(/Valor/)).toHaveValue("HOMBRE");
    expect(screen.getByLabelText(/Etiqueta/)).toHaveValue("Hombre");

    save.resolve({ message: "La opción se guardó correctamente.", ok: true });

    await waitFor(() => expect(screen.getByLabelText(/Valor/)).toHaveValue(""));
    expect(screen.getByLabelText(/Etiqueta/)).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("conserva los valores y muestra error cuando el servidor rechaza la opción", async () => {
    const action = vi.fn(async () => ({
      fieldErrors: {
        value: ["El valor de opción está duplicado."]
      },
      message: "Revisa la opción.",
      ok: false
    }));

    renderForm(action);
    fillOption("HOMBRE", "Hombre");
    fireEvent.click(screen.getByRole("button", { name: /Agregar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa la opción.");
    expect(screen.getByText("El valor de opción está duplicado.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor/)).toHaveValue("HOMBRE");
    expect(screen.getByLabelText(/Etiqueta/)).toHaveValue("Hombre");
  });
});
