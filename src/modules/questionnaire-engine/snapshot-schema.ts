import { z } from "zod";

const optionSchema = z
  .object({
    value: z.string().trim().min(1),
    label: z.string().trim().min(1),
    requiresText: z.boolean().default(false)
  })
  .strict();

const questionBaseSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    required: z.boolean().default(false)
  })
  .strict();

const singleChoiceQuestionSchema = questionBaseSchema.extend({
  type: z.literal("single_choice"),
  options: z.array(optionSchema).min(1)
});

const multipleChoiceQuestionSchema = questionBaseSchema.extend({
  type: z.literal("multiple_choice"),
  options: z.array(optionSchema).min(1),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional()
});

const textQuestionSchema = questionBaseSchema.extend({
  type: z.literal("text"),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional()
});

const numberQuestionSchema = questionBaseSchema.extend({
  type: z.literal("number"),
  min: z.number().optional(),
  max: z.number().optional()
});

const yesNoQuestionSchema = questionBaseSchema.extend({
  type: z.literal("yes_no")
});

const scaleQuestionSchema = questionBaseSchema.extend({
  type: z.literal("scale"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  minLabel: z.string().trim().min(1).optional(),
  maxLabel: z.string().trim().min(1).optional()
});

const matrixQuestionSchema = questionBaseSchema.extend({
  type: z.literal("matrix"),
  rows: z
    .array(
      z
        .object({
          id: z.string().trim().min(1),
          label: z.string().trim().min(1)
        })
        .strict()
    )
    .min(1),
  columns: z.array(optionSchema).min(1)
});

const attributeBlockQuestionSchema = questionBaseSchema.extend({
  type: z.literal("attribute_block"),
  blockInstanceKey: z.string().trim().min(1),
  attributeIds: z.array(z.string().trim().min(1)).min(1),
  groupSize: z.number().int().min(1),
  shareOrderAcrossProducts: z.boolean(),
  instructionText: z.string().trim().min(1),
  finalOtherAttributeQuestionText: z.string().trim().min(1)
});

export const questionnaireQuestionSchema = z.discriminatedUnion("type", [
  singleChoiceQuestionSchema,
  multipleChoiceQuestionSchema,
  textQuestionSchema,
  numberQuestionSchema,
  yesNoQuestionSchema,
  scaleQuestionSchema,
  matrixQuestionSchema,
  attributeBlockQuestionSchema
]);

export const questionnaireSnapshotSchema = z
  .object({
    id: z.string().trim().min(1),
    studyId: z.string().trim().min(1),
    questionnaireDraftId: z.string().trim().min(1),
    versionNumber: z.number().int().min(1),
    purpose: z.enum(["screener", "measurement", "followup", "admin"]),
    status: z.literal("published"),
    publishedAt: z.string().datetime(),
    definitionHash: z.string().trim().min(1),
    questions: z.array(questionnaireQuestionSchema).min(1)
  })
  .strict();

export type QuestionnaireOption = z.infer<typeof optionSchema>;
export type QuestionnaireQuestion = z.infer<typeof questionnaireQuestionSchema>;
export type QuestionnaireSnapshot = z.infer<typeof questionnaireSnapshotSchema>;
