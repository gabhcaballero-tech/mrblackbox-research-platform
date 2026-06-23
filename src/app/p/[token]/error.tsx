"use client";

import { AppShell } from "@/shared/ui/AppShell";
import { ErrorState } from "@/shared/ui/ErrorState";

export default function ParticipantError({ reset }: { reset: () => void }) {
  return (
    <AppShell>
      <ErrorState
        title="Acceso de participante no disponible"
        message="No pudimos cargar el placeholder de participante."
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
