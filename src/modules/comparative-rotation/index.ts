export { validateManualTwoArmRotation } from "./manual-rotation";
export type { ManualRotationValidationResult } from "./manual-rotation";
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

export const comparativeRotationModule = {
  key: "comparative-rotation",
  status: "planned",
  description: "Boundary for manual two-arm comparative rotation assignments."
} as const;
