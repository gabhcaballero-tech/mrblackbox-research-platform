import { describe, expect, it } from "vitest";
import { resolveInternalUserAccess, type InternalUserRecord, type SupabaseIdentity } from "./session";

const identity: SupabaseIdentity = {
  email: "internal@example.test",
  id: "11111111-1111-4111-8111-111111111111"
};

function internalUser(overrides: Partial<InternalUserRecord> = {}): InternalUserRecord {
  return {
    authUserId: identity.id,
    email: "internal@example.test",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Usuario interno",
    role: "ADMIN",
    status: "ACTIVE",
    ...overrides
  };
}

describe("internal session authorization", () => {
  it("denies requests without a Supabase session", () => {
    expect(
      resolveInternalUserAccess({
        identity: null,
        internalUser: null
      })
    ).toMatchObject({ code: "NO_SESSION", status: "denied" });
  });

  it("denies a session that has no linked InternalUser", () => {
    expect(
      resolveInternalUserAccess({
        identity,
        internalUser: null
      })
    ).toMatchObject({ code: "NO_INTERNAL_USER", status: "denied" });
  });

  it("denies inactive internal users", () => {
    expect(
      resolveInternalUserAccess({
        identity,
        internalUser: internalUser({ status: "INACTIVE" })
      })
    ).toMatchObject({ code: "INACTIVE_INTERNAL_USER", status: "denied" });
  });

  it("allows ADMIN into admin routes", () => {
    expect(
      resolveInternalUserAccess({
        identity,
        internalUser: internalUser({ role: "ADMIN" }),
        requiredCapability: "admin:access"
      })
    ).toMatchObject({ status: "allowed" });
  });

  it("denies INTERVIEWER for admin while allowing field capability", () => {
    expect(
      resolveInternalUserAccess({
        identity,
        internalUser: internalUser({ role: "INTERVIEWER" }),
        requiredCapability: "field:access"
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      resolveInternalUserAccess({
        identity,
        internalUser: internalUser({ role: "INTERVIEWER" }),
        requiredCapability: "admin:access"
      })
    ).toMatchObject({ code: "MISSING_CAPABILITY", status: "denied" });
  });
});
