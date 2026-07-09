import { describe, expect, it } from "vitest";
import type {
  OneuiWhatsAppConversationDetail,
  OneuiWhatsAppConversationRecord,
  OneuiWhatsAppConversationSummary,
  OneuiWhatsAppMessageRecord,
  OneuiWhatsAppRepository,
  OneuiWhatsAppStatusEventRecord,
  CreateOutboundMessageInput,
  MarkOutboundMessageAcceptedInput,
  MarkOutboundMessageFailedInput,
  SaveInboundMessageInput,
  SaveStatusEventInput,
  UpsertInboundConversationInput
} from "./repository";
import {
  canAccessOneuiWhatsAppInbox,
  getOneuiWhatsAppInbox,
  processOneuiWhatsAppWebhookPayload,
  sendOneuiWhatsAppTextReply
} from "./service";

describe("ONEUI WhatsApp webhook processing", () => {
  it("crea conversación GENERAL y guarda mensaje inbound", async () => {
    const repository = createFakeRepository();

    const result = await processOneuiWhatsAppWebhookPayload({
      payload: inboundPayload(),
      repository
    });

    expect(result).toMatchObject({ inboundMessages: 1, statusEvents: 0, unknownEvents: 0 });
    expect(repository.conversations[0]).toMatchObject({
      phoneNumber: "5215512345678",
      profileName: "Participante Uno",
      sourceModule: "GENERAL",
      waId: "5215512345678"
    });
    expect(repository.messages[0]).toMatchObject({
      bodyText: "Hola, confirmo asistencia",
      direction: "INBOUND",
      fromPhone: "5215512345678",
      messageType: "text",
      metaMessageId: "wamid.inbound-1",
      toPhone: "5215511303411"
    });
  });

  it("guarda eventos de estado sent, delivered, read y failed", async () => {
    const repository = createFakeRepository();
    repository.messages.push(
      createMessage({ direction: "OUTBOUND", id: "message-1", metaMessageId: "wamid.outbound-1" })
    );

    const result = await processOneuiWhatsAppWebhookPayload({
      payload: statusPayload(["sent", "delivered", "read", "failed"]),
      repository
    });

    expect(result).toMatchObject({ inboundMessages: 0, statusEvents: 4, unknownEvents: 0 });
    expect(repository.statusEvents.map((event) => event.status)).toEqual([
      "sent",
      "delivered",
      "read",
      "failed"
    ]);
    expect(repository.statusEvents.every((event) => event.messageId === "message-1")).toBe(true);
    expect(repository.messages[0]?.status).toBe("failed");
  });

  it("tolera payload desconocido sin depender de HUT, Navigo ni Black Box", async () => {
    const repository = createFakeRepository();

    const result = await processOneuiWhatsAppWebhookPayload({
      payload: {
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  unexpected: true
                }
              }
            ]
          }
        ]
      },
      repository
    });

    expect(result).toMatchObject({ inboundMessages: 0, statusEvents: 0, unknownEvents: 1 });
    expect(repository.conversations).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });
});

