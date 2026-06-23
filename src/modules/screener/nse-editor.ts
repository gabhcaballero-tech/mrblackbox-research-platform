import type { ScreenerDefinition, ScreenerQuestion } from "./definition";

type ChoiceQuestion = ScreenerQuestion & {
  options: Array<{
    label: string;
    order: number;
    value: string;
  }>;
  type: "MULTIPLE_CHOICE" | "SINGLE_CHOICE";
};

export type NseEditorScoreRow = {
  label: string;
  score: string;
  value: string;
};

export type NseEditorQuestion = {
  missingScore: string;
  questionId: string;
  questionText: string;
  rows: NseEditorScoreRow[];
};

export type NseEditorRange = {
  code: string;
  eligible: boolean;
  label: string;
  max: string;
  min: string;
};

export type NseEditorState = {
  code: string;
  inputs: NseEditorQuestion[];
  label: string;
  ranges: NseEditorRange[];
};

export type NseEditorCompatibleQuestion = {
  id: string;
  options: Array<{
    label: string;
    value: string;
  }>;
  text: string;
  type: ChoiceQuestion["type"];
};

export type NseEditorValidation = {
  configuredScores: number;
  errors: string[];
  eligibleRanges: number;
  ready: boolean;
  totalScores: number;
  warnings: string[];
};

export function getNseCompatibleQuestions(
  definition: ScreenerDefinition
): NseEditorCompatibleQuestion[] {
  return definition.questions
    .filter(isNseCompatibleQuestion)
    .sort((left, right) => left.order - right.order)
    .map((question) => ({
      id: question.id,
      options: [...question.options]
        .sort((left, right) => left.order - right.order)
        .map((option) => ({
          label: option.label,
          value: option.value
        })),
      text: question.text,
      type: question.type
    }));
}

