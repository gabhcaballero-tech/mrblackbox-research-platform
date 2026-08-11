"use server";

import { revalidatePath } from "next/cache";
import { sendOneuiWhatsAppTextReply } from "@/modules/oneui-whatsapp";
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

  const result = await createWhatsAppParticipantSupportService().sendManualSupportMessage({
    actorUserId: actor.id,
    hutParticipantId,
    reason,
    sendKind,
    studyId,
    studyParticipantId
  });

  if (!result.ok) {
    return supportActionError(result.message);
  }

  try {
    revalidatePath("/admin/oneui/whatsapp");
  } catch {
    // El envio y la auditoria ya quedaron resueltos; no ocultamos el resultado por una actualizacion secundaria.
  }

  return {
    error: null,
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

function supportActionError(error: string): OneuiWhatsAppParticipantSupportActionState {
  return {
    error,
    hutUrl: null,
    message: null,
    navigoUrl: null,
    ok: false,
    phone: null,
    templateName: null,
    whatsappStatus: null
  };
}
