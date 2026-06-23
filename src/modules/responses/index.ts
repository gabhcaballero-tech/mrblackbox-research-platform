export { buildResearchResponseKey, validateUniqueResponseKeys } from "./response-key";
export type { ResponseKeyValidationResult } from "./response-key";
export {
  researchResponseContextSchema,
  researchResponseIdentitySchema,
  researchResponseKeyInputSchema
} from "./schemas";
export type {
  ResearchResponseContext,
  ResearchResponseIdentity,
  ResearchResponseKeyInput
} from "./schemas";

export const responsesModule = {
  key: "responses",
  status: "planned",
  description: "Boundary for research response identity and autosave-safe keys."
} as const;
