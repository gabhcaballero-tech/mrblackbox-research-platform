"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  confirmHutReferenceSelfieUploadAction,
  requestHutReferenceSelfieUploadAction
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

type HutReferenceSelfieUploadProps = {
  disabled: boolean;
  disabledReason?: string | null;
  participantId: string;
  studyId: string;
};

export function HutReferenceSelfieUpload({
  disabled,
  disabledReason = null,
  participantId,
  studyId
}: HutReferenceSelfieUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "ready">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [isPending, startTransition] = useTransition();
  const previewUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function uploadSelfie() {
    if (!file || disabled || isPending) {
      setError("Toma una selfie de registro.");
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
        const signed = await requestHutReferenceSelfieUploadAction(studyId, participantId, metadata);

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
          setError("No fue posible subir la selfie de registro. Intenta de nuevo.");
          setMessage(null);
          return;
        }

        const confirmed = await confirmHutReferenceSelfieUploadAction(studyId, participantId, {
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
        clearCapturedPhoto();
        setMessage("Selfie de registro guardada correctamente.");
      } catch {
        setError("No fue posible guardar la selfie de registro. Intenta de nuevo.");
        setMessage(null);
      }
    });
  }

  async function openCamera() {
    setMessage(null);
    setError(null);
    clearCapturedPhoto();

    try {
      setCameraState("opening");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: FRONT_CAMERA_FACING_MODE }
      });
      stopCameraTracks();
      streamRef.current = stream;
      setActiveStream(stream);
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
        const capturedFile = new File([blob], `selfie-admin-hut-${Date.now()}.jpg`, { type: "image/jpeg" });
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
    if (!activeStream || !videoRef.current) {
      return;
    }

    videoRef.current.srcObject = activeStream;
    void videoRef.current.play().then(() => {
      setCameraState("ready");
    }).catch(() => {
      stopCamera();
      setError("No fue posible abrir la camara. Intenta de nuevo.");
    });
  }, [activeStream, stopCamera]);

  return (
    <div className="space-y-2">
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
      {disabled && disabledReason ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{disabledReason}</p>
      ) : null}
      {cameraState === "idle" && !previewUrl ? (
        <button className={secondaryButtonClass} disabled={disabled || isPending} onClick={() => void openCamera()} type="button">
          Tomar selfie de registro
        </button>
      ) : null}
      {cameraState !== "idle" ? (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-950 p-2">
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
            <SelfiePrivacyHud mode="camera" testIdPrefix="hut-admin-selfie" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} disabled={disabled || isPending || cameraState !== "ready"} onClick={captureSelfie} type="button">
              {cameraState === "ready" ? "Tomar selfie" : "Preparando camara..."}
            </button>
            <button className={secondaryButtonClass} disabled={isPending} onClick={stopCamera} type="button">
              Cancelar camara
            </button>
          </div>
        </div>
      ) : null}
      {previewUrl ? (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
          <div className={selfieMediaFrameClass}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Preview de selfie de registro"
              className={selfieMediaClass}
              data-mirrored={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? "true" : "false"}
              src={previewUrl}
              style={shouldMirrorSelfiePreview(FRONT_CAMERA_FACING_MODE) ? mirroredSelfiePreviewStyle : undefined}
            />
            <SelfiePrivacyHud mode="preview" testIdPrefix="hut-admin-selfie" />
          </div>
          <button className={secondaryButtonClass} disabled={disabled || isPending} onClick={clearCapturedPhoto} type="button">
            Repetir foto
          </button>
        </div>
      ) : null}
      <button
        className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={disabled || isPending || !file}
        onClick={uploadSelfie}
        type="button"
      >
        {isPending ? "Guardando selfie..." : "Guardar selfie de registro"}
      </button>
    </div>
  );
}

const secondaryButtonClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
