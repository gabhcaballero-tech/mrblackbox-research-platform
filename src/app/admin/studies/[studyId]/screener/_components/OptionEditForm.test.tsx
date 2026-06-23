import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenerOption } from "@/modules/screener";
import type { ScreenerOptionActionState } from "@/modules/screener/actions";
import { OptionEditForm } from "./OptionEditForm";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh
  })
}));

vi.mock("@/modules/screener/actions", () => ({
  deleteScreenerOptionAction: vi.fn(),
  moveScreenerOptionAction: vi.fn(),
  updateScreenerOptionAction: vi.fn()
}));

const optionActionTypes = [
  "CONTINUE",
  "TERMINATE",
  "FLAG",
  "PENDING_REVIEW"
] as const;

const baseOption: ScreenerOption = {
  actions: [],
  isOther: false,
  label: "Mujer",
  order: 1,
  otherTextRequired: false,
  value: "MUJER"
};

function renderForm({
  action,
  option = baseOption
}: {
  action?: (
    studyId: string,
    questionId: string,
    optionValue: string,
    formData: FormData
  ) => Promise<ScreenerOptionActionState>;
  option?: ScreenerOption;
} = {}) {
  return render(
    <OptionEditForm
      action={action}
      option={option}
      optionActionTypes={[...optionActionTypes]}
      questionId="q-gender"
      readOnly={false}
      studyId="study-1"
    />
  );
}

function fillTerminateAction() {
  fireEvent.change(screen.getByLabelText(/Acci/), {
    target: { value: "TERMINATE" }
  });
  fireEvent.change(screen.getByLabelText(/digo de acci/i), {
    target: { value: "GENERO_NO_ELEGIBLE" }
  });
  fireEvent.change(screen.getByLabelText(/Motivo/), {
    target: { value: "El estudio está dirigido a hombres." }
  });
}

describe("OptionEditForm", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("rehidrata una acción TERMINATE con código y motivo guardados", () => {
    renderForm({
      option: {
        ...baseOption,
        actions: [
          {
            code: "GENERO_NO_ELEGIBLE",
            reason: "El estudio está dirigido a hombres.",
            type: "TERMINATE"
          }
        ]
      }
    });

    expect(screen.getByLabelText(/Acci/)).toHaveValue("TERMINATE");
    expect(screen.getByRole("option", { name: "Terminar filtro" })).toBeInTheDocument();
    expect(screen.getByLabelText(/digo de acci/i)).toHaveValue("GENERO_NO_ELEGIBLE");
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("El estudio está dirigido a hombres.");
  });

  it("muestra confirmación y conserva los datos actualizados después de guardar", async () => {
    const action = vi.fn(async () => ({
      message: "Opción actualizada correctamente.",
      ok: true
    }));

    renderForm({ action });
    fillTerminateAction();
    fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("Opción actualizada correctamente.");
    expect(screen.getByLabelText(/Acci/)).toHaveValue("TERMINATE");
    expect(screen.getByLabelText(/digo de acci/i)).toHaveValue("GENERO_NO_ELEGIBLE");
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("El estudio está dirigido a hombres.");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("conserva valores escritos si el servidor devuelve error", async () => {
    const action = vi.fn(async () => ({
      fieldErrors: {
        actionReason: ["El motivo es obligatorio."]
      },
      message: "Revisa la opción.",
      ok: false
    }));

    renderForm({ action });
    fillTerminateAction();
    fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa la opción.");
    expect(screen.getByText("El motivo es obligatorio.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Acci/)).toHaveValue("TERMINATE");
    expect(screen.getByLabelText(/digo de acci/i)).toHaveValue("GENERO_NO_ELEGIBLE");
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("El estudio está dirigido a hombres.");
  });

  it("muestra No aplica solo cuando la opción guardada no tiene acción", () => {
    renderForm();

    expect(screen.getByLabelText(/Acci/)).toHaveValue("NONE");
    expect(screen.getByRole("option", { name: "No aplica" })).toBeInTheDocument();
  });
});
