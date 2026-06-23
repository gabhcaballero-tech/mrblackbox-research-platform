import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "@/modules/screener";
import { RuleGuidedForm } from "./RuleGuidedForm";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  refresh: vi.fn(),
  update: vi.fn()
}));

vi.mock("@/modules/screener/actions", () => ({
  addScreenerRuleAction: mocks.add,
  deleteScreenerRuleAction: mocks.delete,
  updateScreenerRuleAction: mocks.update
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh
  })
}));

function definition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "F1_MARCA",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Opción A",
            order: 1,
            otherTextRequired: false,
            value: "option-a"
          },
          {
            actions: [],
            isOther: false,
            label: "Opción B",
            order: 2,
            otherTextRequired: false,
            value: "option-b"
          }
        ],
        order: 1,
        required: true,
        text: "Marca usada",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F2_EDAD",
        order: 2,
        required: true,
        text: "¿Me podría decir cuál es su edad exacta?",
        type: "INTEGER",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F3_USO",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Diario",
            order: 1,
            otherTextRequired: false,
            value: "daily"
          },
          {
            actions: [],
            isOther: false,
            label: "Semanal",
            order: 2,
            otherTextRequired: false,
            value: "weekly"
          }
        ],
        order: 3,
        required: true,
        text: "Frecuencia de uso",
        type: "MULTIPLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F4_COMENTARIO",
        order: 4,
        required: false,
        text: "Comentario breve",
        type: "SHORT_TEXT",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro",
    ...overrides
  });
}

function renderRules(currentDefinition = definition()) {
  render(<RuleGuidedForm definition={currentDefinition} readOnly={false} studyId="study-1" />);
}

function textIncludes(...parts: string[]) {
  return (_content: string, element: Element | null) => {
    const text = element?.textContent ?? "";
    return element?.tagName === "P" && parts.every((part) => text.includes(part));
  };
}

