"use client";

import { useState, useTransition } from "react";
import {
  confirmHutReferenceSelfieUploadAction,
  requestHutReferenceSelfieUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type HutReferenceSelfieUploadProps = {
  disabled: boolean;
  participantId: string;
  studyId: string;
};

export function HutReferenceSelfieUpload({ disabled, participantId, studyId }: HutReferenceSelfieUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function uploadSelfie() {
    if (!file || disabled || isPending) {
      setError("Selecciona una selfie de registro.");
      return;
    }

    const selectedFile = file;
    setError(null);
    setMessage("Preparando selfie...");

    startTransition(async () => {
      try {
        const metadata = {
          mimeType: selectedFile.type,
          originalFilename: selectedFile.name,
          sizeBytes: selectedFile.size
        };
        const signed = await requestHutReferenceSelfieUploadAction(studyId, participantId, metadata);

        if (!signed.ok) {
          setError(signed.message);
          setMessage(null);
          return;
        }

        setMessage("Subiendo selfie...");
        const upload = await createBrowserSupabaseClient().storage
          .from(signed.data.storageBucket)
          .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, selectedFile, {
            contentType: selectedFile.type,
            upsert: false
          });

        if (upload.error) {
          setError("No fue posible subir la selfie de registro. Intenta de nuevo.");
          setMessage(null);
          return;
        }

        const confirmed = await confirmHutReferenceSelfieUploadAction(studyId, participantId, {
          ...metadata,
          privateStorageKey: signed.data.privateStorageKey,
          storageBucket: signed.data.storageBucket
        });

        if (!confirmed.ok) {
          setError(confirmed.message);
          setMessage(null);
          return;
        }

        setFile(null);
        setMessage("Selfie de registro guardada correctamente.");
      } catch {
        setError("No fue posible guardar la selfie de registro. Intenta de nuevo.");
        setMessage(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
      <input
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="user"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-950"
        disabled={disabled || isPending}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      <button
        className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={disabled || isPending || !file}
        onClick={uploadSelfie}
        type="button"
      >
        {isPending ? "Guardando selfie..." : "Guardar selfie de registro"}
      </button>
    </div>
  );
}
