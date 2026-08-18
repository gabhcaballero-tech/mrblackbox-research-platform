import {
  createOneuiWhatsAppRepository,
  type OneuiWhatsAppMessageRecord,
  type OneuiWhatsAppRepository
} from "./repository";
import { normalizeWhatsAppRecipient } from "./service";

export type V2OutboundMirrorInput = {
  eventType: string | null;
  externalMessageId: string;
  messageId: string;
  mode: string | null;
  occurredAt: Date;
  participant: {
    folio: string;
    name: string;
    phone: string;
  };
  source: string;
  templateName: string;
  type: string;
};

export async function mirrorV2OutboundMessage(
  input: V2OutboundMirrorInput,
  repository: OneuiWhatsAppRepository = createOneuiWhatsAppRepository()
): Promise<OneuiWhatsAppMessageRecord> {
  const toPhone = normalizeWhatsAppRecipient(input.participant.phone);
  if (!toPhone) {
    throw new Error("El mensaje V2 no incluye un teléfono válido.");
  }

  const conversation = await repository.upsertOutboundConversation({
    phoneNumber: toPhone,
    profileName: input.participant.name,
    sourceModule: "BLACK_BOX",
    waId: toPhone
  });

  const saveMirror = repository.mirrorV2OutboundMessage;
  if (!saveMirror) {
    throw new Error("El repositorio Oneui no admite mensajes reflejados de V2.");
  }

  return saveMirror({
    bodyText: `Plantilla enviada desde V2: ${input.templateName}`,
    conversationId: conversation.id,
    fromPhone: "V2",
    metaMessageId: input.externalMessageId,
    rawPayload: {
      eventType: input.eventType,
      integration: "V2_OUTBOUND_MIRROR",
      mode: input.mode,
      participantFolio: input.participant.folio,
      source: input.source,
      templateName: input.templateName,
      v2MessageId: input.messageId,
      type: input.type
    },
    status: "sent",
    timestamp: input.occurredAt,
    toPhone
  });
}
