"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createCtlInterviewerCodeAction,
  deleteCtlInterviewerCodeAction,
  resetCtlInterviewerCodeAction,
  updateCtlInterviewerCodeStatusAction,
  type CreateCtlInterviewerCodeActionState
} from "@/modules/ctl/actions";
import type { CtlInterviewerCodeView } from "@/modules/ctl/repository";

type CtlInterviewerCodesSectionProps = {
  codes: CtlInterviewerCodeView[];
  studyId: string;
};

const initialState: CreateCtlInterviewerCodeActionState = {
  message: "",
  status: "idle"
};

export function CtlInterviewerCodesSection({ codes, studyId }: CtlInterviewerCodesSectionProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createCtlInterviewerCodeAction.bind(null, studyId),
    initialState
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetCtlInterviewerCodeAction.bind(null, studyId),
    initialState
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  useEffect(() => {
    if (resetState.status === "success") {
      router.refresh();
    }
  }, [router, resetState.status]);

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-zinc-950">Codigos de encuestadores IKA</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Genera codigos para el acceso publico CTL. El codigo plano solo se muestra al crearlo.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <form action={formAction} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <h3 className="font-semibold text-zinc-950">Crear codigo</h3>
          <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Nombre o etiqueta del encuestador
            <input
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
              name="label"
              placeholder="Encuestador IKA 1"
              required
            />
          </label>
          <button
            className="mt-4 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            disabled={pending}
            type="submit"
          >
            {pending ? "Generando..." : "Generar codigo"}
          </button>

          {state.message ? (
            <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}>
              {state.message}
            </p>
          ) : null}
          <OneTimeCodeNotice state={state} />
          <OneTimeCodeNotice state={resetState} />
        </form>

        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Creacion</th>
                <th className="px-4 py-3">Expiracion</th>
                <th className="px-4 py-3">Ultimo uso</th>
                <th className="px-4 py-3">Sesiones</th>
                <th className="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {codes.length > 0 ? codes.map((code) => (
                <tr key={code.id}>
                  <td className="px-4 py-3 font-semibold text-zinc-950">{code.label}</td>
                  <td className="px-4 py-3 text-zinc-700">{interviewerCodeStatusLabel(code.status)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDateTime(code.createdAt)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDateTime(code.expiresAt)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDateTime(code.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-zinc-700">{code.sessionCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                    {code.status === "ACTIVE" ? (
                      <form action={updateCtlInterviewerCodeStatusAction.bind(null, studyId, code.id, "DISABLED")}>
                        <button className="font-semibold text-rose-700 hover:text-rose-800" type="submit">
                          Desactivar
                        </button>
                      </form>
                    ) : (
                      <form action={updateCtlInterviewerCodeStatusAction.bind(null, studyId, code.id, "ACTIVE")}>
                        <button className="font-semibold text-teal-700 hover:text-teal-800" type="submit">
                          Reactivar
                        </button>
                      </form>
                    )}
                      <form action={resetAction}>
                        <input name="ctlInterviewerCodeId" type="hidden" value={code.id} />
                        <button
                          className="font-semibold text-amber-700 hover:text-amber-800 disabled:text-zinc-400"
                          disabled={resetPending}
                          type="submit"
                        >
                          Regenerar codigo
                        </button>
                      </form>
                      <form action={deleteCtlInterviewerCodeAction.bind(null, studyId, code.id)}>
                        <button className="font-semibold text-zinc-700 hover:text-zinc-950" type="submit">
                          Eliminar encuestador
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500" colSpan={7}>
                    Aun no hay codigos de encuestadores IKA para este estudio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function OneTimeCodeNotice({ state }: { state: CreateCtlInterviewerCodeActionState }) {
  if (state.status !== "success" || !state.code) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
        Codigo visible una sola vez{state.label ? ` - ${state.label}` : ""}
      </p>
      <p className="mt-1 font-mono text-xl font-bold text-amber-950">{state.code}</p>
    </div>
  );
}

function interviewerCodeStatusLabel(status: CtlInterviewerCodeView["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "Activo";
    case "DISABLED":
      return "Desactivado";
    case "EXPIRED":
      return "Expirado";
    default:
      return status;
  }
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City"
  }).format(value);
}
