import { describe, expect, it, vi } from "vitest";
import { getFieldActorForRequest } from "./auth";
import { PUBLIC_FIELD_ACTOR } from "./service";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("@/shared/auth/session", () => ({
  getCurrentInternalAccess: vi.fn()
}));

describe("field auth", () => {
  it("uses the public field actor when there is no internal user", async () => {
    const { getCurrentInternalAccess } = await import("@/shared/auth/session");

    vi.mocked(getCurrentInternalAccess).mockResolvedValueOnce({
      code: "NO_INTERNAL_USER",
      identity: { email: "persona@example.com", id: "participant-auth-1" },
      internalUser: null,
      status: "denied"
    });

    await expect(getFieldActorForRequest()).resolves.toEqual(PUBLIC_FIELD_ACTOR);
  });

  it("keeps unauthorized internal users blocked", async () => {
    const { getCurrentInternalAccess } = await import("@/shared/auth/session");

    vi.mocked(getCurrentInternalAccess).mockResolvedValueOnce({
      code: "MISSING_CAPABILITY",
      identity: { email: "analyst@example.com", id: "auth-1" },
      internalUser: {
        authUserId: "auth-1",
        email: "analyst@example.com",
        id: "analyst-1",
        name: "Analyst",
        role: "ANALYST",
        status: "ACTIVE"
      },
      status: "denied"
    });

    await expect(getFieldActorForRequest()).rejects.toThrow("redirect:/unauthorized");
  });
});
