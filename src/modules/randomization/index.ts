export {
  buildAttributeRandomization,
  getContextKey,
  validateOtherAttributeAnswer
} from "./attribute-randomization";
export {
  attributeDefinitionSchema,
  attributeGroupSchema,
  attributeRandomizationConfigSchema,
  DEFAULT_OTHER_ATTRIBUTE_QUESTION,
  otherAttributeAnswerSchema,
  participantAttributeOrderSchema,
  randomizationContextSchema
} from "./schemas";
export type {
  AttributeDefinition,
  AttributeGroup,
  AttributeRandomizationConfig,
  AttributeRandomizationResult,
  OtherAttributeAnswer,
  ParticipantAttributeOrder,
  RandomizationContext
} from "./schemas";

export const randomizationModule = {
  key: "randomization",
  status: "planned",
  description: "Boundary for stable attribute randomization and future randomization rules."
} as const;
