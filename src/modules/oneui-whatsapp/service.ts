import {
  createOneuiWhatsAppRepository,
  type OneuiWhatsAppConversationDetail,
  type OneuiWhatsAppConversationSummary,
  type OneuiWhatsAppMessageRecord,
  type OneuiWhatsAppRepository,
  type OneuiWhatsAppSourceModule
} from "./repository";

export type OneuiWhatsAppInboxActor = {
  role: string;
  status?: string;
} | null;

export type OneuiWhatsAppWebhookResult = {
  inboundMessages: number;
  statusEvents: number;
  unknownEvents: number;
};

export type OneuiWhatsAppSendReplyResult =
  | {
      ok: true;
      data: OneuiWhatsAppMessageRecord;
    }
  | {
      ok: false;
      code:
        | "CONFIGURATION_ERROR"
        | "CONVERSATION_NOT_FOUND"
        | "EMPTY_MESSAGE"
        | "META_API_ERROR"
        | "OUTSIDE_CUSTOMER_SERVICE_WINDOW"
        | "UNAUTHORIZED";
      message: string;
      data?: OneuiWhatsAppMessageRecord;
    };

export type OneuiWhatsAppTemplateParameter = {
  text: string;
  type: "text";
};

type OneuiWhatsAppTemplateComponent =
  | {
      parameters: OneuiWhatsAppTemplateParameter[];
      type: "body";
    }
  | {
      index: string;
      parameters: OneuiWhatsAppTemplateParameter[];
      sub_type: "url";
      type: "button";
    };

export type OneuiWhatsAppSendTemplateResult =
  | {
      ok: true;
      data: OneuiWhatsAppMessageRecord;
    }
  | {
      ok: false;
      code: "AUTOMATION_DISABLED" | "CONFIGURATION_ERROR" | "META_API_ERROR";
      data?: OneuiWhatsAppMessageRecord;
      message: string;
    };

export type OneuiWhatsAppInboxResult =
  | {
      ok: true;
      data: {
        conversations: OneuiWhatsAppConversationSummary[];
        selectedConversation: OneuiWhatsAppConversationDetail | null;
      };
    }
  | {
      ok: false;
      code: "UNAUTHORIZED";
      message: string;
    };

type MetaWebhookPayload = Record<string, unknown>;

type WhatsAppApiFetch = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  }
) => Promise<{
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
}>;

type MetaChangeContext = {
  change: Record<string, unknown>;
  entry: Record<string, unknown>;
  payload: MetaWebhookPayload;
  value: Record<string, unknown>;
};

export const ONEUI_WHATSAPP_SOURCE_LABELS: Record<OneuiWhatsAppSourceModule, string> = {
  BLACK_BOX: "Black Box",
  GENERAL: "General",
  HUT: "HUT",
  NAVIGO: "Navigo",
  OTHER: "Otro"
};

export function canAccessOneuiWhatsAppInbox(actor: OneuiWhatsAppInboxActor): boolean {
  return Boolean(actor && actor.status !== "INACTIVE" && (actor.role === "ADMIN" || actor.role === "SUPERVISOR"));
}

export function isWithinOneuiWhatsAppCustomerServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) {
    return false;
  }

  return now.getTime() - lastInboundAt.getTime() <= 24 * 60 * 60 * 1000;
}

export function normalizeWhatsAppRecipient(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (/^521\d{10}$/.test(digits)) {
    return digits;
  }

  if (/^52\d{10}$/.test(digits)) {
    return `521${digits.slice(2)}`;
  }

  if (/^\d{10}$/.test(digits)) {
    return `521${digits}`;
  }

  return digits;
}

