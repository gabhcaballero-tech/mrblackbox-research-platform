import { randomInt } from "node:crypto";
import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  F6_PERFUME_EVIDENCE_QUESTION_ID,
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  createSignedEvidenceUpload,
  validateEvidenceUploadMetadata,
  type EvidenceUploadMetadata,
  type EvidenceStorageClient
} from "./evidence-storage";
import type {
  EvidenceReviewAttemptRecord,
  EvidenceReviewRepository
} from "./evidence-review-repository";
import { buildManualWhatsAppMessage, PARTICIPANT_REFERENCE_CODE_ALPHABET } from "./review";
import {
  isMexicoPhone,
  normalizeMexicoPhone,
  normalizePortalEmail
} from "./validation";
import { normalizeParticipantTextInput } from "./text-normalization";

export type EvidenceReviewActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type EvidenceReviewImage = {
  id: string;
  filename: string;
  mimeType: string;
  reviewStatus: string;
  signedUrl: string | null;
  sizeBytes: number;
  type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
};

export type EvidenceReplacementSignedUpload = {
  metadata: EvidenceUploadMetadata;
  privateStorageKey: string;
  storageBucket: string;
  token: string;
};

export type ParticipantEvidenceReviewDetail = {
  attemptId: string;
  attemptStatus: EvidenceReviewAttemptRecord["status"];
  cleanupSummary: {
    attemptCount: number;
    attempts: Array<{
      folio: string | null;
      id: string;
      referenceCodes: Array<{ code: string; slot: number }>;
      source: EvidenceReviewAttemptRecord["source"];
      status: EvidenceReviewAttemptRecord["status"];
    }>;
    evidenceCount: number;
  };
  confirmation: {
    folio: string;
    manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
    referenceCodes: Array<{ code: string; slot: number }>;
    whatsappMessage: string;
    whatsappUrl: string | null;
  } | null;
  evidence: EvidenceReviewImage[];
  f6DeclaredBrands: string;
  participant: {
    email: string | null;
    externalReference: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
  review: {
    internalNote: string | null;
    rejectionReason: string | null;
    status: "APPROVED" | "PENDING" | "REJECTED";
  } | null;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type EvidenceReviewResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type ParticipantEvidenceParticipantUpdateInput = {
  email?: string | null;
  externalReference?: string | null;
  name: string;
  phone?: string | null;
};

export function canReviewParticipantEvidence(actor: EvidenceReviewActor | null): actor is EvidenceReviewActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "screening:review"));
}

export async function getParticipantEvidenceReviewDetail({
  actor,
  attemptId,
  repository,
  storage
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  repository: EvidenceReviewRepository;
  storage: EvidenceStorageClient;
}): Promise<EvidenceReviewResult<ParticipantEvidenceReviewDetail>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para revisar evidencias.",
      ok: false
    };
  }

  const attempt = await repository.getAttemptReview(attemptId);

  if (!attempt) {
    return {
      message: "El intento no existe.",
      ok: false
    };
  }

  return {
    data: await toReviewDetail(attempt, storage),
    ok: true
  };
}

export async function approveParticipantEvidenceReview({
  actor,
  attemptId,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<{ created: boolean }>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para aprobar evidencias.",
      ok: false
    };
  }

  const result = await repository.approveEvidence({
    approvedByUserId: actor.id,
    attemptId,
    codeGenerator: generateReferenceCode
  });

  if (!result.ok) {
    return result;
  }

  return {
    data: {
      created: result.created
    },
    ok: true
  };
}

export async function regenerateParticipantReferenceCodes({
  actor,
  attemptId,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<null>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para regenerar cÃ³digos.",
      ok: false
    };
  }

  const result = await repository.regenerateReferenceCodes({
    attemptId,
    codeGenerator: generateReferenceCode,
    regeneratedByUserId: actor.id
  });

  if (!result.ok) {
    return result;
  }

  return {
    data: null,
    ok: true
  };
}

export async function updateParticipantEvidenceParticipant({
  actor,
  attemptId,
  input,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  input: ParticipantEvidenceParticipantUpdateInput;
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<null>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para editar datos del participante.",
      ok: false
    };
  }

  const normalized = normalizeParticipantProfileInput(input);

  if (!normalized.ok) {
    return normalized;
  }

  const result = await repository.updateParticipantProfile({
    attemptId,
    email: normalized.data.email,
    externalReference: normalized.data.externalReference,
    name: normalized.data.name,
    phone: normalized.data.phone,
    updatedByUserId: actor.id
  });

  if (!result.ok) {
    return result;
  }

  return {
    data: null,
    ok: true
  };
}

