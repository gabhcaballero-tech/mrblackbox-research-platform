import {
  getHutApplicableQuestions,
  getHutV5Definition,
  type HutAnswerLookup,
  type HutDefinition,
  type HutParticipantOrigin,
  type HutQuestionDefinition,
  type HutQuestionnaireSectionId
} from "./definition";

export type HutQuestionnaireSectionProgress = {
  answered: number;
  pendingQuestionCodes: string[];
  questions: HutQuestionDefinition[];
  section: HutQuestionnaireSectionId;
  title: string;
  total: number;
};

export type HutQuestionnaireProgress = {
  answered: number;
  percentage: number;
  sections: HutQuestionnaireSectionProgress[];
  total: number;
};

export function buildHutQuestionnaireProgress({
  answers = {},
  applicableQuestionCodes,
  definition = getHutV5Definition(),
  participantOrigin
}: {
  answers?: HutAnswerLookup;
  applicableQuestionCodes?: string[];
  definition?: HutDefinition;
  participantOrigin: HutParticipantOrigin;
}): HutQuestionnaireProgress {
  const allowedCodes = applicableQuestionCodes ? new Set(applicableQuestionCodes) : null;
  const applicableQuestions = getHutApplicableQuestions({
    answers,
    context: { participantOrigin },
    definition
  }).filter((question) => !allowedCodes || allowedCodes.has(question.code));
  const sections = definition.sections
    .map((section) => {
      const questions = progressQuestionsForSection({
        answers,
        applicableQuestions,
        participantOrigin,
        section: section.id
      });
      const pendingQuestionCodes = questions
        .filter((question) => !hasAnswer(answers, question.code))
        .map((question) => question.code);

      return {
        answered: questions.length - pendingQuestionCodes.length,
        pendingQuestionCodes,
        questions,
        section: section.id,
        title: progressSectionTitle(section.id, participantOrigin),
        total: questions.length
      };
    })
    .filter((section) => section.total > 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const answered = sections.reduce((sum, section) => sum + section.answered, 0);

  return {
    answered,
    percentage: total > 0 ? Math.round((answered / total) * 100) : 100,
    sections,
    total
  };
}

export function progressQuestionsForSection({
  answers = {},
  applicableQuestions,
  definition = getHutV5Definition(),
  participantOrigin,
  section
}: {
  answers?: HutAnswerLookup;
  applicableQuestions?: HutQuestionDefinition[];
  definition?: HutDefinition;
  participantOrigin: HutParticipantOrigin;
  section: HutQuestionnaireSectionId;
}): HutQuestionDefinition[] {
  const questions = applicableQuestions ?? getHutApplicableQuestions({
    answers,
    context: { participantOrigin },
    definition
  });

  return questions.filter((question) => {
    if (question.section !== section || !question.required) {
      return false;
    }

    if (participantOrigin === "CLT_HUT" && section === "FILTROS") {
      return Boolean(question.requiredForCltHut);
    }

    return true;
  });
}

export function progressSectionTitle(section: HutQuestionnaireSectionId, participantOrigin: HutParticipantOrigin): string {
  if (section === "FILTROS" && participantOrigin === "CLT_HUT") {
    return "Filtros obligatorios";
  }
  if (section === "FILTROS") {
    return "Filtros";
  }
  if (section === "EVALUACION_PRIMER_PERFUME") {
    return "Evaluacion primer perfume";
  }
  if (section === "EVALUACION_SEGUNDO_PERFUME") {
    return "Evaluacion segundo perfume";
  }
  if (section === "COMPARATIVA") {
    return "Evaluacion comparativa";
  }

  return getHutV5Definition().sections.find((candidate) => candidate.id === section)?.title ?? section;
}

function hasAnswer(answers: HutAnswerLookup, questionCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(answers, questionCode);
}
