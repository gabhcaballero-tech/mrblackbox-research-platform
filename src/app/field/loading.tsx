import { AppShell } from "@/shared/ui/AppShell";
import { LoadingState } from "@/shared/ui/LoadingState";

export default function FieldLoading() {
  return (
    <AppShell>
      <LoadingState message="Cargando campo..." />
    </AppShell>
  );
}
