import { createHash } from "node:crypto";
import { z } from "zod";
import type { InternalUserRole } from "@/shared/auth/permissions";

const technicalKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/);

const nonEmptyTextSchema = z.string().trim().min(1);

export const screenerQuestionTypeSchema = z.enum([
  "CONSENT_YES_NO",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "INTEGER",
  "SHORT_TEXT",
  "LONG_TEXT",
  "INTERVIEWER_CHECKLIST"
]);

export const screenerDataDestinationSchema = z.enum([
  "SCREENING",
  "PARTICIPANT_PROFILE",
  "OPERATIONAL_INTERNAL"
]);

export const participantProfileBindingSchema = z.enum([
  "NAME",
  "PHONE",
  "EMAIL",
  "ADDRESS",
  "CITY",
  "AGE",
  "GENDER",
  "EXTERNAL_REFERENCE"
]);

const screenerValidationSchema = z
  .object({
    max: z.number().optional(),
    maxLength: z.number().int().min(1).optional(),
    maxSelections: z.number().int().min(1).optional(),
    min: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    minSelections: z.number().int().min(0).optional()
  })
  .strict()
  .default({});

export const screenerOptionActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CONTINUE")
    })
    .strict(),
  z
    .object({
      code: technicalKeySchema,
      reason: nonEmptyTextSchema.max(240),
      type: z.literal("TERMINATE")
    })
    .strict(),
  z
    .object({
      code: technicalKeySchema,
      label: z.string().trim().min(1).max(120).optional(),
      requiresReview: z.boolean().default(false),
      type: z.literal("FLAG")
    })
    .strict(),
  z
    .object({
      code: technicalKeySchema,
      reason: nonEmptyTextSchema.max(240),
      type: z.literal("PENDING_REVIEW")
    })
    .strict()
]);

export const screenerOptionSchema = z
  .object({
    actions: z.array(screenerOptionActionSchema).default([]),
    isOther: z.boolean().default(false),
    label: nonEmptyTextSchema.max(160),
    order: z.number().int().min(1),
    otherTextRequired: z.boolean().default(false),
    otherTextMaxLength: z.number().int().min(1).max(500).optional(),
    value: technicalKeySchema
  })
  .strict()
  .superRefine((option, context) => {
    if (option.otherTextRequired && !option.isOther) {
      context.addIssue({
        code: "custom",
        message: "Solo una opción Otro puede exigir texto de especificación.",
        path: ["otherTextRequired"]
      });
    }
  });

const questionBaseSchema = z
  .object({
    dataDestination: screenerDataDestinationSchema,
    helpText: z.string().trim().min(1).max(240).optional(),
    id: technicalKeySchema,
    order: z.number().int().min(1),
    profileBinding: participantProfileBindingSchema.optional(),
    required: z.boolean().default(false),
    text: nonEmptyTextSchema.max(240),
    validation: screenerValidationSchema
  })
  .strict()
  .superRefine((question, context) => {
    if (question.dataDestination === "PARTICIPANT_PROFILE" && !question.profileBinding) {
      context.addIssue({
        code: "custom",
        message: "Las preguntas de perfil del participante requieren una vinculación permitida explícita.",
        path: ["profileBinding"]
      });
    }

    if (question.dataDestination !== "PARTICIPANT_PROFILE" && question.profileBinding) {
      context.addIssue({
        code: "custom",
        message: "Las vinculaciones de perfil solo se permiten en preguntas de perfil del participante.",
        path: ["profileBinding"]
      });
    }
  });

const questionWithoutOptionsSchema = questionBaseSchema.extend({
  type: z.enum(["INTEGER", "SHORT_TEXT", "LONG_TEXT"])
});

