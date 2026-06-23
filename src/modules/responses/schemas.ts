import { z } from "zod";

export const researchResponseContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z
    .object({
      type: z.literal("product"),
      productId: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      type: z.literal("arm"),
      armId: z.string().trim().min(1)
    })
    .strict()
]);

export const researchResponseKeyInputSchema = z
  .object({
    questionId: z.string().trim().min(1),
    blockInstanceKey: z.string().trim().min(1).optional(),
    context: researchResponseContextSchema
  })
  .strict();

export const researchResponseIdentitySchema = z
  .object({
    participantActivityId: z.string().trim().min(1),
    responseKey: z.string().trim().min(1)
  })
  .strict();

export type ResearchResponseContext = z.infer<typeof researchResponseContextSchema>;
export type ResearchResponseKeyInput = z.infer<typeof researchResponseKeyInputSchema>;
export type ResearchResponseIdentity = z.infer<typeof researchResponseIdentitySchema>;
