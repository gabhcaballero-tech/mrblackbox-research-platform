import { AppShell } from "@/shared/ui/AppShell";
import { LoadingState } from "@/shared/ui/LoadingState";

export default function AdminLoading() {
  return (
    <AppShell>
      <LoadingState message="Cargando administración..." />
    </AppShell>
  );
}
