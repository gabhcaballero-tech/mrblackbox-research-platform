import { createHash } from "node:crypto";
import type { QuestionnaireQuestion } from "@/modules/questionnaire-engine";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export const NAVIGO_APP_DEFAULT_TIME_ZONE = "America/Mexico_City";
export const NAVIGO_MEASUREMENT_DRAFT_NAME = "App Navigo - mediciones T0/T2/T4/T8";
export const NAVIGO_MEASUREMENT_VERSION_NAME = "App Navigo - AP1 a AP7";
export const NAVIGO_T0_IDENTITY_QUESTION_ID = "T0_IDENTITY_CONFIRMED";

export const NAVIGO_ACTIVITY_CODES = ["T0_SALON", "T2_HORAS", "T4_HORAS", "T8_HORAS"] as const;

export type NavigoActivityCode = (typeof NAVIGO_ACTIVITY_CODES)[number];
export type NavigoVisualVerificationMode = "disabled" | "required";

export type NavigoMeasurementDefinition = {
  purpose: "MEASUREMENT";
  questions: QuestionnaireQuestion[];
  schemaVersion: "questionnaire.v1";
  title: string;
};

export type NavigoScheduleSeed = {
  code: NavigoActivityCode;
  name: string;
  offsetMinutes: number;
  questionnaireVersionId: string | null;
  sortOrder: number;
  type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT";
  windowEndsMinutes: number;
  windowStartsMinutes: number;
};

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
      code: "T0_SALON",
      name: "T0 en salon",
      offsetMinutes: 0,
      questionnaireVersionId: null,
      sortOrder: 0,
      type: "INTERNAL_FOLLOWUP",
      windowEndsMinutes: 0,
      windowStartsMinutes: 0
    },
    {
      code: "T2_HORAS",
      name: "Medicion 2 horas",
      offsetMinutes: 120,
      questionnaireVersionId,
      sortOrder: 1,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 480,
      windowStartsMinutes: -30
    },
    {
      code: "T4_HORAS",
      name: "Medicion 4 horas",
      offsetMinutes: 240,
      questionnaireVersionId,
      sortOrder: 2,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 360,
      windowStartsMinutes: -30
    },
    {
      code: "T8_HORAS",
      name: "Medicion 8 horas",
      offsetMinutes: 480,
      questionnaireVersionId,
      sortOrder: 3,
      type: "QUESTIONNAIRE_MEASUREMENT",
      windowEndsMinutes: 120,
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
