"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { createScreenerRepository } from "./repository";
import {
  addScreenerOptionForAdmin,
  addScreenerQuestionForAdmin,
  addScreenerRuleForAdmin,
  clearScreenerNseForAdmin,
  createScreenerDraftForAdmin,
  deleteScreenerOptionForAdmin,
  deleteScreenerQuestionForAdmin,
  deleteScreenerRuleForAdmin,
  moveScreenerOptionForAdmin,
  moveScreenerQuestionForAdmin,
  publishScreenerForAdmin,
  retireScreenerVersionForAdmin,
  saveScreenerMetadataForAdmin,
  saveScreenerNseForAdmin,
  updateScreenerOptionForAdmin,
  updateScreenerQuestionForAdmin
} from "./service";
import {
  getMetadataInputFromFormData,
  getNseInputFromFormData,
  getOptionInputFromFormData,
  getQuestionInputFromFormData,
  getRuleInputFromFormData
} from "./validation";

function revalidateScreener(studyId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/studies/${studyId}`);
  revalidatePath(`/admin/studies/${studyId}/screener`);
}

export async function createScreenerDraftAction(
  studyId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await createScreenerDraftForAdmin({
    actor,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function saveScreenerMetadataAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await saveScreenerMetadataForAdmin({
    actor,
    formInput: getMetadataInputFromFormData(formData),
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function addScreenerQuestionAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await addScreenerQuestionForAdmin({
    actor,
    formInput: getQuestionInputFromFormData(formData),
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function updateScreenerQuestionAction(
  studyId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await updateScreenerQuestionForAdmin({
    actor,
    formInput: getQuestionInputFromFormData(formData),
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function deleteScreenerQuestionAction(
  studyId: string,
  questionId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await deleteScreenerQuestionForAdmin({
    actor,
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function moveScreenerQuestionAction(
  studyId: string,
  questionId: string,
  direction: "down" | "up",
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await moveScreenerQuestionForAdmin({
    actor,
    direction,
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function addScreenerOptionAction(
  studyId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await addScreenerOptionForAdmin({
    actor,
    formInput: getOptionInputFromFormData(formData),
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function updateScreenerOptionAction(
  studyId: string,
  questionId: string,
  optionValue: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await updateScreenerOptionForAdmin({
    actor,
    formInput: getOptionInputFromFormData(formData),
    optionValue,
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function deleteScreenerOptionAction(
  studyId: string,
  questionId: string,
  optionValue: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await deleteScreenerOptionForAdmin({
    actor,
    optionValue,
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function moveScreenerOptionAction(
  studyId: string,
  questionId: string,
  optionValue: string,
  direction: "down" | "up",
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await moveScreenerOptionForAdmin({
    actor,
    direction,
    optionValue,
    questionId,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function addScreenerRuleAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await addScreenerRuleForAdmin({
    actor,
    formInput: getRuleInputFromFormData(formData),
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function deleteScreenerRuleAction(
  studyId: string,
  ruleId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await deleteScreenerRuleForAdmin({
    actor,
    repository: createScreenerRepository(),
    ruleId,
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function saveScreenerNseAction(
  studyId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireCapability("admin:access");
  const result = await saveScreenerNseForAdmin({
    actor,
    formInput: getNseInputFromFormData(formData),
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function clearScreenerNseAction(
  studyId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await clearScreenerNseForAdmin({
    actor,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function publishScreenerAction(
  studyId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await publishScreenerForAdmin({
    actor,
    repository: createScreenerRepository(),
    studyId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}

export async function retireScreenerVersionAction(
  studyId: string,
  versionId: string,
  _formData: FormData
): Promise<void> {
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await retireScreenerVersionForAdmin({
    actor,
    repository: createScreenerRepository(),
    studyId,
    versionId
  });

  if (result.ok) {
    revalidateScreener(studyId);
  }
}
