"use server";

import { revalidatePath } from "next/cache";
import { getFieldActorForRequest } from "./auth";
import { createFieldRepository } from "./repository";
import {
  completeFieldEvidenceSubmission,
  confirmFieldEvidenceUpload,
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
  revalidatePath(`/field/screening/${attemptId}/result`);

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
  let result: Awaited<ReturnType<typeof completeFieldEvidenceSubmission>>;

  try {
    result = await completeFieldEvidenceSubmission({
      actor,
      attemptId,
      repository: createFieldRepository()
    });
  } catch (error) {
    console.error("public field evidence completion failed", {
      attemptId,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "complete_evidence_submission"
    });

    return {
      message: "No fue posible enviar tu perfil a revisión. Intenta nuevamente.",
      ok: false
    };
  }

  if (!result.ok) {
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
  revalidatePath(`/field/screening/${attemptId}/result`);

  return {
    data: {
      redirectTo: `/field/screening/${attemptId}/result`
    },
    ok: true
  };
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
