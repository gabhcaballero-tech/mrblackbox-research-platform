ALTER TABLE "studies" ADD COLUMN "code" TEXT NOT NULL;

CREATE UNIQUE INDEX "studies_code_key" ON "studies"("code");
