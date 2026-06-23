import { DEFAULT_OTHER_ATTRIBUTE_QUESTION } from "@/modules/randomization";
import type { ActivitySchedule } from "@/modules/activities";
import type { ManualTwoArmRotationAssignment } from "@/modules/comparative-rotation";
import type { QuestionnaireSnapshot } from "@/modules/questionnaire-engine";
import type { AttributeDefinition, AttributeRandomizationConfig } from "@/modules/randomization";
import type { ScreeningAnswers, ScreeningDefinition } from "@/modules/screening";
import type { QuotaDefinition, QuotaEvaluationContext } from "@/modules/quotas";

export const genericScreeningDefinition: ScreeningDefinition = {
  id: "generic-screener",
  questions: [
    {
      id: "q-consent",
      label: "Consentimiento para continuar",
      type: "yes_no",
      required: true
    },
    {
      id: "q-category-use",
      label: "Uso de categoria",
      type: "single_choice",
      required: true,
      options: [
        { value: "yes", label: "Si" },
        { value: "no", label: "No" }
      ]
    },
    {
      id: "q-exclusions",
      label: "Criterios de exclusion",
      type: "multiple_choice",
      required: true,
      options: [
        { value: "none", label: "Ninguno" },
        { value: "sensitive", label: "Sensibilidad declarada" },
        { value: "other", label: "Otro" }
      ]
    },
    {
      id: "q-education",
      label: "Nivel educativo generico",
      type: "single_choice",
      required: true,
      options: [
        { value: "basic", label: "Basico" },
        { value: "middle", label: "Medio" },
        { value: "higher", label: "Superior" }
      ]
    },
    {
      id: "q-assets",
      label: "Activos del hogar genericos",
      type: "single_choice",
      required: true,
      options: [
        { value: "few", label: "Pocos" },
        { value: "some", label: "Algunos" },
        { value: "many", label: "Varios" }
      ]
    }
  ],
  rules: [
    {
      questionId: "q-category-use",
      action: "terminate",
      condition: { operator: "equals", value: "no" },
      terminationCode: "category_non_user",
      terminationReason: "No usa la categoria requerida para este filtro."
    },
    {
      questionId: "q-exclusions",
      action: "terminate_on_selection",
      condition: { operator: "includes", value: "sensitive" },
      terminationCode: "exclusion_selected",
      terminationReason: "Selecciono una opcion excluyente."
    }
  ],
  scoreCalculations: [
    {
      code: "nse",
      label: "NSE generico",
      inputs: [
        {
          questionId: "q-education",
          scoreByAnswer: {
            basic: 1,
            middle: 3,
            higher: 5
          },
          missingScore: 0
        },
        {
          questionId: "q-assets",
          scoreByAnswer: {
            few: 1,
            some: 3,
            many: 5
          },
          missingScore: 0
        }
      ],
      ranges: [
        { code: "low", label: "NSE bajo", min: 0, max: 3 },
        { code: "middle", label: "NSE medio", min: 4, max: 7 },
        { code: "high", label: "NSE alto", min: 8, max: 10 }
      ]
    }
  ]
};

export const passingScreeningAnswers: ScreeningAnswers = {
  "q-consent": true,
  "q-category-use": "yes",
  "q-exclusions": ["none"],
  "q-education": "higher",
  "q-assets": "many"
};

export const terminatingScreeningAnswers: ScreeningAnswers = {
  ...passingScreeningAnswers,
  "q-exclusions": ["sensitive", "other"]
};

export const genericQuotaDefinition: QuotaDefinition = {
  id: "quota-city-nse",
  name: "Ciudad y NSE genericos",
  criteria: [
    { field: "city", operator: "equals", value: "Ciudad de prueba" },
    { field: "nse", operator: "equals", value: "high" }
  ],
  countingStage: "screening_passed",
  targetCount: 5,
  warningThreshold: 5,
  status: "active"
};

export const fullQuotaContext: QuotaEvaluationContext = {
  attributes: {
    city: "Ciudad de prueba",
    nse: "high"
  },
  countingStage: "screening_passed",
  currentCount: 5
};

export const validManualRotation: ManualTwoArmRotationAssignment = {
  rotationCode: "R-01",
  assignmentMode: "manual_cover_code",
  arms: [
    {
      armCode: "left",
      realProductKey: "fragance-a",
      participantVisibleLabel: "Primera fragancia",
      applicationOrder: 1
    },
    {
      armCode: "right",
      realProductKey: "fragance-b",
      participantVisibleLabel: "Segunda fragancia",
      applicationOrder: 2
    }
  ]
};

