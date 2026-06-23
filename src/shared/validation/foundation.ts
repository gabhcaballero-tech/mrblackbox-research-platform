import { z } from "zod";

export const foundationStatusSchema = z.enum(["planned", "ready", "blocked"]);

export type FoundationStatus = z.infer<typeof foundationStatusSchema>;

export function isFoundationStatus(value: unknown): value is FoundationStatus {
  return foundationStatusSchema.safeParse(value).success;
}
