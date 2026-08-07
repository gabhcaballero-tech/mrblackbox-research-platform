import { createHash } from "node:crypto";
import type { QuestionnaireQuestion } from "@/modules/questionnaire-engine";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export const NAVIGO_APP_DEFAULT_TIME_ZONE = "America/Mexico_City";
export const NAVIGO_MEASUREMENT_DRAFT_NAME = "App Navigo - mediciones T3/T4.5/T6";
export const NAVIGO_MEASUREMENT_VERSION_NAME = "App Navigo - AP1 a AP7";
export const NAVIGO_T0_IDENTITY_QUESTION_ID = "T0_IDENTITY_CONFIRMED";

export const NAVIGO_ACTIVITY_CODES = ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"] as const;
export const NAVIGO_PREVIOUS_ACTIVITY_SEQUENCE = ["T0_15_MIN", "T3_HORAS", "T4_5_HORAS", "T6_HORAS", "T8_HORAS"] as const;
export const NAVIGO_LEGACY_ACTIVITY_CODES = ["T0_15_MIN", "T8_HORAS", "T0_SALON", "T2_HORAS", "T4_HORAS"] as const;
export const NAVIGO_LEGACY_ACTIVITY_SEQUENCE = ["T0_SALON", "T2_HORAS", "T4_HORAS", "T8_HORAS"] as const;
export const NAVIGO_SUPPORTED_ACTIVITY_CODES = [...NAVIGO_ACTIVITY_CODES, ...NAVIGO_LEGACY_ACTIVITY_CODES] as const;

export type NavigoCurrentActivityCode = (typeof NAVIGO_ACTIVITY_CODES)[number];
export type NavigoLegacyActivityCode = (typeof NAVIGO_LEGACY_ACTIVITY_CODES)[number];
export type NavigoActivityCode = NavigoCurrentActivityCode | NavigoLegacyActivityCode;
export type NavigoVisualVerificationMode = "disabled" | "required";

export type NavigoMeasurementDefinition = {
  purpose: "MEASUREMENT";
  questions: QuestionnaireQuestion[];
  schemaVersion: "questionnaire.v1";
  title: string;
};

export type NavigoScheduleSeed = {
  code: NavigoCurrentActivityCode;
  name: string;
  offsetMinutes: number;
  questionnaireVersionId: string | null;
  sortOrder: number;
  type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT";
  windowEndsMinutes: number;
  windowStartsMinutes: number;
};

export const NAVIGO_COMPARATIVE_INSTRUCTIONS = [
  "Verifica el orden de las claves según la rotación asignada.",
  "Identifica en qué brazo se colocó cada clave antes de responder.",
  "Por favor huele ambos antebrazos y responde las siguientes preguntas."
] as const;

const NAVIGO_NUMERIC_COMPARATIVE_QUESTIONS = new Set([
  "AP1_PREFERENCIA_GENERAL",
  "AP2_PREFERENCIA_INTENSIDAD",
  "AP7_MAYOR_DURACION"
]);

const NAVIGO_COMPARATIVE_OPTION_NUMBERS: Record<string, number> = {
  AMBAS: 3,
  NINGUNA: 4,
  PRIMERA: 1,
  PRIMERA_IZQUIERDA: 1,
  SEGUNDA: 2,
  SEGUNDA_DERECHA: 2
};

export function navigoComparativeNumericEquivalent(questionId: string, value: string | number): number | null {
  if (!NAVIGO_NUMERIC_COMPARATIVE_QUESTIONS.has(questionId) || typeof value !== "string") {
    return null;
  }

  return NAVIGO_COMPARATIVE_OPTION_NUMBERS[value] ?? null;
}

export function createNavigoMeasurementDefinition(): NavigoMeasurementDefinition {
  return {
    purpose: "MEASUREMENT",
    questions: [
      singleChoiceQuestion({
        id: "AP1_PREFERENCIA_GENERAL",
        text: "¿Cuál de las dos fragancias prefiere en general?",
        options: [
          option("PRIMERA_IZQUIERDA", "La primera fragancia / brazo izquierdo"),
          option("SEGUNDA_DERECHA", "La segunda fragancia / brazo derecho"),
          option("AMBAS", "Ambas"),
          option("NINGUNA", "Ninguna")
        ]
      }),
      singleChoiceQuestion({
        id: "AP2_PREFERENCIA_INTENSIDAD",
        text: "Pensando en la intensidad del aroma de estas fragancias, ¿cuál de las dos prefiere en intensidad?",
        options: [
          option("PRIMERA", "La primera fragancia"),
          option("SEGUNDA", "La segunda fragancia"),
          option("AMBAS", "Ambas"),
          option("NINGUNA", "Ninguna")
        ]
      }),
      scaleQuestion({
        id: "AP3_INTENSIDAD_PRIMERA",
        text: "Pensando en la intensidad de la PRIMERA fragancia, brazo izquierdo, ¿usted diría que es...?",
        min: 1,
        max: 7,
        minLabel: "Extremadamente débil",
        maxLabel: "Extremadamente fuerte"
      }),
      scaleQuestion({
        id: "AP4_INTENSIDAD_SEGUNDA",
        text: "Pensando en la intensidad de la SEGUNDA fragancia, brazo derecho, ¿usted diría que es...?",
        min: 1,
        max: 7,
        minLabel: "Extremadamente débil",
        maxLabel: "Extremadamente fuerte"
      }),
      scaleQuestion({
        id: "AP5_CALIFICACION_PRIMERA",
        text: "Con una escala de 1 a 10 como en la escuela, ¿cómo calificas la PRIMERA fragancia, brazo izquierdo, en este momento?",
        min: 1,
        max: 10
      }),
      scaleQuestion({
        id: "AP6_CALIFICACION_SEGUNDA",
        text: "Con una escala de 1 a 10 como en la escuela, ¿cómo calificas la SEGUNDA fragancia, brazo derecho, en este momento?",
        min: 1,
        max: 10
      }),
      singleChoiceQuestion({
        id: "AP7_MAYOR_DURACION",
        text: "¿Cuál de las dos fragancias considera que tiene mayor duración?",
        options: [
          option("PRIMERA", "La primera fragancia"),
          option("SEGUNDA", "La segunda fragancia"),
          option("AMBAS", "Ambas"),
          option("NINGUNA", "Ninguna")
        ]
      })
    ],
    schemaVersion: "questionnaire.v1",
    title: NAVIGO_MEASUREMENT_VERSION_NAME
  };
}

