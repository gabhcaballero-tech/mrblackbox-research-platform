import { describe, expect, it } from "vitest";
import { participantProfileSchema, studyParticipantSchema } from "./schemas";

const now = "2026-06-22T12:00:00.000Z";

describe("participant domain separation", () => {
  it("keeps personal profile data separate from study participation", () => {
    const profile = participantProfileSchema.parse({
      id: "person-1",
      personalData: {
        name: "Persona generica",
        city: "Ciudad de prueba",
        email: "persona@example.com"
      },
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const participation = studyParticipantSchema.parse({
      id: "participation-1",
      participantProfileId: profile.id,
      studyId: "study-1",
      operationalStatus: "created",
      screeningStatus: "not_started",
      createdByUserId: "interviewer-1",
      createdAt: now,
      updatedAt: now
    });

    expect(profile).not.toHaveProperty("studyId");
    expect(participation.participantProfileId).toBe(profile.id);
    expect(participation.studyId).toBe("study-1");
  });

  it("rejects study-specific fields inside the personal profile", () => {
    expect(() =>
      participantProfileSchema.parse({
        id: "person-1",
        studyId: "study-1",
        personalData: { name: "Persona generica" },
        status: "active",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });
});
