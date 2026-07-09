-- CreateEnum
CREATE TYPE "OneuiWhatsAppSourceModule" AS ENUM ('GENERAL', 'NAVIGO', 'HUT', 'BLACK_BOX', 'OTHER');

-- CreateEnum
CREATE TYPE "OneuiWhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "oneui_whatsapp_conversations" (
    "id" UUID NOT NULL,
    "waId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "profileName" TEXT,
    "sourceModule" "OneuiWhatsAppSourceModule" NOT NULL DEFAULT 'GENERAL',
    "linkedStudyId" UUID,
    "linkedParticipantId" UUID,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oneui_whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneui_whatsapp_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "metaMessageId" TEXT,
    "direction" "OneuiWhatsAppMessageDirection" NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "bodyText" TEXT,
    "status" TEXT,
    "timestamp" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oneui_whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneui_whatsapp_message_status_events" (
    "id" UUID NOT NULL,
    "messageId" UUID,
    "metaMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oneui_whatsapp_message_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oneui_whatsapp_conversations_waId_key" ON "oneui_whatsapp_conversations"("waId");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_conversations_sourceModule_lastMessageAt_idx" ON "oneui_whatsapp_conversations"("sourceModule", "lastMessageAt");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_conversations_linkedStudyId_idx" ON "oneui_whatsapp_conversations"("linkedStudyId");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_conversations_linkedParticipantId_idx" ON "oneui_whatsapp_conversations"("linkedParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "oneui_whatsapp_messages_metaMessageId_key" ON "oneui_whatsapp_messages"("metaMessageId");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_messages_conversationId_timestamp_idx" ON "oneui_whatsapp_messages"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_messages_direction_timestamp_idx" ON "oneui_whatsapp_messages"("direction", "timestamp");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_messages_status_idx" ON "oneui_whatsapp_messages"("status");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_message_status_events_messageId_timestamp_idx" ON "oneui_whatsapp_message_status_events"("messageId", "timestamp");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_message_status_events_metaMessageId_timestamp_idx" ON "oneui_whatsapp_message_status_events"("metaMessageId", "timestamp");

-- CreateIndex
CREATE INDEX "oneui_whatsapp_message_status_events_status_idx" ON "oneui_whatsapp_message_status_events"("status");

-- AddForeignKey
ALTER TABLE "oneui_whatsapp_messages" ADD CONSTRAINT "oneui_whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "oneui_whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oneui_whatsapp_message_status_events" ADD CONSTRAINT "oneui_whatsapp_message_status_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "oneui_whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
