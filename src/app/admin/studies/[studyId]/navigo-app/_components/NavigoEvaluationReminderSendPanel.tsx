"use client";

import { useState } from "react";
import {
  sendNavigoEvaluationReminderNowAction,
  type NavigoEvaluationReminderNowActionResult
} from "@/modules/navigo-app/actions";

type NavigoEvaluationReminderSendPanelProps = {
  activityCode: string;
  activityId: string | null;
  canSend: boolean;
  disabledReason?: string | null;
  requestOrigin: string;
  studyId: string;
  timeZoneIana: string;
};

type ReminderResult = {
  activityCode: string;
  generatedAtIso: string;
  message: string;
  phone: string;
  whatsappError?: string | null;
  whatsappMessageId?: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
};

export function NavigoEvaluationReminderSendPanel({
  activityCode,
  activityId,
  canSend,
  disabledReason,
  requestOrigin,
  studyId,
  timeZoneIana
}: NavigoEvaluationReminderSendPanelProps) {
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sentSuccessfully = result?.whatsappStatus === "ENVIADO";

  async function sendReminder() {
    if (!activityId || !canSend || isSubmitting) {
      return;
    }

    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await sendNavigoEvaluationReminderNowAction(studyId, activityId, requestOrigin);

      if (!response.ok) {
        setMessage(response.message);
        return;
      }

      const mapped = mapActionResult(response);
      setResult(mapped);
      setMessage(mapped.message);
    } catch {
      setMessage("No se pudo enviar el recordatorio. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-md border border-teal-100 bg-teal-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-teal-950">Recordatorio WhatsApp</h4>
          <p className="mt-1 text-xs text-teal-800">
            Usa la plantilla navigo_recordatorio_evaluacion para {activityCode}.
          </p>
        </div>
        <button
          className="inline-flex justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
          disabled={!canSend || !activityId || isSubmitting}
          onClick={sendReminder}
          type="button"
        >
          {isSubmitting ? "Enviando..." : sentSuccessfully ? "Recordatorio enviado" : "Enviar recordatorio ahora"}
        </button>
      </div>
      {disabledReason ? <p className="mt-2 text-xs text-amber-800">{disabledReason}</p> : null}
      {message ? (
        <p aria-live="polite" className="mt-3 rounded-md border border-teal-200 bg-white px-3 py-2 text-xs text-teal-900">
          {message}
        </p>
      ) : null}
      {result ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <ReminderDetail label="Telefono" value={result.phone} />
          <ReminderDetail label="Fecha" value={formatReminderDateTime(result.generatedAtIso, timeZoneIana)} />
          <ReminderDetail
            label="WhatsApp"
            value={result.whatsappStatus === "ENVIADO" ? "Enviado correctamente" : "No se pudo enviar"}
          />
          <ReminderDetail label="Meta ID" value={result.whatsappMessageId ?? "Sin Meta ID"} />
          {result.whatsappError ? <ReminderDetail label="Error" value={result.whatsappError} /> : null}
        </dl>
      ) : null}
    </section>
  );
}

function ReminderDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-teal-100 bg-white p-2">
      <dt className="font-medium text-teal-700">{label}</dt>
      <dd className="mt-1 break-words text-zinc-900">{value}</dd>
    </div>
  );
}

function mapActionResult(
  response: Extract<NavigoEvaluationReminderNowActionResult, { ok: true }>
): ReminderResult {
  return {
    activityCode: response.data.activityCode,
    generatedAtIso: response.data.generatedAtIso,
    message: response.data.message,
    phone: response.data.phone,
    whatsappError: response.data.whatsappError,
    whatsappMessageId: response.data.whatsappMessageId,
    whatsappStatus: response.data.whatsappStatus
  };
}

function formatReminderDateTime(value: string, timeZoneIana: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    hour12: true,
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(date);
}
