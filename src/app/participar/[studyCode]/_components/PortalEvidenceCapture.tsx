"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  confirmParticipantEvidenceUploadAction,
  requestParticipantEvidenceUploadAction
} from "@/modules/participant-portal/evidence-actions";
import type { ParticipantEvidenceKind } from "@/modules/participant-portal/evidence-storage";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type PortalEvidenceCaptureProps = {
  buttonLabel: string;
  captureFacingMode: "environment" | "user";
  currentCount: number;
  description: string;
  emptyState: string;
  evidenceType: ParticipantEvidenceKind;
  maxCount: number;
  minRequired: number;
  onCountChange?: (nextCount: number) => void;
  studyCode: string;
  title: string;
};

export function PortalEvidenceCapture({
  buttonLabel,
  captureFacingMode,
  currentCount,
  description,
  emptyState,
  evidenceType,
  maxCount,
  minRequired,
  onCountChange,
  studyCode,
  title
}: PortalEvidenceCaptureProps) {
  const [internalCount, setInternalCount] = useState(currentCount);
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

  const count = onCountChange ? currentCount : internalCount;
  const remaining = Math.max(0, maxCount - count);
  const busy = isPending || isUploading;
  const canUploadMore = remaining > 0 && !busy;
  const counterText =
    evidenceType === "SELFIE_IDENTIFICATION"
      ? `Selfie registrada: ${count}/${maxCount}`
      : `Fotos registradas: ${count}/${maxCount}. Mínimo requerido: ${minRequired}.`;

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
          facingMode: captureFacingMode
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
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError("No fue posible capturar la imagen. Intenta nuevamente.");
        return;
      }

      const file = new File([blob], `${evidenceType.toLowerCase()}-${Date.now()}.jpg`, {
        type: "image/jpeg"
      });

      stopCamera();
      setCapturedFile(file);
      setPreviewUrlFromFile(file);
    }, "image/jpeg", 0.92);
  }

  function useCapturedPhoto() {
    if (!capturedFile) {
      setError("No hay una foto lista para usar.");
      return;
    }

    if (busy) {
      return;
    }

    const file = capturedFile;
    setIsUploading(true);
    startTransition(async () => {
      try {
        const result = await uploadEvidenceFile(studyCode, evidenceType, file);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        if (onCountChange) {
          onCountChange(result.count);
        } else {
          setInternalCount(result.count);
        }
        setMessage("Evidencia registrada correctamente.");
        setError(null);
        clearCapturedPhoto();
      } catch {
        setError("No fue posible subir la foto. Revisa tu conexión e intenta nuevamente.");
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
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
        <p className="text-sm leading-6 text-zinc-600">{description}</p>
        <p className="text-sm text-zinc-500">{counterText}</p>
      </div>

      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {count === 0 ? <p className="mt-4 text-sm text-zinc-500">{emptyState}</p> : null}

      {cameraState === "idle" && !previewUrl ? (
        <div className="mt-4 flex flex-col gap-3">
          <button className={primaryButtonClass} disabled={!canUploadMore} onClick={openCamera} type="button">
            {buttonLabel}
          </button>
        </div>
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
          <img
            alt="Vista previa de la foto capturada"
            className="max-h-[70vh] w-full rounded-md object-contain"
            src={previewUrl}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button className={secondaryButtonClass} disabled={busy} onClick={repeatPhoto} type="button">
              Repetir foto
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={useCapturedPhoto} type="button">
              {busy ? <LoadingLabel label="Subiendo foto..." /> : "Usar esta foto"}
            </button>
          </div>
        </div>
      ) : null}

      {count >= maxCount ? (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          {evidenceType === "PERFUME_PHOTO"
            ? `Ya registraste el máximo de ${maxCount} fotos.`
            : "Ya registraste la selfie requerida."}
        </p>
      ) : null}

      <canvas className="hidden" ref={canvasRef} />
    </section>
  );
}

async function uploadEvidenceFile(
  studyCode: string,
  evidenceType: ParticipantEvidenceKind,
  file: File
): Promise<{ count: number; ok: true } | { message: string; ok: false }> {
  const metadata = {
    evidenceType,
    mimeType: file.type,
    originalFilename: file.name,
    sizeBytes: file.size
  };
  const signed = await requestParticipantEvidenceUploadAction(studyCode, metadata);

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

  const confirmed = await confirmParticipantEvidenceUploadAction(studyCode, {
    ...metadata,
    privateStorageKey: signed.data.privateStorageKey,
    storageBucket: signed.data.storageBucket
  });

  if (!confirmed.ok) {
    return {
      message: "La foto se subió, pero no fue posible registrarla. Contacta al administrador.",
      ok: false
    };
  }

  return {
    count:
      evidenceType === "PERFUME_PHOTO"
        ? confirmed.data.counts.perfumePhotos
        : confirmed.data.counts.selfie,
    ok: true
  };
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
      />
      {label}
    </span>
  );
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
