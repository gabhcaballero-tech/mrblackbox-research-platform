"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { initialScreenerDraftActionState, type ScreenerDraftActionState } from "./action-state";
import { createScreenerRepository } from "./repository";
import {
  addConsentDefaultOptionsForAdmin,
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
  updateScreenerQuestionForAdmin,
  updateScreenerQuestionVisibilityForAdmin,
  updateScreenerRuleForAdmin
} from "./service";
import {
  getMetadataInputFromFormData,
  getNseInputFromFormData,
  getOptionInputFromFormData,
  getQuestionInputFromFormData,
  getRuleInputFromFormData,
  getVisibilityInputFromFormData,
  type ScreenerAdminFieldErrors
} from "./validation";

export type ScreenerOptionActionState = {
  fieldErrors?: ScreenerAdminFieldErrors;
  message: string;
  ok: boolean;
};

export type ScreenerRuleActionState = ScreenerOptionActionState;
export type ScreenerNseActionState = ScreenerOptionActionState;
export type ScreenerVisibilityActionState = ScreenerOptionActionState;
export type ScreenerQuestionMoveActionState = ScreenerOptionActionState;

function actionStateFromResult(
  result: {
    fieldErrors?: ScreenerAdminFieldErrors;
    ok: boolean;
    message?: string;
  },
  successMessage: string
): ScreenerDraftActionState {
  if (result.ok) {
    return {
      message: successMessage,
      status: "success"
    };
  }

  return {
    fieldErrors: result.fieldErrors,
    message: sanitizeScreenerActionMessage(result.message ?? "No fue posible completar la acción."),
    status: "error"
  };
}

function revalidateScreener(studyId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/studies/${studyId}`);
  revalidatePath(`/admin/studies/${studyId}/screener`);
}

function sanitizeScreenerActionMessage(message: string) {
  if (message.includes("al menos una pregunta")) {
    return "No puedes publicar una versión sin preguntas.";
  }

  return message;
}

function logScreenerActionFailure(step: "publish" | "saveDraft", studyId: string, error: unknown) {
  if (error && typeof error === "object" && "digest" in error) {
    throw error;
  }

  console.error(`screener builder action failed: step=${step} studyId=${studyId}`);
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
  _previousState: ScreenerDraftActionState,
  formData: FormData
): Promise<ScreenerDraftActionState> {
  void _previousState;

  try {
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

    return actionStateFromResult(result, "Borrador guardado correctamente.");
  } catch (error) {
    logScreenerActionFailure("saveDraft", studyId, error);

    return {
      ...initialScreenerDraftActionState,
      message: "No fue posible guardar el borrador. Intenta de nuevo.",
      status: "error"
    };
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

export async function moveScreenerQuestionWithFeedbackAction(
  studyId: string,
  questionId: string,
  direction: "down" | "up",
  _previousState: ScreenerQuestionMoveActionState,
  _formData: FormData
): Promise<ScreenerQuestionMoveActionState> {
  void _previousState;
  void _formData;

  try {
    const actor = await requireCapability("admin:access");
    const result = await moveScreenerQuestionForAdmin({
      actor,
      direction,
      questionId,
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Pregunta reordenada correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo reordenar la pregunta. Intenta nuevamente.",
      ok: false
    };
  }
}

export async function addScreenerOptionAction(
  studyId: string,
  questionId: string,
  formData: FormData
): Promise<ScreenerOptionActionState> {
  try {
    const actor = await requireCapability("admin:access");
    const result = await addScreenerOptionForAdmin({
      actor,
      formInput: getOptionInputFromFormData(formData),
      questionId,
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "La opción se guardó correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo guardar la opción. Intenta nuevamente.",
      ok: false
    };
  }
}

export async function updateScreenerOptionAction(
  studyId: string,
  questionId: string,
  optionValue: string,
  formData: FormData
): Promise<ScreenerOptionActionState> {
  try {
    const actor = await requireCapability("admin:access");
    const result = await updateScreenerOptionForAdmin({
      actor,
      formInput: getOptionInputFromFormData(formData),
      optionValue,
      questionId,
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Opción actualizada correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo actualizar la opción. Intenta nuevamente.",
      ok: false
    };
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

export async function addConsentDefaultOptionsAction(
  studyId: string,
  questionId: string,
  _formData: FormData
): Promise<ScreenerOptionActionState> {
  void _formData;

  try {
    const actor = await requireCapability("admin:access");
    const result = await addConsentDefaultOptionsForAdmin({
      actor,
      questionId,
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Opciones de consentimiento agregadas correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudieron agregar las opciones de consentimiento. Intenta nuevamente.",
      ok: false
    };
  }
}

export async function addScreenerRuleAction(
  studyId: string,
  formData: FormData
): Promise<ScreenerRuleActionState> {
  try {
    const actor = await requireCapability("admin:access");
    const result = await addScreenerRuleForAdmin({
      actor,
      formInput: getRuleInputFromFormData(formData),
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Regla guardada correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo guardar la regla. Intenta nuevamente.",
      ok: false
    };
  }
}

export async function updateScreenerRuleAction(
  studyId: string,
  ruleId: string,
  formData: FormData
): Promise<ScreenerRuleActionState> {
  try {
    const actor = await requireCapability("admin:access");
    const result = await updateScreenerRuleForAdmin({
      actor,
      formInput: getRuleInputFromFormData(formData),
      repository: createScreenerRepository(),
      ruleId,
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Regla actualizada correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo actualizar la regla. Intenta nuevamente.",
      ok: false
    };
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

export async function updateScreenerQuestionVisibilityAction(
  studyId: string,
  questionId: string,
  _previousState: ScreenerVisibilityActionState,
  formData: FormData
): Promise<ScreenerVisibilityActionState> {
  void _previousState;

  try {
    const actor = await requireCapability("admin:access");
    const result = await updateScreenerQuestionVisibilityForAdmin({
      actor,
      formInput: getVisibilityInputFromFormData(formData),
      questionId,
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "Visibilidad condicional actualizada correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo actualizar la visibilidad condicional. Intenta nuevamente.",
      ok: false
    };
  }
}

export async function saveScreenerNseAction(
  studyId: string,
  _previousState: ScreenerNseActionState,
  formData: FormData
): Promise<ScreenerNseActionState> {
  void _previousState;

  try {
    const actor = await requireCapability("admin:access");
    const result = await saveScreenerNseForAdmin({
      actor,
      formInput: getNseInputFromFormData(formData),
      repository: createScreenerRepository(),
      studyId
    });

    if (!result.ok) {
      return {
        fieldErrors: result.fieldErrors,
        message: result.message,
        ok: false
      };
    }

    revalidateScreener(studyId);
    return {
      message: "NSE guardado correctamente.",
      ok: true
    };
  } catch {
    return {
      message: "No se pudo guardar el NSE. Intenta nuevamente.",
      ok: false
    };
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
  _previousState: ScreenerDraftActionState,
  _formData: FormData
): Promise<ScreenerDraftActionState> {
  void _previousState;
  void _formData;

  try {
    const actor = await requireCapability("admin:access");
    const result = await publishScreenerForAdmin({
      actor,
      repository: createScreenerRepository(),
      studyId
    });

    if (result.ok) {
      revalidateScreener(studyId);
    }

    return actionStateFromResult(result, "Versión publicada correctamente.");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }

    logScreenerActionFailure("publish", studyId, error);
    return {
      ...initialScreenerDraftActionState,
      message: "No fue posible publicar la versión. Intenta de nuevo.",
      status: "error"
    };
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
