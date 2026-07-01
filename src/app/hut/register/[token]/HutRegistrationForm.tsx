"use client";

import { useState, useTransition } from "react";
import {
  completeHutRegistrationAction,
  requestHutRegistrationSelfieUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type HutRegistrationFormProps = {
  requestOrigin: string;
  token: string;
};

export function HutRegistrationForm({ requestOrigin, token }: HutRegistrationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [participantLink, setParticipantLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (isPending) {
      return;
    }
    if (!name.trim()) {
      setError("Captura el nombre del participante.");
      return;
    }
    if (!phone.trim()) {
      setError("Captura el celular del participante.");
      return;
    }
    if (!file) {
      setError("Toma o selecciona la selfie de registro.");
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
        const signed = await requestHutRegistrationSelfieUploadAction(token, metadata);

        if (!signed.ok) {
          setError(signed.message);
          setMessage(null);
          return;
        }

        setMessage("Subiendo selfie de registro...");
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

        setMessage("Completando registro...");
        const completed = await completeHutRegistrationAction(
          token,
          {
            ...metadata,
            privateStorageKey: signed.data.privateStorageKey,
            storageBucket: signed.data.storageBucket
          },
          {
            email,
            name,
            phone,
            recruiter,
            requestOrigin
          }
        );

        if (!completed.ok) {
          setError(completed.message);
          setMessage(null);
          return;
        }

        setFile(null);
        setParticipantLink(completed.data.participantLink);
        setMessage("Registro HUT completado correctamente.");
      } catch {
        setError("No fue posible completar el registro. Intenta de nuevo.");
        setMessage(null);
      }
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Datos del participante</h2>
      <div className="mt-4 grid gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Nombre del participante
          <input className={inputClass} disabled={isPending || Boolean(participantLink)} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Celular
          <input className={inputClass} disabled={isPending || Boolean(participantLink)} inputMode="tel" onChange={(event) => setPhone(event.target.value)} required value={phone} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Correo opcional
          <input className={inputClass} disabled={isPending || Boolean(participantLink)} onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Reclutador / encuestador
          <input className={inputClass} disabled={isPending || Boolean(participantLink)} onChange={(event) => setRecruiter(event.target.value)} value={recruiter} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Selfie de registro
          <input
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="user"
            className={inputClass}
            disabled={isPending || Boolean(participantLink)}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            type="file"
          />
        </label>
      </div>

      {message ? <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      {participantLink ? (
        <a className="mt-4 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800" href={participantLink}>
          Abrir portal del participante
        </a>
      ) : (
        <button
          className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
          disabled={isPending || !file}
          onClick={submit}
          type="button"
        >
          {isPending ? "Completando registro..." : "Completar registro"}
        </button>
      )}
    </section>
  );
}

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950";
