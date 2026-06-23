import { describe, expect, it } from "vitest";
import { hasCapability, listCapabilities, type InternalUserRole } from "./permissions";

describe("role capabilities", () => {
  const roles: InternalUserRole[] = ["ADMIN", "SUPERVISOR", "INTERVIEWER", "ANALYST"];

  it("defines a role/capability matrix for every V1 role", () => {
    roles.forEach((role) => {
      expect(listCapabilities(role).length).toBeGreaterThan(0);
    });
  });

  it("allows ADMIN to access admin capabilities", () => {
    expect(hasCapability("ADMIN", "admin:access")).toBe(true);
    expect(hasCapability("ADMIN", "product-real:read")).toBe(true);
  });

  it("allows INTERVIEWER to access field but not admin", () => {
    expect(hasCapability("INTERVIEWER", "field:access")).toBe(true);
    expect(hasCapability("INTERVIEWER", "admin:access")).toBe(false);
  });

  it("keeps ANALYST limited to anonymized exports", () => {
    expect(hasCapability("ANALYST", "exports:anonymized")).toBe(true);
    expect(hasCapability("ANALYST", "participants:pii:read")).toBe(false);
    expect(hasCapability("ANALYST", "exports:pii")).toBe(false);
  });

  it("prevents SUPERVISOR from seeing real product keys", () => {
    expect(hasCapability("SUPERVISOR", "field:access")).toBe(true);
    expect(hasCapability("SUPERVISOR", "product-real:read")).toBe(false);
  });

  it("allows only ADMIN and SUPERVISOR to review screening attempts", () => {
    expect(hasCapability("ADMIN", "screening:review")).toBe(true);
    expect(hasCapability("SUPERVISOR", "screening:review")).toBe(true);
    expect(hasCapability("INTERVIEWER", "screening:review")).toBe(false);
    expect(hasCapability("ANALYST", "screening:review")).toBe(false);
  });
});