export async function deleteParticipantEvidenceTestRecord({
  actor,
  attemptId,
  confirmationText,
  reason,
  repository,
  storage
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  confirmationText: string;
  reason: string;
  repository: EvidenceReviewRepository;
  storage: EvidenceStorageClient;
}): Promise<
  EvidenceReviewResult<{
    successMessage: string;
    storageWarning: string | null;
    studyId: string;
  }>
> {
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    return {
      message: "Solo ADMIN puede eliminar registros de prueba.",
      ok: false
    };
  }

  if (confirmationText.trim() !== "ELIMINAR PRUEBA") {
    return {
      message: "Escribe ELIMINAR PRUEBA para confirmar esta acciÃ³n.",
      ok: false
    };
  }

  const normalizedReason = normalizeParticipantTextInput(reason);

  if (!normalizedReason) {
    return {
      message: "Captura el motivo de eliminaciÃ³n.",
      ok: false
    };
  }

  const result = await repository.deleteTestRecord({
    attemptId,
    deletedByUserId: actor.id,
    reason: normalizedReason
  });

  if (!result.ok) {
    return result;
  }

  let storageWarning: string | null = null;

  if (result.evidenceToDelete.length > 0 && storage.deleteObjects) {
    const byBucket = new Map<string, string[]>();

    for (const item of result.evidenceToDelete) {
      byBucket.set(item.bucket, [...(byBucket.get(item.bucket) ?? []), item.privateStorageKey]);
    }

    try {
      await Promise.all(
        [...byBucket.entries()].map(([bucket, privateStorageKeys]) =>
          storage.deleteObjects?.({
            bucket,
            privateStorageKeys
          })
        )
      );
    } catch (error) {
      logEvidenceReviewError("delete-test-record-storage", "PERFUME_PHOTO", error);
      storageWarning = "El registro se eliminÃ³, pero algunas evidencias no pudieron borrarse de Storage. RevÃ­salas manualmente.";
    }
  }

  return {
    data: {
      successMessage: result.preservedInternalProfile
        ? "Registro de prueba eliminado. El perfil interno se conservó por seguridad."
        : "Registro de prueba eliminado correctamente.",
      storageWarning,
      studyId: result.studyId
    },
    ok: true
  };
}

export async function deleteParticipantEvidenceStudyParticipantTestRecords({
  actor,
  attemptId,
  confirmationText,
  reason,
  repository,
  storage
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  confirmationText: string;
  reason: string;
  repository: EvidenceReviewRepository;
  storage: EvidenceStorageClient;
}): Promise<
  EvidenceReviewResult<{
    successMessage: string;
    storageWarning: string | null;
    studyId: string;
  }>
> {
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    return {
      message: "Solo ADMIN puede eliminar registros de prueba.",
      ok: false
    };
  }

  if (confirmationText.trim() !== "ELIMINAR PRUEBAS DEL PARTICIPANTE") {
    return {
      message: "Escribe ELIMINAR PRUEBAS DEL PARTICIPANTE para confirmar esta accion.",
      ok: false
    };
  }

  const normalizedReason = normalizeParticipantTextInput(reason);

  if (!normalizedReason) {
    return {
      message: "Captura el motivo de eliminacion.",
      ok: false
    };
  }

  const result = await repository.deleteStudyParticipantTestRecords({
    attemptId,
    deletedByUserId: actor.id,
    reason: normalizedReason
  });

  if (!result.ok) {
    return result;
  }

  const storageWarning = await deleteEvidenceObjects({
    evidenceToDelete: result.evidenceToDelete,
    storage
  });

  return {
    data: {
      successMessage: result.preservedInternalProfile
        ? "Registros de prueba eliminados. El perfil interno se conservó por seguridad."
        : "Registros de prueba eliminados correctamente.",
      storageWarning,
      studyId: result.studyId
    },
    ok: true
  };
}

