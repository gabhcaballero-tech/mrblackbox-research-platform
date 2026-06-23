import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldStudy } from "@/modules/field/service";

export const dynamic = "force-dynamic";

type FieldStudyPageProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export default async function FieldStudyPage({ params }: FieldStudyPageProps) {
  const { studyId } = await params;
  const actor = await requireCapability("field:access");
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

  const study = result.data;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">{`Versión ${study.activeScreenerVersion.versionNumber}`}</StatusBadge>}
        description="Resumen seguro para iniciar una aplicación de screener. No muestra nombres reales de producto."
        eyebrow="Campo"
        title={study.name}
      />

      <div className="mb-6">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href="/field">
          Volver a Campo
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-500">Código</dt>
            <dd className="mt-1 break-all font-mono text-zinc-900">{study.code}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Estado</dt>
            <dd className="mt-1 text-zinc-900">Activo</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Screener activo</dt>
            <dd className="mt-1 text-zinc-900">Versión {study.activeScreenerVersion.versionNumber}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Zona horaria</dt>
            <dd className="mt-1 text-zinc-900">{study.timeZoneIana}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <Link
            className="inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            href={`/field/studies/${study.id}/screening/new`}
          >
            Iniciar filtro
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
