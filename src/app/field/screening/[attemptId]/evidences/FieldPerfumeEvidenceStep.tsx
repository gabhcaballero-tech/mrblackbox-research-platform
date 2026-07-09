"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  completeFieldEvidenceSubmissionAction,
  confirmFieldEvidenceUploadAction,
  requestFieldEvidenceUploadAction
} from "@/modules/field/evidence-actions";
import type { FieldEvidenceScreen } from "@/modules/field/service";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

export function FieldPerfumeEvidenceStep({ screen }: { screen: FieldEvidenceScreen }) {
  const [perfumePhotoCount, setPerfumePhotoCount] = useState(screen.counts.perfumePhotos);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "ready">("idle");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [cameraSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const busy = isPending || isUploading;
  const remaining = Math.max(0, screen.config.maxPerfumePhotos - perfumePhotoCount);
  const hasMinimumPhotos = perfumePhotoCount >= screen.config.minPerfumePhotos;
  const canUploadMore = remaining > 0 && !busy;

  const stopCameraTracks = useCallback((updateState = true) => {
    const stream = streamRef.current;

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
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

  useEffect(
    () => () => {
      stopCameraTracks(false);
      revokePreview();
    },
    [stopCameraTracks]
  );

  useEffect(() => {
    const stream = activeStream;
    const video = videoRef.current;

    if (!stream || !video || cameraState === "idle") {
      return;
    }

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function markReady() {
      if (!video || settled) {
        return;
      }

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        settled = true;
        setCameraState("ready");
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    function failCamera() {
      if (settled) {
        return;
      }

      settled = true;
      stopCamera();
      setError("No fue posible abrir la cámara. Permite el acceso a la cámara o intenta desde un celular.");
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);

    void video.play().then(markReady).catch(failCamera);

    timeoutId = setTimeout(() => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        failCamera();
      }
    }, 4000);

    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeStream, cameraState, stopCamera]);

  async function openCamera() {
    setError(null);
    setMessage(null);
    clearCapturedPhoto();

    if (!cameraSupported) {
      setError("Para continuar necesitas usar un dispositivo con cámara.");
      return;
    }

    try {
      setCameraState("opening");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment"
        }
      });

      stopCameraTracks();
      streamRef.current = stream;
      setActiveStream(stream);
    } catch {
      stopCamera();
      setError("No fue posible abrir la cámara. Permite el acceso a la cámara o intenta desde un celular.");
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || cameraState !== "ready" || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("No fue posible capturar la imagen. Intenta nuevamente.");
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      setError("No fue posible capturar la imagen. Intenta nuevamente.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("No fue posible capturar la imagen. Intenta nuevamente.");
        return;
      }

      const file = new File([blob], `perfume-photo-${Date.now()}.jpg`, {
        type: "image/jpeg"
      });

      stopCamera();
      setCapturedFile(file);
      setPreviewUrlFromFile(file);
    }, "image/jpeg", 0.92);
  }

  function useCapturedPhoto() {
    if (!capturedFile || busy) {
      return;
    }

    const file = capturedFile;
    setIsUploading(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await uploadFieldPerfumePhoto(screen.attemptId, file);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setPerfumePhotoCount(result.count);
        setMessage("Foto de perfume registrada correctamente.");
        clearCapturedPhoto();
      } catch {
        setError("No fue posible subir la foto. Revisa tu conexión e intenta nuevamente.");
      } finally {
        setIsUploading(false);
      }
    });
  }

  function submitForReview() {
    if (!hasMinimumPhotos || busy) {
      setError(`Debes registrar al menos ${screen.config.minPerfumePhotos} foto de perfume antes de continuar.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await completeFieldEvidenceSubmissionAction(screen.attemptId);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      window.location.href = result.data.redirectTo;
    });
  }

  function repeatPhoto() {
    clearCapturedPhoto();
    void openCamera();
  }

  function setPreviewUrlFromFile(file: File) {
    revokePreview();
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function clearCapturedPhoto() {
    revokePreview();
    setPreviewUrl(null);
    setCapturedFile(null);
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-950">Fotos de marcas de perfumes</h2>
          <p className="text-sm leading-6 text-zinc-600">
            Toma de una a cinco fotos donde se vean las marcas o envases de los perfumes que utilizas.
          </p>
          <p className="text-sm text-zinc-500">
            {perfumePhotoCount} de {screen.config.maxPerfumePhotos} fotos agregadas. Mínimo requerido: {screen.config.minPerfumePhotos}.
          </p>
        </div>

        {perfumePhotoCount === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Todavía no hay fotos de perfumes registradas.</p>
        ) : null}

        {cameraState === "idle" && !previewUrl ? (
          <button className={`${primaryButtonClass} mt-4`} disabled={!canUploadMore} onClick={openCamera} type="button">
            Tomar foto del perfume
          </button>
        ) : null}

        {cameraState !== "idle" ? (
          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-950 p-3">
            <video
              autoPlay
              className="max-h-[70vh] min-h-64 w-full rounded-md object-cover"
              muted
              playsInline
              ref={videoRef}
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                className={primaryButtonClass}
                disabled={busy || cameraState !== "ready"}
                onClick={captureFromCamera}
                type="button"
              >
                {cameraState === "ready" ? "Tomar foto" : "Preparando cámara..."}
              </button>
              <button className={secondaryButtonClass} onClick={stopCamera} type="button">
                Cancelar cámara
              </button>
            </div>
          </div>
        ) : null}

        {previewUrl ? (
          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Vista previa de la foto capturada" className="max-h-[70vh] w-full rounded-md object-contain" src={previewUrl} />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button className={secondaryButtonClass} disabled={busy} onClick={repeatPhoto} type="button">
                Repetir foto
              </button>
              <button className={primaryButtonClass} disabled={busy} onClick={useCapturedPhoto} type="button">
                {busy ? "Subiendo foto..." : "Usar esta foto"}
              </button>
            </div>
          </div>
        ) : null}

        {perfumePhotoCount >= screen.config.maxPerfumePhotos ? (
          <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            Ya registraste el máximo de {screen.config.maxPerfumePhotos} fotos.
          </p>
        ) : null}

        <canvas className="hidden" ref={canvasRef} />
      </section>

      {!hasMinimumPhotos ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Debes registrar al menos {screen.config.minPerfumePhotos} foto de perfume antes de enviar tu perfil a revisión.
        </p>
      ) : null}

      <button className={primaryButtonClass} disabled={!hasMinimumPhotos || busy} onClick={submitForReview} type="button">
        {busy ? "Enviando a revisión..." : "Enviar perfil a revisión"}
      </button>
    </div>
  );
}

async function uploadFieldPerfumePhoto(
  attemptId: string,
  file: File
): Promise<{ count: number; ok: true } | { message: string; ok: false }> {
  const metadata = {
    evidenceType: "PERFUME_PHOTO" as const,
    mimeType: file.type,
    originalFilename: file.name,
    sizeBytes: file.size
  };
  const signed = await requestFieldEvidenceUploadAction(attemptId, metadata);

  if (!signed.ok) {
    return signed;
  }

  if (!signed.data.token) {
    return {
      message: "No fue posible preparar la carga. Intenta de nuevo.",
      ok: false
    };
  }

  const { error } = await createBrowserSupabaseClient().storage
    .from(signed.data.storageBucket)
    .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    return {
      message: "No fue posible subir la foto. Revisa tu conexión e intenta nuevamente.",
      ok: false
    };
  }

  const confirmed = await confirmFieldEvidenceUploadAction(attemptId, {
    ...metadata,
    privateStorageKey: signed.data.privateStorageKey,
    storageBucket: signed.data.storageBucket
  });

  if (!confirmed.ok) {
    return {
      message: confirmed.message,
      ok: false
    };
  }

  return {
    count: confirmed.data.perfumePhotoCount,
    ok: true
  };
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
