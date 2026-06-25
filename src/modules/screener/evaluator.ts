import {
  parseScreenerDefinition,
  type NseScoreTable,
  type ScreenerComparableValue,
  type ScreenerCondition,
  type ScreenerDefinition,
  type ScreenerOptionAction,
  type ScreenerQuestion,
  type ScreenerRuleOutcome
} from "./definition";

export type ScreenerAnswer =
  | string
  | number
  | boolean
  | string[]
  | {
      otherText?: string;
      value?: string | number | boolean;
      values?: string[];
    };

export type ScreenerAnswers = Record<string, ScreenerAnswer | undefined>;

export type ScreenerEvaluationStatus =
  | "PASSED"
  | "TERMINATED"
  | "INCOMPLETE"
  | "PENDING_REVIEW";

export type ScreenerEvaluationResultKind =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "INCOMPLETE"
  | "PENDING_REVIEW";

export type ScreenerEvaluationFlag = {
  code: string;
  label?: string;
  questionId?: string;
  requiresReview: boolean;
};

export type ScreenerEvaluationReason = {
  code: string;
  questionId?: string;
  reason: string;
};

export type ScreenerNseEvaluation = {
  classCode?: string;
  classLabel?: string;
  code: string;
  eligible?: boolean;
  label: string;
  missingQuestionIds: string[];
  score: number;
};

export type ScreeningAttemptEvaluationJson = {
  flags: ScreenerEvaluationFlag[];
  missingQuestionIds: string[];
  nse: ScreenerNseEvaluation | null;
  reasons: ScreenerEvaluationReason[];
  result: ScreenerEvaluationResultKind;
  safeExplanation: string;
  schemaVersion: "screening-evaluation.v1";
  status: ScreenerEvaluationStatus;
};

export type ScreenerEvaluationResult = {
  evaluationJson: ScreeningAttemptEvaluationJson;
  flags: ScreenerEvaluationFlag[];
  missingQuestionIds: string[];
  nse: ScreenerNseEvaluation | null;
  result: ScreenerEvaluationResultKind;
  status: ScreenerEvaluationStatus;
  termination?: ScreenerEvaluationReason;
};

type EvaluationAccumulator = {
  flags: ScreenerEvaluationFlag[];
  pendingReviewReasons: ScreenerEvaluationReason[];
  terminationReasons: ScreenerEvaluationReason[];
};

export function evaluateScreener(
  definitionInput: ScreenerDefinition,
  answers: ScreenerAnswers
): ScreenerEvaluationResult {
  const definition = parseScreenerDefinition(definitionInput);
  const visibleQuestions = getVisibleQuestions(definition, answers);
  const visibleQuestionIds = new Set(visibleQuestions.map((question) => question.id));
  const visibleAnswers = filterAnswersByQuestionIds(answers, visibleQuestionIds);
  const requiredMissingQuestionIds = findMissingRequiredQuestionIds(visibleQuestions, visibleAnswers);

  if (requiredMissingQuestionIds.length > 0) {
    return buildEvaluationResult({
      flags: [],
      missingQuestionIds: requiredMissingQuestionIds,
      nse: null,
      reasons: [
        {
          code: "missing_required_answer",
          reason: "Hay respuestas obligatorias pendientes."
        }
      ],
      result: "INCOMPLETE",
      safeExplanation: "El filtro está incompleto.",
      status: "INCOMPLETE"
    });
  }

  const ruleAndActionEvaluation = evaluateRulesAndOptionActions(
    definition,
    visibleAnswers,
    visibleQuestionIds
  );
  const firstTermination = ruleAndActionEvaluation.terminationReasons[0];

  if (firstTermination) {
    return buildEvaluationResult({
      flags: ruleAndActionEvaluation.flags,
      missingQuestionIds: [],
      nse: null,
      reasons: [firstTermination],
      result: "NOT_ELIGIBLE",
      safeExplanation: firstTermination.reason,
      status: "TERMINATED",
      termination: firstTermination
    });
  }

  const nse = definition.nse
    ? evaluateNseForVisibleQuestions(definition.nse, answers, visibleQuestionIds)
    : null;

  if (nse && nse.eligible === false) {
    const nseTermination = {
      code: definition.nse?.terminationCode ?? `${nse.code}_not_eligible`,
      reason:
        definition.nse?.terminationReason ??
        "La clasificacion calculada no es elegible para este estudio."
    };

    return buildEvaluationResult({
      flags: ruleAndActionEvaluation.flags,
      missingQuestionIds: [],
      nse,
      reasons: [nseTermination],
      result: "NOT_ELIGIBLE",
      safeExplanation: nseTermination.reason,
      status: "TERMINATED",
      termination: nseTermination
    });
  }

  const pendingReviewReasons = [
    ...ruleAndActionEvaluation.pendingReviewReasons,
    ...ruleAndActionEvaluation.flags
      .filter((flag) => flag.requiresReview)
      .map((flag) => ({
        code: flag.code,
        questionId: flag.questionId,
        reason: flag.label ?? "La respuesta requiere revisión operativa."
      }))
  ];

  if (pendingReviewReasons.length > 0) {
    return buildEvaluationResult({
      flags: ruleAndActionEvaluation.flags,
      missingQuestionIds: [],
      nse,
      reasons: pendingReviewReasons,
      result: "PENDING_REVIEW",
      safeExplanation: "El filtro requiere revisión operativa.",
      status: "PENDING_REVIEW"
    });
  }

  return buildEvaluationResult({
    flags: ruleAndActionEvaluation.flags,
    missingQuestionIds: [],
    nse,
    reasons: [],
    result: "ELIGIBLE",
    safeExplanation: "El filtro es elegible.",
    status: "PASSED"
  });
}

