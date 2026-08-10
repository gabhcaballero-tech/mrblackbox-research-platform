"use client";

import { useState } from "react";
import {
  sendNavigoParticipantLinksWhatsAppAction,
  type NavigoParticipantLinksWhatsAppActionResult
} from "@/modules/navigo-app/actions";
import type { NavigoParticipantLinkSendType } from "@/modules/navigo-app/repository";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { NavigoEvaluationLinkResultPanel } from "./NavigoEvaluationLinkResultPanel";

export type NavigoEvaluationLinkPanelResult = {
  folio: string;
  generatedAtIso: string;
  hutUrl?: string | null;
  navigoUrl?: string | null;
  phone: string;
  sentLinkType?: NavigoParticipantLinkSendType;
  url: string;
  warnings?: string[];
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
  const [submittingType, setSubmittingType] = useState<NavigoParticipantLinkSendType | null>(null);
  const sentSuccessfully = result?.whatsappStatus === "ENVIADO";

  async function sendLink(linkType: NavigoParticipantLinkSendType) {
    if (!canSend || submittingType) {
      return;
    }

    setError(null);
    setSubmittingType(linkType);

    try {
      const response = await sendNavigoParticipantLinksWhatsAppAction(studyId, participantId, requestOrigin, linkType);

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
      setSubmittingType(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="grid gap-2">
        <LinkSendButton
          disabled={!canSend || Boolean(submittingType)}
          isSubmitting={submittingType === "NAVIGO"}
          label={sentSuccessfully ? "Reenviar enlace Navigo" : "Enviar enlace Navigo"}
          onClick={() => sendLink("NAVIGO")}
        />
        <LinkSendButton
          disabled={!canSend || Boolean(submittingType)}
          isSubmitting={submittingType === "HUT"}
          label={sentSuccessfully ? "Reenviar enlace HUT" : "Enviar enlace HUT"}
          onClick={() => sendLink("HUT")}
        />
        <LinkSendButton
          disabled={!canSend || Boolean(submittingType)}
          isSubmitting={submittingType === "BOTH"}
          label={sentSuccessfully ? "Reenviar ambos enlaces" : "Enviar ambos enlaces"}
          onClick={() => sendLink("BOTH")}
        />
      </div>
      {disabledReason ? <p className="text-xs text-amber-700">{disabledReason}</p> : null}
      {error ? (
        <p aria-live="polite" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="space-y-3">
          {result.navigoUrl || (!result.hutUrl && result.url) ? (
            <NavigoEvaluationLinkResultPanel
              folio={result.folio}
              generatedAtLabel={formatEvaluationLinkDateTime(result.generatedAtIso, timeZoneIana)}
              phone={result.phone}
              title="Enlace Navigo"
              url={result.navigoUrl ?? result.url}
              whatsappError={result.whatsappError}
              whatsappMessageId={result.whatsappMessageId}
              whatsappStatus={result.whatsappStatus}
            />
          ) : null}
          {result.hutUrl ? (
            <NavigoEvaluationLinkResultPanel
              folio={result.folio}
              generatedAtLabel={formatEvaluationLinkDateTime(result.generatedAtIso, timeZoneIana)}
              phone={result.phone}
              title="Enlace fotografico HUT"
              url={result.hutUrl}
              whatsappError={result.whatsappError}
              whatsappMessageId={result.whatsappMessageId}
              whatsappStatus={result.whatsappStatus}
            />
          ) : null}
          {result.warnings?.length ? (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function mapActionResult(
  response: Extract<NavigoParticipantLinksWhatsAppActionResult, { ok: true }>
): NavigoEvaluationLinkPanelResult {
  const primaryUrl = response.data.navigoUrl ?? response.data.hutUrl ?? "";

  return {
    folio: response.data.folio ?? "Sin folio",
    generatedAtIso: response.data.generatedAtIso,
    hutUrl: response.data.hutUrl,
    navigoUrl: response.data.navigoUrl,
    phone: response.data.phone,
    sentLinkType: response.data.sentLinkType,
    url: primaryUrl,
    warnings: response.data.warnings,
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

function LinkSendButton({
  disabled,
  isSubmitting,
  label,
  onClick
}: {
  disabled: boolean;
  isSubmitting: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {isSubmitting ? "Enviando WhatsApp..." : label}
    </button>
  );
}
