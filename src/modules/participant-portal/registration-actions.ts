"use server";

import { redirect } from "next/navigation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import {
  getParticipantPortalAvailability,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE
} from "./access";
import type {
  ParticipantPortalActionState,
  ParticipantPortalRegistrationFormValues
} from "./action-state";
import { createParticipantPortalRepository } from "./repository";
import { createParticipantPortalRegistrationRepository } from "./registration-repository";
import { registerParticipantInPortal } from "./registration-service";

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

  const auth = await getParticipantPortalAuth({ repository: portalRepository });

  if (auth.status === "no_session") {
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
    step: "register",
    studyCode
  });

  redirect(`/participar/${encodeURIComponent(studyCode)}/inicio?registered=1`);
}

function extractRegistrationFormValues(formData: FormData): ParticipantPortalRegistrationFormValues {
  return {
    confirmPhone: String(formData.get("confirmPhone") ?? ""),
    consentPrivacy: formData.get("consentPrivacy") === "on",
    consentSensitive: formData.get("consentSensitive") === "on",
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "")
  };
}

function logRegistrationEvent({
  code,
  consentReused,
  createdParticipantProfile,
  createdStudyParticipant,
  step,
  studyCode
}: {
  code: string;
  consentReused?: boolean;
  createdParticipantProfile?: boolean;
  createdStudyParticipant?: boolean;
  step: "auth" | "availability" | "register";
  studyCode: string;
}) {
  const suffix = [
    typeof createdParticipantProfile === "boolean"
      ? `participantProfile=${createdParticipantProfile ? "created" : "reused"}`
      : null,
    typeof createdStudyParticipant === "boolean"
      ? `studyParticipant=${createdStudyParticipant ? "created" : "reused"}`
      : null,
    typeof consentReused === "boolean" ? `consent=${consentReused ? "reused" : "created"}` : null
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
