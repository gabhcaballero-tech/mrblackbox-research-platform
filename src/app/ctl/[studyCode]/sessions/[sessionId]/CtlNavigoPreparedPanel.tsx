"use client";

import { useState } from "react";
import { sendPublicCtlParticipantLinksWhatsAppAction } from "@/modules/ctl/public-actions";
import type { NavigoParticipantLinkSendType } from "@/modules/navigo-app/repository";
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
  hutUrl?: string | null;
  navigoUrl?: string | null;
  phone: string;
  sentLinkType: NavigoParticipantLinkSendType;
  url: string;
  warnings?: string[];
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
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingType, setSubmittingType] = useState<NavigoParticipantLinkSendType | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const visibleNavigoUrl = result?.navigoUrl ?? evaluationUrl;
  const visibleHutUrl = result?.hutUrl ?? null;
  const sentSuccessfully = result?.whatsappStatus === "ENVIADO";

  async function copyLink(url: string | null) {
    if (!url) {
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
  }

  async function sendLink(linkType: NavigoParticipantLinkSendType) {
    if (submittingType) {
      return;
    }

    setError(null);
    setSubmittingType(linkType);

    try {
      const response = await sendPublicCtlParticipantLinksWhatsAppAction(studyCode, sessionId, requestOrigin, linkType);

      if (!response.ok) {
        setError(response.message);
        return;
      }

      setResult({
        folio: response.data.folio ?? folio,
        generatedAtIso: response.data.generatedAtIso,
        hutUrl: response.data.hutUrl,
        navigoUrl: response.data.navigoUrl,
        phone: response.data.phone,
        sentLinkType: response.data.sentLinkType,
        url: response.data.navigoUrl ?? response.data.hutUrl ?? "",
        warnings: response.data.warnings,
        whatsappError: response.data.whatsappError,
        whatsappMessageId: response.data.whatsappMessageId,
        whatsappStatus: response.data.whatsappStatus
      });

      if (response.data.whatsappStatus === "ERROR") {
        setError(response.data.message);
      }
    } catch {
      setError("No se pudo enviar el enlace. Copia el enlace disponible y compartelo manualmente.");
    } finally {
      setSubmittingType(null);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NAVIGO preparado</p>
      <h2 className="mt-2 text-xl font-bold text-emerald-950">Evaluacion sensorial concluida.</h2>
      <p className="mt-2 text-sm leading-6 text-emerald-900">
        Continua con el envio de enlaces al panelista. Navigo es para evaluaciones programadas; HUT es solo para seguimiento fotografico.
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

      <LinkCard
        copied={copiedUrl === visibleNavigoUrl}
        label="Enlace personalizado Navigo"
        onCopy={() => copyLink(visibleNavigoUrl)}
        unavailableMessage="El enlace de Navigo aun no esta disponible. Revisa la liberacion desde Administracion."
        url={visibleNavigoUrl}
      />

      {visibleHutUrl ? (
        <LinkCard
          copied={copiedUrl === visibleHutUrl}
          label="Enlace fotografico HUT"
          onCopy={() => copyLink(visibleHutUrl)}
          unavailableMessage="El enlace HUT no esta disponible."
          url={visibleHutUrl}
        />
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SendButton
          disabled={Boolean(submittingType)}
          isSubmitting={submittingType === "NAVIGO"}
          label={sentSuccessfully ? "Reenviar enlace Navigo" : "Enviar enlace Navigo"}
          onClick={() => sendLink("NAVIGO")}
        />
        <SendButton
          disabled={Boolean(submittingType)}
          isSubmitting={submittingType === "HUT"}
          label={sentSuccessfully ? "Reenviar enlace HUT" : "Enviar enlace HUT"}
          onClick={() => sendLink("HUT")}
        />
        <SendButton
          disabled={Boolean(submittingType)}
          isSubmitting={submittingType === "BOTH"}
          label={sentSuccessfully ? "Reenviar ambos enlaces" : "Enviar ambos enlaces"}
          onClick={() => sendLink("BOTH")}
        />
      </div>

      {error ? (
        <p aria-live="polite" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-lg border border-white/80 bg-white p-4 text-sm text-emerald-950">
          <p className="font-bold">
            WhatsApp: {result.whatsappStatus === "ENVIADO" ? "Enviado correctamente" : "No se pudo enviar"}
          </p>
          <p className="mt-1">Tipo enviado: {linkTypeLabel(result.sentLinkType)}</p>
          <p className="mt-1">Fecha: {formatResultDate(result.generatedAtIso)}</p>
          <p className="mt-1">Telefono destino: {result.phone}</p>
          {result.whatsappMessageId ? <p className="mt-1 font-mono text-xs">Meta ID: {result.whatsappMessageId}</p> : null}
          {result.whatsappError ? <p className="mt-1 text-amber-800">{result.whatsappError}</p> : null}
          {result.warnings?.length ? (
            <ul className="mt-2 space-y-1 text-amber-800">
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3">
      <dt className="text-xs font-medium text-emerald-700">{label}</dt>
      <dd className="mt-1 font-semibold text-emerald-950">{value}</dd>
    </div>
  );
}

function LinkCard({
  copied,
  label,
  onCopy,
  unavailableMessage,
  url
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  unavailableMessage: string;
  url: string | null;
}) {
  return (
    <div className="mt-4 rounded-lg border border-white/80 bg-white p-4">
      <p className="text-sm font-bold text-emerald-950">{label}</p>
      {url ? (
        <p className="mt-2 break-all rounded-md bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-950">{url}</p>
      ) : (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unavailableMessage}
        </p>
      )}
      <button
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={!url}
        onClick={onCopy}
        type="button"
      >
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}

function SendButton({
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
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {isSubmitting ? "Enviando WhatsApp..." : label}
    </button>
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

function linkTypeLabel(linkType: NavigoParticipantLinkSendType): string {
  if (linkType === "BOTH") {
    return "Navigo + HUT";
  }

  return linkType;
}

function formatResultDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatDateTimeMexicoCity(date);
}
