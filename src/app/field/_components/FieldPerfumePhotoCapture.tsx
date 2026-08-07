"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  confirmFieldEvidenceUploadAction,
  requestFieldEvidenceUploadAction
} from "@/modules/field/evidence-actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type FieldPerfumePhotoCaptureProps = {
  attemptId: string;
  currentCount: number;
  maxCount: number;
  minRequired: number;
  onCountChange: (nextCount: number) => void;
};

export function FieldPerfumePhotoCapture({
  attemptId,
  currentCount,
  maxCount,
  minRequired,
  onCountChange
}: FieldPerfumePhotoCaptureProps) {
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
  const remaining = Math.max(0, maxCount - currentCount);
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
        const result = await uploadFieldPerfumePhoto(attemptId, file);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        onCountChange(result.count);
        setMessage("Foto de perfume registrada correctamente.");
        clearCapturedPhoto();
      } catch {
        setError("No fue posible subir la foto. Revisa tu conexión e intenta nuevamente. La foto sigue en pantalla para reintentar.");
      } finally {
        setIsUploading(false);
      }
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
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-950">Fotos de marcas de perfumes</h3>
        <p className="text-sm leading-6 text-zinc-600">
          Después de escribir las marcas que utilizas, toma de una a cinco fotos de tus perfumes. Debe verse la marca o el envase cuando sea posible.
        </p>
        <p className="text-sm text-zinc-500">
          {currentCount} de {maxCount} fotos agregadas. Mínimo requerido: {minRequired}.
        </p>
      </div>

      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {currentCount === 0 ? <p className="mt-4 text-sm text-zinc-500">Todavía no hay fotos de perfumes registradas.</p> : null}

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
        <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-3">
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

      {currentCount >= maxCount ? (
        <p className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          Ya registraste el máximo de {maxCount} fotos.
        </p>
      ) : null}

      <canvas className="hidden" ref={canvasRef} />
    </section>
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
      message: "No fue posible preparar la carga. Revisa tu conexión e intenta nuevamente.",
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
      message: "No fue posible subir la foto. Revisa tu conexión e intenta nuevamente. La foto sigue en pantalla para reintentar.",
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
      message:
        confirmed.message ||
        "La foto se subió, pero no fue posible registrarla. Presiona Usar esta foto para reintentar o toma otra foto.",
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
