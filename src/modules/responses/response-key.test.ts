import { describe, expect, it } from "vitest";
import { buildResearchResponseKey, validateUniqueResponseKeys } from "./response-key";

describe("research response keys", () => {
  it("builds deterministic keys from question, block, and context without PII", () => {
    const key = buildResearchResponseKey({
      questionId: "q-attribute-intensity",
      blockInstanceKey: "fragance-attributes",
      context: {
        type: "product",
        productId: "product-a"
      }
    });

    expect(key).toBe(
      "question=q-attribute-intensity|block=fragance-attributes|context=product|contextId=product-a"
    );
    expect(key).not.toContain("@");
    expect(key).not.toContain("phone");
  });

  it("prevents duplicate responseKey values inside the same participant activity", () => {
    const responseKey = buildResearchResponseKey({
      questionId: "q-1",
      context: { type: "none" }
    });

    const result = validateUniqueResponseKeys([
      {
        participantActivityId: "activity-1",
        responseKey
      },
      {
        participantActivityId: "activity-1",
        responseKey
      }
    ]);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.duplicateKeys).toEqual([`activity-1:${responseKey}`]);
    }
  });

  it("allows the same responseKey in different activities", () => {
    const responseKey = buildResearchResponseKey({
      questionId: "q-1",
      context: { type: "none" }
    });

    expect(
      validateUniqueResponseKeys([
        {
          participantActivityId: "activity-1",
          responseKey
        },
        {
          participantActivityId: "activity-2",
          responseKey
        }
      ]).success
    ).toBe(true);
  });
});
