"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { NAVIGO_T0_IDENTITY_QUESTION_ID } from "@/modules/navigo-app/definition";
import {
  confirmNavigoT0IdentityAction,
  confirmNavigoActivitySelfieUploadAction,
  requestNavigoActivitySelfieUploadAction,
  submitNavigoActivityResponsesAction
} from "@/modules/navigo-app/actions";
import type { QuestionnaireQuestion } from "@/modules/questionnaire-engine";
import type { NavigoTestModeParams } from "@/modules/navigo-app/test-mode";
import { verifyNavigoFaceIdentity } from "@/modules/navigo-app/face-verification-client";
import type { NavigoFaceVerificationClientResult } from "@/modules/navigo-app/face-verification-contract";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";

type NavigoActivityCaptureProps = {
  activityId: string;
  error?: string;
  existingResponses: Record<string, unknown>;
  fragranceCodes: {
    left: string;
    right: string;
  };
  questions: QuestionnaireQuestion[];
  registeredSelfie: {
    signedUrl: string;
  } | null;
  requiresSelfie: boolean;
  selfieReviewStatus: "APPROVED" | "PENDING" | "REJECTED" | null;
  selfieCount: number;
  testModeParams: NavigoTestModeParams | null;
  token: string;
};

export function NavigoActivityCapture({
  activityId,
  error,
  existingResponses,
  fragranceCodes,
  questions,
  registeredSelfie,
  requiresSelfie,
  selfieReviewStatus,
  selfieCount,
  testModeParams,
  token
}: NavigoActivityCaptureProps) {
  const [selfies, setSelfies] = useState(selfieCount);
  const [identityConfirmed, setIdentityConfirmed] = useState(
    readAnswerValue(existingResponses[NAVIGO_T0_IDENTITY_QUESTION_ID]) === "YES"
  );
  const [identityRejected, setIdentityRejected] = useState(
    readAnswerValue(existingResponses[NAVIGO_T0_IDENTITY_QUESTION_ID]) === "NO"
  );
  const [identityStep, setIdentityStep] = useState<"identity" | "incident" | "questions">(() => {
    if (requiresSelfie) {
      return "questions";
    }
    if (readAnswerValue(existingResponses[NAVIGO_T0_IDENTITY_QUESTION_ID]) === "YES") {
      return "questions";
    }
    if (readAnswerValue(existingResponses[NAVIGO_T0_IDENTITY_QUESTION_ID]) === "NO") {
      return "incident";
    }
    return "identity";
  });
  const [message, setMessage] = useState<string | null>(null);
  const [identityReviewStatus, setIdentityReviewStatus] = useState<"APPROVED" | "PENDING" | "REJECTED" | null>(selfieReviewStatus);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "ready">("idle");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selfieProcessingLabel, setSelfieProcessingLabel] = useState("Subiendo selfie...");
  const [isUploading, setIsUploading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [isPending, startTransition] = useTransition();
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

    function failCamera(message = "No fue posible preparar la cámara. Intenta nuevamente.") {
      if (settled) {
        return;
      }
      settled = true;
      stopCamera();
      setUploadError(message);
      setTimeout(() => setUploadError(message), 0);
      setUploadError(message);
      setUploadError("No fue posible abrir la cámara. Permite el acceso a la cámara o intenta desde un celular.");
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    void video.play().then(markReady).catch(() => failCamera());
    timeoutId = setTimeout(() => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        failCamera("La cámara no entregó imagen. Cierra otras apps que usen la cámara y vuelve a intentarlo.");
      }
    }, 9000);

    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeStream, cameraState, stopCamera]);

  async function openCamera() {
    setMessage(null);
    setUploadError(null);
    clearCapturedPhoto();

    if (!cameraSupported) {
      setUploadError("Para continuar necesitas usar un dispositivo con cámara.");
      return;
    }

    try {
      setCameraState("opening");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user"
        }
      });
      stopCameraTracks();
      streamRef.current = stream;
      setActiveStream(stream);
    } catch (caughtError) {
      stopCamera();
      setTimeout(() => setUploadError(cameraErrorMessage(caughtError)), 0);
      setUploadError("No fue posible abrir la cámara. Permite el acceso a la cámara o intenta desde un celular.");
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || cameraState !== "ready" || video.videoWidth === 0 || video.videoHeight === 0) {
      setUploadError("La cámara no entregó imagen. Cierra otras apps que usen la cámara y vuelve a intentarlo.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setUploadError("No fue posible capturar la imagen. Intenta nuevamente.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setUploadError("No fue posible capturar la imagen. Intenta nuevamente.");
        return;
      }

      const file = new File([blob], `selfie-actividad-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      setCapturedFile(file);
      setPreviewUrlFromFile(file);
    }, "image/jpeg", 0.92);
  }

  function useCapturedPhoto() {
    if (!capturedFile || isUploading || isPending) {
      return;
    }

    const file = capturedFile;
    setIsUploading(true);
    setSelfieProcessingLabel("Subiendo selfie...");
    setUploadError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const metadata = {
          evidenceType: "SELFIE_IDENTIFICATION" as const,
          mimeType: file.type,
          originalFilename: file.name,
          sizeBytes: file.size
        };
        const signed = await requestNavigoActivitySelfieUploadAction(token, activityId, metadata);
        if (!signed.ok) {
          setUploadError(signed.message);
          return;
        }

        const upload = await createBrowserSupabaseClient().storage
          .from(signed.data.storageBucket)
          .uploadToSignedUrl(signed.data.privateStorageKey, signed.data.token, file, {
            contentType: file.type,
            upsert: false
          });

        if (upload.error) {
          setUploadError("No fue posible subir la selfie. Revisa tu conexión e intenta nuevamente.");
          return;
        }

        setSelfieProcessingLabel("Verificando identidad...");
        const faceVerification = await runActivityFaceVerification({
          capturedSelfie: file,
          registeredSelfieUrl: registeredSelfie?.signedUrl ?? null
        });

        const confirmed = await confirmNavigoActivitySelfieUploadAction(token, activityId, {
          faceVerification,
          ...metadata,
          privateStorageKey: signed.data.privateStorageKey,
          storageBucket: signed.data.storageBucket
        });

        if (!confirmed.ok) {
          setUploadError(confirmed.message);
          return;
        }

        setSelfies(confirmed.data.selfieCount);
        setIdentityReviewStatus(confirmed.data.reviewStatus);
        setMessage(activityIdentityMessage(confirmed.data.reviewStatus));
        clearCapturedPhoto();
      } catch {
        setUploadError("No fue posible subir la selfie. Revisa tu conexión e intenta nuevamente.");
      } finally {
        setSelfieProcessingLabel("Subiendo selfie...");
        setIsUploading(false);
      }
    });
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

  const busy = isUploading || isPending;
  const hasApprovedIdentitySelfie = !requiresSelfie || (selfies >= 1 && identityReviewStatus === "APPROVED");
  const showQuestions = requiresSelfie ? hasApprovedIdentitySelfie : identityStep === "questions";

  return (
    <div className="space-y-6">
      {requiresSelfie ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Selfie de identificación</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Toma una selfie clara para confirmar que eres la misma persona que participa en el estudio.
          </p>
          <p className="mt-2 text-sm text-zinc-500">Selfie registrada: {selfies}/1</p>

          {message && identityReviewStatus === "APPROVED" ? (
            <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {uploadError ? (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {uploadError}
            </p>
          ) : null}

          {selfies === 0 && cameraState === "idle" && !previewUrl ? (
            <button className={primaryButtonClass} disabled={busy} onClick={openCamera} type="button">
              {uploadError ? "Intentar de nuevo" : "Tomar selfie"}
            </button>
          ) : null}

          {cameraState !== "idle" ? (
            <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-950 p-3">
              <video autoPlay className="max-h-[70vh] min-h-64 w-full rounded-md object-cover" muted playsInline ref={videoRef} />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button className={primaryButtonClass} disabled={busy || cameraState !== "ready"} onClick={captureFromCamera} type="button">
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
              <img alt="Vista previa de selfie" className="max-h-[70vh] w-full rounded-md object-contain" src={previewUrl} />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button className={secondaryButtonClass} disabled={busy} onClick={clearCapturedPhoto} type="button">
                  Repetir foto
                </button>
                <button className={primaryButtonClass} disabled={busy} onClick={useCapturedPhoto} type="button">
                  {busy ? selfieProcessingLabel : "Usar esta selfie"}
                </button>
              </div>
            </div>
          ) : null}

          {selfies >= 1 ? (
            <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              Selfie lista. Ya puedes guardar la evaluación.
            </p>
          ) : null}
          {requiresSelfie && selfies >= 1 && identityReviewStatus !== "APPROVED" ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
              {activityIdentityMessage(identityReviewStatus)}
            </p>
          ) : null}
          <canvas className="hidden" ref={canvasRef} />
        </section>
      ) : null}

      {!requiresSelfie && identityStep === "incident" ? <IdentityIncidentState registeredSelfie={registeredSelfie} /> : null}

      {!requiresSelfie && identityStep === "identity" ? (
        <IdentityConfirmation
          busy={busy}
          identityConfirmed={identityConfirmed}
          identityError={identityError}
          identityRejected={identityRejected}
          onContinue={confirmIdentity}
          registeredSelfie={registeredSelfie}
          setIdentityConfirmed={setIdentityConfirmed}
          setIdentityRejected={setIdentityRejected}
        />
      ) : null}

      {showQuestions ? (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Preguntas AP1 a AP7</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Recuerda oler ambos antebrazos antes de responder.
        </p>
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <p>Primera fragancia = brazo izquierdo</p>
          <p>Segunda fragancia = brazo derecho</p>
          <p className="mt-1 font-mono">Brazo izquierdo: {fragranceCodes.left}</p>
          <p className="font-mono">Brazo derecho: {fragranceCodes.right}</p>
        </div>
        {error ? <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {requiresSelfie && selfies === 0 ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Toma y guarda la selfie antes de enviar las respuestas.
          </p>
        ) : null}
        <form action={submitNavigoActivityResponsesAction.bind(null, token, activityId)} className="mt-5 space-y-6">
          {questions.map((question, index) => (
            <QuestionControl
              answer={existingResponses[question.id]}
              index={index + 1}
              key={question.id}
              question={question}
            />
          ))}
          {!requiresSelfie ? (
            <input
              name={NAVIGO_T0_IDENTITY_QUESTION_ID}
              type="hidden"
              value={identityConfirmed ? "YES" : identityRejected ? "NO" : ""}
            />
          ) : null}
          {testModeParams ? (
            <>
              <input name="navigoTestMode" type="hidden" value={testModeParams.navigoTestMode} />
              <input name="navigoTestSignature" type="hidden" value={testModeParams.navigoTestSignature} />
            </>
          ) : null}
          {identityRejected ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              No se puede continuar. Contacta al supervisor para revisar la identidad del participante.
            </p>
          ) : null}
          <button className={primaryButtonClass} disabled={(requiresSelfie && selfies === 0) || (!requiresSelfie && !identityConfirmed)} type="submit">
            Guardar evaluación
          </button>
        </form>
      </section>
      ) : null}
    </div>
  );

  function confirmIdentity() {
    if (!identityConfirmed && !identityRejected) {
      setIdentityError("Selecciona si la persona coincide o no con la foto registrada.");
      return;
    }

    const value = identityConfirmed ? "YES" : "NO";
    setIdentityError(null);

    startTransition(async () => {
      const result = await confirmNavigoT0IdentityAction(token, activityId, value);
      if (!result.ok) {
        setIdentityError(result.message);
        return;
      }
      if (result.data.identityStatus === "REJECTED") {
        setIdentityStep("incident");
        return;
      }
      setIdentityStep("questions");
    });
  }
}

function IdentityIncidentState({ registeredSelfie }: { registeredSelfie: { signedUrl: string } | null }) {
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-rose-950">Incidencia de identidad en T0</h3>
      <p className="mt-2 text-sm leading-6 text-rose-900">
        No se puede continuar. Contacta al supervisor para revisar la identidad del participante.
      </p>
      {registeredSelfie ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Foto registrada del participante"
            className="max-h-[70vh] w-full rounded-md object-contain"
            src={registeredSelfie.signedUrl}
          />
        </div>
      ) : null}
    </section>
  );
}

async function runActivityFaceVerification(input: {
  capturedSelfie: File;
  registeredSelfieUrl: string | null;
}): Promise<NavigoFaceVerificationClientResult> {
  return verifyNavigoFaceIdentity(input);
}

function IdentityConfirmation({
  busy,
  identityConfirmed,
  identityError,
  identityRejected,
  onContinue,
  registeredSelfie,
  setIdentityConfirmed,
  setIdentityRejected
}: {
  busy: boolean;
  identityConfirmed: boolean;
  identityError: string | null;
  identityRejected: boolean;
  onContinue: () => void;
  registeredSelfie: { signedUrl: string } | null;
  setIdentityConfirmed: (value: boolean) => void;
  setIdentityRejected: (value: boolean) => void;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-amber-950">Verificación visual de identidad</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        El encuestador debe confirmar que la persona presente coincide con la foto registrada en el filtro.
      </p>
      {registeredSelfie ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Foto registrada del participante"
            className="max-h-[70vh] w-full rounded-md object-contain"
            src={registeredSelfie.signedUrl}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-rose-800">
          No encontramos una foto registrada para comparar. Contacta al supervisor antes de continuar.
        </p>
      )}
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-amber-950">
          El encuestador debe confirmar: ¿la persona presente coincide con la foto registrada?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-md border border-amber-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900">
            <input
              checked={identityConfirmed}
              disabled={!registeredSelfie}
              onChange={() => {
                setIdentityConfirmed(true);
                setIdentityRejected(false);
              }}
              type="radio"
            />
            Sí, coincide.
          </label>
          <label className="flex items-center gap-3 rounded-md border border-amber-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900">
            <input
              checked={identityRejected}
              onChange={() => {
                setIdentityConfirmed(false);
                setIdentityRejected(true);
              }}
              type="radio"
            />
            No, no coincide.
          </label>
        </div>
      </fieldset>
      {identityRejected ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-rose-800">
          No se puede continuar. Contacta al supervisor para revisar la identidad del participante.
        </p>
      ) : null}
      {identityError ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-rose-800">
          {identityError}
        </p>
      ) : null}
      <button
        className={primaryButtonClass}
        disabled={busy || (!identityConfirmed && !identityRejected) || (identityConfirmed && !registeredSelfie)}
        onClick={onContinue}
        type="button"
      >
        {busy ? "Guardando identidad..." : "Continuar"}
      </button>
    </section>
  );
}

function QuestionControl({
  answer,
  index,
  question
}: {
  answer: unknown;
  index: number;
  question: QuestionnaireQuestion;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 p-4">
      <legend className="px-1 text-sm font-semibold text-teal-700">AP{index}</legend>
      <p className="text-base font-semibold text-zinc-950">{question.text}</p>
      {question.type === "single_choice" ? (
        <div className="mt-4 space-y-3">
          {question.options.map((option) => (
            <label className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800" key={option.value}>
              <input defaultChecked={readAnswerValue(answer) === option.value} name={question.id} required={question.required} type="radio" value={option.value} />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "scale" ? (
        <div className="mt-4">
          <div className={question.max <= 7 ? "grid gap-2 sm:grid-cols-2" : "grid grid-cols-2 gap-2 sm:grid-cols-5"}>
            {Array.from({ length: question.max - question.min + 1 }, (_, offset) => question.min + offset).map((value) => (
              <label className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-3 text-sm text-zinc-800" key={value}>
                <input defaultChecked={readAnswerValue(answer) === value} name={question.id} required={question.required} type="radio" value={value} />
                <span>
                  <span className="font-semibold">{value}</span>
                  <span className="ml-2">{scaleOptionLabel(question.id, value)}</span>
                </span>
              </label>
            ))}
          </div>
          {question.minLabel || question.maxLabel ? (
            <div className="mt-2 flex justify-between gap-4 text-xs text-zinc-500">
              <span>{question.minLabel}</span>
              <span className="text-right">{question.maxLabel}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function scaleOptionLabel(questionId: string, value: number): string {
  if (questionId === "AP3_INTENSIDAD_PRIMERA" || questionId === "AP4_INTENSIDAD_SEGUNDA") {
    return (
      {
        1: "Extremadamente débil",
        2: "Muy débil",
        3: "Algo débil",
        4: "Ni débil, ni fuerte",
        5: "Algo fuerte",
        6: "Muy fuerte",
        7: "Extremadamente fuerte"
      }[value] ?? ""
    );
  }

  if (value === 1) {
    return "Muy baja calificación";
  }
  if (value === 10) {
    return "Excelente calificación";
  }

  return "";
}

function readAnswerValue(answer: unknown): string | number | null {
  if (typeof answer === "object" && answer !== null && "value" in answer) {
    const value = (answer as { value?: unknown }).value;
    return typeof value === "string" || typeof value === "number" ? value : null;
  }

  return null;
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "No se pudo acceder a la cámara. Revisa los permisos del navegador y vuelve a intentarlo.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No se encontró una cámara disponible en este dispositivo.";
  }

  return "No fue posible preparar la cámara. Intenta nuevamente.";
}

function activityIdentityMessage(status: "APPROVED" | "PENDING" | "REJECTED" | null): string {
  if (status === "APPROVED") {
    return "Identidad verificada. Continúa con la evaluación.";
  }

  if (status === "REJECTED") {
    return "No fue posible confirmar tu identidad. Contacta a tu reclutador.";
  }

  return "No fue posible confirmar tu identidad automáticamente. Contacta a tu reclutador.";
}

const primaryButtonClass =
  "mt-4 inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClass =
  "inline-flex w-full justify-center rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
