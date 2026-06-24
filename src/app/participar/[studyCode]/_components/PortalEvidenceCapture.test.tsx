import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmParticipantEvidenceUploadAction,
  requestParticipantEvidenceUploadAction
} from "@/modules/participant-portal/evidence-actions";
import { createBrowserSupabaseClient } from "@/shared/auth/supabase/browser";
import { PortalEvidenceCapture } from "./PortalEvidenceCapture";

vi.mock("@/modules/participant-portal/evidence-actions", () => ({
  confirmParticipantEvidenceUploadAction: vi.fn(),
  requestParticipantEvidenceUploadAction: vi.fn()
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

let videoSize = { height: 480, width: 640 };

function renderCapture(overrides: Partial<ComponentProps<typeof PortalEvidenceCapture>> = {}) {
  return render(
    <PortalEvidenceCapture
      buttonLabel="Abrir camara"
      captureFacingMode="user"
      currentCount={0}
      description="Descripcion"
      emptyState="Sin selfie"
      evidenceType="SELFIE_IDENTIFICATION"
      maxCount={1}
      minRequired={1}
      studyCode="FMASCULINA-NAVIGO-2026"
      title="Selfie"
      {...overrides}
    />
  );
}

beforeEach(() => {
  videoSize = { height: 480, width: 640 };
  vi.useRealTimers();
  vi.mocked(requestParticipantEvidenceUploadAction).mockReset();
  vi.mocked(confirmParticipantEvidenceUploadAction).mockReset();
  uploadToSignedUrl.mockReset();
  vi.mocked(requestParticipantEvidenceUploadAction).mockResolvedValue({
    data: {
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        sizeBytes: 100
      },
      privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie/key.jpg",
      storageBucket: "participant-evidence",
      token: "signed-token"
    },
    ok: true
  });
  vi.mocked(confirmParticipantEvidenceUploadAction).mockResolvedValue(confirmResultWithCounts(0));
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
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("PortalEvidenceCapture", () => {
  it("does not expose a participant file selector and shows only camera entry", () => {
    renderCapture();

    expect(screen.getByRole("button", { name: "Abrir camara" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Seleccionar archivo|respaldo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seleccionar archivo/i)).not.toBeInTheDocument();
  });

  it("uses facingMode user for selfie and environment for perfume", async () => {
    const firstRender = renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user" } })
    );
    firstRender.unmount();

    renderCapture({
      buttonLabel: "Tomar foto del perfume",
      captureFacingMode: "environment",
      emptyState: "Sin fotos",
      evidenceType: "PERFUME_PHOTO",
      maxCount: 5,
      title: "Perfumes"
    });
    fireEvent.click(screen.getByRole("button", { name: "Tomar foto del perfume" }));

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({ video: { facingMode: "environment" } })
    );
  });

  it("keeps Tomar foto disabled until video is ready", async () => {
    videoSize = { height: 0, width: 0 };
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));

    expect(await screen.findByRole("button", { name: "Preparando cámara..." })).toBeDisabled();
  });

  it("shows camera error when no frames arrive", async () => {
    vi.useFakeTimers();
    videoSize = { height: 0, width: 0 };
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Preparando cámara..." })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(4100);
    });

    expect(
      screen.getByText("No fue posible abrir la cámara. Permite el acceso a la cámara o intenta desde un celular.")
    ).toBeInTheDocument();
  });

  it("stops camera tracks when cancelling", async () => {
    const stop = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({
      getTracks: () => [{ stop }]
    } as unknown as MediaStream);
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar cámara" }));

    expect(stop).toHaveBeenCalled();
  });

  it("captures preview and uploads through Supabase signed upload token", async () => {
    renderCapture();

    await uploadPhoto("Abrir camara");

    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalled());
    expect(createBrowserSupabaseClient).toHaveBeenCalled();
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie/key.jpg",
      "signed-token",
      expect.any(File),
      expect.objectContaining({ upsert: false })
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await screen.findByText("Evidencia registrada correctamente.")).toBeInTheDocument();
  });

  it("shows upload and registration failures without clearing the preview", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("network") });
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar esta foto" }));

    expect(await screen.findByText("No fue posible subir la foto. Revisa tu conexión e intenta nuevamente.")).toBeInTheDocument();
    expect(screen.getByAltText("Vista previa de la foto capturada")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar esta foto" })).toBeEnabled());

    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: null });
    vi.mocked(confirmParticipantEvidenceUploadAction).mockResolvedValueOnce({ message: "fallo", ok: false });
    fireEvent.click(screen.getByRole("button", { name: "Usar esta foto" }));

    expect(
      await screen.findByText("La foto se subió, pero no fue posible registrarla. Contacta al administrador.")
    ).toBeInTheDocument();
  });

  it("updates perfume counter from server counts after consecutive uploads", async () => {
    vi.mocked(confirmParticipantEvidenceUploadAction)
      .mockResolvedValueOnce(confirmResultWithCounts(2))
      .mockResolvedValueOnce(confirmResultWithCounts(3));

    function ControlledCapture() {
      const [count, setCount] = useState(1);

      return (
        <PortalEvidenceCapture
          buttonLabel="Tomar foto del perfume"
          captureFacingMode="environment"
          currentCount={count}
          description="Descripcion"
          emptyState="Sin fotos"
          evidenceType="PERFUME_PHOTO"
          maxCount={5}
          minRequired={1}
          onCountChange={setCount}
          studyCode="FMASCULINA-NAVIGO-2026"
          title="Perfumes"
        />
      );
    }

    render(<ControlledCapture />);

    await uploadPhoto("Tomar foto del perfume");
    expect(await screen.findByText("Fotos registradas: 2/5. Mínimo requerido: 1.")).toBeInTheDocument();

    await uploadPhoto("Tomar foto del perfume");
    expect(await screen.findByText("Fotos registradas: 3/5. Mínimo requerido: 1.")).toBeInTheDocument();
  });

  it("blocks additional perfume photos when the configured maximum is reached", () => {
    renderCapture({
      buttonLabel: "Tomar foto del perfume",
      captureFacingMode: "environment",
      currentCount: 5,
      emptyState: "Sin fotos",
      evidenceType: "PERFUME_PHOTO",
      maxCount: 5,
      title: "Perfumes"
    });

    expect(screen.getByText("Ya registraste el máximo de 5 fotos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomar foto del perfume" })).toBeDisabled();
  });

  it("prevents double click from registering the same captured photo twice", async () => {
    let resolveConfirm: (value: Awaited<ReturnType<typeof confirmParticipantEvidenceUploadAction>>) => void =
      () => undefined;
    const confirmPromise = new Promise<Awaited<ReturnType<typeof confirmParticipantEvidenceUploadAction>>>((resolve) => {
      resolveConfirm = resolve;
    });
    vi.mocked(confirmParticipantEvidenceUploadAction).mockReturnValueOnce(confirmPromise);
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Abrir camara" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));
    const usePhotoButton = await screen.findByRole("button", { name: "Usar esta foto" });

    fireEvent.click(usePhotoButton);
    fireEvent.click(usePhotoButton);

    expect(usePhotoButton).toBeDisabled();
    await waitFor(() => expect(confirmParticipantEvidenceUploadAction).toHaveBeenCalledTimes(1));

    resolveConfirm!(confirmResultWithCounts(0));
    expect(await screen.findByText("Evidencia registrada correctamente.")).toBeInTheDocument();
  });
});

async function uploadPhoto(buttonName: string) {
  const openCameraButton = screen.queryByRole("button", { name: buttonName });

  if (openCameraButton) {
    fireEvent.click(openCameraButton);
  }

  fireEvent.click(await screen.findByRole("button", { name: "Tomar foto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar esta foto" }));
  await screen.findByText("Evidencia registrada correctamente.");
}

function confirmResultWithCounts(
  perfumePhotos: number
): Awaited<ReturnType<typeof confirmParticipantEvidenceUploadAction>> {
  return {
    data: {
      counts: {
        perfumePhotos,
        selfie: 1
      }
    },
    ok: true
  };
}
