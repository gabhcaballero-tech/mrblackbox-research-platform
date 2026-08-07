"use client";

import { useState, useTransition } from "react";
import { recoverHutPhaseCodeAction, regenerateHutPhaseCodeAction } from "@/modules/hut/actions";
import type { HutPhase } from "@/modules/hut";

export function HutPhaseCodeControls({
  disabled,
  participantId,
  phase,
  studyId
}: {
  disabled?: boolean;
  participantId: string;
  phase: HutPhase;
  studyId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ code?: string; message: string; ok: boolean } | null>(null);

  function run(action: "recover" | "regenerate") {
    setResult(null);
    startTransition(async () => {
      const response =
        action === "recover"
          ? await recoverHutPhaseCodeAction(studyId, participantId, phase)
          : await regenerateHutPhaseCodeAction(studyId, participantId, phase);
      setResult(response);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || isPending}
          onClick={() => run("recover")}
          type="button"
        >
          {isPending ? "Procesando..." : "Recuperar codigo"}
        </button>
        <button
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || isPending}
          onClick={() => run("regenerate")}
          type="button"
        >
          {isPending ? "Procesando..." : "Regenerar codigo"}
        </button>
      </div>
      {result ? (
        <div
          className={
            result.ok
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
              : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
          }
        >
          <p className="font-semibold">{result.message}</p>
          {result.code ? <p className="mt-1 font-mono text-sm tracking-[0.2em]">{result.code}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