export const measurementSchedules: ActivitySchedule[] = [
  {
    id: "measurement-15",
    type: "questionnaire_measurement",
    name: "Medicion 15 min",
    anchorEvent: "application_started",
    offsetMinutes: 15,
    windowStartsMinutes: 0,
    windowEndsMinutes: 30,
    sortOrder: 1,
    status: "active"
  },
  {
    id: "measurement-120",
    type: "questionnaire_measurement",
    name: "Medicion 2 h",
    anchorEvent: "application_started",
    offsetMinutes: 120,
    windowStartsMinutes: 0,
    windowEndsMinutes: 60,
    sortOrder: 2,
    status: "active"
  },
  {
    id: "measurement-240",
    type: "questionnaire_measurement",
    name: "Medicion 4 h",
    anchorEvent: "application_started",
    offsetMinutes: 240,
    windowStartsMinutes: 0,
    windowEndsMinutes: 60,
    sortOrder: 3,
    status: "active"
  },
  {
    id: "measurement-480",
    type: "questionnaire_measurement",
    name: "Medicion 8 h",
    anchorEvent: "application_started",
    offsetMinutes: 480,
    windowStartsMinutes: 0,
    windowEndsMinutes: 60,
    sortOrder: 4,
    status: "active"
  }
];

export const attributeLibrary: AttributeDefinition[] = Array.from({ length: 12 }, (_, index) => ({
  id: `attribute-${index + 1}`,
  label: `Atributo generico ${index + 1}`,
  libraryRevisionId: `attribute-revision-${index + 1}`
}));

export const attributeRandomizationConfig: AttributeRandomizationConfig = {
  questionnaireVersionId: "questionnaire-v1",
  blockInstanceKey: "fragance-attributes",
  shareOrderAcrossProducts: true,
  groupSize: 5,
  instructionText: "Evalua los siguientes atributos para la fragancia.",
  finalQuestionText: DEFAULT_OTHER_ATTRIBUTE_QUESTION
};

export const genericQuestionnaireSnapshot: QuestionnaireSnapshot = {
  id: "questionnaire-version-1",
  studyId: "study-1",
  questionnaireDraftId: "questionnaire-draft-1",
  versionNumber: 1,
  purpose: "measurement",
  status: "published",
  publishedAt: "2026-06-22T12:00:00.000Z",
  definitionHash: "hash-v1",
  questions: [
    {
      id: "q-single",
      type: "single_choice",
      text: "Respuesta unica",
      required: true,
      options: [
        { value: "a", label: "A", requiresText: false },
        { value: "b", label: "B", requiresText: false }
      ]
    },
    {
      id: "q-multiple",
      type: "multiple_choice",
      text: "Respuesta multiple",
      required: false,
      options: [
        { value: "a", label: "A", requiresText: false },
        { value: "other", label: "Otro", requiresText: true }
      ]
    },
    {
      id: "q-text",
      type: "text",
      text: "Texto abierto",
      required: false,
      maxLength: 300
    },
    {
      id: "q-number",
      type: "number",
      text: "Numero",
      required: false,
      min: 0,
      max: 10
    },
    {
      id: "q-yes-no",
      type: "yes_no",
      text: "Si o no",
      required: true
    },
    {
      id: "q-scale",
      type: "scale",
      text: "Escala",
      required: true,
      min: 1,
      max: 7,
      step: 1
    },
    {
      id: "q-matrix",
      type: "matrix",
      text: "Matriz",
      required: false,
      rows: [{ id: "row-1", label: "Fila 1" }],
      columns: [
        { value: "low", label: "Bajo", requiresText: false },
        { value: "high", label: "Alto", requiresText: false }
      ]
    },
    {
      id: "q-attribute-block",
      type: "attribute_block",
      text: "Bloque de atributos",
      required: true,
      blockInstanceKey: "fragance-attributes",
      attributeIds: attributeLibrary.map((attribute) => attribute.id),
      groupSize: 5,
      shareOrderAcrossProducts: true,
      instructionText: "Evalua los siguientes atributos para la fragancia.",
      finalOtherAttributeQuestionText: DEFAULT_OTHER_ATTRIBUTE_QUESTION
    }
  ]
};
