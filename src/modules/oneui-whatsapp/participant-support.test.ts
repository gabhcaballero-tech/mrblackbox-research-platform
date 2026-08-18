import { describe, expect, it, vi } from "vitest";
import { createWhatsAppParticipantSupportService } from "./participant-support";
import { V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE } from "./service";
import { WHATSAPP_INVALID_PUBLIC_ORIGIN } from "./templates";

describe("WhatsApp participant support", () => {
  it("busca participantes por folio NAV", async () => {
    const prisma = createPrismaMock({
      studyParticipants: [
        createStudyParticipantSearchRow({
          confirmationFolio: "NAV-003",
          name: "Participante NAV"
        })
      ]
    });
    const service = createWhatsAppParticipantSupportService({ prisma });

    const results = await service.searchParticipants("NAV-003");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Participante NAV",
      navFolio: "NAV-003",
      studyParticipantId: "study-participant-1"
    });
  });

  it("busca participantes HUT directos por telefono", async () => {
    const prisma = createPrismaMock({
      hutParticipants: [
        createHutParticipantSearchRow({
          folio: "HUT-121",
          phone: "+525579347433"
        })
      ]
    });
    const service = createWhatsAppParticipantSupportService({ prisma });

    const results = await service.searchParticipants("5579347433");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      hutFolio: "HUT-121",
      hutParticipantId: "hut-participant-1",
      navFolio: null
    });
  });

  it("envia enlace HUT usando token del HutParticipant seleccionado y dominio produccion", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const sendHutLink = vi.fn().mockResolvedValue({
      data: {
        metaMessageId: "wamid.hut-1"
      },
      ok: true
    });
    const prisma = createPrismaMock({
      auditCreate,
      hutParticipantById: {
        id: "hut-participant-1",
        name: "Participante HUT",
        phone: "+525579347433",
        studyId: "study-1",
        studyParticipant: null,
        token: "hut-token-abc"
      }
    });
    const service = createWhatsAppParticipantSupportService({
      now: () => new Date("2026-08-10T21:00:00.000Z"),
      prisma,
      sendHutLink
    });

    const result = await service.sendManualSupportMessage({
      actorUserId: "admin-1",
      hutParticipantId: "hut-participant-1",
      reason: "Soporte manual",
      sendKind: "HUT",
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(sendHutLink).toHaveBeenCalledWith(
      expect.objectContaining({
        hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token-abc",
        participantId: "hut-participant-1",
        participantName: "Participante HUT",
        phone: "+525579347433"
      })
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        entityId: "hut-participant-1",
        entityType: "HutParticipant",
        reason: "Soporte manual",
        afterJson: expect.objectContaining({
          linkDomain: "https://mrblackbox-research-platform.vercel.app",
          source: "MANUAL_SUPPORT",
          templateName: "hut_link_participant"
        })
      })
    });
  });

  it("bloquea envios manuales de soporte cuando V1 esta desactivado", async () => {
    vi.stubEnv("WHATSAPP_AUTOMATION_ENABLED", "false");
    const sendParticipantLinksWhatsApp = vi.fn();
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = createPrismaMock({ auditCreate });
    const service = createWhatsAppParticipantSupportService({
      navigoRepository: { sendParticipantLinksWhatsApp } as never,
      prisma
    });

    const result = await service.sendManualSupportMessage({
      actorUserId: "admin-1",
      reason: "Soporte manual",
      sendKind: "BOTH",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result).toEqual({
      message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
      ok: false,
      reason: "AUTOMATION_DISABLED"
    });
    expect(sendParticipantLinksWhatsApp).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("envia Navigo con origen estable de produccion para el participante seleccionado", async () => {
    const sendParticipantLinksWhatsApp = vi.fn().mockResolvedValue({
      data: {
        folio: "NAV-003",
        generatedAt: new Date("2026-08-10T21:00:00.000Z"),
        hutUrl: null,
        navigoUrl: "https://mrblackbox-research-platform.vercel.app/p/token/activities",
        phone: "+525579347433",
        requestedLinkType: "NAVIGO",
        sentLinkType: "NAVIGO",
        warnings: [],
        whatsappError: null,
        whatsappMessageId: "wamid.navigo-1",
        whatsappStatus: "ENVIADO"
      },
      ok: true
    });
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = createPrismaMock({ auditCreate });
    const service = createWhatsAppParticipantSupportService({
      navigoRepository: { sendParticipantLinksWhatsApp } as never,
      now: () => new Date("2026-08-10T21:00:00.000Z"),
      prisma
    });

    const result = await service.sendManualSupportMessage({
      actorUserId: "admin-1",
      reason: "Soporte manual",
      sendKind: "NAVIGO",
      studyId: "study-1",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok).toBe(true);
    expect(sendParticipantLinksWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        linkType: "NAVIGO",
        requestOrigin: "https://mrblackbox-research-platform.vercel.app",
        studyId: "study-1",
        studyParticipantId: "study-participant-1"
      })
    );
  });

  it("devuelve error controlado cuando enviar ambos enlaces es bloqueado por dominio publico", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://expected.example.com");
    const sendParticipantLinksWhatsApp = vi.fn().mockResolvedValue({
      data: {
        folio: "NAV-137",
        generatedAt: new Date("2026-08-12T22:15:00.000Z"),
        hutUrl: "https://mrblackbox-research-platform.vercel.app/hut/p/hut-token",
        navigoUrl: "https://mrblackbox-research-platform.vercel.app/p/navigo-token/activities",
        phone: "+525585178901",
        requestedLinkType: "BOTH",
        sentLinkType: "BOTH",
        warnings: [],
        whatsappError: "El dominio generado no coincide con el dominio publico permitido.",
        whatsappErrorReason: WHATSAPP_INVALID_PUBLIC_ORIGIN,
        whatsappMessageId: null,
        whatsappStatus: "ERROR"
      },
      ok: true
    });
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = createPrismaMock({ auditCreate });
    const service = createWhatsAppParticipantSupportService({
      navigoRepository: { sendParticipantLinksWhatsApp } as never,
      now: () => new Date("2026-08-12T22:15:00.000Z"),
      prisma
    });

    const result = await service.sendManualSupportMessage({
      actorUserId: "admin-1",
      reason: "Soporte manual",
      sendKind: "BOTH",
      studyId: "study-1",
      studyParticipantId: "study-participant-137"
    });

    expect(result).toMatchObject({
      message: "No se pudo enviar WhatsApp.",
      ok: false,
      reason: WHATSAPP_INVALID_PUBLIC_ORIGIN
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        entityId: "study-participant-137",
        entityType: "StudyParticipant",
        afterJson: expect.objectContaining({
          publicOriginFailureCode: WHATSAPP_INVALID_PUBLIC_ORIGIN,
          source: "MANUAL_SUPPORT",
          templateName: "navigo_hut_links",
          whatsappError: "El dominio generado no coincide con el dominio publico permitido.",
          whatsappStatus: "ERROR"
        })
      })
    });
    vi.unstubAllEnvs();
  });
});

