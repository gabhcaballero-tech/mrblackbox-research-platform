import { z } from "zod";

export const DEFAULT_OTHER_ATTRIBUTE_QUESTION =
  "¿Hay algún otro atributo que describa esta fragancia?";

export const attributeDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    libraryRevisionId: z.string().trim().min(1).optional()
  })
  .strict();

export const randomizationContextSchema = z
  .object({
    type: z.enum(["product", "arm"]),
    id: z.string().trim().min(1)
  })
  .strict();

export const attributeRandomizationConfigSchema = z
  .object({
    questionnaireVersionId: z.string().trim().min(1),
    blockInstanceKey: z.string().trim().min(1),
    shareOrderAcrossProducts: z.boolean(),
    groupSize: z.number().int().min(1),
    instructionText: z.string().trim().min(1),
    finalQuestionText: z.string().trim().min(1).default(DEFAULT_OTHER_ATTRIBUTE_QUESTION)
  })
  .strict();

export const participantAttributeOrderSchema = z
  .object({
    orderKey: z.string().trim().min(1),
    contextType: z.enum(["shared", "product", "arm"]),
    contextId: z.string().trim().min(1).optional(),
    seed: z.string().trim().min(1),
    questionnaireVersionId: z.string().trim().min(1),
    blockInstanceKey: z.string().trim().min(1),
    orderedAttributeIds: z.array(z.string().trim().min(1)).min(1)
  })
  .strict();

export const attributeGroupSchema = z
  .object({
    instructionText: z.string().trim().min(1),
    attributeIds: z.array(z.string().trim().min(1)).min(1)
  })
  .strict();

export const otherAttributeAnswerSchema = z
  .object({
    answer: z.enum(["yes", "no"]),
    text: z.string().optional()
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.answer === "yes" && (!answer.text || answer.text.trim().length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Text is required when the final attribute answer is yes.",
        path: ["text"]
      });
    }
  });

export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;
export type AttributeGroup = z.infer<typeof attributeGroupSchema>;
export type AttributeRandomizationConfig = z.infer<typeof attributeRandomizationConfigSchema>;
export type OtherAttributeAnswer = z.infer<typeof otherAttributeAnswerSchema>;
export type ParticipantAttributeOrder = z.infer<typeof participantAttributeOrderSchema>;
export type RandomizationContext = z.infer<typeof randomizationContextSchema>;

export type AttributeRandomizationResult = {
  ordersByKey: Record<string, ParticipantAttributeOrder>;
  contextOrderKeys: Record<string, string>;
  groupsByContextKey: Record<string, AttributeGroup[]>;
  finalQuestion: {
    text: string;
    responseOptions: ["yes", "no"];
    requiresTextWhen: "yes";
  };
};