export async function sendOneuiWhatsAppTemplate(input: {
  bodyText: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: WhatsAppApiFetch;
  language: string;
  linkedParticipantId?: string | null;
  linkedStudyId?: string | null;
  now?: Date;
  buttonUrl?: string | null;
  parameters: OneuiWhatsAppTemplateParameter[];
  profileName?: string | null;
  repository?: OneuiWhatsAppRepository;
  sourceModule: OneuiWhatsAppSourceModule;
  templateName: string;
  toPhone: string;
}): Promise<OneuiWhatsAppSendTemplateResult> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_AUTOMATION_ENABLED === "false") {
    return {
      code: "AUTOMATION_DISABLED",
      message: "El envio automatico de WhatsApp esta desactivado.",
      ok: false
    };
  }

  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const fromPhone = env.WHATSAPP_ONEUI_PHONE_NUMBER ?? phoneNumberId ?? "UNKNOWN";
  const toPhone = normalizeWhatsAppRecipient(input.toPhone);
  const now = input.now ?? new Date();
  const repository = input.repository ?? createOneuiWhatsAppRepository();

  if (!accessToken || !phoneNumberId) {
    const conversation = await repository.upsertOutboundConversation({
      linkedParticipantId: input.linkedParticipantId ?? null,
      linkedStudyId: input.linkedStudyId ?? null,
      phoneNumber: toPhone,
      profileName: input.profileName ?? null,
      sourceModule: input.sourceModule,
      waId: toPhone
    });
    const pending = await repository.createOutboundMessage({
      bodyText: input.bodyText,
      conversationId: conversation.id,
      fromPhone,
      messageType: "template",
      rawPayload: {
        error: {
          message: "WhatsApp API environment variables are not configured."
        }
      },
      timestamp: now,
      toPhone
    });
    const failed = await repository.markOutboundMessageFailed({
      messageId: pending.id,
      rawPayload: pending.rawPayload,
      status: "failed"
    });

    return {
      code: "CONFIGURATION_ERROR",
      data: failed,
      message: "Faltan variables de entorno para enviar por WhatsApp.",
      ok: false
    };
  }

  const templateComponents: OneuiWhatsAppTemplateComponent[] = [];

  if (input.parameters.length > 0) {
    templateComponents.push({
      parameters: input.parameters,
      type: "body"
    });
  }

  if (input.buttonUrl) {
    templateComponents.push({
      index: "0",
      parameters: [
        {
          text: input.buttonUrl,
          type: "text"
        }
      ],
      sub_type: "url",
      type: "button"
    });
  }

  const templatePayload: {
    components?: OneuiWhatsAppTemplateComponent[];
    language: { code: string };
    name: string;
  } = {
    language: {
      code: input.language
    },
    name: input.templateName
  };

  if (templateComponents.length > 0) {
    templatePayload.components = templateComponents;
  }

  const requestPayload = {
    messaging_product: "whatsapp",
    template: templatePayload,
    to: toPhone,
    type: "template"
  };
  const conversation = await repository.upsertOutboundConversation({
    linkedParticipantId: input.linkedParticipantId ?? null,
    linkedStudyId: input.linkedStudyId ?? null,
    phoneNumber: toPhone,
    profileName: input.profileName ?? null,
    sourceModule: input.sourceModule,
    waId: toPhone
  });
  const pendingMessage = await repository.createOutboundMessage({
    bodyText: input.bodyText,
    conversationId: conversation.id,
    fromPhone,
    messageType: "template",
    rawPayload: {
      request: requestPayload
    },
    timestamp: now,
    toPhone
  });
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    body: JSON.stringify(requestPayload),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    const failedMessage = await repository.markOutboundMessageFailed({
      messageId: pendingMessage.id,
      rawPayload: {
        request: requestPayload,
        response: responsePayload,
        status: response.status
      },
      status: "failed"
    });

    return {
      code: "META_API_ERROR",
      data: failedMessage,
      message: getMetaErrorMessage(responsePayload) ?? "No se pudo enviar la plantilla por WhatsApp.",
      ok: false
    };
  }

  const acceptedMessage = await repository.markOutboundMessageAccepted({
    messageId: pendingMessage.id,
    metaMessageId: getMetaResponseMessageId(responsePayload),
    rawPayload: {
      request: requestPayload,
      response: responsePayload,
      status: response.status
    },
    status: getMetaResponseMessageStatus(responsePayload) ?? "accepted",
    timestamp: now
  });

  return {
    data: acceptedMessage,
    ok: true
  };
}

export async function getOneuiWhatsAppInbox(input: {
  actor: OneuiWhatsAppInboxActor;
  conversationId?: string | null;
  repository?: OneuiWhatsAppRepository;
}): Promise<OneuiWhatsAppInboxResult> {
  if (!canAccessOneuiWhatsAppInbox(input.actor)) {
    return {
      code: "UNAUTHORIZED",
      message: "Solo administradores y supervisores pueden consultar la bandeja de WhatsApp.",
      ok: false
    };
  }

  const repository = input.repository ?? createOneuiWhatsAppRepository();
  const conversations = await repository.listConversations();
  const selectedId = input.conversationId ?? conversations[0]?.id ?? null;
  const selectedConversation = selectedId
    ? await repository.getConversationWithMessages(selectedId)
    : null;

  return {
    data: {
      conversations,
      selectedConversation
    },
    ok: true
  };
}

