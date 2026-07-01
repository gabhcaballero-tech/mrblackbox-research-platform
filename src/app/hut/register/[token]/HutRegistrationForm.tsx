"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  completeHutRegistrationAction,
  requestHutRegistrationSelfieUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import {
  mirroredSelfiePreviewStyle,
  SelfiePrivacyHud,
  selfieMediaClass,
  selfieMediaFrameClass,
  shouldMirrorSelfiePreview
} from "@/shared/ui/SelfiePrivacyHud";

const FRONT_CAMERA_FACING_MODE = "user";

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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [participantLink, setParticipantLink] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const previewUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setCameraError("No fue posible iniciar la vista de camara. Intenta de nuevo.");
    });
  }, [cameraOpen]);

  async function openCamera() {
    setCameraError(null);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: FRONT_CAMERA_FACING_MODE }
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError("No fue posible abrir la camara. Intenta de nuevo.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("La camara aun no esta lista. Intenta de nuevo.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("No fue posible tomar la selfie. Intenta de nuevo.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("No fue posible tomar la selfie. Intenta de nuevo.");
          return;
        }
        const capturedFile = new File([blob], `selfie-registro-${Date.now()}.jpg`, { type: "image/jpeg" });
        setFile(capturedFile);
        setPreview(capturedFile);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function setPreview(selectedFile: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function repeatSelfie() {
    setFile(null);
    setPreview(null);
    void openCamera();
  }

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
      setError("Toma la selfie de registro para continuar.");
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
        setPreview(null);
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
          <span className="text-xs font-normal leading-5 text-zinc-600">
            Esta selfie se usara como referencia para verificar tu identidad durante el estudio.
          </span>
        </label>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          {cameraOpen ? (
            <div className="space-y-3">
              <div className={selfieMediaFrameClass}>
                <video
                  ref={videoRef}
                  autoPlay
                  className={selfieMediaClass}
                  data-mirrored={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? "true" : "false"}
                  muted
                  playsInline
                  style={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? mirroredSelfiePreviewStyle : undefined}
                />
                <SelfiePrivacyHud mode="camera" testIdPrefix="hut-registration-selfie" />
              </div>
              <p className="text-xs leading-5 text-zinc-600">Coloca tus ojos dentro de las guias y mira de frente.</p>
              <div className="flex flex-wrap gap-2">
                <button className={secondaryButtonClass} disabled={isPending} onClick={captureSelfie} type="button">
                  Tomar selfie
                </button>
                <button className={secondaryButtonClass} disabled={isPending} onClick={stopCamera} type="button">
                  Cancelar camara
                </button>
              </div>
            </div>
          ) : previewUrl ? (
            <div className="space-y-3">
              <div className={selfieMediaFrameClass}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Preview de selfie de registro"
                  className={selfieMediaClass}
                  data-mirrored={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? "true" : "false"}
                  src={previewUrl}
                  style={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? mirroredSelfiePreviewStyle : undefined}
                />
                <SelfiePrivacyHud mode="preview" testIdPrefix="hut-registration-selfie" />
              </div>
              <p className="text-xs leading-5 text-zinc-600">Coloca tus ojos dentro de las guias y mira de frente.</p>
              <div className="flex flex-wrap gap-2">
                <button className={secondaryButtonClass} disabled={isPending || Boolean(participantLink)} onClick={repeatSelfie} type="button">
                  Repetir foto
                </button>
                <button className={secondaryButtonClass} disabled={isPending || Boolean(participantLink)} onClick={() => setMessage("Selfie lista para completar registro.")} type="button">
                  Usar esta selfie
                </button>
              </div>
            </div>
          ) : (
            <button className={secondaryButtonClass} disabled={isPending || Boolean(participantLink)} onClick={() => void openCamera()} type="button">
              Tomar selfie de registro
            </button>
          )}
          {cameraError ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{cameraError}</p> : null}
        </div>
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
const secondaryButtonClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
