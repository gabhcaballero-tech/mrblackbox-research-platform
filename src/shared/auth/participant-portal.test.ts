import { describe, expect, it, vi } from "vitest";
import { getParticipantPortalAuth } from "./participant-portal";
import type { ParticipantPortalRepository } from "@/modules/participant-portal/repository";

function repository(internalUser: { id: string } | null): ParticipantPortalRepository {
  return {
    countOtpLogsSince: vi.fn(),
    createOtpLog: vi.fn(),
    findInternalUserByAuthUserId: vi.fn(async () => internalUser),
    findRecentOtpRequest: vi.fn(),
    getStudyByCode: vi.fn()
  };
}

function supabase(userId: string) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { email: "persona@example.com", id: userId } },
        error: null
      })),
      signOut: vi.fn()
    }
  };
}

describe("participant portal auth", () => {
  it("blocks InternalUser from participant portal registration", async () => {
    const result = await getParticipantPortalAuth({
      repository: repository({ id: "internal-user-1" }),
      supabase: supabase("11111111-1111-4111-8111-111111111111")
    });

    expect(result).toMatchObject({
      message: "Este acceso está reservado para participantes.",
      status: "internal_user_blocked"
    });
  });

  it("allows participant auth user without InternalUser", async () => {
    const result = await getParticipantPortalAuth({
      repository: repository(null),
      supabase: supabase("11111111-1111-4111-8111-111111111111")
    });

    expect(result).toMatchObject({
      status: "allowed"
    });
  });
});
