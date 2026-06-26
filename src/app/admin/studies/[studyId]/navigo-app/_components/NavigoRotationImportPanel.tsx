"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import {
  applyNavigoRotationImportRowsAction,
  previewNavigoRotationImportTextAction
} from "@/modules/navigo-app/actions";
import {
  initialNavigoRotationImportActionState,
  type NavigoRotationImportActionState
} from "@/modules/navigo-app/rotation-import-state";

type NavigoRotationImportPanelProps = {
  studyId: string;
};

export function NavigoRotationImportPanel({ studyId }: NavigoRotationImportPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<NavigoRotationImportActionState>(initialNavigoRotationImportActionState);
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const canApply = Boolean(
    state.preview && state.preview.summary.validRows > 0 && state.preview.summary.rowsWithError === 0
  );

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
      const text = await file.text();
      const result = await previewNavigoRotationImportTextAction(studyId, file.name, text);
      setState(result);
    } catch {
      setState({
        message: "No fue posible previsualizar el archivo. Revisa que sea CSV o TSV y vuelve a intentarlo.",
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
      const result = await applyNavigoRotationImportRowsAction(studyId, state.rows);
      setState(result);

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
    <section className="rounded-lg border border-teal-200 bg-teal-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Importar rotacion</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">Asignacion masiva por folio</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            Usa un archivo CSV o TSV compatible con Excel. No se procesa XLSX directamente.
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-700">
            El archivo debe incluir folio, primera fragancia y segunda fragancia. Tambien se aceptan columnas como
            izquierdo/derecho o left/right.
          </p>
        </div>
        <Link
          className="inline-flex w-fit rounded-md border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
          href={`/admin/studies/${studyId}/navigo-app/rotation-template`}
        >
          Descargar plantilla de rotacion
        </Link>
      </div>

      <form className="mt-5 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handlePreviewSubmit}>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
          Archivo CSV/TSV
          <input
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
            name="rotationFile"
            ref={fileInputRef}
            required
            type="file"
          />
        </label>
        <button
          className="inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={isPreviewing || isApplying}
          type="submit"
        >
          {isPreviewing ? "Previsualizando..." : "Previsualizar archivo"}
        </button>
      </form>

      <StatusMessage state={state} />
      {state.preview ? <ImportPreview state={state} /> : null}

      <form className="mt-5" onSubmit={handleApplySubmit}>
        <button
          className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={!canApply || isApplying || isPreviewing}
          type="submit"
        >
          {isApplying ? "Aplicando importacion..." : "Aplicar importacion"}
        </button>
        {!canApply ? (
          <p className="mt-2 text-xs text-zinc-600">Corrige errores y vuelve a previsualizar antes de aplicar.</p>
        ) : null}
      </form>
    </section>
  );
}

function StatusMessage({ state }: { state: NavigoRotationImportActionState }) {
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

function ImportPreview({ state }: { state: NavigoRotationImportActionState }) {
  const preview = state.preview;

  if (!preview) {
    return null;
  }

  const validRows = preview.rows.filter((row) => row.errors.length === 0);
  const errorRows = preview.rows.filter((row) => row.errors.length > 0);

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-950">Previsualizacion</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Filas leidas" value={preview.summary.totalRows} />
        <Metric label="Validas" value={preview.summary.validRows} />
        <Metric label="Con error" value={preview.summary.rowsWithError} />
        <Metric label="Folios encontrados" value={preview.summary.foundFolios} />
        <Metric label="Folios no encontrados" value={preview.summary.missingFolios} />
        <Metric label="Actualizables" value={preview.summary.updatable} />
      </dl>
      {preview.summary.t0Started > 0 ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {preview.summary.t0Started} participante(s) ya tienen T0 iniciado y no se actualizaran.
        </p>
      ) : null}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-zinc-950">Filas validas</h4>
        {validRows.length === 0 ? (
          <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            No hay filas listas para importar.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Fila</th>
                  <th className="px-2 py-2">Folio</th>
                  <th className="px-2 py-2">1a fragancia</th>
                  <th className="px-2 py-2">2a fragancia</th>
                  <th className="px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {validRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.folio}-valid`}>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-500">{row.rowNumber}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.folio || "-"}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.primeraFragancia || "-"}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.segundaFragancia || "-"}</td>
                    <td className="px-2 py-2">
                      {row.existingRotation ? (
                        <span className="text-xs font-semibold text-amber-700">Actualizara rotacion existente</span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Lista para importar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-zinc-950">Errores encontrados</h4>
        {errorRows.length === 0 ? (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            No se encontraron errores bloqueantes.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Fila</th>
                  <th className="px-2 py-2">Folio</th>
                  <th className="px-2 py-2">1a fragancia</th>
                  <th className="px-2 py-2">2a fragancia</th>
                  <th className="px-2 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {errorRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.folio}-error`}>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-500">{row.rowNumber}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.folio || "-"}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.primeraFragancia || "-"}</td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.segundaFragancia || "-"}</td>
                    <td className="px-2 py-2">
                      <span className="text-xs font-semibold text-rose-700">{row.errors.join("; ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
