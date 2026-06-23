import { z } from "zod";

export const screeningStatusSchema = z.enum(["passed", "terminated", "incomplete"]);

export const screeningAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()]))
]);

export const screeningQuestionTypeSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "number",
  "text",
  "yes_no"
]);

export const screeningOptionSchema = z
  .object({
    value: z.string().trim().min(1),
    label: z.string().trim().min(1),
    score: z.number().optional()
  })
  .strict();

export const screeningQuestionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    type: screeningQuestionTypeSchema,
    required: z.boolean().default(false),
    options: z.array(screeningOptionSchema).optional()
  })
  .strict();

export const screeningConditionSchema = z
  .object({
    operator: z.enum(["equals", "includes", "one_of", "range"]),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .strict();

export const screeningRuleSchema = z
  .object({
    questionId: z.string().trim().min(1),
    action: z.enum(["continue", "terminate", "terminate_on_selection"]),
    condition: screeningConditionSchema,
    terminationCode: z.string().trim().min(1).optional(),
    terminationReason: z.string().trim().min(1).optional()
  })
  .strict();

export const screeningScoreInputSchema = z
  .object({
    questionId: z.string().trim().min(1),
    scoreByAnswer: z.record(z.string(), z.number()),
    missingScore: z.number().default(0)
  })
  .strict();

export const scoreRangeSchema = z
  .object({
    code: z.string().trim().min(1),
    label: z.string().trim().min(1),
    min: z.number(),
    max: z.number()
  })
  .strict()
  .refine((range) => range.min <= range.max, {
    message: "Range min must be less than or equal to max."
  });

export const screeningScoreCalculationSchema = z
  .object({
    code: z.string().trim().min(1),
    label: z.string().trim().min(1),
    inputs: z.array(screeningScoreInputSchema).min(1),
    ranges: z.array(scoreRangeSchema).optional()
  })
  .strict();

export const screeningDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    questions: z.array(screeningQuestionSchema).min(1),
    rules: z.array(screeningRuleSchema).default([]),
    scoreCalculations: z.array(screeningScoreCalculationSchema).default([])
  })
  .strict();

export const screeningAnswersSchema = z.record(z.string(), screeningAnswerValueSchema);

export type ScreeningAnswerValue = z.infer<typeof screeningAnswerValueSchema>;
export type ScreeningAnswers = z.infer<typeof screeningAnswersSchema>;
export type ScreeningCondition = z.infer<typeof screeningConditionSchema>;
export type ScreeningDefinition = z.infer<typeof screeningDefinitionSchema>;
export type ScreeningQuestion = z.infer<typeof screeningQuestionSchema>;
export type ScreeningRule = z.infer<typeof screeningRuleSchema>;
export type ScreeningScoreCalculation = z.infer<typeof screeningScoreCalculationSchema>;
export type ScreeningScoreRange = z.infer<typeof scoreRangeSchema>;
export type ScreeningStatus = z.infer<typeof screeningStatusSchema>;
