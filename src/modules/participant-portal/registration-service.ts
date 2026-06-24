import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import {
  buildParticipantConsentSnapshot,
  normalizePortalEmail,
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
  | "DUPLICATE_PROFILE_CONFLICT"
  | "DUPLICATE_WITH_ATTEMPT"
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
        screeningAttemptId: string;
        screeningAttemptReused: boolean;
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
    const email = normalizeOptionalRegistrationEmail(parsed.data.email ?? identity.email);
    const profileResult = await findOrCreateParticipantProfile({
      email,
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
      const reusableAttempt = selectReusableOpenAttemptForIdentity({
        identity,
        profile: profileResult.profile,
        studyParticipant: studyParticipantResult.studyParticipant
      });

      if (!reusableAttempt) {
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
          screeningAttemptId: reusableAttempt.id,
          screeningAttemptReused: true,
          studyParticipant: studyParticipantResult.studyParticipant
        },
        ok: true
      };
    }

    const consent = await createOrReuseConsent({
      identity,
      now,
      repository,
      studyParticipantId: studyParticipantResult.studyParticipant.id,
      portalConfig: study.portalConfig
    });
    const attempt = await repository.createPortalScreeningAttempt({
      questionnaireVersionId: study.activeScreenerVersionId,
      studyParticipantId: studyParticipantResult.studyParticipant.id
    });

    return {
      data: {
        consentReused: consent.reused,
        createdParticipantProfile: profileResult.created,
        createdStudyParticipant: studyParticipantResult.created,
        participantProfile: profileResult.profile,
        screeningAttemptId: attempt.id,
        screeningAttemptReused: false,
        studyParticipant: studyParticipantResult.studyParticipant
      },
      ok: true
    };
  } catch (error) {
    if (error instanceof PortalRegistrationConflictError) {
      return {
        code: "DUPLICATE_PROFILE_CONFLICT",
        message: error.message,
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No fue posible completar tu registro. Intenta de nuevo.",
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
  email: string | null;
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
    try {
      return {
        created: true,
        profile: await repository.createParticipantProfile({
          email,
          name: input.name,
          participantAuthUserId: identity.id,
          phone: input.phone
        })
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const retriedMatches = await repository.findParticipantProfilesForRegistration({
          email,
          participantAuthUserId: identity.id,
          phone: input.phone
        });
        const retriedExisting = selectBestProfileMatch(retriedMatches, {
          email,
          participantAuthUserId: identity.id,
          phone: input.phone
        });

        if (retriedExisting) {
          return reuseOrConflictExistingProfile({
            email,
            existing: retriedExisting,
            identity,
            input,
            repository
          });
        }
      }

      throw error;
    }
  }

  return reuseOrConflictExistingProfile({
    email,
    existing,
    identity,
    input,
    repository
  });
}

async function reuseOrConflictExistingProfile({
  email,
  existing,
  identity,
  input,
  repository
}: {
  email: string | null;
  existing: PortalRegistrationParticipantProfile;
  identity: ParticipantPortalIdentity;
  input: ParticipantPortalRegistrationInput;
  repository: ParticipantPortalRegistrationRepository;
}): Promise<{ created: boolean; profile: PortalRegistrationParticipantProfile }> {
  if (existing.participantAuthUserId && existing.participantAuthUserId !== identity.id) {
    throw new PortalRegistrationConflictError(PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE);
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

  try {
    return {
      created: false,
      profile: await repository.updateParticipantProfile({
        id: existing.id,
        ...update
      })
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new PortalRegistrationConflictError(PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE);
    }

    throw error;
  }
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

  try {
    return {
      created: true,
      studyParticipant: await repository.createStudyParticipant({
        participantProfileId,
        studyId
      })
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const reusable = await repository.findStudyParticipant({
        participantProfileId,
        studyId
      });

      if (reusable) {
        return {
          created: false,
          studyParticipant: reusable
        };
      }
    }

    throw error;
  }
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
    email: string | null;
    participantAuthUserId: string;
    phone: string;
  }
): PortalRegistrationParticipantProfile | null {
  return (
    matches.find((profile) => profile.participantAuthUserId === identity.participantAuthUserId) ??
    (identity.email
      ? matches.find((profile) => profile.email?.toLowerCase() === identity.email?.toLowerCase())
      : null) ??
    matches.find((profile) => profile.phone === identity.phone) ??
    null
  );
}

function normalizeOptionalRegistrationEmail(value: string | null | undefined): string | null {
  const normalized = value ? normalizePortalEmail(value) : "";

  return normalized.length > 0 ? normalized : null;
}

function selectReusableOpenAttemptForIdentity({
  identity,
  profile,
  studyParticipant
}: {
  identity: ParticipantPortalIdentity;
  profile: PortalRegistrationParticipantProfile;
  studyParticipant: PortalRegistrationStudyParticipant;
}) {
  if (profile.participantAuthUserId !== identity.id) {
    return null;
  }

  return studyParticipant.screeningAttempts.find(
    (attempt) =>
      attempt.source === "PARTICIPANT_PORTAL" &&
      (attempt.status === "STARTED" || attempt.status === "INCOMPLETE")
  ) ?? null;
}

class PortalRegistrationConflictError extends Error {}
