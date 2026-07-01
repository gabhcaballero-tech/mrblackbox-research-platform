"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmHutDailySelfieUploadAction,
  confirmHutVideoUploadAction,
  requestHutDailySelfieUploadAction,
  requestHutVideoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { verifyNavigoFaceIdentity } from "@/modules/navigo-app/face-verification-client";

type HutVideoUploadFormProps = {
  blockNumber: number;
  mode: "selfie" | "video";
  sequenceNumber: number;
  token: string;
};

export function HutVideoUploadForm({ blockNumber, mode, sequenceNumber, token }: HutVideoUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!file || isPending) {
      setError(mode === "selfie" ? "Toma o selecciona una selfie para continuar." : "Selecciona o graba un video para continuar.");
      return;
    }

    setError(null);
    setMessage("Preparando carga...");
    const selectedFile = file;

    startTransition(async () => {
      try {
        if (mode === "selfie") {
          await submitSelfie(selectedFile);
          return;
        }

        await submitVideo(selectedFile);
      } catch {
        setError(mode === "selfie" ? "No fue posible verificar tu identidad. Intenta de nuevo." : "No fue posible subir el video. Intenta de nuevo.");
        setMessage(null);
      }
    });
  }

  async function submitSelfie(selectedFile: File) {
    const metadata = {
      mimeType: selectedFile.type,
      originalFilename: selectedFile.name,
      sizeBytes: selectedFile.size
    };
    const signed = await requestHutDailySelfieUploadAction(token, metadata);

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
      setError("No fue posible subir la selfie. Revisa tu conexión e intenta nuevamente.");
      setMessage(null);
      return;
    }

    setMessage("Verificando identidad...");
    const faceVerification = await verifyNavigoFaceIdentity({
      capturedSelfie: selectedFile,
      registeredSelfieUrl: signed.data.referenceSelfieSignedUrl
    });
    const confirmed = await confirmHutDailySelfieUploadAction(token, {
      ...metadata,
      faceVerification,
      privateStorageKey: signed.data.privateStorageKey,
      storageBucket: signed.data.storageBucket
    });

    if (!confirmed.ok) {
      setError(confirmed.message);
      setMessage(null);
      return;
    }

    if (confirmed.data.status !== "MATCHED") {
      setError("No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.");
      setMessage(null);
      return;
    }

    setFile(null);
    setMessage("Identidad confirmada. Ya puedes subir tu video.");
    router.refresh();
  }

  async function submitVideo(selectedFile: File) {
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
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">{mode === "selfie" ? "Verificación de identidad" : `Sube tu video ${sequenceNumber} del bloque ${blockNumber}`}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {mode === "selfie"
          ? "Antes de subir tu video, tomaremos una selfie para confirmar tu identidad."
          : "Puedes grabarlo desde tu celular o seleccionar un archivo de video. No cierres esta pantalla mientras se sube."}
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      <div className="mt-5 space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          {mode === "selfie" ? "Selfie diaria" : "Video"}
          <input
            accept={mode === "selfie" ? "image/jpeg,image/png,image/webp,image/*" : "video/mp4,video/quicktime,video/webm,video/*"}
            capture={mode === "selfie" ? "user" : "environment"}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
            disabled={isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
          disabled={isPending || !file}
          onClick={submit}
          type="button"
        >
          {isPending ? (mode === "selfie" ? "Verificando..." : "Subiendo...") : mode === "selfie" ? "Verificar identidad" : "Subir video"}
        </button>
      </div>
    </section>
  );
}
