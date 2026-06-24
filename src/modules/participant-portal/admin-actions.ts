"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createParticipantPortalAdminRepository } from "./admin-repository";
import {
  saveParticipantPortalConfigForAdmin,
  type ParticipantPortalAdminResult
} from "./admin-service";
import type { ParticipantPortalActionState } from "./action-state";

function stateFromResult<T>(
  result: ParticipantPortalAdminResult<T>,
  successMessage: string
): ParticipantPortalActionState {
  if (result.ok) {
    return {
      message: successMessage,
      status: "success"
    };
  }

  return {
    fieldErrors: result.fieldErrors,
    message: result.message,
    status: "error"
  };
}

export async function saveParticipantPortalConfigAction(
  studyId: string,
  _previousState: ParticipantPortalActionState,
  formData: FormData
): Promise<ParticipantPortalActionState> {
  const actor = await requireCapability("admin:access");
  const result = await saveParticipantPortalConfigForAdmin({
    actor,
    formInput: {
      enabled: formData.get("enabled") ?? false,
      evidenceRetentionDays: formData.get("evidenceRetentionDays"),
      folioMaxSequence: formData.get("folioMaxSequence"),
      folioPrefix: formData.get("folioPrefix"),
      maxImageBytes: formData.get("maxImageBytes"),
      maxOtpAttempts: formData.get("maxOtpAttempts"),
      maxPerfumePhotos: formData.get("maxPerfumePhotos"),
      minPerfumePhotos: formData.get("minPerfumePhotos"),
      nextFolioSequence: formData.get("nextFolioSequence"),
      otpCooldownSeconds: formData.get("otpCooldownSeconds"),
      privacyNoticeText: formData.get("privacyNoticeText"),
      privacyNoticeVersion: formData.get("privacyNoticeVersion")
    },
    repository: createParticipantPortalAdminRepository(),
    studyId
  });

  if (result.ok) {
    revalidatePath(`/admin/studies/${studyId}`);
    revalidatePath(`/participar/${encodeURIComponent(studyId)}`);
  }

  return stateFromResult(result, "Configuración del portal guardada.");
}
