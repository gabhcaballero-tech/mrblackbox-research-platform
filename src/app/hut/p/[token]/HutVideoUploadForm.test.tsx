import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmHutDailySelfieUploadAction,
  confirmHutVideoUploadAction,
  requestHutDailySelfieUploadAction,
  requestHutVideoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { verifyNavigoFaceIdentity } from "@/modules/navigo-app/face-verification-client";
import { HutVideoUploadForm } from "./HutVideoUploadForm";

const refreshMock = vi.fn();
const uploadToSignedUrl = vi.fn();
const drawImageMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock
  })
}));

vi.mock("@/modules/hut/actions", () => ({
  confirmHutDailySelfieUploadAction: vi.fn(),
  confirmHutVideoUploadAction: vi.fn(),
  requestHutDailySelfieUploadAction: vi.fn(),
  requestHutVideoUploadAction: vi.fn()
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

vi.mock("@/modules/navigo-app/face-verification-client", () => ({
  verifyNavigoFaceIdentity: vi.fn()
}));

describe("HutVideoUploadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestHutDailySelfieUploadAction).mockResolvedValue({
      data: {
        metadata: {
          extension: "jpg",
          mimeType: "image/jpeg",
          originalFilename: "selfie.jpg",
          sizeBytes: 100
        },
        privateStorageKey: "hut/selfie.jpg",
        referenceSelfieSignedUrl: "https://storage.example/reference.jpg",
        storageBucket: "participant-evidence",
        token: "signed-token"
      },
      ok: true
    });
    vi.mocked(confirmHutDailySelfieUploadAction).mockResolvedValue({
      data: { status: "MATCHED" },
      ok: true
    });
    vi.mocked(requestHutVideoUploadAction).mockResolvedValue({
      data: {
        metadata: {
          extension: "mp4",
          mimeType: "video/mp4",
          originalFilename: "video.mp4",
          sizeBytes: 1200
        },
        privateStorageKey: "hut/video.mp4",
        storageBucket: "participant-evidence",
        token: "video-token"
      },
      ok: true
    });
    vi.mocked(confirmHutVideoUploadAction).mockResolvedValue({
      data: { blockNumber: 1, sequenceNumber: 1 },
      ok: true
    });
    vi.mocked(verifyNavigoFaceIdentity).mockResolvedValue({
      evaluatedAt: "2026-07-01T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      score: 0.82,
      status: "MATCH"
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
    URL.createObjectURL = vi.fn(() => "blob:hut-daily-selfie");
    URL.revokeObjectURL = vi.fn();
  });

  it("removes file upload for daily HUT selfies and keeps video upload intact", () => {
    const { rerender } = render(
      <HutVideoUploadForm blockNumber={1} mode="selfie" sequenceNumber={1} token="hut-token" />
    );

    expect(screen.queryByLabelText("Selfie diaria")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomar selfie" })).toBeInTheDocument();

    rerender(<HutVideoUploadForm blockNumber={1} mode="video" sequenceNumber={1} token="hut-token" />);

    expect(screen.getAllByText("Tomar video")).toHaveLength(2);
    expect(document.querySelector('input[type="file"][accept="video/*"]')).toBeInTheDocument();
  });

  it("allows taking a daily selfie with the camera and shows the privacy HUD in preview", async () => {
    render(<HutVideoUploadForm blockNumber={1} mode="selfie" sequenceNumber={1} token="hut-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: "user" }
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));

    expect(await screen.findByAltText("Vista previa de selfie diaria")).toBeInTheDocument();
    expect(screen.getByTestId("hut-daily-selfie-preview-hud")).toBeInTheDocument();
    expect(drawImageMock).toHaveBeenCalled();
  });

  it("uploads the daily selfie through the original captured file and refreshes the HUT portal", async () => {
    render(<HutVideoUploadForm blockNumber={1} mode="selfie" sequenceNumber={1} token="hut-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar esta selfie" }));

    await waitFor(() => {
      expect(requestHutDailySelfieUploadAction).toHaveBeenCalled();
      expect(createBrowserSupabaseClient).toHaveBeenCalled();
      expect(uploadToSignedUrl).toHaveBeenCalled();
      expect(confirmHutDailySelfieUploadAction).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
