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
        description={`Revisión de intentos aplicados para ${result.data.study.code}. No permite editar respuestas, reabrir intentos ni exportar.`}
        eyebrow="Supervisión"
        title={`Intentos de screener · ${result.data.study.name}`}
      />

      <div className="space-y-6">
        <ScreeningAttemptFilters data={result.data} />
        <ScreeningAttemptTable attempts={result.data.attempts} studyId={studyId} />
      </div>
    </AppShell>
  );
}
