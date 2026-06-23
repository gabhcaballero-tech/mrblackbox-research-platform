import { z } from "zod";

export const participantTokenSchema = z
  .string()
  .trim()
  .min(6)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export type ParticipantToken = z.infer<typeof participantTokenSchema>;
