import { z } from "zod";
import {
  participantProfileBindingSchema,
  screenerDataDestinationSchema,
  screenerQuestionTypeSchema
} from "./definition";

const technicalKeyPattern = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;

export function normalizeTechnicalKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function normalizeDisplayText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function optionalText(value: unknown): string | undefined {
  const normalized = normalizeDisplayText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function checkboxValue(value: unknown): boolean {
  return value === "on" || value === "true" || value === true;
}

function optionalNumber(value: unknown): number | undefined {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return undefined;
  }

  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function hasDelimitedValues(value: string | undefined): boolean {
  return Boolean(
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean).length
  );
}

export const screenerMetadataInputSchema = z.object({
  description: z.preprocess(optionalText, z.string().max(500).optional()),
  title: z.preprocess(
    normalizeDisplayText,
    z.string().min(1, "El título es obligatorio.").max(160, "El título no puede superar 160 caracteres.")
  )
});

export const screenerQuestionInputSchema = z.object({
  dataDestination: screenerDataDestinationSchema,
  helpText: z.preprocess(optionalText, z.string().max(240).optional()),
  id: z.preprocess(
    normalizeTechnicalKey,
    z
      .string()
      .min(1, "El ID técnico es obligatorio.")
      .max(80, "El ID técnico no puede superar 80 caracteres.")
      .regex(technicalKeyPattern, "Usa letras, números, guiones o guiones bajos internos.")
  ),
  profileBinding: z.preprocess(
    optionalText,
    participantProfileBindingSchema.optional()
  ),
  required: z.preprocess(checkboxValue, z.boolean()),
  text: z.preprocess(
    normalizeDisplayText,
    z.string().min(1, "El texto de la pregunta es obligatorio.").max(240)
  ),
  type: screenerQuestionTypeSchema,
  validationMax: z.preprocess(optionalNumber, z.number().optional()),
  validationMaxLength: z.preprocess(optionalNumber, z.number().int().min(1).optional()),
  validationMaxSelections: z.preprocess(optionalNumber, z.number().int().min(1).optional()),
  validationMin: z.preprocess(optionalNumber, z.number().optional()),
  validationMinLength: z.preprocess(optionalNumber, z.number().int().min(0).optional()),
  validationMinSelections: z.preprocess(optionalNumber, z.number().int().min(0).optional())
});

export const screenerOptionInputSchema = z.object({
  actionCode: z.preprocess(optionalText, z.string().max(80).optional()),
  actionReason: z.preprocess(optionalText, z.string().max(240).optional()),
  actionRequiresReview: z.preprocess(checkboxValue, z.boolean()),
  actionType: z.enum(["NONE", "CONTINUE", "TERMINATE", "FLAG", "PENDING_REVIEW"]).default("NONE"),
  isOther: z.preprocess(checkboxValue, z.boolean()),
  label: z.preprocess(
    normalizeDisplayText,
    z.string().min(1, "La etiqueta es obligatoria.").max(160)
  ),
  otherTextMaxLength: z.preprocess(optionalNumber, z.number().int().min(1).max(500).optional()),
  otherTextRequired: z.preprocess(checkboxValue, z.boolean()),
  value: z.preprocess(
    normalizeTechnicalKey,
    z
      .string()
      .min(1, "El valor técnico es obligatorio.")
      .max(80)
      .regex(technicalKeyPattern, "Usa letras, números, guiones o guiones bajos internos.")
  )
}).superRefine((input, context) => {
  if (
    (input.actionType === "TERMINATE" ||
      input.actionType === "PENDING_REVIEW" ||
      input.actionType === "FLAG") &&
    !input.actionCode
  ) {
    context.addIssue({
      code: "custom",
      message: "El código de acción es obligatorio.",
      path: ["actionCode"]
    });
  }

  if (
    (input.actionType === "TERMINATE" || input.actionType === "PENDING_REVIEW") &&
    !input.actionReason
  ) {
    context.addIssue({
      code: "custom",
      message: "El motivo es obligatorio para terminar el filtro o enviar a revisión.",
      path: ["actionReason"]
    });
  }
});

