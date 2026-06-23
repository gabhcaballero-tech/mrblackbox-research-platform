import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";

export default function FieldNotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Seccion de campo no encontrada"
        description="Esta base solo expone el placeholder principal de campo."
      />
    </AppShell>
  );
}
