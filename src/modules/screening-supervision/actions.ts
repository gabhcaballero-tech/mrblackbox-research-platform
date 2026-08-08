"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import {
  createDuplicateScreeningAttemptCleanupRepository,
  deleteDuplicateScreeningAttempt
} from "./duplicate-attempt-cleanup";

export async function deleteDuplicateScreeningAttemptAction(attemptId: string, formData: FormData): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await deleteDuplicateScreeningAttempt({
    actor,
    attemptId,
    confirmationText: String(formData.get("confirmationText") ?? ""),
    reason: String(formData.get("deleteReason") ?? ""),
    releaseFolioConfirmation: String(formData.get("releaseFolioConfirmation") ?? ""),
    repository: createDuplicateScreeningAttemptCleanupRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(`/admin/screening-attempts/${attemptId}?attemptCleanupError=${encodeURIComponent(result.message)}#eliminar-intento-duplicado`);
  }

  revalidatePath(`/admin/studies/${result.data.studyId}/screening-attempts`);
  redirect(
    `/admin/studies/${result.data.studyId}/screening-attempts?evidenceMessage=${encodeURIComponent(
      result.data.folioReleased
        ? `Intento duplicado eliminado. Folio liberado: ${result.data.folioReleased}.`
        : "Intento duplicado eliminado correctamente."
    )}`
  );
}
