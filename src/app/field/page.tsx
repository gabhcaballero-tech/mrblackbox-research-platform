import { AppShell } from "@/shared/ui/AppShell";
import { requireCapability } from "@/shared/auth/session";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ROLE_LABELS } from "@/shared/ui/labels";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  await requireCapability("field:access");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Operación"
        title="Campo / encuestadores"
        description="Pantalla base protegida para flujos de campo. No incluye asignaciones ni captura real todavía."
        actions={<StatusBadge status="planned">Preparado para crecer</StatusBadge>}
      />

      <EmptyState
        title="Operación de campo pendiente"
        description={`La ruta queda disponible para ${ROLE_LABELS.ADMIN}, ${ROLE_LABELS.SUPERVISOR} y ${ROLE_LABELS.INTERVIEWER}, sin activar procesos reales.`}
      />
    </AppShell>
  );
}
