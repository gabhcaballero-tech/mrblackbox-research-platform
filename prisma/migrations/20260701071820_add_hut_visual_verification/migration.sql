-- CreateEnum
CREATE TYPE "HutVisualVerificationStatus" AS ENUM ('PENDING', 'MATCHED', 'NOT_MATCHED', 'UNCERTAIN', 'PENDING_REVIEW', 'NOT_REQUIRED_BY_OVERRIDE');

-- AlterTable
ALTER TABLE "hut_participants"
ADD COLUMN "visualOverrideEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "visualOverrideReason" TEXT,
ADD COLUMN "visualOverrideByUserId" UUID,
ADD COLUMN "visualOverrideAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hut_reference_selfies" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedByUserId" UUID,
    "capturedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_reference_selfies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_visual_verifications" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "videoSubmissionId" UUID,
    "blockNumber" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "verificationDate" TIMESTAMP(3) NOT NULL,
    "referenceSelfieKey" TEXT NOT NULL,
    "attemptSelfieKey" TEXT NOT NULL,
    "attemptStorageBucket" TEXT NOT NULL,
    "attemptOriginalFilename" TEXT,
    "attemptMimeType" TEXT NOT NULL,
    "attemptExtension" TEXT NOT NULL,
    "attemptSizeBytes" INTEGER NOT NULL,
    "status" "HutVisualVerificationStatus" NOT NULL,
    "similarityScore" DOUBLE PRECISION,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_visual_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hut_participants_visualOverrideByUserId_idx" ON "hut_participants"("visualOverrideByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "hut_reference_selfies_participantId_key" ON "hut_reference_selfies"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "hut_reference_selfies_privateStorageKey_key" ON "hut_reference_selfies"("privateStorageKey");

-- CreateIndex
CREATE INDEX "hut_reference_selfies_capturedByUserId_idx" ON "hut_reference_selfies"("capturedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "hut_visual_verifications_videoSubmissionId_key" ON "hut_visual_verifications"("videoSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "hut_visual_verifications_attemptSelfieKey_key" ON "hut_visual_verifications"("attemptSelfieKey");

-- CreateIndex
CREATE UNIQUE INDEX "hut_visual_verifications_participantId_blockNumber_sequenceNumber_key" ON "hut_visual_verifications"("participantId", "blockNumber", "sequenceNumber");

-- CreateIndex
CREATE INDEX "hut_visual_verifications_blockId_status_idx" ON "hut_visual_verifications"("blockId", "status");

-- CreateIndex
CREATE INDEX "hut_visual_verifications_reviewedByUserId_idx" ON "hut_visual_verifications"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "hut_participants" ADD CONSTRAINT "hut_participants_visualOverrideByUserId_fkey" FOREIGN KEY ("visualOverrideByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_reference_selfies" ADD CONSTRAINT "hut_reference_selfies_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_reference_selfies" ADD CONSTRAINT "hut_reference_selfies_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_visual_verifications" ADD CONSTRAINT "hut_visual_verifications_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_visual_verifications" ADD CONSTRAINT "hut_visual_verifications_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "hut_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_visual_verifications" ADD CONSTRAINT "hut_visual_verifications_videoSubmissionId_fkey" FOREIGN KEY ("videoSubmissionId") REFERENCES "hut_video_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_visual_verifications" ADD CONSTRAINT "hut_visual_verifications_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
