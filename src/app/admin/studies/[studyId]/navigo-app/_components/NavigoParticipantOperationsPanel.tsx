"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import {
  applyNavigoParticipantImportRowsAction,
  previewNavigoParticipantImportTextAction
} from "@/modules/navigo-app/actions";
import {
  initialNavigoParticipantImportActionState,
  type NavigoParticipantImportActionState
} from "@/modules/navigo-app/participant-import-state";

type NavigoParticipantOperationsPanelProps = {
  studyId: string;
};

export function NavigoParticipantOperationsPanel({ studyId }: NavigoParticipantOperationsPanelProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Operacion masiva de participantes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Registra participantes, genera enlaces y descarga un archivo compatible con Excel.
          </p>
        </div>
        <Link
          className="inline-flex w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
          href={`/admin/studies/${studyId}/navigo-app/links-rotation-export`}
        >
          Exportar enlaces y rotacion
        </Link>
      </div>

      <div className="mt-5 grid gap-4">
        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-teal-700">Importar participantes</summary>
          <ParticipantImportPanel studyId={studyId} />
        </details>
      </div>
    </section>
  );
}

function ParticipantImportPanel({ studyId }: { studyId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<NavigoParticipantImportActionState>(initialNavigoParticipantImportActionState);
  const [generateLinks, setGenerateLinks] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const canApply = Boolean(state.preview && state.preview.summary.validRows > 0 && state.preview.summary.rowsWithError === 0);

  async function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setState({
        message: "Selecciona un archivo CSV o TSV compatible con Excel.",
        preview: null,
        rows: [],
        status: "error"
      });
      return;
    }

    setIsPreviewing(true);
    try {
      setState(await previewNavigoParticipantImportTextAction(studyId, file.name, await file.text()));
    } catch {
      setState({
        message: "No fue posible previsualizar participantes por un error tecnico. Revisa logs.",
        preview: null,
        rows: [],
        status: "error"
      });
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleApplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canApply || isApplying) {
      return;
    }

    setIsApplying(true);
    try {
      const result = await applyNavigoParticipantImportRowsAction(studyId, state.rows, generateLinks);
      setState(result.status === "error" && !result.preview && state.preview ? { ...result, preview: state.preview } : result);
      if (result.status === "success") {
        router.refresh();
      }
    } catch {
      setState({
        message: "No fue posible aplicar la importacion. Revisa la previsualizacion e intenta de nuevo.",
        preview: state.preview,
        rows: state.rows,
        status: "error"
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-6 text-zinc-600">
          Usa TSV o CSV. Columnas minimas: folio, nombre, celular, primera_fragancia y segunda_fragancia.
        </p>
        <Link
          className="inline-flex w-fit rounded-md border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
          href={`/admin/studies/${studyId}/navigo-app/participants-template`}
        >
          Descargar plantilla de participantes
        </Link>
      </div>
      <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handlePreviewSubmit}>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
          Archivo CSV/TSV
          <input
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className={inputClass}
            ref={fileInputRef}
            required
            type="file"
          />
        </label>
        <button className={primaryButtonClass} disabled={isPreviewing || isApplying} type="submit">
          {isPreviewing ? "Previsualizando..." : "Previsualizar participantes"}
        </button>
      </form>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input checked={generateLinks} onChange={(event) => setGenerateLinks(event.target.checked)} type="checkbox" />
        Generar link al importar
      </label>
      <StatusMessage state={state} />
      {state.preview ? <ParticipantImportPreview state={state} /> : null}
      <form className="mt-5" onSubmit={handleApplySubmit}>
        <button className={darkButtonClass} disabled={!canApply || isApplying || isPreviewing} type="submit">
          {isApplying ? "Aplicando importacion..." : "Aplicar importacion"}
        </button>
        {!canApply ? (
          <p className="mt-2 text-xs text-zinc-600">Corrige errores y vuelve a previsualizar antes de aplicar.</p>
        ) : null}
      </form>
    </div>
  );
}

function StatusMessage({ state }: { state: NavigoParticipantImportActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={`mt-4 rounded-md border px-3 py-2 text-sm ${
        state.status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      {state.message}
    </p>
  );
}

function ParticipantImportPreview({ state }: { state: NavigoParticipantImportActionState }) {
  const preview = state.preview;
  if (!preview) {
    return null;
  }

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-950">Previsualizacion</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Filas leidas" value={preview.summary.totalRows} />
        <Metric label="Validas" value={preview.summary.validRows} />
        <Metric label="Con error" value={preview.summary.rowsWithError} />
        <Metric label="Folios nuevos" value={preview.summary.newFolios} />
        <Metric label="Folios existentes" value={preview.summary.existingFolios} />
        <Metric label="Celulares duplicados" value={preview.summary.phoneDuplicates} />
        <Metric label="Rotaciones completas" value={preview.summary.rotationComplete} />
      </dl>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-2">Fila</th>
              <th className="px-2 py-2">Folio</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Celular</th>
              <th className="px-2 py-2">1a fragancia</th>
              <th className="px-2 py-2">2a fragancia</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Errores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {preview.rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.folio}-${row.celular}`}>
                <td className="px-2 py-2 font-mono text-xs text-zinc-500">{row.rowNumber}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.folio || "-"}</td>
                <td className="px-2 py-2 text-zinc-900">{row.nombre || "-"}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.celular || "-"}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.primeraFragancia || "-"}</td>
                <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.segundaFragancia || "-"}</td>
                <td className="px-2 py-2">
                  {row.errors.length > 0 ? (
                    <span className="text-xs font-semibold text-rose-700">Requiere correccion</span>
                  ) : row.existingParticipant || row.existingFolio ? (
                    <span className="text-xs font-semibold text-amber-700">Actualizara participante existente</span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700">Lista para importar</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {row.errors.length > 0 ? (
                    <span className="text-xs font-semibold text-rose-700">{row.errors.join("; ")}</span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700">Lista</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass =
  "inline-flex justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const darkButtonClass =
  "inline-flex justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
