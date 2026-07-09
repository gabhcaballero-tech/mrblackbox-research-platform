"use client";

import { useState } from "react";

export function HutWhatsAppManualBlock({
  message,
  whatsappUrl
}: {
  message: string;
  whatsappUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  return (
    <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-sm font-semibold text-emerald-950">Mensaje manual de respaldo</p>
      <textarea
        className="mt-3 min-h-36 w-full rounded-md border border-emerald-200 bg-white p-3 font-mono text-xs text-emerald-950"
        readOnly
        value={message}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          onClick={copyMessage}
          type="button"
        >
          Copiar mensaje
        </button>
        {whatsappUrl ? (
          <a
            className="inline-flex w-fit rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            href={whatsappUrl}
            rel="noreferrer"
            target="_blank"
          >
            Abrir en WhatsApp
          </a>
        ) : null}
      </div>
      {copied ? <p className="mt-2 text-sm text-emerald-900">Mensaje copiado.</p> : null}
    </div>
  );
}
