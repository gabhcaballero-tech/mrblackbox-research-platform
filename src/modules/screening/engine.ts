import {
  screeningAnswersSchema,
  screeningDefinitionSchema,
  type ScreeningAnswerValue,
  type ScreeningAnswers,
  type ScreeningCondition,
  type ScreeningDefinition,
  type ScreeningScoreCalculation,
  type ScreeningScoreRange,
  type ScreeningStatus
} from "./schemas";

export type ScreeningScoreResult = {
  code: string;
  label: string;
  score: number;
  classification?: {
    code: string;
    label: string;
  };
  missingQuestionIds: string[];
};

export type ScreeningEvaluationResult = {
  status: ScreeningStatus;
  termination?: {
    code: string;
    reason: string;
    questionId: string;
  };
  incomplete?: {
    code: "missing_required_answer";
    reason: string;
    questionIds: string[];
  };
  scores: ScreeningScoreResult[];
};

export function evaluateScreening(
  definitionInput: ScreeningDefinition,
  answersInput: ScreeningAnswers
): ScreeningEvaluationResult {
  const definition = screeningDefinitionSchema.parse(definitionInput);
  const answers = screeningAnswersSchema.parse(answersInput);
  const missingRequiredQuestionIds = definition.questions
    .filter((question) => question.required)
    .filter((question) => isMissingAnswer(answers[question.id]))
    .map((question) => question.id);

  const scores = definition.scoreCalculations.map((calculation) =>
    calculateScreeningScore(calculation, answers)
  );

  if (missingRequiredQuestionIds.length > 0) {
    return {
      status: "incomplete",
      incomplete: {
        code: "missing_required_answer",
        reason: "Required screening answers are missing.",
        questionIds: missingRequiredQuestionIds
      },
      scores
    };
  }

  for (const rule of definition.rules) {
    const answer = answers[rule.questionId];
    if (!conditionMatches(answer, rule.condition)) {
      continue;
    }

    if (rule.action === "terminate" || rule.action === "terminate_on_selection") {
      return {
        status: "terminated",
        termination: {
          code: rule.terminationCode ?? "screening_terminated",
          reason: rule.terminationReason ?? "Screening terminated by configured rule.",
          questionId: rule.questionId
        },
        scores
      };
    }
  }

  return {
    status: "passed",
    scores
  };
}

export function calculateScreeningScore(
  calculationInput: ScreeningScoreCalculation,
  answersInput: ScreeningAnswers
): ScreeningScoreResult {
  const answers = screeningAnswersSchema.parse(answersInput);
  const missingQuestionIds: string[] = [];
  let score = 0;

  for (const input of calculationInput.inputs) {
    const answer = answers[input.questionId];

    if (isMissingAnswer(answer)) {
      missingQuestionIds.push(input.questionId);
      score += input.missingScore;
      continue;
    }

    const answerValues: Array<string | number | boolean> = Array.isArray(answer)
      ? answer
      : [answer as string | number | boolean];
    const inputScore = answerValues.reduce<number>((sum, value) => {
      return sum + (input.scoreByAnswer[String(value)] ?? 0);
    }, 0);

    score += inputScore;
  }

  const classification = calculationInput.ranges
    ? classifyScore(score, calculationInput.ranges)
    : undefined;

  return {
    code: calculationInput.code,
    label: calculationInput.label,
    score,
    classification,
    missingQuestionIds
  };
}

export function classifyScore(score: number, ranges: ScreeningScoreRange[]) {
  const range = ranges.find((candidate) => score >= candidate.min && score <= candidate.max);

  if (!range) {
    return undefined;
  }

  return {
    code: range.code,
    label: range.label
  };
}

function conditionMatches(
  answer: ScreeningAnswerValue | undefined,
  condition: ScreeningCondition
): boolean {
  if (isMissingAnswer(answer)) {
    return false;
  }

  const answerValues: Array<string | number | boolean> = Array.isArray(answer)
    ? answer
    : [answer as string | number | boolean];

  switch (condition.operator) {
    case "equals":
      return answerValues.length === 1 && answerValues[0] === condition.value;
    case "includes":
      return answerValues.some((value) => value === condition.value);
    case "one_of":
      return answerValues.some((value) => condition.values?.includes(value) ?? false);
    case "range":
      return answerValues.some((value) => {
        if (typeof value !== "number") {
          return false;
        }

        return (
          (condition.min === undefined || value >= condition.min) &&
          (condition.max === undefined || value <= condition.max)
        );
      });
    default:
      return false;
  }
}

function isMissingAnswer(answer: ScreeningAnswerValue | undefined): boolean {
  if (answer === undefined || answer === null) {
    return true;
  }

  if (typeof answer === "string") {
    return answer.trim().length === 0;
  }

  if (Array.isArray(answer)) {
    return answer.length === 0;
  }

  return false;
}
