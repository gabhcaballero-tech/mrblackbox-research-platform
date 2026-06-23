-- CreateEnum
CREATE TYPE "LibraryItemScope" AS ENUM ('GENERIC', 'STUDY_SPECIFIC');

-- CreateEnum
CREATE TYPE "LibraryItemRevisionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETIRED');

-- AlterTable
ALTER TABLE "library_items"
ADD COLUMN "description" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "scope" "LibraryItemScope" NOT NULL DEFAULT 'STUDY_SPECIFIC';

-- AlterTable
ALTER TABLE "library_item_revisions"
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "status" "LibraryItemRevisionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "retiredByUserId" UUID,
ADD COLUMN "retiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "questionnaire_draft_library_uses" (
    "id" UUID NOT NULL,
    "questionnaireDraftId" UUID NOT NULL,
    "libraryItemRevisionId" UUID NOT NULL,
    "insertedContentHash" TEXT,
    "idMapJson" JSONB NOT NULL,
    "insertedByUserId" UUID NOT NULL,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_draft_library_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_item_revisions_libraryItemId_status_idx" ON "library_item_revisions"("libraryItemId", "status");

-- CreateIndex
CREATE INDEX "library_item_revisions_retiredByUserId_idx" ON "library_item_revisions"("retiredByUserId");

-- CreateIndex
CREATE INDEX "questionnaire_draft_library_uses_questionnaireDraftId_insertedAt_idx" ON "questionnaire_draft_library_uses"("questionnaireDraftId", "insertedAt");

-- CreateIndex
CREATE INDEX "questionnaire_draft_library_uses_libraryItemRevisionId_idx" ON "questionnaire_draft_library_uses"("libraryItemRevisionId");

-- CreateIndex
CREATE INDEX "questionnaire_draft_library_uses_insertedByUserId_idx" ON "questionnaire_draft_library_uses"("insertedByUserId");

-- AddForeignKey
ALTER TABLE "library_item_revisions" ADD CONSTRAINT "library_item_revisions_retiredByUserId_fkey" FOREIGN KEY ("retiredByUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_draft_library_uses" ADD CONSTRAINT "questionnaire_draft_library_uses_questionnaireDraftId_fkey" FOREIGN KEY ("questionnaireDraftId") REFERENCES "questionnaire_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_draft_library_uses" ADD CONSTRAINT "questionnaire_draft_library_uses_libraryItemRevisionId_fkey" FOREIGN KEY ("libraryItemRevisionId") REFERENCES "library_item_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_draft_library_uses" ADD CONSTRAINT "questionnaire_draft_library_uses_insertedByUserId_fkey" FOREIGN KEY ("insertedByUserId") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