export function hashNavigoMeasurementDefinition(definition: NavigoMeasurementDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}

export function createNavigoScheduleSeeds(questionnaireVersionId: string): NavigoScheduleSeed[] {
  return [
    {
      code: "T3_HORAS",
      name: "Medicion 3 horas",
      offsetMinutes: 180,
      questionnaireVersionId,
      sortOrder: 0,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 420,
      windowStartsMinutes: -30
    },
    {
      code: "T4_5_HORAS",
      name: "Medicion 4.5 horas",
      offsetMinutes: 270,
      questionnaireVersionId,
      sortOrder: 1,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 330,
      windowStartsMinutes: -30
    },
    {
      code: "T6_HORAS",
      name: "Medicion 6 horas",
      offsetMinutes: 360,
      questionnaireVersionId,
      sortOrder: 2,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 240,
      windowStartsMinutes: -30
    }
  ];
}

export function resolveNavigoTimeZone(timeZoneIana: string | null | undefined): string {
  const normalized = timeZoneIana?.trim();
  return normalized ? normalized : NAVIGO_APP_DEFAULT_TIME_ZONE;
}

export function resolveNavigoVisualVerificationMode(value: string | null | undefined): NavigoVisualVerificationMode {
  return value?.trim().toLowerCase() === "disabled" ? "disabled" : "required";
}

export const NAVIGO_APP_SUMMARY = {
  activityCodes: NAVIGO_ACTIVITY_CODES,
  questionIds: [
    "AP1_PREFERENCIA_GENERAL",
    "AP2_PREFERENCIA_INTENSIDAD",
    "AP3_INTENSIDAD_PRIMERA",
    "AP4_INTENSIDAD_SEGUNDA",
    "AP5_CALIFICACION_PRIMERA",
    "AP6_CALIFICACION_SEGUNDA",
    "AP7_MAYOR_DURACION"
  ],
  studyCode: NAVIGO_STUDY_CODE
} as const;

export function isInitialNavigoEvaluation(code: string | null | undefined): code is "T0_15_MIN" | "T0_SALON" {
  return code === "T0_15_MIN" || code === "T0_SALON";
}

export function isFollowupNavigoEvaluation(code: string | null | undefined): code is Exclude<NavigoActivityCode, "T0_15_MIN" | "T0_SALON"> {
  return isSupportedNavigoActivityCode(code) && !isInitialNavigoEvaluation(code);
}

export function isLegacyNavigoActivity(code: string | null | undefined): code is NavigoLegacyActivityCode {
  return code === "T0_15_MIN" || code === "T8_HORAS" || code === "T0_SALON" || code === "T2_HORAS" || code === "T4_HORAS";
}

export function isSupportedNavigoActivityCode(code: string | null | undefined): code is NavigoActivityCode {
  return (
    code === "T0_15_MIN" ||
    code === "T3_HORAS" ||
    code === "T4_5_HORAS" ||
    code === "T6_HORAS" ||
    code === "T8_HORAS" ||
    code === "T0_SALON" ||
    code === "T2_HORAS" ||
    code === "T4_HORAS"
  );
}

function option(value: string, label: string) {
  return {
    label,
    requiresText: false as const,
    value
  };
}

function singleChoiceQuestion(input: {
  id: string;
  options: Array<{ label: string; requiresText: false; value: string }>;
  text: string;
}): QuestionnaireQuestion {
  return {
    id: input.id,
    options: input.options,
    required: true,
    text: input.text,
    type: "single_choice"
  };
}

function scaleQuestion(input: {
  id: string;
  max: number;
  maxLabel?: string;
  min: number;
  minLabel?: string;
  text: string;
}): QuestionnaireQuestion {
  return {
    id: input.id,
    max: input.max,
    maxLabel: input.maxLabel,
    min: input.min,
    minLabel: input.minLabel,
    required: true,
    step: 1,
    text: input.text,
    type: "scale"
  };
}
