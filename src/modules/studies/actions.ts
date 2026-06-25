"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { createStudiesRepository } from "./repository";
import {
  activateStudyForAdmin,
  archiveStudyForAdmin,
  createStudyForAdmin,
  deleteEmptyStudyForAdmin,
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

export async function activateStudyAction(
  studyId: string,
  _previousState: StudyActionState,
  _formData: FormData
): Promise<StudyActionState> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await activateStudyForAdmin({
    actor,
    repository: createStudiesRepository(),
    studyId
  });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/studies/${studyId}`);
    revalidatePath("/field");
  }

  return actionStateFromResult(result, "Estudio activado correctamente.");
}

export async function archiveStudyAction(
  studyId: string,
  _previousState: StudyActionState,
  formData: FormData
): Promise<StudyActionState> {
  const actor = await requireCapability("admin:access");
  const result = await archiveStudyForAdmin({
    actor,
    confirmation: formData.get("confirmation"),
    repository: createStudiesRepository(),
    studyId
  });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/studies/${studyId}`);
    revalidatePath("/field");
    revalidatePath(`/participar/${encodeURIComponent(result.data.code)}`);
  }

  return actionStateFromResult(
    result,
    "Estudio archivado. El portal publico quedo cerrado y los datos se conservan."
  );
}

export async function deleteEmptyStudyAction(
  studyId: string,
  _previousState: StudyActionState,
  formData: FormData
): Promise<StudyActionState> {
  const actor = await requireCapability("admin:access");
  const result = await deleteEmptyStudyForAdmin({
    actor,
    confirmation: formData.get("confirmation"),
    repository: createStudiesRepository(),
    studyId
  });

  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/studies/${studyId}`);
    redirect("/admin?deletedStudy=1");
  }

  return actionStateFromResult(result, "Estudio de prueba eliminado.");
}