export async function rejectParticipantEvidenceReview({
  actor,
  attemptId,
  internalNote,
  rejectionReason,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  internalNote?: string | null;
  rejectionReason: string;
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<null>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para rechazar evidencias.",
      ok: false
    };
  }

  if (!rejectionReason.trim()) {
    return {
      message: "Captura el motivo interno de rechazo.",
      ok: false
    };
  }

  await repository.rejectEvidence({
    attemptId,
    internalNote,
    rejectionReason: rejectionReason.trim(),
    reviewedByUserId: actor.id
  });

  return {
    data: null,
    ok: true
  };
}

export async function requestParticipantEvidenceReplacementUpload({
  actor,
  attemptId,
  evidenceId,
  metadata,
  repository,
  storage
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  evidenceId?: string | null;
  metadata: EvidenceUploadMetadata;
  repository: EvidenceReviewRepository;
  storage: EvidenceStorageClient;
}): Promise<EvidenceReviewResult<EvidenceReplacementSignedUpload>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para corregir evidencias.",
      ok: false
    };
  }

  const attempt = await repository.getAttemptReview(attemptId);

  if (!attempt) {
    return {
      message: "El intento no existe.",
      ok: false
    };
  }

  const validation = validateReplacementTarget({
    attempt,
    evidenceId,
    evidenceType: metadata.evidenceType
  });

  if (!validation.ok) {
    return validation;
  }

  const config = attempt.questionnaireVersion.study.participantPortalConfig;

  if (!config) {
    return {
      message: "El portal no está configurado para este estudio.",
      ok: false
    };
  }

  try {
    const signed = await createSignedEvidenceUpload({
      attemptId: attempt.id,
      maxImageBytes: config.maxImageBytes,
      metadata,
      participantProfileId: attempt.studyParticipant.participantProfile.id,
      storage,
      studyId: attempt.questionnaireVersion.study.id
    });

    if (!signed.token) {
      return {
        message: "No fue posible preparar la carga. Intenta de nuevo.",
        ok: false
      };
    }

    return {
      data: {
        metadata: signed.metadata,
        privateStorageKey: signed.privateStorageKey,
        storageBucket: signed.storageBucket,
        token: signed.token
      },
      ok: true
    };
  } catch (error) {
    logEvidenceReviewError("prepare-replacement-upload", metadata.evidenceType, error);
    return {
      message: error instanceof Error ? error.message : "No fue posible preparar la carga. Intenta de nuevo.",
      ok: false
    };
  }
}

export async function confirmParticipantEvidenceReplacement({
  actor,
  attemptId,
  input,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  input: EvidenceUploadMetadata & {
    evidenceId?: string | null;
    privateStorageKey: string;
    replacementReason: string;
    storageBucket: string;
  };
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<null>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para corregir evidencias.",
      ok: false
    };
  }

  if (!input.replacementReason.trim()) {
    return {
      message: "Captura el motivo interno de reemplazo.",
      ok: false
    };
  }

  const attempt = await repository.getAttemptReview(attemptId);

  if (!attempt) {
    return {
      message: "El intento no existe.",
      ok: false
    };
  }

  const targetValidation = validateReplacementTarget({
    attempt,
    evidenceId: input.evidenceId,
    evidenceType: input.evidenceType
  });

  if (!targetValidation.ok) {
    return targetValidation;
  }

  const config = attempt.questionnaireVersion.study.participantPortalConfig;

  if (!config) {
    return {
      message: "El portal no está configurado para este estudio.",
      ok: false
    };
  }

  try {
    const metadata = validateEvidenceUploadMetadata({
      maxImageBytes: config.maxImageBytes,
      metadata: input
    });

    if (input.storageBucket !== PARTICIPANT_EVIDENCE_BUCKET) {
      throw new Error("No fue posible validar la evidencia cargada.");
    }

    assertEvidenceStorageKeyBelongsToAttempt({
      attemptId: attempt.id,
      participantProfileId: attempt.studyParticipant.participantProfile.id,
      privateStorageKey: input.privateStorageKey,
      studyId: attempt.questionnaireVersion.study.id
    });

    const result = await repository.replaceEvidence({
      attemptId: attempt.id,
      evidenceId: input.evidenceId,
      evidenceType: metadata.evidenceType,
      extension: metadata.extension,
      mimeType: metadata.mimeType,
      originalFilename: metadata.originalFilename,
      privateStorageKey: input.privateStorageKey,
      replacementReason: input.replacementReason,
      reviewedByUserId: actor.id,
      sizeBytes: metadata.sizeBytes,
      storageBucket: input.storageBucket
    });

    if (!result.ok) {
      return result;
    }

    return {
      data: null,
      ok: true
    };
  } catch (error) {
    logEvidenceReviewError("confirm-replacement-upload", input.evidenceType, error);
    return {
      message: error instanceof Error ? error.message : "No fue posible registrar la evidencia.",
      ok: false
    };
  }
}

