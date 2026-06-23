"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { createFieldRepository } from "./repository";
import {
  saveFieldScreeningAnswer,
  startFieldScreeningAttempt
} from "./service";
import {
  getFieldAnswerInputFromFormData,
  getFieldParticipantInputFromFormData
} from "./validation";

function fieldAttemptPath(attemptId: string, questionId?: string | null, message?: string) {
  const params = new URLSearchParams();

  if (questionId) {
    params.set("question", questionId);
  }

  if (message) {
    params.set("error", message);
  }

  const query = params.toString();
  return `/field/screening/${attemptId}${query ? `?${query}` : ""}`;
}

export async function startFieldScreeningAttemptAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:apply");
  const result = await startFieldScreeningAttempt({
    actor,
    formInput: getFieldParticipantInputFromFormData(formData),
    repository: createFieldRepository(),
    studyId
  });

  if (!result.ok) {
    redirect(`/field/studies/${studyId}/screening/new?error=${encodeURIComponent(result.message)}`);
  }

  revalidatePath("/field");
  revalidatePath(`/field/studies/${studyId}`);
  redirect(`/field/screening/${result.data.attemptId}`);
}

export async function saveFieldScreeningAnswerAction(
  attemptId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("screening:apply");
  const result = await saveFieldScreeningAnswer({
    actor,
    attemptId,
    formInput: getFieldAnswerInputFromFormData(formData),
    questionId,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    redirect(fieldAttemptPath(attemptId, questionId, result.message));
  }

  revalidatePath(`/field/screening/${attemptId}`);

  if (result.data.closed) {
    redirect(`/field/screening/${attemptId}/result`);
  }

  redirect(fieldAttemptPath(attemptId, result.data.nextQuestionId));
}
