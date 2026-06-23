import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export default function FieldPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Operacion"
        title="Campo / encuestadores"
        description="Placeholder para flujos de campo. No incluye sesiones, asignaciones ni captura real todavia."
        actions={<StatusBadge status="planned">Preparado para crecer</StatusBadge>}
      />

      <EmptyState
        title="Operacion de campo pendiente"
        description="La ruta existe para organizar futuras herramientas de encuestadores sin activar procesos reales."
      />
    </AppShell>
  );
}
