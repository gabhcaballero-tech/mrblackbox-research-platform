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

  if (input.existingMessage && input.existingMessage.status !== "failed" && isCompleteNavigoCodesWhatsApp(input.existingMessage)) {
    return { code: "SKIPPED", message: "WhatsApp Navigo con codigos ya enviado.", ok: false };
  }

  const orderedCodes = [...input.codes].sort((left, right) => left.slot - right.slot);
  const required = [input.participantName, input.folio, input.phone, orderedCodes[0]?.code, orderedCodes[1]?.code, orderedCodes[2]?.code];

  if (required.some((value) => !value)) {
    return { code: "SKIPPED", message: "Faltan datos para enviar WhatsApp Navigo.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildNavigoCodesWhatsAppBody({
      codes: orderedCodes,
      folio: input.folio,
      participantName: input.participantName
    }),
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
    templateName: env.WHATSAPP_NAVIGO_CONFIRMATION_TEMPLATE ?? "oneui_navigo_confirmation_participacion",
    toPhone: input.phone ?? ""
  });
}

export function buildNavigoCodesWhatsAppBody({
  codes,
  folio,
  participantName
}: {
  codes: Array<{ code: string; slot: number }>;
  folio: string;
  participantName: string;
}): string {
  const orderedCodes = [...codes].sort((left, right) => left.slot - right.slot);

  return [
    `Hola, ${participantName}.`,
    "",
    "Tu perfil cumple con los criterios iniciales del estudio y puedes continuar con el proceso.",
    "",
    `Folio: ${folio}`,
    "",
    `Código 1: ${orderedCodes[0]?.code ?? ""}`,
    `Código 2: ${orderedCodes[1]?.code ?? ""}`,
    `Código 3: ${orderedCodes[2]?.code ?? ""}`,
    "",
    "Conserva este mensaje y tus códigos, ya que serán solicitados durante tu evaluación.",
    "",
    "Gracias por participar."
  ].join("\n");
}

function isCompleteNavigoCodesWhatsApp(
  message: Pick<OneuiWhatsAppMessageRecord, "bodyText" | "rawPayload">
): boolean {
  if (message.bodyText?.includes("Código 3:") || message.bodyText?.includes("Codigo 3:")) {
    return true;
  }

  return countTemplateBodyParameters(message.rawPayload) >= 5;
}

function countTemplateBodyParameters(rawPayload: unknown): number {
  if (!rawPayload || typeof rawPayload !== "object" || !("request" in rawPayload)) {
    return 0;
  }

  const request = (rawPayload as { request?: unknown }).request;
  if (!request || typeof request !== "object" || !("template" in request)) {
    return 0;
  }

  const template = (request as { template?: unknown }).template;
  if (!template || typeof template !== "object" || !("components" in template)) {
    return 0;
  }

  const components = (template as { components?: unknown }).components;
  if (!Array.isArray(components)) {
    return 0;
  }

  const body = components.find((component) => {
    return Boolean(component && typeof component === "object" && (component as { type?: unknown }).type === "body");
  });

  if (!body || typeof body !== "object" || !("parameters" in body)) {
    return 0;
  }

  const parameters = (body as { parameters?: unknown }).parameters;
  return Array.isArray(parameters) ? parameters.length : 0;
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
