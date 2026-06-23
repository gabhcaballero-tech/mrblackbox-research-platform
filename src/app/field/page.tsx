import { AppShell } from "@/shared/ui/AppShell";
import { requireCapability } from "@/shared/auth/session";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  await requireCapability("field:access");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Operacion"
        title="Campo / encuestadores"
        description="Placeholder protegido para flujos de campo. No incluye asignaciones ni captura real todavia."
        actions={<StatusBadge status="planned">Preparado para crecer</StatusBadge>}
      />

      <EmptyState
        title="Operacion de campo pendiente"
        description="La ruta queda disponible para ADMIN, SUPERVISOR e INTERVIEWER, sin activar procesos reales."
      />
    </AppShell>
  );
}
