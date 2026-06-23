export { evaluateQuota } from "./evaluate";
export type { QuotaEvaluationResult } from "./evaluate";
export {
  quotaCountingStageSchema,
  quotaCriterionSchema,
  quotaCriterionValueSchema,
  quotaDefinitionSchema,
  quotaEvaluationContextSchema
} from "./schemas";
export type {
  QuotaCountingStage,
  QuotaCriterion,
  QuotaCriterionValue,
  QuotaDefinition,
  QuotaEvaluationContext
} from "./schemas";

export const quotasModule = {
  key: "quotas",
  status: "planned",
  description: "Boundary for non-blocking quota evaluation and warnings."
} as const;
