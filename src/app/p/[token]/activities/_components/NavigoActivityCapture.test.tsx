import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmNavigoActivitySelfieUploadAction,
  confirmNavigoT0IdentityAction,
  requestNavigoActivitySelfieUploadAction
} from "@/modules/navigo-app/actions";
import { createNavigoMeasurementDefinition } from "@/modules/navigo-app";
import { verifyNavigoFaceIdentity } from "@/modules/navigo-app/face-verification-client";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { NavigoActivityCapture, shouldMirrorCameraPreview } from "./NavigoActivityCapture";

vi.mock("@/modules/navigo-app/actions", () => ({
  confirmNavigoActivitySelfieUploadAction: vi.fn(),
  confirmNavigoT0IdentityAction: vi.fn(),
  requestNavigoActivitySelfieUploadAction: vi.fn(),
  submitNavigoActivityResponsesAction: vi.fn()
}));

const uploadToSignedUrl = vi.fn();

vi.mock("@/shared/auth/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl
      }))
    }
  }))
}));

vi.mock("@/modules/navigo-app/face-verification-client", () => ({
  verifyNavigoFaceIdentity: vi.fn()
}));

let videoSize = { height: 480, width: 640 };

const questions = createNavigoMeasurementDefinition().questions;

function renderCapture(overrides: Partial<Parameters<typeof NavigoActivityCapture>[0]> = {}) {
  return render(
    <NavigoActivityCapture
      activityId="activity-t2"
      existingResponses={{}}
      fragranceCodes={{ left: "CODIGO-A", right: "CODIGO-B" }}
      questions={questions}
      registeredSelfie={null}
      requiresSelfie
      selfieCount={0}
      selfieReviewStatus={null}
      testModeParams={null}
      token="participant-token"
      {...overrides}
    />
  );
}