export async function markParticipantManualMessageSent({
  actor,
  attemptId,
  repository
}: {
  actor: EvidenceReviewActor | null;
  attemptId: string;
  repository: EvidenceReviewRepository;
}): Promise<EvidenceReviewResult<null>> {
  if (!canReviewParticipantEvidence(actor)) {
    return {
      message: "No tienes permiso para marcar el mensaje como enviado.",
      ok: false
    };
  }

  await repository.markManualMessageSent({
    attemptId,
    markedByUserId: actor.id
  });

  return {
    data: null,
    ok: true
  };
}

async function toReviewDetail(
  attempt: EvidenceReviewAttemptRecord,
  storage: EvidenceStorageClient
): Promise<ParticipantEvidenceReviewDetail> {
  const participant = attempt.studyParticipant.participantProfile;
  const study = attempt.questionnaireVersion.study;
  const cleanupAttempts = attempt.studyParticipant.screeningAttempts ?? [
    {
      id: attempt.id,
      participantConfirmation: attempt.participantConfirmation,
      participantEvidence: attempt.participantEvidence,
      source: attempt.source,
      status: attempt.status
    }
  ];
  const confirmation = attempt.participantConfirmation
    ? {
        folio: attempt.participantConfirmation.folio,
        manualMessageStatus: attempt.participantConfirmation.manualMessageStatus,
        referenceCodes: attempt.participantConfirmation.referenceCodes,
        whatsappMessage: buildManualWhatsAppMessage({
          codes: attempt.participantConfirmation.referenceCodes,
          folio: attempt.participantConfirmation.folio,
          participantName: participant.name,
          studyName: study.name
        }),
        whatsappUrl: buildWhatsAppUrl({
          message: buildManualWhatsAppMessage({
            codes: attempt.participantConfirmation.referenceCodes,
            folio: attempt.participantConfirmation.folio,
            participantName: participant.name,
            studyName: study.name
          }),
          phone: participant.phone
        })
      }
    : null;

  return {
    attemptId: attempt.id,
    attemptStatus: attempt.status,
    cleanupSummary: {
      attemptCount: cleanupAttempts.length,
      attempts: cleanupAttempts.map((item) => ({
        folio: item.participantConfirmation?.folio ?? null,
        id: item.id,
        referenceCodes: item.participantConfirmation?.referenceCodes ?? [],
        source: item.source,
        status: item.status
      })),
      evidenceCount: cleanupAttempts.reduce((total, item) => total + item.participantEvidence.length, 0)
    },
    confirmation,
    evidence: await Promise.all(
      attempt.participantEvidence.map(async (item) => ({
        filename: item.originalFilename ?? "Evidencia",
        id: item.id,
        mimeType: item.mimeType,
        reviewStatus: item.reviewStatus,
        signedUrl: await storage.createSignedReadUrl({
          bucket: item.storageBucket,
          expiresInSeconds: 300,
          privateStorageKey: item.privateStorageKey
        }),
        sizeBytes: item.sizeBytes,
        type: item.type
      }))
    ),
    f6DeclaredBrands: formatF6Answer(attempt.answers.find((answer) => answer.questionId === F6_PERFUME_EVIDENCE_QUESTION_ID)?.answerJson),
    participant: {
      email: participant.email,
      externalReference: participant.externalReference,
      id: participant.id,
      name: participant.name,
      phone: participant.phone
    },
    review: attempt.participantScreeningReview,
    study: {
      code: study.code,
      id: study.id,
      name: study.name
    }
  };
}

export function buildWhatsAppUrl({
  message,
  phone
}: {
  message: string;
  phone: string | null;
}): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function generateReferenceCode(): string {
  let code = "";

  for (let index = 0; index < 4; index += 1) {
    code += PARTICIPANT_REFERENCE_CODE_ALPHABET[randomInt(0, PARTICIPANT_REFERENCE_CODE_ALPHABET.length)];
  }

  return code;
}

