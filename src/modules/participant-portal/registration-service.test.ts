import { describe, expect, it, vi } from "vitest";
import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import type { ParticipantPortalConfigRecord, ParticipantPortalStudyRecord } from "./repository";
import {
  PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
  registerParticipantInPortal
} from "./registration-service";
import type {
  CreatePortalConsentInput,
  ParticipantPortalRegistrationRepository,
  PortalRegistrationConsent,
  PortalRegistrationParticipantProfile,
  PortalRegistrationStudyParticipant
} from "./registration-repository";

const now = new Date("2026-06-23T12:00:00.000Z");
const identity: ParticipantPortalIdentity = {
  email: "persona@example.com",
  id: "11111111-1111-4111-8111-111111111111"
};

type ActivePortalStudy = ParticipantPortalStudyRecord & {
  activeScreenerVersionId: string;
  portalConfig: ParticipantPortalConfigRecord;
};

function portalStudy(overrides: Partial<ActivePortalStudy> = {}): ActivePortalStudy {
  return {
    activeScreenerVersionId: "version-1",
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Fragancia Masculina",
    portalConfig: {
      enabled: true,
      evidenceRetentionDays: 30,
      folioMaxSequence: 999,
      folioPrefix: "NAV",
      maxImageBytes: 8388608,
      maxOtpAttempts: 5,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1,
      nextFolioSequence: 1,
      otpCooldownSeconds: 60,
      privacyNoticeHash: "notice-hash",
      privacyNoticeText: "Aviso de privacidad exacto.",
      privacyNoticeVersion: "v1"
    },
    status: "ACTIVE" as const,
    ...overrides
  };
}

function validForm(overrides: Record<string, unknown> = {}) {
  return {
    consentPrivacy: "on",
    consentSensitive: "on",
    confirmPhone: "5512345678",
    name: "Persona Participante",
    phone: "5512345678",
    ...overrides
  };
}

function createRepository({
  consents = [],
  profiles = [],
  participants = []
}: {
  consents?: PortalRegistrationConsent[];
  profiles?: PortalRegistrationParticipantProfile[];
  participants?: PortalRegistrationStudyParticipant[];
} = {}) {
  const consentInputs: CreatePortalConsentInput[] = [];
  const repository: ParticipantPortalRegistrationRepository = {
    createParticipantConsent: vi.fn(async (input) => {
      consentInputs.push(input);
      const consent = {
        id: `consent-${consents.length + 1}`,
        noticeVersion: input.noticeVersion,
        studyParticipantId: input.studyParticipantId
      };
      consents.push(consent);
      return consent;
    }),
    createParticipantProfile: vi.fn(async (input) => {
      const profile = {
        createdByUserId: null,
        email: input.email,
        id: `profile-${profiles.length + 1}`,
        name: input.name,
        participantAuthUserId: input.participantAuthUserId,
        phone: input.phone
      };
      profiles.push(profile);
      return profile;
    }),
    createStudyParticipant: vi.fn(async (input) => {
      const participant = {
        createdByUserId: null,
        id: `study-participant-${participants.length + 1}`,
        participantProfileId: input.participantProfileId,
        screeningAttempts: [],
        studyId: input.studyId
      };
      participants.push(participant);
      return participant;
    }),
    findParticipantConsent: vi.fn(async (input) =>
      consents.find(
        (consent) =>
          consent.studyParticipantId === input.studyParticipantId &&
          consent.noticeVersion === input.noticeVersion
      ) ?? null
    ),
    findParticipantProfilesForRegistration: vi.fn(async (input) =>
      profiles.filter(
        (profile) =>
          profile.participantAuthUserId === input.participantAuthUserId ||
          profile.email === input.email ||
          profile.phone === input.phone
      )
    ),
    findStudyParticipant: vi.fn(async (input) =>
      participants.find(
        (participant) =>
          participant.participantProfileId === input.participantProfileId &&
          participant.studyId === input.studyId
      ) ?? null
    ),
    updateParticipantProfile: vi.fn(async (input) => {
      const index = profiles.findIndex((profile) => profile.id === input.id);
      const current = profiles[index]!;
      const updated = { ...current, ...input };
      profiles[index] = updated;
      return updated;
    })
  };

  return { consentInputs, consents, participants, profiles, repository };
}

