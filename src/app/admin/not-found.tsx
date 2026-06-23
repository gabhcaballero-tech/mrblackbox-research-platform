import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";

export default function AdminNotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Sección administrativa no encontrada"
        description="Esta base solo expone la administración inicial de estudios."
      />
    </AppShell>
  );
}