describe("ONEUI WhatsApp manual replies", () => {
  it("envía texto por API, guarda OUTBOUND con metaMessageId y actualiza conversación", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({
      id: "conversation-1",
      lastInboundAt: new Date("2026-07-09T16:00:00.000Z")
    });
    repository.conversations.push(conversation);
    const fetcher = viFetch({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.outbound-1", message_status: "accepted" }]
    });

    const result = await sendOneuiWhatsAppTextReply({
      actor: { role: "SUPERVISOR", status: "ACTIVE" },
      bodyText: "Gracias, quedamos atentos.",
      conversationId: conversation.id,
      env: whatsappEnv(),
      fetcher,
      now: new Date("2026-07-09T17:00:00.000Z"),
      repository
    });

    expect(result.ok).toBe(true);
    expect(fetcher.calls[0]).toMatchObject({
      input: "https://graph.facebook.com/v25.0/1230538790140150/messages"
    });
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}")).toEqual({
      messaging_product: "whatsapp",
      text: {
        body: "Gracias, quedamos atentos.",
        preview_url: false
      },
      to: "5215512345678",
      type: "text"
    });
    expect(fetcher.calls[0]?.init.headers.Authorization).toBe("Bearer secret-token");
    expect(repository.messages[0]).toMatchObject({
      bodyText: "Gracias, quedamos atentos.",
      direction: "OUTBOUND",
      metaMessageId: "wamid.outbound-1",
      status: "accepted",
      toPhone: "5215512345678"
    });
    expect(repository.conversations[0]).toMatchObject({
      lastMessageAt: new Date("2026-07-09T17:00:00.000Z"),
      lastOutboundAt: new Date("2026-07-09T17:00:00.000Z")
    });
  });

  it("normaliza móviles México de 10 dígitos a 521 + 10 dígitos", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({
      id: "conversation-1",
      lastInboundAt: new Date("2026-07-09T16:00:00.000Z"),
      phoneNumber: "55 1234 5678",
      waId: "55 1234 5678"
    });
    repository.conversations.push(conversation);
    const fetcher = viFetch({
      messages: [{ id: "wamid.outbound-2", message_status: "accepted" }]
    });

    await sendOneuiWhatsAppTextReply({
      actor: { role: "ADMIN", status: "ACTIVE" },
      bodyText: "Mensaje de prueba",
      conversationId: conversation.id,
      env: whatsappEnv(),
      fetcher,
      now: new Date("2026-07-09T17:00:00.000Z"),
      repository
    });

    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").to).toBe("5215512345678");
  });

  it("si Meta falla, guarda failed y devuelve error", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({
      id: "conversation-1",
      lastInboundAt: new Date("2026-07-09T16:00:00.000Z")
    });
    repository.conversations.push(conversation);
    const fetcher = viFetch(
      {
        error: {
          message: "Invalid recipient"
        }
      },
      false,
      400
    );

    const result = await sendOneuiWhatsAppTextReply({
      actor: { role: "ADMIN", status: "ACTIVE" },
      bodyText: "Hola",
      conversationId: conversation.id,
      env: whatsappEnv(),
      fetcher,
      now: new Date("2026-07-09T17:00:00.000Z"),
      repository
    });

    expect(result).toMatchObject({
      code: "META_API_ERROR",
      message: "Invalid recipient",
      ok: false
    });
    expect(repository.messages[0]).toMatchObject({
      direction: "OUTBOUND",
      status: "failed"
    });
    expect(repository.messages[0]?.rawPayload).toMatchObject({
      response: {
        error: {
          message: "Invalid recipient"
        }
      },
      status: 400
    });
  });

  it("bloquea texto libre fuera de la ventana de 24 horas", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({
      id: "conversation-1",
      lastInboundAt: new Date("2026-07-08T16:59:00.000Z")
    });
    repository.conversations.push(conversation);
    const fetcher = viFetch({ messages: [] });

    const result = await sendOneuiWhatsAppTextReply({
      actor: { role: "ADMIN", status: "ACTIVE" },
      bodyText: "Hola",
      conversationId: conversation.id,
      env: whatsappEnv(),
      fetcher,
      now: new Date("2026-07-09T17:00:00.000Z"),
      repository
    });

    expect(result).toMatchObject({
      code: "OUTSIDE_CUSTOMER_SERVICE_WINDOW",
      ok: false
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });
});

describe("ONEUI WhatsApp inbox access", () => {
  it("permite admin y supervisor, pero no otros roles", () => {
    expect(canAccessOneuiWhatsAppInbox({ role: "ADMIN", status: "ACTIVE" })).toBe(true);
    expect(canAccessOneuiWhatsAppInbox({ role: "SUPERVISOR", status: "ACTIVE" })).toBe(true);
    expect(canAccessOneuiWhatsAppInbox({ role: "INTERVIEWER", status: "ACTIVE" })).toBe(false);
    expect(canAccessOneuiWhatsAppInbox({ role: "ADMIN", status: "INACTIVE" })).toBe(false);
  });

  it("lista conversaciones y devuelve la conversación seleccionada", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({ id: "conversation-1" });
    const message = createMessage({ conversationId: conversation.id });
    repository.conversations.push(conversation);
    repository.messages.push(message);

    const result = await getOneuiWhatsAppInbox({
      actor: { role: "SUPERVISOR", status: "ACTIVE" },
      conversationId: conversation.id,
      repository
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.conversations[0]?.waId : null).toBe("5215512345678");
    expect(result.ok ? result.data.selectedConversation?.messages[0]?.bodyText : null).toBe("Hola");
  });
});

