"use server";

import { revalidatePath } from "next/cache";
import {
  sendOneuiWhatsAppTextReply,
  WHATSAPP_INVALID_PUBLIC_ORIGIN,
  WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG
} from "@/modules/oneui-whatsapp";
import {
  createWhatsAppParticipantSupportService,
  type WhatsAppParticipantSupportSendKind
} from "@/modules/oneui-whatsapp/participant-support";
import { requireInternalUser } from "@/shared/auth/session";
import type {
  OneuiWhatsAppParticipantSupportActionState,
  OneuiWhatsAppReplyActionState
} from "./action-state";

export async function sendOneuiWhatsAppReplyAction(
  _previousState: OneuiWhatsAppReplyActionState,
  formData: FormData
): Promise<OneuiWhatsAppReplyActionState> {
  const actor = await requireInternalUser();
  const conversationId = stringField(formData.get("conversationId"));
  const bodyText = stringField(formData.get("bodyText"));

  if (!conversationId) {
    return {
      error: "Selecciona una conversación antes de responder.",
      ok: false
    };
  }

  const result = await sendOneuiWhatsAppTextReply({
    actor,
    bodyText,
    conversationId
  });

  if (!result.ok) {
    return {
      error: result.message,
      ok: false
    };
  }

  revalidatePath("/admin/oneui/whatsapp");

  return {
    error: null,
    ok: true
  };
}

export async function sendOneuiWhatsAppParticipantSupportAction(
  _previousState: OneuiWhatsAppParticipantSupportActionState,
  formData: FormData
): Promise<OneuiWhatsAppParticipantSupportActionState> {
  const actor = await requireInternalUser();

  if (actor.role !== "ADMIN" && actor.role !== "SUPERVISOR") {
    return supportActionError("No tienes permisos para enviar enlaces desde soporte WhatsApp.");
  }

  const sendKind = stringField(formData.get("sendKind")) as WhatsAppParticipantSupportSendKind;
  const studyId = stringField(formData.get("studyId"));
  const studyParticipantId = stringField(formData.get("studyParticipantId")) || null;
  const hutParticipantId = stringField(formData.get("hutParticipantId")) || null;
  const reason = stringField(formData.get("reason"));

  if (!isValidSupportSendKind(sendKind) || !studyId) {
    return supportActionError("Selecciona un participante y una accion valida.");
  }

  let result: Awaited<ReturnType<ReturnType<typeof createWhatsAppParticipantSupportService>["sendManualSupportMessage"]>>;

  try {
    result = await createWhatsAppParticipantSupportService().sendManualSupportMessage({
      actorUserId: actor.id,
      hutParticipantId,
      reason,
      sendKind,
      studyId,
      studyParticipantId
    });
  } catch (error) {
    console.error("Fallo no controlado al enviar WhatsApp desde soporte.", error);
    return supportActionError("No se pudo enviar WhatsApp. Intenta nuevamente o revisa la configuracion.", "UNHANDLED_ERROR");
  }

  if (!result.ok) {
    return supportActionError(friendlySupportActionError(result.message, result.reason), result.reason ?? null);
  }

  try {
    revalidatePath("/admin/oneui/whatsapp");
  } catch {
    // El envio y la auditoria ya quedaron resueltos; no ocultamos el resultado por una actualizacion secundaria.
  }

  return {
    error: null,
    errorReason: null,
    hutUrl: result.data.hutUrl,
    message: result.data.message,
    navigoUrl: result.data.navigoUrl,
    ok: true,
    phone: result.data.phone,
    templateName: result.data.templateName,
    whatsappStatus: result.data.whatsappStatus
  };
}

function stringField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function isValidSupportSendKind(value: string): value is WhatsAppParticipantSupportSendKind {
  return value === "BOTH" || value === "HUT" || value === "HUT_REMINDER" || value === "NAVIGO";
}

function supportActionError(error: string, errorReason: string | null = null): OneuiWhatsAppParticipantSupportActionState {
  return {
    error,
    errorReason,
    hutUrl: null,
    message: null,
    navigoUrl: null,
    ok: false,
    phone: null,
    templateName: null,
    whatsappStatus: null
  };
}

function friendlySupportActionError(message: string, reason?: string | null): string {
  if (reason === WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG) {
    return "El envío fue bloqueado porque falta configurar el dominio público de producción para WhatsApp.";
  }

  if (reason === WHATSAPP_INVALID_PUBLIC_ORIGIN || reason === "HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN") {
    return "El envío fue bloqueado por configuración de dominio público WhatsApp.";
  }

  if (reason === "AUDIT_LOG_FAILED") {
    return "No se pudo registrar la auditoría del envío WhatsApp. No se reintentó automáticamente.";
  }

  return message;
}
