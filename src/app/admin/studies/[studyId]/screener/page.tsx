import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { parseScreenerDefinition } from "@/modules/screener";
import { createScreenerRepository } from "@/modules/screener/repository";
import { getScreenerBuilderForAdmin } from "@/modules/screener/service";
import { ScreenerBuilder } from "./_components/ScreenerBuilder";

export const dynamic = "force-dynamic";

type ScreenerPageProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export default async function ScreenerPage({ params }: ScreenerPageProps) {
  const { studyId } = await params;
  const admin = await requireCapability("admin:access");
  const result = await getScreenerBuilderForAdmin({
    actor: admin,
    repository: createScreenerRepository(),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  const { draft, study, versions } = result.data;
  const readOnly = study.status !== "DRAFT";
  const definition = draft ? parseScreenerDefinition(draft.definitionJson) : null;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status={readOnly ? "planned" : "ready"}>{readOnly ? "Solo lectura" : "DRAFT"}</StatusBadge>}
        description="Crea y publica el cuestionario de filtro. Esta fase no registra participantes ni intentos reales."
        eyebrow="Screener V1"
        title="Cuestionario de filtro"
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          className="text-sm font-semibold text-teal-700 transition hover:text-teal-800"
          href={`/admin/studies/${studyId}`}
        >
          Volver a configuracion del estudio
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-600 transition hover:text-zinc-900"
          href="/admin"
        >
          Ver estudios
        </Link>
      </div>

      <ScreenerBuilder
        definition={definition}
        draft={draft}
        readOnly={readOnly}
        study={study}
        versions={versions}
      />
    </AppShell>
  );
}
