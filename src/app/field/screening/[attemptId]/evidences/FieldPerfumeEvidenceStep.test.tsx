import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldPerfumeEvidenceStep } from "./FieldPerfumeEvidenceStep";
import {
  completeFieldEvidenceSubmissionAction,
  confirmFieldEvidenceUploadAction,
  requestFieldEvidenceUploadAction
} from "@/modules/field/evidence-actions";

vi.mock("@/modules/field/evidence-actions", () => ({
  completeFieldEvidenceSubmissionAction: vi.fn(),
  confirmFieldEvidenceUploadAction: vi.fn(),
  requestFieldEvidenceUploadAction: vi.fn()
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

describe("FieldPerfumeEvidenceStep", () => {
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
    URL.createObjectURL = vi.fn(() => "blob:field-perfume-photo");
    URL.revokeObjectURL = vi.fn();
    uploadToSignedUrl.mockResolvedValue({ error: null });
    vi.mocked(requestFieldEvidenceUploadAction).mockResolvedValue({
      data: {
        privateStorageKey: "private/perfume.jpg",
        storageBucket: "participant-evidence",
        token: "signed-token"
      },
      ok: true
    });
    vi.mocked(confirmFieldEvidenceUploadAction).mockResolvedValue({
      data: {
        counts: { perfumePhotos: 1, selfie: 1 },
        perfumePhotoCount: 1,
        selfieCount: 1
      },
      ok: true
    });
    vi.mocked(completeFieldEvidenceSubmissionAction).mockResolvedValue({
      data: {
        redirectTo: "/field/screening/attempt-1/result"
      },
      ok: true
    });
  });

  it("requires at least one perfume photo before review", () => {
    render(<FieldPerfumeEvidenceStep screen={fieldEvidenceScreen()} />);

    expect(screen.getByText("0 de 5 fotos agregadas. Mínimo requerido: 1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar perfil a revisión" })).toBeDisabled();
    expect(screen.getByText("Debes registrar al menos 1 foto de perfume antes de enviar tu perfil a revisión.")).toBeInTheDocument();
  });

  it("blocks new perfume photos when the maximum is reached", () => {
    render(<FieldPerfumeEvidenceStep screen={fieldEvidenceScreen({ perfumePhotos: 5, selfie: 1 })} />);

    expect(screen.getByRole("button", { name: "Tomar foto del perfume" })).toBeDisabled();
    expect(screen.getByText("Ya registraste el máximo de 5 fotos.")).toBeInTheDocument();
  });

  it("uploads a perfume photo through the public field evidence actions", async () => {
    render(<FieldPerfumeEvidenceStep screen={fieldEvidenceScreen()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tomar foto del perfume" }));
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          facingMode: "environment"
        }
      });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar esta foto" }));

    await waitFor(() => {
      expect(requestFieldEvidenceUploadAction).toHaveBeenCalledWith(
        "attempt-1",
        expect.objectContaining({
          evidenceType: "PERFUME_PHOTO"
        })
      );
    });
    expect(confirmFieldEvidenceUploadAction).toHaveBeenCalledWith(
      "attempt-1",
      expect.objectContaining({
        evidenceType: "PERFUME_PHOTO",
        privateStorageKey: "private/perfume.jpg",
        storageBucket: "participant-evidence"
      })
    );
  });
});

function fieldEvidenceScreen(counts = { perfumePhotos: 0, selfie: 1 }) {
  return {
    attemptId: "attempt-1",
    canFinalizeReview: counts.perfumePhotos >= 1,
    config: {
      maxImageBytes: 8388608,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1
    },
    counts,
    evidenceComplete: counts.perfumePhotos >= 1,
    status: "PASSED" as const,
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina"
    }
  };
}
