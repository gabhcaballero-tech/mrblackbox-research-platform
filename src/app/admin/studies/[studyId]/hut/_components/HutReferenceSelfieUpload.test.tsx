import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmHutReferenceSelfieUploadAction,
  requestHutReferenceSelfieUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { HutReferenceSelfieUpload } from "./HutReferenceSelfieUpload";

const uploadToSignedUrl = vi.fn();
const drawImageMock = vi.fn();

vi.mock("@/modules/hut/actions", () => ({
  confirmHutReferenceSelfieUploadAction: vi.fn(),
  requestHutReferenceSelfieUploadAction: vi.fn()
}));

vi.mock("@/shared/auth/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl
      }))
    }
  }))
}));

describe("HutReferenceSelfieUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestHutReferenceSelfieUploadAction).mockResolvedValue({
      data: {
        metadata: {
          extension: "jpg",
          mimeType: "image/jpeg",
          originalFilename: "selfie.jpg",
          sizeBytes: 100
        },
        privateStorageKey: "hut/reference-selfie.jpg",
        storageBucket: "participant-evidence",
        token: "signed-token"
      },
      ok: true
    });
    vi.mocked(confirmHutReferenceSelfieUploadAction).mockResolvedValue({
      data: { participantId: "participant-1" },
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
      drawImage: drawImageMock
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["photo"], { type: "image/jpeg" }));
    });
    URL.createObjectURL = vi.fn(() => "blob:hut-admin-selfie");
    URL.revokeObjectURL = vi.fn();
  });

  it("uses camera capture for the admin reference selfie without file upload", () => {
    render(<HutReferenceSelfieUpload disabled={false} participantId="participant-1" studyId="study-hut" />);

    expect(screen.getByRole("button", { name: "Tomar selfie de registro" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/seleccionar archivo/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it("shows the privacy HUD in camera and preview, while capturing from the original video", async () => {
    render(<HutReferenceSelfieUpload disabled={false} participantId="participant-1" studyId="study-hut" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie de registro" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: "user" }
      });
    });
    expect(screen.getByTestId("hut-admin-selfie-camera-hud")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));

    expect(await screen.findByAltText("Preview de selfie de registro")).toBeInTheDocument();
    expect(screen.getByTestId("hut-admin-selfie-preview-hud")).toBeInTheDocument();
    expect(drawImageMock).toHaveBeenCalled();
  });

  it("uploads the captured reference selfie after camera confirmation", async () => {
    render(<HutReferenceSelfieUpload disabled={false} participantId="participant-1" studyId="study-hut" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie de registro" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar selfie de registro" }));

    await waitFor(() => {
      expect(requestHutReferenceSelfieUploadAction).toHaveBeenCalled();
      expect(createBrowserSupabaseClient).toHaveBeenCalled();
      expect(uploadToSignedUrl).toHaveBeenCalledWith(
        "hut/reference-selfie.jpg",
        "signed-token",
        expect.any(File),
        expect.objectContaining({ contentType: "image/jpeg" })
      );
      expect(confirmHutReferenceSelfieUploadAction).toHaveBeenCalled();
    });
  });
});
