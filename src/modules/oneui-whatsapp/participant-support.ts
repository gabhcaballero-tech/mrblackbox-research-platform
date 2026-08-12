import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { DEFAULT_PUBLIC_APP_ORIGIN, resolveConfiguredPublicOrigin } from "@/shared/utils/request-origin";
import { createHutRepository } from "@/modules/hut/repository";
import {
  createNavigoAppRepository,
  type NavigoParticipantLinksWhatsAppSendResult
} from "@/modules/navigo-app/repository";
import { createOneuiWhatsAppRepository } from "./repository";
import {
  WHATSAPP_INVALID_PUBLIC_ORIGIN,
  WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG,
  publicOriginValidationAuditMetadata,
  sendHutParticipantLinkWhatsApp
} from "./templates";

type WhatsAppParticipantSupportPrismaClient = PrismaClientLike & {
  auditLog: {
    create: (input: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  hutParticipant: {
    findMany: (input: Record<string, unknown>) => Promise<unknown[]>;
    findUnique: (input: Record<string, unknown>) => Promise<unknown | null>;
  };
  studyParticipant: {
    findMany: (input: Record<string, unknown>) => Promise<unknown[]>;
  };
};

export type WhatsAppParticipantSupportSearchResult = {
  email: string | null;
  hutFolio: string | null;
  hutParticipantId: string | null;
  hutStatus: string | null;
  hutTokenAvailable: boolean;
  name: string;
  navFolio: string | null;
  navigoStatus: string;
  phone: string | null;
  studyId: string;
  studyName: string | null;
  studyParticipantId: string | null;
};

export type WhatsAppParticipantSupportSendKind = "BOTH" | "HUT" | "HUT_REMINDER" | "NAVIGO";

export type WhatsAppParticipantSupportSendResult =
  | {
      data: {
        generatedAtIso: string;
        hutUrl: string | null;
        message: string;
        navigoUrl: string | null;
        phone: string;
        sentKind: WhatsAppParticipantSupportSendKind;
        templateName: string;
        whatsappError: string | null;
        whatsappMessageId: string | null;
        whatsappStatus: "ENVIADO" | "ERROR";
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
      reason?: string | null;
    };

type WhatsAppParticipantSupportDependencies = {
  hutRepository?: ReturnType<typeof createHutRepository>;
  navigoRepository?: ReturnType<typeof createNavigoAppRepository>;
  now?: () => Date;
  prisma?: WhatsAppParticipantSupportPrismaClient;
  sendHutLink?: typeof sendHutParticipantLinkWhatsApp;
};

export function createWhatsAppParticipantSupportService(dependencies: WhatsAppParticipantSupportDependencies = {}) {
  async function getPrisma() {
    return dependencies.prisma ?? ((await createPrismaClient()) as WhatsAppParticipantSupportPrismaClient);
  }

  function getNow() {
    return dependencies.now?.() ?? new Date();
  }

  return {
    async searchParticipants(query: string): Promise<WhatsAppParticipantSupportSearchResult[]> {
      const normalized = query.trim();

      if (normalized.length < 2) {
        return [];
      }

      const prisma = await getPrisma();
      const searchablePhone = onlyDigits(normalized);
      const participantRows = await prisma.studyParticipant.findMany({
        orderBy: { createdAt: "desc" },
        select: studyParticipantSearchSelect,
        take: 15,
        where: {
          OR: [
            { participantConfirmation: { folio: { contains: normalized, mode: "insensitive" } } },
            { participantProfile: { name: { contains: normalized, mode: "insensitive" } } },
            { participantProfile: { email: { contains: normalized, mode: "insensitive" } } },
            ...(searchablePhone ? [{ participantProfile: { phone: { contains: searchablePhone } } }] : []),
            { hutParticipant: { folio: { contains: normalized, mode: "insensitive" } } }
          ]
        }
      });
      const hutRows = await prisma.hutParticipant.findMany({
        orderBy: { createdAt: "desc" },
        select: hutParticipantSearchSelect,
        take: 15,
        where: {
          OR: [
            { folio: { contains: normalized, mode: "insensitive" } },
            { name: { contains: normalized, mode: "insensitive" } },
            { email: { contains: normalized, mode: "insensitive" } },
            ...(searchablePhone ? [{ phone: { contains: searchablePhone } }] : [])
          ],
          studyParticipantId: null
        }
      });

      const results = [
        ...participantRows.map((row) => mapStudyParticipantSearchResult(row as StudyParticipantSearchRow)),
        ...hutRows.map((row) => mapHutParticipantSearchResult(row as HutParticipantSearchRow))
      ];
      const unique = new Map<string, WhatsAppParticipantSupportSearchResult>();

      for (const result of results) {
        unique.set(result.studyParticipantId ?? `hut:${result.hutParticipantId}`, result);
      }

      return Array.from(unique.values()).slice(0, 20);
    },

    async sendManualSupportMessage(input: {
      actorUserId: string;
      hutParticipantId?: string | null;
      reason: string;
      sendKind: WhatsAppParticipantSupportSendKind;
      studyId: string;
      studyParticipantId?: string | null;
    }): Promise<WhatsAppParticipantSupportSendResult> {
      const reason = input.reason.trim();

      if (!reason) {
        return { message: "Captura el motivo del envio.", ok: false };
      }

      if (input.sendKind === "HUT") {
        return sendHutLinkFromSelectedParticipant({
          actorUserId: input.actorUserId,
          hutParticipantId: input.hutParticipantId,
          now: getNow(),
          reason,
          sendHutLink: dependencies.sendHutLink,
          servicePrisma: await getPrisma(),
          studyId: input.studyId
        });
      }

      if (input.sendKind === "HUT_REMINDER") {
        const repository = dependencies.hutRepository ?? createHutRepository();
        const result = await repository.sendPhotoReminderWhatsApp({
          actorUserId: input.actorUserId,
          participantId: input.hutParticipantId ?? "",
          reason,
          requestOrigin: getStablePublicOrigin(),
          source: "MANUAL_SUPPORT",
          studyId: input.studyId
        });

        if (!result.ok) {
          return { message: result.message, ok: false };
        }

        return {
          data: {
            generatedAtIso: result.data.generatedAt.toISOString(),
            hutUrl: result.data.hutUrl,
            message: "Recordatorio HUT enviado desde soporte WhatsApp.",
            navigoUrl: null,
            phone: result.data.phone,
            sentKind: "HUT_REMINDER",
            templateName: result.data.templateName,
            whatsappError: result.data.whatsappError,
            whatsappMessageId: result.data.whatsappMessageId,
            whatsappStatus: result.data.whatsappStatus
          },
          ok: true
        };
      }

      if (!input.studyParticipantId) {
        return { message: "El participante seleccionado no tiene folio NAV para este envio.", ok: false };
      }

      let result: Awaited<ReturnType<ReturnType<typeof createNavigoAppRepository>["sendParticipantLinksWhatsApp"]>>;

      try {
        const repository = dependencies.navigoRepository ?? createNavigoAppRepository();
        result = await repository.sendParticipantLinksWhatsApp({
          actorUserId: input.actorUserId,
          linkType: input.sendKind,
          requestOrigin: getStablePublicOrigin(),
          studyId: input.studyId,
          studyParticipantId: input.studyParticipantId
        });
      } catch (error) {
        return supportFailure(
          "No se pudo enviar WhatsApp desde soporte.",
          readSupportFailureReason(error)
        );
      }

      if (!result.ok) {
        return supportFailure(result.message, readSupportFailureReason(result.message));
      }

      const auditResult = await safeAuditManualSupportSend({
        actorUserId: input.actorUserId,
        entityId: input.studyParticipantId,
        entityType: "StudyParticipant",
        hutUrl: result.data.hutUrl,
        navigoUrl: result.data.navigoUrl,
        now: getNow(),
        phone: result.data.phone,
        prisma: await getPrisma(),
        reason,
        sentKind: input.sendKind,
        templateName: templateNameForSendKind(result.data.sentLinkType),
        whatsappError: result.data.whatsappError,
        whatsappMessageId: result.data.whatsappMessageId,
        whatsappStatus: result.data.whatsappStatus
      });

      if (!auditResult.ok) {
        return supportFailure(auditResult.message, auditResult.reason);
      }

      if (result.data.whatsappStatus === "ERROR") {
        return supportFailure(
          "No se pudo enviar WhatsApp.",
          result.data.whatsappErrorReason ?? readSupportFailureReason(result.data.whatsappError)
        );
      }

      return {
        data: {
          generatedAtIso: result.data.generatedAt.toISOString(),
          hutUrl: result.data.hutUrl,
          message: supportSuccessMessage(result.data),
          navigoUrl: result.data.navigoUrl,
          phone: result.data.phone,
          sentKind: input.sendKind,
          templateName: templateNameForSendKind(result.data.sentLinkType),
          whatsappError: result.data.whatsappError,
          whatsappMessageId: result.data.whatsappMessageId,
          whatsappStatus: result.data.whatsappStatus
        },
        ok: true
      };
    }
  };
}

const studyParticipantSearchSelect = {
  accessTokens: {
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
    take: 1
  },
  activities: {
    select: {
      activitySchedule: { select: { code: true } },
      status: true
    }
  },
  hutParticipant: {
    select: {
      folio: true,
      id: true,
      protocolVersion: true,
      status: true,
      token: true
    }
  },
  id: true,
  operationalStatus: true,
  participantConfirmation: {
    select: { folio: true }
  },
  participantProfile: {
    select: {
      email: true,
      name: true,
      phone: true
    }
  },
  screeningStatus: true,
  study: {
    select: {
      id: true,
      name: true
    }
  },
  studyId: true
} as const;

const hutParticipantSearchSelect = {
  email: true,
  folio: true,
  id: true,
  name: true,
  origin: true,
  phone: true,
  protocolVersion: true,
  status: true,
  study: {
    select: {
      id: true,
      name: true
    }
  },
  studyId: true,
  token: true
} as const;

type StudyParticipantSearchRow = {
  accessTokens?: Array<{ id: string; status: string }>;
  activities?: Array<{ activitySchedule: { code: string }; status: string }>;
  hutParticipant: {
    folio: string | null;
    id: string;
    protocolVersion: string;
    status: string;
    token: string;
  } | null;
  id: string;
  operationalStatus: string;
  participantConfirmation: { folio: string } | null;
  participantProfile: {
    email: string | null;
    name: string;
    phone: string | null;
  };
  screeningStatus: string;
  study: { id: string; name: string | null };
  studyId: string;
};

type HutParticipantSearchRow = {
  email: string | null;
  folio: string | null;
  id: string;
  name: string;
  origin: string;
  phone: string | null;
  protocolVersion: string;
  status: string;
  study: { id: string; name: string | null };
  studyId: string;
  token: string;
};

async function sendHutLinkFromSelectedParticipant({
  actorUserId,
  hutParticipantId,
  now,
  reason,
  sendHutLink = sendHutParticipantLinkWhatsApp,
  servicePrisma,
  studyId
}: {
  actorUserId: string;
  hutParticipantId?: string | null;
  now: Date;
  reason: string;
  sendHutLink?: typeof sendHutParticipantLinkWhatsApp;
  servicePrisma: WhatsAppParticipantSupportPrismaClient;
  studyId: string;
}): Promise<WhatsAppParticipantSupportSendResult> {
  if (!hutParticipantId) {
    return { message: "El participante seleccionado no tiene enlace HUT.", ok: false };
  }

  const participant = (await servicePrisma.hutParticipant.findUnique({
    select: {
      id: true,
      name: true,
      phone: true,
      studyId: true,
      studyParticipant: {
        select: {
          participantProfile: {
            select: {
              name: true,
              phone: true
            }
          }
        }
      },
      token: true
    },
    where: { id: hutParticipantId }
  })) as {
    id: string;
    name: string;
    phone: string | null;
    studyId: string;
    studyParticipant: { participantProfile: { name: string; phone: string | null } } | null;
    token: string;
  } | null;

  if (!participant || participant.studyId !== studyId) {
    return { message: "No encontramos el participante HUT seleccionado.", ok: false };
  }

  const participantName = participant.studyParticipant?.participantProfile.name ?? participant.name;
  const phone = participant.studyParticipant?.participantProfile.phone ?? participant.phone;
  const hutUrl = new URL(`/hut/p/${encodeURIComponent(participant.token)}`, getStablePublicOrigin()).toString();
  const result = await sendHutLink({
    hutUrl,
    now,
    participantId: participant.id,
    participantName,
    phone,
    repository: createOneuiWhatsAppRepository(),
    studyId
  });
  const whatsAppMessage = result.ok ? result.data : "data" in result ? result.data : undefined;
  const whatsappStatus = result.ok ? "ENVIADO" : "ERROR";
  const whatsappError = result.ok ? null : result.message;

  const auditResult = await safeAuditManualSupportSend({
    actorUserId,
    entityId: participant.id,
    entityType: "HutParticipant",
    hutUrl,
    navigoUrl: null,
    now,
    phone: phone ?? "",
    prisma: servicePrisma,
    reason,
    sentKind: "HUT",
    templateName: "hut_link_participant",
    whatsappError,
    whatsappMessageId: whatsAppMessage?.metaMessageId ?? null,
    whatsappStatus
  });

  if (!auditResult.ok) {
    return supportFailure(auditResult.message, auditResult.reason);
  }

  if (whatsappStatus === "ERROR") {
    const failedResult = result as { code?: string; message?: string };
    return supportFailure(
      "No se pudo enviar WhatsApp.",
      failedResult.code ?? readSupportFailureReason(failedResult.message)
    );
  }

  return {
    data: {
      generatedAtIso: now.toISOString(),
      hutUrl,
      message: "Enlace HUT enviado desde soporte WhatsApp.",
      navigoUrl: null,
      phone: phone ?? "",
      sentKind: "HUT",
      templateName: "hut_link_participant",
      whatsappError,
      whatsappMessageId: whatsAppMessage?.metaMessageId ?? null,
      whatsappStatus
    },
    ok: true
  };
}

async function auditManualSupportSend({
  actorUserId,
  entityId,
  entityType,
  hutUrl,
  navigoUrl,
  now,
  phone,
  prisma,
  reason,
  sentKind,
  templateName,
  whatsappError,
  whatsappMessageId,
  whatsappStatus
}: {
  actorUserId: string;
  entityId: string;
  entityType: "HutParticipant" | "StudyParticipant";
  hutUrl: string | null;
  navigoUrl: string | null;
  now: Date;
  phone: string;
  prisma: WhatsAppParticipantSupportPrismaClient;
  reason: string;
  sentKind: WhatsAppParticipantSupportSendKind | "BOTH" | "HUT" | "NAVIGO";
  templateName: string;
  whatsappError: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
}) {
  const publicOriginAudit = publicOriginValidationAuditMetadata(hutUrl);

  await prisma.auditLog.create({
    data: {
      action: "PARTICIPANT_MODIFIED",
      actorUserId,
      afterJson: {
        deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
        deploymentUrl: process.env.VERCEL_URL ?? null,
        generatedHutUrl: hutUrl,
        generatedNavigoUrl: navigoUrl,
        hutUrlAvailable: Boolean(hutUrl),
        hutUrlDomain: hutUrl ? new URL(hutUrl).origin : null,
        linkDomain: hutUrl ? new URL(hutUrl).origin : navigoUrl ? new URL(navigoUrl).origin : null,
        linkTypeSent: sentKind,
        navigoUrlAvailable: Boolean(navigoUrl),
        phone,
        publicOriginDetected: publicOriginAudit.publicOriginDetected,
        publicOriginExpected: publicOriginAudit.publicOriginExpected,
        publicOriginFailureCode: whatsappStatus === "ERROR" ? publicOriginAudit.publicOriginFailureCode : null,
        publicOriginFailureMessage: whatsappStatus === "ERROR" ? publicOriginAudit.publicOriginFailureMessage : null,
        sentAtMexicoCity: formatDateTimeMexicoCity(now),
        source: "MANUAL_SUPPORT",
        templateName,
        whatsappError,
        whatsappMessageId,
        whatsappStatus
      },
      beforeJson: null,
      createdAt: now,
      entityId,
      entityType,
      reason
    }
  });
}

async function safeAuditManualSupportSend(
  input: Parameters<typeof auditManualSupportSend>[0]
): Promise<{ ok: true } | { message: string; ok: false; reason: string }> {
  try {
    await auditManualSupportSend(input);
    return { ok: true };
  } catch (error) {
    console.error("No se pudo registrar auditoria de envio manual WhatsApp.", error);
    return {
      message: "No se pudo registrar la auditoria del envio WhatsApp.",
      ok: false,
      reason: "AUDIT_LOG_FAILED"
    };
  }
}

function supportFailure(message: string, reason?: string | null): WhatsAppParticipantSupportSendResult {
  return {
    message,
    ok: false,
    reason: reason ?? null
  };
}

function readSupportFailureReason(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return knownSupportFailureReason(error);
  }

  if (error instanceof Error) {
    return knownSupportFailureReason(error.message);
  }

  if (typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }

  return null;
}

function knownSupportFailureReason(value: string): string | null {
  if (value.includes(WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG) || value.includes("No existe dominio publico configurado")) {
    return WHATSAPP_MISSING_PUBLIC_ORIGIN_CONFIG;
  }

  if (
    value.includes(WHATSAPP_INVALID_PUBLIC_ORIGIN) ||
    value.includes("HUT_WHATSAPP_INVALID_PUBLIC_ORIGIN") ||
    value.includes("El dominio generado no coincide")
  ) {
    return WHATSAPP_INVALID_PUBLIC_ORIGIN;
  }

  return null;
}

function mapStudyParticipantSearchResult(row: StudyParticipantSearchRow): WhatsAppParticipantSupportSearchResult {
  return {
    email: row.participantProfile.email,
    hutFolio: row.hutParticipant?.folio ?? null,
    hutParticipantId: row.hutParticipant?.id ?? null,
    hutStatus: row.hutParticipant ? `${row.hutParticipant.protocolVersion} / ${row.hutParticipant.status}` : null,
    hutTokenAvailable: Boolean(row.hutParticipant?.token),
    name: row.participantProfile.name,
    navFolio: row.participantConfirmation?.folio ?? null,
    navigoStatus: navigoStatusLabel(row),
    phone: row.participantProfile.phone,
    studyId: row.studyId,
    studyName: row.study.name,
    studyParticipantId: row.id
  };
}

function mapHutParticipantSearchResult(row: HutParticipantSearchRow): WhatsAppParticipantSupportSearchResult {
  return {
    email: row.email,
    hutFolio: row.folio,
    hutParticipantId: row.id,
    hutStatus: `${row.protocolVersion} / ${row.status}`,
    hutTokenAvailable: Boolean(row.token),
    name: row.name,
    navFolio: null,
    navigoStatus: "Sin NAV",
    phone: row.phone,
    studyId: row.studyId,
    studyName: row.study.name,
    studyParticipantId: null
  };
}

function navigoStatusLabel(row: StudyParticipantSearchRow): string {
  const total = row.activities?.length ?? 0;
  const completed = row.activities?.filter((activity) => activity.status === "COMPLETED").length ?? 0;
  const tokenActive = row.accessTokens?.some((token) => token.status === "ACTIVE") ?? false;

  if (total > 0) {
    return `${completed}/${total} actividades${tokenActive ? " / link activo" : ""}`;
  }

  return tokenActive ? "Link activo" : row.operationalStatus;
}

function getStablePublicOrigin() {
  return resolveConfiguredPublicOrigin() ?? DEFAULT_PUBLIC_APP_ORIGIN;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function templateNameForSendKind(sendKind: "BOTH" | "HUT" | "NAVIGO"): string {
  if (sendKind === "BOTH") {
    return "navigo_hut_links";
  }

  return sendKind === "HUT" ? "hut_link_participant" : "navigo_acceso_evaluaciones";
}

function supportSuccessMessage(data: NavigoParticipantLinksWhatsAppSendResult): string {
  const base = data.whatsappStatus === "ENVIADO"
    ? "Envio realizado desde soporte WhatsApp."
    : "Enlace preparado desde soporte WhatsApp. WhatsApp fallo; revisa el detalle.";

  if (data.warnings.length === 0) {
    return base;
  }

  return `${base} ${data.warnings.join(" ")}`;
}
