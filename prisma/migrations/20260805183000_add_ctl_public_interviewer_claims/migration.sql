-- CreateEnum
CREATE TYPE "CtlInterviewerCodeStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "ctl_sessions"
  ALTER COLUMN "interviewerId" DROP NOT NULL,
  ADD COLUMN "ctlInterviewerCodeId" UUID,
  ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ctl_interviewer_codes" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "CtlInterviewerCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctl_interviewer_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctl_interviewer_codes_codeHash_key" ON "ctl_interviewer_codes"("codeHash");

-- CreateIndex
CREATE INDEX "ctl_interviewer_codes_studyId_status_idx" ON "ctl_interviewer_codes"("studyId", "status");

-- CreateIndex
CREATE INDEX "ctl_interviewer_codes_createdByUserId_idx" ON "ctl_interviewer_codes"("createdByUserId");

-- CreateIndex
CREATE INDEX "ctl_sessions_ctlInterviewerCodeId_createdAt_idx" ON "ctl_sessions"("ctlInterviewerCodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ctl_sessions_one_open_per_participant_key"
  ON "ctl_sessions"("studyParticipantId")
  WHERE "status" IN ('PENDING', 'IN_PROGRESS');

-- AddConstraint
ALTER TABLE "ctl_sessions"
  ADD CONSTRAINT "ctl_sessions_exactly_one_actor_check"
  CHECK (
    ("interviewerId" IS NOT NULL AND "ctlInterviewerCodeId" IS NULL)
    OR
    ("interviewerId" IS NULL AND "ctlInterviewerCodeId" IS NOT NULL)
  );

-- AddForeignKey
ALTER TABLE "ctl_interviewer_codes" ADD CONSTRAINT "ctl_interviewer_codes_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_interviewer_codes" ADD CONSTRAINT "ctl_interviewer_codes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_sessions" ADD CONSTRAINT "ctl_sessions_ctlInterviewerCodeId_fkey" FOREIGN KEY ("ctlInterviewerCodeId") REFERENCES "ctl_interviewer_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