export const screenerRuleInputSchema = z.object({
  conditionType: z.enum(["ANSWER_EQUALS", "ANY_SELECTED", "ALL_SELECTED", "NUMBER_RANGE"]),
  id: z.preprocess(
    normalizeTechnicalKey,
    z
      .string()
      .min(1, "El ID de regla es obligatorio.")
      .max(80)
      .regex(technicalKeyPattern, "Usa letras, números, guiones o guiones bajos internos.")
  ),
  max: z.preprocess(optionalNumber, z.number().optional()),
  min: z.preprocess(optionalNumber, z.number().optional()),
  outcomeCode: z.preprocess(optionalText, z.string().max(80).optional()),
  outcomeReason: z.preprocess(optionalText, z.string().max(240).optional()),
  outcomeRequiresReview: z.preprocess(checkboxValue, z.boolean()),
  outcomeType: z.enum(["TERMINATE", "PENDING_REVIEW", "FLAG"]),
  questionId: z.preprocess(normalizeTechnicalKey, z.string().min(1, "La pregunta es obligatoria.")),
  value: z.preprocess(optionalText, z.string().optional()),
  values: z.preprocess(optionalText, z.string().optional())
}).superRefine((input, context) => {
  if (input.conditionType === "ANSWER_EQUALS" && !input.value) {
    context.addIssue({
      code: "custom",
      message: "Selecciona o ingresa el valor esperado.",
      path: ["value"]
    });
  }

  if (
    (input.conditionType === "ANY_SELECTED" || input.conditionType === "ALL_SELECTED") &&
    !hasDelimitedValues(input.values)
  ) {
    context.addIssue({
      code: "custom",
      message: "Selecciona al menos una opción para la condición.",
      path: ["values"]
    });
  }

  if (input.conditionType === "NUMBER_RANGE") {
    if (input.min === undefined && input.max === undefined) {
      context.addIssue({
        code: "custom",
          message: "Ingresa al menos un mínimo o un máximo para el rango.",
        path: ["min"]
      });
    }

    if (input.min !== undefined && input.max !== undefined && input.min > input.max) {
      context.addIssue({
        code: "custom",
          message: "El mínimo no puede ser mayor que el máximo.",
        path: ["min"]
      });
    }
  }

  if (!input.outcomeCode) {
    context.addIssue({
      code: "custom",
      message: "El código de resultado es obligatorio.",
      path: ["outcomeCode"]
    });
  }

  if (
    (input.outcomeType === "TERMINATE" || input.outcomeType === "PENDING_REVIEW") &&
    !input.outcomeReason
  ) {
    context.addIssue({
      code: "custom",
      message: "El motivo es obligatorio para terminar el filtro o enviar a revisión.",
      path: ["outcomeReason"]
    });
  }
});

export const screenerVisibilityInputSchema = z.object({
  conditionType: z.enum(["ANSWER_EQUALS", "ANY_SELECTED", "ALL_SELECTED", "NUMBER_RANGE"]).default("ANSWER_EQUALS"),
  max: z.preprocess(optionalNumber, z.number().optional()),
  min: z.preprocess(optionalNumber, z.number().optional()),
  mode: z.enum(["ALWAYS", "CONDITIONAL"]).default("ALWAYS"),
  questionId: z.preprocess(optionalText, z.string().optional()),
  value: z.preprocess(optionalText, z.string().optional()),
  values: z.preprocess(optionalText, z.string().optional())
}).superRefine((input, context) => {
  if (input.mode === "ALWAYS") {
    return;
  }

  if (!input.questionId) {
    context.addIssue({
      code: "custom",
      message: "Selecciona la pregunta origen de la visibilidad.",
      path: ["questionId"]
    });
  }

  if (input.conditionType === "ANSWER_EQUALS" && !input.value) {
    context.addIssue({
      code: "custom",
      message: "Selecciona o ingresa el valor esperado.",
      path: ["value"]
    });
  }

  if (
    (input.conditionType === "ANY_SELECTED" || input.conditionType === "ALL_SELECTED") &&
    !hasDelimitedValues(input.values)
  ) {
    context.addIssue({
      code: "custom",
      message: "Selecciona al menos una opcion para la condicion.",
      path: ["values"]
    });
  }

  if (input.conditionType === "NUMBER_RANGE") {
    if (input.min === undefined && input.max === undefined) {
      context.addIssue({
        code: "custom",
        message: "Ingresa al menos un minimo o un maximo para el rango.",
        path: ["min"]
      });
    }

    if (input.min !== undefined && input.max !== undefined && input.min > input.max) {
      context.addIssue({
        code: "custom",
        message: "El minimo no puede ser mayor que el maximo.",
        path: ["min"]
      });
    }
  }
});

