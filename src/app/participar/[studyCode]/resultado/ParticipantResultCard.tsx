"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ParticipantPortalEvidencePublicResult } from "@/modules/participant-portal/evidence-service";

export function ParticipantResultCard({ result }: { result: ParticipantPortalEvidencePublicResult }) {
  const [copied, setCopied] = useState(false);
  const copyText = useMemo(() => {
    if (!result.confirmation) {
      return "";
    }

    const orderedCodes = [...result.confirmation.codes].sort((left, right) => left.slot - right.slot);

    return [
      `Nombre: ${result.confirmation.participantName}`,
      `Folio: ${result.confirmation.folio}`,
      ...orderedCodes.map((item) => `Código ${item.slot}: ${item.code}`)
    ].join("\n");
  }, [result.confirmation]);

  async function copyConfirmation() {
    if (!copyText) {
      return;
    }

    await navigator.clipboard.writeText(copyText);
    setCopied(true);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Estado de participación</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{result.study.name}</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-700">{result.message}</p>

      {result.confirmation ? (
        <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-left">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-teal-900">Nombre</dt>
              <dd className="mt-1 text-teal-950">{result.confirmation.participantName}</dd>
            </div>
            <div>
              <dt className="font-medium text-teal-900">Folio</dt>
              <dd className="mt-1 font-mono text-teal-950">{result.confirmation.folio}</dd>
            </div>
            {[...result.confirmation.codes]
              .sort((left, right) => left.slot - right.slot)
              .map((item) => (
                <div key={item.slot}>
                  <dt className="font-medium text-teal-900">Código {item.slot}</dt>
                  <dd className="mt-1 font-mono text-teal-950">{item.code}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 text-sm leading-6 text-teal-900">
            Conserva estos códigos. Te serán solicitados durante tu evaluación.
          </p>
          <button className={`${primaryButtonClass} mt-4`} onClick={copyConfirmation} type="button">
            Copiar datos
          </button>
          {copied ? <p className="mt-2 text-sm text-teal-900">Datos copiados.</p> : null}
        </div>
      ) : null}

      {result.showEvidenceLink ? (
        <Link className={`${primaryButtonClass} mt-6`} href={`/participar/${result.study.code}/selfie`}>
          Continuar con selfie
        </Link>
      ) : null}

      {result.kind === "IN_PROGRESS" ? (
        <Link className={`${primaryButtonClass} mt-6`} href={`/participar/${result.study.code}/filtro`}>
          Continuar filtro
        </Link>
      ) : null}
    </section>
  );
}

const primaryButtonClass =
  "inline-flex w-fit justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