export async function sendOneuiWhatsAppTextReply(input: {
  actor: OneuiWhatsAppInboxActor;
  bodyText: string;
  conversationId: string;
  fetcher?: WhatsAppApiFetch;
  now?: Date;
  repository?: OneuiWhatsAppRepository;
  env?: NodeJS.ProcessEnv;
}): Promise<OneuiWhatsAppSendReplyResult> {
  if (!canAccessOneuiWhatsAppInbox(input.actor)) {
    return {
      code: "UNAUTHORIZED",
      message: "Solo administradores y supervisores pueden responder WhatsApp.",
      ok: false
    };
  }

  const bodyText = input.bodyText.trim();

  if (!bodyText) {
    return {
      code: "EMPTY_MESSAGE",
      message: "Escribe una respuesta antes de enviarla.",
      ok: false
    };
  }

  const repository = input.repository ?? createOneuiWhatsAppRepository();
  const conversation = await repository.getConversationWithMessages(input.conversationId);

  if (!conversation) {
    return {
      code: "CONVERSATION_NOT_FOUND",
      message: "No se encontró la conversación seleccionada.",
      ok: false
    };
  }

  const now = input.now ?? new Date();

  if (!isWithinOneuiWhatsAppCustomerServiceWindow(conversation.lastInboundAt, now)) {
    return {
      code: "OUTSIDE_CUSTOMER_SERVICE_WINDOW",
      message:
        "La ventana de atención de 24 horas terminó. Para escribir a este contacto se requiere una plantilla aprobada.",
      ok: false
    };
  }

  const env = input.env ?? process.env;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const fromPhone = env.WHATSAPP_ONEUI_PHONE_NUMBER ?? env.WHATSAPP_PHONE_NUMBER_ID ?? "UNKNOWN";
  const toPhone = normalizeWhatsAppRecipient(conversation.waId || conversation.phoneNumber);
  const pendingMessage = await repository.createOutboundMessage({
    bodyText,
    conversationId: conversation.id,
    fromPhone,
    rawPayload: {
      request: {
        messaging_product: "whatsapp",
        text: {
          preview_url: false
        },
        to: toPhone,
        type: "text"
      }
    },
    timestamp: now,
    toPhone
  });

  if (!accessToken || !phoneNumberId) {
    const failedMessage = await repository.markOutboundMessageFailed({
      messageId: pendingMessage.id,
      rawPayload: {
        error: {
          message: "WhatsApp API environment variables are not configured."
        }
      },
      status: "failed"
    });

    return {
      code: "CONFIGURATION_ERROR",
      data: failedMessage,
      message: "Faltan variables de entorno para enviar por WhatsApp.",
      ok: false
    };
  }

  const requestPayload = {
    messaging_product: "whatsapp",
    text: {
      body: bodyText,
      preview_url: false
    },
    to: toPhone,
    type: "text"
  };
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    body: JSON.stringify(requestPayload),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    const failedMessage = await repository.markOutboundMessageFailed({
      messageId: pendingMessage.id,
      rawPayload: {
        request: requestPayload,
        response: responsePayload,
        status: response.status
      },
      status: "failed"
    });

    return {
      code: "META_API_ERROR",
      data: failedMessage,
      message: getMetaErrorMessage(responsePayload) ?? "No se pudo enviar la respuesta por WhatsApp.",
      ok: false
    };
  }

  const acceptedMessage = await repository.markOutboundMessageAccepted({
    messageId: pendingMessage.id,
    metaMessageId: getMetaResponseMessageId(responsePayload),
    rawPayload: {
      request: requestPayload,
      response: responsePayload,
      status: response.status
    },
    status: getMetaResponseMessageStatus(responsePayload) ?? "accepted",
    timestamp: now
  });

  return {
    data: acceptedMessage,
    ok: true
  };
}

