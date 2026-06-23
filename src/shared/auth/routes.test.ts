import { describe, expect, it } from "vitest";
import { getInternalRouteDecision, isPublicPath, sanitizeInternalNextPath } from "./routes";

describe("auth route rules", () => {
  it("keeps participant token routes public", () => {
    expect(isPublicPath("/p/token-generico")).toBe(true);
    expect(getInternalRouteDecision("/p/token-generico", false)).toEqual({ action: "allow" });
  });

  it("redirects unauthenticated internal routes to login", () => {
    expect(getInternalRouteDecision("/admin", false)).toEqual({
      action: "redirect",
      destination: "/login?next=%2Fadmin"
    });
  });

  it("allows authenticated internal routes through proxy-level checks", () => {
    expect(getInternalRouteDecision("/field", true)).toEqual({ action: "allow" });
  });

  it("sanitizes unsafe next values", () => {
    expect(sanitizeInternalNextPath("https://evil.example/admin")).toBe("/admin");
    expect(sanitizeInternalNextPath("//evil.example/admin")).toBe("/admin");
    expect(sanitizeInternalNextPath("/p/public-token")).toBe("/admin");
    expect(sanitizeInternalNextPath("/field/today")).toBe("/field/today");
  });
});
