import {
  sendOneuiWhatsAppTemplate,
  type OneuiWhatsAppSendTemplateResult,
  type OneuiWhatsAppTemplateParameter
} from "./service";
import type { OneuiWhatsAppMessageRecord, OneuiWhatsAppRepository } from "./repository";
import { resolveConfiguredPublicOrigin } from "@/shared/utils/request-origin";

export type WhatsAppAutomationStatus = {
  error: string | null;
  metaMessageId: string | null;
  sentAt: Date | null;
  status: "ERROR" | "NO_ENVIADO" | "ENVIADO";
};

export type WhatsAppTemplateSender = typeof sendOneuiWhatsAppTemplate;

const NAVIGO_CONFIRMATION_TEMPLATE_NAME = "oneui_navigo_confirmation_participacion";
const LEGACY_NAVIGO_CONFIRMATION_TEMPLATE_NAME = "oneui_navigo_confirmacion_participacion";
const NAVIGO_EVALUATION_TEMPLATE_NAME = "navigo_acceso_evaluaciones";
const NAVIGO_EVALUATION_REMINDER_TEMPLATE_NAME = "navigo_recordatorio_evaluacion";
const HUT_PARTICIPANT_LINK_TEMPLATE_NAME = "hut_link_participant";
const NAVIGO_HUT_LINKS_TEMPLATE_NAME = "navigo_hut_links";
const HUT_PHOTO_REMINDER_TEMPLATE_NAME = "hut_photo_reminder";
const HUT_COMPLETION_TEMPLATE_NAME = "hut_completion_message";
export const HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN = "HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN";

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
    templateName: resolveNavigoConfirmationTemplateName(env.WHATSAPP_NAVIGO_CONFIRMATION_TEMPLATE),
    toPhone: input.phone ?? ""
  });
}

