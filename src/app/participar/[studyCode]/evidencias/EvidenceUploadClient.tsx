"use client";

import { useRef, useState, useTransition } from "react";
import {
  completeParticipantEvidenceSubmissionAction,
  confirmParticipantEvidenceUploadAction,
  requestParticipantEvidenceUploadAction
} from "@/modules/participant-portal/evidence-actions";
import type { ParticipantEvidenceScreen } from "@/modules/participant-portal/evidence-service";
import type { ParticipantEvidenceKind } from "@/modules/participant-portal/evidence-storage";

export function EvidenceUploadClient({ screen }: { screen: ParticipantEvidenceScreen }) {
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const perfumeInputRef = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState(screen.counts);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const evidenceComplete =
    counts.selfie === 1 &&
    counts.perfumePhotos >= screen.config.minPerfumePhotos &&
    counts.perfumePhotos <= screen.config.maxPerfumePhotos;

  function uploadSelectedEvidence() {
    const selfieFiles = Array.from(selfieInputRef.current?.files ?? []);
    const perfumeFiles = Array.from(perfumeInputRef.current?.files ?? []);

    setError(null);
    setMessage(null);

    if (selfieFiles.length === 0 && perfumeFiles.length === 0) {
      setError("Selecciona al menos un archivo para subir.");
      return;
    }

    startTransition(async () => {
      const uploads = [
        ...selfieFiles.map((file) => ({ evidenceType: "SELFIE_IDENTIFICATION" as const, file })),
        ...perfumeFiles.map((file) => ({ evidenceType: "PERFUME_PHOTO" as const, file }))
      ];

      for (const upload of uploads) {
        const result = await uploadEvidenceFile(screen.study.code, upload.evidenceType, upload.file);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setCounts((current) => ({
          perfumePhotos: current.perfumePhotos + (upload.evidenceType === "PERFUME_PHOTO" ? 1 : 0),
          selfie: current.selfie + (upload.evidenceType === "SELFIE_IDENTIFICATION" ? 1 : 0)
        }));
      }

      if (selfieInputRef.current) {
        selfieInputRef.current.value = "";
      }

      if (perfumeInputRef.current) {
        perfumeInputRef.current.value = "";
      }

      setMessage("Evidencia subida correctamente.");
    });
  }

  function completeEvidence() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await completeParticipantEvidenceSubmissionAction(screen.study.code);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      window.location.href = result.data.redirectTo;
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

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Selfie</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Sube una selfie clara de identificación. Se usará únicamente para validar que la misma persona continúe durante el estudio.
        </p>
        <label className={labelClass}>
          Archivo de selfie
          <input
            accept="image/jpeg,image/png,image/webp"
            className={inputClass}
            disabled={counts.selfie >= 1 || isPending}
            ref={selfieInputRef}
            type="file"
          />
        </label>
        <p className="mt-2 text-sm text-zinc-500">Registradas: {counts.selfie}/1</p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Fotos de perfumes</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Sube de 1 a 5 fotografías de los perfumes que utilizas. Debe poder verse la marca o envase cuando sea posible.
        </p>
        <label className={labelClass}>
          Archivos de perfumes
          <input
            accept="image/jpeg,image/png,image/webp"
            className={inputClass}
            disabled={counts.perfumePhotos >= screen.config.maxPerfumePhotos || isPending}
            multiple
            ref={perfumeInputRef}
            type="file"
          />
        </label>
        <p className="mt-2 text-sm text-zinc-500">
          Registradas: {counts.perfumePhotos}/{screen.config.maxPerfumePhotos}. Mínimo requerido:{" "}
          {screen.config.minPerfumePhotos}.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className={secondaryButtonClass} disabled={isPending} onClick={uploadSelectedEvidence} type="button">
          {isPending ? "Subiendo evidencia..." : "Subir evidencia"}
        </button>
        <button className={primaryButtonClass} disabled={isPending || !evidenceComplete} onClick={completeEvidence} type="button">
          Guardar evidencias
        </button>
        <button className={secondaryButtonClass} disabled type="button">
          Continuar
        </button>
      </div>
    </div>
  );
}

async function uploadEvidenceFile(
  studyCode: string,
  evidenceType: ParticipantEvidenceKind,
  file: File
): Promise<{ ok: true } | { message: string; ok: false }> {
  const metadata = {
    evidenceType,
    mimeType: file.type,
    originalFilename: file.name,
    sizeBytes: file.size
  };
  const signed = await requestParticipantEvidenceUploadAction(studyCode, metadata);

  if (!signed.ok) {
    return signed;
  }

  const uploadResponse = await fetch(signed.data.signedUrl, {
    body: file,
    headers: {
      "content-type": file.type
    },
    method: "PUT"
  });

  if (!uploadResponse.ok) {
    return {
      message: "No fue posible subir la evidencia. Intenta nuevamente.",
      ok: false
    };
  }

  const confirmed = await confirmParticipantEvidenceUploadAction(studyCode, {
    ...metadata,
    privateStorageKey: signed.data.privateStorageKey,
    storageBucket: signed.data.storageBucket
  });

  return confirmed.ok ? { ok: true } : confirmed;
}

const labelClass = "mt-4 flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-teal-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
