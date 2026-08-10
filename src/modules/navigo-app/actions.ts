"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { participantTokenSchema } from "@/shared/validation/participant";
import { ensureNavigoAppFoundation } from "./loader";
import {
  appendNavigoTestModeParams,
  isValidNavigoTestMode,
  type NavigoTestModeParams
} from "./test-mode";
import {
  createNavigoAppRepository,
  type NavigoActionResult,
  type NavigoEvaluationLinkWhatsAppSendResult,
  type NavigoEvaluationReminderManualSendResult,
  type NavigoParticipantLinksWhatsAppSendResult,
  type NavigoParticipantLinkSendType,
  type NavigoSignedActivityUpload
} from "./repository";
import type { NavigoFaceVerificationClientResult } from "./face-verification-contract";
import {
  parseNavigoDateTimeLocal,
  parseNavigoParticipantImportText,
  parseNavigoRotationImportText,
  type NavigoAnswerInput,
  type NavigoParticipantImportRowInput,
  type NavigoRotationImportRowInput
} from "./service";
import { isSupportedNavigoActivityCode, type NavigoActivityCode } from "./definition";
import type { NavigoRotationImportActionState } from "./rotation-import-state";
import type { NavigoRotationWorkbookImportActionState } from "./rotation-workbook-import-state";
import type { NavigoManualRotationActionState } from "./manual-rotation-state";
import {
  parseNavigoRotationWorkbook,
  type NavigoHutRotationWorkbookRowInput,
  type NavigoRotationWorkbookRowInput
} from "./rotation-workbook";
import type { NavigoParticipantImportActionState } from "./participant-import-state";
import type { EvidenceUploadMetadata } from "@/modules/participant-portal/evidence-storage";
import { cleanupNavigoTestRotations } from "./rotation-cleanup";

export async function startNavigoT0Action(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("application-time:record");
  const foundation = await ensureNavigoAppFoundation({ actorUserId: actor.id });

  if (!foundation.ok) {
    redirectWithNavigoMessage(studyId, { error: foundation.message });
  }

  const timeZoneIana = String(formData.get("timeZoneIana") ?? "America/Mexico_City");
  const applicationStartedAt = parseApplicationStartedAt(formData.get("applicationStartedAt"), timeZoneIana);
  if (!applicationStartedAt) {
    redirectWithNavigoMessage(studyId, { error: "Selecciona la hora de aplicacion inicial." });
  }
  const t0Answers = parseNavigoAnswersFromFormData(formData);
  const result = await createNavigoAppRepository().startT0({
    actorUserId: actor.id,
    applicationStartedAt,
    studyParticipantId,
    t0Answers
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.message
  });
}