beforeEach(() => {
  videoSize = { height: 480, width: 640 };
  vi.useRealTimers();
  vi.mocked(requestNavigoActivitySelfieUploadAction).mockResolvedValue({
    data: {
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        sizeBytes: 100
      },
      privateStorageKey: "studies/study-1/participants/profile-1/activities/activity-t2/selfie.jpg",
      storageBucket: "participant-evidence",
      token: "signed-token"
    },
    ok: true
  });
  vi.mocked(verifyNavigoFaceIdentity).mockResolvedValue({
    evaluatedAt: "2026-06-26T12:00:00.000Z",
    method: "@vladmandic/human:faceres+blazeface:v1",
    score: 0.82,
    status: "MATCH"
  });
  vi.mocked(confirmNavigoActivitySelfieUploadAction).mockImplementation(async (_token, _activityId, metadata) => {
    const status = metadata.faceVerification?.status;

    if (status === "MATCH") {
      return { data: { internalNote: "MATCH", reviewStatus: "APPROVED", selfieCount: 1 }, ok: true };
    }
    if (status === "NO_MATCH") {
      return { data: { internalNote: "NO_MATCH", reviewStatus: "REJECTED", selfieCount: 1 }, ok: true };
    }

    return { data: { internalNote: "PENDING", reviewStatus: "PENDING", selfieCount: 1 }, ok: true };
  });
  vi.mocked(confirmNavigoT0IdentityAction).mockResolvedValue({
    data: { identityStatus: "CONFIRMED" },
    ok: true
  });
  uploadToSignedUrl.mockResolvedValue({ data: null, error: null });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }))
    }
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => videoSize.width
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => videoSize.height
  });
  HTMLVideoElement.prototype.play = vi.fn(async () => undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn()
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob(["photo"], { type: "image/jpeg" }));
  });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("NavigoActivityCapture", () => {
  it("shows the front camera preview mirrored for selfies", async () => {
    const view = renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));

    const video = await waitForVideoElement(view.container);
    expect(video).toHaveAttribute("data-mirrored", "true");
    expect(video).toHaveStyle({ transform: "scaleX(-1)" });
    expect(screen.getByText("La vista de cámara se muestra como espejo para facilitar la selfie.")).toBeInTheDocument();
  });

  it("does not show AP1 to AP7 for T2/T4/T8 until the activity selfie is saved", () => {
    renderCapture();

    expect(screen.getByText("Selfie de identificación")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
    expect(screen.queryByText(questions[0]?.text ?? "")).not.toBeInTheDocument();
  });

  it("shows AP1 to AP7 for T2/T4/T8 when the activity selfie already exists", () => {
    renderCapture({ selfieCount: 1, selfieReviewStatus: "APPROVED" });

    expect(screen.getByText("Preguntas AP1 a AP7")).toBeInTheDocument();
    expect(screen.getByText(questions[0]?.text ?? "")).toBeInTheDocument();
  });

  it("keeps AP1 to AP7 hidden when activity identity review is pending or rejected", () => {
    const pending = renderCapture({ selfieCount: 1, selfieReviewStatus: "PENDING" });

    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
    expect(screen.getByText("No fue posible confirmar tu identidad automáticamente. Contacta a tu reclutador.")).toBeInTheDocument();
    pending.unmount();

    renderCapture({ selfieCount: 1, selfieReviewStatus: "REJECTED" });

    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
    expect(screen.getByText("No fue posible confirmar tu identidad. Contacta a tu reclutador.")).toBeInTheDocument();
  });

  it("keeps T0 on identity confirmation and only shows AP1 to AP7 after identity YES", async () => {
    renderCapture({
      activityId: "activity-t0",
      registeredSelfie: { signedUrl: "https://example.test/selfie.jpg" },
      requiresSelfie: false
    });

    expect(screen.getByText("Verificación visual de identidad")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sí, coincide."));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Preguntas AP1 a AP7")).toBeInTheDocument();
    expect(confirmNavigoT0IdentityAction).toHaveBeenCalledWith("participant-token", "activity-t0", "YES");
  });

  it("blocks T0 when identity is rejected", async () => {
    vi.mocked(confirmNavigoT0IdentityAction).mockResolvedValueOnce({
      data: { identityStatus: "REJECTED" },
      ok: true
    });
    renderCapture({
      activityId: "activity-t0",
      registeredSelfie: { signedUrl: "https://example.test/selfie.jpg" },
      requiresSelfie: false
    });

    fireEvent.click(screen.getByLabelText("No, no coincide."));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Incidencia de identidad en T0")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("uploads a selfie and only then opens AP1 to AP7", async () => {
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValueOnce({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      score: 0.62,
      status: "MATCH"
    });
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    await uploadSelfie();

    expect(createBrowserSupabaseClient).toHaveBeenCalled();
    expect(verifyNavigoFaceIdentity).toHaveBeenCalledWith({
      capturedSelfie: expect.any(File),
      registeredSelfieUrl: "https://example.test/base-selfie.jpg"
    });
    expect(confirmNavigoActivitySelfieUploadAction).toHaveBeenCalledWith(
      "participant-token",
      "activity-t2",
      expect.objectContaining({
        faceVerification: expect.objectContaining({ status: "MATCH" })
      })
    );
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "studies/study-1/participants/profile-1/activities/activity-t2/selfie.jpg",
      "signed-token",
      expect.any(File),
      expect.objectContaining({ upsert: false })
    );
    expect(await screen.findByText("Preguntas AP1 a AP7")).toBeInTheDocument();
  });

  it("rejects an automatic NO_MATCH result and keeps AP1 to AP7 hidden", async () => {
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValueOnce({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      reason: "LOW_SIMILARITY",
      score: 0.2,
      status: "NO_MATCH"
    });
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    await uploadSelfie();

    expect(await screen.findByText("No fue posible confirmar tu identidad. Contacta a tu reclutador.")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("keeps AP1 to AP7 hidden when automatic verification is uncertain", async () => {
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValueOnce({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      reason: "LOW_SIMILARITY",
      score: 0.599,
      status: "UNCERTAIN"
    });
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    await uploadSelfie();

    expect(await screen.findByText("No fue posible confirmar tu identidad automáticamente. Contacta a tu reclutador.")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("keeps AP1 to AP7 hidden when the similarity is 0.351 and remains uncertain", async () => {
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValueOnce({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      reason: "LOW_SIMILARITY",
      score: 0.351,
      status: "UNCERTAIN"
    });
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    await uploadSelfie();

    expect(await screen.findByText("No fue posible confirmar tu identidad automáticamente. Contacta a tu reclutador.")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("keeps AP1 to AP7 hidden when the facial model returns an error", async () => {
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValueOnce({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      reason: "MODEL_ERROR",
      score: null,
      status: "ERROR"
    });
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    await uploadSelfie();

    expect(await screen.findByText("No fue posible confirmar tu identidad automáticamente. Contacta a tu reclutador.")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("keeps AP1 to AP7 hidden when upload fails", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("network") });
    renderCapture();

    await uploadSelfie({ waitForConfirmation: false });

    expect(await screen.findByText("No fue posible subir la selfie. Revisa tu conexión e intenta nuevamente.")).toBeInTheDocument();
    expect(screen.queryByText("Preguntas AP1 a AP7")).not.toBeInTheDocument();
  });

  it("does not stay forever on camera preparation when no frames arrive", async () => {
    vi.useFakeTimers();
    videoSize = { height: 0, width: 0 };
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Preparando cámara..." })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(9100);
    });

    expect(screen.getByText("La cámara no entregó imagen. Cierra otras apps que usen la cámara y vuelve a intentarlo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Intentar de nuevo" })).toBeInTheDocument();
  });

  it("shows a clear camera permission error", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError")
    );
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));

    expect(
      await screen.findByText("No se pudo acceder a la cámara. Revisa los permisos del navegador y vuelve a intentarlo.")
    ).toBeInTheDocument();
  });

  it("shows the captured selfie preview mirrored without changing facial verification", async () => {
    renderCapture({ registeredSelfie: { signedUrl: "https://example.test/base-selfie.jpg" } });

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));

    const preview = await screen.findByAltText("Vista previa de selfie");
    expect(preview).toHaveAttribute("data-mirrored", "true");
    expect(preview).toHaveStyle({ transform: "scaleX(-1)" });

    fireEvent.click(screen.getByRole("button", { name: "Usar esta selfie" }));
    await waitFor(() =>
      expect(verifyNavigoFaceIdentity).toHaveBeenCalledWith({
        capturedSelfie: expect.any(File),
        registeredSelfieUrl: "https://example.test/base-selfie.jpg"
      })
    );
  });
});

describe("shouldMirrorCameraPreview", () => {
  it("mirrors the front camera preview", () => {
    expect(shouldMirrorCameraPreview("user")).toBe(true);
  });

  it("does not mirror a rear camera preview", () => {
    expect(shouldMirrorCameraPreview("environment")).toBe(false);
  });
});

async function uploadSelfie({ waitForConfirmation = true }: { waitForConfirmation?: boolean } = {}) {
  fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));
  fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar esta selfie" }));
  if (waitForConfirmation) {
    await waitFor(() => expect(confirmNavigoActivitySelfieUploadAction).toHaveBeenCalled());
  }
}

async function waitForVideoElement(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  return container.querySelector("video") as HTMLVideoElement;
}
