import { describe, expect, it } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "./definition";
import {
  createNseEditorState,
  createNseInputFromQuestion,
  getNseCompatibleQuestions,
  serializeNseInputsForCompatibility,
  serializeNseRangesForCompatibility,
  validateNseEditorState,
  type NseEditorState
} from "./nse-editor";

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
        id: "brands",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Marca A",
            order: 1,
            otherTextRequired: false,
            value: "brand-a"
          }
        ],
        order: 2,
        required: true,
        text: "Marcas usadas",
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
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro",
    ...overrides
  });
}

function validState(overrides: Partial<NseEditorState> = {}): NseEditorState {
  return {
    code: "nse",
    inputs: [
      {
        missingScore: "0",
        questionId: "education",
        questionText: "¿Cuál es el nivel de escolaridad?",
        rows: [
          { label: "Primaria", score: "1", value: "primary" },
          { label: "Universidad", score: "3", value: "university" }
        ]
      }
    ],
    label: "NSE",
    ranges: [
      { code: "BAJO", eligible: false, label: "Bajo", max: "2", min: "0" },
      { code: "ALTO", eligible: true, label: "Alto", max: "10", min: "3" }
    ],
    ...overrides
  };
}

describe("nse guided editor helpers", () => {
  it("solo expone preguntas compatibles para el selector", () => {
    const questions = getNseCompatibleQuestions(definition());

    expect(questions.map((question) => question.id)).toEqual(["education", "brands"]);
  });

  it("crea filas de puntaje desde las opciones de una pregunta", () => {
    const [question] = getNseCompatibleQuestions(definition());
    const input = createNseInputFromQuestion(question!);

    expect(input).toMatchObject({
      missingScore: "0",
      questionId: "education",
      rows: [
        { label: "Primaria", score: "", value: "primary" },
        { label: "Universidad", score: "", value: "university" }
      ]
    });
  });

  it("serializa puntajes al formato compatible con la definición actual", () => {
    const state = validState();

    expect(serializeNseInputsForCompatibility(state.inputs)).toBe(
      "education|primary=1,university=3|missing=0"
    );
    expect(serializeNseRangesForCompatibility(state.ranges)).toBe(
      "BAJO|Bajo|0|2|false\nALTO|Alto|3|10|true"
    );
  });

  it("rechaza preguntas duplicadas", () => {
    const state = validState({
      inputs: [...validState().inputs, validState().inputs[0]!]
    });

    expect(validateNseEditorState(state).errors).toContain(
      "Cada pregunta puede agregarse una sola vez."
    );
  });

  it("rechaza rangos traslapados", () => {
    const state = validState({
      ranges: [
        { code: "A", eligible: true, label: "A", max: "5", min: "0" },
        { code: "B", eligible: false, label: "B", max: "8", min: "5" }
      ]
    });

    expect(validateNseEditorState(state).errors).toContain("Los rangos NSE no pueden traslaparse.");
  });

  it("rechaza códigos de rango duplicados", () => {
    const state = validState({
      ranges: [
        { code: "A", eligible: true, label: "A", max: "2", min: "0" },
        { code: "A", eligible: false, label: "B", max: "5", min: "3" }
      ]
    });

    expect(validateNseEditorState(state).errors).toContain(
      "No puede haber dos rangos con el mismo código."
    );
  });

  it("rechaza mínimo mayor que máximo", () => {
    const state = validState({
      ranges: [{ code: "A", eligible: true, label: "A", max: "1", min: "3" }]
    });

    expect(validateNseEditorState(state).errors).toContain(
      "El puntaje mínimo no puede ser mayor que el puntaje máximo."
    );
  });

  it("refleja rangos elegibles y detecta huecos sin bloquear por ese motivo", () => {
    const state = validState({
      ranges: [
        { code: "A", eligible: false, label: "A", max: "1", min: "0" },
        { code: "B", eligible: true, label: "B", max: "5", min: "3" }
      ]
    });
    const validation = validateNseEditorState(state);

    expect(validation.eligibleRanges).toBe(1);
    expect(validation.warnings).toContain("Hay huecos entre rangos NSE. Revisa si esto es intencional.");
    expect(validation.ready).toBe(true);
  });

  it("vuelve a mostrar una configuración guardada en el editor guiado", () => {
    const state = createNseEditorState(
      definition({
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
      })
    );

    expect(state.inputs[0]).toMatchObject({
      missingScore: "0",
      questionId: "education",
      rows: [
        { label: "Primaria", score: "1", value: "primary" },
        { label: "Universidad", score: "3", value: "university" }
      ]
    });
    expect(state.ranges[0]).toMatchObject({
      code: "ALTO",
      eligible: true,
      label: "Alto",
      max: "10",
      min: "3"
    });
  });
});