function createPrismaMock({
  auditCreate = vi.fn().mockResolvedValue({}),
  hutParticipantById = null,
  hutParticipants = [],
  studyParticipants = []
}: {
  auditCreate?: ReturnType<typeof vi.fn>;
  hutParticipantById?: unknown;
  hutParticipants?: unknown[];
  studyParticipants?: unknown[];
} = {}) {
  return {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    auditLog: {
      create: auditCreate
    },
    hutParticipant: {
      findMany: vi.fn().mockResolvedValue(hutParticipants),
      findUnique: vi.fn().mockResolvedValue(hutParticipantById)
    },
    studyParticipant: {
      findMany: vi.fn().mockResolvedValue(studyParticipants)
    }
  } as never;
}

function createStudyParticipantSearchRow({
  confirmationFolio = "NAV-001",
  hutFolio = "HUT-001",
  name = "Participante Uno",
  phone = "+525512345678"
}: {
  confirmationFolio?: string;
  hutFolio?: string | null;
  name?: string;
  phone?: string | null;
} = {}) {
  return {
    accessTokens: [{ id: "token-1", status: "ACTIVE" }],
    activities: [{ activitySchedule: { code: "T3_HORAS" }, status: "PENDING" }],
    hutParticipant: hutFolio
      ? {
          folio: hutFolio,
          id: "hut-participant-1",
          protocolVersion: "APPLICATION_PHOTO",
          status: "NOT_STARTED",
          token: "hut-token-1"
        }
      : null,
    id: "study-participant-1",
    operationalStatus: "CREATED",
    participantConfirmation: {
      folio: confirmationFolio
    },
    participantProfile: {
      email: "participante@example.com",
      name,
      phone
    },
    screeningStatus: "PASSED",
    study: {
      id: "study-1",
      name: "FMASCULINA-NAVIGO-2026"
    },
    studyId: "study-1"
  };
}

function createHutParticipantSearchRow({
  folio = "HUT-001",
  name = "Participante HUT",
  phone = "+525512345678"
}: {
  folio?: string;
  name?: string;
  phone?: string | null;
} = {}) {
  return {
    email: "hut@example.com",
    folio,
    id: "hut-participant-1",
    name,
    origin: "HUT_DIRECTO",
    phone,
    protocolVersion: "APPLICATION_PHOTO",
    status: "NOT_STARTED",
    study: {
      id: "study-1",
      name: "FMASCULINA-NAVIGO-2026"
    },
    studyId: "study-1",
    token: "hut-token-1"
  };
}
