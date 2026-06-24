"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { createEvidenceReviewRepository } from "./evidence-review-repository";
import {
  approveParticipantEvidenceReview,
  deleteParticipantEvidenceStudyParticipantTestRecords,
  deleteParticipantEvidenceTestRecord,
  markParticipantManualMessageSent,
  confirmParticipantEvidenceReplacement,
  regenerateParticipantReferenceCodes,
  rejectParticipantEvidenceReview,
  requestParticipantEvidenceReplacementUpload,
  updateParticipantEvidenceParticipant
} from "./evidence-review-service";
import {
  createSupabaseEvidenceStorageClient,
  type EvidenceUploadMetadata
} from "./evidence-storage";

type EvidenceReviewActionResult<T = unknown> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

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

export async function regenerateParticipantReferenceCodesAction(attemptId: string): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await regenerateParticipantReferenceCodes({
    actor,
    attemptId,
    repository: createEvidenceReviewRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(reviewPath(attemptId, "evidenceMessage", "CÃ³digos regenerados correctamente."));
}

export async function updateParticipantEvidenceParticipantAction(
  attemptId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await updateParticipantEvidenceParticipant({
    actor,
    attemptId,
    input: {
      email: String(formData.get("email") ?? ""),
      externalReference: String(formData.get("externalReference") ?? ""),
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? "")
    },
    repository: createEvidenceReviewRepository()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(reviewPath(attemptId, "evidenceMessage", "Datos del participante actualizados correctamente."));
}

export async function deleteParticipantEvidenceTestRecordAction(
  attemptId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await deleteParticipantEvidenceTestRecord({
    actor,
    attemptId,
    confirmationText: String(formData.get("confirmationText") ?? ""),
    reason: String(formData.get("deleteReason") ?? ""),
    repository: createEvidenceReviewRepository(),
    storage: createSupabaseEvidenceStorageClient()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(
    `/admin/studies/${result.data.studyId}/screening-attempts?evidenceMessage=${encodeURIComponent(
      result.data.storageWarning ?? result.data.successMessage
    )}`
  );
}

export async function deleteParticipantEvidenceStudyParticipantTestRecordsAction(
  attemptId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:review");
  const result = await deleteParticipantEvidenceStudyParticipantTestRecords({
    actor,
    attemptId,
    confirmationText: String(formData.get("confirmationText") ?? ""),
    reason: String(formData.get("deleteReason") ?? ""),
    repository: createEvidenceReviewRepository(),
    storage: createSupabaseEvidenceStorageClient()
  });

  revalidatePath(`/admin/screening-attempts/${attemptId}`);

  if (!result.ok) {
    redirect(reviewPath(attemptId, "evidenceError", result.message));
  }

  redirect(
    `/admin/studies/${result.data.studyId}/screening-attempts?evidenceMessage=${encodeURIComponent(
      result.data.storageWarning ?? result.data.successMessage
    )}`
  );
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

export async function requestParticipantEvidenceReplacementUploadAction(
  attemptId: string,
  input: EvidenceUploadMetadata & { evidenceId?: string | null }
): Promise<
  EvidenceReviewActionResult<{
    metadata: EvidenceUploadMetadata;
    privateStorageKey: string;
    storageBucket: string;
    token: string;
  }>
> {
  try {
    const actor = await requireCapability("screening:review");
    const metadata = {
      evidenceType: input.evidenceType,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sizeBytes: input.sizeBytes
    };
    const result = await requestParticipantEvidenceReplacementUpload({
      actor,
      attemptId,
      evidenceId: input.evidenceId,
      metadata,
      repository: createEvidenceReviewRepository(),
      storage: createSupabaseEvidenceStorageClient()
    });

    if (!result.ok) {
      return result;
    }

    return {
      data: result.data,
      ok: true
    };
  } catch {
    return {
      message: "No fue posible preparar la carga. Intenta de nuevo.",
      ok: false
    };
  }
}

export async function confirmParticipantEvidenceReplacementAction(
  attemptId: string,
  input: EvidenceUploadMetadata & {
    evidenceId?: string | null;
    privateStorageKey: string;
    replacementReason: string;
    storageBucket: string;
  }
): Promise<EvidenceReviewActionResult<null>> {
  try {
    const actor = await requireCapability("screening:review");
    const result = await confirmParticipantEvidenceReplacement({
      actor,
      attemptId,
      input,
      repository: createEvidenceReviewRepository()
    });

    revalidatePath(`/admin/screening-attempts/${attemptId}`);

    if (!result.ok) {
      return result;
    }

    return {
      data: null,
      ok: true
    };
  } catch {
    return {
      message: "No fue posible registrar la evidencia.",
      ok: false
    };
  }
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
