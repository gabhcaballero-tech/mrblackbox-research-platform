import { describe, expect, it } from "vitest";
import { validManualRotation } from "@/modules/testing/fixtures";
import { validateManualTwoArmRotation } from "./manual-rotation";

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
});
