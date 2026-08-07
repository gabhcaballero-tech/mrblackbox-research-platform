-- AlterTable
ALTER TABLE "ctl_sessions"
  ADD COLUMN "triangularRotationSnapshot" JSONB;

-- CreateTable
CREATE TABLE "ctl_triangular_rotation_assignments" (
    "id" UUID NOT NULL,
    "studyParticipantId" UUID NOT NULL,
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

    CONSTRAINT "ctl_triangular_rotation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctl_triangular_rotation_assignments_studyParticipantId_key" ON "ctl_triangular_rotation_assignments"("studyParticipantId");

-- CreateIndex
CREATE INDEX "ctl_triangular_rotation_assignments_importedByUserId_idx" ON "ctl_triangular_rotation_assignments"("importedByUserId");

-- AddForeignKey
ALTER TABLE "ctl_triangular_rotation_assignments" ADD CONSTRAINT "ctl_triangular_rotation_assignments_studyParticipantId_fkey" FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_triangular_rotation_assignments" ADD CONSTRAINT "ctl_triangular_rotation_assignments_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
