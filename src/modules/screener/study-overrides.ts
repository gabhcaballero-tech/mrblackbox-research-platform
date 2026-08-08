import type { ScreenerDefinition, ScreenerQuestion } from "./definition";
import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE };
export const DETERGENT_RECRUITER_QUESTION_ID = "F0_RECLUTADOR";
export const NAVIGO_HUT_ACCESS_QUESTION_ID = "HUT_ACCESO_CORRIDO";
export const NAVIGO_HUT_ACCESS_YES_VALUE = "SI";
export const NAVIGO_HUT_ACCESS_NO_VALUE = "NO";

const detergentRecruiterQuestion: ScreenerQuestion = {
  dataDestination: "SCREENING",
  id: DETERGENT_RECRUITER_QUESTION_ID,
  order: 1,
  required: true,
  text: "Escribe el nombre de tu reclutador o reclutadora.",
  type: "SHORT_TEXT",
  validation: {
    maxLength: 120,
    minLength: 1
  }
};

const navigoHutAccessQuestion: ScreenerQuestion = {
  dataDestination: "OPERATIONAL_INTERNAL",
  helpText: "Esta respuesta solo define si se prepara acceso operativo a HUT; no cambia la elegibilidad de Navigo.",
  id: NAVIGO_HUT_ACCESS_QUESTION_ID,
  options: [
    {
      actions: [],
      isOther: false,
      label: "Si, tambien realizara HUT de corrido",
      order: 1,
      otherTextRequired: false,
      value: NAVIGO_HUT_ACCESS_YES_VALUE
    },
    {
      actions: [],
      isOther: false,
      label: "No, solo participa en Navigo",
      order: 2,
      otherTextRequired: false,
      value: NAVIGO_HUT_ACCESS_NO_VALUE
    }
  ],
  order: 1,
  required: true,
  text: "Esta persona estara presente para realizar tambien la entrevista HUT de corrido?",
  type: "SINGLE_CHOICE",
  validation: {}
};

export function applyStudyScreenerDefinitionOverrides(
  studyCode: string,
  definition: ScreenerDefinition
): ScreenerDefinition {
  if (studyCode === DETERGENTS_STUDY_CODE) {
    return ensureDetergentRecruiterQuestion(definition);
  }

  return definition;
}

export function ensureDetergentRecruiterQuestion(definition: ScreenerDefinition): ScreenerDefinition {
  const orderedQuestions = [...definition.questions]
    .filter((question) => question.id !== DETERGENT_RECRUITER_QUESTION_ID)
    .sort((left, right) => left.order - right.order)
    .map((question, index) => ({
      ...question,
      order: index + 2
    }));

  return {
    ...definition,
    questions: [detergentRecruiterQuestion, ...orderedQuestions]
  };
}

export function ensureNavigoHutAccessQuestion(definition: ScreenerDefinition): ScreenerDefinition {
  const questions = [...definition.questions]
    .filter((question) => question.id !== NAVIGO_HUT_ACCESS_QUESTION_ID)
    .sort((left, right) => left.order - right.order);
  const maxOrder = questions.reduce((currentMax, question) => Math.max(currentMax, question.order), 0);

  return {
    ...definition,
    questions: [
      ...questions,
      {
        ...navigoHutAccessQuestion,
        order: maxOrder + 1
      }
    ]
  };
}

export function isNavigoHutAccessEnabled(answer: unknown): boolean {
  if (answer === NAVIGO_HUT_ACCESS_YES_VALUE) {
    return true;
  }

  if (answer && typeof answer === "object" && "value" in answer) {
    return (answer as { value?: unknown }).value === NAVIGO_HUT_ACCESS_YES_VALUE;
  }

  return false;
}
