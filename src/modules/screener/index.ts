export {
  canonicalizeScreenerDefinition,
  createEmptyScreenerDefinition,
  hashScreenerDefinition,
  parseScreenerDefinition,
  projectScreenerDefinitionForRole,
  screenerDataDestinationSchema,
  screenerDefinitionSchema,
  screenerQuestionSchema,
  screenerQuestionTypeSchema,
  validateScreenerDefinitionForPublication
} from "./definition";
export type {
  NseScoreTable,
  ParticipantProfileBinding,
  ScreenerComparableValue,
  ScreenerCondition,
  ScreenerDataDestination,
  ScreenerDefinition,
  ScreenerOption,
  ScreenerOptionAction,
  ScreenerQuestion,
  ScreenerQuestionType,
  ScreenerRule
} from "./definition";
export {
  conditionMatches,
  evaluateNse,
  evaluateScreener,
  getVisibleQuestions,
  isQuestionVisible
} from "./evaluator";
export type {
  ScreenerAnswer,
  ScreenerAnswers,
  ScreenerEvaluationReason,
  ScreenerEvaluationResult,
  ScreenerEvaluationStatus,
  ScreeningAttemptEvaluationJson
} from "./evaluator";

export const screenerModule = {
  description: "Boundary for screener builder, immutable versions, and pure evaluation.",
  key: "screener",
  status: "active"
} as const;