function resolveNavigoConfirmationTemplateName(configuredTemplateName?: string): string {
  if (!configuredTemplateName || configuredTemplateName === LEGACY_NAVIGO_CONFIRMATION_TEMPLATE_NAME) {
    return NAVIGO_CONFIRMATION_TEMPLATE_NAME;
  }

  return configuredTemplateName;
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

export async function sendNavigoEvaluationLinkWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  evaluationUrl: string;
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

  if (!input.participantName || !input.phone || !input.evaluationUrl || !input.folio) {
    return { code: "SKIPPED", message: "Faltan datos para enviar enlace de evaluacion Navigo.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;
  const buttonUrl = env.WHATSAPP_NAVIGO_EVALUATION_BUTTON_URL_ENABLED === "true" ? input.evaluationUrl : null;

  return sender({
    bodyText: buildNavigoEvaluationLinkWhatsAppBody({
      evaluationUrl: input.evaluationUrl,
      folio: input.folio,
      participantName: input.participantName
    }),
    buttonUrl,
    env,
    language: env.WHATSAPP_NAVIGO_EVALUATION_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.evaluationUrl),
      textParameter(input.folio)
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "NAVIGO",
    templateName: env.WHATSAPP_NAVIGO_EVALUATION_TEMPLATE ?? NAVIGO_EVALUATION_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export function buildNavigoEvaluationLinkWhatsAppBody({
  evaluationUrl,
  folio,
  participantName
}: {
  evaluationUrl: string;
  folio: string;
  participantName: string;
}): string {
  return [
    `Hola ${participantName}.`,
    "",
    "Tu evaluacion de fragancia ya esta disponible.",
    "",
    `Folio: ${folio}`,
    "",
    "Ingresa en el siguiente enlace:",
    "",
    evaluationUrl,
    "",
    "Gracias por participar."
  ].join("\n");
}

export async function sendHutParticipantLinkWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  hutUrl: string;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_HUT_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico HUT desactivado.", ok: false };
  }

  if (!input.participantName || !input.phone || !input.hutUrl) {
    return { code: "SKIPPED", message: "Faltan datos para enviar enlace HUT.", ok: false };
  }
  const originValidation = validateHutWhatsAppPublicOrigin(input.hutUrl, env);
  if (!originValidation.ok) {
    return { code: "SKIPPED", message: HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN, ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildHutParticipantLinkWhatsAppBody({
      hutUrl: input.hutUrl,
      participantName: input.participantName
    }),
    env,
    language: env.WHATSAPP_HUT_LINK_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.hutUrl)
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "HUT",
    templateName: env.WHATSAPP_HUT_LINK_TEMPLATE ?? HUT_PARTICIPANT_LINK_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export async function sendNavigoHutLinksWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  hutUrl: string;
  navigoUrl: string;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_NAVIGO_AUTO_SEND_ENABLED === "false" || env.WHATSAPP_HUT_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico de enlaces Navigo/HUT desactivado.", ok: false };
  }

  if (!input.participantName || !input.phone || !input.navigoUrl || !input.hutUrl) {
    return { code: "SKIPPED", message: "Faltan datos para enviar enlaces Navigo/HUT.", ok: false };
  }
  const originValidation = validateHutWhatsAppPublicOrigin(input.hutUrl, env);
  if (!originValidation.ok) {
    return { code: "SKIPPED", message: HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN, ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildNavigoHutLinksWhatsAppBody({
      hutUrl: input.hutUrl,
      navigoUrl: input.navigoUrl,
      participantName: input.participantName
    }),
    env,
    language: env.WHATSAPP_NAVIGO_HUT_LINKS_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.navigoUrl),
      textParameter(input.hutUrl)
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "NAVIGO",
    templateName: env.WHATSAPP_NAVIGO_HUT_LINKS_TEMPLATE ?? NAVIGO_HUT_LINKS_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export function buildHutParticipantLinkWhatsAppBody({
  hutUrl,
  participantName
}: {
  hutUrl: string;
  participantName: string;
}): string {
  return [
    `Hola ${participantName}.`,
    "",
    "Te compartimos tu enlace para el seguimiento fotografico HUT.",
    `Enlace HUT: ${hutUrl}`,
    "",
    "Gracias por participar."
  ].filter(Boolean).join("\n");
}

export function buildNavigoHutLinksWhatsAppBody({
  hutUrl,
  navigoUrl,
  participantName
}: {
  hutUrl: string;
  navigoUrl: string;
  participantName: string;
}): string {
  return [
    `Hola ${participantName}.`,
    "",
    "Te compartimos tus enlaces de seguimiento del estudio.",
    "",
    `Navigo: ${navigoUrl}`,
    `HUT: ${hutUrl}`,
    "",
    "Gracias por participar."
  ].join("\n");
}

export async function sendNavigoEvaluationReminderWhatsApp(input: {
  activityCode: string;
  env?: NodeJS.ProcessEnv;
  evaluationUrl: string;
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

  if (!input.participantName || !input.phone || !input.evaluationUrl || !input.activityCode) {
    return { code: "SKIPPED", message: "Faltan datos para enviar recordatorio Navigo.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildNavigoEvaluationReminderWhatsAppBody(),
    buttonUrl: null,
    env,
    language: env.WHATSAPP_NAVIGO_REMINDER_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "NAVIGO",
    templateName: env.WHATSAPP_NAVIGO_REMINDER_TEMPLATE ?? NAVIGO_EVALUATION_REMINDER_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export function buildNavigoEvaluationReminderWhatsAppBody(): string {
  return [
    "Tu siguiente evaluacion ya se encuentra disponible.",
    "",
    "Te invitamos a realizarla ahora."
  ].join("\n");
}

export async function sendHutPhotoReminderWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  hutUrl: string;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_HUT_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico HUT desactivado.", ok: false };
  }

  if (!input.participantName || !input.phone || !input.hutUrl) {
    return { code: "SKIPPED", message: "Faltan datos para enviar recordatorio HUT.", ok: false };
  }
  const originValidation = validateHutWhatsAppPublicOrigin(input.hutUrl, env);
  if (!originValidation.ok) {
    return { code: "SKIPPED", message: HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN, ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildHutPhotoReminderWhatsAppBody({
      hutUrl: input.hutUrl,
      participantName: input.participantName
    }),
    env,
    language: env.WHATSAPP_HUT_PHOTO_REMINDER_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [
      textParameter(input.participantName),
      textParameter(input.hutUrl)
    ],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "HUT",
    templateName: env.WHATSAPP_HUT_PHOTO_REMINDER_TEMPLATE ?? HUT_PHOTO_REMINDER_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export function buildHutPhotoReminderWhatsAppBody({
  hutUrl,
  participantName
}: {
  hutUrl: string;
  participantName: string;
}): string {
  return [
    `Hola ${participantName}.`,
    "",
    "Tienes pendiente registrar tu fotografia HUT.",
    "",
    "Ingresa en el siguiente enlace:",
    hutUrl,
    "",
    "Gracias por participar."
  ].join("\n");
}

export function validateHutWhatsAppPublicOrigin(
  hutUrl: string,
  env: Partial<NodeJS.ProcessEnv> = process.env
): { ok: true; origin: string } | { expectedOrigin: string | null; ok: false; origin: string | null } {
  const expectedOrigin = resolveConfiguredPublicOrigin(env);
  const origin = readUrlOrigin(hutUrl);

  if (!expectedOrigin || !origin || origin !== expectedOrigin) {
    return { expectedOrigin, ok: false, origin };
  }

  return { ok: true, origin };
}

function readUrlOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export async function sendHutCompletionWhatsApp(input: {
  env?: NodeJS.ProcessEnv;
  now?: Date;
  participantId: string;
  participantName: string;
  phone: string | null;
  repository?: OneuiWhatsAppRepository;
  sender?: WhatsAppTemplateSender;
  studyId: string;
}): Promise<OneuiWhatsAppSendTemplateResult | { ok: false; code: "SKIPPED"; message: string }> {
  const env = input.env ?? process.env;

  if (env.WHATSAPP_HUT_AUTO_SEND_ENABLED === "false") {
    return { code: "SKIPPED", message: "Envio automatico HUT desactivado.", ok: false };
  }

  if (!input.participantName || !input.phone) {
    return { code: "SKIPPED", message: "Faltan datos para enviar cierre HUT.", ok: false };
  }

  const sender = input.sender ?? sendOneuiWhatsAppTemplate;

  return sender({
    bodyText: buildHutCompletionWhatsAppBody(),
    env,
    language: env.WHATSAPP_HUT_COMPLETION_LANGUAGE ?? "es_MX",
    linkedParticipantId: input.participantId,
    linkedStudyId: input.studyId,
    now: input.now,
    parameters: [],
    profileName: input.participantName,
    repository: input.repository,
    sourceModule: "HUT",
    templateName: env.WHATSAPP_HUT_COMPLETION_TEMPLATE ?? HUT_COMPLETION_TEMPLATE_NAME,
    toPhone: input.phone
  });
}

export function buildHutCompletionWhatsAppBody(): string {
  return [
    "Gracias por su apoyo y participacion.",
    "La persona que lo invito se pondra en contacto con usted para recibir su incentivo."
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
  const originValidation = validateHutWhatsAppPublicOrigin(input.link, env);
  if (!originValidation.ok) {
    return { code: "SKIPPED", message: HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN, ok: false };
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
