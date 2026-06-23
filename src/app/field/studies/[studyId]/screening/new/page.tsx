import Link from "next/link";
import { notFound } from "next/navigation";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldStudy } from "@/modules/field/service";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { ParticipantStartForm } from "../../../../_components/ParticipantStartForm";

export const dynamic = "force-dynamic";

type NewScreeningPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function NewScreeningPage({ params, searchParams }: NewScreeningPageProps) {
  const { studyId } = await params;
  const resolvedSearchParams = await searchParams;
  const actor = await requireCapability("screening:apply");
  const result = await getFieldStudy({
    actor,
    repository: createFieldRepository(),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_AVAILABLE") {
      notFound();
    }

    throw new Error(result.message);
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Nuevo intento</StatusBadge>}
        description="Crea o reutiliza un participante mínimo para iniciar la aplicación del filtro."
        eyebrow="Campo"
        title={`Iniciar filtro · ${result.data.name}`}
      />

      <div className="mb-6">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/field/studies/${studyId}`}>
          Volver al estudio
        </Link>
      </div>

      <ParticipantStartForm error={resolvedSearchParams?.error} studyId={studyId} />
    </AppShell>
  );
}
