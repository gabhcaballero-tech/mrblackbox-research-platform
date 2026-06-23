"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createScreenerRepository } from "@/modules/screener/repository";
import { createQuestionLibraryRepository } from "./repository";
import {
  insertLibraryRevisionIntoScreenerForAdmin,
  retireLibraryRevisionForAdmin,
  saveBlockFromScreenerForAdmin,
  saveQuestionFromScreenerForAdmin
} from "./service";

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
