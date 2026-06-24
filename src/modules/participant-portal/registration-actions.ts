"use server";

import { redirect } from "next/navigation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import {
  getParticipantPortalAvailability,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE
} from "./access";
import type { ParticipantPortalActionState } from "./action-state";
import { createParticipantPortalRepository } from "./repository";
import { createParticipantPortalRegistrationRepository } from "./registration-repository";
import {
  PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE,
  registerParticipantInPortal
} from "./registration-service";

export async function registerParticipantPortalAction(
  studyCode: string,
  _previousState: ParticipantPortalActionState,
  formData: FormData
): Promise<ParticipantPortalActionState> {
  const portalRepository = createParticipantPortalRepository();
  const availability = await getParticipantPortalAvailability({
    repository: portalRepository,
    studyCode
  });

  if (!availability.ok) {
    return {
      message: PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
      status: "error"
    };
  }

  const auth = await getParticipantPortalAuth({ repository: portalRepository });

  if (auth.status === "no_session") {
    return {
      message: "Inicia sesión con el código enviado a tu correo para continuar.",
      status: "error"
    };
  }

  if (auth.status === "internal_user_blocked") {
    return {
      message: auth.message,
      status: "error"
    };
  }

  const result = await registerParticipantInPortal({
    formInput: {
      consentPrivacy: formData.get("consentPrivacy") ?? false,
      consentSensitive: formData.get("consentSensitive") ?? false,
      confirmPhone: formData.get("confirmPhone"),
      name: formData.get("name"),
      phone: formData.get("phone")
    },
    identity: auth.identity,
    repository: createParticipantPortalRegistrationRepository(),
    study: availability.study
  });

  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      status: "error"
    };
  }

  redirect(`/participar/${encodeURIComponent(studyCode)}/inicio?registered=1`);
}

export { PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE };
