-- CreateEnum
CREATE TYPE "CtlOperationalPhase" AS ENUM ('COLOCACION', 'EVALUACION_1', 'EVALUACION_2');

-- CreateEnum
CREATE TYPE "CtlPhaseProgressStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VALIDATED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ctl_phase_progress" (
    "id" UUID NOT NULL,
    "ctlSessionId" UUID NOT NULL,
    "phase" "CtlOperationalPhase" NOT NULL,
    "referenceCodeSlot" INTEGER NOT NULL,
    "status" "CtlPhaseProgressStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "productCode" TEXT,
    "arm" TEXT,
    "rotationSnapshot" JSONB,
    "validatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctl_phase_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctl_phase_progress_ctlSessionId_phase_key" ON "ctl_phase_progress"("ctlSessionId", "phase");

-- CreateIndex
CREATE INDEX "ctl_phase_progress_ctlSessionId_status_idx" ON "ctl_phase_progress"("ctlSessionId", "status");

-- CreateIndex
CREATE INDEX "ctl_phase_progress_phase_status_idx" ON "ctl_phase_progress"("phase", "status");

-- AddForeignKey
ALTER TABLE "ctl_phase_progress" ADD CONSTRAINT "ctl_phase_progress_ctlSessionId_fkey" FOREIGN KEY ("ctlSessionId") REFERENCES "ctl_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
