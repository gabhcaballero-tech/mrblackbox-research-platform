-- CreateEnum
CREATE TYPE "ScreeningAttemptSource" AS ENUM ('FIELD', 'PARTICIPANT_PORTAL');

-- CreateEnum
CREATE TYPE "ParticipantEvidenceType" AS ENUM ('SELFIE_IDENTIFICATION', 'PERFUME_PHOTO');

-- CreateEnum
CREATE TYPE "ParticipantEvidenceReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ParticipantScreeningReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ManualMessageStatus" AS ENUM ('NOT_SENT', 'MARKED_SENT');

-- AlterTable
ALTER TABLE "participant_profiles"
ADD COLUMN "participantAuthUserId" UUID,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "study_participants"
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "screening_attempts"
ADD COLUMN "source" "ScreeningAttemptSource" NOT NULL DEFAULT 'FIELD',
ALTER COLUMN "fieldUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "participant_portal_study_configs" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "privacyNoticeVersion" TEXT NOT NULL,
    "privacyNoticeText" TEXT NOT NULL,
    "privacyNoticeHash" TEXT NOT NULL,
    "evidenceRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "otpCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "maxOtpAttempts" INTEGER NOT NULL DEFAULT 5,
    "folioPrefix" TEXT NOT NULL,
    "nextFolioSequence" INTEGER NOT NULL DEFAULT 1,
    "folioMaxSequence" INTEGER NOT NULL DEFAULT 999,
    "minPerfumePhotos" INTEGER NOT NULL DEFAULT 1,
    "maxPerfumePhotos" INTEGER NOT NULL DEFAULT 5,
    "maxImageBytes" INTEGER NOT NULL DEFAULT 8388608,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_portal_study_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_consents" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "participantAuthUserId" UUID NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "noticeHash" TEXT NOT NULL,
    "noticeTextSnapshot" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_evidence" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "screeningAttemptId" UUID NOT NULL,
    "type" "ParticipantEvidenceType" NOT NULL,
    "relatedQuestionId" TEXT,
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

    CONSTRAINT "participant_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_screening_reviews" (
    "id" UUID NOT NULL,
    "screeningAttemptId" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "status" "ParticipantScreeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "internalNote" TEXT,
    "rejectionReason" TEXT,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_screening_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_confirmations" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "screeningAttemptId" UUID NOT NULL,
    "folioSequence" INTEGER NOT NULL,
    "folio" TEXT NOT NULL,
    "approvedByUserId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualMessageStatus" "ManualMessageStatus" NOT NULL DEFAULT 'NOT_SENT',
    "manualMessageMarkedSentByUserId" UUID,
    "manualMessageMarkedSentAt" TIMESTAMP(3),

    CONSTRAINT "participant_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_reference_codes" (
    "id" UUID NOT NULL,
    "confirmationId" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_reference_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_portal_otp_request_logs" (
    "id" UUID NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "participant_portal_otp_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_profiles_participantAuthUserId_key" ON "participant_profiles"("participantAuthUserId");

-- CreateIndex
CREATE INDEX "screening_attempts_source_status_idx" ON "screening_attempts"("source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "participant_portal_study_configs_studyId_key" ON "participant_portal_study_configs"("studyId");

-- CreateIndex
CREATE INDEX "participant_consents_studyParticipantId_consentedAt_idx" ON "participant_consents"("studyParticipantId", "consentedAt");

-- CreateIndex
CREATE INDEX "participant_consents_participantAuthUserId_idx" ON "participant_consents"("participantAuthUserId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_consents_studyParticipantId_noticeVersion_key" ON "participant_consents"("studyParticipantId", "noticeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "participant_evidence_privateStorageKey_key" ON "participant_evidence"("privateStorageKey");

-- CreateIndex
CREATE INDEX "participant_evidence_studyParticipantId_uploadedAt_idx" ON "participant_evidence"("studyParticipantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "participant_evidence_screeningAttemptId_type_idx" ON "participant_evidence"("screeningAttemptId", "type");

-- CreateIndex
CREATE INDEX "participant_evidence_reviewStatus_idx" ON "participant_evidence"("reviewStatus");

-- CreateIndex
CREATE INDEX "participant_evidence_reviewedByUserId_idx" ON "participant_evidence"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_evidence_unique_selfie_per_attempt" ON "participant_evidence"("screeningAttemptId") WHERE "type" = 'SELFIE_IDENTIFICATION';

-- CreateIndex
CREATE UNIQUE INDEX "participant_screening_reviews_screeningAttemptId_key" ON "participant_screening_reviews"("screeningAttemptId");

-- CreateIndex
CREATE INDEX "participant_screening_reviews_studyParticipantId_status_idx" ON "participant_screening_reviews"("studyParticipantId", "status");

-- CreateIndex
CREATE INDEX "participant_screening_reviews_reviewedByUserId_idx" ON "participant_screening_reviews"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_confirmations_studyParticipantId_key" ON "participant_confirmations"("studyParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_confirmations_screeningAttemptId_key" ON "participant_confirmations"("screeningAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_confirmations_studyId_folioSequence_key" ON "participant_confirmations"("studyId", "folioSequence");

-- CreateIndex
CREATE UNIQUE INDEX "participant_confirmations_studyId_folio_key" ON "participant_confirmations"("studyId", "folio");

-- CreateIndex
CREATE INDEX "participant_confirmations_approvedByUserId_approvedAt_idx" ON "participant_confirmations"("approvedByUserId", "approvedAt");

-- CreateIndex
CREATE INDEX "participant_confirmations_manualMessageMarkedSentByUserId_idx" ON "participant_confirmations"("manualMessageMarkedSentByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_reference_codes_code_key" ON "participant_reference_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "participant_reference_codes_confirmationId_slot_key" ON "participant_reference_codes"("confirmationId", "slot");

-- CreateIndex
CREATE INDEX "participant_portal_otp_request_logs_emailHash_requestedAt_idx" ON "participant_portal_otp_request_logs"("emailHash", "requestedAt");

-- CreateIndex
CREATE INDEX "participant_portal_otp_request_logs_ipHash_requestedAt_idx" ON "participant_portal_otp_request_logs"("ipHash", "requestedAt");

-- AddCheck
ALTER TABLE "participant_portal_study_configs" ADD CONSTRAINT "participant_portal_study_configs_positive_values_check" CHECK (
  "evidenceRetentionDays" > 0
  AND "otpCooldownSeconds" >= 0
  AND "maxOtpAttempts" > 0
  AND "nextFolioSequence" >= 1
  AND "folioMaxSequence" >= 1
  AND "nextFolioSequence" <= "folioMaxSequence" + 1
  AND "minPerfumePhotos" >= 1
  AND "maxPerfumePhotos" >= "minPerfumePhotos"
  AND "maxImageBytes" > 0
);

-- AddCheck
ALTER TABLE "participant_reference_codes" ADD CONSTRAINT "participant_reference_codes_slot_check" CHECK ("slot" IN (1, 2, 3));

-- AddForeignKey
ALTER TABLE "participant_portal_study_configs" ADD CONSTRAINT "participant_portal_study_configs_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consents" ADD CONSTRAINT "participant_consents_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_evidence" ADD CONSTRAINT "participant_evidence_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_evidence" ADD CONSTRAINT "participant_evidence_screeningAttemptId_fkey" FOREIGN KEY ("screeningAttemptId") REFERENCES "screening_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_evidence" ADD CONSTRAINT "participant_evidence_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_screening_reviews" ADD CONSTRAINT "participant_screening_reviews_screeningAttemptId_fkey" FOREIGN KEY ("screeningAttemptId") REFERENCES "screening_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_screening_reviews" ADD CONSTRAINT "participant_screening_reviews_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_screening_reviews" ADD CONSTRAINT "participant_screening_reviews_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_confirmations" ADD CONSTRAINT "participant_confirmations_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_confirmations" ADD CONSTRAINT "participant_confirmations_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_confirmations" ADD CONSTRAINT "participant_confirmations_screeningAttemptId_fkey" FOREIGN KEY ("screeningAttemptId") REFERENCES "screening_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_confirmations" ADD CONSTRAINT "participant_confirmations_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_confirmations" ADD CONSTRAINT "participant_confirmations_manualMessageMarkedSentByUserId_fkey" FOREIGN KEY ("manualMessageMarkedSentByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_reference_codes" ADD CONSTRAINT "participant_reference_codes_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "participant_confirmations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
