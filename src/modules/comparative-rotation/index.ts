export { validateManualTwoArmRotation } from "./manual-rotation";
export type { ManualRotationValidationResult } from "./manual-rotation";
export { validateRotationPersistenceConsistency } from "./persistence-consistency";
export type {
  RotationPersistenceConsistencyInput,
  RotationPersistenceConsistencyResult
} from "./persistence-consistency";
export {
  manualTwoArmRotationAssignmentSchema,
  participantArmAssignmentSchema,
  rotationArmCodeSchema
} from "./schemas";
export type {
  ManualTwoArmRotationAssignment,
  ParticipantArmAssignment,
  RotationArmCode
} from "./schemas";
export * from "./admin-repository";
export * from "./admin-service";
export * from "./admin-validation";

export const comparativeRotationModule = {
  key: "comparative-rotation",
  status: "ready",
  description: "Manual two-arm comparative rotation configuration and assignment rules."
} as const;
