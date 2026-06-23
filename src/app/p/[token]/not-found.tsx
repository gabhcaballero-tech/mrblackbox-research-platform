import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";

export default function ParticipantNotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Enlace no reconocido"
        description="El identificador del enlace no cumple el formato esperado para esta maqueta técnica."
      />
    </AppShell>
  );
}
