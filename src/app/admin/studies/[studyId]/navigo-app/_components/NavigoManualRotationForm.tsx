"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { configureNavigoRotationInlineAction } from "@/modules/navigo-app/actions";
import {
  initialNavigoManualRotationActionState,
  type NavigoManualRotationActionState
} from "@/modules/navigo-app/manual-rotation-state";

type NavigoManualRotationFormProps = {
  initialLeftFragranceCode: string;
  initialRightFragranceCode: string;
  participantRotationReady: boolean;
  studyId: string;
  studyParticipantId: string;
};

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950";

export function NavigoManualRotationForm({
  initialLeftFragranceCode,
  initialRightFragranceCode,
  participantRotationReady,
  studyId,
  studyParticipantId
}: NavigoManualRotationFormProps) {
  const router = useRouter();
  const action = configureNavigoRotationInlineAction.bind(null, studyId, studyParticipantId);
  const [state, formAction, pending] = useActionState<NavigoManualRotationActionState, FormData>(
    action,
    initialNavigoManualRotationActionState
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <details className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        {participantRotationReady ? "Actualizar rotacion" : "Configurar rotacion"}
      </summary>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        Usa esta correccion puntual solo si necesitas ajustar un participante. El flujo recomendado es importar la rotacion masiva por folio.
      </p>
      <form action={formAction} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Codigo primera fragancia / brazo izquierdo
          <input
            className={inputClass}
            defaultValue={initialLeftFragranceCode}
            name="leftFragranceCode"
            required
          />
          <span className="text-xs font-normal leading-5 text-zinc-500">
            Este codigo se usara para identificar la fragancia aplicada en el antebrazo izquierdo.
          </span>
        </label>
        <label className={labelClass}>
          Codigo segunda fragancia / brazo derecho
          <input
            className={inputClass}
            defaultValue={initialRightFragranceCode}
            name="rightFragranceCode"
            required
          />
          <span className="text-xs font-normal leading-5 text-zinc-500">
            Este codigo se usara para identificar la fragancia aplicada en el antebrazo derecho.
          </span>
        </label>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 md:col-span-2">
          La rotacion triangular CTL requiere PR1-PR6 y VERI_1/VERI_2. Para conservar trazabilidad, se actualiza desde
          ROTACIONES NAVIGO.xlsx; este ajuste manual solo guarda la primera y segunda fragancia de Navigo.
        </div>
        {state.message ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm md:col-span-2 ${
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {state.message}
          </p>
        ) : null}
        <div className="flex items-end md:col-span-2">
          <button
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            disabled={pending}
            type="submit"
          >
            {pending ? "Guardando rotacion..." : "Guardar rotacion"}
          </button>
        </div>
      </form>
    </details>
  );
}
