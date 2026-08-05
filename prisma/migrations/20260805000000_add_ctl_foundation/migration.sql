-- CreateEnum
CREATE TYPE "CtlSessionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ctl_sessions" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "screeningAttemptId" UUID,
    "interviewerId" UUID NOT NULL,
    "status" "CtlSessionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctl_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctl_answers" (
    "id" UUID NOT NULL,
    "ctlSessionId" UUID NOT NULL,
    "questionCode" TEXT NOT NULL,
    "answerValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctl_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ctl_sessions_studyId_status_createdAt_idx" ON "ctl_sessions"("studyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ctl_sessions_studyParticipantId_status_idx" ON "ctl_sessions"("studyParticipantId", "status");

-- CreateIndex
CREATE INDEX "ctl_sessions_screeningAttemptId_idx" ON "ctl_sessions"("screeningAttemptId");

-- CreateIndex
CREATE INDEX "ctl_sessions_interviewerId_createdAt_idx" ON "ctl_sessions"("interviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ctl_answers_ctlSessionId_questionCode_key" ON "ctl_answers"("ctlSessionId", "questionCode");

-- CreateIndex
CREATE INDEX "ctl_answers_questionCode_idx" ON "ctl_answers"("questionCode");

-- AddForeignKey
ALTER TABLE "ctl_sessions" ADD CONSTRAINT "ctl_sessions_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_sessions" ADD CONSTRAINT "ctl_sessions_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_sessions" ADD CONSTRAINT "ctl_sessions_screeningAttemptId_fkey" FOREIGN KEY ("screeningAttemptId") REFERENCES "screening_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_sessions" ADD CONSTRAINT "ctl_sessions_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_answers" ADD CONSTRAINT "ctl_answers_ctlSessionId_fkey" FOREIGN KEY ("ctlSessionId") REFERENCES "ctl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
