import { describe, expect, it } from "vitest";
import { isFoundationStatus } from "./foundation";

describe("isFoundationStatus", () => {
  it("accepts supported foundation statuses", () => {
    expect(isFoundationStatus("ready")).toBe(true);
    expect(isFoundationStatus("planned")).toBe(true);
    expect(isFoundationStatus("blocked")).toBe(true);
  });

  it("rejects unsupported statuses", () => {
    expect(isFoundationStatus("active")).toBe(false);
    expect(isFoundationStatus(null)).toBe(false);
  });
});
