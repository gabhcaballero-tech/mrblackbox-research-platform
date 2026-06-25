-- AlterTable
ALTER TABLE "activity_schedules"
ADD COLUMN "code" TEXT;

-- CreateTable
CREATE TABLE "participant_activity_evidence" (
    "id" UUID NOT NULL,
    "participantActivityId" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "type" "ParticipantEvidenceType" NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "reviewStatus" "ParticipantEvidenceReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "internalNote" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_activity_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_schedules_studyId_code_key" ON "activity_schedules"("studyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "participant_activity_evidence_privateStorageKey_key" ON "participant_activity_evidence"("privateStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "participant_activity_evidence_participantActivityId_type_key" ON "participant_activity_evidence"("participantActivityId", "type");

-- CreateIndex
CREATE INDEX "participant_activity_evidence_studyParticipantId_uploadedAt_idx" ON "participant_activity_evidence"("studyParticipantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "participant_activity_evidence_reviewStatus_idx" ON "participant_activity_evidence"("reviewStatus");

-- CreateIndex
CREATE INDEX "participant_activity_evidence_reviewedByUserId_idx" ON "participant_activity_evidence"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "participant_activity_evidence" ADD CONSTRAINT "participant_activity_evidence_participantActivityId_fkey" FOREIGN KEY ("participantActivityId") REFERENCES "participant_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_activity_evidence" ADD CONSTRAINT "participant_activity_evidence_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_activity_evidence" ADD CONSTRAINT "participant_activity_evidence_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
