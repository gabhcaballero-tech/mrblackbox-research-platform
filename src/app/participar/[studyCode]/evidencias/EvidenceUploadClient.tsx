"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { completeParticipantEvidenceSubmissionAction } from "@/modules/participant-portal/evidence-actions";
import type { ParticipantEvidenceScreen } from "@/modules/participant-portal/evidence-service";
import { LoadingLabel } from "../_components/PendingSubmitButton";
import { PortalEvidenceCapture } from "../_components/PortalEvidenceCapture";

export function EvidenceUploadClient({ screen }: { screen: ParticipantEvidenceScreen }) {
  const [counts, setCounts] = useState(screen.counts);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isFinalizing, setIsFinalizing] = useState(false);
  const busy = isPending || isFinalizing;
  const evidenceComplete =
    counts.selfie === 1 &&
    counts.perfumePhotos >= screen.config.minPerfumePhotos &&
    counts.perfumePhotos <= screen.config.maxPerfumePhotos;

  function finalizeEvidence() {
    if (busy) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsFinalizing(true);

    startTransition(async () => {
      try {
        const result = await completeParticipantEvidenceSubmissionAction(screen.study.code);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        window.location.href = result.data.redirectTo;
      } finally {
        setIsFinalizing(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <PortalEvidenceCapture
        buttonLabel="Abrir camara"
        captureFacingMode="user"
        currentCount={counts.selfie}
        description="Toma una selfie clara de identificacion. Se usara unicamente para validar que la misma persona continue durante el estudio."
        emptyState="Todavia no hay selfie registrada."
        evidenceType="SELFIE_IDENTIFICATION"
        maxCount={1}
        minRequired={1}
        onCountChange={(nextCount) => setCounts((current) => ({ ...current, selfie: nextCount }))}
        studyCode={screen.study.code}
        title="Selfie"
      />

      <PortalEvidenceCapture
        buttonLabel="Tomar foto del perfume"
        captureFacingMode="environment"
        currentCount={counts.perfumePhotos}
        description="Si te falta alguna foto de perfume, tomala aqui como recuperacion. No necesitas repetir las que ya quedaron registradas."
        emptyState="Todavia no hay fotos de perfumes registradas."
        evidenceType="PERFUME_PHOTO"
        maxCount={screen.config.maxPerfumePhotos}
        minRequired={screen.config.minPerfumePhotos}
        onCountChange={(nextCount) => setCounts((current) => ({ ...current, perfumePhotos: nextCount }))}
        studyCode={screen.study.code}
        title="Fotos de perfumes"
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link className={secondaryButtonClass} href={`/participar/${screen.study.code}/filtro`}>
          Volver al filtro
        </Link>
        {screen.canFinalizeReview ? (
          <button
            className={primaryButtonClass}
            disabled={busy || !evidenceComplete}
            onClick={finalizeEvidence}
            type="button"
          >
            {busy ? <LoadingLabel label="Guardando..." /> : "Finalizar evidencias"}
          </button>
        ) : (
          <Link
            className={`${primaryButtonClass} ${evidenceComplete ? "" : "bg-zinc-300 hover:bg-zinc-300"}`}
            href={evidenceComplete ? `/participar/${screen.study.code}/resultado` : "#"}
          >
            {evidenceComplete ? "Ver resultado" : "Completa primero las evidencias"}
          </Link>
        )}
      </div>
    </div>
  );
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
