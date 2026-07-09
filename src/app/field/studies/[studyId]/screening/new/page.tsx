import Link from "next/link";
import { notFound } from "next/navigation";
import { getFieldActorForRequest } from "@/modules/field/auth";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldStudy, isPublicFieldActor } from "@/modules/field/service";
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
  const actor = await getFieldActorForRequest();
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

  const content = (
    <>
      <PageHeader
        actions={<StatusBadge status="ready">Nuevo intento</StatusBadge>}
        description="Crea o reutiliza un participante mínimo para iniciar la aplicación del filtro."
        eyebrow="Campo"
        title={`Iniciar filtro · ${result.data.name}`}
      />

      {isPublicFieldActor(actor) ? null : <div className="mb-6">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/field/studies/${studyId}`}>
          Volver al estudio
        </Link>
      </div>}

      <ParticipantStartForm error={resolvedSearchParams?.error} studyId={studyId} />
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{content}</main>;
  }

  return <AppShell>{content}</AppShell>;
}
