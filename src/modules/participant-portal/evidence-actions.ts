"use server";

import { revalidatePath } from "next/cache";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { createParticipantPortalRepository } from "./repository";
import { createParticipantPortalEvidenceRepository } from "./evidence-repository";
import {
  completeParticipantEvidenceSubmission,
  confirmParticipantEvidenceUpload,
  requestParticipantEvidenceUpload
} from "./evidence-service";
import {
  createSupabaseEvidenceStorageClient,
  type EvidenceUploadMetadata
} from "./evidence-storage";
import { participantPortalStudyCodeSchema } from "./validation";

type ParticipantEvidenceActionResult<T = unknown> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

type ParticipantSignedUploadActionResult = {
  metadata: EvidenceUploadMetadata;
  privateStorageKey: string;
  storageBucket: string;
  token: string;
};

export async function requestParticipantEvidenceUploadAction(
  studyCodeInput: string,
  metadata: EvidenceUploadMetadata
): Promise<ParticipantEvidenceActionResult<ParticipantSignedUploadActionResult>> {
  try {
    const auth = await getParticipantEvidenceActionAuth();
    const studyCode = normalizeStudyCode(studyCodeInput);

    if (!auth.ok) {
      return auth;
    }

    const result = await requestParticipantEvidenceUpload({
      identity: auth.data.identity,
      metadata,
      repository: createParticipantPortalEvidenceRepository(),
      storage: createSupabaseEvidenceStorageClient(),
      studyCode
    });

    if (!result.ok) {
      return {
        message: result.message,
        ok: false
      };
    }

    if (!result.data.token) {
      logEvidenceActionError("prepare-signed-upload", metadata.evidenceType, { code: "missing_signed_upload_token" });
      return {
        message: "No fue posible preparar la carga. Intenta de nuevo.",
        ok: false
      };
    }

    return {
      data: {
        metadata: result.data.metadata,
        privateStorageKey: result.data.privateStorageKey,
        storageBucket: result.data.storageBucket,
        token: result.data.token
      },
      ok: true
    };
  } catch (error) {
    logEvidenceActionError("prepare-signed-upload", metadata.evidenceType, error);
    return {
      message: error instanceof Error ? error.message : "No fue posible preparar la carga. Intenta de nuevo.",
      ok: false
    };
  }
}

export async function confirmParticipantEvidenceUploadAction(
  studyCodeInput: string,
  input: EvidenceUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<ParticipantEvidenceActionResult> {
  try {
    const auth = await getParticipantEvidenceActionAuth();
    const studyCode = normalizeStudyCode(studyCodeInput);

    if (!auth.ok) {
      return auth;
    }

    const result = await confirmParticipantEvidenceUpload({
      identity: auth.data.identity,
      input,
      repository: createParticipantPortalEvidenceRepository(),
      studyCode
    });

    if (!result.ok) {
      return {
        message: result.message,
        ok: false
      };
    }

    revalidatePath(`/participar/${studyCode}/evidencias`);
    revalidatePath(`/participar/${studyCode}/inicio`);
    revalidatePath(`/participar/${studyCode}/filtro`);
    revalidatePath(`/participar/${studyCode}/resultado`);

    return {
      data: null,
      ok: true
    };
  } catch (error) {
    logEvidenceActionError("confirm-upload", input.evidenceType, error);
    return {
      message: "No fue posible registrar la evidencia.",
      ok: false
    };
  }
}

export async function completeParticipantEvidenceSubmissionAction(
  studyCodeInput: string
): Promise<ParticipantEvidenceActionResult<{ redirectTo: string }>> {
  const auth = await getParticipantEvidenceActionAuth();
  const studyCode = normalizeStudyCode(studyCodeInput);

  if (!auth.ok) {
    return auth;
  }

  const result = await completeParticipantEvidenceSubmission({
    identity: auth.data.identity,
    repository: createParticipantPortalEvidenceRepository(),
    studyCode
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/participar/${studyCode}/evidencias`);
  revalidatePath(`/participar/${studyCode}/resultado`);

  return {
    data: {
      redirectTo: `/participar/${encodeURIComponent(studyCode)}/resultado`
    },
    ok: true
  };
}

function normalizeStudyCode(value: string): string {
  const parsed = participantPortalStudyCodeSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error("El código de estudio no es válido.");
  }

  return parsed.data;
}

async function getParticipantEvidenceActionAuth(): Promise<
  ParticipantEvidenceActionResult<{ identity: { email: string | null; id: string } }>
> {
  const auth = await getParticipantPortalAuth({ repository: createParticipantPortalRepository() });

  if (auth.status === "no_session") {
    return {
      message: "Inicia sesión con el código enviado a tu correo para continuar.",
      ok: false
    };
  }

  if (auth.status === "internal_user_blocked") {
    return {
      message: auth.message,
      ok: false
    };
  }

  return {
    data: {
      identity: auth.identity
    },
    ok: true
  };
}

function logEvidenceActionError(step: string, evidenceType: EvidenceUploadMetadata["evidenceType"], error: unknown) {
  console.error("[participant-evidence]", {
    code: readSafeErrorCode(error),
    evidenceType,
    step
  });
}

function readSafeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "unknown";
}
