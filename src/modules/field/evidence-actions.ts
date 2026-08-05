"use server";

import { revalidatePath } from "next/cache";
import { sendNavigoConfirmationWhatsAppBestEffort } from "@/modules/participant-portal/navigo-confirmation-whatsapp";
import { getFieldActorForRequest } from "./auth";
import { createFieldRepository } from "./repository";
import {
  completeFieldEvidenceSubmission,
  confirmFieldEvidenceUpload,
  getFieldScreeningReviewReadiness,
  requestFieldEvidenceUpload
} from "./service";
import {
  createSupabaseEvidenceStorageClient,
  type EvidenceUploadMetadata
} from "@/modules/participant-portal/evidence-storage";

type FieldEvidenceActionResult<T = unknown> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export async function requestFieldEvidenceUploadAction(
  attemptId: string,
  metadata: EvidenceUploadMetadata
): Promise<FieldEvidenceActionResult<{
  privateStorageKey: string;
  storageBucket: string;
  token?: string;
}>> {
  const actor = await getFieldActorForRequest();
  const result = await requestFieldEvidenceUpload({
    actor,
    attemptId,
    metadata,
    repository: createFieldRepository(),
    storage: createSupabaseEvidenceStorageClient()
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  if (!result.data.token) {
    return {
      message: "No fue posible preparar la carga. Intenta de nuevo.",
      ok: false
    };
  }

  return {
    data: {
      privateStorageKey: result.data.privateStorageKey,
      storageBucket: result.data.storageBucket,
      token: result.data.token
    },
    ok: true
  };
}

export async function confirmFieldEvidenceUploadAction(
  attemptId: string,
  input: EvidenceUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<FieldEvidenceActionResult<{ counts: { perfumePhotos: number; selfie: number }; perfumePhotoCount: number; selfieCount: number }>> {
  const actor = await getFieldActorForRequest();
  const result = await confirmFieldEvidenceUpload({
    actor,
    attemptId,
    input,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  revalidatePath(`/field/screening/${attemptId}/selfie`);
  revalidatePath(`/field/screening/${attemptId}`);
  revalidatePath(`/field/screening/${attemptId}/result`);

  if (input.evidenceType === "SELFIE_IDENTIFICATION") {
    await logFieldSelfieReviewFlow({
      actor,
      attemptId,
      step: "after_confirm_selfie"
    });
  }

  return {
    data: {
      counts: result.data.counts,
      perfumePhotoCount: result.data.counts.perfumePhotos,
      selfieCount: result.data.counts.selfie
    },
    ok: true
  };
}

export async function completeFieldEvidenceSubmissionAction(
  attemptId: string
): Promise<FieldEvidenceActionResult<{ redirectTo: string }>> {
  const actor = await getFieldActorForRequest();
  const repository = createFieldRepository();
  let result: Awaited<ReturnType<typeof completeFieldEvidenceSubmission>>;

  try {
    result = await completeFieldEvidenceSubmission({
      actor,
      attemptId,
      repository
    });
  } catch (error) {
    console.error("public field evidence completion failed", {
      attemptId,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "complete_evidence_submission"
    });
    await logFieldSelfieReviewFlow({
      actor,
      attemptId,
      error: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "complete_submission_exception"
    });

    return {
      message: "No fue posible enviar tu perfil a revisión. Intenta nuevamente.",
      ok: false
    };
  }

  if (!result.ok) {
    await logFieldSelfieReviewFlow({
      actor,
      attemptId,
      error: result.message,
      step: "complete_submission_not_ok"
    });

    if (result.code === "EVIDENCE_INCOMPLETE") {
      const evidenceScreen = await getFieldEvidenceRedirect(attemptId);

      if (evidenceScreen) {
        return {
          data: {
            redirectTo: evidenceScreen
          },
          ok: true
        };
      }
    }

    return { message: result.message, ok: false };
  }

  revalidatePath(`/field/screening/${attemptId}/selfie`);
  revalidatePath(`/field/screening/${attemptId}`);
  revalidatePath(`/field/screening/${attemptId}/result`);

  const attempt = await repository.getAttempt(attemptId);

  if (attempt && attempt.status === "PENDING_REVIEW") {
    await sendNavigoConfirmationWhatsAppBestEffort({
      attemptId,
      confirmation: attempt.participantConfirmation ?? null,
      participant: {
        name: attempt.studyParticipant.participantProfile.name,
        phone: attempt.studyParticipant.participantProfile.phone
      },
      sourceLabel: "public field",
      studyId: attempt.questionnaireVersion.study.id,
      studyParticipantId: attempt.studyParticipantId
    });
  }

  await logFieldSelfieReviewFlow({
    actor,
    attemptId,
    redirectTo: `/field/screening/${attemptId}/result`,
    step: "after_complete_submission"
  });

  return {
    data: {
      redirectTo: `/field/screening/${attemptId}/result`
    },
    ok: true
  };
}

async function logFieldSelfieReviewFlow({
  actor,
  attemptId,
  error,
  redirectTo,
  step
}: {
  actor: Awaited<ReturnType<typeof getFieldActorForRequest>>;
  attemptId: string;
  error?: string;
  redirectTo?: string;
  step: string;
}) {
  try {
    const readiness = await getFieldScreeningReviewReadiness({
      actor,
      attemptId,
      repository: createFieldRepository()
    });

    console.info("[FIELD_SELFIE_REVIEW_FLOW]", {
      attemptExists: readiness.attemptExists,
      attemptId,
      blockingReason: readiness.blockingReason,
      error,
      fieldUserId: readiness.fieldUserId,
      hasConfirmation: readiness.hasConfirmation,
      hasPendingReview: readiness.hasPendingReview,
      hasRequiredPerfumePhotos: readiness.hasRequiredPerfumePhotos,
      hasStudyParticipant: readiness.hasStudyParticipant,
      isPublicFieldAttempt: readiness.isPublicFieldAttempt,
      nextStep: readiness.nextStep,
      perfumePhotoCount: readiness.perfumePhotoCount,
      perfumePhotoRelatedQuestionIds: readiness.perfumePhotoRelatedQuestionIds,
      redirectTo,
      reviewStatus: readiness.reviewStatus,
      selfieCount: readiness.selfieCount,
      source: readiness.source,
      status: readiness.status,
      step,
      studyParticipantId: readiness.studyParticipantId
    });
  } catch (logError) {
    console.error("[FIELD_SELFIE_REVIEW_FLOW]", {
      attemptId,
      code: logError instanceof Error ? logError.name : "UNKNOWN_ERROR",
      step: `${step}_log_failed`
    });
  }
}

async function getFieldEvidenceRedirect(attemptId: string): Promise<string | null> {
  const actor = await getFieldActorForRequest();
  const { getFieldEvidenceScreen } = await import("./service");
  const screen = await getFieldEvidenceScreen({
    actor,
    attemptId,
    repository: createFieldRepository()
  });

  if (!screen.ok) {
    return null;
  }

  if (screen.data.counts.selfie < 1) {
    return `/field/screening/${attemptId}/selfie`;
  }

  if (screen.data.counts.perfumePhotos < screen.data.config.minPerfumePhotos) {
    return `/field/screening/${attemptId}/evidences`;
  }

  return null;
}
