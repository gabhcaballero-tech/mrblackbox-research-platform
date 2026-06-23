"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { createFieldRepository } from "./repository";
import {
  saveFieldScreeningAnswer,
  startFieldScreeningAttempt,
  type FieldDuplicateDetectionResult
} from "./service";
import {
  getFieldAnswerInputFromFormData,
  getFieldParticipantInputFromFormData
} from "./validation";

export type FieldStartActionState = {
  duplicate?: FieldDuplicateDetectionResult;
  error?: string;
  values?: {
    email?: string;
    externalReference?: string;
    name?: string;
    phone?: string;
  };
};

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
  _previousState: FieldStartActionState,
  formData: FormData
): Promise<FieldStartActionState> {
  const actor = await requireCapability("screening:apply");
  const participantInput = getFieldParticipantInputFromFormData(formData);
  const decision = String(formData.get("participantDecision") ?? "");
  const [decisionType, participantProfileId] = decision.split(":");
  const result = await startFieldScreeningAttempt({
    actor,
    confirmation: participantProfileId
      ? {
          allowOpenAttemptOverride: decisionType === "force-new-open",
          participantProfileId
        }
      : undefined,
    formInput: participantInput,
    repository: createFieldRepository(),
    studyId
  });

  if (!result.ok) {
    return {
      error: result.message,
      values: participantInput
    };
  }

  if (result.data.kind === "duplicate_found") {
    return {
      duplicate: result.data,
      values: result.data.input
    };
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
