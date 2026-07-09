import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldSelfieStep } from "./FieldSelfieStep";
import { completeFieldEvidenceSubmissionAction } from "@/modules/field/evidence-actions";

vi.mock("@/modules/field/evidence-actions", () => ({
  completeFieldEvidenceSubmissionAction: vi.fn(),
  confirmFieldEvidenceUploadAction: vi.fn(),
  requestFieldEvidenceUploadAction: vi.fn()
}));

vi.mock("@/shared/auth/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn()
      }))
    }
  }))
}));

describe("FieldSelfieStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" }
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }]
        }))
      }
    });
    HTMLVideoElement.prototype.play = vi.fn(async () => undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 480
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn()
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["photo"], { type: "image/jpeg" }));
    });
    URL.createObjectURL = vi.fn(() => "blob:field-selfie");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the privacy HUD over the live camera", async () => {
    render(<FieldSelfieStep screen={fieldSelfieScreen()} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir cámara" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          facingMode: "user"
        }
      });
    });
    expect(await screen.findByTestId("field-selfie-camera-hud")).toBeInTheDocument();
    expect(screen.getByText("Coloca tus ojos aquí")).toBeInTheDocument();
  });

  it("shows the privacy HUD in the selfie preview while capturing from the original video", async () => {
    render(<FieldSelfieStep screen={fieldSelfieScreen()} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir cámara" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));

    expect(await screen.findByAltText("Vista previa de la selfie capturada")).toBeInTheDocument();
    expect(screen.getByTestId("field-selfie-preview-hud")).toBeInTheDocument();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled();
  });

  it("continues to perfume photos when the evidence action returns that route", async () => {
    vi.mocked(completeFieldEvidenceSubmissionAction).mockResolvedValueOnce({
      data: {
        redirectTo: "/field/screening/attempt-1/evidences"
      },
      ok: true
    });
    render(<FieldSelfieStep screen={fieldSelfieScreen({ perfumePhotos: 0, selfie: 1 })} />);

    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    await waitFor(() => {
      expect(window.location.href).toBe("/field/screening/attempt-1/evidences");
    });
  });
});

function fieldSelfieScreen(counts = { perfumePhotos: 0, selfie: 0 }) {
  return {
    attemptId: "attempt-1",
    counts,
    selfieComplete: counts.selfie === 1,
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina"
    }
  };
}
