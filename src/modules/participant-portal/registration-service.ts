import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import {
  buildParticipantConsentSnapshot,
  participantPortalRegistrationSchema,
  type ParticipantPortalRegistrationInput
} from "./validation";
import type {
  ParticipantPortalConfigRecord,
  ParticipantPortalStudyRecord
} from "./repository";
import {
  isPrismaUniqueConstraintError,
  type ParticipantPortalRegistrationRepository,
  type PortalRegistrationParticipantProfile,
  type PortalRegistrationStudyParticipant
} from "./registration-repository";

export const PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE =
  "Ya tenemos un registro asociado a tus datos. Por favor, comunícate con tu reclutador.";
export const PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE = "Registro completado correctamente.";

export type ParticipantPortalRegistrationFieldErrors = Partial<
  Record<keyof ParticipantPortalRegistrationInput, string[]>
>;

export type ParticipantPortalRegistrationErrorCode =
  | "DUPLICATE_WITH_ATTEMPT"
  | "MISSING_AUTH_EMAIL"
  | "PORTAL_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

export type ParticipantPortalRegistrationResult =
  | {
      data: {
        consentReused: boolean;
        createdParticipantProfile: boolean;
        createdStudyParticipant: boolean;
        participantProfile: PortalRegistrationParticipantProfile;
        studyParticipant: PortalRegistrationStudyParticipant;
      };
      ok: true;
    }
  | {
      code: ParticipantPortalRegistrationErrorCode;
      fieldErrors?: ParticipantPortalRegistrationFieldErrors;
      message: string;
      ok: false;
    };

export async function registerParticipantInPortal({
  formInput,
  identity,
  now = new Date(),
  repository,
  study
}: {
  formInput: unknown;
  identity: ParticipantPortalIdentity;
  now?: Date;
  repository: ParticipantPortalRegistrationRepository;
  study: ParticipantPortalStudyRecord & {
    activeScreenerVersionId: string;
    portalConfig: ParticipantPortalConfigRecord;
  };
}): Promise<ParticipantPortalRegistrationResult> {
  if (!study.portalConfig.enabled || study.status !== "ACTIVE" || !study.activeScreenerVersionId) {
    return {
      code: "PORTAL_UNAVAILABLE",
      message: "El portal de participación no está disponible en este momento.",
      ok: false
    };
  }

  if (!identity.email) {
    return {
      code: "MISSING_AUTH_EMAIL",
      message: "No se pudo confirmar el correo de acceso. Solicita un código nuevo.",
      ok: false
    };
  }

  const parsed = participantPortalRegistrationSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: "Revisa los datos de registro.",
      ok: false
    };
  }

  try {
    const profileResult = await findOrCreateParticipantProfile({
      email: identity.email,
      identity,
      input: parsed.data,
      repository
    });
    const studyParticipantResult = await findOrCreateStudyParticipant({
      participantProfileId: profileResult.profile.id,
      repository,
      studyId: study.id
    });

    if (studyParticipantResult.studyParticipant.screeningAttempts.length > 0) {
      return {
        code: "DUPLICATE_WITH_ATTEMPT",
        message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
        ok: false
      };
    }

    const consent = await createOrReuseConsent({
      identity,
      now,
      repository,
      studyParticipantId: studyParticipantResult.studyParticipant.id,
      portalConfig: study.portalConfig
    });

    return {
      data: {
        consentReused: consent.reused,
        createdParticipantProfile: profileResult.created,
        createdStudyParticipant: studyParticipantResult.created,
        participantProfile: profileResult.profile,
        studyParticipant: studyParticipantResult.studyParticipant
      },
      ok: true
    };
  } catch {
    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo completar el registro. Intenta nuevamente.",
      ok: false
    };
  }
}

async function findOrCreateParticipantProfile({
  email,
  identity,
  input,
  repository
}: {
  email: string;
  identity: ParticipantPortalIdentity;
  input: ParticipantPortalRegistrationInput;
  repository: ParticipantPortalRegistrationRepository;
}): Promise<{ created: boolean; profile: PortalRegistrationParticipantProfile }> {
  const matches = await repository.findParticipantProfilesForRegistration({
    email,
    participantAuthUserId: identity.id,
    phone: input.phone
  });
  const existing = selectBestProfileMatch(matches, {
    email,
    participantAuthUserId: identity.id,
    phone: input.phone
  });

  if (!existing) {
    return {
      created: true,
      profile: await repository.createParticipantProfile({
        email,
        name: input.name,
        participantAuthUserId: identity.id,
        phone: input.phone
      })
    };
  }

  const update: { email?: string; name?: string; participantAuthUserId?: string; phone?: string } = {};

  if (!existing.participantAuthUserId) {
    update.participantAuthUserId = identity.id;
  }

  if (!existing.email && email) {
    update.email = email;
  }

  if (!existing.phone) {
    update.phone = input.phone;
  }

  if (!existing.name.trim()) {
    update.name = input.name;
  }

  if (Object.keys(update).length === 0) {
    return {
      created: false,
      profile: existing
    };
  }

  return {
    created: false,
    profile: await repository.updateParticipantProfile({
      id: existing.id,
      ...update
    })
  };
}

async function findOrCreateStudyParticipant({
  participantProfileId,
  repository,
  studyId
}: {
  participantProfileId: string;
  repository: ParticipantPortalRegistrationRepository;
  studyId: string;
}): Promise<{ created: boolean; studyParticipant: PortalRegistrationStudyParticipant }> {
  const existing = await repository.findStudyParticipant({
    participantProfileId,
    studyId
  });

  if (existing) {
    return {
      created: false,
      studyParticipant: existing
    };
  }

  return {
    created: true,
    studyParticipant: await repository.createStudyParticipant({
      participantProfileId,
      studyId
    })
  };
}

async function createOrReuseConsent({
  identity,
  now,
  portalConfig,
  repository,
  studyParticipantId
}: {
  identity: ParticipantPortalIdentity;
  now: Date;
  portalConfig: ParticipantPortalConfigRecord;
  repository: ParticipantPortalRegistrationRepository;
  studyParticipantId: string;
}): Promise<{ reused: boolean }> {
  const existing = await repository.findParticipantConsent({
    noticeVersion: portalConfig.privacyNoticeVersion,
    studyParticipantId
  });

  if (existing) {
    return { reused: true };
  }

  const snapshot = buildParticipantConsentSnapshot({
    noticeHash: portalConfig.privacyNoticeHash,
    noticeText: portalConfig.privacyNoticeText,
    noticeVersion: portalConfig.privacyNoticeVersion,
    now,
    participantAuthUserId: identity.id,
    studyParticipantId
  });

  try {
    await repository.createParticipantConsent(snapshot);
    return { reused: false };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const reusable = await repository.findParticipantConsent({
        noticeVersion: portalConfig.privacyNoticeVersion,
        studyParticipantId
      });

      if (reusable) {
        return { reused: true };
      }
    }

    throw error;
  }
}

function selectBestProfileMatch(
  matches: PortalRegistrationParticipantProfile[],
  identity: {
    email: string;
    participantAuthUserId: string;
    phone: string;
  }
): PortalRegistrationParticipantProfile | null {
  return (
    matches.find((profile) => profile.participantAuthUserId === identity.participantAuthUserId) ??
    matches.find((profile) => profile.email?.toLowerCase() === identity.email.toLowerCase()) ??
    matches.find((profile) => profile.phone === identity.phone) ??
    null
  );
}
