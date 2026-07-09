import {
  createOneuiWhatsAppRepository,
  type OneuiWhatsAppConversationDetail,
  type OneuiWhatsAppConversationSummary,
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
