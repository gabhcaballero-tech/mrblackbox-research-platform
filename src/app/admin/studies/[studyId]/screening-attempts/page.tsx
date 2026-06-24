import { notFound } from "next/navigation";
import {
  ScreeningAttemptFilters,
  ScreeningAttemptTable
} from "@/app/admin/screening-attempts/_components/ScreeningSupervisionComponents";
import { createScreeningSupervisionRepository } from "@/modules/screening-supervision/repository";
import { listScreeningAttemptsForStudy } from "@/modules/screening-supervision/service";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

type StudyScreeningAttemptsPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    code?: string;
    dateFrom?: string;
    dateTo?: string;
    evidenceError?: string;
    evidenceMessage?: string;
    fieldUserId?: string;
    participantQuery?: string;
    status?: string;
  }>;
};

export default async function StudyScreeningAttemptsPage({
  params,
  searchParams
}: StudyScreeningAttemptsPageProps) {
  const { studyId } = await params;
  const filters = await searchParams;
  const actor = await requireCapability("screening:review");
  const result = await listScreeningAttemptsForStudy({
    actor,
    filters: filters ?? {},
    repository: createScreeningSupervisionRepository(),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Solo lectura</StatusBadge>}
        description={`Revisión de intentos aplicados para ${result.data.study.code}. No permite editar respuestas ni reabrir intentos.`}
        eyebrow="Supervisión"
        title={`Intentos de screener · ${result.data.study.name}`}
      />

      <div className="space-y-6">
        {filters?.evidenceMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {filters.evidenceMessage}
          </p>
        ) : null}
        {filters?.evidenceError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {filters.evidenceError}
          </p>
        ) : null}
        <ScreeningAttemptFilters data={result.data} />
        <ScreeningAttemptTable attempts={result.data.attempts} studyId={studyId} />
      </div>
    </AppShell>
  );
}
