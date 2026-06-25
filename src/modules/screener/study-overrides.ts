import type { ScreenerDefinition, ScreenerQuestion } from "./definition";
import { DETERGENTS_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export { DETERGENTS_STUDY_CODE };
export const DETERGENT_RECRUITER_QUESTION_ID = "F0_RECLUTADOR";

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

export function applyStudyScreenerDefinitionOverrides(
  studyCode: string,
  definition: ScreenerDefinition
): ScreenerDefinition {
  if (studyCode !== DETERGENTS_STUDY_CODE) {
    return definition;
  }

  return ensureDetergentRecruiterQuestion(definition);
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
