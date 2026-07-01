ALTER TABLE "study_participants" ADD COLUMN "visualVerificationMode" TEXT;

ALTER TABLE "study_participants"
ADD CONSTRAINT "study_participants_visualVerificationMode_check"
CHECK ("visualVerificationMode" IS NULL OR "visualVerificationMode" IN ('required', 'disabled'));
