import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HutParticipantPage from "./page";
import { createHutRepository } from "@/modules/hut";

const getPortalViewMock = vi.fn();
const getQuestionnaireStateByTokenMock = vi.fn();
const getApplicationPhotoDailyAvailabilityByTokenMock = vi.fn();

vi.mock("@/modules/hut", async () => {
  const actual = await vi.importActual<typeof import("@/modules/hut")>("@/modules/hut");
  return {
    ...actual,
    createHutRepository: vi.fn(() => ({
      getApplicationPhotoDailyAvailabilityByToken: getApplicationPhotoDailyAvailabilityByTokenMock,
      getPortalView: getPortalViewMock,
      getQuestionnaireStateByToken: getQuestionnaireStateByTokenMock
    }))
  };
});

vi.mock("./HutVideoUploadForm", () => ({
  HutVideoUploadForm: () => <div>Formulario HUT</div>
}));

describe("HutParticipantPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState(),
      ok: true
    });
    getApplicationPhotoDailyAvailabilityByTokenMock.mockResolvedValue({
      data: createPhotoAvailability(),
      ok: true
    });
  });

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
    expect(screen.getAllByText("Entrega del producto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Validar codigo" })).toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
  });

  it("muestra foto de aplicacion en protocolo nuevo sin selfie ni video legacy", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        applicationEvidence: [],
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
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
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState({
        answers: {
          HUT_DG_FOLIO: "NAV-001",
          HUT_DG_NOMBRE: "PARTICIPANTE HUT",
          HUT_F1_GENERO: "HOMBRE",
          HUT_F2_EDAD: "35",
          HUT_F3_USO_PERFUME: "MARCA A",
          HUT_PARTICIPO_CLT: "NO",
          HUT_V1_CONFIRMACION_ENTREGA: "SI"
        }
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByRole("link", { name: "Capturar foto" })).toHaveAttribute("href", "/hut/p/token-1/photo/DELIVERY");
    expect(screen.getAllByText("Seguimiento fotografico").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Entrega del producto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Producto 1 - Dia 1 (Colocacion)")).toBeInTheDocument();
    expect(screen.getByText("Producto 1 - Dia 3 manana")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 3 manana")).toBeInTheDocument();
    expect(screen.queryByText(/Evaluacion 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluacion 2/)).not.toBeInTheDocument();
    expect(screen.queryByText("Codigo requerido")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar codigo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cuestionario HUT v5")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar y continuar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
    expect(screen.queryByText(/selfie/i)).not.toBeInTheDocument();
    expect(getQuestionnaireStateByTokenMock).not.toHaveBeenCalled();
  });

  it("muestra nombre real, folio y rotacion HUT en protocolo nuevo", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        applicationEvidence: [],
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        block1: null,
        block2: null,
        folio: "HUT-111",
        name: "Martin Valerio Gonzalez",
        protocolVersion: "APPLICATION_PHOTO",
        rotation: {
          firstFragranceLeftArm: "247",
          secondFragranceRightArm: "583"
        },
        status: "NOT_STARTED"
      }),
      ok: true
    });
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState({
        answers: {
          HUT_DG_FOLIO: "HUT-111",
          HUT_DG_NOMBRE: "Martin Valerio Gonzalez",
          HUT_PARTICIPO_CLT: "SI"
        }
      }),
      ok: true
    });
    getApplicationPhotoDailyAvailabilityByTokenMock.mockResolvedValue({
      data: createPhotoAvailability({ available: true }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByRole("heading", { name: "Martin Valerio Gonzalez" })).toBeInTheDocument();
    expect(screen.getByText("HUT-111")).toBeInTheDocument();
    expect(screen.getByText("EVA1")).toBeInTheDocument();
    expect(screen.getAllByText("247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("EVA2")).toBeInTheDocument();
    expect(screen.getAllByText("583").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("heading", { name: "HUT-111" })).not.toBeInTheDocument();
  });

  it("no muestra cuestionario HUT_DIRECTO en el portal participante", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        protocolVersion: "APPLICATION_PHOTO",
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState({
        answers: {
          HUT_DG_FOLIO: "NAV-001",
          HUT_DG_NOMBRE: "PARTICIPANTE HUT",
          HUT_PARTICIPO_CLT: "NO"
        }
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByRole("link", { name: "Capturar foto" })).toHaveAttribute("href", "/hut/p/token-1/photo/DELIVERY");
    expect(screen.queryByText("Genero")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar y continuar" })).not.toBeInTheDocument();
  });

  it("no muestra filtros ni visita HUT en el portal participante CLT_HUT", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        origin: "CLT_HUT",
        protocolVersion: "APPLICATION_PHOTO",
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState({
        answers: {
          HUT_DG_FOLIO: "NAV-001",
          HUT_DG_NOMBRE: "PARTICIPANTE HUT",
          HUT_PARTICIPO_CLT: "SI"
        },
        applicableQuestionCodes: [
          "HUT_DG_NOMBRE",
          "HUT_DG_FOLIO",
          "HUT_DG_FECHA",
          "HUT_PARTICIPO_CLT",
          "HUT_V1_CONFIRMACION_ENTREGA",
          "HUT_V1_OBSERVACIONES"
        ],
        omittedQuestionCodes: ["HUT_F1_GENERO", "HUT_F2_EDAD", "HUT_F3_USO_PERFUME"],
        participantOrigin: "CLT_HUT"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByRole("link", { name: "Capturar foto" })).toHaveAttribute("href", "/hut/p/token-1/photo/DELIVERY");
    expect(screen.queryByText("Confirmar entrega del primer perfume")).not.toBeInTheDocument();
    expect(screen.queryByText("Genero")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar y continuar" })).not.toBeInTheDocument();
  });

  it("muestra evidencia COLOCACION historica como Producto 1 Dia 1", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        applicationEvidence: [
          {
            capturedAt: new Date("2026-08-07T15:30:00.000Z"),
            phase: "COLOCACION",
            productCode: "247"
          }
        ],
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        protocolVersion: "APPLICATION_PHOTO",
        status: "BLOCK_1_CALL_PENDING"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText("En seguimiento")).toBeInTheDocument();
    expect(screen.getAllByText("Entrega del producto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Foto registrada").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Producto: 247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Producto 1 - Dia 1 (Colocacion)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "Capturar foto" })).toHaveAttribute("href", "/hut/p/token-1/photo/DELIVERY");
    expect(screen.queryByText("Llamada pendiente")).not.toBeInTheDocument();
    expect(screen.queryByText("BLOCK_1_CALL_PENDING")).not.toBeInTheDocument();
    expect(screen.queryByText("Codigo requerido")).not.toBeInTheDocument();
  });

  it("muestra todos los slots fotograficos aunque no tengan evidencia", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        applicationEvidence: [],
        availableApplicationPhoto: null,
        availability: {
          nextAvailableAt: new Date("2026-08-09T11:00:00.000Z"),
          reason: "BLOCK_NOT_ACTIVE"
        },
        protocolVersion: "APPLICATION_PHOTO",
        status: "NOT_STARTED"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByText("Entrega del producto")).toBeInTheDocument();
    expect(screen.getByText("Producto 1 - Dia 1 (Colocacion)")).toBeInTheDocument();
    expect(screen.getByText("Producto 1 - Dia 2")).toBeInTheDocument();
    expect(screen.getByText("Producto 1 - Dia 3 manana")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 2")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 3 manana")).toBeInTheDocument();
    expect(screen.queryByText(/Evaluacion 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluacion 2/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Tu proxima actividad estara disponible/)).toBeInTheDocument();
  });

  it("bloquea foto diaria cuando ya existe captura del dia", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: null,
          slotId: "DELIVERY"
        },
        availability: {
          nextAvailableAt: null,
          reason: "AVAILABLE_FOR_APPLICATION_PHOTO"
        },
        protocolVersion: "APPLICATION_PHOTO",
        status: "BLOCK_1_IN_PROGRESS"
      }),
      ok: true
    });
    getQuestionnaireStateByTokenMock.mockResolvedValue({
      data: createQuestionnaireState({
        answers: {
          HUT_DG_FOLIO: "NAV-001",
          HUT_DG_NOMBRE: "PARTICIPANTE HUT",
          HUT_F1_GENERO: "HOMBRE",
          HUT_F2_EDAD: "35",
          HUT_F3_USO_PERFUME: "MARCA A",
          HUT_PARTICIPO_CLT: "NO",
          HUT_V1_CONFIRMACION_ENTREGA: "SI"
        }
      }),
      ok: true
    });
    getApplicationPhotoDailyAvailabilityByTokenMock.mockResolvedValue({
      data: createPhotoAvailability({
        available: false,
        nextAvailableLocalDate: "2026-08-08",
        reason: "PHOTO_ALREADY_CAPTURED_TODAY"
      }),
      ok: true
    });

    render(await HutParticipantPage({ params: Promise.resolve({ token: "token-1" }) }));

    expect(screen.getByRole("link", { name: "Capturar foto" })).toHaveAttribute("href", "/hut/p/token-1/photo/DELIVERY");
    expect(screen.queryByText(/Formulario de foto/)).not.toBeInTheDocument();
  });
});

