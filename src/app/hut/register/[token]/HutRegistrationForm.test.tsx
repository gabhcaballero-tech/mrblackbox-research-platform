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
  });

  it("uses camera capture as the primary registration selfie flow and keeps file upload as fallback", () => {
    render(<HutRegistrationForm requestOrigin="https://example.com" token="slot-token" />);

    expect(screen.getByRole("button", { name: "Tomar selfie de registro" })).toBeInTheDocument();
    expect(screen.getByLabelText("Subir archivo como respaldo")).toBeInTheDocument();
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
});
