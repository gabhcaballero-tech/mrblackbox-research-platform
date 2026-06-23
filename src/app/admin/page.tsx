import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export default function AdminPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Area interna"
        title="Administracion"
        description="Placeholder para administracion de estudios. La configuracion real se agregara en fases posteriores."
        actions={<StatusBadge status="planned">Sin logica real</StatusBadge>}
      />

      <EmptyState
        title="Modulo administrativo pendiente"
        description="Aun no hay autenticacion, base de datos, filtros, cuotas ni gestion de estudios. Esta pantalla confirma la ruta y el contenedor visual."
      />
    </AppShell>
  );
}
