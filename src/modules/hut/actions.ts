"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHutRepository, type HutActionResult } from "./repository";
import type { HutSignedVideoUpload, HutVideoUploadMetadata } from "./storage";
import { requireCapability } from "@/shared/auth/session";

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

export async function requestHutVideoUploadAction(
  token: string,
  metadata: HutVideoUploadMetadata
): Promise<HutActionResult<HutSignedVideoUpload>> {
  return createHutRepository().requestVideoUpload({
    metadata,
    token
  });
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
