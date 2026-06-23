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

export default async function AdminPage() {
  const admin = await requireCapability("admin:access");
  const studiesResult = await listStudiesForAdmin({
    actor: admin,
    repository: createStudiesRepository()
  });

  if (!studiesResult.ok) {
    throw new Error(studiesResult.message);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Área interna"
        title={`${UI_LABELS.areas.admin} de estudios`}
        description="Crea, consulta y edita estudios en borrador. Esta fase no incluye cuotas, participantes ni cambios de estado."
        actions={<StatusBadge status="ready">{`Solo ${ROLE_LABELS.ADMIN}`}</StatusBadge>}
      />

      <div className="space-y-8">
        <StudyCreateForm />
        <StudyList studies={studiesResult.data} />
      </div>
    </AppShell>
  );
}
