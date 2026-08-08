import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HutParticipantPage from "./page";
import { createHutRepository } from "@/modules/hut";

const getPortalViewMock = vi.fn();

vi.mock("@/modules/hut", async () => {
  const actual = await vi.importActual<typeof import("@/modules/hut")>("@/modules/hut");
  return {
    ...actual,
    createHutRepository: vi.fn(() => ({
      getPortalView: getPortalViewMock
    }))
  };
});

vi.mock("./HutVideoUploadForm", () => ({
  HutVideoUploadForm: () => <div>Formulario HUT</div>
}));

vi.mock("./HutApplicationPhotoUploadForm", () => ({
  HutApplicationPhotoUploadForm: ({ phase, productCode }: { phase: string; productCode: string | null }) => (
    <div>{`Foto de aplicacion ${phase} ${productCode ?? ""}`}</div>
  )
}));

describe("HutParticipantPage", () => {
  it("muestra mensaje final cuando la participacion HUT esta completa", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        status: "COMPLETED"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText(/Gracias por tu participaci/)).toBeInTheDocument();
    expect(screen.getByText(/Toma captura/)).toBeInTheDocument();
    expect(screen.queryByText("Actividad no disponible")).not.toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
    expect(createHutRepository).toHaveBeenCalled();
  });

  it("mantiene el mensaje de disponibilidad para video bloqueado por dia", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availability: {
          blockNumber: 1,
          expectedVideoSequence: 2,
          nextAvailableAt: new Date("2026-07-10T11:00:00.000Z"),
          reason: "WAIT_UNTIL_NEXT_DAY"
        },
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText("Actividad no disponible")).toBeInTheDocument();
    expect(screen.getByText(/El siguiente video/)).toBeInTheDocument();
  });

  it("muestra captura de codigo de fase antes de permitir actividad HUT", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availability: {
          blockNumber: 1,
          expectedVideoSequence: 1,
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_SELFIE"
        },
        phaseGate: {
          label: "Colocacion",
          phase: "COLOCACION",
          required: true,
          status: "GENERATED"
        },
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText("Codigo requerido")).toBeInTheDocument();
    expect(screen.getByText("Colocacion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar codigo" })).toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
  });

  it("muestra foto de aplicacion en protocolo nuevo sin selfie ni video legacy", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        applicationEvidence: [],
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: "247"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        block1: null,
        block2: null,
        message: "Registra la foto de aplicacion.",
        origin: "CLT_HUT",
        protocolVersion: "APPLICATION_PHOTO",
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText("Foto de aplicacion COLOCACION 247")).toBeInTheDocument();
    expect(screen.queryByText("Codigo requerido")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar codigo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
    expect(screen.queryByText(/selfie/i)).not.toBeInTheDocument();
  });
});

function createPortalView(overrides: Partial<PortalViewForTest> = {}): PortalViewForTest {
  return {
    availableUpload: null,
    applicationEvidence: [],
    availability: {
      nextAvailableAt: null,
      reason: "BLOCK_NOT_ACTIVE"
    },
    availableApplicationPhoto: null,
    block1: {
      blockNumber: 1,
      disqualificationReason: null,
      missedDaysCount: 0,
      status: "COMPLETED",
      submittedVideosCount: 3,
      videos: []
    },
    block2: {
      blockNumber: 2,
      disqualificationReason: null,
      missedDaysCount: 0,
      status: "COMPLETED",
      submittedVideosCount: 3,
      videos: []
    },
    message: "Tu participacion HUT esta completa. Gracias por tu tiempo.",
    name: "Participante HUT",
    origin: "HUT_DIRECTO",
    phaseGate: null,
    participantId: "participant-1",
    protocolVersion: "LEGACY_VIDEO",
    status: "COMPLETED",
    studyName: "Estudio HUT",
    testMode: false,
    token: "token-1",
    ...overrides
  };
}

type PortalViewForTest = {
  applicationEvidence: Array<{ capturedAt: Date; phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2"; productCode: string | null }>;
  availableApplicationPhoto: { phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2"; productCode: string | null } | null;
  availableUpload: { blockNumber: number; sequenceNumber: number } | null;
  availability: {
    blockNumber?: number;
    expectedVideoSequence?: number;
    nextAvailableAt: Date | null;
    reason: string;
  };
  block1: {
    blockNumber: number;
    disqualificationReason: string | null;
    missedDaysCount: number;
    status: string;
    submittedVideosCount: number;
    videos: [];
  } | null;
  block2: {
    blockNumber: number;
    disqualificationReason: string | null;
    missedDaysCount: number;
    status: string;
    submittedVideosCount: number;
    videos: [];
  } | null;
  message: string;
  name: string;
  origin: "CLT_HUT" | "HUT_DIRECTO";
  phaseGate: {
    label: string;
    phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2";
    required: boolean;
    status: string;
  } | null;
  participantId: string;
  protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  status: string;
  studyName: string;
  testMode: boolean;
  token: string;
};
