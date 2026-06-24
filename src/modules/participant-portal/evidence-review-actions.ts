"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { createEvidenceReviewRepository } from "./evidence-review-repository";
import {
  approveParticipantEvidenceReview,
  markParticipantManualMessageSent,
  rejectParticipantEvidenceReview
} from "./evidence-review-service";

export async function approveParticipantEvidenceAction(attemptId: string): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await approveParticipantEvidenceReview({
    actor,
    attemptId,
    repository: createEvidenceReviewRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(reviewPath(attemptId, "evidenceMessage", "Evidencia aprobada correctamente."));
}

export async function rejectParticipantEvidenceAction(
  attemptId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await rejectParticipantEvidenceReview({
    actor,
    attemptId,
    internalNote: String(formData.get("internalNote") ?? ""),
    rejectionReason: String(formData.get("rejectionReason") ?? ""),
    repository: createEvidenceReviewRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(reviewPath(attemptId, "evidenceMessage", "Evidencia rechazada correctamente."));
}

export async function markParticipantManualMessageSentAction(attemptId: string): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await markParticipantManualMessageSent({
    actor,
    attemptId,
    repository: createEvidenceReviewRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(reviewPath(attemptId, "evidenceMessage", "Mensaje marcado como enviado."));
}

function reviewPath(attemptId: string, key: "evidenceError" | "evidenceMessage", value: string): string {
  const params = new URLSearchParams({ [key]: value });

  return `/admin/screening-attempts/${attemptId}?${params.toString()}`;
}
