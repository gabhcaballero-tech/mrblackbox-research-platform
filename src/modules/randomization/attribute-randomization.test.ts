import { describe, expect, it } from "vitest";
import {
  attributeLibrary,
  attributeRandomizationConfig
} from "@/modules/testing/fixtures";
import {
  buildAttributeRandomization,
  DEFAULT_OTHER_ATTRIBUTE_QUESTION,
  validateOtherAttributeAnswer
} from ".";

const contexts = [
  { type: "product" as const, id: "fragance-a" },
  { type: "product" as const, id: "fragance-b" }
];

describe("attribute randomization", () => {
  it("keeps the same randomized order when resuming with saved order", () => {
    const firstRun = buildAttributeRandomization({
      attributes: attributeLibrary,
      contexts,
      config: attributeRandomizationConfig,
      seed: "participant-1"
    });
    const resumedRun = buildAttributeRandomization({
      attributes: attributeLibrary,
      contexts,
      config: attributeRandomizationConfig,
      seed: "a-different-seed-should-not-matter-when-saved",
      savedOrders: Object.values(firstRun.ordersByKey)
    });

    expect(resumedRun.ordersByKey.shared.orderedAttributeIds).toEqual(
      firstRun.ordersByKey.shared.orderedAttributeIds
    );
    expect(resumedRun.groupsByContextKey["product:fragance-a"]).toHaveLength(3);
    expect(resumedRun.groupsByContextKey["product:fragance-a"][0].attributeIds).toHaveLength(5);
  });

  it("supports the same order versus independent order between fragances", () => {
    const sharedOrder = buildAttributeRandomization({
      attributes: attributeLibrary,
      contexts,
      config: { ...attributeRandomizationConfig, shareOrderAcrossProducts: true },
      seed: "participant-1"
    });
    const independentOrder = buildAttributeRandomization({
      attributes: attributeLibrary,
      contexts,
      config: { ...attributeRandomizationConfig, shareOrderAcrossProducts: false },
      seed: "participant-1"
    });

    expect(sharedOrder.contextOrderKeys["product:fragance-a"]).toBe("shared");
    expect(sharedOrder.contextOrderKeys["product:fragance-b"]).toBe("shared");
    expect(independentOrder.contextOrderKeys["product:fragance-a"]).toBe("product:fragance-a");
    expect(independentOrder.contextOrderKeys["product:fragance-b"]).toBe("product:fragance-b");
    expect(independentOrder.ordersByKey["product:fragance-a"].orderedAttributeIds).not.toEqual(
      independentOrder.ordersByKey["product:fragance-b"].orderedAttributeIds
    );
  });

  it("keeps the final other-attribute question outside attribute groups and requires text for yes", () => {
    const result = buildAttributeRandomization({
      attributes: attributeLibrary,
      contexts,
      config: attributeRandomizationConfig,
      seed: "participant-1"
    });
    const groupedAttributeIds = result.groupsByContextKey["product:fragance-a"].flatMap(
      (group) => group.attributeIds
    );

    expect(result.finalQuestion.text).toBe(DEFAULT_OTHER_ATTRIBUTE_QUESTION);
    expect(groupedAttributeIds).not.toContain(DEFAULT_OTHER_ATTRIBUTE_QUESTION);
    expect(validateOtherAttributeAnswer({ answer: "yes" }).success).toBe(false);
    expect(validateOtherAttributeAnswer({ answer: "yes", text: "Mas floral" }).success).toBe(
      true
    );
    expect(validateOtherAttributeAnswer({ answer: "no" }).success).toBe(true);
  });
});
