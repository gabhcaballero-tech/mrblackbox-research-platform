import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HutPhotoSlotPage from "./page";
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

vi.mock("../../HutApplicationPhotoUploadForm", () => ({
  HutApplicationPhotoUploadForm: ({ slotId, title }: { slotId: string; title: string }) => (
    <div>{`Formulario ${slotId} ${title}`}</div>
  )
}));

describe("HutPhotoSlotPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra captura individual para el slot fotografico disponible", async () => {
    getPortalViewMock.mockResolvedValue({
      data: {
        applicationEvidence: [],
        applicationPhotoEntries: [],
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availableUpload: null,
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        block1: null,
        block2: null,
        folio: "HUT-121",
        message: "Seguimiento fotografico",
        name: "Participante HUT",
        origin: "CLT_HUT",
        participantId: "participant-1",
        phaseGate: null,
        protocolVersion: "APPLICATION_PHOTO",
        rotation: {
          firstFragranceLeftArm: "247",
          secondFragranceRightArm: "583"
        },
        status: "BLOCK_1_IN_PROGRESS",
        studyName: "Estudio HUT",
        testMode: false,
        token: "token-1"
      },
      ok: true
    });

    render(await HutPhotoSlotPage({
      params: Promise.resolve({
        slot: "DELIVERY",
        token: "token-1"
      })
    }));

    expect(createHutRepository).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Entrega del producto" })).toBeInTheDocument();
    expect(screen.getByText("Formulario DELIVERY Entrega del producto")).toBeInTheDocument();
  });
});
