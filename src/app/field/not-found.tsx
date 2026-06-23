import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";

export default function FieldNotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Sección de campo no encontrada"
        description="Esta base solo expone la pantalla principal de campo."
      />
    </AppShell>
  );
}
