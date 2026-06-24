"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  confirmParticipantEvidenceUploadAction,
  requestParticipantEvidenceUploadAction
} from "@/modules/participant-portal/evidence-actions";
import type { ParticipantEvidenceKind } from "@/modules/participant-portal/evidence-storage";

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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
  const fileInputId = useId();
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => stopCamera, []);

  const count = onCountChange ? currentCount : internalCount;
  const remaining = Math.max(0, maxCount - count);
  const canUploadMore = remaining > 0 && !isPending;

  async function openCamera() {
    setError(null);
    setMessage(null);

    if (!cameraSupported) {
      setError(
        "Tu navegador no permitio abrir la camara. Intenta desde un celular o permite acceso a camara."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: captureFacingMode
        }
      });

      stopCamera();
      streamRef.current = stream;
      setCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError(
        "Tu navegador no permitio abrir la camara. Intenta desde un celular o permite acceso a camara."
      );
    }
  }

  function stopCamera() {
    const stream = streamRef.current;

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    streamRef.current = null;
    setCameraOpen(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setError("No fue posible capturar la imagen. Intenta nuevamente.");
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
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

      const file = new File(
        [blob],
        `${evidenceType.toLowerCase()}-${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      await uploadFile(file);
      stopCamera();
    }, "image/jpeg", 0.92);
  }

  function onFallbackFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    startTransition(async () => {
      const result = await uploadEvidenceFile(studyCode, evidenceType, file);

      if (!result.ok) {
        setError(result.message);
        event.currentTarget.value = "";
        return;
      }

      setInternalCount((current) => {
        const nextCount = Math.min(maxCount, current + 1);
        if (onCountChange) {
          onCountChange(nextCount);
          return current;
        }

        return nextCount;
      });
      setMessage("Evidencia subida correctamente.");
      setError(null);
      event.currentTarget.value = "";
    });
  }

  async function uploadFile(file: File) {
    startTransition(async () => {
      const result = await uploadEvidenceFile(studyCode, evidenceType, file);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setInternalCount((current) => {
        const nextCount = Math.min(maxCount, current + 1);
        if (onCountChange) {
          onCountChange(nextCount);
          return current;
        }

        return nextCount;
      });
      setMessage("Evidencia subida correctamente.");
      setError(null);
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
        <p className="text-sm leading-6 text-zinc-600">{description}</p>
        <p className="text-sm text-zinc-500">
          Registradas: {count}/{maxCount}. Minimo requerido: {minRequired}.
        </p>
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

      <div className="mt-4 flex flex-col gap-3">
        <button
          className={primaryButtonClass}
          disabled={!canUploadMore}
          onClick={openCamera}
          type="button"
        >
          {buttonLabel}
        </button>

        <label className="text-sm font-medium text-zinc-700" htmlFor={fileInputId}>
          Si la camara no se abre, usa este respaldo
        </label>
        <input
          accept="image/*"
          capture={captureFacingMode}
          className={inputClass}
          disabled={!canUploadMore}
          id={fileInputId}
          inputMode="none"
          onChange={onFallbackFileChange}
          type="file"
        />
      </div>

      {cameraOpen ? (
        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-950 p-3">
          <video
            autoPlay
            className="h-72 w-full rounded-md object-cover"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button className={primaryButtonClass} disabled={isPending} onClick={captureFromCamera} type="button">
              Tomar foto
            </button>
            <button className={secondaryButtonClass} onClick={stopCamera} type="button">
              Cancelar camara
            </button>
          </div>
        </div>
      ) : null}

      <canvas className="hidden" ref={canvasRef} />
    </section>
  );
}

async function uploadEvidenceFile(
  studyCode: string,
  evidenceType: ParticipantEvidenceKind,
  file: File
): Promise<{ ok: true } | { message: string; ok: false }> {
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

  const uploadResponse = await fetch(signed.data.signedUrl, {
    body: file,
    headers: {
      "content-type": file.type
    },
    method: "PUT"
  });

  if (!uploadResponse.ok) {
    return {
      message: "No fue posible subir la evidencia. Intenta nuevamente.",
      ok: false
    };
  }

  const confirmed = await confirmParticipantEvidenceUploadAction(studyCode, {
    ...metadata,
    privateStorageKey: signed.data.privateStorageKey,
    storageBucket: signed.data.storageBucket
  });

  return confirmed.ok ? { ok: true } : confirmed;
}

const inputClass =
  "min-h-12 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