describe("participant portal registration service", () => {
  it("blocks start when portal is disabled", async () => {
    const { repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy({ portalConfig: { ...portalStudy().portalConfig!, enabled: false } })
    });

    expect(result).toMatchObject({
      code: "PORTAL_UNAVAILABLE",
      ok: false
    });
  });

  it("requires name, phone, confirmation and consents", async () => {
    const { repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm({
        consentPrivacy: false,
        consentSensitive: false,
        confirmPhone: "",
        name: "",
        phone: ""
      }),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
    expect(result.ok ? null : result.fieldErrors?.name?.[0]).toBe("Ingresa tu nombre completo.");
    expect(result.ok ? null : result.fieldErrors?.phone?.[0]).toBe("Ingresa tu celular.");
    expect(result.ok ? null : result.fieldErrors?.confirmPhone?.[0]).toBe("Confirma el celular.");
    expect(result.ok ? null : result.fieldErrors?.consentPrivacy?.[0]).toBe("Debes aceptar el aviso de privacidad.");
    expect(result.ok ? null : result.fieldErrors?.consentSensitive?.[0]).toBe(
      "Debes otorgar el consentimiento expreso para continuar."
    );
  });

  it("accepts a 10-digit Mexico phone and normalizes it to +52", async () => {
    const { profiles, repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm({ phone: "5512345678", confirmPhone: "55 1234 5678" }),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok).toBe(true);
    expect(profiles[0]?.phone).toBe("+525512345678");
  });

  it("accepts +52 phone format", async () => {
    const { profiles, repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm({ phone: "+525512345678", confirmPhone: "+52 55 1234 5678" }),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok).toBe(true);
    expect(profiles[0]?.phone).toBe("+525512345678");
  });

  it("rejects mismatched phone confirmation", async () => {
    const { repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm({ confirmPhone: "5599999999" }),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok ? null : result.fieldErrors?.confirmPhone?.[0]).toBe(
      "El celular y la confirmación no coinciden."
    );
  });

  it("creates ParticipantProfile and StudyParticipant with createdByUserId null", async () => {
    const { participants, profiles, repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok).toBe(true);
    expect(profiles[0]).toMatchObject({
      createdByUserId: null,
      email: identity.email,
      participantAuthUserId: identity.id,
      phone: "+525512345678"
    });
    expect(participants[0]).toMatchObject({
      createdByUserId: null,
      participantProfileId: profiles[0]?.id,
      studyId: "study-1"
    });
  });

  it("reuses ParticipantProfile by participantAuthUserId", async () => {
    const existingProfile: PortalRegistrationParticipantProfile = {
      createdByUserId: null,
      email: identity.email,
      id: "profile-existing",
      name: "Nombre previo",
      participantAuthUserId: identity.id,
      phone: "+525500000000"
    };
    const { repository } = createRepository({ profiles: [existingProfile] });
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok ? result.data.participantProfile.id : null).toBe(existingProfile.id);
    expect(repository.createParticipantProfile).not.toHaveBeenCalled();
  });

  it("reuses ParticipantProfile by email", async () => {
    const existingProfile: PortalRegistrationParticipantProfile = {
      createdByUserId: null,
      email: identity.email,
      id: "profile-email",
      name: "Nombre previo",
      participantAuthUserId: null,
      phone: null
    };
    const { repository } = createRepository({ profiles: [existingProfile] });
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok ? result.data.participantProfile.id : null).toBe(existingProfile.id);
    expect(repository.updateParticipantProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: existingProfile.id,
      participantAuthUserId: identity.id
    }));
  });

  it("reuses ParticipantProfile by phone", async () => {
    const existingProfile: PortalRegistrationParticipantProfile = {
      createdByUserId: null,
      email: null,
      id: "profile-phone",
      name: "Nombre previo",
      participantAuthUserId: null,
      phone: "+525512345678"
    };
    const { repository } = createRepository({ profiles: [existingProfile] });
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok ? result.data.participantProfile.id : null).toBe(existingProfile.id);
    expect(repository.createParticipantProfile).not.toHaveBeenCalled();
  });

  it("blocks duplicate public registration when study participant already has an attempt", async () => {
    const existingProfile: PortalRegistrationParticipantProfile = {
      createdByUserId: null,
      email: identity.email,
      id: "profile-existing",
      name: "Nombre previo",
      participantAuthUserId: identity.id,
      phone: "+525512345678"
    };
    const existingParticipant: PortalRegistrationStudyParticipant = {
      createdByUserId: null,
      id: "study-participant-1",
      participantProfileId: existingProfile.id,
      screeningAttempts: [{ id: "attempt-1" }],
      studyId: "study-1"
    };
    const { repository } = createRepository({
      participants: [existingParticipant],
      profiles: [existingProfile]
    });
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result).toEqual({
      code: "DUPLICATE_WITH_ATTEMPT",
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      ok: false
    });
    expect(repository.createParticipantConsent).not.toHaveBeenCalled();
  });

  it("creates consent with noticeTextSnapshot", async () => {
    const { consentInputs, repository } = createRepository();
    const result = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(result.ok).toBe(true);
    expect(consentInputs[0]).toMatchObject({
      consentedAt: now,
      noticeHash: "notice-hash",
      noticeTextSnapshot: "Aviso de privacidad exacto.",
      noticeVersion: "v1",
      participantAuthUserId: identity.id
    });
  });

  it("does not duplicate consent on repeated submit", async () => {
    const { consents, repository } = createRepository();

    const first = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });
    const second = await registerParticipantInPortal({
      formInput: validForm(),
      identity,
      now,
      repository,
      study: portalStudy()
    });

    expect(first.ok).toBe(true);
    expect(second.ok ? second.data.consentReused : false).toBe(true);
    expect(consents).toHaveLength(1);
  });
});
