import { describe, expect, it } from "vitest";
import { fullQuotaContext, genericQuotaDefinition } from "@/modules/testing/fixtures";
import { evaluateQuota } from "./evaluate";

describe("quota evaluation", () => {
  it("warns when a matching quota is full without blocking the interview", () => {
    const result = evaluateQuota(genericQuotaDefinition, fullQuotaContext);

    expect(result.matched).toBe(true);
    expect(result.isFull).toBe(true);
    expect(result.warningShown).toBe(true);
    expect(result.blocksInterview).toBe(false);
  });
});
