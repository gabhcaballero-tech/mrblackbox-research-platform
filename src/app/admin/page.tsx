import { AppShell } from "@/shared/ui/AppShell";
import { requireCapability } from "@/shared/auth/session";
import { createStudiesRepository } from "@/modules/studies/repository";
import { listStudiesForAdmin } from "@/modules/studies/service";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { ROLE_LABELS, UI_LABELS } from "@/shared/ui/labels";
import { StudyCreateForm } from "./_components/StudyCreateForm";
import { StudyList } from "./_components/StudyList";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const search = (await searchParams) ?? {};
  const view = firstParam(search.view) === "archived" ? "archived" : "active";
  const admin = await requireCapability("admin:access");
  const studiesResult = await listStudiesForAdmin({
    actor: admin,
    mode: view,
    repository: createStudiesRepository()
  });

  if (!studiesResult.ok) {
    throw new Error(studiesResult.message);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Área interna"
        title={view === "archived" ? "Estudios archivados" : `${UI_LABELS.areas.admin} de estudios`}
        description={
          view === "archived"
            ? "Consulta estudios cerrados o inactivos. Sus datos se conservan y el acceso público queda bloqueado."
            : "Crea, consulta y edita estudios. Los estudios archivados se consultan en una vista separada."
        }
        actions={<StatusBadge status="ready">{`Solo ${ROLE_LABELS.ADMIN}`}</StatusBadge>}
      />

      <div className="space-y-8">
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <a
            className={view === "active" ? "text-teal-700" : "text-zinc-600 hover:text-zinc-950"}
            href="/admin"
          >
            Estudios activos
          </a>
          <a
            className={view === "archived" ? "text-teal-700" : "text-zinc-600 hover:text-zinc-950"}
            href="/admin?view=archived"
          >
            Estudios archivados
          </a>
        </div>
        {view === "active" ? <StudyCreateForm /> : null}
        <StudyList studies={studiesResult.data} />
      </div>
    </AppShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
