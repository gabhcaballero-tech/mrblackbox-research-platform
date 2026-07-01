import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HutRegistrationForm } from "./HutRegistrationForm";

vi.mock("@/modules/hut/actions", () => ({
  completeHutRegistrationAction: vi.fn(),
  requestHutRegistrationSelfieUploadAction: vi.fn()
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

describe("HutRegistrationForm", () => {
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
    URL.createObjectURL = vi.fn(() => "blob:hut-registration-selfie");
    URL.revokeObjectURL = vi.fn();
  });

  it("uses camera capture as the primary registration selfie flow without file upload fallback", () => {
    render(<HutRegistrationForm requestOrigin="https://example.com" token="slot-token" />);

    expect(screen.getByRole("button", { name: "Tomar selfie de registro" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Subir archivo como respaldo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/seleccionar archivo/i)).not.toBeInTheDocument();
    expect(screen.getByText("Esta selfie se usara como referencia para verificar tu identidad durante el estudio.")).toBeInTheDocument();
  });

  it("opens the mobile camera and renders capture controls before saving the reference selfie", async () => {
    render(<HutRegistrationForm requestOrigin="https://example.com" token="slot-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie de registro" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: "user" }
      });
    });
    expect(await screen.findByRole("button", { name: "Tomar selfie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar camara" })).toBeInTheDocument();
  });

  it("shows the privacy HUD in the selfie preview while keeping capture on the original video canvas", async () => {
    render(<HutRegistrationForm requestOrigin="https://example.com" token="slot-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar selfie de registro" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar selfie" }));

    expect(await screen.findByAltText("Preview de selfie de registro")).toBeInTheDocument();
    expect(screen.getByTestId("hut-registration-selfie-preview-hud")).toBeInTheDocument();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled();
  });
});
