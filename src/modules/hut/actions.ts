"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHutRepository, type HutActionResult } from "./repository";
import type { HutSelfieUploadMetadata, HutSignedSelfieUpload, HutSignedVideoUpload, HutVideoUploadMetadata } from "./storage";
import { requireCapability } from "@/shared/auth/session";
import type { NavigoFaceVerificationClientResult } from "@/modules/navigo-app/face-verification-contract";

export async function createHutParticipantAction(studyId: string, formData: FormData) {
  await requireCapability("screening:review");
  const result = await createHutRepository().createParticipant({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    recruiter: String(formData.get("recruiter") ?? ""),
    requestOrigin: String(formData.get("requestOrigin") ?? ""),
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

export async function requestHutReferenceSelfieUploadAction(
  studyId: string,
  participantId: string,
  metadata: HutSelfieUploadMetadata
): Promise<HutActionResult<HutSignedSelfieUpload>> {
  const actor = await requireCapability("screening:review");
  return createHutRepository().requestReferenceSelfieUpload({
    actorUserId: actor.id,
    metadata,
    participantId,
    studyId
  });
}

export async function confirmHutReferenceSelfieUploadAction(
  studyId: string,
  participantId: string,
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
    studyId
  });

  revalidatePath(`/admin/studies/${studyId}/hut`);

  return result;
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

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