const questionWithOptionsSchema = questionBaseSchema.extend({
  options: z.array(screenerOptionSchema).default([]),
  type: z.enum(["CONSENT_YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "INTERVIEWER_CHECKLIST"])
});

export const screenerQuestionSchema = z
  .discriminatedUnion("type", [questionWithoutOptionsSchema, questionWithOptionsSchema])
  .superRefine((question, context) => {
    if ("options" in question) {
      addDuplicateIssue(
        question.options.map((option) => option.value),
        context,
        "El valor de opción está duplicado.",
        ["options"]
      );
      addDuplicateIssue(
        question.options.map((option) => option.order),
        context,
        "El orden de opción está duplicado.",
        ["options"]
      );

      if (question.options.filter((option) => option.isOther).length > 1) {
        context.addIssue({
          code: "custom",
          message: "Solo se permite una opción Otro por pregunta.",
          path: ["options"]
        });
      }
    }
  });

export type ScreenerComparableValue = string | number | boolean;

export type ScreenerCondition =
  | {
      questionId: string;
      type: "ANSWER_EQUALS";
      value: ScreenerComparableValue;
    }
  | {
      questionId: string;
      type: "ANY_SELECTED";
      values: ScreenerComparableValue[];
    }
  | {
      questionId: string;
      type: "ALL_SELECTED";
      values: ScreenerComparableValue[];
    }
  | {
      max?: number;
      min?: number;
      questionId: string;
      type: "NUMBER_RANGE";
    }
  | {
      conditions: ScreenerCondition[];
      type: "ANY";
    }
  | {
      conditions: ScreenerCondition[];
      type: "ALL";
    };

const comparableValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const screenerConditionSchema: z.ZodType<ScreenerCondition> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        questionId: technicalKeySchema,
        type: z.literal("ANSWER_EQUALS"),
        value: comparableValueSchema
      })
      .strict(),
    z
      .object({
        questionId: technicalKeySchema,
        type: z.literal("ANY_SELECTED"),
        values: z.array(comparableValueSchema).min(1)
      })
      .strict(),
    z
      .object({
        questionId: technicalKeySchema,
        type: z.literal("ALL_SELECTED"),
        values: z.array(comparableValueSchema).min(1)
      })
      .strict(),
    z
      .object({
        max: z.number().optional(),
        min: z.number().optional(),
        questionId: technicalKeySchema,
        type: z.literal("NUMBER_RANGE")
      })
      .strict()
      .refine((condition) => condition.min !== undefined || condition.max !== undefined, {
        message: "El rango numérico requiere mínimo o máximo."
      })
      .refine(
        (condition) =>
          condition.min === undefined ||
          condition.max === undefined ||
          condition.min <= condition.max,
        { message: "El mínimo del rango numérico debe ser menor o igual al máximo." }
      ),
    z
      .object({
        conditions: z.array(screenerConditionSchema).min(1),
        type: z.literal("ANY")
      })
      .strict(),
    z
      .object({
        conditions: z.array(screenerConditionSchema).min(1),
        type: z.literal("ALL")
      })
      .strict()
  ])
);

export const screenerRuleOutcomeSchema = z.discriminatedUnion("type", [
  z
    .object({
      code: technicalKeySchema,
      reason: nonEmptyTextSchema.max(240),
      type: z.literal("TERMINATE")
    })
    .strict(),
  z
    .object({
      code: technicalKeySchema,
      reason: nonEmptyTextSchema.max(240),
      type: z.literal("PENDING_REVIEW")
    })
    .strict(),
  z
    .object({
      code: technicalKeySchema,
      label: z.string().trim().min(1).max(120).optional(),
      requiresReview: z.boolean().default(false),
      type: z.literal("FLAG")
    })
    .strict()
]);

export const screenerRuleSchema = z
  .object({
    condition: screenerConditionSchema,
    id: technicalKeySchema,
    order: z.number().int().min(1),
    outcome: screenerRuleOutcomeSchema
  })
  .strict();

export const nseInputSchema = z
  .object({
    missingScore: z.number().default(0),
    questionId: technicalKeySchema,
    scoreByAnswer: z.record(z.string(), z.number())
  })
  .strict();

export const nseRangeSchema = z
  .object({
    code: technicalKeySchema,
    eligible: z.boolean(),
    label: nonEmptyTextSchema.max(120),
    max: z.number(),
    min: z.number()
  })
  .strict()
  .refine((range) => range.min <= range.max, {
    message: "El mínimo del rango NSE debe ser menor o igual al máximo."
  });

export const nseScoreTableSchema = z
  .object({
    code: technicalKeySchema.default("nse"),
    inputs: z.array(nseInputSchema).min(1),
    label: nonEmptyTextSchema.max(120),
    ranges: z.array(nseRangeSchema).min(1),
    type: z.literal("score_table")
  })
  .strict();

