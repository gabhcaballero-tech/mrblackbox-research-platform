"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState, useTransition } from "react";
import {
  confirmParticipantEvidenceReplacementAction,
  requestParticipantEvidenceReplacementUploadAction
} from "@/modules/participant-portal/evidence-review-actions";
import type { ParticipantEvidenceKind } from "@/modules/participant-portal/evidence-storage";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type EvidenceReplacementFormProps = {
  attemptId: string;
  evidenceId?: string | null;
  evidenceType: ParticipantEvidenceKind;
  label: string;
};

export function EvidenceReplacementForm({
  attemptId,
  evidenceId,
  evidenceType,
  label
}: EvidenceReplacementFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const file = fileInputRef.current?.files?.[0] ?? null;
    const replacementReason = reasonInputRef.current?.value.trim() ?? "";

    if (!file) {
      setError("Selecciona una imagen para reemplazar la evidencia.");
      return;
    }

    if (!replacementReason) {
      setError("Captura el motivo interno de reemplazo.");
      return;
    }

    startTransition(async () => {
      const metadata = {
        evidenceId,
        evidenceType,
        mimeType: file.type,
        originalFilename: file.name,
        sizeBytes: file.size
      };
      const signed = await requestParticipantEvidenceReplacementUploadAction(attemptId, metadata);

      if (!signed.ok) {
        setError(signed.message);
        return;
      }

      const { error: uploadError } = await createBrowserSupabaseClient().storage
        .from(signed.data.storageBucket)
        .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        setError("No fue posible subir la foto. Revisa tu conexión e intenta nuevamente.");
        return;
      }

      const confirmed = await confirmParticipantEvidenceReplacementAction(attemptId, {
        ...metadata,
        privateStorageKey: signed.data.privateStorageKey,
        replacementReason,
        storageBucket: signed.data.storageBucket
      });

      if (!confirmed.ok) {
        setError("La foto se subió, pero no fue posible registrarla. Contacta al administrador.");
        return;
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (reasonInputRef.current) {
        reasonInputRef.current.value = "";
      }
      setMessage("Evidencia corregida correctamente.");
      router.refresh();
    });
  }

  return (
    <form className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3" onSubmit={onSubmit}>
      <h4 className="text-sm font-semibold text-amber-950">{label}</h4>
      <p className="mt-1 text-xs leading-5 text-amber-900">
        Disponible solo para ADMIN/SUPERVISOR. Selecciona archivo desde tu equipo y registra el motivo interno.
      </p>
      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      <label className={labelClass}>
        Imagen
        <input ref={fileInputRef} accept="image/*" className={inputClass} disabled={isPending} required type="file" />
      </label>
      <label className={labelClass}>
        Motivo de reemplazo
        <textarea ref={reasonInputRef} className={inputClass} disabled={isPending} required rows={2} />
      </label>
      <button className={`${secondaryButtonClass} mt-3`} disabled={isPending} type="submit">
        {isPending ? "Guardando corrección..." : label}
      </button>
    </form>
  );
}

const labelClass = "mt-3 flex flex-col gap-1 text-xs font-medium text-amber-950";
const inputClass =
  "min-h-10 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
