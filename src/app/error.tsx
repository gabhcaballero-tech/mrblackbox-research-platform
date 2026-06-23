"use client";

import { AppShell } from "@/shared/ui/AppShell";
import { ErrorState } from "@/shared/ui/ErrorState";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell>
      <ErrorState
        title="No pudimos cargar esta vista"
        message={error.message || "Ocurrio un problema inesperado en la maqueta tecnica."}
        action={
          <button
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            onClick={reset}
            type="button"
          >
            Reintentar
          </button>
        }
      />
    </AppShell>
  );
}
