"use client";

import { useState } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { importHutParticipantsAction } from "@/modules/hut/actions";

type HutParticipantImportPanelProps = {
  requestOrigin: string;
  studyId: string;
};

export function HutParticipantImportPanel({ requestOrigin, studyId }: HutParticipantImportPanelProps) {
  const [participantsText, setParticipantsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function readFile(file: File | null) {
    setError(null);

    if (!file) {
      return;
    }

    try {
      setParticipantsText(await file.text());
    } catch {
      setError("No fue posible leer el archivo. Intenta con TSV, CSV o texto pegado.");
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Importar participantes HUT</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Usa columnas en este orden: nombre, celular, correo, reclutador. Se aceptan TSV, CSV o punto y coma.
      </p>
      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      <form action={importHutParticipantsAction.bind(null, studyId)} className="mt-4 space-y-3">
        <input name="requestOrigin" type="hidden" value={requestOrigin} />
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Archivo de participantes
          <input
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
            onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Participantes a importar
          <textarea
            className="min-h-36 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-950"
            name="participantsText"
            onChange={(event) => setParticipantsText(event.target.value)}
            placeholder={"nombre\tcelular\tcorreo\treclutador"}
            required
            value={participantsText}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Fecha de inicio de bloque 1
          <input className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950" name="startDate" type="date" />
        </label>
        <SubmitButton pendingLabel="Importando participantes...">Importar participantes HUT</SubmitButton>
      </form>
    </section>
  );
}
