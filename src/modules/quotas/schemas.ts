import { z } from "zod";

export const quotaCountingStageSchema = z.enum([
  "screening_passed",
  "participant_assigned",
  "first_measurement_completed",
  "study_completed"
]);

export const quotaCriterionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const quotaCriterionSchema = z
  .object({
    field: z.string().trim().min(1),
    operator: z.enum(["equals", "in", "range"]),
    value: quotaCriterionValueSchema.optional(),
    values: z.array(quotaCriterionValueSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .strict();

export const quotaDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    criteria: z.array(quotaCriterionSchema).min(1),
    countingStage: quotaCountingStageSchema,
    targetCount: z.number().int().min(0),
    warningThreshold: z.number().int().min(0).optional(),
    status: z.enum(["active", "inactive"]).default("active")
  })
  .strict();

export const quotaEvaluationContextSchema = z
  .object({
    attributes: z.record(z.string(), quotaCriterionValueSchema.optional()),
    countingStage: quotaCountingStageSchema,
    currentCount: z.number().int().min(0)
  })
  .strict();

export type QuotaCountingStage = z.infer<typeof quotaCountingStageSchema>;
export type QuotaCriterion = z.infer<typeof quotaCriterionSchema>;
export type QuotaDefinition = z.infer<typeof quotaDefinitionSchema>;
export type QuotaEvaluationContext = z.infer<typeof quotaEvaluationContextSchema>;
export type QuotaCriterionValue = z.infer<typeof quotaCriterionValueSchema>;
