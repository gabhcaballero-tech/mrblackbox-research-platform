-- CreateEnum
CREATE TYPE "HutPhase" AS ENUM ('COLOCACION', 'REGRESO_1', 'REGRESO_2');

-- CreateEnum
CREATE TYPE "HutPhaseCodeStatus" AS ENUM ('GENERATED', 'SENT', 'VALIDATED', 'USED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "hut_participant_phase_codes" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "phase" "HutPhase" NOT NULL,
    "slot" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "encryptedCode" TEXT NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "HutPhaseCodeStatus" NOT NULL DEFAULT 'GENERATED',
    "sentAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_participant_phase_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hut_participant_phase_codes_codeHash_key" ON "hut_participant_phase_codes"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "hut_participant_phase_codes_participantId_phase_key" ON "hut_participant_phase_codes"("participantId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "hut_participant_phase_codes_participantId_slot_key" ON "hut_participant_phase_codes"("participantId", "slot");

-- CreateIndex
CREATE INDEX "hut_participant_phase_codes_participantId_status_idx" ON "hut_participant_phase_codes"("participantId", "status");

-- CreateIndex
CREATE INDEX "hut_participant_phase_codes_phase_status_idx" ON "hut_participant_phase_codes"("phase", "status");

-- AddForeignKey
ALTER TABLE "hut_participant_phase_codes" ADD CONSTRAINT "hut_participant_phase_codes_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
