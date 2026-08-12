"use client";

import { useActionState } from "react";
import type { WhatsAppParticipantSupportSearchResult } from "@/modules/oneui-whatsapp/participant-support";
import {
  initialOneuiWhatsAppParticipantSupportActionState
} from "./action-state";
import { sendOneuiWhatsAppParticipantSupportAction } from "./actions";

export function ParticipantSupportActions({ participant }: { participant: WhatsAppParticipantSupportSearchResult }) {
  const [state, formAction, pending] = useActionState(
    sendOneuiWhatsAppParticipantSupportAction,
    initialOneuiWhatsAppParticipantSupportActionState
  );
  const navigoDisabled = !participant.studyParticipantId;
  const hutDisabled = !participant.hutParticipantId || !participant.hutTokenAvailable;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input name="studyId" type="hidden" value={participant.studyId} />
      <input name="studyParticipantId" type="hidden" value={participant.studyParticipantId ?? ""} />
      <input name="hutParticipantId" type="hidden" value={participant.hutParticipantId ?? ""} />
      <label className="block text-xs font-semibold text-zinc-700">
        Motivo
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-950"
          name="reason"
          placeholder="Ej. soporte manual solicitado por campo"
          required
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={pending || hutDisabled}
          name="sendKind"
          type="submit"
          value="HUT"
        >
          Enviar enlace HUT
        </button>
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={pending || navigoDisabled}
          name="sendKind"
          type="submit"
          value="NAVIGO"
        >
          Enviar enlace Navigo
        </button>
        <button
          className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={pending || navigoDisabled || hutDisabled}
          name="sendKind"
          type="submit"
          value="BOTH"
        >
          Enviar ambos enlaces
        </button>
        <button
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={pending || hutDisabled}
          name="sendKind"
          type="submit"
          value="HUT_REMINDER"
        >
          Enviar recordatorio HUT
        </button>
      </div>
      {pending ? <p className="text-xs font-semibold text-zinc-600">Enviando...</p> : null}
      {state.ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <p className="font-semibold">{state.message}</p>
          <p>WhatsApp: {state.whatsappStatus}</p>
          <p>Template: {state.templateName}</p>
          {state.hutUrl ? <p className="break-all">HUT: {state.hutUrl}</p> : null}
          {state.navigoUrl ? <p className="break-all">Navigo: {state.navigoUrl}</p> : null}
        </div>
      ) : null}
      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="font-semibold">{state.error}</p>
          {state.errorReason ? <p className="mt-1 font-mono">{state.errorReason}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
