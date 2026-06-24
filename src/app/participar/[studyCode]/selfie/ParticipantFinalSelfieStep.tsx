"use client";

import { useState, useTransition } from "react";
import { completeParticipantEvidenceSubmissionAction } from "@/modules/participant-portal/evidence-actions";
import type { ParticipantPortalSelfieScreen } from "@/modules/participant-portal/evidence-service";
import { LoadingLabel } from "../_components/PendingSubmitButton";
import { PortalEvidenceCapture } from "../_components/PortalEvidenceCapture";

export function ParticipantFinalSelfieStep({ screen }: { screen: ParticipantPortalSelfieScreen }) {
  const [selfieCount, setSelfieCount] = useState(screen.counts.selfie);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selfieComplete = selfieCount === 1;
  const busy = isPending || isSubmitting;

  function submitForReview() {
    if (!selfieComplete || busy) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const result = await completeParticipantEvidenceSubmissionAction(screen.study.code);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        window.location.href = result.data.redirectTo;
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <PortalEvidenceCapture
        buttonLabel="Abrir cámara"
        captureFacingMode="user"
        currentCount={selfieCount}
        description="Toma una selfie clara de identificación. Se usará únicamente para validar que la misma persona continúe durante el estudio."
        emptyState="Todavía no hay una selfie registrada."
        evidenceType="SELFIE_IDENTIFICATION"
        maxCount={1}
        minRequired={1}
        onCountChange={setSelfieCount}
        studyCode={screen.study.code}
        title="Selfie obligatoria"
      />

      {!selfieComplete ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Antes de enviar tu participación a revisión, necesitamos exactamente una selfie.
        </p>
      ) : null}

      <button
        className={primaryButtonClass}
        disabled={!selfieComplete || busy}
        onClick={submitForReview}
        type="button"
      >
        {busy ? <LoadingLabel label="Enviando a revisión..." /> : "Enviar a revisión"}
      </button>
    </div>
  );
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