function inboundPayload() {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [
                {
                  profile: { name: "Participante Uno" },
                  wa_id: "5215512345678"
                }
              ],
              messages: [
                {
                  from: "5215512345678",
                  id: "wamid.inbound-1",
                  text: { body: "Hola, confirmo asistencia" },
                  timestamp: "1783558800",
                  type: "text"
                }
              ],
              metadata: {
                display_phone_number: "5215511303411",
                phone_number_id: "1230538790140150"
              }
            }
          }
        ],
        id: "1592976235789580"
      }
    ],
    object: "whatsapp_business_account"
  };
}

function statusPayload(statuses: string[]) {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: statuses.map((status, index) => ({
                id: "wamid.outbound-1",
                recipient_id: "5215512345678",
                status,
                timestamp: String(1783558800 + index)
              }))
            }
          }
        ]
      }
    ],
    object: "whatsapp_business_account"
  };
}

function createFakeRepository() {
  const conversations: OneuiWhatsAppConversationRecord[] = [];
  const messages: OneuiWhatsAppMessageRecord[] = [];
  const statusEvents: OneuiWhatsAppStatusEventRecord[] = [];

  const repository: OneuiWhatsAppRepository & {
    conversations: OneuiWhatsAppConversationRecord[];
    messages: OneuiWhatsAppMessageRecord[];
    statusEvents: OneuiWhatsAppStatusEventRecord[];
  } = {
    conversations,
    async createOutboundMessage(input: CreateOutboundMessageInput): Promise<OneuiWhatsAppMessageRecord> {
      const message = createMessage({
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        fromPhone: input.fromPhone,
        id: `message-${messages.length + 1}`,
        messageType: "text",
        metaMessageId: null,
        rawPayload: input.rawPayload,
        status: "pending",
        timestamp: input.timestamp,
        toPhone: input.toPhone
      });
      messages.push(message);
      return message;
    },
    async getConversationWithMessages(conversationId): Promise<OneuiWhatsAppConversationDetail | null> {
      const conversation = conversations.find((item) => item.id === conversationId);

      return conversation
        ? {
            ...conversation,
            messages: messages
              .filter((message) => message.conversationId === conversation.id)
              .sort((left, right) => (left.timestamp?.getTime() ?? 0) - (right.timestamp?.getTime() ?? 0))
          }
        : null;
    },
    async listConversations(): Promise<OneuiWhatsAppConversationSummary[]> {
      return conversations.map((conversation) => ({
        ...conversation,
        messages: messages
          .filter((message) => message.conversationId === conversation.id)
          .sort((left, right) => (right.timestamp?.getTime() ?? 0) - (left.timestamp?.getTime() ?? 0))
          .slice(0, 1)
      }));
    },
    async markOutboundMessageAccepted(input: MarkOutboundMessageAcceptedInput): Promise<OneuiWhatsAppMessageRecord> {
      const message = messages.find((item) => item.id === input.messageId);

      if (!message) {
        throw new Error("Message not found.");
      }

      message.metaMessageId = input.metaMessageId;
      message.rawPayload = input.rawPayload;
      message.status = input.status;
      message.timestamp = input.timestamp;

      const conversation = conversations.find((item) => item.id === message.conversationId);

      if (conversation) {
        conversation.lastMessageAt = input.timestamp;
        conversation.lastOutboundAt = input.timestamp;
      }

      return message;
    },
    async markOutboundMessageFailed(input: MarkOutboundMessageFailedInput): Promise<OneuiWhatsAppMessageRecord> {
      const message = messages.find((item) => item.id === input.messageId);

      if (!message) {
        throw new Error("Message not found.");
      }

      message.rawPayload = input.rawPayload;
      message.status = input.status;
      return message;
    },
    messages,
    async saveInboundMessage(input: SaveInboundMessageInput): Promise<OneuiWhatsAppMessageRecord> {
      const existing = input.metaMessageId
        ? messages.find((message) => message.metaMessageId === input.metaMessageId)
        : null;

      if (existing) {
        Object.assign(existing, input);
        return existing;
      }

      const message = createMessage({
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        fromPhone: input.fromPhone,
        messageType: input.messageType,
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        timestamp: input.timestamp,
        toPhone: input.toPhone
      });
      messages.push(message);
      return message;
    },
    async saveStatusEvent(input: SaveStatusEventInput): Promise<OneuiWhatsAppStatusEventRecord> {
      const message = messages.find((item) => item.metaMessageId === input.metaMessageId);

      if (message) {
        message.status = input.status;
      }

      const event = {
        createdAt: new Date("2026-07-08T21:30:00.000Z"),
        id: `status-${statusEvents.length + 1}`,
        messageId: message?.id ?? null,
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: input.status,
        timestamp: input.timestamp
      };
      statusEvents.push(event);
      return event;
    },
    statusEvents,
    async upsertInboundConversation(input: UpsertInboundConversationInput): Promise<OneuiWhatsAppConversationRecord> {
      const existing = conversations.find((conversation) => conversation.waId === input.waId);

      if (existing) {
        existing.lastInboundAt = input.lastInboundAt;
        existing.lastMessageAt = input.lastInboundAt;
        existing.phoneNumber = input.phoneNumber;
        existing.profileName = input.profileName ?? existing.profileName;
        return existing;
      }

      const conversation = createConversation({
        lastInboundAt: input.lastInboundAt,
        lastMessageAt: input.lastInboundAt,
        phoneNumber: input.phoneNumber,
        profileName: input.profileName,
        waId: input.waId
      });
      conversations.push(conversation);
      return conversation;
    }
  };

  return repository;
}

