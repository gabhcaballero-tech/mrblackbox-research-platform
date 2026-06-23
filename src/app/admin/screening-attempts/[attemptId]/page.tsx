import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createScreeningSupervisionRepository } from "@/modules/screening-supervision/repository";
import { getScreeningAttemptSupervisionDetail } from "@/modules/screening-supervision/service";
import { ScreeningAttemptDetailView } from "../_components/ScreeningSupervisionComponents";

export const dynamic = "force-dynamic";

type ScreeningAttemptDetailPageProps = {
  params: Promise<{
    attemptId: string;
  }>;
};

export default async function ScreeningAttemptDetailPage({ params }: ScreeningAttemptDetailPageProps) {
  const { attemptId } = await params;
  const actor = await requireCapability("screening:review");
  const result = await getScreeningAttemptSupervisionDetail({
    actor,
    attemptId,
    repository: createScreeningSupervisionRepository()
  });

  if (!result.ok) {
    if (result.code === "ATTEMPT_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  const detail = result.data;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">{detail.statusLabel}</StatusBadge>}
        description={`Participante: ${detail.participant.name}`}
        eyebrow="Detalle de intento"
        title={detail.study.name}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          className="text-sm font-semibold text-teal-700 transition hover:text-teal-800"
          href={`/admin/studies/${detail.studyId}/screening-attempts`}
        >
          Volver a intentos del estudio
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950"
          href={`/admin/studies/${detail.studyId}`}
        >
          Volver al estudio
        </Link>
      </div>

      <ScreeningAttemptDetailView detail={detail} />
    </AppShell>
  );
}
