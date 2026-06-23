-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'INTERVIEWER', 'ANALYST');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RotationAssignmentModeAllowed" AS ENUM ('MANUAL', 'AUTOMATIC', 'BOTH');

-- CreateEnum
CREATE TYPE "RotationPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RotationAssignmentMode" AS ENUM ('MANUAL_COVER_CODE', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ParticipantProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED');

-- CreateEnum
CREATE TYPE "StudyParticipantOperationalStatus" AS ENUM ('CREATED', 'SCREENING_STARTED', 'SCREENING_PASSED', 'SCREENING_TERMINATED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('NOT_STARTED', 'STARTED', 'PASSED', 'TERMINATED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "ApplicationTimeEventType" AS ENUM ('REGISTERED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "ActivityStateAtEvent" AS ENUM ('NONE_STARTED', 'SOME_STARTED', 'COMPLETED_EXISTS');

-- CreateEnum
CREATE TYPE "ParticipantAccessTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ParticipantAccessTokenExpiryPolicy" AS ENUM ('SEVEN_DAYS_AFTER_LAST_SCHEDULED_ACTIVITY');

-- CreateEnum
CREATE TYPE "ParticipantAccessTokenRevocationReason" AS ENUM ('REGENERATED', 'MANUAL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestionnairePurpose" AS ENUM ('SCREENER', 'MEASUREMENT', 'FOLLOWUP', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuestionnaireDraftStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "QuestionnaireVersionStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LibraryItemType" AS ENUM ('QUESTION', 'OPTION_SET', 'SCALE', 'ATTRIBUTE', 'MATRIX', 'BLOCK_TEMPLATE');

-- CreateEnum
CREATE TYPE "LibraryItemStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuotaCountingStage" AS ENUM ('SCREENING_PASSED', 'PARTICIPANT_ASSIGNED', 'FIRST_MEASUREMENT_COMPLETED', 'STUDY_COMPLETED');

-- CreateEnum
CREATE TYPE "QuotaStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('QUESTIONNAIRE_MEASUREMENT', 'VIDEO_EVIDENCE', 'INTERNAL_FOLLOWUP');

-- CreateEnum
CREATE TYPE "ActivityAnchorEvent" AS ENUM ('APPLICATION_STARTED');

-- CreateEnum
CREATE TYPE "ActivityScheduleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ParticipantActivityStatus" AS ENUM ('PENDING', 'AVAILABLE', 'STARTED', 'INCOMPLETE', 'COMPLETED', 'EXPIRED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('INTERNAL_FOLLOWUP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResearchResponseContextType" AS ENUM ('NONE', 'PRODUCT', 'ARM');

-- CreateEnum
CREATE TYPE "ResponseValidationStatus" AS ENUM ('VALID', 'INVALID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AttributeOrderContextType" AS ENUM ('SHARED', 'PRODUCT', 'ARM');

-- CreateEnum
CREATE TYPE "MediaEvidenceType" AS ENUM ('VIDEO');

-- CreateEnum
CREATE TYPE "MediaEvidenceStatus" AS ENUM ('EXPECTED', 'PENDING_UPLOAD', 'UPLOADED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaConsentStatus" AS ENUM ('NOT_REQUESTED', 'GRANTED', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MediaReviewStatus" AS ENUM ('NOT_REVIEWED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetentionPolicyStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExportJobType" AS ENUM ('SCREENING_BASE', 'PARTICIPANT_TRACKING', 'QUOTAS', 'RESPONSES_WIDE', 'RESPONSES_LONG', 'FULL_INITIAL_PACKAGE');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ExportPrivacyMode" AS ENUM ('PII_ALLOWED', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('QUESTIONNAIRE_PUBLISHED', 'QUESTIONNAIRE_RETIRED', 'APPLICATION_TIME_CORRECTED', 'PARTICIPANT_MODIFIED', 'ACCESS_TOKEN_REGENERATED', 'ACCESS_TOKEN_REVOKED', 'ACTIVITY_REOPENED', 'ROTATION_CHANGED', 'QUOTA_CHANGED');

-- CreateTable
CREATE TABLE "internal_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StudyStatus" NOT NULL DEFAULT 'DRAFT',
    "timeZoneIana" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_products" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "internalCode" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_arms" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_arms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotation_plans" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "rotationCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignmentModeAllowed" "RotationAssignmentModeAllowed" NOT NULL DEFAULT 'MANUAL',
    "status" "RotationPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rotation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotation_plan_arms" (
    "id" UUID NOT NULL,
    "rotationPlanId" UUID NOT NULL,
    "studyArmId" UUID NOT NULL,
    "studyProductId" UUID NOT NULL,
    "applicationOrder" INTEGER NOT NULL,
    "participantVisibleLabel" TEXT NOT NULL,

    CONSTRAINT "rotation_plan_arms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_profiles" (
    "id" UUID NOT NULL,
    "externalReference" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "status" "ParticipantProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_participants" (
    "id" UUID NOT NULL,
    "participantProfileId" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "operationalStatus" "StudyParticipantOperationalStatus" NOT NULL DEFAULT 'CREATED',
    "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "applicationStartedAt" TIMESTAMP(3),
    "applicationStartedAtRegisteredByUserId" UUID,
    "applicationStartedAtRegisteredAt" TIMESTAMP(3),
    "applicationStartedAtCorrectedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_time_events" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "eventType" "ApplicationTimeEventType" NOT NULL,
    "previousApplicationStartedAt" TIMESTAMP(3),
    "newApplicationStartedAt" TIMESTAMP(3) NOT NULL,
    "timeZoneIana" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "activityStateAtEvent" "ActivityStateAtEvent" NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_time_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_access_tokens" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ParticipantAccessTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAtPolicy" "ParticipantAccessTokenExpiryPolicy" NOT NULL DEFAULT 'SEVEN_DAYS_AFTER_LAST_SCHEDULED_ACTIVITY',
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" UUID,
    "revocationReason" "ParticipantAccessTokenRevocationReason",
    "replacedByTokenId" UUID,

    CONSTRAINT "participant_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_drafts" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "QuestionnairePurpose" NOT NULL,
    "definitionJson" JSONB NOT NULL,
    "status" "QuestionnaireDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_versions" (
    "id" UUID NOT NULL,
    "questionnaireDraftId" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definitionJson" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "publishedByUserId" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredByUserId" UUID,
    "retiredAt" TIMESTAMP(3),
    "status" "QuestionnaireVersionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "questionnaire_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" UUID NOT NULL,
    "studyId" UUID,
    "type" "LibraryItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LibraryItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_item_revisions" (
    "id" UUID NOT NULL,
    "libraryItemId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_item_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_attribute_sets" (
    "id" UUID NOT NULL,
    "questionnaireVersionId" UUID NOT NULL,
    "blockInstanceKey" TEXT NOT NULL,
    "libraryItemRevisionId" UUID NOT NULL,
    "sortHint" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "questionnaire_attribute_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_attempts" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "fieldUserId" UUID NOT NULL,
    "questionnaireVersionId" UUID NOT NULL,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'STARTED',
    "terminationCode" TEXT,
    "terminationReason" TEXT,
    "nseScore" INTEGER,
    "nseClass" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "screening_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_answers" (
    "id" UUID NOT NULL,
    "screeningAttemptId" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_definitions" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteriaJson" JSONB NOT NULL,
    "countingStage" "QuotaCountingStage" NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "warningThreshold" INTEGER,
    "status" "QuotaStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_evaluations" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "quotaDefinitionId" UUID NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "countingStage" "QuotaCountingStage" NOT NULL,
    "currentCountAtEvaluation" INTEGER NOT NULL,
    "isFull" BOOLEAN NOT NULL,
    "warningShown" BOOLEAN NOT NULL,
    "blocksInterview" BOOLEAN NOT NULL DEFAULT false,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_rotation_assignments" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "rotationPlanId" UUID NOT NULL,
    "rotationCode" TEXT NOT NULL,
    "assignmentMode" "RotationAssignmentMode" NOT NULL DEFAULT 'MANUAL_COVER_CODE',
    "assignedByUserId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedAt" TIMESTAMP(3),

    CONSTRAINT "participant_rotation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_arm_assignments" (
    "id" UUID NOT NULL,
    "participantRotationAssignmentId" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "studyArmId" UUID NOT NULL,
    "studyProductId" UUID NOT NULL,
    "applicationOrder" INTEGER NOT NULL,
    "participantVisibleLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_arm_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_schedules" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "name" TEXT NOT NULL,
    "anchorEvent" "ActivityAnchorEvent" NOT NULL DEFAULT 'APPLICATION_STARTED',
    "offsetMinutes" INTEGER NOT NULL,
    "windowStartsMinutes" INTEGER NOT NULL,
    "windowEndsMinutes" INTEGER NOT NULL,
    "questionnaireVersionId" UUID,
    "recurrenceJson" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "status" "ActivityScheduleStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "activity_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_activities" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "activityScheduleId" UUID NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "availableFrom" TIMESTAMP(3) NOT NULL,
    "availableUntil" TIMESTAMP(3) NOT NULL,
    "status" "ParticipantActivityStatus" NOT NULL DEFAULT 'PENDING',
    "actualStartedAt" TIMESTAMP(3),
    "actualCompletedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3),
    "reopenedByUserId" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,

    CONSTRAINT "participant_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" UUID NOT NULL,
    "participantActivityId" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "metadataJson" JSONB,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_responses" (
    "id" UUID NOT NULL,
    "participantActivityId" UUID NOT NULL,
    "responseKey" TEXT NOT NULL,
    "questionnaireVersionId" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "blockInstanceKey" TEXT,
    "contextType" "ResearchResponseContextType" NOT NULL DEFAULT 'NONE',
    "contextProductId" UUID,
    "contextArmId" UUID,
    "answerJson" JSONB NOT NULL,
    "validationStatus" "ResponseValidationStatus" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_randomization_configs" (
    "id" UUID NOT NULL,
    "questionnaireVersionId" UUID NOT NULL,
    "blockInstanceKey" TEXT NOT NULL,
    "shareOrderAcrossProducts" BOOLEAN NOT NULL DEFAULT true,
    "groupSize" INTEGER NOT NULL,
    "finalQuestionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "finalQuestionText" TEXT NOT NULL,

    CONSTRAINT "attribute_randomization_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_attribute_orders" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
    "questionnaireVersionId" UUID NOT NULL,
    "blockInstanceKey" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "contextType" "AttributeOrderContextType" NOT NULL,
    "contextProductId" UUID,
    "contextArmId" UUID,
    "seed" TEXT NOT NULL,
    "orderedAttributeRevisionIds" JSONB NOT NULL,
    "groupedAttributeRevisionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_attribute_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_evidence_placeholders" (
    "id" UUID NOT NULL,
    "participantActivityId" UUID NOT NULL,
    "type" "MediaEvidenceType" NOT NULL DEFAULT 'VIDEO',
    "status" "MediaEvidenceStatus" NOT NULL DEFAULT 'EXPECTED',
    "privateStorageKey" TEXT,
    "consentStatus" "MediaConsentStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "consentCapturedAt" TIMESTAMP(3),
    "reviewStatus" "MediaReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "retentionPolicyStatus" "RetentionPolicyStatus" NOT NULL DEFAULT 'PENDING',
    "metadataJson" JSONB,

    CONSTRAINT "media_evidence_placeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "type" "ExportJobType" NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "privacyMode" "ExportPrivacyMode" NOT NULL,
    "includedPiiFields" JSONB,
    "anonymizationRulesJson" JSONB,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadataJson" JSONB,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_users_email_key" ON "internal_users"("email");

-- CreateIndex
CREATE INDEX "studies_status_idx" ON "studies"("status");

-- CreateIndex
CREATE INDEX "studies_createdByUserId_idx" ON "studies"("createdByUserId");

-- CreateIndex
CREATE INDEX "study_products_studyId_idx" ON "study_products"("studyId");

-- CreateIndex
CREATE UNIQUE INDEX "study_products_studyId_internalCode_key" ON "study_products"("studyId", "internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "study_arms_studyId_code_key" ON "study_arms"("studyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "study_arms_studyId_sortOrder_key" ON "study_arms"("studyId", "sortOrder");

-- CreateIndex
CREATE INDEX "rotation_plans_studyId_status_idx" ON "rotation_plans"("studyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rotation_plans_studyId_rotationCode_key" ON "rotation_plans"("studyId", "rotationCode");

-- CreateIndex
CREATE INDEX "rotation_plan_arms_studyProductId_idx" ON "rotation_plan_arms"("studyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "rotation_plan_arms_rotationPlanId_studyArmId_key" ON "rotation_plan_arms"("rotationPlanId", "studyArmId");

-- CreateIndex
CREATE UNIQUE INDEX "rotation_plan_arms_rotationPlanId_applicationOrder_key" ON "rotation_plan_arms"("rotationPlanId", "applicationOrder");

-- CreateIndex
CREATE INDEX "participant_profiles_externalReference_idx" ON "participant_profiles"("externalReference");

-- CreateIndex
CREATE INDEX "participant_profiles_email_idx" ON "participant_profiles"("email");

-- CreateIndex
CREATE INDEX "participant_profiles_phone_idx" ON "participant_profiles"("phone");

-- CreateIndex
CREATE INDEX "participant_profiles_createdByUserId_idx" ON "participant_profiles"("createdByUserId");

-- CreateIndex
CREATE INDEX "study_participants_studyId_operationalStatus_idx" ON "study_participants"("studyId", "operationalStatus");

-- CreateIndex
CREATE INDEX "study_participants_screeningStatus_idx" ON "study_participants"("screeningStatus");

-- CreateIndex
CREATE INDEX "study_participants_createdByUserId_idx" ON "study_participants"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "study_participants_participantProfileId_studyId_key" ON "study_participants"("participantProfileId", "studyId");

-- CreateIndex
CREATE INDEX "application_time_events_studyParticipantId_createdAt_idx" ON "application_time_events"("studyParticipantId", "createdAt");

-- CreateIndex
CREATE INDEX "application_time_events_createdByUserId_idx" ON "application_time_events"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_access_tokens_tokenHash_key" ON "participant_access_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "participant_access_tokens_replacedByTokenId_key" ON "participant_access_tokens"("replacedByTokenId");

-- CreateIndex
CREATE INDEX "participant_access_tokens_studyParticipantId_status_idx" ON "participant_access_tokens"("studyParticipantId", "status");

-- CreateIndex
CREATE INDEX "participant_access_tokens_expiresAt_idx" ON "participant_access_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "questionnaire_drafts_studyId_purpose_status_idx" ON "questionnaire_drafts"("studyId", "purpose", "status");

-- CreateIndex
CREATE INDEX "questionnaire_versions_studyId_status_idx" ON "questionnaire_versions"("studyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_versions_questionnaireDraftId_versionNumber_key" ON "questionnaire_versions"("questionnaireDraftId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_versions_studyId_definitionHash_key" ON "questionnaire_versions"("studyId", "definitionHash");

-- CreateIndex
CREATE INDEX "library_items_studyId_type_status_idx" ON "library_items"("studyId", "type", "status");

-- CreateIndex
CREATE INDEX "library_items_createdByUserId_idx" ON "library_items"("createdByUserId");

-- CreateIndex
CREATE INDEX "library_item_revisions_createdByUserId_idx" ON "library_item_revisions"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_revisions_libraryItemId_revisionNumber_key" ON "library_item_revisions"("libraryItemId", "revisionNumber");

-- CreateIndex
CREATE INDEX "questionnaire_attribute_sets_libraryItemRevisionId_idx" ON "questionnaire_attribute_sets"("libraryItemRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_attribute_sets_questionnaireVersionId_blockIn_key" ON "questionnaire_attribute_sets"("questionnaireVersionId", "blockInstanceKey", "libraryItemRevisionId");

-- CreateIndex
CREATE INDEX "screening_attempts_studyParticipantId_status_idx" ON "screening_attempts"("studyParticipantId", "status");

-- CreateIndex
CREATE INDEX "screening_attempts_fieldUserId_startedAt_idx" ON "screening_attempts"("fieldUserId", "startedAt");

-- CreateIndex
CREATE INDEX "screening_attempts_questionnaireVersionId_idx" ON "screening_attempts"("questionnaireVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "screening_answers_screeningAttemptId_questionId_key" ON "screening_answers"("screeningAttemptId", "questionId");

-- CreateIndex
CREATE INDEX "quota_definitions_studyId_countingStage_status_idx" ON "quota_definitions"("studyId", "countingStage", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quota_definitions_studyId_name_key" ON "quota_definitions"("studyId", "name");

-- CreateIndex
CREATE INDEX "quota_evaluations_studyParticipantId_evaluatedAt_idx" ON "quota_evaluations"("studyParticipantId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "quota_evaluations_quotaDefinitionId_countingStage_idx" ON "quota_evaluations"("quotaDefinitionId", "countingStage");

-- CreateIndex
CREATE UNIQUE INDEX "participant_rotation_assignments_studyParticipantId_key" ON "participant_rotation_assignments"("studyParticipantId");

-- CreateIndex
CREATE INDEX "participant_rotation_assignments_rotationPlanId_idx" ON "participant_rotation_assignments"("rotationPlanId");

-- CreateIndex
CREATE INDEX "participant_rotation_assignments_assignedByUserId_idx" ON "participant_rotation_assignments"("assignedByUserId");

-- CreateIndex
CREATE INDEX "participant_arm_assignments_studyProductId_idx" ON "participant_arm_assignments"("studyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_arm_assignment_rotation_arm_unique" ON "participant_arm_assignments"("participantRotationAssignmentId", "studyArmId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_arm_assignment_rotation_order_unique" ON "participant_arm_assignments"("participantRotationAssignmentId", "applicationOrder");

-- CreateIndex
CREATE UNIQUE INDEX "participant_arm_assignment_participant_arm_unique" ON "participant_arm_assignments"("studyParticipantId", "studyArmId");

-- CreateIndex
CREATE INDEX "activity_schedules_studyId_status_idx" ON "activity_schedules"("studyId", "status");

-- CreateIndex
CREATE INDEX "activity_schedules_questionnaireVersionId_idx" ON "activity_schedules"("questionnaireVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_schedules_studyId_type_sortOrder_key" ON "activity_schedules"("studyId", "type", "sortOrder");

-- CreateIndex
CREATE INDEX "participant_activities_studyParticipantId_status_idx" ON "participant_activities"("studyParticipantId", "status");

-- CreateIndex
CREATE INDEX "participant_activities_scheduledAt_idx" ON "participant_activities"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "participant_activity_occurrence_unique" ON "participant_activities"("studyParticipantId", "activityScheduleId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "reminder_logs_participantActivityId_scheduledFor_idx" ON "reminder_logs"("participantActivityId", "scheduledFor");

-- CreateIndex
CREATE INDEX "research_responses_participantActivityId_questionnaireVersi_idx" ON "research_responses"("participantActivityId", "questionnaireVersionId");

-- CreateIndex
CREATE INDEX "research_responses_questionId_idx" ON "research_responses"("questionId");

-- CreateIndex
CREATE INDEX "research_responses_contextType_contextProductId_contextArmI_idx" ON "research_responses"("contextType", "contextProductId", "contextArmId");

-- CreateIndex
CREATE UNIQUE INDEX "research_response_activity_response_key_unique" ON "research_responses"("participantActivityId", "responseKey");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_randomization_configs_questionnaireVersionId_bloc_key" ON "attribute_randomization_configs"("questionnaireVersionId", "blockInstanceKey");

-- CreateIndex
CREATE INDEX "participant_attribute_orders_questionnaireVersionId_blockIn_idx" ON "participant_attribute_orders"("questionnaireVersionId", "blockInstanceKey");

-- CreateIndex
CREATE INDEX "participant_attribute_orders_contextType_contextProductId_c_idx" ON "participant_attribute_orders"("contextType", "contextProductId", "contextArmId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_attribute_orders_studyParticipantId_questionnai_key" ON "participant_attribute_orders"("studyParticipantId", "questionnaireVersionId", "blockInstanceKey", "orderKey");

-- CreateIndex
CREATE UNIQUE INDEX "media_evidence_placeholders_participantActivityId_key" ON "media_evidence_placeholders"("participantActivityId");

-- CreateIndex
CREATE INDEX "media_evidence_placeholders_status_idx" ON "media_evidence_placeholders"("status");

-- CreateIndex
CREATE INDEX "media_evidence_placeholders_reviewStatus_idx" ON "media_evidence_placeholders"("reviewStatus");

-- CreateIndex
CREATE INDEX "export_jobs_studyId_type_status_idx" ON "export_jobs"("studyId", "type", "status");

-- CreateIndex
CREATE INDEX "export_jobs_requestedByUserId_createdAt_idx" ON "export_jobs"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_products" ADD CONSTRAINT "study_products_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_arms" ADD CONSTRAINT "study_arms_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_plans" ADD CONSTRAINT "rotation_plans_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_plan_arms" ADD CONSTRAINT "rotation_plan_arms_rotationPlanId_fkey" FOREIGN KEY ("rotationPlanId") REFERENCES "rotation_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_plan_arms" ADD CONSTRAINT "rotation_plan_arms_studyArmId_fkey" FOREIGN KEY ("studyArmId") REFERENCES "study_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotation_plan_arms" ADD CONSTRAINT "rotation_plan_arms_studyProductId_fkey" FOREIGN KEY ("studyProductId") REFERENCES "study_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_profiles" ADD CONSTRAINT "participant_profiles_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_participants" ADD CONSTRAINT "study_participants_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_participants" ADD CONSTRAINT "study_participants_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_participants" ADD CONSTRAINT "study_participants_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_participants" ADD CONSTRAINT "study_participants_applicationStartedAtRegisteredByUserId_fkey" FOREIGN KEY ("applicationStartedAtRegisteredByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_time_events" ADD CONSTRAINT "application_time_events_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_time_events" ADD CONSTRAINT "application_time_events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_access_tokens" ADD CONSTRAINT "participant_access_tokens_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_access_tokens" ADD CONSTRAINT "participant_access_tokens_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_access_tokens" ADD CONSTRAINT "participant_access_tokens_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_access_tokens" ADD CONSTRAINT "participant_access_tokens_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "participant_access_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_drafts" ADD CONSTRAINT "questionnaire_drafts_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_drafts" ADD CONSTRAINT "questionnaire_drafts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_drafts" ADD CONSTRAINT "questionnaire_drafts_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_questionnaireDraftId_fkey" FOREIGN KEY ("questionnaireDraftId") REFERENCES "questionnaire_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_retiredByUserId_fkey" FOREIGN KEY ("retiredByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item_revisions" ADD CONSTRAINT "library_item_revisions_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item_revisions" ADD CONSTRAINT "library_item_revisions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_attribute_sets" ADD CONSTRAINT "questionnaire_attribute_sets_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_attribute_sets" ADD CONSTRAINT "questionnaire_attribute_sets_libraryItemRevisionId_fkey" FOREIGN KEY ("libraryItemRevisionId") REFERENCES "library_item_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_attempts" ADD CONSTRAINT "screening_attempts_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_attempts" ADD CONSTRAINT "screening_attempts_fieldUserId_fkey" FOREIGN KEY ("fieldUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_attempts" ADD CONSTRAINT "screening_attempts_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_answers" ADD CONSTRAINT "screening_answers_screeningAttemptId_fkey" FOREIGN KEY ("screeningAttemptId") REFERENCES "screening_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_definitions" ADD CONSTRAINT "quota_definitions_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_evaluations" ADD CONSTRAINT "quota_evaluations_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_evaluations" ADD CONSTRAINT "quota_evaluations_quotaDefinitionId_fkey" FOREIGN KEY ("quotaDefinitionId") REFERENCES "quota_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_rotation_assignments" ADD CONSTRAINT "participant_rotation_assignments_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_rotation_assignments" ADD CONSTRAINT "participant_rotation_assignments_rotationPlanId_fkey" FOREIGN KEY ("rotationPlanId") REFERENCES "rotation_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_rotation_assignments" ADD CONSTRAINT "participant_rotation_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_arm_assignments" ADD CONSTRAINT "participant_arm_assignments_participantRotationAssignmentI_fkey" FOREIGN KEY ("participantRotationAssignmentId") REFERENCES "participant_rotation_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_arm_assignments" ADD CONSTRAINT "participant_arm_assignments_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_arm_assignments" ADD CONSTRAINT "participant_arm_assignments_studyArmId_fkey" FOREIGN KEY ("studyArmId") REFERENCES "study_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_arm_assignments" ADD CONSTRAINT "participant_arm_assignments_studyProductId_fkey" FOREIGN KEY ("studyProductId") REFERENCES "study_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_activities" ADD CONSTRAINT "participant_activities_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_activities" ADD CONSTRAINT "participant_activities_activityScheduleId_fkey" FOREIGN KEY ("activityScheduleId") REFERENCES "activity_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_activities" ADD CONSTRAINT "participant_activities_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_participantActivityId_fkey" FOREIGN KEY ("participantActivityId") REFERENCES "participant_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_responses" ADD CONSTRAINT "research_responses_participantActivityId_fkey" FOREIGN KEY ("participantActivityId") REFERENCES "participant_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_responses" ADD CONSTRAINT "research_responses_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_responses" ADD CONSTRAINT "research_responses_contextProductId_fkey" FOREIGN KEY ("contextProductId") REFERENCES "study_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_responses" ADD CONSTRAINT "research_responses_contextArmId_fkey" FOREIGN KEY ("contextArmId") REFERENCES "study_arms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_randomization_configs" ADD CONSTRAINT "attribute_randomization_configs_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_attribute_orders" ADD CONSTRAINT "participant_attribute_orders_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_attribute_orders" ADD CONSTRAINT "participant_attribute_orders_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_attribute_orders" ADD CONSTRAINT "participant_attribute_orders_contextProductId_fkey" FOREIGN KEY ("contextProductId") REFERENCES "study_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_attribute_orders" ADD CONSTRAINT "participant_attribute_orders_contextArmId_fkey" FOREIGN KEY ("contextArmId") REFERENCES "study_arms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_evidence_placeholders" ADD CONSTRAINT "media_evidence_placeholders_participantActivityId_fkey" FOREIGN KEY ("participantActivityId") REFERENCES "participant_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_evidence_placeholders" ADD CONSTRAINT "media_evidence_placeholders_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
