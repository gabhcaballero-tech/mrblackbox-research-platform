"use client";

import { AppShell } from "@/shared/ui/AppShell";
import { ErrorState } from "@/shared/ui/ErrorState";
import { UI_LABELS } from "@/shared/ui/labels";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <AppShell>
      <ErrorState
        title="Administración no disponible"
        message="La vista administrativa no pudo cargarse."
        action={
          <button
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            onClick={reset}
            type="button"
          >
            {UI_LABELS.actions.retry}
          </button>
        }
      />
    </AppShell>
  );
}