export const screenerNseInputSchema = z.object({
  code: z.preprocess(
    normalizeTechnicalKey,
    z
      .string()
      .min(1, "El código NSE es obligatorio.")
      .max(80)
      .regex(technicalKeyPattern, "Usa letras, números, guiones o guiones bajos internos.")
  ),
  inputsText: z.preprocess(
    (value) => String(value ?? "").trim(),
    z.string().min(1, "Agrega al menos una entrada de puntaje.")
  ),
  label: z.preprocess(
    normalizeDisplayText,
    z.string().min(1, "La etiqueta NSE es obligatoria.").max(120)
  ),
  rangesText: z.preprocess(
    (value) => String(value ?? "").trim(),
    z.string().min(1, "Agrega al menos un rango NSE.")
  )
});

export type ScreenerAdminFieldErrors = Record<string, string[] | undefined>;
export type ScreenerQuestionInput = z.infer<typeof screenerQuestionInputSchema>;
export type ScreenerOptionInput = z.infer<typeof screenerOptionInputSchema>;
export type ScreenerRuleInput = z.infer<typeof screenerRuleInputSchema>;
export type ScreenerVisibilityInput = z.infer<typeof screenerVisibilityInputSchema>;
export type ScreenerNseInput = z.infer<typeof screenerNseInputSchema>;

export function getMetadataInputFromFormData(formData: FormData) {
  return {
    description: formData.get("description"),
    title: formData.get("title")
  };
}

export function getQuestionInputFromFormData(formData: FormData) {
  return {
    dataDestination: formData.get("dataDestination"),
    helpText: formData.get("helpText"),
    id: formData.get("id"),
    profileBinding: formData.get("profileBinding"),
    required: formData.get("required"),
    text: formData.get("text"),
    type: formData.get("type"),
    validationMax: formData.get("validationMax"),
    validationMaxLength: formData.get("validationMaxLength"),
    validationMaxSelections: formData.get("validationMaxSelections"),
    validationMin: formData.get("validationMin"),
    validationMinLength: formData.get("validationMinLength"),
    validationMinSelections: formData.get("validationMinSelections")
  };
}

export function getOptionInputFromFormData(formData: FormData) {
  return {
    actionCode: formData.get("actionCode"),
    actionReason: formData.get("actionReason"),
    actionRequiresReview: formData.get("actionRequiresReview"),
    actionType: formData.get("actionType") ?? "NONE",
    isOther: formData.get("isOther"),
    label: formData.get("label"),
    otherTextMaxLength: formData.get("otherTextMaxLength"),
    otherTextRequired: formData.get("otherTextRequired"),
    value: formData.get("value")
  };
}

export function getRuleInputFromFormData(formData: FormData) {
  return {
    conditionType: formData.get("conditionType"),
    id: formData.get("id"),
    max: formData.get("max"),
    min: formData.get("min"),
    outcomeCode: formData.get("outcomeCode"),
    outcomeReason: formData.get("outcomeReason"),
    outcomeRequiresReview: formData.get("outcomeRequiresReview"),
    outcomeType: formData.get("outcomeType"),
    questionId: formData.get("questionId"),
    value: formData.get("value"),
    values: formData.get("values")
  };
}

export function getVisibilityInputFromFormData(formData: FormData) {
  return {
    conditionType: formData.get("conditionType"),
    max: formData.get("max"),
    min: formData.get("min"),
    mode: formData.get("mode") ?? "ALWAYS",
    questionId: formData.get("questionId"),
    value: formData.get("value"),
    values: formData.get("values")
  };
}

export function getNseInputFromFormData(formData: FormData) {
  return {
    code: formData.get("code"),
    inputsText: formData.get("inputsText"),
    label: formData.get("label"),
    rangesText: formData.get("rangesText")
  };
}
