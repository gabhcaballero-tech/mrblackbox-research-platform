CREATE TYPE "QaParticipantScenario" AS ENUM ('CLT_ONLY', 'CLT_NAVIGO', 'CLT_NAVIGO_HUT', 'HUT_DIRECTO');

CREATE TYPE "QaParticipantExecutionMode" AS ENUM ('REALISTIC', 'FAST_FORWARD');

CREATE TYPE "QaParticipantRunStatus" AS ENUM ('CREATED', 'CLEANED', 'FAILED');

CREATE TABLE "qa_participant_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studyId" UUID NOT NULL,
    "scenario" "QaParticipantScenario" NOT NULL,
    "executionMode" "QaParticipantExecutionMode" NOT NULL,
    "status" "QaParticipantRunStatus" NOT NULL DEFAULT 'CREATED',
    "studyParticipantId" UUID,
    "hutParticipantId" UUID,
    "folio" TEXT,
    "reportJson" JSONB,
    "cleanupReportJson" JSONB,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cleanedAt" TIMESTAMP(3),
    "cleanedByUserId" UUID,

    CONSTRAINT "qa_participant_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qa_participant_runs_studyParticipantId_key" ON "qa_participant_runs"("studyParticipantId");
CREATE UNIQUE INDEX "qa_participant_runs_hutParticipantId_key" ON "qa_participant_runs"("hutParticipantId");
CREATE INDEX "qa_participant_runs_studyId_status_createdAt_idx" ON "qa_participant_runs"("studyId", "status", "createdAt");
CREATE INDEX "qa_participant_runs_scenario_idx" ON "qa_participant_runs"("scenario");
CREATE INDEX "qa_participant_runs_executionMode_idx" ON "qa_participant_runs"("executionMode");
CREATE INDEX "qa_participant_runs_createdByUserId_idx" ON "qa_participant_runs"("createdByUserId");
CREATE INDEX "qa_participant_runs_cleanedByUserId_idx" ON "qa_participant_runs"("cleanedByUserId");

ALTER TABLE "qa_participant_runs" ADD CONSTRAINT "qa_participant_runs_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qa_participant_runs" ADD CONSTRAINT "qa_participant_runs_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "qa_participant_runs" ADD CONSTRAINT "qa_participant_runs_hutParticipantId_fkey" FOREIGN KEY ("hutParticipantId") REFERENCES "hut_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "qa_participant_runs" ADD CONSTRAINT "qa_participant_runs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qa_participant_runs" ADD CONSTRAINT "qa_participant_runs_cleanedByUserId_fkey" FOREIGN KEY ("cleanedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