export function isQuestionVisible(
  question: ScreenerQuestion,
  answers: ScreenerAnswers,
  _definition: ScreenerDefinition
): boolean {
  void _definition;

  if (!question.visibilityCondition) {
    return true;
  }

  return conditionMatches(question.visibilityCondition, answers);
}

export function getVisibleQuestions(
  definitionInput: ScreenerDefinition,
  answers: ScreenerAnswers
): ScreenerQuestion[] {
  const definition = parseScreenerDefinition(definitionInput);
  const visibleAnswers: ScreenerAnswers = {};
  const visibleQuestions: ScreenerQuestion[] = [];

  for (const question of [...definition.questions].sort((left, right) => left.order - right.order)) {
    if (!isQuestionVisible(question, visibleAnswers, definition)) {
      continue;
    }

    visibleQuestions.push(question);

    if (answers[question.id] !== undefined) {
      visibleAnswers[question.id] = answers[question.id];
    }
  }

  return visibleQuestions;
}

export function evaluateNse(
  nse: NseScoreTable,
  answers: ScreenerAnswers
): ScreenerNseEvaluation {
  const missingQuestionIds: string[] = [];
  let score = 0;

  for (const input of nse.inputs) {
    const answer = answers[input.questionId];

    if (isMissingAnswer(answer)) {
      missingQuestionIds.push(input.questionId);
      score += input.missingScore;
      continue;
    }

    for (const value of selectedComparableValues(answer)) {
      score += input.scoreByAnswer[String(value)] ?? 0;
    }
  }

  const range = nse.ranges.find((candidate) => score >= candidate.min && score <= candidate.max);

  return {
    classCode: range?.code,
    classLabel: range?.label,
    code: nse.code,
    eligible: range?.eligible,
    label: nse.label,
    missingQuestionIds,
    score
  };
}

function buildEvaluationResult(input: {
  flags: ScreenerEvaluationFlag[];
  missingQuestionIds: string[];
  nse: ScreenerNseEvaluation | null;
  reasons: ScreenerEvaluationReason[];
  result: ScreenerEvaluationResultKind;
  safeExplanation: string;
  status: ScreenerEvaluationStatus;
  termination?: ScreenerEvaluationReason;
}): ScreenerEvaluationResult {
  return {
    evaluationJson: {
      flags: input.flags,
      missingQuestionIds: input.missingQuestionIds,
      nse: input.nse,
      reasons: input.reasons,
      result: input.result,
      safeExplanation: input.safeExplanation,
      schemaVersion: "screening-evaluation.v1",
      status: input.status
    },
    flags: input.flags,
    missingQuestionIds: input.missingQuestionIds,
    nse: input.nse,
    result: input.result,
    status: input.status,
    termination: input.termination
  };
}

function findMissingRequiredQuestionIds(
  questions: ScreenerQuestion[],
  answers: ScreenerAnswers
): string[] {
  return questions
    .filter((question) => {
      if (!question.required) {
        return false;
      }

      const answer = answers[question.id];

      if (isMissingAnswer(answer)) {
        return true;
      }

      return answer === undefined ? true : requiresMissingOtherText(question, answer);
    })
    .map((question) => question.id);
}

function requiresMissingOtherText(question: ScreenerQuestion, answer: ScreenerAnswer): boolean {
  if (!("options" in question)) {
    return false;
  }

  const selectedValues = selectedComparableValues(answer).map(String);
  const selectedOtherOption = question.options.find(
    (option) => option.isOther && option.otherTextRequired && selectedValues.includes(option.value)
  );

  if (!selectedOtherOption) {
    return false;
  }

  return getOtherText(answer).trim().length === 0;
}

