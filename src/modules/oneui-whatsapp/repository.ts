import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

export type OneuiWhatsAppSourceModule = "GENERAL" | "NAVIGO" | "HUT" | "BLACK_BOX" | "OTHER";
export type OneuiWhatsAppMessageDirection = "INBOUND" | "OUTBOUND";

export type OneuiWhatsAppConversationRecord = {
  id: string;
  waId: string;
  phoneNumber: string;
  profileName: string | null;
  sourceModule: OneuiWhatsAppSourceModule;
  linkedStudyId: string | null;
  linkedParticipantId: string | null;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OneuiWhatsAppMessageRecord = {
  id: string;
  conversationId: string;
  metaMessageId: string | null;
  direction: OneuiWhatsAppMessageDirection;
  fromPhone: string;
  toPhone: string;
  messageType: string;
  bodyText: string | null;
  status: string | null;
  timestamp: Date | null;
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type OneuiWhatsAppStatusEventRecord = {
  id: string;
  messageId: string | null;
  metaMessageId: string;
  status: string;
  timestamp: Date | null;
  rawPayload: unknown;
  createdAt: Date;
};

export type OneuiWhatsAppConversationSummary = OneuiWhatsAppConversationRecord & {
  messages: OneuiWhatsAppMessageRecord[];
};

export type OneuiWhatsAppConversationDetail = OneuiWhatsAppConversationRecord & {
  messages: OneuiWhatsAppMessageRecord[];
};

export type UpsertInboundConversationInput = {
  lastInboundAt: Date | null;
  phoneNumber: string;
  profileName: string | null;
  waId: string;
};

export type UpsertOutboundConversationInput = {
  linkedParticipantId?: string | null;
  linkedStudyId?: string | null;
  phoneNumber: string;
  profileName?: string | null;
  sourceModule: OneuiWhatsAppSourceModule;
  waId: string;
};

export type SaveInboundMessageInput = {
  bodyText: string | null;
  conversationId: string;
  fromPhone: string;
  messageType: string;
  metaMessageId: string | null;
  rawPayload: unknown;
  timestamp: Date | null;
  toPhone: string;
};

export type SaveStatusEventInput = {
  metaMessageId: string;
  rawPayload: unknown;
  status: string;
  timestamp: Date | null;
};

export type CreateOutboundMessageInput = {
  bodyText: string;
  conversationId: string;
  fromPhone: string;
  messageType?: string;
  rawPayload: unknown;
  timestamp: Date;
  toPhone: string;
};

export type MarkOutboundMessageAcceptedInput = {
  messageId: string;
  metaMessageId: string | null;
  rawPayload: unknown;
  status: string;
  timestamp: Date;
};

export type MarkOutboundMessageFailedInput = {
  messageId: string;
  rawPayload: unknown;
  status: string;
};

export type OneuiWhatsAppRepository = {
  createOutboundMessage: (input: CreateOutboundMessageInput) => Promise<OneuiWhatsAppMessageRecord>;
  findLatestOutboundTemplateMessage: (input: {
    linkedParticipantId: string;
    linkedStudyId: string;
    sourceModule: OneuiWhatsAppSourceModule;
  }) => Promise<OneuiWhatsAppMessageRecord | null>;
  getConversationWithMessages: (conversationId: string) => Promise<OneuiWhatsAppConversationDetail | null>;
  listConversations: () => Promise<OneuiWhatsAppConversationSummary[]>;
  markOutboundMessageAccepted: (input: MarkOutboundMessageAcceptedInput) => Promise<OneuiWhatsAppMessageRecord>;
  markOutboundMessageFailed: (input: MarkOutboundMessageFailedInput) => Promise<OneuiWhatsAppMessageRecord>;
  saveInboundMessage: (input: SaveInboundMessageInput) => Promise<OneuiWhatsAppMessageRecord>;
  saveStatusEvent: (input: SaveStatusEventInput) => Promise<OneuiWhatsAppStatusEventRecord>;
  upsertInboundConversation: (input: UpsertInboundConversationInput) => Promise<OneuiWhatsAppConversationRecord>;
  upsertOutboundConversation: (input: UpsertOutboundConversationInput) => Promise<OneuiWhatsAppConversationRecord>;
};

type PrismaConversationDelegate = {
  findMany: (args: unknown) => Promise<OneuiWhatsAppConversationSummary[]>;
  findUnique: (args: unknown) => Promise<OneuiWhatsAppConversationDetail | null>;
  update: (args: unknown) => Promise<OneuiWhatsAppConversationRecord>;
  upsert: (args: unknown) => Promise<OneuiWhatsAppConversationRecord>;
};

type PrismaMessageDelegate = {
  create: (args: unknown) => Promise<OneuiWhatsAppMessageRecord>;
  findUnique: (args: unknown) => Promise<OneuiWhatsAppMessageRecord | null>;
  update: (args: unknown) => Promise<OneuiWhatsAppMessageRecord>;
  upsert: (args: unknown) => Promise<OneuiWhatsAppMessageRecord>;
};

type PrismaStatusEventDelegate = {
  create: (args: unknown) => Promise<OneuiWhatsAppStatusEventRecord>;
};

type OneuiWhatsAppPrismaClient = PrismaClientLike & {
  oneuiWhatsAppConversation: PrismaConversationDelegate;
  oneuiWhatsAppMessage: PrismaMessageDelegate;
  oneuiWhatsAppMessageStatusEvent: PrismaStatusEventDelegate;
};

const conversationSelect = {
  createdAt: true,
  id: true,
  lastInboundAt: true,
  lastMessageAt: true,
  lastOutboundAt: true,
  linkedParticipantId: true,
  linkedStudyId: true,
  phoneNumber: true,
  profileName: true,
  sourceModule: true,
  updatedAt: true,
  waId: true
} as const;

const messageSelect = {
  bodyText: true,
  conversationId: true,
  createdAt: true,
  direction: true,
  fromPhone: true,
  id: true,
  messageType: true,
  metaMessageId: true,
  rawPayload: true,
  status: true,
  timestamp: true,
  toPhone: true,
  updatedAt: true
} as const;

const statusEventSelect = {
  createdAt: true,
  id: true,
  messageId: true,
  metaMessageId: true,
  rawPayload: true,
  status: true,
  timestamp: true
} as const;

export function createOneuiWhatsAppRepository(
  prismaClient?: OneuiWhatsAppPrismaClient
): OneuiWhatsAppRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as OneuiWhatsAppPrismaClient);
  }

  return {
    async createOutboundMessage(input) {
      const prisma = await getPrisma();

      return prisma.oneuiWhatsAppMessage.create({
        data: {
          bodyText: input.bodyText,
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          fromPhone: input.fromPhone,
          messageType: input.messageType ?? "text",
          metaMessageId: null,
          rawPayload: input.rawPayload,
          status: "pending",
          timestamp: input.timestamp,
          toPhone: input.toPhone
        },
        select: messageSelect
      });
    },
    async findLatestOutboundTemplateMessage(input) {
      const prisma = await getPrisma();
      const conversations = await prisma.oneuiWhatsAppConversation.findMany({
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
        select: {
          ...conversationSelect,
          messages: {
            orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
            select: messageSelect,
            take: 1,
            where: {
              direction: "OUTBOUND",
              messageType: "template"
            }
          }
        },
        take: 1,
        where: {
          linkedParticipantId: input.linkedParticipantId,
          linkedStudyId: input.linkedStudyId,
          sourceModule: input.sourceModule
        }
      });

      return conversations[0]?.messages[0] ?? null;
    },
    async getConversationWithMessages(conversationId) {
      const prisma = await getPrisma();

      return prisma.oneuiWhatsAppConversation.findUnique({
        select: {
          ...conversationSelect,
          messages: {
            orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }],
            select: messageSelect
          }
        },
        where: { id: conversationId }
      });
    },
    async listConversations() {
      const prisma = await getPrisma();

      return prisma.oneuiWhatsAppConversation.findMany({
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
        select: {
          ...conversationSelect,
          messages: {
            orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
            select: messageSelect,
            take: 1
          }
        },
        take: 100
      });
    },
    async markOutboundMessageAccepted(input) {
      const prisma = await getPrisma();
      const message = await prisma.oneuiWhatsAppMessage.update({
        data: {
          metaMessageId: input.metaMessageId,
          rawPayload: input.rawPayload,
          status: input.status,
          timestamp: input.timestamp
        },
        select: messageSelect,
        where: { id: input.messageId }
      });

      await prisma.oneuiWhatsAppConversation.update({
        data: {
          lastMessageAt: input.timestamp,
          lastOutboundAt: input.timestamp
        },
        select: conversationSelect,
        where: { id: message.conversationId }
      });

      return message;
    },
    async markOutboundMessageFailed(input) {
      const prisma = await getPrisma();

      return prisma.oneuiWhatsAppMessage.update({
        data: {
          rawPayload: input.rawPayload,
          status: input.status
        },
        select: messageSelect,
        where: { id: input.messageId }
      });
    },
    async saveInboundMessage(input) {
      const prisma = await getPrisma();
      const data = {
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        direction: "INBOUND" as const,
        fromPhone: input.fromPhone,
        messageType: input.messageType,
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: null,
        timestamp: input.timestamp,
        toPhone: input.toPhone
      };

      if (!input.metaMessageId) {
        return prisma.oneuiWhatsAppMessage.create({
          data,
          select: messageSelect
        });
      }

      return prisma.oneuiWhatsAppMessage.upsert({
        create: data,
        select: messageSelect,
        update: {
          bodyText: input.bodyText,
          fromPhone: input.fromPhone,
          messageType: input.messageType,
          rawPayload: input.rawPayload,
          timestamp: input.timestamp,
          toPhone: input.toPhone
        },
        where: { metaMessageId: input.metaMessageId }
      });
    },
    async saveStatusEvent(input) {
      const prisma = await getPrisma();
      const message = await prisma.oneuiWhatsAppMessage.findUnique({
        select: messageSelect,
        where: { metaMessageId: input.metaMessageId }
      });

      if (message) {
        await prisma.oneuiWhatsAppMessage.update({
          data: { status: input.status },
          select: messageSelect,
          where: { id: message.id }
        });
      }

      return prisma.oneuiWhatsAppMessageStatusEvent.create({
        data: {
          messageId: message?.id ?? null,
          metaMessageId: input.metaMessageId,
          rawPayload: input.rawPayload,
          status: input.status,
          timestamp: input.timestamp
        },
        select: statusEventSelect
      });
    },
    async upsertInboundConversation(input) {
      const prisma = await getPrisma();
      const lastMessageAt = input.lastInboundAt;

      return prisma.oneuiWhatsAppConversation.upsert({
        create: {
          lastInboundAt: input.lastInboundAt,
          lastMessageAt,
          phoneNumber: input.phoneNumber,
          profileName: input.profileName,
          sourceModule: "GENERAL",
          waId: input.waId
        },
        select: conversationSelect,
        update: {
          lastInboundAt: input.lastInboundAt,
          lastMessageAt,
          phoneNumber: input.phoneNumber,
          profileName: input.profileName ?? undefined
        },
        where: { waId: input.waId }
      });
    },
    async upsertOutboundConversation(input) {
      const prisma = await getPrisma();

      return prisma.oneuiWhatsAppConversation.upsert({
        create: {
          linkedParticipantId: input.linkedParticipantId ?? null,
          linkedStudyId: input.linkedStudyId ?? null,
          phoneNumber: input.phoneNumber,
          profileName: input.profileName ?? null,
          sourceModule: input.sourceModule,
          waId: input.waId
        },
        select: conversationSelect,
        update: {
          linkedParticipantId: input.linkedParticipantId ?? undefined,
          linkedStudyId: input.linkedStudyId ?? undefined,
          phoneNumber: input.phoneNumber,
          profileName: input.profileName ?? undefined,
          sourceModule: input.sourceModule
        },
        where: { waId: input.waId }
      });
    }
  };
}
