import Link from "next/link";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { APP_ROUTES } from "@/shared/types/routes";

export default function NotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Página no encontrada"
        description="La ruta solicitada no existe en esta base técnica inicial."
        action={
          <Link
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            href={APP_ROUTES.home}
          >
            Volver al inicio
          </Link>
        }
      />
    </AppShell>
  );
}
