"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmHutDailySelfieUploadAction,
  confirmHutVideoUploadAction,
  requestHutDailySelfieUploadAction,
  requestHutVideoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { verifyNavigoFaceIdentity } from "@/modules/navigo-app/face-verification-client";
import {
  mirroredSelfiePreviewStyle,
  SelfiePrivacyHud,
  selfieMediaClass,
  selfieMediaFrameClass,
  shouldMirrorSelfiePreview
} from "@/shared/ui/SelfiePrivacyHud";

const FRONT_CAMERA_FACING_MODE = "user";

type HutVideoUploadFormProps = {
  blockNumber: number;
  mode: "selfie" | "video";
  sequenceNumber: number;
  token: string;
};

export function HutVideoUploadForm({ blockNumber, mode, sequenceNumber, token }: HutVideoUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
  const previewUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function submit() {
    if (!file || isPending) {
      setError(mode === "selfie" ? "Toma una selfie para continuar." : "Selecciona o graba un video para continuar.");
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

  async function openCamera() {
    setMessage(null);
    setError(null);
    clearCapturedPhoto();

    if (!cameraSupported) {
      setError("Para continuar necesitas usar un dispositivo con camara.");
      return;
    }

    try {
      setCameraState("opening");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: FRONT_CAMERA_FACING_MODE }
      });
      stopCameraTracks();
      streamRef.current = stream;
      setActiveStream(stream);
      setCameraState("opening");
    } catch {
      stopCamera();
      setError("No fue posible abrir la camara. Intenta de nuevo.");
    }
  }

  const stopCameraTracks = useCallback((updateState = true) => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
    if (updateState) {
      setActiveStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopCameraTracks();
    setCameraState("idle");
  }, [stopCameraTracks]);

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("La camara aun no esta lista. Intenta de nuevo.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("No fue posible tomar la selfie. Intenta de nuevo.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No fue posible tomar la selfie. Intenta de nuevo.");
          return;
        }

        const capturedFile = new File([blob], `selfie-hut-${Date.now()}.jpg`, { type: "image/jpeg" });
        setFile(capturedFile);
        setPreview(capturedFile);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function setPreview(selectedFile: File | null) {
    revokePreview();
    const nextUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  function clearCapturedPhoto() {
    revokePreview();
    setPreviewUrl(null);
    setFile(null);
  }

  useEffect(() => {
    return () => {
      stopCameraTracks(false);
      revokePreview();
    };
  }, [revokePreview, stopCameraTracks]);

  useEffect(() => {
    if (cameraState === "idle" || !activeStream || !videoRef.current) {
      return;
    }

    videoRef.current.srcObject = activeStream;
    void videoRef.current.play().then(() => {
      setCameraState("ready");
    }).catch(() => {
      stopCamera();
      setError("No fue posible abrir la camara. Intenta de nuevo.");
    });
  }, [activeStream, cameraState, stopCamera]);

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
    revokePreview();
    setPreviewUrl(null);
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
          : "Graba y sube tu video del dia. No cierres esta pantalla mientras se sube."}
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      <div className="mt-5 space-y-4">
        {mode === "selfie" ? (
          <>
            <p className="text-sm leading-6 text-zinc-600">Coloca tus ojos dentro de las guias y mira de frente.</p>
            <p className="text-sm leading-6 text-zinc-500">Esta selfie se usara para verificar tu identidad durante el estudio.</p>
            {cameraState === "idle" && !previewUrl ? (
              <button className={secondaryButtonClass} disabled={isPending} onClick={() => void openCamera()} type="button">
                Tomar selfie
              </button>
            ) : null}
            {cameraState !== "idle" ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-950 p-3">
                <div className={selfieMediaFrameClass}>
                  <video
                    autoPlay
                    className={selfieMediaClass}
                    data-mirrored={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? "true" : "false"}
                    muted
                    playsInline
                    ref={videoRef}
                    style={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? mirroredSelfiePreviewStyle : undefined}
                  />
                  <SelfiePrivacyHud mode="camera" testIdPrefix="hut-daily-selfie" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={secondaryButtonClass} disabled={isPending || cameraState !== "ready"} onClick={captureSelfie} type="button">
                    {cameraState === "ready" ? "Tomar selfie" : "Preparando camara..."}
                  </button>
                  <button className={secondaryButtonClass} disabled={isPending} onClick={stopCamera} type="button">
                    Cancelar camara
                  </button>
                </div>
              </div>
            ) : null}
            {previewUrl ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className={selfieMediaFrameClass}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Vista previa de selfie diaria"
                    className={selfieMediaClass}
                    data-mirrored={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? "true" : "false"}
                    src={previewUrl}
                    style={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? mirroredSelfiePreviewStyle : undefined}
                  />
                  <SelfiePrivacyHud mode="preview" testIdPrefix="hut-daily-selfie" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={secondaryButtonClass} disabled={isPending} onClick={clearCapturedPhoto} type="button">
                    Repetir foto
                  </button>
                  <button
                    className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
                    disabled={isPending || !file}
                    onClick={submit}
                    type="button"
                  >
                    {isPending ? "Verificando..." : "Usar esta selfie"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <label className="inline-flex cursor-pointer flex-col gap-2 text-sm font-medium text-zinc-700">
            <span>Tomar video</span>
            <input
              accept="video/*"
              capture="environment"
              className="sr-only"
              disabled={isPending}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <span className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100">
              Tomar video
            </span>
            {file ? <span className="text-xs font-normal text-zinc-600">{file.name}</span> : null}
          </label>
        )}
        {mode === "video" ? (
        <button
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
          disabled={isPending || !file}
          onClick={submit}
          type="button"
        >
          {isPending ? "Subiendo..." : "Subir video"}
        </button>
        ) : null}
      </div>
    </section>
  );
}

const secondaryButtonClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
