-- Store official Navigo/CTL rotation rows by folio before participants exist.
CREATE TABLE "navigo_rotation_folio_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studyId" UUID NOT NULL,
  "folio" TEXT NOT NULL,
  "firstFragrance" TEXT NOT NULL,
  "secondFragrance" TEXT NOT NULL,
  "triangular1Pr1" TEXT NOT NULL,
  "triangular1Pr2" TEXT NOT NULL,
  "triangular1Pr3" TEXT NOT NULL,
  "triangular1Verify" TEXT NOT NULL,
  "triangular2Pr1" TEXT NOT NULL,
  "triangular2Pr2" TEXT NOT NULL,
  "triangular2Pr3" TEXT NOT NULL,
  "triangular2Verify" TEXT NOT NULL,
  "sourceFileName" TEXT,
  "importedByUserId" UUID,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "navigo_rotation_folio_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "navigo_rotation_folio_configurations_studyId_folio_key"
  ON "navigo_rotation_folio_configurations"("studyId", "folio");

CREATE INDEX "navigo_rotation_folio_configurations_importedByUserId_idx"
  ON "navigo_rotation_folio_configurations"("importedByUserId");

ALTER TABLE "navigo_rotation_folio_configurations"
  ADD CONSTRAINT "navigo_rotation_folio_configurations_studyId_fkey"
  FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "navigo_rotation_folio_configurations"
  ADD CONSTRAINT "navigo_rotation_folio_configurations_importedByUserId_fkey"
  FOREIGN KEY ("importedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
