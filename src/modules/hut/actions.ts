"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHutRepository, hutFormDataToAnswerInput, type HutActionResult } from "./";
import type { HutQuestionnaireSectionId } from "./definition";
import type { HutPhase } from "./phase-codes";
import type { HutPhotoTimelineSlotId } from "./photo-timeline";
import type {
  HutApplicationPhotoUploadMetadata,
  HutSelfieUploadMetadata,
  HutSignedApplicationPhotoUpload,
  HutSignedSelfieUpload,
  HutSignedVideoUpload,
  HutVideoUploadMetadata
} from "./storage";
import { requireCapability } from "@/shared/auth/session";
import type { NavigoFaceVerificationClientResult } from "@/modules/navigo-app/face-verification-contract";

export async function createHutParticipantAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().createParticipant({
    email: String(formData.get("email") ?? ""),
    firstFragranceLeftArm: String(formData.get("firstFragranceLeftArm") ?? ""),
    folio: String(formData.get("folio") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    recruiter: String(formData.get("recruiter") ?? ""),
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
    secondFragranceRightArm: String(formData.get("secondFragranceRightArm") ?? ""),
    slotId: String(formData.get("slotId") ?? ""),
    startDate: parseOptionalDate(formData.get("startDate")),
    studyId
  });

  redirectWithHutMessage(studyId, result);
}

export async function createHutRegistrationSlotAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().createRegistrationSlot({
    firstFragranceLeftArm: String(formData.get("firstFragranceLeftArm") ?? ""),
    folio: String(formData.get("folio") ?? ""),
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
    secondFragranceRightArm: String(formData.get("secondFragranceRightArm") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result);
}

export async function importHutParticipantsAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().importParticipants({
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
    startDate: parseOptionalDate(formData.get("startDate")),
    studyId,
    text: String(formData.get("participantsText") ?? "")
  });

  redirectWithHutMessage(studyId, result);
}

export async function importHutRegistrationSlotsAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().importRegistrationSlots({
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
    studyId,
    text: String(formData.get("slotsText") ?? "")
  });

  redirectWithHutMessage(studyId, result);
}

