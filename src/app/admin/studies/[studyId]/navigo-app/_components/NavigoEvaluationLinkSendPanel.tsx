"use client";

import { useState } from "react";
import {
  sendNavigoEvaluationLinkWhatsAppAction,
  type NavigoEvaluationLinkWhatsAppActionResult
} from "@/modules/navigo-app/actions";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { NavigoEvaluationLinkResultPanel } from "./NavigoEvaluationLinkResultPanel";

export type NavigoEvaluationLinkPanelResult = {
  folio: string;
  generatedAtIso: string;
  phone: string;
  url: string;
  whatsappError?: string | null;
  whatsappMessageId?: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
};

type NavigoEvaluationLinkSendPanelProps = {
  canSend: boolean;
  disabledReason?: string | null;
  initialResult?: NavigoEvaluationLinkPanelResult | null;
  participantId: string;
  requestOrigin: string;
  studyId: string;
  timeZoneIana: string;
};

export function NavigoEvaluationLinkSendPanel({
  canSend,
  disabledReason,
  initialResult,
  participantId,
  requestOrigin,
  studyId,
  timeZoneIana
}: NavigoEvaluationLinkSendPanelProps) {
  const [result, setResult] = useState<NavigoEvaluationLinkPanelResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sentSuccessfully = result?.whatsappStatus === "ENVIADO";

  async function sendLink() {
    if (!canSend || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await sendNavigoEvaluationLinkWhatsAppAction(studyId, participantId, requestOrigin);

      if (!response.ok) {
        setError(response.message);
        return;
      }

      setResult(mapActionResult(response));
      if (response.data.whatsappStatus === "ERROR") {
        setError(response.data.message);
      }
    } catch {
      setError("No se pudo enviar el enlace. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-3">
      <button
        className="inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={!canSend || isSubmitting}
        onClick={sendLink}
        type="button"
      >
        {isSubmitting ? "Enviando WhatsApp..." : sentSuccessfully ? "✓ Enlace enviado" : "Enviar enlace de evaluacion al panelista"}
      </button>
      {disabledReason ? <p className="text-xs text-amber-700">{disabledReason}</p> : null}
      {error ? (
        <p aria-live="polite" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      ) : null}
      {result ? (
        <NavigoEvaluationLinkResultPanel
          folio={result.folio}
          generatedAtLabel={formatEvaluationLinkDateTime(result.generatedAtIso, timeZoneIana)}
          phone={result.phone}
          url={result.url}
          whatsappError={result.whatsappError}
          whatsappMessageId={result.whatsappMessageId}
          whatsappStatus={result.whatsappStatus}
        />
      ) : null}
    </section>
  );
}

function mapActionResult(
  response: Extract<NavigoEvaluationLinkWhatsAppActionResult, { ok: true }>
): NavigoEvaluationLinkPanelResult {
  return {
    folio: response.data.folio ?? "Sin folio",
    generatedAtIso: response.data.generatedAtIso,
    phone: response.data.phone,
    url: response.data.evaluationUrl,
    whatsappError: response.data.whatsappError,
    whatsappMessageId: response.data.whatsappMessageId,
    whatsappStatus: response.data.whatsappStatus
  };
}

function formatEvaluationLinkDateTime(value: string, timeZoneIana: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  void timeZoneIana;
  return formatDateTimeMexicoCity(date);
}
