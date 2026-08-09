"use client";

import { useState } from "react";
import { sendPublicCtlNavigoEvaluationLinkWhatsAppAction } from "@/modules/ctl/public-actions";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";

export type CtlNavigoPreparedActivity = {
  availableFromLabel: string;
  code: "T3_HORAS" | "T4_5_HORAS" | "T6_HORAS" | string;
};

type CtlNavigoPreparedPanelProps = {
  activities: CtlNavigoPreparedActivity[];
  evaluationUrl: string | null;
  firstSampleKey?: string | null;
  folio: string;
  requestOrigin: string;
  secondSampleKey?: string | null;
  sessionId: string;
  studyCode: string;
  t0Label: string | null;
};

type SendResult = {
  folio: string;
  generatedAtIso: string;
  phone: string;
  url: string;
  whatsappError?: string | null;
  whatsappMessageId?: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
};

export function CtlNavigoPreparedPanel({
  activities,
  evaluationUrl,
  firstSampleKey,
  folio,
  requestOrigin,
  secondSampleKey,
  sessionId,
  studyCode,
  t0Label
}: CtlNavigoPreparedPanelProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const visibleUrl = result?.url ?? evaluationUrl;
  const sentSuccessfully = result?.whatsappStatus === "ENVIADO";

  async function copyLink() {
    if (!visibleUrl) {
      return;
    }

    await navigator.clipboard.writeText(visibleUrl);
    setCopied(true);
  }

  async function sendLink() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await sendPublicCtlNavigoEvaluationLinkWhatsAppAction(studyCode, sessionId, requestOrigin);

      if (!response.ok) {
        setError(response.message);
        return;
      }

      setResult({
        folio: response.data.folio ?? folio,
        generatedAtIso: response.data.generatedAtIso,
        phone: response.data.phone,
        url: response.data.evaluationUrl,
        whatsappError: response.data.whatsappError,
        whatsappMessageId: response.data.whatsappMessageId,
        whatsappStatus: response.data.whatsappStatus
      });

      if (response.data.whatsappStatus === "ERROR") {
        setError(response.data.message);
      }
    } catch {
      setError("No se pudo enviar el enlace. Copia el enlace y compartelo manualmente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NAVIGO preparado</p>
      <h2 className="mt-2 text-xl font-bold text-emerald-950">Evaluacion sensorial concluida.</h2>
      <p className="mt-2 text-sm leading-6 text-emerald-900">
        Continua con el envio del enlace unico de evaluacion Navigo al panelista.
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="Folio" value={folio} />
        <Detail label="T0 registrado en CLT" value={t0Label ?? "Sin registro"} />
        <Detail label="Primera fragancia" value={`${firstSampleKey ?? "Sin asignar"} - brazo izquierdo`} />
        <Detail label="Segunda fragancia" value={`${secondSampleKey ?? "Sin asignar"} - brazo derecho`} />
      </dl>

      <div className="mt-4 rounded-lg border border-white/80 bg-white p-4">
        <p className="text-sm font-bold text-emerald-950">Horarios de evaluacion</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {activities.map((activity) => (
            <Detail key={activity.code} label={activityLabel(activity.code)} value={activity.availableFromLabel} />
          ))}
        </dl>
      </div>

      <div className="mt-4 rounded-lg border border-white/80 bg-white p-4">
        <p className="text-sm font-bold text-emerald-950">Enlace personalizado Navigo</p>
        {visibleUrl ? (
          <p className="mt-2 break-all rounded-md bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-950">{visibleUrl}</p>
        ) : (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            El enlace de Navigo aun no esta disponible. Revisa la liberacion desde Administracion.
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            disabled={!visibleUrl}
            onClick={copyLink}
            type="button"
          >
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            disabled={isSubmitting}
            onClick={sendLink}
            type="button"
          >
            {isSubmitting ? "Enviando WhatsApp..." : sentSuccessfully ? "✓ Enlace enviado" : "Enviar enlace al panelista"}
          </button>
        </div>
      </div>

      {error ? (
        <p aria-live="polite" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-lg border border-white/80 bg-white p-4 text-sm text-emerald-950">
          <p className="font-bold">
            WhatsApp: {result.whatsappStatus === "ENVIADO" ? "✓ Enviado correctamente" : "No se pudo enviar"}
          </p>
          <p className="mt-1">Fecha: {formatResultDate(result.generatedAtIso)}</p>
          <p className="mt-1">Telefono destino: {result.phone}</p>
          {result.whatsappMessageId ? <p className="mt-1 font-mono text-xs">Meta ID: {result.whatsappMessageId}</p> : null}
          {result.whatsappError ? <p className="mt-1 text-amber-800">{result.whatsappError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3">
      <dt className="text-xs font-medium text-emerald-700">{label}</dt>
      <dd className="mt-1 font-semibold text-emerald-950">{value}</dd>
    </div>
  );
}

function activityLabel(code: string): string {
  switch (code) {
    case "T3_HORAS":
      return "T3";
    case "T4_5_HORAS":
      return "T4.5";
    case "T6_HORAS":
      return "T6";
    default:
      return code;
  }
}

function formatResultDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatDateTimeMexicoCity(date);
}
