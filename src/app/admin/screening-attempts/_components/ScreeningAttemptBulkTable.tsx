"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ScreeningAttemptListItem } from "@/modules/screening-supervision";
import { deleteSelectedParticipantEvidenceTestRecordsAction } from "@/modules/participant-portal/evidence-review-actions";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";

export function ScreeningAttemptBulkTable({
  attempts,
  studyId
}: {
  attempts: ScreeningAttemptListItem[];
  studyId: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const visibleIds = useMemo(() => attempts.map((attempt) => attempt.id), [attempts]);
  const selectedSet = new Set(selectedIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const canSubmit = selectedIds.length > 0 && confirmationText.trim() === "ELIMINAR" && reason.trim().length > 0;

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
    setShowConfirmation(false);
  }

  function toggleAttempt(attemptId: string) {
    setSelectedIds((current) =>
      current.includes(attemptId) ? current.filter((id) => id !== attemptId) : [...current, attemptId]
    );
    setShowConfirmation(false);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm" aria-label="Intentos de screener">
      <div className="border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-700">{selectedIds.length} seleccionados</p>
          {selectedIds.length > 0 ? (
            <button
              className="inline-flex w-fit rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              onClick={() => setShowConfirmation((current) => !current)}
              type="button"
            >
              Eliminar y liberar folios
            </button>
          ) : null}
        </div>
        {showConfirmation ? (
          <form
            action={deleteSelectedParticipantEvidenceTestRecordsAction.bind(null, studyId)}
            className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4"
          >
            <h3 className="font-semibold text-rose-950">Eliminar registros seleccionados</h3>
            <p className="mt-2 text-sm leading-6 text-rose-900">
              Esta acción eliminará los registros seleccionados del cuestionario filtro y liberará sus folios/registros asociados.
              Esta acción no se puede deshacer.
            </p>
            <p className="mt-2 text-sm leading-6 text-rose-900">
              Si algún participante ya inició actividades Navigo, ese registro se omitirá y deberá restablecerse desde App Navigo.
            </p>
            {selectedIds.map((attemptId) => (
              <input key={attemptId} name="attemptIds" type="hidden" value={attemptId} />
            ))}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className={labelClass}>
                Escribe ELIMINAR para confirmar
                <input
                  className={inputClass}
                  name="confirmationText"
                  onChange={(event) => setConfirmationText(event.target.value)}
                  value={confirmationText}
                />
              </label>
              <label className={labelClass}>
                Motivo obligatorio
                <textarea
                  className={inputClass}
                  name="deleteReason"
                  onChange={(event) => setReason(event.target.value)}
                  required
                  rows={2}
                  value={reason}
                />
              </label>
            </div>
            <button
              className="mt-4 inline-flex w-fit rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
              type="submit"
            >
              Eliminar seleccionados
            </button>
          </form>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className={`${thClass} w-[54px]`}>
                <label className="flex items-center gap-2">
                  <input
                    aria-label="Seleccionar todos los visibles"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    type="checkbox"
                  />
                </label>
              </th>
              <th className={`${thClass} w-[220px]`}>Participante</th>
              <th className={`${thClass} w-[92px]`}>Referencia</th>
              <th className={`${thClass} w-[140px]`}>Entrevistador</th>
              <th className={`${thClass} w-[110px]`}>Estado</th>
              <th className={`${thClass} w-[120px]`}>Código</th>
              <th className={`${thClass} min-w-[260px]`}>Motivo</th>
              <th className={`${thClass} w-[130px]`}>NSE</th>
              <th className={`${thClass} w-[150px]`}>Inicio</th>
              <th className={`${thClass} w-[150px]`}>Cierre</th>
              <th className={`${thClass} w-[76px]`}>Versión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {attempts.map((attempt) => (
              <tr key={attempt.id} className="align-top">
                <td className={`${tdClass} whitespace-nowrap`}>
                  <input
                    aria-label={`Seleccionar ${attempt.participant.name}`}
                    checked={selectedSet.has(attempt.id)}
                    onChange={() => toggleAttempt(attempt.id)}
                    type="checkbox"
                  />
                </td>
                <td className={`${tdClass} min-w-[220px]`}>
                  <div className="space-y-1.5">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-950" title={attempt.participant.name}>
                      {attempt.participant.name}
                    </p>
                    {attempt.recruiterName ? (
                      <p className="line-clamp-1 text-xs text-zinc-500" title={`Reclutador: ${attempt.recruiterName}`}>
                        Reclutador: {attempt.recruiterName}
                      </p>
                    ) : null}
                    <Link
                      className="inline-flex w-fit rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
                      href={`/admin/screening-attempts/${attempt.id}`}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>{referenceLabel(attempt.participant.externalReference)}</td>
                <td className={`${tdClass} max-w-[140px]`}>
                  <span className="block truncate" title={interviewerLabel(attempt)}>
                    {interviewerLabel(attempt)}
                  </span>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>
                  <StatusBadge status={badgeToneForAttempt(attempt.status, attempt.statusLabel)}>{attempt.statusLabel}</StatusBadge>
                </td>
                <td className={`${tdClass} max-w-[120px] font-mono text-xs`}>
                  <span className="block truncate" title={attempt.terminationCode ?? "No aplica"}>
                    {attempt.terminationCode ?? "—"}
                  </span>
                </td>
                <td className={`${tdClass} min-w-[260px]`}>
                  <span className="block line-clamp-2 leading-5" title={attempt.terminationReason ?? "No aplica"}>
                    {attempt.terminationReason ?? "—"}
                  </span>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>{compactNse(attempt)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{formatDate(attempt.startedAt, attempt.study.timeZoneIana)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{formatDate(attempt.closedAt, attempt.study.timeZoneIana)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{compactVersion(attempt.screenerVersionNumber)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-100 px-4 py-3">
        <Link className="text-sm font-semibold text-zinc-700 hover:text-zinc-950" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
      </div>
    </section>
  );
}

function formatDate(value: Date | null, timeZoneIana?: string | null): string {
  if (!value) {
    return "Sin cierre";
  }

  void timeZoneIana;
  return formatDateTimeMexicoCity(value);
}

function badgeTone(status: ScreeningAttemptListItem["status"]) {
  if (status === "PASSED") {
    return "ready";
  }

  if (status === "TERMINATED") {
    return "blocked";
  }

  return "planned";
}

function badgeToneForAttempt(status: ScreeningAttemptListItem["status"], label: string) {
  if (label === "Elegible confirmado" || label === "Aprobado") {
    return "ready";
  }

  if (label === "Evidencia rechazada") {
    return "blocked";
  }

  return badgeTone(status);
}

function compactNse(attempt: ScreeningAttemptListItem): string {
  if (attempt.nseScore === null) {
    return "No calculado";
  }

  return attempt.nseClassLabel ? `${attempt.nseScore} · ${attempt.nseClassLabel}` : String(attempt.nseScore);
}

function interviewerLabel(attempt: ScreeningAttemptListItem): string {
  return attempt.fieldUser?.name.trim() || attempt.fieldUser?.email || "Portal participante";
}

function referenceLabel(reference: string | null): string {
  return reference?.trim() || "—";
}

function compactVersion(version: number): string {
  return `v${version}`;
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-rose-950";
const inputClass =
  "min-h-10 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100";
const thClass = "px-3 py-3";
const tdClass = "px-3 py-4 text-zinc-700";
