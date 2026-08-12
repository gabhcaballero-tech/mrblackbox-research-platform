import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HutPhotoSlotPage from "./page";
import { createHutRepository } from "@/modules/hut";

const getPortalViewMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  })
}));

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

  it("rechaza captura fotografica con token HUT invalido o inactivo", async () => {
    getPortalViewMock.mockResolvedValue({
      message: "Este enlace HUT no es valido.",
      ok: false
    });

    await expect(
      HutPhotoSlotPage({
        params: Promise.resolve({
          slot: "DELIVERY",
          token: "token-invalido"
        })
      })
    ).rejects.toThrow("not-found");
    expect(createHutRepository).toHaveBeenCalled();
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
        operationalIdentityMissing: false,
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

  it("no abre camara para un folio HUT reservado sin identidad operativa", async () => {
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
          reason: "RESERVED_WITHOUT_OPERATIONAL_IDENTITY"
        },
        block1: null,
        block2: null,
        folio: "HUT-143",
        message: "Folio reservado",
        name: "HUT-143",
        operationalIdentityMissing: true,
        origin: "HUT_DIRECTO",
        participantId: "participant-143",
        phaseGate: null,
        protocolVersion: "APPLICATION_PHOTO",
        rotation: {
          firstFragranceLeftArm: "247",
          secondFragranceRightArm: "583"
        },
        status: "NOT_STARTED",
        studyName: "Estudio HUT",
        testMode: false,
        token: "token-reserved"
      },
      ok: true
    });

    render(await HutPhotoSlotPage({
      params: Promise.resolve({
        slot: "DELIVERY",
        token: "token-reserved"
      })
    }));

    expect(screen.getByText("Folio reservado")).toBeInTheDocument();
    expect(screen.getByText("Actividad HUT aun no activada")).toBeInTheDocument();
    expect(screen.queryByText(/Formulario DELIVERY/)).not.toBeInTheDocument();
  });
});
