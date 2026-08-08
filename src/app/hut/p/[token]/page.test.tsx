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

vi.mock("./HutApplicationPhotoUploadForm", () => ({
  HutApplicationPhotoUploadForm: ({ phase, productCode }: { phase: string; productCode: string | null }) => (
    <div>{`Foto de aplicacion ${phase} ${productCode ?? ""}`}</div>
  )
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

    expect(screen.getByText("Foto de aplicacion COLOCACION 247")).toBeInTheDocument();
    expect(screen.queryByText("Codigo requerido")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar codigo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Formulario HUT")).not.toBeInTheDocument();
    expect(screen.queryByText(/selfie/i)).not.toBeInTheDocument();
  });

  it("muestra pregunta pendiente de HUT_DIRECTO antes de la foto", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: "247"
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

    expect(screen.getByText("Genero")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y continuar" })).toBeInTheDocument();
    expect(screen.queryByText(/Foto de aplicacion COLOCACION/)).not.toBeInTheDocument();
  });

  it("omite filtros repetidos para CLT_HUT y continua con primera visita", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: "247"
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

    expect(screen.getByText("Confirmar entrega del primer perfume")).toBeInTheDocument();
    expect(screen.queryByText("Genero")).not.toBeInTheDocument();
  });

  it("bloquea foto diaria cuando ya existe captura del dia", async () => {
    getPortalViewMock.mockResolvedValue({
      data: createPortalView({
        availableApplicationPhoto: {
          phase: "COLOCACION",
          productCode: "247"
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

    expect(screen.getByText("Foto diaria ya registrada")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-08/)).toBeInTheDocument();
    expect(screen.queryByText(/Foto de aplicacion COLOCACION/)).not.toBeInTheDocument();
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
