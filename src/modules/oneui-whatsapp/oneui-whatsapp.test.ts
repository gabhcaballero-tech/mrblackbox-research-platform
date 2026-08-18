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
  UpsertInboundConversationInput,
  UpsertOutboundConversationInput
} from "./repository";
import {
  canAccessOneuiWhatsAppInbox,
  getOneuiWhatsAppInbox,
  normalizeWhatsAppRecipient,
  processOneuiWhatsAppWebhookPayload,
  sendOneuiWhatsAppTemplate,
  sendOneuiWhatsAppTextReply,
  V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE
} from "./service";
import {
  buildNavigoCodesWhatsAppBody,
  HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN,
  WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG,
  sendHutCompletionWhatsApp,
  sendHutParticipantLinkWhatsApp,
  sendHutPhotoReminderWhatsApp,
  sendHutRegistrationWhatsApp,
  sendNavigoConfirmationWhatsApp,
  sendNavigoEvaluationLinkWhatsApp,
  sendNavigoHutLinksWhatsApp,
  sendNavigoEvaluationReminderWhatsApp
} from "./templates";

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
  it("bloquea respuestas libres cuando V1 tiene comunicaciones operativas deshabilitadas", async () => {
    const repository = createFakeRepository();
    repository.conversations.push(createConversation({
      id: "conversation-1",
      lastInboundAt: new Date("2026-07-09T16:00:00.000Z")
    }));
    const fetcher = viFetch({ messages: [{ id: "wamid.outbound-1" }] });

    const result = await sendOneuiWhatsAppTextReply({
      actor: { role: "ADMIN", status: "ACTIVE" },
      bodyText: "Hola",
      conversationId: "conversation-1",
      env: {
        ...whatsappEnv(),
        WHATSAPP_AUTOMATION_ENABLED: "false"
      },
      fetcher,
      now: new Date("2026-07-09T17:00:00.000Z"),
      repository
    });

    expect(result).toMatchObject({
      code: "AUTOMATION_DISABLED",
      message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
      ok: false
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });

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

describe("ONEUI WhatsApp template sending", () => {
  it("normaliza moviles Mexico de 10 digitos a 521 + 10 digitos", () => {
    expect(normalizeWhatsAppRecipient("9511273419")).toBe("5219511273419");
    expect(normalizeWhatsAppRecipient("+52 1 55 1130 3411")).toBe("5215511303411");
  });

  it("arma payload de plantilla Navigo y guarda OUTBOUND NAVIGO", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.navigo-1", message_status: "accepted" }]
    });

    const result = await sendOneuiWhatsAppTemplate({
      bodyText: "Confirmacion Navigo",
      env: whatsappEnv(),
      fetcher,
      language: "es",
      linkedParticipantId: "participant-1",
      linkedStudyId: "study-1",
      parameters: [
        { text: "ANA", type: "text" },
        { text: "NAV-001", type: "text" },
        { text: "A7K4", type: "text" },
        { text: "M3P9", type: "text" },
        { text: "T8R2", type: "text" }
      ],
      profileName: "ANA",
      repository,
      sourceModule: "NAVIGO",
      templateName: "oneui_navigo_confirmation_participacion",
      toPhone: "5512345678"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}")).toEqual({
      messaging_product: "whatsapp",
      template: {
        components: [
          {
            parameters: [
              { text: "ANA", type: "text" },
              { text: "NAV-001", type: "text" },
              { text: "A7K4", type: "text" },
              { text: "M3P9", type: "text" },
              { text: "T8R2", type: "text" }
            ],
            type: "body"
          }
        ],
        language: { code: "es" },
        name: "oneui_navigo_confirmation_participacion"
      },
      to: "5215512345678",
      type: "template"
    });
    expect(repository.conversations[0]).toMatchObject({
      linkedParticipantId: "participant-1",
      linkedStudyId: "study-1",
      sourceModule: "NAVIGO"
    });
    expect(repository.messages[0]).toMatchObject({
      messageType: "template",
      metaMessageId: "wamid.navigo-1",
      status: "accepted"
    });
  });

  it("bloquea plantillas cuando V1 tiene comunicaciones operativas deshabilitadas", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      messages: [{ id: "wamid.navigo-disabled-1", message_status: "accepted" }]
    });

    const result = await sendOneuiWhatsAppTemplate({
      bodyText: "Confirmacion Navigo",
      env: {
        ...whatsappEnv(),
        WHATSAPP_AUTOMATION_ENABLED: "false"
      },
      fetcher,
      language: "es",
      parameters: [{ text: "ANA", type: "text" }],
      repository,
      sourceModule: "NAVIGO",
      templateName: "oneui_navigo_confirmation_participacion",
      toPhone: "5512345678"
    });

    expect(result).toMatchObject({
      code: "AUTOMATION_DISABLED",
      message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
      ok: false
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });

  it("arma payload de plantilla Navigo acceso con nombre, enlace y folio", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.navigo-eval-1", message_status: "accepted" }]
    });
    const result = await sendNavigoEvaluationLinkWhatsApp({
      env: whatsappEnv(),
      evaluationUrl: "https://example.test/p/token/activities",
      folio: "NAV-001",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      components: [
        {
          parameters: [
            { text: "ANA", type: "text" },
            { text: "https://example.test/p/token/activities", type: "text" },
            { text: "NAV-001", type: "text" }
          ],
          type: "body"
        }
      ],
      language: { code: "es_MX" },
      name: "navigo_acceso_evaluaciones"
    });
    expect(repository.messages[0]).toMatchObject({
      messageType: "template",
      metaMessageId: "wamid.navigo-eval-1",
      status: "accepted"
    });
  });

  it("permite configurar boton dinamico para la plantilla de acceso Navigo", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.navigo-eval-button-1", message_status: "accepted" }]
    });
    const result = await sendNavigoEvaluationLinkWhatsApp({
      env: {
        ...whatsappEnv(),
        WHATSAPP_NAVIGO_EVALUATION_BUTTON_URL_ENABLED: "true"
      },
      evaluationUrl: "https://example.test/p/token/activities",
      folio: "NAV-001",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      components: [
        {
          parameters: [
            { text: "ANA", type: "text" },
            { text: "https://example.test/p/token/activities", type: "text" },
            { text: "NAV-001", type: "text" }
          ],
          type: "body"
        },
        {
          index: "0",
          parameters: [
            { text: "https://example.test/p/token/activities", type: "text" }
          ],
          sub_type: "url",
          type: "button"
        }
      ],
      language: { code: "es_MX" },
      name: "navigo_acceso_evaluaciones"
    });
  });

  it("arma payload de plantilla HUT con nombre y enlace fotografico", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.hut-link-1", message_status: "accepted" }]
    });
    const result = await sendHutParticipantLinkWhatsApp({
      env: whatsappEnv(),
      hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token",
      participantId: "hut-participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      components: [
        {
          parameters: [
            { text: "ANA", type: "text" },
            { text: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token", type: "text" }
          ],
          type: "body"
        }
      ],
      language: { code: "es_MX" },
      name: "hut_link_participant"
    });
    expect(repository.conversations[0]).toMatchObject({
      linkedParticipantId: "hut-participant-1",
      linkedStudyId: "study-1",
      sourceModule: "HUT"
    });
  });

  it("arma payload de plantilla combinada Navigo + HUT", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.navigo-hut-links-1", message_status: "accepted" }]
    });
    const result = await sendNavigoHutLinksWhatsApp({
      env: whatsappEnv(),
      hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token",
      navigoUrl: "https://example.test/p/token/activities",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      components: [
        {
          parameters: [
            { text: "ANA", type: "text" },
            { text: "https://example.test/p/token/activities", type: "text" },
            { text: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token", type: "text" }
          ],
          type: "body"
        }
      ],
      language: { code: "es_MX" },
      name: "navigo_hut_links"
    });
    expect(repository.conversations[0]).toMatchObject({
      linkedParticipantId: "participant-1",
      linkedStudyId: "study-1",
      sourceModule: "NAVIGO"
    });
  });

  it("arma payload de recordatorio Navigo como plantilla simple sin parametros", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.navigo-reminder-1", message_status: "accepted" }]
    });
    const result = await sendNavigoEvaluationReminderWhatsApp({
      activityCode: "T3_HORAS",
      env: whatsappEnv(),
      evaluationUrl: "https://example.test/p/token/activities",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      language: { code: "es_MX" },
      name: "navigo_recordatorio_evaluacion"
    });
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).not.toHaveProperty("components");
    expect(repository.messages[0]).toMatchObject({
      bodyText: "Tu siguiente evaluacion ya se encuentra disponible.\n\nTe invitamos a realizarla ahora.",
      messageType: "template",
      metaMessageId: "wamid.navigo-reminder-1",
      status: "accepted"
    });
  });

  it("arma payload de recordatorio fotografico HUT con nombre y enlace", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.hut-photo-reminder-1", message_status: "accepted" }]
    });
    const result = await sendHutPhotoReminderWhatsApp({
      env: whatsappEnv(),
      hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token",
      participantId: "hut-participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      components: [
        {
          parameters: [
            { text: "ANA", type: "text" },
            { text: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token", type: "text" }
          ],
          type: "body"
        }
      ],
      language: { code: "es_MX" },
      name: "hut_photo_reminder"
    });
    expect(repository.conversations[0]).toMatchObject({
      linkedParticipantId: "hut-participant-1",
      linkedStudyId: "study-1",
      sourceModule: "HUT"
    });
  });

  it("bloquea plantillas HUT con dominio preview de Vercel", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.hut-photo-reminder-1", message_status: "accepted" }]
    });
    const result = await sendHutPhotoReminderWhatsApp({
      env: whatsappEnv(),
      hutUrl: "https://mrblackbox-research-platform-2dozm0xm7-oneui.vercel.app/hut/p/hut-token",
      participantId: "hut-participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      code: HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN,
      message: "El dominio generado no coincide con el dominio publico permitido.",
      ok: false
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });

  it("distingue configuracion faltante de dominio publico para plantillas HUT", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.hut-photo-reminder-1", message_status: "accepted" }]
    });
    const env = {
      NODE_ENV: "test",
      WHATSAPP_ACCESS_TOKEN: "secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "1230538790140150"
    } as unknown as NodeJS.ProcessEnv;
    const result = await sendHutPhotoReminderWhatsApp({
      env,
      hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token",
      participantId: "hut-participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result).toMatchObject({
      code: WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG,
      message: "No existe dominio publico configurado para envios WhatsApp.",
      ok: false
    });
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.messages).toHaveLength(0);
  });

  it("arma payload de cierre HUT sin parametros", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      contacts: [{ wa_id: "5215512345678" }],
      messages: [{ id: "wamid.hut-completion-1", message_status: "accepted" }]
    });
    const result = await sendHutCompletionWhatsApp({
      env: whatsappEnv(),
      participantId: "hut-participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      sender: (input) => sendOneuiWhatsAppTemplate({ ...input, fetcher }),
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).toMatchObject({
      language: { code: "es_MX" },
      name: "hut_completion_message"
    });
    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template).not.toHaveProperty("components");
    expect(repository.messages[0]).toMatchObject({
      bodyText: "Gracias por su apoyo y participacion.\nLa persona que lo invito se pondra en contacto con usted para recibir su incentivo.",
      messageType: "template",
      metaMessageId: "wamid.hut-completion-1",
      status: "accepted"
    });
  });

  it("sendNavigoConfirmationWhatsApp usa el nuevo template aprobado aunque el env conserve el nombre anterior", async () => {
    const senderCalls: unknown[] = [];
    const result = await sendNavigoConfirmationWhatsApp({
      codes: [{ code: "A7K4", slot: 1 }, { code: "M3P9", slot: 2 }, { code: "T8R2", slot: 3 }],
      env: {
        ...whatsappEnv(),
        WHATSAPP_NAVIGO_CONFIRMATION_TEMPLATE: "oneui_navigo_confirmacion_participacion"
      },
      folio: "NAV-001",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      sender: async (input) => {
        senderCalls.push(input);
        return { data: createMessage({ direction: "OUTBOUND", messageType: "template" }), ok: true };
      },
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(senderCalls).toHaveLength(1);
    expect(senderCalls[0]).toMatchObject({
      parameters: [
        { text: "ANA", type: "text" },
        { text: "NAV-001", type: "text" },
        { text: "A7K4", type: "text" },
        { text: "M3P9", type: "text" },
        { text: "T8R2", type: "text" }
      ],
      sourceModule: "NAVIGO",
      templateName: "oneui_navigo_confirmation_participacion"
    });
  });

  it("arma payload de plantilla HUT", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({
      messages: [{ id: "wamid.hut-1", message_status: "accepted" }]
    });

    await sendOneuiWhatsAppTemplate({
      bodyText: "Confirmacion HUT",
      env: whatsappEnv(),
      fetcher,
      language: "es",
      linkedParticipantId: "hut-participant-1",
      linkedStudyId: "study-1",
      parameters: [
        { text: "ANA", type: "text" },
        { text: "HUT-001", type: "text" },
        { text: "Fragancia A", type: "text" },
        { text: "Fragancia B", type: "text" },
        { text: "https://example.com/hut/p/token", type: "text" }
      ],
      repository,
      sourceModule: "HUT",
      templateName: "oneui_hut_confirmacion_registro",
      toPhone: "5215512345678"
    });

    expect(JSON.parse(fetcher.calls[0]?.init.body ?? "{}").template.name).toBe("oneui_hut_confirmacion_registro");
    expect(repository.conversations[0]?.sourceModule).toBe("HUT");
    expect(repository.messages[0]?.messageType).toBe("template");
  });

  it("maneja error de Meta sin exponer token en rawPayload", async () => {
    const repository = createFakeRepository();
    const fetcher = viFetch({ error: { message: "Template not found" } }, false, 400);

    const result = await sendOneuiWhatsAppTemplate({
      bodyText: "Confirmacion",
      env: whatsappEnv(),
      fetcher,
      language: "es",
      parameters: [{ text: "ANA", type: "text" }],
      repository,
      sourceModule: "NAVIGO",
      templateName: "missing_template",
      toPhone: "5512345678"
    });

    expect(result).toMatchObject({ code: "META_API_ERROR", message: "Template not found", ok: false });
    expect(JSON.stringify(repository.messages[0]?.rawPayload)).not.toContain("secret-token");
  });

  it("no duplica confirmacion Navigo cuando ya existe template enviado", async () => {
    const repository = createFakeRepository();
    const conversation = createConversation({
      linkedParticipantId: "participant-1",
      linkedStudyId: "study-1",
      sourceModule: "NAVIGO"
    });
    repository.conversations.push(conversation);
    repository.messages.push(createMessage({
      bodyText: buildNavigoCodesWhatsAppBody({
        codes: [{ code: "A7K4", slot: 1 }, { code: "M3P9", slot: 2 }, { code: "T8R2", slot: 3 }],
        folio: "NAV-001",
        participantName: "ANA"
      }),
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType: "template",
      status: "accepted"
    }));

    const result = await sendNavigoConfirmationWhatsApp({
      codes: [{ code: "A7K4", slot: 1 }, { code: "M3P9", slot: 2 }, { code: "T8R2", slot: 3 }],
      existingMessage: await repository.findLatestOutboundTemplateMessage({
        linkedParticipantId: "participant-1",
        linkedStudyId: "study-1",
        sourceModule: "NAVIGO"
      }),
      folio: "NAV-001",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      repository,
      studyId: "study-1"
    });

    expect(result).toMatchObject({ code: "SKIPPED", ok: false });
  });

  it("permite enviar actualizacion completa cuando el mensaje previo solo tenia folio", async () => {
    const senderCalls: unknown[] = [];
    const result = await sendNavigoConfirmationWhatsApp({
      codes: [{ code: "A7K4", slot: 1 }, { code: "M3P9", slot: 2 }, { code: "T8R2", slot: 3 }],
      existingMessage: createMessage({
        bodyText: "Folio NAV-001",
        direction: "OUTBOUND",
        messageType: "template",
        rawPayload: {
          request: {
            template: {
              components: [
                {
                  parameters: [{ text: "ANA", type: "text" }, { text: "NAV-001", type: "text" }],
                  type: "body"
                }
              ]
            }
          }
        },
        status: "accepted"
      }),
      folio: "NAV-001",
      participantId: "participant-1",
      participantName: "ANA",
      phone: "5512345678",
      sender: async (input) => {
        senderCalls.push(input);
        return { data: createMessage({ direction: "OUTBOUND", messageType: "template" }), ok: true };
      },
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(senderCalls).toHaveLength(1);
    expect(senderCalls[0]).toMatchObject({
      bodyText: expect.stringContaining("Código 3: T8R2"),
      parameters: [
        { text: "ANA", type: "text" },
        { text: "NAV-001", type: "text" },
        { text: "A7K4", type: "text" },
        { text: "M3P9", type: "text" },
        { text: "T8R2", type: "text" }
      ],
      sourceModule: "NAVIGO"
    });
  });

  it("prepara variables de template HUT", async () => {
    const calls: unknown[] = [];
    const result = await sendHutRegistrationWhatsApp({
      env: whatsappEnv(),
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-001",
      link: "https://mrblackbox-research-platform.vercel.app/hut/p/token",
      participantId: "hut-1",
      participantName: "ANA",
      phone: "5512345678",
      secondFragranceRightArm: "Fragancia B",
      sender: async (input) => {
        calls.push(input);
        return { data: createMessage({ direction: "OUTBOUND", messageType: "template" }), ok: true };
      },
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      sourceModule: "HUT",
      templateName: "oneui_hut_confirmacion_registro"
    });
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
        messageType: input.messageType ?? "text",
        metaMessageId: null,
        rawPayload: input.rawPayload,
        status: "pending",
        timestamp: input.timestamp,
        toPhone: input.toPhone
      });
      messages.push(message);
      return message;
    },
    async findLatestOutboundTemplateMessage(input): Promise<OneuiWhatsAppMessageRecord | null> {
      const conversationIds = conversations
        .filter(
          (conversation) =>
            conversation.linkedParticipantId === input.linkedParticipantId &&
            conversation.linkedStudyId === input.linkedStudyId &&
            conversation.sourceModule === input.sourceModule
        )
        .map((conversation) => conversation.id);

      return (
        [...messages]
          .filter(
            (message) =>
              conversationIds.includes(message.conversationId) &&
              message.direction === "OUTBOUND" &&
              message.messageType === "template"
          )
          .sort((left, right) => (right.timestamp?.getTime() ?? 0) - (left.timestamp?.getTime() ?? 0))[0] ?? null
      );
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
    },
    async upsertOutboundConversation(input: UpsertOutboundConversationInput): Promise<OneuiWhatsAppConversationRecord> {
      const existing = conversations.find((conversation) => conversation.waId === input.waId);

      if (existing) {
        existing.linkedParticipantId = input.linkedParticipantId ?? existing.linkedParticipantId;
        existing.linkedStudyId = input.linkedStudyId ?? existing.linkedStudyId;
        existing.phoneNumber = input.phoneNumber;
        existing.profileName = input.profileName ?? existing.profileName;
        existing.sourceModule = input.sourceModule;
        return existing;
      }

      const conversation = createConversation({
        id: `conversation-${conversations.length + 1}`,
        linkedParticipantId: input.linkedParticipantId ?? null,
        linkedStudyId: input.linkedStudyId ?? null,
        phoneNumber: input.phoneNumber,
        profileName: input.profileName ?? null,
        sourceModule: input.sourceModule,
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
    NEXT_PUBLIC_APP_URL: "https://mrblackbox-research-platform.vercel.app",
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
