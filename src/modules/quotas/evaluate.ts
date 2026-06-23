import {
  quotaDefinitionSchema,
  quotaEvaluationContextSchema,
  type QuotaCriterion,
  type QuotaCriterionValue,
  type QuotaDefinition,
  type QuotaEvaluationContext
} from "./schemas";

export type QuotaEvaluationResult = {
  quotaId: string;
  quotaName: string;
  matched: boolean;
  countingStage: QuotaDefinition["countingStage"];
  currentCount: number;
  targetCount: number;
  isFull: boolean;
  warningShown: boolean;
  blocksInterview: false;
  message?: string;
};

export function evaluateQuota(
  definitionInput: QuotaDefinition,
  contextInput: QuotaEvaluationContext
): QuotaEvaluationResult {
  const definition = quotaDefinitionSchema.parse(definitionInput);
  const context = quotaEvaluationContextSchema.parse(contextInput);
  const matched =
    definition.status === "active" &&
    definition.countingStage === context.countingStage &&
    definition.criteria.every((criterion) =>
      criterionMatches(criterion, context.attributes[criterion.field])
    );
  const warningThreshold = definition.warningThreshold ?? definition.targetCount;
  const isFull = matched && context.currentCount >= definition.targetCount;
  const warningShown = matched && context.currentCount >= warningThreshold;

  return {
    quotaId: definition.id,
    quotaName: definition.name,
    matched,
    countingStage: definition.countingStage,
    currentCount: context.currentCount,
    targetCount: definition.targetCount,
    isFull,
    warningShown,
    blocksInterview: false,
    message: warningShown
      ? `Quota "${definition.name}" is at or above its configured threshold.`
      : undefined
  };
}

function criterionMatches(
  criterion: QuotaCriterion,
  value: QuotaCriterionValue | undefined
): boolean {
  if (value === undefined) {
    return false;
  }

  switch (criterion.operator) {
    case "equals":
      return value === criterion.value;
    case "in":
      return criterion.values?.includes(value) ?? false;
    case "range":
      if (typeof value !== "number") {
        return false;
      }

      return (
        (criterion.min === undefined || value >= criterion.min) &&
        (criterion.max === undefined || value <= criterion.max)
      );
    default:
      return false;
  }
}