function normalizeParticipantProfileInput(input: ParticipantEvidenceParticipantUpdateInput): EvidenceReviewResult<{
  email: string | null;
  externalReference: string | null;
  name: string;
  phone: string | null;
}> {
  const name = normalizeParticipantTextInput(input.name);
  const phone = normalizeNullable(input.phone);
  const email = normalizeNullable(input.email);
  const externalReference = normalizeNullable(input.externalReference);

  if (!name) {
    return {
      message: "Captura el nombre del participante.",
      ok: false
    };
  }

  const normalizedPhone = phone ? normalizeMexicoPhone(phone) : null;

  if (normalizedPhone && !isMexicoPhone(normalizedPhone)) {
    return {
      message: "Captura un celular vÃ¡lido a 10 dÃ­gitos o con clave +52.",
      ok: false
    };
  }

  const normalizedEmail = email ? normalizePortalEmail(email) : null;

  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return {
      message: "Captura un correo vÃ¡lido.",
      ok: false
    };
  }

  return {
    data: {
      email: normalizedEmail,
      externalReference: externalReference ? normalizeParticipantTextInput(externalReference) : null,
      name,
      phone: normalizedPhone
    },
    ok: true
  };
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0 ? normalized : null;
}

function formatF6Answer(answer: unknown): string {
  if (typeof answer === "string") {
    return answer;
  }

  if (Array.isArray(answer)) {
    return answer.map(String).join(", ");
  }

  if (answer && typeof answer === "object") {
    const value = answer as { otherText?: unknown; value?: unknown; values?: unknown };
    const values = Array.isArray(value.values) ? value.values.map(String).join(", ") : String(value.value ?? "");
    const otherText = typeof value.otherText === "string" ? value.otherText : "";

    return [values, otherText].filter(Boolean).join(". ");
  }

  return "Sin respuesta registrada.";
}

async function deleteEvidenceObjects({
  evidenceToDelete,
  storage
}: {
  evidenceToDelete: Array<{ bucket: string; privateStorageKey: string }>;
  storage: EvidenceStorageClient;
}): Promise<string | null> {
  if (evidenceToDelete.length === 0 || !storage.deleteObjects) {
    return null;
  }

  const byBucket = new Map<string, string[]>();

  for (const item of evidenceToDelete) {
    byBucket.set(item.bucket, [...(byBucket.get(item.bucket) ?? []), item.privateStorageKey]);
  }

  try {
    await Promise.all(
      [...byBucket.entries()].map(([bucket, privateStorageKeys]) =>
        storage.deleteObjects?.({
          bucket,
          privateStorageKeys
        })
      )
    );
    return null;
  } catch (error) {
    logEvidenceReviewError("delete-test-record-storage", "PERFUME_PHOTO", error);
    return "El registro se eliminó, pero algunas evidencias no pudieron borrarse de Storage. Revísalas manualmente.";
  }
}

function validateReplacementTarget({
  attempt,
  evidenceId,
  evidenceType
}: {
  attempt: EvidenceReviewAttemptRecord;
  evidenceId?: string | null;
  evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
}):
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  const evidence = attempt.participantEvidence;
  const target = evidenceId ? evidence.find((item) => item.id === evidenceId) : null;

  if (evidenceId && !target) {
    return { message: "La evidencia seleccionada no existe en este intento.", ok: false };
  }

  if (target && target.type !== evidenceType) {
    return { message: "La evidencia seleccionada no coincide con el tipo indicado.", ok: false };
  }

  if (evidenceType === "PERFUME_PHOTO" && !target) {
    const maxPerfumePhotos = attempt.questionnaireVersion.study.participantPortalConfig?.maxPerfumePhotos ?? 5;
    const perfumeCount = evidence.filter((item) => item.type === "PERFUME_PHOTO").length;

    if (perfumeCount >= maxPerfumePhotos) {
      return { message: `Puedes registrar máximo ${maxPerfumePhotos} fotos de perfumes.`, ok: false };
    }
  }

  return { ok: true };
}

function logEvidenceReviewError(step: string, evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION", error: unknown) {
  console.error("[participant-evidence-review]", {
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