export const screenerDefinitionSchema = z
  .object({
    description: z.string().trim().min(1).max(500).optional(),
    nse: nseScoreTableSchema.optional(),
    purpose: z.literal("SCREENER"),
    questions: z.array(screenerQuestionSchema).default([]),
    rules: z.array(screenerRuleSchema).default([]),
    schemaVersion: z.literal("screening.v1"),
    title: nonEmptyTextSchema.max(160)
  })
  .strict()
  .superRefine((definition, context) => validateDefinitionReferences(definition, context));

export type ScreenerDefinition = z.infer<typeof screenerDefinitionSchema>;
export type ScreenerOption = z.infer<typeof screenerOptionSchema>;
export type ScreenerOptionAction = z.infer<typeof screenerOptionActionSchema>;
export type ScreenerQuestion = z.infer<typeof screenerQuestionSchema>;
export type ScreenerQuestionType = z.infer<typeof screenerQuestionTypeSchema>;
export type ScreenerRule = z.infer<typeof screenerRuleSchema>;
export type ScreenerRuleOutcome = z.infer<typeof screenerRuleOutcomeSchema>;
export type ScreenerDataDestination = z.infer<typeof screenerDataDestinationSchema>;
export type ParticipantProfileBinding = z.infer<typeof participantProfileBindingSchema>;
export type NseScoreTable = z.infer<typeof nseScoreTableSchema>;

export function createEmptyScreenerDefinition(title = "Cuestionario de filtro"): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    purpose: "SCREENER",
    questions: [],
    rules: [],
    schemaVersion: "screening.v1",
    title
  });
}

export function parseScreenerDefinition(input: unknown): ScreenerDefinition {
  return screenerDefinitionSchema.parse(input);
}

export function validateScreenerDefinitionForPublication(input: unknown): ScreenerDefinition {
  const definition = parseScreenerDefinition(input);

  if (definition.questions.length === 0) {
    throw new Error("El cuestionario de filtro necesita al menos una pregunta antes de publicarse.");
  }

  const optionQuestionWithoutOptions = definition.questions.find(
    (question) => "options" in question && question.options.length === 0
  );

  if (optionQuestionWithoutOptions) {
    throw new Error("Las preguntas de opción necesitan al menos una opción antes de publicarse.");
  }

  return definition;
}