export async function assignHutParticipantRotationAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().assignParticipantRotation({
    firstFragranceLeftArm: String(formData.get("firstFragranceLeftArm") ?? ""),
    folio: String(formData.get("folio") ?? ""),
    participantId,
    secondFragranceRightArm: String(formData.get("secondFragranceRightArm") ?? ""),
    slotId: String(formData.get("slotId") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function syncHutParticipantProfileFromNavAction(studyId: string, participantId: string) {
  await requireCapability("screening:review");
  const result = await createHutRepository().syncParticipantProfileFromLinkedNav({
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function reconcileReservedHutNavParticipantsAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().reconcileReservedHutNavParticipants({
    confirmation: String(formData.get("confirmation") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result);
}

export async function sendHutRegistrationWhatsAppAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().sendRegistrationWhatsApp({
    force: true,
    participantId,
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function deleteHutParticipantAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().deleteParticipant({
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result);
}

export async function resetHutReferenceSelfieAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().resetReferenceSelfie({
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function resetHutVideoSubmissionAction(
  studyId: string,
  participantId: string,
  blockNumber: 1 | 2,
  sequenceNumber: number,
  formData: FormData
) {
  await requireCapability("screening:review");
  const result = await createHutRepository().resetVideoSubmission({
    blockNumber,
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    sequenceNumber,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function resetHutCallEvaluationAction(
  studyId: string,
  participantId: string,
  blockNumber: 1 | 2,
  formData: FormData
) {
  await requireCapability("screening:review");
  const result = await createHutRepository().resetCallEvaluation({
    blockNumber,
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function resetHutApplicationPhotoEvidenceAction(studyId: string, participantId: string, formData: FormData) {
  const actor = await requireCapability("admin:access");
  const result = await createHutRepository().resetApplicationPhotoEvidence({
    actorUserId: actor.id,
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    phase: String(formData.get("phase") ?? "") as HutPhase,
    reason: String(formData.get("reason") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function resetHutQuestionnaireAttemptAction(studyId: string, participantId: string, formData: FormData) {
  const actor = await requireCapability("admin:access");
  const result = await createHutRepository().resetQuestionnaireAttempt({
    actorUserId: actor.id,
    confirmation: String(formData.get("confirmation") ?? ""),
    participantId,
    reason: String(formData.get("reason") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function startHutBlockAction(studyId: string, participantId: string, blockNumber: 1 | 2, formData: FormData) {
  await requireCapability("screening:review");
  const startDate = parseOptionalDate(formData.get("startDate")) ?? new Date();
  const result = await createHutRepository().startBlock({
    blockNumber,
    participantId,
    startDate,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function markHutMissedDayAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().markMissedDay({
    participantId,
    reminderSent: formData.get("reminderSent") === "on",
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function completeHutCallEvaluationAction(studyId: string, participantId: string, blockNumber: 1 | 2, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().completeCallEvaluation({
    blockNumber,
    evaluatorName: String(formData.get("evaluatorName") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function reactivateHutParticipantAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().reactivateParticipant({
    participantId,
    reason: String(formData.get("reason") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function setHutVisualOverrideAction(studyId: string, participantId: string, formData: FormData) {
  const actor = await requireCapability("screening:review");
  const result = await createHutRepository().setVisualOverride({
    actorUserId: actor.id,
    enabled: formData.get("enabled") === "on",
    participantId,
    reason: String(formData.get("reason") ?? ""),
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function setHutTestModeAction(studyId: string, participantId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().setTestMode({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    participantId,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function recoverHutPhaseCodeAction(
  studyId: string,
  participantId: string,
  phase: HutPhase
): Promise<{ code?: string; message: string; ok: boolean }> {
  await requireCapability("screening:review");
  const result = await createHutRepository().recoverPhaseCode({
    participantId,
    phase,
    studyId
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  return {
    code: result.data.code,
    message: "Codigo recuperado. Compartelo solo con el participante correspondiente.",
    ok: true
  };
}

export async function regenerateHutPhaseCodeAction(
  studyId: string,
  participantId: string,
  phase: HutPhase
): Promise<{ code?: string; message: string; ok: boolean }> {
  await requireCapability("screening:review");
  const result = await createHutRepository().regeneratePhaseCode({
    participantId,
    phase,
    studyId
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/admin/studies/${studyId}/hut`);
  return {
    code: result.data.code,
    message: result.message ?? "Codigo HUT regenerado correctamente.",
    ok: true
  };
}

export async function revokeHutPhaseCodeAction(studyId: string, participantId: string, phase: HutPhase) {
  await requireCapability("screening:review");
  const result = await createHutRepository().revokePhaseCode({
    participantId,
    phase,
    studyId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function reviewHutVisualVerificationAction(
  studyId: string,
  participantId: string,
  verificationId: string,
  formData: FormData
) {
  const actor = await requireCapability("screening:review");
  const decision = String(formData.get("decision") ?? "").trim();
  if (decision !== "approve" && decision !== "reject" && decision !== "pending") {
    redirectWithHutMessage(studyId, { message: "Selecciona una decision valida para la revision visual.", ok: false }, participantId);
  }

  const result = await createHutRepository().reviewVisualVerification({
    actorUserId: actor.id,
    decision,
    participantId,
    reason: String(formData.get("reason") ?? ""),
    studyId,
    verificationId
  });

  redirectWithHutMessage(studyId, result, participantId);
}

export async function requestHutReferenceSelfieUploadAction(
  studyId: string,
  participantId: string,
  requestOrigin: string,
  metadata: HutSelfieUploadMetadata
): Promise<HutActionResult<HutSignedSelfieUpload>> {
  const actor = await requireCapability("screening:review");
  return createHutRepository().requestReferenceSelfieUpload({
    actorUserId: actor.id,
    metadata,
    participantId,
    requestOrigin,
    studyId
  });
}

export async function confirmHutReferenceSelfieUploadAction(
  studyId: string,
  participantId: string,
  requestOrigin: string,
  metadata: HutSelfieUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<HutActionResult<{ participantId: string }>> {
  const actor = await requireCapability("screening:review");
  const result = await createHutRepository().confirmReferenceSelfieUpload({
    actorUserId: actor.id,
    metadata,
    participantId,
    requestOrigin,
    studyId
  });

  revalidatePath(`/admin/studies/${studyId}/hut`);

  return result;
}

export async function validateHutPhaseCodeAction(token: string, phase: HutPhase, formData: FormData) {
  const result = await createHutRepository().validatePhaseCode({
    code: String(formData.get("phaseCode") ?? ""),
    phase,
    token
  });
  const params = new URLSearchParams();

  if (result.ok) {
    params.set("hutMessage", result.message ?? "Codigo HUT validado correctamente.");
  } else {
    params.set("hutError", result.message);
  }

  revalidatePath(`/hut/p/${encodeURIComponent(token)}`);
  redirect(`/hut/p/${encodeURIComponent(token)}?${params.toString()}`);
}

export async function saveHutQuestionnaireAnswerAction(token: string, questionCode: string, formData: FormData) {
  const result = await createHutRepository().saveQuestionnaireAnswerByToken({
    answerInput: hutFormDataToAnswerInput(formData),
    questionCode,
    token
  });
  const params = new URLSearchParams();

  if (result.ok) {
    params.set("hutMessage", "Respuesta guardada correctamente.");
  } else {
    params.set("hutError", result.message);
  }

  revalidatePath(`/hut/p/${encodeURIComponent(token)}`);
  redirect(`/hut/p/${encodeURIComponent(token)}?${params.toString()}`);
}

export async function saveHutQuestionnaireAnswerForFieldAction(
  folio: string,
  participantId: string,
  studyId: string,
  questionCode: string,
  formData: FormData
) {
  await requireCapability("field:access");
  const returnQuestionCode = String(formData.get("returnQuestionCode") ?? questionCode).trim();
  const nextQuestionCode = returnQuestionCode === "__HUT_SUMMARY__" ? null : returnQuestionCode || questionCode;
  const result = await createHutRepository().saveQuestionnaireAnswer({
    answerInput: hutFormDataToAnswerInput(formData),
    participantId,
    questionCode,
    studyId
  });
  const terminated = result.ok && Boolean(result.data?.terminated);
  const savedMessage = result.ok
    ? terminated
      ? result.message ?? "Filtro terminado."
      : nextQuestionCode
        ? "Guardado correctamente"
        : "Evaluacion completada"
    : null;
  redirectToFieldHut(
    folio,
    savedMessage,
    result.ok ? null : result.message,
    result.ok ? (terminated ? null : nextQuestionCode) : questionCode
  );
}

export async function completeHutQuestionnaireSectionForFieldAction(
  folio: string,
  participantId: string,
  studyId: string,
  section: HutQuestionnaireSectionId
) {
  await requireCapability("field:access");
  const result = await createHutRepository().completeQuestionnaireSection({
    participantId,
    section,
    studyId
  });
  redirectToFieldHut(folio, result.ok ? result.message ?? "Seccion HUT completada correctamente." : null, result.ok ? null : result.message);
}

export async function requestHutRegistrationSelfieUploadAction(
  token: string,
  metadata: HutSelfieUploadMetadata
): Promise<HutActionResult<HutSignedSelfieUpload>> {
  return createHutRepository().requestRegistrationSelfieUpload({
    metadata,
    token
  });
}

export async function completeHutRegistrationAction(
  token: string,
  metadata: HutSelfieUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  },
  formData: {
    email?: string | null;
    name: string;
    phone: string;
    recruiter?: string | null;
    requestOrigin: string;
  }
): Promise<HutActionResult<{ participantLink: string; participantId: string }>> {
  return createHutRepository().completeRegistration({
    ...formData,
    metadata,
    token
  });
}

export async function requestHutVideoUploadAction(
  token: string,
  metadata: HutVideoUploadMetadata
): Promise<HutActionResult<HutSignedVideoUpload>> {
  return createHutRepository().requestVideoUpload({
    metadata,
    token
  });
}

export async function requestHutDailySelfieUploadAction(
  token: string,
  metadata: HutSelfieUploadMetadata
): Promise<HutActionResult<HutSignedSelfieUpload & { referenceSelfieSignedUrl: string }>> {
  return createHutRepository().requestDailySelfieUpload({
    metadata,
    token
  });
}

export async function requestHutApplicationPhotoUploadAction(
  token: string,
  slotId: HutPhotoTimelineSlotId | null,
  metadata: HutApplicationPhotoUploadMetadata
): Promise<HutActionResult<HutSignedApplicationPhotoUpload & { phase: HutPhase; productCode: string | null }>> {
  return createHutRepository().requestApplicationPhotoUpload({
    metadata,
    slotId,
    token
  });
}

export async function confirmHutApplicationPhotoUploadAction(
  token: string,
  slotId: HutPhotoTimelineSlotId | null,
  metadata: HutApplicationPhotoUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<HutActionResult<{ phase: HutPhase }>> {
  const result = await createHutRepository().confirmApplicationPhotoUpload({
    metadata,
    slotId,
    token
  });

  revalidatePath(`/hut/p/${encodeURIComponent(token)}`);
  if (slotId) {
    revalidatePath(`/hut/p/${encodeURIComponent(token)}/photo/${encodeURIComponent(slotId)}`);
  }

  return result;
}

export async function confirmHutDailySelfieUploadAction(
  token: string,
  metadata: HutSelfieUploadMetadata & {
    faceVerification?: NavigoFaceVerificationClientResult | null;
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<HutActionResult<{ status: "MATCHED" | "NOT_MATCHED" | "PENDING_REVIEW" | "UNCERTAIN" }>> {
  const result = await createHutRepository().confirmDailySelfieUpload({
    faceVerification: metadata.faceVerification,
    metadata,
    token
  });

  revalidatePath(`/hut/p/${encodeURIComponent(token)}`);

  return result;
}

export async function confirmHutVideoUploadAction(
  token: string,
  metadata: HutVideoUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<HutActionResult<{ blockNumber: number; sequenceNumber: number }>> {
  const result = await createHutRepository().confirmVideoUpload({
    metadata,
    token
  });

  revalidatePath(`/hut/p/${encodeURIComponent(token)}`);

  return result;
}

function redirectWithHutMessage(
  studyId: string,
  result: HutActionResult<unknown>,
  participantId?: string
): never {
  revalidatePath(`/admin/studies/${studyId}/hut`);
  const params = new URLSearchParams();
  if (result.ok) {
    params.set("hutMessage", result.message ?? "Operacion HUT completada correctamente.");
  } else {
    params.set("hutError", result.message);
  }
  if (participantId) {
    params.set("participant", participantId);
  }

  redirect(`/admin/studies/${studyId}/hut?${params.toString()}`);
}

function redirectToFieldHut(
  folio: string,
  message: string | null,
  error: string | null,
  questionCode?: string | null
): never {
  revalidatePath("/field/hut");
  const params = new URLSearchParams({ folio });
  if (message) {
    params.set("hutMessage", message);
  }
  if (error) {
    params.set("hutError", error);
  }
  if (questionCode) {
    params.set("questionCode", questionCode);
  }

  redirect(`/field/hut?${params.toString()}`);
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