function isNseCompatibleQuestion(question: ScreenerQuestion): question is ChoiceQuestion {
  return (
    (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") &&
    "options" in question &&
    question.options.length > 0
  );
}

export function createNseEditorState(definition: ScreenerDefinition): NseEditorState {
  const compatibleQuestions = getNseCompatibleQuestions(definition);
  const compatibleById = new Map(compatibleQuestions.map((question) => [question.id, question]));
  const nse = definition.nse;

  return {
    code: nse?.code ?? "nse",
    inputs:
      nse?.inputs.map((input) => {
        const question = compatibleById.get(input.questionId);
        const configuredScores = new Map(
          Object.entries(input.scoreByAnswer).map(([value, score]) => [value, String(score)])
        );
        const optionRows =
          question?.options.map((option) => ({
            label: option.label,
            score: configuredScores.get(option.value) ?? "",
            value: option.value
          })) ?? [];
        const optionValues = new Set(optionRows.map((row) => row.value));
        const preservedRows = Object.entries(input.scoreByAnswer)
          .filter(([value]) => !optionValues.has(value))
          .map(([value, score]) => ({
            label: `Valor anterior: ${value}`,
            score: String(score),
            value
          }));

        return {
          missingScore: String(input.missingScore),
          questionId: input.questionId,
          questionText: question?.text ?? "Pregunta no disponible en el borrador actual",
          rows: [...optionRows, ...preservedRows]
        };
      }) ?? [],
    label: nse?.label ?? "NSE",
    ranges:
      nse?.ranges.map((range) => ({
        code: range.code,
        eligible: range.eligible,
        label: range.label,
        max: String(range.max),
        min: String(range.min)
      })) ?? []
  };
}

export function createNseInputFromQuestion(
  question: NseEditorCompatibleQuestion
): NseEditorQuestion {
  return {
    missingScore: "0",
    questionId: question.id,
    questionText: question.text,
    rows: question.options.map((option) => ({
      label: option.label,
      score: "",
      value: option.value
    }))
  };
}

export function createEmptyNseRange(index: number): NseEditorRange {
  return {
    code: `RANGO-${index}`,
    eligible: false,
    label: "",
    max: "",
    min: ""
  };
}

export function serializeNseInputsForCompatibility(inputs: NseEditorQuestion[]): string {
  return inputs
    .map((input) => {
      const scores = input.rows.map((row) => `${row.value}=${row.score}`).join(",");
      return `${input.questionId}|${scores}|missing=${input.missingScore}`;
    })
    .join("\n");
}

export function serializeNseRangesForCompatibility(ranges: NseEditorRange[]): string {
  return ranges
    .map((range) => `${range.code}|${range.label}|${range.min}|${range.max}|${range.eligible}`)
    .join("\n");
}

export function validateNseEditorState(state: NseEditorState): NseEditorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const configuredScores = state.inputs.reduce(
    (count, input) => count + input.rows.filter((row) => isFiniteNumber(row.score)).length,
    0
  );
  const totalScores = state.inputs.reduce((count, input) => count + input.rows.length, 0);

  if (!state.code.trim()) {
    errors.push("El código NSE es obligatorio.");
  }

  if (!state.label.trim()) {
    errors.push("La etiqueta NSE es obligatoria.");
  }

  if (state.inputs.length === 0) {
    errors.push("Agrega al menos una pregunta al cálculo.");
  }

  const questionIds = new Set<string>();
  for (const input of state.inputs) {
    if (questionIds.has(input.questionId)) {
      errors.push("Cada pregunta puede agregarse una sola vez.");
    }
    questionIds.add(input.questionId);

    if (!isFiniteNumber(input.missingScore)) {
      errors.push(`Define un puntaje válido si falta respuesta para "${input.questionText}".`);
    }

    for (const row of input.rows) {
      if (!isFiniteNumber(row.score)) {
        errors.push(`Define un puntaje válido para "${row.label}".`);
      }
    }
  }

  if (state.ranges.length === 0) {
    errors.push("Agrega al menos un rango NSE.");
  }

  const rangeCodes = new Set<string>();
  const parsedRanges = state.ranges.map((range) => ({
    ...range,
    maxNumber: Number(range.max),
    minNumber: Number(range.min)
  }));

  for (const range of parsedRanges) {
    const code = range.code.trim();
    if (!code) {
      errors.push("El código del rango es obligatorio.");
    } else if (rangeCodes.has(code)) {
      errors.push("No puede haber dos rangos con el mismo código.");
    }
    rangeCodes.add(code);

    if (!range.label.trim()) {
      errors.push("La etiqueta del rango es obligatoria.");
    }

    if (!isIntegerText(range.min) || !isIntegerText(range.max)) {
      errors.push("El puntaje mínimo y máximo de cada rango deben ser enteros.");
    } else if (range.minNumber > range.maxNumber) {
      errors.push("El puntaje mínimo no puede ser mayor que el puntaje máximo.");
    }
  }

  const validRanges = parsedRanges
    .filter((range) => isIntegerText(range.min) && isIntegerText(range.max) && range.minNumber <= range.maxNumber)
    .sort((left, right) => left.minNumber - right.minNumber);

  for (let index = 1; index < validRanges.length; index += 1) {
    const previous = validRanges[index - 1]!;
    const current = validRanges[index]!;

    if (current.minNumber <= previous.maxNumber) {
      errors.push("Los rangos NSE no pueden traslaparse.");
    }

    if (current.minNumber > previous.maxNumber + 1) {
      warnings.push("Hay huecos entre rangos NSE. Revisa si esto es intencional.");
    }
  }

  const eligibleRanges = state.ranges.filter((range) => range.eligible).length;

  if (eligibleRanges === 0) {
    errors.push("Marca al menos un rango como elegible.");
  }

  return {
    configuredScores,
    eligibleRanges,
    errors: uniqueMessages(errors),
    ready: errors.length === 0,
    totalScores,
    warnings: uniqueMessages(warnings)
  };
}

function isFiniteNumber(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function isIntegerText(value: string): boolean {
  return value.trim() !== "" && Number.isInteger(Number(value));
}

function uniqueMessages(messages: string[]): string[] {
  return Array.from(new Set(messages));
}