describe("RuleGuidedForm", () => {
  beforeEach(() => {
    mocks.add.mockReset();
    mocks.delete.mockReset();
    mocks.refresh.mockReset();
    mocks.update.mockReset();
    mocks.add.mockResolvedValue({ message: "Regla guardada correctamente.", ok: true });
    mocks.update.mockResolvedValue({ message: "Regla actualizada correctamente.", ok: true });
  });

  it("muestra el resumen completo de una regla de rango de edad existente", () => {
    renderRules(
      definition({
        rules: [
          {
            condition: {
              max: 19,
              min: 0,
              questionId: "F2_EDAD",
              type: "NUMBER_RANGE"
            },
            id: "EDAD_MENOR_20",
            order: 1,
            outcome: {
              code: "EDAD_MENOR_20",
              reason: "La edad es menor a 20 años.",
              type: "TERMINATE"
            }
          }
        ]
      })
    );

    expect(screen.getAllByText("EDAD_MENOR_20").length).toBeGreaterThan(0);
    expect(screen.getByText(textIncludes("Pregunta:", "¿Me podría decir cuál es su edad exacta?", "F2_EDAD"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Condición:", "El número está dentro del rango", "0 a 19"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Resultado:", "Terminar filtro"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Código:", "EDAD_MENOR_20"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Motivo:", "La edad es menor a 20 años."))).toBeInTheDocument();
  });

  it("muestra el resumen completo de una regla de selección", () => {
    renderRules(
      definition({
        rules: [
          {
            condition: {
              questionId: "F3_USO",
              type: "ANY_SELECTED",
              values: ["daily", "weekly"]
            },
            id: "USO_REVISAR",
            order: 1,
            outcome: {
              code: "USO_REVISAR",
              requiresReview: true,
              type: "FLAG"
            }
          }
        ]
      })
    );

    expect(screen.getAllByText("USO_REVISAR").length).toBeGreaterThan(0);
    expect(screen.getByText(textIncludes("Pregunta:", "Frecuencia de uso", "F3_USO"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Condición:", "Se seleccionó cualquiera", "Diario", "Semanal"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Resultado:", "Marcar para revisión"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Código:", "USO_REVISAR"))).toBeInTheDocument();
    expect(screen.getByText(textIncludes("Revisión:", "La bandera requiere revisión"))).toBeInTheDocument();
  });

  it("edita una regla existente sin crear una regla duplicada", async () => {
    renderRules(
      definition({
        rules: [
          {
            condition: { max: 17, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
            id: "EDAD_MENOR_20",
            order: 1,
            outcome: {
              code: "EDAD_MENOR_20",
              reason: "Edad menor.",
              type: "TERMINATE"
            }
          }
        ]
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar regla" }));
    fireEvent.change(screen.getByLabelText(/Máximo/), { target: { value: "19" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: "La edad es menor a 20 años." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][1]).toBe("EDAD_MENOR_20");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("muestra confirmación al guardar cambios", async () => {
    renderRules(
      definition({
        rules: [
          {
            condition: { max: 17, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
            id: "EDAD_MENOR_20",
            order: 1,
            outcome: {
              code: "EDAD_MENOR_20",
              reason: "Edad menor.",
              type: "TERMINATE"
            }
          }
        ]
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar regla" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Regla actualizada correctamente.");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("conserva valores escritos cuando el servidor devuelve error", async () => {
    mocks.update.mockResolvedValue({
      message: "No se pudo actualizar la regla.",
      ok: false
    });
    renderRules(
      definition({
        rules: [
          {
            condition: { max: 17, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
            id: "EDAD_MENOR_20",
            order: 1,
            outcome: {
              code: "EDAD_MENOR_20",
              reason: "Edad menor.",
              type: "TERMINATE"
            }
          }
        ]
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar regla" }));
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: "La edad es menor a 20 años." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar la regla.");
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("La edad es menor a 20 años.");
  });

  it("muestra solo mínimo y máximo para condición de rango", () => {
    renderRules();

    fireEvent.change(screen.getByLabelText(/Condición/), {
      target: { value: "NUMBER_RANGE" }
    });

    expect(screen.getByLabelText(/Mínimo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Máximo/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument();
    expect(screen.queryByText("Valores")).not.toBeInTheDocument();
  });

  it("muestra solo valor para condición de igualdad", () => {
    renderRules();

    expect(screen.getByLabelText("Valor")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mínimo/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Máximo/)).not.toBeInTheDocument();
    expect(screen.queryByText("Valores")).not.toBeInTheDocument();
  });

  it("muestra controles de revisión solo cuando corresponden", () => {
    renderRules();

    expect(screen.queryByLabelText("La bandera requiere revisión")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Resultado/), {
      target: { value: "FLAG" }
    });
    expect(screen.getByLabelText("La bandera requiere revisión")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Resultado/), {
      target: { value: "PENDING_REVIEW" }
    });
    expect(screen.queryByLabelText("La bandera requiere revisión")).not.toBeInTheDocument();
  });

  it("rechaza una combinación incompatible de pregunta y condición en el formulario", () => {
    renderRules(
      definition({
        questions: [
          {
            dataDestination: "SCREENING",
            id: "F1_TEXTO",
            order: 1,
            required: true,
            text: "Texto libre",
            type: "SHORT_TEXT",
            validation: {}
          }
        ]
      })
    );

    fireEvent.change(screen.getByLabelText(/Condición/), {
      target: { value: "NUMBER_RANGE" }
    });
    expect(screen.getByText(/No hay preguntas compatibles para reglas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar regla" })).toBeDisabled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("usa opciones existentes por etiqueta visible y conserva valores técnicos ocultos", () => {
    const { container } = render(<RuleGuidedForm definition={definition()} readOnly={false} studyId="study-1" />);

    fireEvent.change(screen.getByLabelText(/Condición/), {
      target: { value: "ANY_SELECTED" }
    });
    fireEvent.click(screen.getByLabelText("Diario"));

    expect(screen.getByLabelText("Diario")).toBeChecked();
    expect(container.querySelector<HTMLInputElement>('input[name="values"]')?.value).toBe("daily");
  });

  it("no muestra enums técnicos crudos en la interfaz principal", () => {
    renderRules();

    expect(screen.getByRole("option", { name: "La respuesta es igual a" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Terminar filtro" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "ANSWER_EQUALS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "TERMINATE" })).not.toBeInTheDocument();
  });
});
