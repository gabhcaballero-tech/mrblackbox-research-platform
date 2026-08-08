"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmHutApplicationPhotoUploadAction,
  requestHutApplicationPhotoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import type { HutPhase } from "@/modules/hut/phase-codes";

type HutApplicationPhotoUploadFormProps = {
  phase: HutPhase;
  productCode: string | null;
  token: string;
};

export function HutApplicationPhotoUploadForm({ phase, productCode, token }: HutApplicationPhotoUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!file || isPending) {
      setError("Toma o selecciona la foto de aplicacion para continuar.");
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
      const signed = await requestHutApplicationPhotoUploadAction(token, metadata);

      if (!signed.ok) {
        setError(signed.message);
        setMessage(null);
        return;
      }

      setMessage("Subiendo foto...");
      const upload = await createBrowserSupabaseClient().storage
        .from(signed.data.storageBucket)
        .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, selectedFile, {
          contentType: selectedFile.type,
          upsert: false
        });

      if (upload.error) {
        setError("No fue posible subir la foto. Revisa tu conexion e intenta nuevamente.");
        setMessage(null);
        return;
      }

      const confirmed = await confirmHutApplicationPhotoUploadAction(token, {
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
      setMessage("Foto registrada correctamente.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{phaseLabel(phase)}</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Foto de aplicacion de perfume</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Registra una fotografia clara de la aplicacion del producto{productCode ? ` ${productCode}` : ""}. No se requiere selfie ni video.
      </p>
      <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-zinc-800">
        Fotografia
        <input
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="rounded-md border border-zinc-300 bg-white px-3 py-3 text-sm"
          disabled={isPending}
          onChange={(event) => {
            setError(null);
            setMessage(null);
            setFile(event.target.files?.[0] ?? null);
          }}
          type="file"
        />
      </label>
      {file ? <p className="mt-2 text-sm text-zinc-600">{file.name}</p> : null}
      {message ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      <button
        className="mt-4 min-h-12 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Guardando foto..." : "Guardar foto de aplicacion"}
      </button>
    </section>
  );
}

function phaseLabel(phase: HutPhase): string {
  const labels: Record<HutPhase, string> = {
    COLOCACION: "Colocacion / entrega 1",
    REGRESO_1: "Regreso 1 / evaluacion 1",
    REGRESO_2: "Regreso 2 / evaluacion 2"
  };
  return labels[phase];
}
