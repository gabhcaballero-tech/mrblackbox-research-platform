"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmHutManualDeliveryEvidenceUploadAction,
  requestHutManualDeliveryEvidenceUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type HutDeliveryRecoveryUploadProps = {
  disabled?: boolean;
  participantId: string;
  studyId: string;
};

export function HutDeliveryRecoveryUpload({
  disabled = false,
  participantId,
  studyId
}: HutDeliveryRecoveryUploadProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [capturedAt, setCapturedAt] = useState("");
  const [reason, setReason] = useState("HUT_LINK_RECOVERY");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (disabled || isPending) {
      return;
    }
    if (!file) {
      setError("Selecciona la foto de entrega.");
      return;
    }
    if (!capturedAt) {
      setError("Captura la fecha y hora de entrega.");
      return;
    }

    setError(null);
    setMessage("Preparando carga...");
    const selectedFile = file;

    startTransition(async () => {
      const metadata = {
        mimeType: selectedFile.type,
        originalFilename: selectedFile.name,
        sizeBytes: selectedFile.size
      };
      const signed = await requestHutManualDeliveryEvidenceUploadAction(studyId, participantId, metadata);

      if (!signed.ok) {
        setError(signed.message);
        setMessage(null);
        return;
      }

      setMessage("Subiendo evidencia...");
      const upload = await createBrowserSupabaseClient().storage
        .from(signed.data.storageBucket)
        .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, selectedFile, {
          contentType: selectedFile.type,
          upsert: false
        });

      if (upload.error) {
        setError("No fue posible subir la evidencia. Revisa tu conexion e intenta de nuevo.");
        setMessage(null);
        return;
      }

      const confirmed = await confirmHutManualDeliveryEvidenceUploadAction(studyId, participantId, {
        ...metadata,
        capturedAt,
        privateStorageKey: signed.data.privateStorageKey,
        reason,
        storageBucket: signed.data.storageBucket
      });

      if (!confirmed.ok) {
        setError(confirmed.message);
        setMessage(null);
        return;
      }

      setFile(null);
      setMessage(confirmed.message ?? "Evidencia de entrega registrada.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <h5 className="text-sm font-semibold text-amber-950">Subir evidencia de entrega</h5>
      <p className="text-xs leading-5 text-amber-900">
        Usa esta recuperacion solo cuando la entrega fisica ya ocurrio y el participante no pudo usar el enlace HUT.
      </p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-amber-950">
        Foto de entrega
        <input
          accept="image/jpeg,image/png,image/webp"
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          disabled={disabled || isPending}
          onChange={(event) => {
            setError(null);
            setMessage(null);
            setFile(event.target.files?.[0] ?? null);
          }}
          type="file"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-amber-950">
        Fecha y hora de entrega
        <input
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          disabled={disabled || isPending}
          onChange={(event) => setCapturedAt(event.target.value)}
          required
          type="datetime-local"
          value={capturedAt}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-amber-950">
        Motivo
        <input
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          disabled={disabled || isPending}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </label>
      {file ? <p className="text-xs text-amber-900">{file.name}</p> : null}
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
      <button
        className="rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={disabled || isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Guardando entrega..." : "Subir evidencia de entrega"}
      </button>
    </div>
  );
}
