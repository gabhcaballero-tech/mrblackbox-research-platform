import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "@/modules/screener";
import { NseGuidedEditor } from "./NseGuidedEditor";

const screenerActions = vi.hoisted(() => ({
  clearScreenerNseAction: vi.fn(),
  saveScreenerNseAction: vi.fn()
}));

vi.mock("@/modules/screener/actions", () => screenerActions);

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
        text: "Escolaridad",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("NseGuidedEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    screenerActions.saveScreenerNseAction.mockResolvedValue({
      message: "NSE guardado correctamente.",
      ok: true
    });
  });

  it("muestra solo preguntas compatibles en el selector", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    const selector = screen.getByRole("combobox");

    expect(within(selector).getByRole("option", { name: "Escolaridad" })).toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: "Frecuencia de uso" })).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "Edad" })).not.toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "Comentario" })).not.toBeInTheDocument();
  });

  it("no permite agregar la misma pregunta dos veces y genera filas por opcion", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    const selector = screen.getByRole("combobox");
    fireEvent.change(selector, { target: { value: "education" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText("Pregunta: Escolaridad")).toBeInTheDocument();
    expect(screen.getByText("Primaria")).toBeInTheDocument();
    expect(screen.getByText("Universidad")).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "Escolaridad" })).not.toBeInTheDocument();
  });

  it("vuelve a mostrar una configuracion guardada en tablas guiadas", () => {
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
    expect(screen.getByLabelText(/C.digo del rango 1/i)).toHaveValue("ALTO");
    expect(screen.getByLabelText(/Etiqueta del rango 1/i)).toHaveValue("Alto");
    expect(screen.getByLabelText(/Puntaje m.nimo del rango 1/i)).toHaveValue(3);
    expect(screen.getByLabelText(/Puntaje m.ximo del rango 1/i)).toHaveValue(10);
    expect(screen.getByRole("checkbox", { name: "Elegible" })).toBeChecked();
  });

  it("muestra estado guardado cuando el borrador ya tiene NSE", () => {
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

    expect(screen.getByText("NSE configurado y guardado")).toBeInTheDocument();
    expect(screen.getByText("Esta configuracion NSE ya esta guardada en el borrador.")).toBeInTheDocument();
  });

  it("muestra mensaje verde y cambia el resumen despues de guardar", async () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);
    prepareValidNse();

    expect(screen.getByText("Configuracion valida para guardar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar NSE" }));

    expect(await screen.findByText("NSE guardado correctamente.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("NSE configurado y guardado")).toBeInTheDocument()
    );
  });

  it("deshabilita el boton mientras guarda y evita doble envio", async () => {
    const save = deferred<{ message: string; ok: boolean }>();
    screenerActions.saveScreenerNseAction.mockReturnValue(save.promise);

    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);
    prepareValidNse();

    fireEvent.click(screen.getByRole("button", { name: "Guardar NSE" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando NSE..." })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardando NSE..." }));

    expect(screenerActions.saveScreenerNseAction).toHaveBeenCalledTimes(1);

    save.resolve({ message: "NSE guardado correctamente.", ok: true });

    expect(await screen.findByText("NSE guardado correctamente.")).toBeInTheDocument();
  });

  it("muestra error y conserva los valores capturados", async () => {
    screenerActions.saveScreenerNseAction.mockResolvedValue({
      message: "No se pudo guardar el NSE. Intenta nuevamente.",
      ok: false
    });

    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);
    prepareValidNse();

    fireEvent.change(screen.getByLabelText("Puntaje para Primaria"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Puntaje para Universidad"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar NSE" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el NSE. Intenta nuevamente.");
    expect(screen.getByLabelText("Puntaje para Primaria")).toHaveValue(4);
    expect(screen.getByLabelText("Puntaje para Universidad")).toHaveValue(8);
    expect(screen.getByText("Configuracion valida para guardar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar NSE" })).toBeEnabled();
  });

  it("no altera la configuracion NSE existente despues de guardar", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Guardar NSE" }));

    expect(await screen.findByText("NSE guardado correctamente.")).toBeInTheDocument();
    expect(screen.getByLabelText("Puntaje para Primaria")).toHaveValue(1);
    expect(screen.getByLabelText("Puntaje para Universidad")).toHaveValue(3);
    expect(screen.getByLabelText(/C.digo del rango 1/i)).toHaveValue("ALTO");
    expect(screen.getByText("NSE configurado y guardado")).toBeInTheDocument();
  });

  it("no muestra sintaxis tecnica como instruccion principal", () => {
    render(<NseGuidedEditor definition={definition()} readOnly={false} studyId="study-1" />);

    expect(screen.getByText(/Selecciona las preguntas que aportan puntaje/)).toBeInTheDocument();
    expect(screen.queryByText(/ID_DE_PREGUNTA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/valor=puntaje/)).not.toBeInTheDocument();
    expect(screen.queryByText(/missing=/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CODIGO\|Etiqueta/)).not.toBeInTheDocument();
  });
});

function prepareValidNse() {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "education" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  fireEvent.change(screen.getByLabelText("Puntaje para Primaria"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Puntaje para Universidad"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar rango" }));
  fireEvent.change(screen.getByLabelText(/C.digo del rango 1/i), { target: { value: "ALTO" } });
  fireEvent.change(screen.getByLabelText(/Etiqueta del rango 1/i), { target: { value: "Alto" } });
  fireEvent.change(screen.getByLabelText(/Puntaje m.nimo del rango 1/i), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText(/Puntaje m.ximo del rango 1/i), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Elegible" }));
}
