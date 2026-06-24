"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getParticipantPortalAuth, type ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import {
  extractClientIp,
  getParticipantPortalAvailability,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE
} from "./access";
import { allowsDirectParticipantAccess } from "./access-mode";
import type {
  ParticipantPortalActionState,
  ParticipantPortalRegistrationFormValues
} from "./action-state";
import {
  createPublicPortalIdentityId,
  createPublicPortalSessionToken,
  participantPortalPublicSessionCookieName,
  publicPortalSessionMaxAgeSeconds
} from "./public-session";
import { createParticipantPortalRepository } from "./repository";
import { createParticipantPortalRegistrationRepository } from "./registration-repository";
import { registerParticipantInPortal } from "./registration-service";
import { verifyParticipantPortalTurnstile } from "./turnstile";

export async function registerParticipantPortalAction(
  studyCode: string,
  _previousState: ParticipantPortalActionState,
  formData: FormData
): Promise<ParticipantPortalActionState> {
  const formValues = extractRegistrationFormValues(formData);
  const portalRepository = createParticipantPortalRepository();
  const availability = await getParticipantPortalAvailability({
    repository: portalRepository,
    studyCode
  });

  if (!availability.ok) {
    logRegistrationEvent({
      code: "PORTAL_UNAVAILABLE",
      step: "availability",
      studyCode
    });

    return {
      formValues,
      message: PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
      status: "error"
    };
  }

  const directMode = allowsDirectParticipantAccess(studyCode);
  const auth = await getParticipantPortalAuth({ repository: portalRepository, studyCode });
  let identity: ParticipantPortalIdentity | null = auth.status === "allowed" ? auth.identity : null;
  let shouldSetPublicSession = false;

  if (auth.status === "no_session") {
    if (!directMode) {
      logRegistrationEvent({
        code: "NO_SESSION",
        step: "auth",
        studyCode
      });

      return {
        formValues,
        message: "Inicia sesión con el código enviado a tu correo para continuar.",
        status: "error"
      };
    }

    const headerStore = await headers();
    const captcha = await verifyParticipantPortalTurnstile({
      ipAddress: extractClientIp(headerStore),
      token: String(formData.get("captchaToken") ?? "")
    });

    if (!captcha.ok) {
      logRegistrationEvent({
        code: captcha.code,
        step: "captcha",
        studyCode
      });

      return {
        formValues,
        message: captcha.message,
        status: "error"
      };
    }

    identity = {
      email: null,
      id: createPublicPortalIdentityId(),
      source: "PUBLIC_SESSION"
    };
    shouldSetPublicSession = true;
  }

  if (auth.status === "internal_user_blocked") {
    logRegistrationEvent({
      code: "INTERNAL_USER_BLOCKED",
      step: "auth",
      studyCode
    });

    return {
      formValues,
      message: auth.message,
      status: "error"
    };
  }

  if (!identity) {
    return {
      formValues,
      message: "No fue posible validar tu acceso. Intenta de nuevo.",
      status: "error"
    };
  }

  const result = await registerParticipantInPortal({
    formInput: {
      consentPrivacy: formData.get("consentPrivacy") ?? false,
      consentSensitive: formData.get("consentSensitive") ?? false,
      confirmPhone: formData.get("confirmPhone"),
      email: formData.get("email"),
      name: formData.get("name"),
      phone: formData.get("phone")
    },
    identity,
    repository: createParticipantPortalRegistrationRepository(),
    study: availability.study
  });

  if (!result.ok) {
    logRegistrationEvent({
      code: result.code,
      step: "register",
      studyCode
    });

    return {
      fieldErrors: result.fieldErrors,
      formValues,
      message: result.message,
      status: "error"
    };
  }

  logRegistrationEvent({
    code: "OK",
    consentReused: result.data.consentReused,
    createdParticipantProfile: result.data.createdParticipantProfile,
    createdStudyParticipant: result.data.createdStudyParticipant,
    screeningAttemptReused: result.data.screeningAttemptReused,
    step: "register",
    studyCode
  });

  if (shouldSetPublicSession) {
    const cookieStore = await cookies();
    const token = createPublicPortalSessionToken({
      identityId: identity.id,
      secret: getParticipantPortalHashSecret(),
      studyCode
    });

    cookieStore.set(participantPortalPublicSessionCookieName(studyCode), token, {
      httpOnly: true,
      maxAge: publicPortalSessionMaxAgeSeconds(),
      path: `/participar/${studyCode}`,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }

  redirect(`/participar/${encodeURIComponent(studyCode)}/inicio?registered=1`);
}

function extractRegistrationFormValues(formData: FormData): ParticipantPortalRegistrationFormValues {
  return {
    confirmPhone: String(formData.get("confirmPhone") ?? ""),
    consentPrivacy: formData.get("consentPrivacy") === "on",
    consentSensitive: formData.get("consentSensitive") === "on",
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "")
  };
}

function getParticipantPortalHashSecret(): string {
  const secret = process.env.PARTICIPANT_PORTAL_HASH_SECRET;

  if (!secret) {
    throw new Error("PARTICIPANT_PORTAL_HASH_SECRET is required.");
  }

  return secret;
}

function logRegistrationEvent({
  code,
  consentReused,
  createdParticipantProfile,
  createdStudyParticipant,
  screeningAttemptReused,
  step,
  studyCode
}: {
  code: string;
  consentReused?: boolean;
  createdParticipantProfile?: boolean;
  createdStudyParticipant?: boolean;
  screeningAttemptReused?: boolean;
  step: "auth" | "availability" | "captcha" | "register";
  studyCode: string;
}) {
  const suffix = [
    typeof createdParticipantProfile === "boolean"
      ? `participantProfile=${createdParticipantProfile ? "created" : "reused"}`
      : null,
    typeof createdStudyParticipant === "boolean"
      ? `studyParticipant=${createdStudyParticipant ? "created" : "reused"}`
      : null,
    typeof consentReused === "boolean" ? `consent=${consentReused ? "reused" : "created"}` : null,
    typeof screeningAttemptReused === "boolean"
      ? `screeningAttempt=${screeningAttemptReused ? "reused" : "created"}`
      : null
  ]
    .filter(Boolean)
    .join(" ");
  const message = `participant portal registration ${code === "OK" ? "completed" : "failed"}: step=${step} code=${code} studyCode=${studyCode}${suffix ? ` ${suffix}` : ""}`;

  if (code === "OK") {
    console.info(message);
    return;
  }

  console.error(message);
}