function createPortalView(overrides: Partial<PortalViewForTest> = {}): PortalViewForTest {
  return {
    availableUpload: null,
    applicationEvidence: [],
    applicationPhotoEntries: [],
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
    folio: "HUT-001",
    name: "Participante HUT",
    origin: "HUT_DIRECTO",
    phaseGate: null,
    participantId: "participant-1",
    protocolVersion: "LEGACY_VIDEO",
    rotation: {
      firstFragranceLeftArm: "247",
      secondFragranceRightArm: "583"
    },
    status: "COMPLETED",
    studyName: "Estudio HUT",
    testMode: false,
    token: "token-1",
    ...overrides
  };
}

type PortalViewForTest = {
  applicationEvidence: Array<{ capturedAt: Date; phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2"; productCode: string | null }>;
  applicationPhotoEntries: Array<{ capturedAt: Date; capturedLocalDate: string; productCode: string | null; useDayNumber: number }>;
  availableApplicationPhoto: { phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2"; productCode: string | null; slotId: "DELIVERY" | "PRODUCT_1_DAY_1" | "PRODUCT_1_DAY_2" | "PRODUCT_1_DAY_3_MORNING" | "PRODUCT_2_DAY_1" | "PRODUCT_2_DAY_2" | "PRODUCT_2_DAY_3_MORNING" } | null;
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
  folio: string | null;
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
  rotation: {
    firstFragranceLeftArm: string | null;
    secondFragranceRightArm: string | null;
  };
  status: string;
  studyName: string;
  testMode: boolean;
  token: string;
};

function createQuestionnaireState(overrides: Partial<QuestionnaireStateForTest> = {}): QuestionnaireStateForTest {
  return {
    answers: {},
    applicableQuestionCodes: [
      "HUT_DG_NOMBRE",
      "HUT_DG_FOLIO",
      "HUT_DG_FECHA",
      "HUT_PARTICIPO_CLT",
      "HUT_F1_GENERO",
      "HUT_F2_EDAD",
      "HUT_F3_USO_PERFUME",
      "HUT_V1_CONFIRMACION_ENTREGA",
      "HUT_V1_OBSERVACIONES"
    ],
    attempt: {
      completedAt: null,
      id: "hut-attempt-1",
      participantId: "participant-1",
      startedAt: new Date("2026-08-07T15:00:00.000Z"),
      status: "IN_PROGRESS",
      terminatedAt: null,
      terminationReason: null
    },
    omittedQuestionCodes: [],
    participantOrigin: "HUT_DIRECTO",
    visits: [],
    ...overrides
  };
}

function createPhotoAvailability(
  overrides: Partial<PhotoAvailabilityForTest> = {}
): PhotoAvailabilityForTest {
  return {
    available: true,
    capturedLocalDate: "2026-08-07",
    existingEntry: null,
    nextAvailableLocalDate: null,
    reason: "AVAILABLE",
    ...overrides
  };
}

type QuestionnaireStateForTest = {
  answers: Record<string, unknown>;
  applicableQuestionCodes: string[];
  attempt: {
    completedAt: Date | null;
    id: string;
    participantId: string;
    startedAt: Date | null;
    status: string;
    terminatedAt: Date | null;
    terminationReason: string | null;
  };
  omittedQuestionCodes: string[];
  participantOrigin: "CLT_HUT" | "HUT_DIRECTO";
  visits: [];
};

type PhotoAvailabilityForTest = {
  available: boolean;
  capturedLocalDate: string;
  existingEntry: null;
  nextAvailableLocalDate: string | null;
  reason: "AVAILABLE" | "LEGACY_PROTOCOL" | "PHOTO_ALREADY_CAPTURED_TODAY";
};
