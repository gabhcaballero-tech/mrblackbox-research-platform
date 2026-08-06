import { describe, expect, it } from "vitest";
import { getInternalRouteDecision, isPublicCtlPath, isPublicPath, sanitizeInternalNextPath } from "./routes";

describe("auth route rules", () => {
  it("keeps participant token routes public", () => {
    expect(isPublicPath("/p/token-generico")).toBe(true);
    expect(getInternalRouteDecision("/p/token-generico", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/ctl/FMASCULINA-NAVIGO-2026", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/ctl/FMASCULINA-NAVIGO-2026/sessions/session-1", false)).toEqual({
      action: "allow"
    });
    expect(isPublicCtlPath("/ctl/FMASCULINA-NAVIGO-2026")).toBe(true);
    expect(isPublicCtlPath("/ctl/FMASCULINA-NAVIGO-2026/sessions/session-1")).toBe(true);
    expect(isPublicCtlPath("/ctl/FMASCULINA-NAVIGO-2026/admin")).toBe(false);
    expect(getInternalRouteDecision("/hut/p/token-generico", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/hut/register/token-generico", false)).toEqual({ action: "allow" });
  });

  it("keeps participant portal routes public at proxy level", () => {
    expect(isPublicPath("/participar/FMASCULINA-NAVIGO-2026")).toBe(true);
    expect(getInternalRouteDecision("/participar/FMASCULINA-NAVIGO-2026/filtro", false)).toEqual({
      action: "allow"
    });
    expect(getInternalRouteDecision("/participar/FMASCULINA-NAVIGO-2026/verificar", false)).toEqual({
      action: "allow"
    });
  });

  it("redirects unauthenticated internal routes to login", () => {
    expect(getInternalRouteDecision("/admin", false)).toEqual({
      action: "redirect",
      destination: "/login?next=%2Fadmin"
    });
    expect(getInternalRouteDecision("/field", false)).toEqual({
      action: "redirect",
      destination: "/login?next=%2Ffield"
    });
    expect(getInternalRouteDecision("/field/studies/study-1", false)).toEqual({
      action: "redirect",
      destination: "/login?next=%2Ffield%2Fstudies%2Fstudy-1"
    });
  });

  it("keeps public field screening capture routes public without opening all field", () => {
    expect(getInternalRouteDecision("/field/studies/study-1/screening/new", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/field/screening/attempt-1", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/field/screening/attempt-1/result", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/field/screening/attempt-1/selfie", false)).toEqual({ action: "allow" });
    expect(getInternalRouteDecision("/field/screening/attempt-1/evidences", false)).toEqual({ action: "allow" });
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
