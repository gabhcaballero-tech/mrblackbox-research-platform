"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyNavigoRotationWorkbookImportRowsAction,
  previewNavigoRotationWorkbookImportAction
} from "@/modules/navigo-app/actions";
import {
  initialNavigoRotationWorkbookImportActionState,
  type NavigoRotationWorkbookImportActionState
} from "@/modules/navigo-app/rotation-workbook-import-state";

type NavigoRotationWorkbookImportPanelProps = {
  studyId: string;
};

export function NavigoRotationWorkbookImportPanel({ studyId }: NavigoRotationWorkbookImportPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<NavigoRotationWorkbookImportActionState>(
    initialNavigoRotationWorkbookImportActionState
  );
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const canApply = Boolean(
    state.filename && state.preview && state.preview.summary.validRows > 0 && state.preview.summary.rowsWithError === 0
  );

  async function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setState({
        filename: null,
        hutRows: [],
        message: "Selecciona ROTACIONES NAVIGO.xlsx.",
        preview: null,
        rows: [],
        status: "error"
      });
      return;
    }

    setIsPreviewing(true);
    try {
      const formData = new FormData();
      formData.set("rotationWorkbookFile", file);
      const result = await previewNavigoRotationWorkbookImportAction(studyId, formData);
      setState(result);
    } catch {
      setState({
        filename: file.name,
        hutRows: [],
        message: "No fue posible previsualizar el XLSX oficial. Revisa el archivo e intenta de nuevo.",
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

    if (!canApply || !state.filename || isApplying) {
      return;
    }

    setIsApplying(true);
    try {
      const result = await applyNavigoRotationWorkbookImportRowsAction(studyId, state.filename, state.rows, state.hutRows);
      setState(result.status === "error" && !result.preview && state.preview ? { ...result, preview: state.preview } : result);

      if (result.status === "success") {
        router.refresh();
      }
    } catch {
      setState({
        filename: state.filename,
        hutRows: state.hutRows,
        message: "No fue posible aplicar el XLSX oficial. Revisa la previsualizacion e intenta de nuevo.",
        preview: state.preview,
        rows: state.rows,
        status: "error"
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-800">ROTACIONES NAVIGO.xlsx</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Carga oficial de rotacion y triangular CTL</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Este importador lee la hoja CLT y la hoja HUT del XLSX oficial. CLT conserva rotacion Navigo y triangular CTL;
          HUT guarda su propia rotacion EVA1/EVA2 sin usar la rotacion Navigo.
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-700">
          El importador CSV/TSV anterior sigue disponible abajo para ajustes simples de EVA1/EVA2.
        </p>
      </div>

      <form className="mt-5 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handlePreviewSubmit}>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
          Archivo XLSX oficial
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
            name="rotationWorkbookFile"
            ref={fileInputRef}
            required
            type="file"
          />
        </label>
        <button
          className="inline-flex rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={isPreviewing || isApplying}
          type="submit"
        >
          {isPreviewing ? "Previsualizando..." : "Previsualizar XLSX"}
        </button>
      </form>

      <StatusMessage state={state} />
      {state.preview ? <WorkbookPreview state={state} /> : null}

      <form className="mt-5" onSubmit={handleApplySubmit}>
        <button
          className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={!canApply || isApplying || isPreviewing}
          type="submit"
        >
          {isApplying ? "Aplicando XLSX..." : "Aplicar ROTACIONES NAVIGO.xlsx"}
        </button>
        {!canApply ? (
          <p className="mt-2 text-xs text-zinc-600">Corrige errores y vuelve a previsualizar antes de aplicar.</p>
        ) : null}
      </form>
    </section>
  );
}

function StatusMessage({ state }: { state: NavigoRotationWorkbookImportActionState }) {
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

function WorkbookPreview({ state }: { state: NavigoRotationWorkbookImportActionState }) {
  const preview = state.preview;
  if (!preview) {
    return null;
  }

  const validRows = preview.rows.filter((row) => row.errors.length === 0);
  const errorRows = preview.rows.filter((row) => row.errors.length > 0);

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-950">Previsualizacion XLSX oficial</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Filas leidas" value={preview.summary.totalRows} />
        <Metric label="Validas" value={preview.summary.validRows} />
        <Metric label="Con error" value={preview.summary.rowsWithError} />
        <Metric label="Folios encontrados" value={preview.summary.foundFolios} />
        <Metric label="Triangular completo" value={preview.summary.triangularComplete} />
        <Metric label="Triangular existente" value={preview.summary.existingTriangularRotations} />
      </dl>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Filas HUT" value={preview.summary.hut.totalRows} />
        <Metric label="HUT validas" value={preview.summary.hut.validRows} />
        <Metric label="HUT con error" value={preview.summary.hut.rowsWithError} />
        <Metric label="HUT participantes" value={preview.summary.hut.existingParticipants} />
        <Metric label="HUT slots" value={preview.summary.hut.existingSlots} />
        <Metric label="HUT con avance" value={preview.summary.hut.withProgress} />
      </dl>

      <PreviewTable rows={validRows.slice(0, 12)} title="Filas listas" />
      <PreviewTable rows={errorRows.slice(0, 12)} showErrors title="Errores encontrados" />
      <HutPreviewTable rows={preview.hutRows.slice(0, 12)} />
    </div>
  );
}

function PreviewTable({
  rows,
  showErrors = false,
  title
}: {
  rows: NonNullable<NavigoRotationWorkbookImportActionState["preview"]>["rows"];
  showErrors?: boolean;
  title: string;
}) {
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold text-zinc-950">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Sin filas para mostrar.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Fila</th>
                <th className="px-2 py-2">Folio</th>
                <th className="px-2 py-2">EVA1</th>
                <th className="px-2 py-2">EVA2</th>
                <th className="px-2 py-2">Triangular 1</th>
                <th className="px-2 py-2">Triangular 2</th>
                <th className="px-2 py-2">{showErrors ? "Error" : "Estado"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={`${row.rowNumber}-${row.folio}-${showErrors ? "error" : "valid"}`}>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-500">{row.rowNumber}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.folio || "-"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.primeraFragancia || "-"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.segundaFragancia || "-"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">
                    {[row.triangular1Pr1, row.triangular1Pr2, row.triangular1Pr3].join(" / ")}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">
                    {[row.triangular2Pr1, row.triangular2Pr2, row.triangular2Pr3].join(" / ")}
                  </td>
                  <td className="px-2 py-2">
                    {showErrors ? (
                      <span className="text-xs font-semibold text-rose-700">{row.errors.join("; ")}</span>
                    ) : row.existingTriangularRotation || row.existingRotation ? (
                      <span className="text-xs font-semibold text-amber-700">Actualizara asignacion existente</span>
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

function HutPreviewTable({ rows }: { rows: NonNullable<NavigoRotationWorkbookImportActionState["preview"]>["hutRows"] }) {
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold text-zinc-950">Hoja HUT</h4>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          No se detectaron filas HUT en el XLSX.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Fila</th>
                <th className="px-2 py-2">Folio</th>
                <th className="px-2 py-2">EVA1 HUT</th>
                <th className="px-2 py-2">EVA2 HUT</th>
                <th className="px-2 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={`hut-${row.rowNumber}-${row.folio}`}>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-500">{row.rowNumber}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.folio || "-"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.hutEva1 || "-"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-zinc-900">{row.hutEva2 || "-"}</td>
                  <td className="px-2 py-2">
                    {row.errors.length > 0 ? (
                      <span className="text-xs font-semibold text-rose-700">{row.errors.join("; ")}</span>
                    ) : row.existingHutParticipant || row.existingHutSlot ? (
                      <span className="text-xs font-semibold text-amber-700">Actualizara/vinculara HUT</span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700">Creara HUT</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