function viFetch(payload: unknown, ok = true, status = 200) {
  const calls: Array<{
    input: string;
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
    };
  }> = [];
  const fetcher = async (
    input: string,
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
    }
  ) => {
    calls.push({ input, init });

    return {
      async json() {
        return payload;
      },
      ok,
      status
    };
  };

  return Object.assign(fetcher, { calls });
}

function whatsappEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WHATSAPP_ACCESS_TOKEN: "secret-token",
    WHATSAPP_PHONE_NUMBER_ID: "1230538790140150"
  };
}

function createConversation(
  overrides: Partial<OneuiWhatsAppConversationRecord> = {}
): OneuiWhatsAppConversationRecord {
  return {
    createdAt: new Date("2026-07-08T21:00:00.000Z"),
    id: "conversation-1",
    lastInboundAt: new Date("2026-07-08T21:00:00.000Z"),
    lastMessageAt: new Date("2026-07-08T21:00:00.000Z"),
    lastOutboundAt: null,
    linkedParticipantId: null,
    linkedStudyId: null,
    phoneNumber: "5215512345678",
    profileName: "Participante Uno",
    sourceModule: "GENERAL",
    updatedAt: new Date("2026-07-08T21:00:00.000Z"),
    waId: "5215512345678",
    ...overrides
  };
}

function createMessage(overrides: Partial<OneuiWhatsAppMessageRecord> = {}): OneuiWhatsAppMessageRecord {
  return {
    bodyText: "Hola",
    conversationId: "conversation-1",
    createdAt: new Date("2026-07-08T21:00:00.000Z"),
    direction: "INBOUND",
    fromPhone: "5215512345678",
    id: "message-1",
    messageType: "text",
    metaMessageId: "wamid.inbound-1",
    rawPayload: {},
    status: null,
    timestamp: new Date("2026-07-08T21:00:00.000Z"),
    toPhone: "5215511303411",
    updatedAt: new Date("2026-07-08T21:00:00.000Z"),
    ...overrides
  };
}
