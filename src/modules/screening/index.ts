export {
  calculateScreeningScore,
  classifyScore,
  evaluateScreening
} from "./engine";
export type {
  ScreeningEvaluationResult,
  ScreeningScoreResult
} from "./engine";
export {
  scoreRangeSchema,
  screeningAnswersSchema,
  screeningConditionSchema,
  screeningDefinitionSchema,
  screeningQuestionSchema,
  screeningQuestionTypeSchema,
  screeningRuleSchema,
  screeningScoreCalculationSchema,
  screeningStatusSchema
} from "./schemas";
export type {
  ScreeningAnswers,
  ScreeningAnswerValue,
  ScreeningCondition,
  ScreeningDefinition,
  ScreeningQuestion,
  ScreeningRule,
  ScreeningScoreCalculation,
  ScreeningScoreRange,
  ScreeningStatus
} from "./schemas";

export const screeningModule = {
  key: "screening",
  status: "planned",
  description: "Boundary for configurable screening rules, scoring, and classification."
} as const;