export function canonicalizeScreenerDefinition(input: unknown): ScreenerDefinition {
  const definition = parseScreenerDefinition(input);

  return {
    ...definition,
    nse: definition.nse
      ? {
          ...definition.nse,
          inputs: [...definition.nse.inputs].sort((left, right) =>
            left.questionId.localeCompare(right.questionId)
          ),
          ranges: [...definition.nse.ranges].sort((left, right) => left.min - right.min)
        }
      : undefined,
    questions: [...definition.questions]
      .sort((left, right) => left.order - right.order)
      .map((question) => {
        if (!("options" in question)) {
          return question;
        }

        return {
          ...question,
          options: [...question.options].sort((left, right) => left.order - right.order)
        };
      }),
    rules: [...definition.rules].sort((left, right) => left.order - right.order)
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue)
    .filter((key) => objectValue[key] !== undefined)
    .sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(",")}}`;
}

export function hashScreenerDefinition(input: unknown): string {
  const canonicalDefinition = canonicalizeScreenerDefinition(input);

  return createHash("sha256").update(stableStringify(canonicalDefinition)).digest("hex");
}

export function projectScreenerDefinitionForRole(
  input: unknown,
  role: InternalUserRole
): ScreenerDefinition {
  const definition = parseScreenerDefinition(input);

  if (role !== "ANALYST") {
    return definition;
  }

  return {
    ...definition,
    questions: definition.questions.map((question) => {
      if (question.dataDestination !== "PARTICIPANT_PROFILE") {
        return question;
      }

      const sanitizedBase = {
        ...question,
        helpText: undefined,
        profileBinding: undefined,
        text: "Campo de perfil restringido"
      };

      if ("options" in sanitizedBase) {
        return {
          ...sanitizedBase,
          options: sanitizedBase.options.map((option) => ({
            ...option,
            label: "Opcion restringida"
          }))
        };
      }

      return sanitizedBase;
    })
  };
}

function addDuplicateIssue(
  values: Array<string | number>,
  context: z.RefinementCtx,
  message: string,
  path: Array<string | number>
) {
  const seen = new Set<string | number>();

  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message,
        path
      });
      return;
    }

    seen.add(value);
  }
}

function validateDefinitionReferences(
  definition: Omit<ScreenerDefinition, never>,
  context: z.RefinementCtx
) {
  addDuplicateIssue(
    definition.questions.map((question) => question.id),
    context,
    "El ID de pregunta está duplicado.",
    ["questions"]
  );
  addDuplicateIssue(
    definition.questions.map((question) => question.order),
    context,
    "El orden de pregunta está duplicado.",
    ["questions"]
  );
  addDuplicateIssue(
    definition.rules.map((rule) => rule.id),
    context,
    "El ID de regla está duplicado.",
    ["rules"]
  );
  addDuplicateIssue(
    definition.rules.map((rule) => rule.order),
    context,
    "El orden de regla está duplicado.",
    ["rules"]
  );

  const questionsById = new Map(definition.questions.map((question) => [question.id, question]));

  definition.rules.forEach((rule, ruleIndex) => {
    validateConditionReferences(rule.condition, questionsById, context, [
      "rules",
      ruleIndex,
      "condition"
    ]);
  });

  definition.nse?.inputs.forEach((input, inputIndex) => {
    const question = questionsById.get(input.questionId);

    if (!question) {
      context.addIssue({
        code: "custom",
        message: "La entrada NSE referencia una pregunta desconocida.",
        path: ["nse", "inputs", inputIndex, "questionId"]
      });
      return;
    }

    if ("options" in question) {
      const optionValues = new Set(question.options.map((option) => option.value));
      for (const scoredValue of Object.keys(input.scoreByAnswer)) {
        if (!optionValues.has(scoredValue)) {
          context.addIssue({
            code: "custom",
            message: "La tabla de puntajes NSE referencia un valor de opción desconocido.",
            path: ["nse", "inputs", inputIndex, "scoreByAnswer", scoredValue]
          });
        }
      }
    }
  });
}

function validateConditionReferences(
  condition: ScreenerCondition,
  questionsById: Map<string, ScreenerQuestion>,
  context: z.RefinementCtx,
  path: Array<string | number>
) {
  if (condition.type === "ANY" || condition.type === "ALL") {
    condition.conditions.forEach((nestedCondition, index) =>
      validateConditionReferences(nestedCondition, questionsById, context, [
        ...path,
        "conditions",
        index
      ])
    );
    return;
  }

  const question = questionsById.get(condition.questionId);

  if (!question) {
    context.addIssue({
      code: "custom",
      message: "La condición de la regla referencia una pregunta desconocida.",
      path: [...path, "questionId"]
    });
    return;
  }

  if (condition.type === "NUMBER_RANGE" && question.type !== "INTEGER") {
    context.addIssue({
      code: "custom",
      message: "Las condiciones de rango numérico solo pueden apuntar a preguntas de número entero.",
      path
    });
    return;
  }

  if (condition.type === "ANSWER_EQUALS") {
    validateConditionValue(condition.value, question, context, [...path, "value"]);
  }

  if (condition.type === "ANY_SELECTED" || condition.type === "ALL_SELECTED") {
    if (!("options" in question)) {
      context.addIssue({
        code: "custom",
          message: "Las condiciones de selección requieren una pregunta con opciones.",
        path
      });
      return;
    }

    condition.values.forEach((value, index) =>
      validateConditionValue(value, question, context, [...path, "values", index])
    );
  }
}

function validateConditionValue(
  value: ScreenerComparableValue,
  question: ScreenerQuestion,
  context: z.RefinementCtx,
  path: Array<string | number>
) {
  if (question.type === "CONSENT_YES_NO") {
    if (typeof value !== "boolean") {
      context.addIssue({
        code: "custom",
        message: "Las condiciones de consentimiento requieren valores booleanos.",
        path
      });
    }
    return;
  }

  if ("options" in question) {
    const optionValues = new Set(question.options.map((option) => option.value));

    if (!optionValues.has(String(value))) {
      context.addIssue({
        code: "custom",
        message: "La condición referencia un valor de opción desconocido.",
        path
      });
    }
  }
}
