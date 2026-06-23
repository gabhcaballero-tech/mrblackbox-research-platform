"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createScreenerRepository } from "@/modules/screener/repository";
import { createQuestionLibraryRepository } from "./repository";
import {
  createLibraryRevisionForAdmin,
  insertLibraryRevisionIntoScreenerForAdmin,
  retireLibraryRevisionForAdmin,
  saveBlockFromScreenerForAdmin,
  saveQuestionFromScreenerForAdmin,
  updateLibraryItemMetadataForAdmin
} from "./service";
import { getLibraryRevisionContentFromFormData } from "./revision-form";

export type QuestionLibraryActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  itemId?: string;
  message: string;
  ok: boolean;
};

function getLibrarySaveRawInput(formData: FormData) {
  return {
    category: formData.get("category"),
    confirmGeneric: formData.get("confirmGeneric"),
    description: formData.get("description"),
    name: formData.get("name"),
    scope: formData.get("scope") ?? "STUDY_SPECIFIC",
    tags: formData.get("tags")
  };
}

function revalidateLibrary(studyId?: string, itemId?: string) {
  revalidatePath("/admin/library");

  if (itemId) {
    revalidatePath(`/admin/library/${itemId}`);
  }

  if (studyId) {
    revalidatePath(`/admin/studies/${studyId}/screener`);
  }
}

export async function saveScreenerQuestionToLibraryAction(
  studyId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await saveQuestionFromScreenerForAdmin({
    actor,
    formInput: getLibrarySaveRawInput(formData),
    libraryRepository: createQuestionLibraryRepository(),
    questionId,
    screenerRepository: createScreenerRepository(),
    studyId
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidateLibrary(studyId, result.data.item.id);
}

export async function saveScreenerQuestionToLibraryFeedbackAction(
  studyId: string,
  questionId: string,
  _previousState: QuestionLibraryActionState,
  formData: FormData
): Promise<QuestionLibraryActionState> {
  void _previousState;

  const actor = await requireCapability("admin:access");
  const result = await saveQuestionFromScreenerForAdmin({
    actor,
    formInput: getLibrarySaveRawInput(formData),
    libraryRepository: createQuestionLibraryRepository(),
    questionId,
    screenerRepository: createScreenerRepository(),
    studyId
  });

  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      ok: false
    };
  }

  revalidateLibrary(studyId, result.data.item.id);

  return {
    itemId: result.data.item.id,
    message: "Pregunta guardada correctamente en la biblioteca.",
    ok: true
  };
}

export async function saveScreenerBlockToLibraryAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await saveBlockFromScreenerForAdmin({
    actor,
    formInput: getLibrarySaveRawInput(formData),
    libraryRepository: createQuestionLibraryRepository(),
    questionIds: formData.getAll("questionIds").map(String),
    screenerRepository: createScreenerRepository(),
    studyId
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidateLibrary(studyId, result.data.item.id);
}

export async function saveScreenerBlockToLibraryFeedbackAction(
  studyId: string,
  _previousState: QuestionLibraryActionState,
  formData: FormData
): Promise<QuestionLibraryActionState> {
  void _previousState;

  const actor = await requireCapability("admin:access");
  const result = await saveBlockFromScreenerForAdmin({
    actor,
    formInput: getLibrarySaveRawInput(formData),
    libraryRepository: createQuestionLibraryRepository(),
    questionIds: formData.getAll("questionIds").map(String),
    screenerRepository: createScreenerRepository(),
    studyId
  });

  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      ok: false
    };
  }

  revalidateLibrary(studyId, result.data.item.id);

  return {
    itemId: result.data.item.id,
    message: "Bloque guardado correctamente en la biblioteca.",
    ok: true
  };
}

export async function insertLibraryRevisionIntoScreenerAction(
  studyId: string,
  revisionId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await insertLibraryRevisionIntoScreenerForAdmin({
    actor,
    libraryRepository: createQuestionLibraryRepository(),
    revisionId,
    studyId
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  revalidateLibrary(studyId);
}

export async function retireLibraryRevisionAction(
  itemId: string,
  revisionId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await retireLibraryRevisionForAdmin({
    actor,
    repository: createQuestionLibraryRepository(),
    revisionId
  });

  if (result.ok) {
    revalidateLibrary(undefined, itemId);
  }
}

export async function updateLibraryItemMetadataAction(
  itemId: string,
  _previousState: QuestionLibraryActionState,
  formData: FormData
): Promise<QuestionLibraryActionState> {
  void _previousState;

  const actor = await requireCapability("admin:access");
  const result = await updateLibraryItemMetadataForAdmin({
    actor,
    formInput: getLibrarySaveRawInput(formData),
    itemId,
    repository: createQuestionLibraryRepository()
  });

  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      ok: false
    };
  }

  revalidateLibrary(undefined, itemId);

  return {
    itemId,
    message: "Metadatos actualizados correctamente.",
    ok: true
  };
}

export async function createLibraryRevisionFromFormAction(
  itemId: string,
  _previousState: QuestionLibraryActionState,
  formData: FormData
): Promise<QuestionLibraryActionState> {
  void _previousState;

  const actor = await requireCapability("admin:access");
  let content;

  try {
    content = getLibraryRevisionContentFromFormData(formData);
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Revisa el contenido de la nueva revisión.",
      ok: false
    };
  }

  const result = await createLibraryRevisionForAdmin({
    actor,
    content,
    libraryItemId: itemId,
    repository: createQuestionLibraryRepository()
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidateLibrary(undefined, itemId);

  return {
    itemId,
    message: "Nueva revisión creada correctamente. La revisión anterior quedó como reemplazada.",
    ok: true
  };
}
