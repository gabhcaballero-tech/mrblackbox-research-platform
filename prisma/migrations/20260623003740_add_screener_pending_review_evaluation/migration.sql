ALTER TYPE "ScreeningStatus" ADD VALUE 'PENDING_REVIEW';

ALTER TABLE "screening_attempts" ADD COLUMN "evaluationJson" JSONB;
