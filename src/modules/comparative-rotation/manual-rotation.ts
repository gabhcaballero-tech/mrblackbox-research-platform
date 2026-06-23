import {
  manualTwoArmRotationAssignmentSchema,
  type ManualTwoArmRotationAssignment,
  type ParticipantArmAssignment
} from "./schemas";

export type ManualRotationValidationResult =
  | {
      success: true;
      assignment: ManualTwoArmRotationAssignment;
      leftArm: ParticipantArmAssignment;
      rightArm: ParticipantArmAssignment;
      orderedArms: ParticipantArmAssignment[];
    }
  | {
      success: false;
      errors: string[];
    };

export function validateManualTwoArmRotation(
  assignmentInput: ManualTwoArmRotationAssignment
): ManualRotationValidationResult {
  const parsed = manualTwoArmRotationAssignmentSchema.safeParse(assignmentInput);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => issue.message)
    };
  }

  const leftArm = parsed.data.arms.find((arm) => arm.armCode === "left");
  const rightArm = parsed.data.arms.find((arm) => arm.armCode === "right");

  if (!leftArm || !rightArm) {
    return {
      success: false,
      errors: ["A manual two-arm rotation must include both left and right arms."]
    };
  }

  return {
    success: true,
    assignment: parsed.data,
    leftArm,
    rightArm,
    orderedArms: [...parsed.data.arms].sort((first, second) => {
      return first.applicationOrder - second.applicationOrder;
    })
  };
}
