-- CreateEnum
CREATE TYPE "HutParticipantStatus" AS ENUM ('NOT_STARTED', 'BLOCK_1_IN_PROGRESS', 'BLOCK_1_CALL_PENDING', 'BLOCK_2_IN_PROGRESS', 'BLOCK_2_CALL_PENDING', 'COMPLETED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "HutBlockStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'CALL_PENDING', 'COMPLETED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "HutVideoSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HutDailyCheckStatus" AS ENUM ('COMPLETED', 'MISSED', 'REMINDER_PENDING', 'REMINDER_SENT', 'NO_ACTIVITY_REQUIRED');

-- CreateEnum
CREATE TYPE "HutCallEvaluationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'NO_ANSWER', 'RESCHEDULE_NEEDED');

-- CreateTable
CREATE TABLE "hut_participants" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "recruiter" TEXT,
    "token" TEXT NOT NULL,
    "status" "HutParticipantStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" TIMESTAMP(3),
    "currentBlockNumber" INTEGER NOT NULL DEFAULT 1,
    "currentVideoSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_blocks" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "status" "HutBlockStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "requiredVideos" INTEGER NOT NULL DEFAULT 3,
    "submittedVideosCount" INTEGER NOT NULL DEFAULT 0,
    "missedDaysCount" INTEGER NOT NULL DEFAULT 0,
    "maxMissedDaysAllowed" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "disqualificationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_video_submissions" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageBucket" TEXT NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "HutVideoSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_video_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_daily_checks" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockDayNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "expectedVideoSequence" INTEGER NOT NULL,
    "status" "HutDailyCheckStatus" NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_daily_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_call_evaluations" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "status" "HutCallEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "evaluatorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_call_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hut_participants_token_key" ON "hut_participants"("token");

-- CreateIndex
CREATE INDEX "hut_participants_studyId_status_idx" ON "hut_participants"("studyId", "status");

-- CreateIndex
CREATE INDEX "hut_participants_token_idx" ON "hut_participants"("token");

-- CreateIndex
CREATE UNIQUE INDEX "hut_blocks_participantId_blockNumber_key" ON "hut_blocks"("participantId", "blockNumber");

-- CreateIndex
CREATE INDEX "hut_blocks_status_idx" ON "hut_blocks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hut_video_submissions_privateStorageKey_key" ON "hut_video_submissions"("privateStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "hut_video_submissions_blockId_sequenceNumber_key" ON "hut_video_submissions"("blockId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "hut_video_submissions_participantId_submittedAt_idx" ON "hut_video_submissions"("participantId", "submittedAt");

-- CreateIndex
CREATE INDEX "hut_video_submissions_blockId_status_idx" ON "hut_video_submissions"("blockId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hut_daily_checks_blockId_blockDayNumber_key" ON "hut_daily_checks"("blockId", "blockDayNumber");

-- CreateIndex
CREATE INDEX "hut_daily_checks_participantId_date_idx" ON "hut_daily_checks"("participantId", "date");

-- CreateIndex
CREATE INDEX "hut_daily_checks_status_idx" ON "hut_daily_checks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hut_call_evaluations_participantId_blockNumber_key" ON "hut_call_evaluations"("participantId", "blockNumber");

-- CreateIndex
CREATE INDEX "hut_call_evaluations_status_idx" ON "hut_call_evaluations"("status");

-- AddForeignKey
ALTER TABLE "hut_participants" ADD CONSTRAINT "hut_participants_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_blocks" ADD CONSTRAINT "hut_blocks_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_video_submissions" ADD CONSTRAINT "hut_video_submissions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_video_submissions" ADD CONSTRAINT "hut_video_submissions_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "hut_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_daily_checks" ADD CONSTRAINT "hut_daily_checks_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_daily_checks" ADD CONSTRAINT "hut_daily_checks_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "hut_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_call_evaluations" ADD CONSTRAINT "hut_call_evaluations_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
