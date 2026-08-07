ALTER TABLE "hut_participants"
ADD COLUMN "studyParticipantId" UUID;

CREATE UNIQUE INDEX "hut_participants_studyParticipantId_key"
ON "hut_participants"("studyParticipantId");

CREATE INDEX "hut_participants_studyParticipantId_idx"
ON "hut_participants"("studyParticipantId");

ALTER TABLE "hut_participants"
ADD CONSTRAINT "hut_participants_studyParticipantId_fkey"
FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
