"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import {
  getArmInputFromFormData,
  getProductInputFromFormData,
  getRotationPlanInputFromFormData,
  getUpdateArmInputFromFormData,
  type CanonicalArmCode
} from "./admin-validation";
import { createComparativeConfigurationRepository } from "./admin-repository";
import type { ComparativeActionState } from "./admin-action-state";
import type { ComparativeServiceResult } from "./admin-service";
import {
  createArmForAdmin,
  createProductForAdmin,
  createRotationPlanForAdmin,
  deleteArmForAdmin,
  deleteProductForAdmin,
  retireRotationPlanForAdmin,
  updateArmForAdmin,
  updateProductForAdmin,
  updateRotationPlanForAdmin
} from "./admin-service";

function toActionState<T>(
  result: ComparativeServiceResult<T>,
  successMessage: string
): ComparativeActionState {
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

function revalidateStudyDetail(studyId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/studies/${studyId}`);
}

export async function createProductAction(
  studyId: string,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await createProductForAdmin({
    actor,
    formInput: getProductInputFromFormData(formData),
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Producto creado.");
}

export async function updateProductAction(
  studyId: string,
  productId: string,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await updateProductForAdmin({
    actor,
    formInput: getProductInputFromFormData(formData),
    productId,
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Producto actualizado.");
}

export async function deleteProductAction(
  studyId: string,
  productId: string,
  _previousState: ComparativeActionState,
  _formData: FormData
): Promise<ComparativeActionState> {
  void _previousState;
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await deleteProductForAdmin({
    actor,
    productId,
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Producto eliminado.");
}

export async function createArmAction(
  studyId: string,
  armCode: CanonicalArmCode,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await createArmForAdmin({
    actor,
    armCode,
    formInput: getArmInputFromFormData(formData, armCode),
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Brazo creado.");
}

export async function updateArmAction(
  studyId: string,
  armId: string,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await updateArmForAdmin({
    actor,
    armId,
    formInput: getUpdateArmInputFromFormData(formData),
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Brazo actualizado.");
}

export async function deleteArmAction(
  studyId: string,
  armId: string,
  _previousState: ComparativeActionState,
  _formData: FormData
): Promise<ComparativeActionState> {
  void _previousState;
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await deleteArmForAdmin({
    actor,
    armId,
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Brazo eliminado.");
}

export async function createRotationPlanAction(
  studyId: string,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await createRotationPlanForAdmin({
    actor,
    formInput: getRotationPlanInputFromFormData(formData),
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Rotacion creada.");
}

export async function updateRotationPlanAction(
  studyId: string,
  rotationPlanId: string,
  _previousState: ComparativeActionState,
  formData: FormData
): Promise<ComparativeActionState> {
  const actor = await requireCapability("admin:access");
  const result = await updateRotationPlanForAdmin({
    actor,
    formInput: getRotationPlanInputFromFormData(formData),
    repository: createComparativeConfigurationRepository(),
    rotationPlanId,
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Rotacion actualizada.");
}

export async function retireRotationPlanAction(
  studyId: string,
  rotationPlanId: string,
  _previousState: ComparativeActionState,
  _formData: FormData
): Promise<ComparativeActionState> {
  void _previousState;
  void _formData;

  const actor = await requireCapability("admin:access");
  const result = await retireRotationPlanForAdmin({
    actor,
    repository: createComparativeConfigurationRepository(),
    rotationPlanId,
    studyId
  });

  if (result.ok) {
    revalidateStudyDetail(studyId);
  }

  return toActionState(result, "Rotacion retirada.");
}
