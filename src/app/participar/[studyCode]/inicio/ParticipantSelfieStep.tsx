"use client";

import Link from "next/link";
import { useState } from "react";
import type { ParticipantPortalSelfieScreen } from "@/modules/participant-portal/evidence-service";
import { PortalEvidenceCapture } from "../_components/PortalEvidenceCapture";

type ParticipantSelfieStepProps = {
  screen: ParticipantPortalSelfieScreen;
  showRegistrationSuccess: boolean;
};

export function ParticipantSelfieStep({
  screen,
  showRegistrationSuccess
}: ParticipantSelfieStepProps) {
  const [selfieCount, setSelfieCount] = useState(screen.counts.selfie);
  const selfieComplete = selfieCount === 1;

  return (
    <div className="space-y-5">
      {showRegistrationSuccess ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Registro completado correctamente. Antes de empezar el filtro necesitamos tu selfie.
        </p>
      ) : null}

      <PortalEvidenceCapture
        buttonLabel="Abrir camara"
        captureFacingMode="user"
        currentCount={selfieCount}
        description="Toma una selfie clara de identificacion. Se usara unicamente para validar que la misma persona continue durante el estudio."
        emptyState="Todavia no hay una selfie registrada."
        evidenceType="SELFIE_IDENTIFICATION"
        maxCount={1}
        minRequired={1}
        onCountChange={setSelfieCount}
        studyCode={screen.study.code}
        title="Selfie obligatoria"
      />

      <Link
        aria-disabled={!selfieComplete}
        className={`${primaryButtonClass} ${selfieComplete ? "" : "pointer-events-none bg-zinc-300 hover:bg-zinc-300"}`}
        href={`/participar/${screen.study.code}/filtro`}
      >
        Continuar al filtro
      </Link>
    </div>
  );
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800";
