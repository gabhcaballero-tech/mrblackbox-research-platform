import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";

export default function AdminNotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Seccion administrativa no encontrada"
        description="Esta base solo expone el placeholder principal de administracion."
      />
    </AppShell>
  );
}
