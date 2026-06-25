"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { archiveStudyAction, deleteEmptyStudyAction } from "@/modules/studies/actions";
import { initialStudyActionState, type StudyActionState } from "@/modules/studies/action-state";
import type { StudyRiskState } from "@/modules/studies/repository";

type StudyDangerZoneProps = {
  risk: StudyRiskState;
};

export function StudyDangerZone({ risk }: StudyDangerZoneProps) {
  const [archiveState, archiveFormAction] = useActionState(
    archiveStudyAction.bind(null, risk.id),
    initialStudyActionState
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteEmptyStudyAction.bind(null, risk.id),
    initialStudyActionState
  );
  const canDelete = risk.deletionBlockers.length === 0;
  const isArchived = risk.status === "ARCHIVED";

  return (
    <section className="space-y-5 rounded-lg border border-red-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Zona de riesgo</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Archivo y limpieza del estudio</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Estas acciones son solo para ADMIN. Archivar conserva toda la trazabilidad; eliminar se permite
          unicamente para estudios de prueba sin datos operativos.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form action={archiveFormAction} className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">Archivar estudio</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Este estudio se ocultara de los listados activos y se cerrara su acceso publico, pero sus
              datos se conservaran.
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Estudio: <span className="font-mono font-semibold">{risk.code}</span>
            </p>
          </div>

          {isArchived ? (
            <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
              Este estudio ya esta archivado.
            </p>
          ) : (
            <>
              <ConfirmationField
                label="Escribe ARCHIVAR ESTUDIO para confirmar"
                name="confirmation"
                placeholder="ARCHIVAR ESTUDIO"
              />
              <FormMessage state={archiveState} />
              <RiskSubmitButton pendingLabel="Archivando estudio...">Archivar estudio</RiskSubmitButton>
            </>
          )}
        </form>

        <form action={deleteFormAction} className="space-y-4 rounded-md border border-red-200 bg-red-50 p-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">Eliminar estudio de prueba</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Solo se puede eliminar definitivamente un estudio sin participantes, respuestas, evidencias ni
              registros operativos.
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Estudio: <span className="font-mono font-semibold">{risk.code}</span>
            </p>
          </div>

          {canDelete ? (
            <>
              <ConfirmationField
                label="Escribe ELIMINAR ESTUDIO para confirmar"
                name="confirmation"
                placeholder="ELIMINAR ESTUDIO"
              />
              <FormMessage state={deleteState} />
              <RiskSubmitButton pendingLabel="Eliminando estudio...">Eliminar estudio de prueba</RiskSubmitButton>
            </>
          ) : (
            <>
              <p className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-800">
                Este estudio ya tiene datos registrados. Para conservar trazabilidad solo puede archivarse.
              </p>
              <ul className="space-y-1 text-sm text-red-800">
                {risk.deletionBlockers.map((blocker) => (
                  <li key={blocker.key}>
                    {blocker.label}: <span className="font-semibold">{blocker.count}</span>
                  </li>
                ))}
              </ul>
              <button
                aria-disabled="true"
                className="rounded-md border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-500"
                disabled
                type="button"
              >
                Eliminar estudio de prueba
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

function ConfirmationField({
  label,
  name,
  placeholder
}: {
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
        name={name}
        placeholder={placeholder}
      />
    </label>
  );
}

function FormMessage({ state }: { state: StudyActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const tone =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-white text-red-800";

  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${tone}`} role={state.status === "success" ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

function RiskSubmitButton({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-600"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
