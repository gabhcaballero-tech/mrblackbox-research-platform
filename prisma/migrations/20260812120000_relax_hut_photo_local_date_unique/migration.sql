-- Allow explicit admin overrides to capture more than one HUT photo on the same local date.
DROP INDEX IF EXISTS "hut_application_photo_entries_participantId_capturedLocalDate_key";

CREATE INDEX IF NOT EXISTS "hut_application_photo_entries_participantId_capturedLocalDate_idx"
  ON "hut_application_photo_entries"("participantId", "capturedLocalDate");