function evaluateRulesAndOptionActions(
  definition: ScreenerDefinition,
  answers: ScreenerAnswers,
  visibleQuestionIds: Set<string>
): EvaluationAccumulator {
  const accumulator: EvaluationAccumulator = {
    flags: [],
    pendingReviewReasons: [],
    terminationReasons: []
  };

  for (const question of definition.questions) {
    if (!visibleQuestionIds.has(question.id)) {
      continue;
    }

    if (!("options" in question)) {
      continue;
    }

    const answer = answers[question.id];

    if (isMissingAnswer(answer)) {
      continue;
    }

    const selectedValues = selectedComparableValues(answer).map(String);

    for (const option of question.options) {
      if (!selectedValues.includes(option.value)) {
        continue;
      }

      for (const action of option.actions) {
        applyOutcome(action, accumulator, question.id);
      }
    }
  }

  for (const rule of [...definition.rules].sort((left, right) => left.order - right.order)) {
    if (!conditionMatches(rule.condition, answers)) {
      continue;
    }

    applyOutcome(rule.outcome, accumulator);
  }

  return accumulator;
}

function evaluateNseForVisibleQuestions(
  nse: NseScoreTable,
  answers: ScreenerAnswers,
  visibleQuestionIds: Set<string>
): ScreenerNseEvaluation {
  return evaluateNse(
    {
      ...nse,
      inputs: nse.inputs.filter(
        (input) => visibleQuestionIds.has(input.questionId) || !isMissingAnswer(answers[input.questionId])
      )
    },
    answers
  );
}

function filterAnswersByQuestionIds(
  answers: ScreenerAnswers,
  questionIds: Set<string>
): ScreenerAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => questionIds.has(questionId))
  );
}

function applyOutcome(
  outcome: ScreenerOptionAction | ScreenerRuleOutcome,
  accumulator: EvaluationAccumulator,
  questionId?: string
) {
  switch (outcome.type) {
    case "CONTINUE":
      return;
    case "TERMINATE":
      accumulator.terminationReasons.push({
        code: outcome.code,
        questionId,
        reason: outcome.reason
      });
      return;
    case "PENDING_REVIEW":
      accumulator.pendingReviewReasons.push({
        code: outcome.code,
        questionId,
        reason: outcome.reason
      });
      return;
    case "FLAG":
      accumulator.flags.push({
        code: outcome.code,
        label: outcome.label,
        questionId,
        requiresReview: outcome.requiresReview
      });
      return;
  }
}

export function conditionMatches(
  condition: ScreenerCondition,
  answers: ScreenerAnswers
): boolean {
  switch (condition.type) {
    case "ANY":
      return condition.conditions.some((nestedCondition) => conditionMatches(nestedCondition, answers));
    case "ALL":
      return condition.conditions.every((nestedCondition) => conditionMatches(nestedCondition, answers));
    case "ANSWER_EQUALS":
      return selectedComparableValues(answers[condition.questionId]).some(
        (value) => value === condition.value
      );
    case "ANY_SELECTED":
      return condition.values.some((value) =>
        selectedComparableValues(answers[condition.questionId]).includes(value)
      );
    case "ALL_SELECTED":
      return condition.values.every((value) =>
        selectedComparableValues(answers[condition.questionId]).includes(value)
      );
    case "NONE_SELECTED":
      return condition.values.every(
        (value) => !selectedComparableValues(answers[condition.questionId]).includes(value)
      );
    case "NUMBER_RANGE":
      return selectedComparableValues(answers[condition.questionId]).some((value) => {
        if (typeof value !== "number") {
          return false;
        }

        return (
          (condition.min === undefined || value >= condition.min) &&
          (condition.max === undefined || value <= condition.max)
        );
      });
  }
}

function selectedComparableValues(answer: ScreenerAnswer | undefined): ScreenerComparableValue[] {
  if (answer === undefined) {
    return [];
  }

  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
    return [answer];
  }

  if (Array.isArray(answer)) {
    return answer;
  }

  if (answer.values) {
    return answer.values;
  }

  if (answer.value !== undefined) {
    return [answer.value];
  }

  return [];
}

function getOtherText(answer: ScreenerAnswer): string {
  if (answer && typeof answer === "object" && !Array.isArray(answer) && "otherText" in answer) {
    return answer.otherText ?? "";
  }

  return "";
}

function isMissingAnswer(answer: ScreenerAnswer | undefined): boolean {
  if (answer === undefined || answer === null) {
    return true;
  }

  if (typeof answer === "string") {
    return answer.trim().length === 0;
  }

  if (Array.isArray(answer)) {
    return answer.length === 0;
  }

  if (typeof answer === "object") {
    return selectedComparableValues(answer).length === 0;
  }

  return false;
}