export async function processOneuiWhatsAppWebhookPayload(input: {
  payload: unknown;
  repository?: OneuiWhatsAppRepository;
}): Promise<OneuiWhatsAppWebhookResult> {
  const payload = asRecord(input.payload);
  const repository = input.repository ?? createOneuiWhatsAppRepository();
  const result: OneuiWhatsAppWebhookResult = {
    inboundMessages: 0,
    statusEvents: 0,
    unknownEvents: 0
  };

  if (!payload) {
    return { ...result, unknownEvents: 1 };
  }

  for (const context of iterateMetaChanges(payload)) {
    const messages = arrayOfRecords(context.value.messages);
    const statuses = arrayOfRecords(context.value.statuses);

    for (const message of messages) {
      await persistInboundMessage(repository, context, message);
      result.inboundMessages += 1;
    }

    for (const status of statuses) {
      const saved = await persistStatusEvent(repository, context, status);
      result.statusEvents += saved ? 1 : 0;
      result.unknownEvents += saved ? 0 : 1;
    }

    if (messages.length === 0 && statuses.length === 0) {
      result.unknownEvents += 1;
    }
  }

  return result;
}

async function persistInboundMessage(
  repository: OneuiWhatsAppRepository,
  context: MetaChangeContext,
  message: Record<string, unknown>
) {
  const waId = stringValue(message.from) ?? "";
  const timestamp = parseMetaTimestamp(message.timestamp);
  const profileName = findProfileName(context.value.contacts, waId);
  const metadata = asRecord(context.value.metadata);
  const toPhone =
    stringValue(metadata?.display_phone_number) ??
    stringValue(metadata?.phone_number_id) ??
    process.env.WHATSAPP_PHONE_NUMBER_ID ??
    "UNKNOWN";
  const conversation = await repository.upsertInboundConversation({
    lastInboundAt: timestamp,
    phoneNumber: waId,
    profileName,
    waId
  });

  await repository.saveInboundMessage({
    bodyText: extractMessageBodyText(message),
    conversationId: conversation.id,
    fromPhone: waId,
    messageType: stringValue(message.type) ?? "unknown",
    metaMessageId: stringValue(message.id),
    rawPayload: {
      change: context.change,
      entry: context.entry,
      message,
      payload: context.payload
    },
    timestamp,
    toPhone
  });
}

async function persistStatusEvent(
  repository: OneuiWhatsAppRepository,
  context: MetaChangeContext,
  status: Record<string, unknown>
): Promise<boolean> {
  const metaMessageId = stringValue(status.id);
  const statusValue = stringValue(status.status);

  if (!metaMessageId || !statusValue) {
    return false;
  }

  await repository.saveStatusEvent({
    metaMessageId,
    rawPayload: {
      change: context.change,
      entry: context.entry,
      payload: context.payload,
      status
    },
    status: statusValue,
    timestamp: parseMetaTimestamp(status.timestamp)
  });

  return true;
}

function* iterateMetaChanges(payload: MetaWebhookPayload): Generator<MetaChangeContext> {
  for (const entry of arrayOfRecords(payload.entry)) {
    for (const change of arrayOfRecords(entry.changes)) {
      const value = asRecord(change.value);

      if (value) {
        yield { change, entry, payload, value };
      }
    }
  }
}

export function parseMetaTimestamp(value: unknown): Date | null {
  const raw = stringValue(value);

  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }

  const numeric = Number(raw);
  const milliseconds = raw.length >= 13 ? numeric : numeric * 1000;
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function extractMessageBodyText(message: Record<string, unknown>): string | null {
  const type = stringValue(message.type);

  if (type === "text") {
    return stringValue(asRecord(message.text)?.body);
  }

  if (type === "button") {
    const button = asRecord(message.button);
    return stringValue(button?.text) ?? stringValue(button?.payload);
  }

  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    const buttonReply = asRecord(interactive?.button_reply);
    const listReply = asRecord(interactive?.list_reply);

    return (
      stringValue(buttonReply?.title) ??
      stringValue(buttonReply?.id) ??
      stringValue(listReply?.title) ??
      stringValue(listReply?.id)
    );
  }

  const typedPayload = type ? asRecord(message[type]) : null;

  return stringValue(typedPayload?.caption);
}

function findProfileName(contacts: unknown, waId: string): string | null {
  const contact = arrayOfRecords(contacts).find((item) => stringValue(item.wa_id) === waId);
  const profile = asRecord(contact?.profile);

  return stringValue(profile?.name);
}

function getMetaResponseMessageId(payload: unknown): string | null {
  const messages = arrayOfRecords(asRecord(payload)?.messages);

  return stringValue(messages[0]?.id);
}

function getMetaResponseMessageStatus(payload: unknown): string | null {
  const messages = arrayOfRecords(asRecord(payload)?.messages);

  return stringValue(messages[0]?.message_status);
}

function getMetaErrorMessage(payload: unknown): string | null {
  const error = asRecord(asRecord(payload)?.error);

  return stringValue(error?.message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
