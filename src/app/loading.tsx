import { AppShell } from "@/shared/ui/AppShell";
import { LoadingState } from "@/shared/ui/LoadingState";

export default function Loading() {
  return (
    <AppShell>
      <LoadingState message="Cargando la base interna..." />
    </AppShell>
  );
}
