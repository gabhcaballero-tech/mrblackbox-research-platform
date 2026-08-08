-- CreateEnum
CREATE TYPE "HutParticipantOrigin" AS ENUM ('HUT_DIRECTO', 'CLT_HUT');

-- CreateEnum
CREATE TYPE "HutProtocolVersion" AS ENUM ('LEGACY_VIDEO', 'APPLICATION_PHOTO');

-- AlterTable
ALTER TABLE "hut_participants"
ADD COLUMN "origin" "HutParticipantOrigin" NOT NULL DEFAULT 'HUT_DIRECTO',
ADD COLUMN "protocolVersion" "HutProtocolVersion" NOT NULL DEFAULT 'LEGACY_VIDEO';

-- CreateTable
CREATE TABLE "hut_application_evidence" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "phase" "HutPhase" NOT NULL,
    "productCode" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageBucket" TEXT NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_application_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hut_application_evidence_privateStorageKey_key" ON "hut_application_evidence"("privateStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "hut_application_evidence_participantId_phase_key" ON "hut_application_evidence"("participantId", "phase");

-- CreateIndex
CREATE INDEX "hut_application_evidence_participantId_capturedAt_idx" ON "hut_application_evidence"("participantId", "capturedAt");

-- CreateIndex
CREATE INDEX "hut_application_evidence_phase_idx" ON "hut_application_evidence"("phase");

-- CreateIndex
CREATE INDEX "hut_participants_studyId_origin_idx" ON "hut_participants"("studyId", "origin");

-- CreateIndex
CREATE INDEX "hut_participants_studyId_protocolVersion_idx" ON "hut_participants"("studyId", "protocolVersion");

-- AddForeignKey
ALTER TABLE "hut_application_evidence" ADD CONSTRAINT "hut_application_evidence_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
