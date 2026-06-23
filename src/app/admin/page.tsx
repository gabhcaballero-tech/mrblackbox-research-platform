import { AppShell } from "@/shared/ui/AppShell";
import { requireCapability } from "@/shared/auth/session";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireCapability("admin:access");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Area interna"
        title="Administracion"
        description="Placeholder protegido para administracion de estudios. La configuracion real se agregara en fases posteriores."
        actions={<StatusBadge status="planned">Sin logica real</StatusBadge>}
      />

      <EmptyState
        title="Modulo administrativo pendiente"
        description="La ruta queda reservada para ADMIN. No incluye gestion real de estudios, filtros, cuotas ni exportaciones todavia."
      />
    </AppShell>
  );
}
