import { AppShell } from "@/shared/ui/AppShell";
import { LoadingState } from "@/shared/ui/LoadingState";

export default function ParticipantLoading() {
  return (
    <AppShell>
      <LoadingState message="Preparando acceso de participante..." />
    </AppShell>
  );
}
