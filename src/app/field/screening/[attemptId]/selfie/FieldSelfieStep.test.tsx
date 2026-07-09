import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldSelfieStep } from "./FieldSelfieStep";

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
});

function fieldSelfieScreen() {
  return {
    attemptId: "attempt-1",
    counts: {
      perfumePhotos: 0,
      selfie: 0
    },
    selfieComplete: false,
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina"
    }
  };
}
