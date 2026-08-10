"use client";

import { useState } from "react";

type NavigoEvaluationLinkResultPanelProps = {
  folio: string;
  generatedAtLabel: string;
  phone: string;
  title?: string;
  url: string;
  whatsappError?: string | null;
  whatsappMessageId?: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
};

export function NavigoEvaluationLinkResultPanel({
  folio,
  generatedAtLabel,
  phone,
  title = "Enlace de evaluacion",
  url,
  whatsappError,
  whatsappMessageId,
  whatsappStatus
}: NavigoEvaluationLinkResultPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <section className="rounded-md border border-sky-200 bg-sky-50 p-3">
      <p className="text-sm font-semibold text-sky-950">{title}</p>
      <dl className="mt-3 space-y-1 text-xs text-sky-950">
        <div>
          <dt className="inline font-medium text-sky-700">Folio participante: </dt>
          <dd className="inline font-mono">{folio}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-sky-700">Telefono destino: </dt>
          <dd className="inline">{phone}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-sky-700">Fecha/hora de generacion: </dt>
          <dd className="inline">{generatedAtLabel}</dd>
        </div>
      </dl>
      <p className="mt-3 break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-sky-950">{url}</p>
      <button
        className="mt-3 inline-flex w-full justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
        onClick={copyLink}
        type="button"
      >
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
      <div className="mt-3 rounded-md border border-white/80 bg-white px-3 py-2 text-xs text-sky-950">
        <p className="font-semibold">
          WhatsApp: {whatsappStatus === "ENVIADO" ? "Enviado correctamente" : "No se pudo enviar"}
        </p>
        {whatsappMessageId ? <p className="mt-1 font-mono">Meta ID: {whatsappMessageId}</p> : null}
        {whatsappError ? <p className="mt-1 text-amber-800">{whatsappError}</p> : null}
      </div>
    </section>
  );
}
