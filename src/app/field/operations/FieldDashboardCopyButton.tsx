"use client";

import { useState } from "react";

export function FieldDashboardCopyButton({ label = "Copiar enlace", value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
      onClick={() => {
        void handleCopy();
      }}
      type="button"
    >
      {copied ? "Enlace copiado" : label}
    </button>
  );
}
