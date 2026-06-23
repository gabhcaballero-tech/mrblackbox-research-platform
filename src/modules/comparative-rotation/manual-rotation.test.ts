import { describe, expect, it } from "vitest";
import { validManualRotation } from "@/modules/testing/fixtures";
import { validateManualTwoArmRotation } from "./manual-rotation";
import { validateRotationPersistenceConsistency } from "./persistence-consistency";

describe("manual two-arm rotation", () => {
  it("accepts a complete two-arm manual assignment", () => {
    const result = validateManualTwoArmRotation(validManualRotation);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.leftArm.realProductKey).toBe("fragance-a");
      expect(result.rightArm.realProductKey).toBe("fragance-b");
      expect(result.orderedArms.map((arm) => arm.participantVisibleLabel)).toEqual([
        "Primera fragancia",
        "Segunda fragancia"
      ]);
    }
  });

  it("rejects contradictory or incomplete two-arm assignments", () => {
    const result = validateManualTwoArmRotation({
      ...validManualRotation,
      arms: [
        {
          armCode: "left",
          realProductKey: "fragance-a",
          participantVisibleLabel: "fragance-a",
          applicationOrder: 1
        },
        {
          armCode: "left",
          realProductKey: "fragance-a",
          participantVisibleLabel: "Segunda fragancia",
          applicationOrder: 1
        }
      ]
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects persistence consistency when an arm or product belongs to another study", () => {
    const result = validateRotationPersistenceConsistency({
      study: { id: "study-1" },
      rotationPlan: { id: "rotation-plan-1", studyId: "study-1" },
      studyParticipant: { id: "study-participant-1", studyId: "study-1" },
      participantRotationAssignment: {
        id: "participant-rotation-1",
        studyParticipantId: "study-participant-1",
        rotationPlanId: "rotation-plan-1",
        assignmentMode: "manual_cover_code"
      },
      participantArmAssignments: [
        {
          studyParticipantId: "study-participant-1",
          studyArm: { id: "arm-left", studyId: "study-1", code: "left" },
          studyProduct: {
            id: "product-a",
            studyId: "study-1",
            internalCode: "A",
            realName: "Fragancia A"
          },
          applicationOrder: 1,
          participantVisibleLabel: "Primera fragancia"
        },
        {
          studyParticipantId: "study-participant-1",
          studyArm: { id: "arm-right", studyId: "study-1", code: "right" },
          studyProduct: {
            id: "product-b",
            studyId: "other-study",
            internalCode: "B",
            realName: "Fragancia B"
          },
          applicationOrder: 2,
          participantVisibleLabel: "Segunda fragancia"
        }
      ]
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toContain("StudyProduct must belong to the same study.");
    }
  });

  it("rejects persistence consistency when arm assignment participant does not match rotation assignment", () => {
    const result = validateRotationPersistenceConsistency({
      study: { id: "study-1" },
      rotationPlan: { id: "rotation-plan-1", studyId: "study-1" },
      studyParticipant: { id: "study-participant-1", studyId: "study-1" },
      participantRotationAssignment: {
        id: "participant-rotation-1",
        studyParticipantId: "study-participant-1",
        rotationPlanId: "rotation-plan-1",
        assignmentMode: "manual_cover_code"
      },
      participantArmAssignments: [
        {
          studyParticipantId: "study-participant-1",
          studyArm: { id: "arm-left", studyId: "study-1", code: "left" },
          studyProduct: {
            id: "product-a",
            studyId: "study-1",
            internalCode: "A",
            realName: "Fragancia A"
          },
          applicationOrder: 1,
          participantVisibleLabel: "Primera fragancia"
        },
        {
          studyParticipantId: "different-participant",
          studyArm: { id: "arm-right", studyId: "study-1", code: "right" },
          studyProduct: {
            id: "product-b",
            studyId: "study-1",
            internalCode: "B",
            realName: "Fragancia B"
          },
          applicationOrder: 2,
          participantVisibleLabel: "Segunda fragancia"
        }
      ]
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toContain(
        "ParticipantArmAssignment must match the rotation assignment participant."
      );
    }
  });
});
