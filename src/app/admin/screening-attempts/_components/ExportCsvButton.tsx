"use client";

import { useState } from "react";

export function ExportCsvButton({
  disabled = false,
  href
}: {
  disabled?: boolean;
  href: string;
}) {
  const [pending, setPending] = useState(false);
  const isDisabled = disabled || pending;

  return (
    <a
      aria-disabled={isDisabled}
      className={`inline-flex w-fit rounded-md px-4 py-2 text-sm font-semibold transition ${
        isDisabled
          ? "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400"
          : "border border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-100"
      }`}
      href={isDisabled ? "#" : href}
      onClick={(event) => {
        if (isDisabled) {
          event.preventDefault();
          return;
        }

        setPending(true);
        window.setTimeout(() => setPending(false), 2500);
      }}
    >
      {pending ? "Exportando..." : "Exportar Excel"}
    </a>
  );
}
