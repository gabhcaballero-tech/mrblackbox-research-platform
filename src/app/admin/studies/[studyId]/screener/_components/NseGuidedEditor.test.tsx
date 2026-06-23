import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "@/modules/screener";
import { NseGuidedEditor } from "./NseGuidedEditor";

vi.mock("@/modules/screener/actions", () => ({
  clearScreenerNseAction: vi.fn(),
  saveScreenerNseAction: vi.fn()
}));

function definition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "education",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Primaria",
            order: 1,
            otherTextRequired: false,
            value: "primary"
          },
          {
            actions: [],
            isOther: false,
            label: "Universidad",
            order: 2,
            otherTextRequired: false,
            value: "university"
          }
        ],
        order: 1,
        required: true,
        text: "¿Cuál es el nivel de escolaridad?",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "usage",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Diario",
            order: 1,
            otherTextRequired: false,
            value: "daily"
          }
        ],
        order: 2,
        required: true,
        text: "Frecuencia de uso",
        type: "MULTIPLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "age",
        order: 3,
        required: true,
        text: "Edad",
        type: "INTEGER",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "comment",
        order: 4,
        required: false,
        text: "Comentario",
        type: "LONG_TEXT",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro",
    ...overrides
  });
}

describe("NseGuidedEditor", () => {
  it("muestra solo preguntas compatibles en el selector", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    const selector = screen.getByRole("combobox");

    expect(within(selector).getByRole("option", { name: "¿Cuál es el nivel de escolaridad?" })).toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: "Frecuencia de uso" })).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "Edad" })).not.toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "Comentario" })).not.toBeInTheDocument();
  });

  it("no permite agregar la misma pregunta dos veces y genera filas por opción", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    const selector = screen.getByRole("combobox");
    fireEvent.change(selector, { target: { value: "education" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText('Pregunta: ¿Cuál es el nivel de escolaridad?')).toBeInTheDocument();
    expect(screen.getByText("Primaria")).toBeInTheDocument();
    expect(screen.getByText("Universidad")).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "¿Cuál es el nivel de escolaridad?" })).not.toBeInTheDocument();
  });

  it("vuelve a mostrar una configuración guardada en tablas guiadas", () => {
    render(
      <NseGuidedEditor
        definition={definition({
          nse: {
            code: "nse",
            inputs: [
              {
                missingScore: 0,
                questionId: "education",
                scoreByAnswer: {
                  primary: 1,
                  university: 3
                }
              }
            ],
            label: "Nivel NSE",
            ranges: [{ code: "ALTO", eligible: true, label: "Alto", max: 10, min: 3 }],
            type: "score_table"
          }
        })}
        readOnly={false}
        studyId="study-1"
      />
    );

    expect(screen.getByLabelText("Puntaje para Primaria")).toHaveValue(1);
    expect(screen.getByLabelText("Puntaje para Universidad")).toHaveValue(3);
    expect(screen.getByLabelText("Código del rango 1")).toHaveValue("ALTO");
    expect(screen.getByLabelText("Etiqueta del rango 1")).toHaveValue("Alto");
    expect(screen.getByLabelText("Puntaje mínimo del rango 1")).toHaveValue(3);
    expect(screen.getByLabelText("Puntaje máximo del rango 1")).toHaveValue(10);
    expect(screen.getByRole("checkbox", { name: "Elegible" })).toBeChecked();
  });

  it("no muestra sintaxis técnica como instrucción principal", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    expect(screen.getByText(/Selecciona las preguntas que aportan puntaje/)).toBeInTheDocument();
    expect(screen.queryByText(/ID_DE_PREGUNTA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/valor=puntaje/)).not.toBeInTheDocument();
    expect(screen.queryByText(/missing=/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CODIGO\|Etiqueta/)).not.toBeInTheDocument();
  });
});
