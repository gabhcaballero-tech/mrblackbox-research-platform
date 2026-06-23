"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createStudiesRepository } from "./repository";
import {
  createStudyForAdmin,
  type StudyServiceResult,
  updateDraftStudyForAdmin
} from "./service";
import type { StudyActionState } from "./action-state";
import {
  getStudyInputFromFormData,
  getUpdateStudyInputFromFormData
} from "./validation";

function actionStateFromResult<T>(
  result: StudyServiceResult<T>,
  successMessage: string
): StudyActionState {
  if (result.ok) {
    return {
      message: successMessage,
      status: "success"
    };
  }

  return {
    fieldErrors: result.fieldErrors,
    message: result.message,
    status: "error"
  };
}

export async function createStudyAction(
  _previousState: StudyActionState,
  formData: FormData
): Promise<StudyActionState> {
  const actor = await requireCapability("admin:access");
  const result = await createStudyForAdmin({
    actor,
    formInput: getStudyInputFromFormData(formData),
    repository: createStudiesRepository()
  });

  if (result.ok) {
    revalidatePath("/admin");
  }

  return actionStateFromResult(result, "Estudio creado en borrador.");
}

export async function updateStudyAction(
  _previousState: StudyActionState,
  formData: FormData
): Promise<StudyActionState> {
  const actor = await requireCapability("admin:access");
  const result = await updateDraftStudyForAdmin({
    actor,
    formInput: getUpdateStudyInputFromFormData(formData),
    repository: createStudiesRepository()
  });

  if (result.ok) {
    revalidatePath("/admin");
  }

  return actionStateFromResult(result, "Estudio actualizado.");
}
