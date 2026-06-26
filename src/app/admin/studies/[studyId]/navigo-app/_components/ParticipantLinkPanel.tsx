"use client";

import { useState } from "react";

type ParticipantLinkPanelProps = {
  url: string;
};

export function ParticipantLinkPanel({ url }: ParticipantLinkPanelProps) {
  const [copied, setCopied] = useState(false);
  const message = `Hola, gracias por participar en el estudio Navigo Homme. Para realizar tus evaluaciones de fragancia a 0, 2, 4 y 8 horas, entra a este enlace: ${url}. Por favor conserva este mensaje y realiza cada evaluacion cuando corresponda.`;

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">Link participante listo</p>
      <p className="mt-2 break-all font-mono text-sm text-emerald-950">{url}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          onClick={copyLink}
          type="button"
        >
          {copied ? "Link copiado" : "Copiar link"}
        </button>
        <a
          className="inline-flex justify-center rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          Abrir link
        </a>
      </div>
      <p className="mt-3 text-sm leading-6 text-emerald-900">{message}</p>
    </section>
  );
}
