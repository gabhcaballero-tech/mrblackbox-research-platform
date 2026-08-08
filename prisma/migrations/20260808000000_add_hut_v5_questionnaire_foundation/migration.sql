-- CreateEnum
CREATE TYPE "HutQuestionnaireAttemptStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HutQuestionnaireSection" AS ENUM ('DATOS_GENERALES', 'FILTROS', 'PRIMERA_VISITA', 'EVALUACION_PRIMER_PERFUME', 'SEGUNDA_VISITA', 'EVALUACION_SEGUNDO_PERFUME', 'COMPARATIVA');

-- CreateEnum
CREATE TYPE "HutVisitProgressStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "hut_questionnaire_attempts" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "status" "HutQuestionnaireAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_questionnaire_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_visit_progress" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "section" "HutQuestionnaireSection" NOT NULL,
    "status" "HutVisitProgressStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_visit_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_answers" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "visitProgressId" UUID,
    "questionCode" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hut_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hut_application_photo_entries" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "productCode" TEXT,
    "useDayNumber" INTEGER NOT NULL,
    "capturedLocalDate" TEXT NOT NULL,
    "capturedLocalTimezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
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

    CONSTRAINT "hut_application_photo_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hut_questionnaire_attempts_participantId_key" ON "hut_questionnaire_attempts"("participantId");

-- CreateIndex
CREATE INDEX "hut_questionnaire_attempts_status_idx" ON "hut_questionnaire_attempts"("status");

-- CreateIndex
CREATE INDEX "hut_questionnaire_attempts_participantId_status_idx" ON "hut_questionnaire_attempts"("participantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hut_visit_progress_attemptId_section_key" ON "hut_visit_progress"("attemptId", "section");

-- CreateIndex
CREATE INDEX "hut_visit_progress_section_status_idx" ON "hut_visit_progress"("section", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hut_answers_attemptId_questionCode_key" ON "hut_answers"("attemptId", "questionCode");

-- CreateIndex
CREATE INDEX "hut_answers_visitProgressId_idx" ON "hut_answers"("visitProgressId");

-- CreateIndex
CREATE INDEX "hut_answers_questionCode_idx" ON "hut_answers"("questionCode");

-- CreateIndex
CREATE UNIQUE INDEX "hut_application_photo_entries_privateStorageKey_key" ON "hut_application_photo_entries"("privateStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "hut_application_photo_entries_participantId_capturedLocalDate_key" ON "hut_application_photo_entries"("participantId", "capturedLocalDate");

-- CreateIndex
CREATE INDEX "hut_application_photo_entries_participantId_productCode_useDayNumber_idx" ON "hut_application_photo_entries"("participantId", "productCode", "useDayNumber");

-- CreateIndex
CREATE INDEX "hut_application_photo_entries_capturedLocalDate_idx" ON "hut_application_photo_entries"("capturedLocalDate");

-- AddForeignKey
ALTER TABLE "hut_questionnaire_attempts" ADD CONSTRAINT "hut_questionnaire_attempts_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_visit_progress" ADD CONSTRAINT "hut_visit_progress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "hut_questionnaire_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_answers" ADD CONSTRAINT "hut_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "hut_questionnaire_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_answers" ADD CONSTRAINT "hut_answers_visitProgressId_fkey" FOREIGN KEY ("visitProgressId") REFERENCES "hut_visit_progress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hut_application_photo_entries" ADD CONSTRAINT "hut_application_photo_entries_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hut_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
