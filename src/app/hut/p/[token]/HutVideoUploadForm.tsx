"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmHutVideoUploadAction,
  requestHutVideoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type HutVideoUploadFormProps = {
  blockNumber: number;
  sequenceNumber: number;
  token: string;
};

export function HutVideoUploadForm({ blockNumber, sequenceNumber, token }: HutVideoUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitVideo() {
    if (!file || isPending) {
      setError("Selecciona o graba un video para continuar.");
      return;
    }

    setError(null);
    setMessage("Preparando carga...");
    const selectedFile = file;

    startTransition(async () => {
      try {
        const metadata = {
          mimeType: selectedFile.type,
          originalFilename: selectedFile.name,
          sizeBytes: selectedFile.size
        };
        const signed = await requestHutVideoUploadAction(token, metadata);

        if (!signed.ok) {
          setError(signed.message);
          setMessage(null);
          return;
        }

        setMessage("Subiendo video...");
        const upload = await createBrowserSupabaseClient().storage
          .from(signed.data.storageBucket)
          .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, selectedFile, {
            contentType: selectedFile.type,
            upsert: false
          });

        if (upload.error) {
          setError("No fue posible subir el video. Revisa tu conexión e intenta nuevamente.");
          setMessage(null);
          return;
        }

        setMessage("Guardando avance...");
        const confirmed = await confirmHutVideoUploadAction(token, {
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
        setMessage("Video recibido correctamente.");
        router.refresh();
      } catch {
        setError("No fue posible subir el video. Intenta de nuevo.");
        setMessage(null);
      }
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">
        Sube tu video {sequenceNumber} del bloque {blockNumber}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Puedes grabarlo desde tu celular o seleccionar un archivo de video. No cierres esta pantalla mientras se sube.
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      <div className="mt-5 space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Video
          <input
            accept="video/mp4,video/quicktime,video/webm,video/*"
            capture="environment"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
            disabled={isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
          disabled={isPending || !file}
          onClick={submitVideo}
          type="button"
        >
          {isPending ? "Subiendo..." : "Subir video"}
        </button>
      </div>
    </section>
  );
}
