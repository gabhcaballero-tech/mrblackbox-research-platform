import type { ParticipantPortalAdminFieldErrors } from "./admin-service";
import type { ParticipantPortalRegistrationFieldErrors } from "./registration-service";

export type ParticipantPortalRegistrationFormValues = {
  confirmPhone?: string;
  consentPrivacy?: boolean;
  consentSensitive?: boolean;
  name?: string;
  phone?: string;
};

export type ParticipantPortalActionState = {
  fieldErrors?: ParticipantPortalAdminFieldErrors | ParticipantPortalRegistrationFieldErrors;
  formValues?: ParticipantPortalRegistrationFormValues;
  message?: string;
  status: "error" | "idle" | "success";
};

export const initialParticipantPortalActionState: ParticipantPortalActionState = {
  status: "idle"
};
