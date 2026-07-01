"use client";

import { useState } from "react";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { importHutRegistrationSlotsAction } from "@/modules/hut/actions";

type HutRegistrationSlotImportPanelProps = {
  requestOrigin: string;
  studyId: string;
};

export function HutRegistrationSlotImportPanel({ requestOrigin, studyId }: HutRegistrationSlotImportPanelProps) {
  const [slotsText, setSlotsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function readFile(file: File | null) {
    setError(null);

    if (!file) {
      return;
    }

    try {
      setSlotsText(await file.text());
    } catch {
      setError("No fue posible leer el archivo. Intenta con TSV, CSV o texto pegado.");
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Importar folios y rotacion</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Usa columnas en este orden: folio, primera fragancia / brazo izquierdo, segunda fragancia / brazo derecho.
      </p>
      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      <form action={importHutRegistrationSlotsAction.bind(null, studyId)} className="mt-4 space-y-3">
        <input name="requestOrigin" type="hidden" value={requestOrigin} />
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Archivo de folios
          <input
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
            onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Folios a importar
          <textarea
            className="min-h-36 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-950"
            name="slotsText"
            onChange={(event) => setSlotsText(event.target.value)}
            placeholder={"folio\tprimera fragancia / brazo izquierdo\tsegunda fragancia / brazo derecho"}
            required
            value={slotsText}
          />
        </label>
        <SubmitButton pendingLabel="Importando folios...">Importar folios HUT</SubmitButton>
      </form>
    </section>
  );
}