export async function generateNavigoParticipantLinkAction(
  studyId: string,
  studyParticipantId: string,
  forceRegenerate: boolean
) {
  const actor = await requireCapability("application-time:record");
  await ensureNavigoAppFoundation({ actorUserId: actor.id });
  const result = await createNavigoAppRepository().generateParticipantLink({
    actorUserId: actor.id,
    forceRegenerate,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function releaseNavigoAfterCtlAction(studyId: string, studyParticipantId: string) {
  const actor = await requireCapability("admin:access");
  await ensureNavigoAppFoundation({ actorUserId: actor.id });
  const result = await createNavigoAppRepository().releaseParticipantAfterCtl({
    actorUserId: actor.id,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message, participant: studyParticipantId });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message, participant: studyParticipantId });
}

export async function registerNavigoDirectParticipantAction(studyId: string, formData: FormData) {
  const actor = await requireCapability("screening:review");
  await ensureNavigoAppFoundation({ actorUserId: actor.id });
  const result = await createNavigoAppRepository().registerDirectParticipant({
    actorUserId: actor.id,
    celular: String(formData.get("celular") ?? ""),
    correo: String(formData.get("correo") ?? ""),
    folio: String(formData.get("folio") ?? ""),
    generateLink: formData.get("generateLink") === "on",
    nombre: String(formData.get("nombre") ?? ""),
    observaciones: String(formData.get("observaciones") ?? ""),
    reclutador: String(formData.get("reclutador") ?? ""),
    studyId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.data.linkToken
      ? "Participante registrado y link generado correctamente."
      : "Participante registrado correctamente.",
    participant: result.data.studyParticipantId
  });
}

export type NavigoEvaluationLinkWhatsAppActionResult =
  | {
      data: Omit<NavigoEvaluationLinkWhatsAppSendResult, "generatedAt"> & {
        generatedAtIso: string;
        message: string;
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoEvaluationReminderNowActionResult =
  | {
      data: Omit<NavigoEvaluationReminderManualSendResult, "generatedAt"> & {
        generatedAtIso: string;
        message: string;
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type NavigoParticipantLinksWhatsAppActionResult =
  | {
      data: Omit<NavigoParticipantLinksWhatsAppSendResult, "generatedAt"> & {
        generatedAtIso: string;
        message: string;
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export async function sendNavigoEvaluationLinkWhatsAppAction(
  studyId: string,
  studyParticipantId: string,
  requestOrigin: string
): Promise<NavigoEvaluationLinkWhatsAppActionResult> {
  const actor = await requireCapability("screening:review");
  const result = await createNavigoAppRepository().sendEvaluationLinkWhatsApp({
    actorUserId: actor.id,
    requestOrigin,
    studyId,
    studyParticipantId
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  try {
    revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  } catch {
    // El envio y el enlace ya quedaron resueltos; no ocultamos el exito por una actualizacion secundaria.
  }

  return {
    data: {
      evaluationUrl: result.data.evaluationUrl,
      folio: result.data.folio,
      generatedAtIso: result.data.generatedAt.toISOString(),
      message: result.data.whatsappStatus === "ENVIADO"
        ? "Enlace de evaluacion enviado por WhatsApp."
        : "Enlace generado. WhatsApp fallo; copia el enlace para compartirlo manualmente.",
      phone: result.data.phone,
      whatsappError: result.data.whatsappError,
      whatsappMessageId: result.data.whatsappMessageId,
      whatsappStatus: result.data.whatsappStatus
    },
    ok: true
  };
}

export async function sendNavigoParticipantLinksWhatsAppAction(
  studyId: string,
  studyParticipantId: string,
  requestOrigin: string,
  linkType: NavigoParticipantLinkSendType
): Promise<NavigoParticipantLinksWhatsAppActionResult> {
  const actor = await requireCapability("screening:review");
  const result = await createNavigoAppRepository().sendParticipantLinksWhatsApp({
    actorUserId: actor.id,
    linkType,
    requestOrigin,
    studyId,
    studyParticipantId
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  try {
    revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  } catch {
    // El envio y la auditoria ya quedaron resueltos; no ocultamos el resultado por una actualizacion secundaria.
  }

  return {
    data: {
      folio: result.data.folio,
      generatedAtIso: result.data.generatedAt.toISOString(),
      hutUrl: result.data.hutUrl,
      message: result.data.whatsappStatus === "ENVIADO"
        ? linkSentSuccessMessage(result.data.sentLinkType)
        : "Enlace preparado. WhatsApp fallo; copia el enlace disponible para compartirlo manualmente.",
      navigoUrl: result.data.navigoUrl,
      phone: result.data.phone,
      requestedLinkType: result.data.requestedLinkType,
      sentLinkType: result.data.sentLinkType,
      warnings: result.data.warnings,
      whatsappError: result.data.whatsappError,
      whatsappMessageId: result.data.whatsappMessageId,
      whatsappStatus: result.data.whatsappStatus
    },
    ok: true
  };
}

function linkSentSuccessMessage(linkType: NavigoParticipantLinkSendType): string {
  if (linkType === "BOTH") {
    return "Enlaces Navigo y HUT enviados por WhatsApp.";
  }

  return linkType === "HUT"
    ? "Enlace HUT enviado por WhatsApp."
    : "Enlace Navigo enviado por WhatsApp.";
}

export async function sendNavigoEvaluationReminderNowAction(
  studyId: string,
  participantActivityId: string,
  requestOrigin: string
): Promise<NavigoEvaluationReminderNowActionResult> {
  const actor = await requireCapability("screening:review");
  const result = await createNavigoAppRepository().sendEvaluationReminderNow({
    actorUserId: actor.id,
    participantActivityId,
    requestOrigin,
    studyId
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  try {
    revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  } catch {
    // El recordatorio ya fue auditado; no ocultamos el resultado por una actualizacion secundaria.
  }

  return {
    data: {
      activityCode: result.data.activityCode,
      evaluationUrl: result.data.evaluationUrl,
      folio: result.data.folio,
      generatedAtIso: result.data.generatedAt.toISOString(),
      message: result.data.whatsappStatus === "ENVIADO"
        ? "Recordatorio enviado por WhatsApp."
        : "Recordatorio registrado. WhatsApp fallo; revisa la auditoria.",
      phone: result.data.phone,
      whatsappError: result.data.whatsappError,
      whatsappMessageId: result.data.whatsappMessageId,
      whatsappStatus: result.data.whatsappStatus
    },
    ok: true
  };
}

export async function generateNavigoParticipantLinksForStudyAction(studyId: string, formData: FormData) {
  const actor = await requireCapability("screening:review");
  await ensureNavigoAppFoundation({ actorUserId: actor.id });
  const result = await createNavigoAppRepository().generateParticipantLinksForStudy({
    actorUserId: actor.id,
    forceRegenerate: formData.get("forceRegenerate") === "on",
    studyId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: `Enlaces listos. Existentes: ${result.data.existing}. Creados: ${result.data.created}. Regenerados: ${result.data.regenerated}. Errores: ${result.data.errors}.`
  });
}

export async function resetNavigoParticipantAppAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("activity:reopen");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (confirmation !== "REINICIAR APP") {
    redirectWithNavigoMessage(studyId, { error: "Escribe REINICIAR APP para confirmar." });
  }

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la correccion." });
  }

  const result = await createNavigoAppRepository().resetParticipantApp({
    actorUserId: actor.id,
    reason,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function deleteNavigoParticipantAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("admin:access");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (confirmation !== "ELIMINAR PARTICIPANTE") {
    redirectWithNavigoMessage(studyId, { error: "Escribe ELIMINAR PARTICIPANTE para confirmar." });
  }

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la eliminacion." });
  }

  const result = await createNavigoAppRepository().deleteParticipant({
    actorUserId: actor.id,
    reason,
    studyId,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function deleteNavigoParticipantStagesAction(
  studyId: string,
  studyParticipantId: string,
  formData: FormData
) {
  const actor = await requireCapability("activity:reopen");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const fromCode = String(formData.get("fromCode") ?? "");

  if (confirmation !== "ELIMINAR ETAPAS") {
    redirectWithNavigoMessage(studyId, { error: "Escribe ELIMINAR ETAPAS para confirmar." });
  }

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la correccion." });
  }

  if (!isSupportedNavigoActivityCode(fromCode)) {
    redirectWithNavigoMessage(studyId, { error: "Selecciona una etapa valida." });
  }

  const result = await createNavigoAppRepository().deleteParticipantStagesFrom({
    actorUserId: actor.id,
    fromCode: fromCode as NavigoActivityCode,
    reason,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function reopenNavigoActivityOutsideWindowAction(studyId: string, participantActivityId: string, formData: FormData) {
  const actor = await requireCapability("activity:reopen");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    redirectWithNavigoMessage(studyId, { error: "Captura el motivo de la reapertura." });
  }

  const result = await createNavigoAppRepository().reopenActivityOutsideWindow({
    actorUserId: actor.id,
    participantActivityId,
    reason,
    studyId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

export async function configureNavigoRotationAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("rotation:register");
  const result = await createNavigoAppRepository().configureParticipantRotation({
    actorUserId: actor.id,
    leftFragranceCode: String(formData.get("leftFragranceCode") ?? ""),
    rightFragranceCode: String(formData.get("rightFragranceCode") ?? ""),
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message, participant: studyParticipantId });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message:
      "Rotacion Navigo configurada correctamente. La rotacion triangular CTL se conserva desde ROTACIONES NAVIGO.xlsx.",
    participant: studyParticipantId
  });
}

export async function configureNavigoRotationInlineAction(
  studyId: string,
  studyParticipantId: string,
  _previousState: NavigoManualRotationActionState,
  formData: FormData
): Promise<NavigoManualRotationActionState> {
  const actor = await requireCapability("rotation:register");
  const result = await createNavigoAppRepository().configureParticipantRotation({
    actorUserId: actor.id,
    leftFragranceCode: String(formData.get("leftFragranceCode") ?? ""),
    rightFragranceCode: String(formData.get("rightFragranceCode") ?? ""),
    studyParticipantId
  });

  if (!result.ok) {
    return {
      message: result.message,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);

  return {
    message:
      "Rotacion Navigo configurada correctamente. La rotacion triangular CTL se conserva desde ROTACIONES NAVIGO.xlsx.",
    status: "success"
  };
}

export async function configureNavigoStudyRotationAction(studyId: string, formData: FormData) {
  const actor = await requireCapability("rotation:register");
  const result = await createNavigoAppRepository().configureStudyRotation({
    actorUserId: actor.id,
    firstInternalName: String(formData.get("firstInternalName") ?? ""),
    firstSampleKey: String(formData.get("firstSampleKey") ?? ""),
    secondInternalName: String(formData.get("secondInternalName") ?? ""),
    secondSampleKey: String(formData.get("secondSampleKey") ?? ""),
    studyId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: "Configuracion real de muestras y rotaciones guardada correctamente."
  });
}

export async function clearNavigoParticipantRotationAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("rotation:register");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "LIMPIAR ROTACION") {
    redirectWithNavigoMessage(studyId, { error: "Escribe LIMPIAR ROTACION para confirmar.", participant: studyParticipantId });
  }

  const result = await createNavigoAppRepository().clearParticipantRotation({
    actorUserId: actor.id,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message, participant: studyParticipantId });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.message,
    participant: studyParticipantId
  });
}

export async function cleanupNavigoTestRotationsAction(studyId: string, formData: FormData) {
  const actor = await requireCapability("rotation:register");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "LIMPIAR ROTACIONES DE PRUEBA") {
    redirectWithNavigoMessage(studyId, { error: "Escribe LIMPIAR ROTACIONES DE PRUEBA para confirmar." });
  }

  const result = await cleanupNavigoTestRotations({
    actorUserId: actor.id,
    studyId
  });

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  redirectWithNavigoMessage(studyId, {
    message: `Rotaciones de prueba limpiadas. RotationPlan eliminados: ${result.data.deleted.rotationPlan ?? 0}.`
  });
}

export async function updateNavigoVisualVerificationModeAction(studyId: string, studyParticipantId: string, formData: FormData) {
  const actor = await requireCapability("screening:review");
  const mode = String(formData.get("visualVerificationMode") ?? "");

  if (mode !== "required" && mode !== "disabled") {
    redirectWithNavigoMessage(studyId, { error: "Selecciona si la identificación visual es requerida o no requerida.", participant: studyParticipantId });
  }

  const result = await createNavigoAppRepository().updateParticipantVisualVerificationMode({
    actorUserId: actor.id,
    mode,
    studyParticipantId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message, participant: studyParticipantId });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, {
    message: result.message,
    participant: studyParticipantId
  });
}

export async function previewNavigoRotationImportAction(
  studyId: string,
  _previousState: NavigoRotationImportActionState,
  formData: FormData
): Promise<NavigoRotationImportActionState> {
  await requireCapability("rotation:register");
  const file = formData.get("rotationFile");

  if (!(file instanceof File) || file.size === 0) {
    return {
      message: "Selecciona un archivo CSV o TSV compatible con Excel.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    return await previewNavigoRotationImportTextAction(studyId, file.name, await file.text());
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "preview-file",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: [],
      status: "error"
    };
  }
}

export async function previewNavigoRotationImportTextAction(
  studyId: string,
  filename: string,
  text: string
): Promise<NavigoRotationImportActionState> {
  await requireCapability("rotation:register");

  let parsed: ReturnType<typeof parseNavigoRotationImportText>;

  try {
    parsed = parseNavigoRotationImportText({
      filename,
      text
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "parse",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  if (!parsed.ok) {
    return {
      message: parsed.message,
      preview: null,
      rows: [],
      status: "error"
    };
  }

  let result: Awaited<ReturnType<ReturnType<typeof createNavigoAppRepository>["previewRotationImport"]>>;

  try {
    result = await createNavigoAppRepository().previewRotationImport({
      rows: parsed.rows,
      studyId
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "preview",
      studyId
    });

    return {
      message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }

  if (!result.ok) {
    return {
      message: result.message,
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }

  return {
    message: "Previsualizacion lista. Revisa los errores antes de aplicar.",
    preview: result.data,
    rows: parsed.rows,
    status: result.data.summary.rowsWithError > 0 ? "error" : "success"
  };
}

export async function applyNavigoRotationImportAction(
  studyId: string,
  _previousState: NavigoRotationImportActionState,
  formData: FormData
): Promise<NavigoRotationImportActionState> {
  return applyNavigoRotationImportRowsAction(studyId, parseRowsJson(String(formData.get("rowsJson") ?? "[]")));
}

export async function applyNavigoRotationImportRowsAction(
  studyId: string,
  rows: NavigoRotationImportRowInput[]
): Promise<NavigoRotationImportActionState> {
  const actor = await requireCapability("rotation:register");

  if (rows.length === 0) {
    return {
      message: "Primero previsualiza un archivo valido.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  let result: Awaited<ReturnType<ReturnType<typeof createNavigoAppRepository>["applyRotationImport"]>>;

  try {
    result = await createNavigoAppRepository().applyRotationImport({
      actorUserId: actor.id,
      rows,
      studyId
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "apply",
      studyId
    });

    return {
      message: "No fue posible guardar la rotacion. Revisa logs.",
      preview: null,
      rows,
      status: "error"
    };
  }

  if (!result.ok) {
    return {
      message: result.message,
      preview: result.data ?? null,
      rows,
      status: "error"
    };
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);

  return {
    message: `Rotacion importada correctamente. Filas aplicadas: ${result.data.summary.validRows}. Filas omitidas: 0. Filas con error: ${result.data.summary.rowsWithError}. Participantes actualizados: ${result.data.summary.updatable}.`,
    preview: result.data,
    rows,
    status: "success"
  };
}

export async function previewNavigoRotationWorkbookImportAction(
  studyId: string,
  formData: FormData
): Promise<NavigoRotationWorkbookImportActionState> {
  await requireCapability("rotation:register");
  const file = formData.get("rotationWorkbookFile");

  if (!(file instanceof File) || file.size === 0) {
    return {
      filename: null,
      hutRows: [],
      message: "Selecciona ROTACIONES NAVIGO.xlsx.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  let parsed: ReturnType<typeof parseNavigoRotationWorkbook>;
  try {
    parsed = parseNavigoRotationWorkbook({
      bytes: await file.arrayBuffer(),
      filename: file.name
    });
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "parse-workbook",
      studyId
    });

    return {
      filename: file.name,
      hutRows: [],
      message: "No fue posible previsualizar el XLSX oficial. Revisa el archivo y vuelve a intentarlo.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  if (!parsed.ok) {
    return {
      filename: file.name,
      hutRows: [],
      message: parsed.message,
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    const result = await createNavigoAppRepository().previewRotationWorkbookImport({
      hutRows: parsed.hutRows,
      rows: parsed.rows,
      studyId
    });

    if (!result.ok) {
      return {
        filename: file.name,
        hutRows: parsed.hutRows,
        message: result.message,
        preview: null,
        rows: parsed.rows,
        status: "error"
      };
    }

    return {
      filename: file.name,
      hutRows: parsed.hutRows,
      message: "Previsualizacion XLSX lista. Revisa los errores antes de aplicar.",
      preview: result.data,
      rows: parsed.rows,
      status: result.data.summary.rowsWithError > 0 ? "error" : "success"
    };
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "preview-workbook",
      studyId
    });

    return {
      filename: file.name,
      hutRows: parsed.hutRows,
      message: "No fue posible previsualizar el XLSX oficial. Revisa logs.",
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }
}

export async function applyNavigoRotationWorkbookImportRowsAction(
  studyId: string,
  filename: string,
  rows: NavigoRotationWorkbookRowInput[],
  hutRows: NavigoHutRotationWorkbookRowInput[] = []
): Promise<NavigoRotationWorkbookImportActionState> {
  const actor = await requireCapability("rotation:register");

  if (rows.length === 0) {
    return {
      filename,
      hutRows,
      message: "Primero previsualiza ROTACIONES NAVIGO.xlsx.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    const result = await createNavigoAppRepository().applyRotationWorkbookImport({
      actorUserId: actor.id,
      filename,
      hutRows,
      rows,
      studyId
    });

    if (!result.ok) {
      return {
        filename,
        hutRows,
        message: result.message,
        preview: result.data ?? null,
        rows,
        status: "error"
      };
    }

    revalidatePath(`/admin/studies/${studyId}/navigo-app`);

    return {
      filename,
      hutRows,
      message: `ROTACIONES NAVIGO.xlsx importado correctamente. Filas CLT aplicadas: ${result.data.summary.validRows}. Rotaciones triangulares listas: ${result.data.summary.triangularComplete}. Filas HUT listas: ${result.data.summary.hut.validRows}.`,
      preview: result.data,
      rows,
      status: "success"
    };
  } catch (error) {
    logNavigoRotationImportError({
      error,
      step: "apply-workbook",
      studyId
    });

    return {
      filename,
      hutRows,
      message: "No fue posible guardar ROTACIONES NAVIGO.xlsx. Revisa logs.",
      preview: null,
      rows,
      status: "error"
    };
  }
}

export async function previewNavigoParticipantImportTextAction(
  studyId: string,
  filename: string,
  text: string
): Promise<NavigoParticipantImportActionState> {
  await requireCapability("screening:review");

  const parsed = parseNavigoParticipantImportText({ filename, text });
  if (!parsed.ok) {
    return {
      applyErrors: [],
      message: parsed.message,
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    const result = await createNavigoAppRepository().previewParticipantImport({
      rows: parsed.rows,
      studyId
    });

    if (!result.ok) {
      return {
        applyErrors: [],
        message: result.message,
        preview: null,
        rows: parsed.rows,
        status: "error"
      };
    }

    return {
      applyErrors: [],
      message: "Previsualizacion de participantes lista.",
      preview: result.data,
      rows: parsed.rows,
      status: result.data.summary.rowsWithError > 0 ? "error" : "success"
    };
  } catch (error) {
    logNavigoParticipantImportError({
      error,
      step: "preview",
      studyId
    });

    return {
      applyErrors: [],
      message: "No fue posible previsualizar participantes por un error tecnico. Revisa logs.",
      preview: null,
      rows: parsed.rows,
      status: "error"
    };
  }
}

export async function applyNavigoParticipantImportRowsAction(
  studyId: string,
  rows: NavigoParticipantImportRowInput[],
  generateLinks: boolean
): Promise<NavigoParticipantImportActionState> {
  const actor = await requireCapability("screening:review");

  if (rows.length === 0) {
    return {
      applyErrors: [],
      message: "Primero previsualiza un archivo valido.",
      preview: null,
      rows: [],
      status: "error"
    };
  }

  try {
    const result = await createNavigoAppRepository().applyParticipantImport({
      actorUserId: actor.id,
      generateLinks,
      rows,
      studyId
    });

    if (!result.ok) {
      return {
        applyErrors: result.data?.applyErrors ?? [],
        message: result.message,
        preview: result.data?.preview ?? null,
        rows,
        status: "error"
      };
    }

    revalidatePath(`/admin/studies/${studyId}/navigo-app`);
    return {
      applyErrors: [],
      message: `Participantes importados correctamente. Creados: ${result.data.created}. Actualizados: ${result.data.updated}. Omitidos: ${result.data.omitted}. Con error: ${result.data.errors}. Links creados: ${result.data.linksCreated}.`,
      preview: result.data.preview,
      rows,
      status: "success"
    };
  } catch (error) {
    logNavigoParticipantImportError({
      error,
      step: "apply",
      studyId
    });

    return {
      applyErrors: [],
      message: error instanceof Error ? error.message : "No fue posible importar participantes.",
      preview: null,
      rows,
      status: "error"
    };
  }
}

function logNavigoRotationImportError({
  error,
  step,
  studyId
}: {
  error: unknown;
  step: "apply" | "apply-workbook" | "parse" | "parse-workbook" | "preview" | "preview-file" | "preview-workbook";
  studyId: string;
}) {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`navigo rotation import failed: step=${step} studyId=${studyId} message=${message}`);
}

function logNavigoParticipantImportError({
  error,
  step,
  studyId
}: {
  error: unknown;
  step: "apply" | "preview";
  studyId: string;
}) {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`navigo participant import failed: step=${step} studyId=${studyId} message=${message}`);
}

export async function requestNavigoActivitySelfieUploadAction(
  tokenInput: string,
  activityId: string,
  metadata: EvidenceUploadMetadata
): Promise<NavigoActionResult<NavigoSignedActivityUpload>> {
  const token = parseToken(tokenInput);
  const result = await createNavigoAppRepository().requestActivitySelfieUpload({
    activityId,
    metadata,
    token
  });

  return result;
}

export async function confirmNavigoActivitySelfieUploadAction(
  tokenInput: string,
  activityId: string,
  metadata: EvidenceUploadMetadata & {
    faceVerification?: NavigoFaceVerificationClientResult | null;
    privateStorageKey: string;
    storageBucket: string;
  }
): Promise<NavigoActionResult<{
  internalNote: string | null;
  reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
  selfieCount: number;
}>> {
  const token = parseToken(tokenInput);
  const result = await createNavigoAppRepository().confirmActivitySelfieUpload({
    activityId,
    metadata,
    token
  });

  revalidatePath(`/p/${encodeURIComponent(token)}/activities/${activityId}`);

  return result;
}

export async function submitNavigoActivityResponsesAction(
  tokenInput: string,
  activityId: string,
  formData: FormData
): Promise<NavigoActionResult<{ completedAt: string; message: string }>> {
  const token = parseToken(tokenInput);
  const answers: Record<string, FormDataEntryValue | null> = {};

  for (const [key, value] of formData.entries()) {
    answers[key] = value;
  }

  const testModeParams = readNavigoTestModeParams(formData);
  const testMode = isValidNavigoTestMode({
    mode: testModeParams?.navigoTestMode,
    secret: process.env.PARTICIPANT_PORTAL_HASH_SECRET,
    signature: testModeParams?.navigoTestSignature,
    token
  });

  const result = await createNavigoAppRepository().submitActivityResponses({
    activityId,
    answers,
    testMode,
    token
  });

  if (!result.ok) {
    return {
      message: result.message,
      ok: false
    };
  }

  revalidatePath(`/p/${encodeURIComponent(token)}/activities`);
  revalidatePath(`/p/${encodeURIComponent(token)}/activities/${activityId}`);

  return {
    data: {
      completedAt: result.data.completedAt.toISOString(),
      message: "Evaluación guardada correctamente."
    },
    ok: true
  };
}

export async function registerNavigoInitialApplicationAction(tokenInput: string, formData: FormData) {
  const token = parseToken(tokenInput);
  const testModeParams = readNavigoTestModeParams(formData);
  const result = await createNavigoAppRepository().registerInitialApplication({
    token
  });

  if (!result.ok) {
    redirect(
      appendNavigoTestModeParams(
        `/p/${encodeURIComponent(token)}/activities?error=${encodeURIComponent(result.message)}`,
        testModeParams
      )
    );
  }

  revalidatePath(`/p/${encodeURIComponent(token)}/activities`);
  redirect(
    appendNavigoTestModeParams(
      `/p/${encodeURIComponent(token)}/activities?message=${encodeURIComponent("Aplicacion inicial registrada. La primera evaluacion estara disponible a las 3 horas.")}`,
      testModeParams
    )
  );
}

export async function confirmNavigoT0IdentityAction(
  tokenInput: string,
  activityId: string,
  identityConfirmed: "NO" | "YES"
): Promise<NavigoActionResult<{ identityStatus: "CONFIRMED" | "REJECTED" }>> {
  const token = parseToken(tokenInput);

  return createNavigoAppRepository().confirmT0Identity({
    activityId,
    identityConfirmed,
    token
  });
}

export async function reviewNavigoActivityIdentityAction(
  studyId: string,
  evidenceId: string,
  status: "APPROVED" | "PENDING" | "REJECTED",
  formData: FormData
) {
  const actor = await requireCapability("screening:review");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  const internalNote = String(formData.get("internalNote") ?? "").trim();

  const result = await createNavigoAppRepository().reviewActivityIdentity({
    actorUserId: actor.id,
    evidenceId,
    internalNote,
    rejectionReason,
    status,
    studyId
  });

  if (!result.ok) {
    redirectWithNavigoMessage(studyId, { error: result.message });
  }

  revalidatePath(`/admin/studies/${studyId}/navigo-app`);
  redirectWithNavigoMessage(studyId, { message: result.message });
}

function parseApplicationStartedAt(value: FormDataEntryValue | null, timeZoneIana: string): Date | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = parseNavigoDateTimeLocal(raw, timeZoneIana) ?? new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseNavigoAnswersFromFormData(formData: FormData): NavigoAnswerInput {
  const answers: NavigoAnswerInput = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("AP")) {
      answers[key] = value;
    }
  }

  return answers;
}

function parseToken(tokenInput: string): string {
  const parsed = participantTokenSchema.safeParse(tokenInput);

  if (!parsed.success) {
    throw new Error("El enlace no es valido.");
  }

  return parsed.data;
}

function readNavigoTestModeParams(formData: FormData): NavigoTestModeParams | null {
  const navigoTestMode = String(formData.get("navigoTestMode") ?? "");
  const navigoTestSignature = String(formData.get("navigoTestSignature") ?? "");

  if (!navigoTestMode || !navigoTestSignature) {
    return null;
  }

  return {
    navigoTestMode,
    navigoTestSignature
  };
}

function parseRowsJson(value: string): NavigoRotationImportRowInput[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((row) => {
        if (typeof row !== "object" || row === null) {
          return null;
        }

        const input = row as Record<string, unknown>;
        return {
          folio: String(input.folio ?? ""),
          primeraFragancia: String(input.primeraFragancia ?? ""),
          segundaFragancia: String(input.segundaFragancia ?? "")
        };
      })
      .filter((row): row is NavigoRotationImportRowInput => row !== null);
  } catch {
    return [];
  }
}

function redirectWithNavigoMessage(
  studyId: string,
  input: {
    error?: string;
    evaluationLink?: string;
    evaluationLinkGeneratedAt?: string;
    evaluationLinkPhone?: string;
    evaluationLinkStatus?: "ENVIADO" | "ERROR";
    evaluationLinkWhatsappError?: string;
    evaluationLinkWhatsappMessageId?: string;
    message?: string;
    participant?: string;
    token?: string;
  }
): never {
  const params = new URLSearchParams();

  if (input.error) {
    params.set("navigoError", input.error);
  }
  if (input.evaluationLink) {
    params.set("evaluationLink", input.evaluationLink);
  }
  if (input.evaluationLinkGeneratedAt) {
    params.set("evaluationLinkGeneratedAt", input.evaluationLinkGeneratedAt);
  }
  if (input.evaluationLinkPhone) {
    params.set("evaluationLinkPhone", input.evaluationLinkPhone);
  }
  if (input.evaluationLinkStatus) {
    params.set("evaluationLinkStatus", input.evaluationLinkStatus);
  }
  if (input.evaluationLinkWhatsappError) {
    params.set("evaluationLinkWhatsappError", input.evaluationLinkWhatsappError);
  }
  if (input.evaluationLinkWhatsappMessageId) {
    params.set("evaluationLinkWhatsappMessageId", input.evaluationLinkWhatsappMessageId);
  }
  if (input.message) {
    params.set("navigoMessage", input.message);
  }
  if (input.participant) {
    params.set("participant", input.participant);
  }
  if (input.token) {
    params.set("token", input.token);
  }

  redirect(`/admin/studies/${studyId}/navigo-app?${params.toString()}`);
}
