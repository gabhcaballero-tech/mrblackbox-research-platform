import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmHutApplicationPhotoUploadAction,
  requestHutApplicationPhotoUploadAction
} from "@/modules/hut/actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { HutApplicationPhotoUploadForm } from "./HutApplicationPhotoUploadForm";

const refreshMock = vi.fn();
const uploadToSignedUrl = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock
  })
}));

vi.mock("@/modules/hut/actions", () => ({
  confirmHutApplicationPhotoUploadAction: vi.fn(),
  requestHutApplicationPhotoUploadAction: vi.fn()
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

describe("HutApplicationPhotoUploadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestHutApplicationPhotoUploadAction).mockResolvedValue({
      data: {
        metadata: {
          extension: "jpg",
          mimeType: "image/jpeg",
          originalFilename: "aplicacion.jpg",
          sizeBytes: 100
        },
        phase: "COLOCACION",
        privateStorageKey: "studies/study-hut/hut-participants/participant-1/application-photos/COLOCACION/photo.jpg",
        productCode: "247",
        storageBucket: "participant-evidence",
        token: "signed-token"
      },
      ok: true
    });
    vi.mocked(confirmHutApplicationPhotoUploadAction).mockResolvedValue({
      data: { phase: "COLOCACION" },
      ok: true
    });
    uploadToSignedUrl.mockResolvedValue({ data: null, error: null });
  });

  it("uploads application evidence without selfie, video or biometric verification", async () => {
    render(<HutApplicationPhotoUploadForm phase="COLOCACION" productCode="247" token="hut-token" />);

    const file = new File(["photo"], "aplicacion.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Fotografia"), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar foto de aplicacion" }));

    await waitFor(() => {
      expect(requestHutApplicationPhotoUploadAction).toHaveBeenCalledWith("hut-token", {
        mimeType: "image/jpeg",
        originalFilename: "aplicacion.jpg",
        sizeBytes: file.size
      });
      expect(createBrowserSupabaseClient).toHaveBeenCalled();
      expect(uploadToSignedUrl).toHaveBeenCalled();
      expect(confirmHutApplicationPhotoUploadAction).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(screen.getByText(/No se requiere selfie ni video/)).toBeInTheDocument();
  });
});
