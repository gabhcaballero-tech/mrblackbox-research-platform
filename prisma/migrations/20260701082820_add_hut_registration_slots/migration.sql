-- CreateEnum
CREATE TYPE "HutRegistrationSlotStatus" AS ENUM ('AVAILABLE', 'REGISTERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "hut_participants"
ADD COLUMN "folio" TEXT,
ADD COLUMN "firstFragranceLeftArm" TEXT,
ADD COLUMN "secondFragranceRightArm" TEXT;

-- CreateTable
CREATE TABLE "hut_registration_slots" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "folio" TEXT NOT NULL,
    "registrationToken" TEXT NOT NULL,
    "participantId" UUID,
    "firstFragranceLeftArm" TEXT NOT NULL,
    "secondFragranceRightArm" TEXT NOT NULL,
    "status" "HutRegistrationSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_registration_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hut_participants_studyId_folio_key" ON "hut_participants"("studyId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "hut_registration_slots_registrationToken_key" ON "hut_registration_slots"("registrationToken");

-- CreateIndex
CREATE UNIQUE INDEX "hut_registration_slots_participantId_key" ON "hut_registration_slots"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "hut_registration_slots_studyId_folio_key" ON "hut_registration_slots"("studyId", "folio");

-- CreateIndex
CREATE INDEX "hut_registration_slots_studyId_status_idx" ON "hut_registration_slots"("studyId", "status");

-- CreateIndex
CREATE INDEX "hut_registration_slots_participantId_idx" ON "hut_registration_slots"("participantId");

-- AddForeignKey
ALTER TABLE "hut_registration_slots" ADD CONSTRAINT "hut_registration_slots_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_registration_slots" ADD CONSTRAINT "hut_registration_slots_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
