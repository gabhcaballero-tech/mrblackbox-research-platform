import {
  sendOneuiWhatsAppTemplate,
  type OneuiWhatsAppSendTemplateResult,
  type OneuiWhatsAppTemplateParameter
} from "./service";
import type { OneuiWhatsAppMessageRecord, OneuiWhatsAppRepository } from "./repository";

export type WhatsAppAutomationStatus = {
  error: string | null;
  metaMessageId: string | null;
  sentAt: Date | null;
  status: "ERROR" | "NO_ENVIADO" | "ENVIADO";
};

export type WhatsAppTemplateSender = typeof sendOneuiWhatsAppTemplate;

export function whatsappAutomationStatusFromMessage(
  message: Pick<OneuiWhatsAppMessageRecord, "createdAt" | "metaMessageId" | "rawPayload" | "status" | "timestamp"> | null
): WhatsAppAutomationStatus {
  if (!message) {
    return { error: null, metaMessageId: null, sentAt: null, status: "NO_ENVIADO" };
  }

  if (message.status === "failed") {
    return {
      error: readWhatsAppErrorMessage(message.rawPayload),
      metaMessageId: message.metaMessageId,
      sentAt: message.timestamp ?? message.createdAt,
      status: "ERROR"
    };
  }

  return {
    error: null,
    metaMessageId: message.metaMessageId,
    sentAt: message.timestamp ?? message.createdAt,
    status: "ENVIADO"
  };
}

export async function sendNavigoConfirmationWhatsApp(input: {
  codes: Array<{ code: string; slot: number }>;
  env?: NodeJS.ProcessEnv;
  existingMessage?: OneuiWhatsAppMessageRecord | null;
  force?: boolean;
  folio: string;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_NAVIGO_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico Navigo desactivado.", ok: false };
  }

  if (!input.force && input.existingMessage && input.existingMessage.status !== "failed") {
    return { code: "SKIPPED", message: "WhatsApp Navigo ya enviado.", ok: false };
  }

  const orderedCodes = [...input.codes].sort((left, right) => left.slot - right.slot);
  const required = [input.participantName, input.folio, input.phone, orderedCodes[0]?.code, orderedCodes[1]?.code, orderedCodes[2]?.code];

  if (required.some((value) => !value)) {
    return { code: "SKIPPED", message: "Faltan datos para enviar WhatsApp Navigo.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: `Confirmacion Navigo ${input.folio}`,
    env,
    language: env.WHATSAPP_NAVIGO_CONFIRMATION_LANGUAGE ?? "es",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.folio),
      textParameter(orderedCodes[0]?.code ?? ""),
      textParameter(orderedCodes[1]?.code ?? ""),
      textParameter(orderedCodes[2]?.code ?? "")
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "NAVIGO",
    templateName: env.WHATSAPP_NAVIGO_CONFIRMATION_TEMPLATE ?? "oneui_navigo_confirmacion_participacion",
    toPhone: input.phone ?? ""
  });
}

export async function sendHutRegistrationWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  existingMessage?: OneuiWhatsAppMessageRecord | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  force?: boolean;
  link: string;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  secondFragranceRightArm: string | null;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_HUT_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico HUT desactivado.", ok: false };
  }

  if (!input.force && input.existingMessage && input.existingMessage.status !== "failed") {
    return { code: "SKIPPED", message: "WhatsApp HUT ya enviado.", ok: false };
  }

  const required = [
    input.participantName,
    input.folio,
    input.phone,
    input.firstFragranceLeftArm,
    input.secondFragranceRightArm,
    input.link
  ];

  if (required.some((value) => !value)) {
    return { code: "SKIPPED", message: "Faltan datos para enviar WhatsApp HUT.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: `Confirmacion HUT ${input.folio}`,
    env,
    language: env.WHATSAPP_HUT_REGISTRATION_LANGUAGE ?? "es",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.folio ?? ""),
      textParameter(input.firstFragranceLeftArm ?? ""),
      textParameter(input.secondFragranceRightArm ?? ""),
      textParameter(input.link)
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "HUT",
    templateName: env.WHATSAPP_HUT_REGISTRATION_TEMPLATE ?? "oneui_hut_confirmacion_registro",
    toPhone: input.phone ?? ""
  });
}

function textParameter(text: string): OneuiWhatsAppTemplateParameter {
  return { text, type: "text" };
}

function readWhatsAppErrorMessage(rawPayload: unknown): string | null {
  if (typeof rawPayload !== "object" || rawPayload === null) {
    return null;
  }

  const response = "response" in rawPayload ? (rawPayload as { response?: unknown }).response : null;
  const errorContainer = response && typeof response === "object" && "error" in response ? (response as { error?: unknown }).error : null;

  if (errorContainer && typeof errorContainer === "object" && "message" in errorContainer) {
    const message = (errorContainer as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}
