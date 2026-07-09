"use server";

import { revalidatePath } from "next/cache";
import { sendOneuiWhatsAppTextReply } from "@/modules/oneui-whatsapp";
import { requireInternalUser } from "@/shared/auth/session";

export type OneuiWhatsAppReplyActionState = {
  error: string | null;
  ok: boolean;
};

export const initialOneuiWhatsAppReplyActionState: OneuiWhatsAppReplyActionState = {
  error: null,
  ok: false
};

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

function stringField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
