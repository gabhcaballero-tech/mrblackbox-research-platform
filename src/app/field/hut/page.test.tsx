import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldHutPage from "./page";
import { createHutRepository } from "@/modules/hut";
import { createFieldOperationsRepository } from "@/modules/field-operations";
import { requireCapability } from "@/shared/auth/session";

const getFieldQuestionnaireWorkspaceMock = vi.fn();
const getDashboardMock = vi.fn();

vi.mock("@/shared/auth/session", () => ({
  requireCapability: vi.fn()
}));

vi.mock("@/modules/hut", async () => {
  const actual = await vi.importActual<typeof import("@/modules/hut")>("@/modules/hut");
  return {
    ...actual,
    createHutRepository: vi.fn(() => ({
      getFieldQuestionnaireWorkspace: getFieldQuestionnaireWorkspaceMock
    }))
  };
});

vi.mock("@/modules/field-operations", () => ({
  createFieldOperationsRepository: vi.fn(() => ({
    getDashboard: getDashboardMock
  }))
}));

describe("FieldHutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCapability).mockResolvedValue({ id: "admin-user-1", name: "Admin", role: "ADMIN" } as never);
    getDashboardMock.mockResolvedValue(createFieldDashboard());
  });

  it("muestra selector de tipo de acceso sin redirigir a login", async () => {
    getDashboardMock.mockResolvedValue(createCodeRequiredDashboard());

    render(await FieldHutPage({ searchParams: Promise.resolve({}) }));

    expect(requireCapability).not.toHaveBeenCalled();
    expect(createFieldOperationsRepository).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Selecciona tipo de acceso" })).toBeInTheDocument();
    expect(screen.getByLabelText("Encuestador")).toBeInTheDocument();
    expect(screen.getByLabelText("Supervisor")).toBeInTheDocument();
    expect(screen.getByLabelText("Codigo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(getFieldQuestionnaireWorkspaceMock).not.toHaveBeenCalled();
  });

  it("bloquea codigo de encuestador invalido", async () => {
    getDashboardMock.mockResolvedValue(createCodeRequiredDashboard("El codigo de encuestador no es valido."));

    render(await FieldHutPage({ searchParams: Promise.resolve({ interviewerCode: "MAL26" }) }));

    expect(requireCapability).not.toHaveBeenCalled();
    expect(screen.getByText("El codigo de encuestador no es valido.")).toBeInTheDocument();
    expect(getFieldQuestionnaireWorkspaceMock).not.toHaveBeenCalled();
  });

  it("permite a supervisor ver todos los participantes HUT", async () => {
    getDashboardMock.mockResolvedValue(createSupervisorDashboard());

    render(await FieldHutPage({ searchParams: Promise.resolve({ accessType: "SUPERVISOR", interviewerCode: "SUP26" }) }));

    expect(screen.getByText("Supervisor: Supervisor Campo")).toBeInTheDocument();
    expect(screen.getByText("Modo: Supervisor")).toBeInTheDocument();
    expect(screen.getByText("Participante HUT 121")).toBeInTheDocument();
    expect(screen.getByText("Participante HUT 999")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Participante HUT 999/ })).toHaveAttribute(
      "href",
      "/field/hut?folio=HUT-999&interviewerCode=SUP26&accessType=SUPERVISOR"
    );
  });

  it("protege el modo administrador con login interno", async () => {
    getDashboardMock.mockResolvedValue(createAdminDashboard());

    render(await FieldHutPage({ searchParams: Promise.resolve({ mode: "admin" }) }));

    expect(requireCapability).toHaveBeenCalledWith("admin:access");
    expect(getDashboardMock).toHaveBeenCalledWith(expect.objectContaining({
      actorRole: "ADMIN",
      mode: "ADMIN"
    }));
    expect(screen.getByText("Modo administrador HUT")).toBeInTheDocument();
  });

  it("valida codigo de encuestador y permite continuar un cuestionario HUT existente", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createWorkspace(),
      ok: true
    });

    render(await FieldHutPage({ searchParams: Promise.resolve({ folio: "HUT-121", interviewerCode: "JES26" }) }));

    expect(requireCapability).not.toHaveBeenCalled();
    expect(createHutRepository).toHaveBeenCalled();
    expect(screen.getByText("Encuestador: Jesus")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Participante HUT 121" })).toBeInTheDocument();
    const compactHeader = screen.getByTestId("field-hut-compact-header");
    expect(within(compactHeader).getByText("HUT-121")).toBeInTheDocument();
    expect(within(compactHeader).getByText("NAV-121")).toBeInTheDocument();
    expect(within(compactHeader).getByText("EVA1 247")).toBeInTheDocument();
    expect(within(compactHeader).getByText("EVA2 583")).toBeInTheDocument();
    expect(within(compactHeader).queryByText("5512345678")).not.toBeInTheDocument();
    expect(within(compactHeader).queryByText("participante@example.test")).not.toBeInTheDocument();
    expect(screen.getByTestId("field-hut-secondary-details")).toBeInTheDocument();
    expect(screen.getByText("Filtro pendiente de captura.")).toBeInTheDocument();
    expect(screen.getByText("Filtro")).toBeInTheDocument();
    expect(screen.getAllByText("Filtro de participante").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/0\/3/)).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Evidencia fotografica")).toBeInTheDocument();
    expect(screen.getByText("Evaluaciones")).toBeInTheDocument();
    expect(screen.getByText("Fotos recibidas")).toBeInTheDocument();
    expect(screen.getAllByText("Entrega del producto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Producto 1 - Dia 1 (Colocacion)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Producto 1 - Dia 3 tarde - Evaluacion 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 3 tarde - Evaluacion 2")).toBeInTheDocument();
    expect(screen.getAllByText("Entrega de perfume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Regreso 1 - Evaluacion primer perfume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Regreso 2 - Confirmacion segundo perfume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Evaluacion comparativa (Regreso 2)").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Evaluacion segundo perfume")).not.toBeInTheDocument();
    expect(screen.queryByText("Regreso 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Regreso 2")).not.toBeInTheDocument();
    expect(screen.getAllByText("Producto: 247").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("COLOCACION")).not.toBeInTheDocument();
    expect(screen.queryByText("REGRESO_1")).not.toBeInTheDocument();
    expect(screen.queryByText("REGRESO_2")).not.toBeInTheDocument();
    expect(screen.getByText("Respuestas existentes")).toBeInTheDocument();
    expect(screen.getByText(/Participo anteriormente en CLT/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar evaluacion" })).toHaveAttribute(
      "href",
      "/field/hut?folio=HUT-121&interviewerCode=JES26&accessType=INTERVIEWER&questionCode=HUT_V1_CONFIRMACION_ENTREGA"
    );
    expect(screen.queryByText("Confirmar entrega del primer perfume")).not.toBeInTheDocument();
    expect(screen.queryByText("Primer perfume HUT:")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA1")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA2")).not.toBeInTheDocument();
    expect(screen.getByText("Preguntas contestadas")).toBeInTheDocument();
    expect(screen.queryByText(/Pregunta \d+ de \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar y continuar" })).not.toBeInTheDocument();
  });

  it("resuelve rotacion, muestra etiquetas de escala y recupera seleccion guardada", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createScaleWorkspace(),
      ok: true
    });

    render(await FieldHutPage({
      searchParams: Promise.resolve({
        folio: "HUT-121",
        interviewerCode: "JES26",
        questionCode: "HUT_EVA1_GUSTO"
      })
    }));

    expect(screen.getByRole("heading", { name: /Que tanto le gusto el primer perfume/i })).toBeInTheDocument();
    expect(screen.getByText("Producto 1:")).toBeInTheDocument();
    expect(screen.getAllByText("247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Modo prueba activo/)).toBeInTheDocument();
    expect(screen.getByText("Le disgusto muchisimo")).toBeInTheDocument();
    expect(screen.getByText("Le gusto muchisimo")).toBeInTheDocument();
    const selectedScaleOption = screen.getByRole("radio", { name: /Le gusto mucho/i });
    expect(selectedScaleOption).toBeChecked();
    expect(selectedScaleOption.closest("div")).toHaveClass("space-y-3");
    expect(screen.getByRole("button", { name: "Guardar y continuar" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("HUT_EVA1_ATRIBUTOS")).toHaveAttribute("name", "returnQuestionCode");
    expect(screen.queryByText("Respuestas existentes")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA1")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA2")).not.toBeInTheDocument();
  });

  it("rota atributos HUT por participante y conserva el orden mostrado para auditoria", async () => {
    const firstWorkspace = createMatrixWorkspace("participant-a");
    getFieldQuestionnaireWorkspaceMock.mockResolvedValueOnce({
      data: firstWorkspace,
      ok: true
    });

    const firstRender = render(await FieldHutPage({
      searchParams: Promise.resolve({
        folio: "HUT-121",
        interviewerCode: "JES26",
        questionCode: "HUT_EVA1_ATRIBUTOS"
      })
    }));

    const firstOrder = "ENVASE_COMODO|SEGURIDAD|REFLEJA_MI_PERSONALIDAD|CANTIDAD_FACIL|INTENSIDAD_ADECUADA|AROMA_AGRADABLE|DIRECCION_FACIL|AROMA_UNICO|AROMA_DURADERO|ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO";
    expect(screen.getByDisplayValue(firstOrder)).toHaveAttribute("name", "HUT_EVA1_ATRIBUTOS.__rowOrder");
    expect(
      firstRender.container.querySelector('input[name="HUT_EVA1_ATRIBUTOS.AROMA_AGRADABLE"][value="7"]')
    ).toBeChecked();
    firstRender.unmount();

    const secondWorkspace = createMatrixWorkspace("participant-b");
    getFieldQuestionnaireWorkspaceMock.mockResolvedValueOnce({
      data: secondWorkspace,
      ok: true
    });

    const secondRender = render(await FieldHutPage({
      searchParams: Promise.resolve({
        folio: "HUT-121",
        interviewerCode: "JES26",
        questionCode: "HUT_EVA1_ATRIBUTOS"
      })
    }));

    const secondOrder = "REFLEJA_MI_PERSONALIDAD|ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO|SEGURIDAD|ENVASE_COMODO|DIRECCION_FACIL|AROMA_DURADERO|AROMA_UNICO|INTENSIDAD_ADECUADA|CANTIDAD_FACIL|AROMA_AGRADABLE";
    expect(secondOrder).not.toBe(firstOrder);
    expect(screen.getByDisplayValue(secondOrder)).toHaveAttribute("name", "HUT_EVA1_ATRIBUTOS.__rowOrder");
    expect(
      secondRender.container.querySelector('input[name="HUT_EVA1_ATRIBUTOS.AROMA_AGRADABLE"][value="7"]')
    ).toBeChecked();
  });

  it("usa orden rotado estable para pares de preguntas HUT", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createPairRotationWorkspace("p1"),
      ok: true
    });

    render(await FieldHutPage({
      searchParams: Promise.resolve({
        folio: "HUT-121",
        interviewerCode: "JES26"
      })
    }));

    expect(screen.getByRole("link", { name: "Iniciar evaluacion" })).toHaveAttribute(
      "href",
      "/field/hut?folio=HUT-121&interviewerCode=JES26&accessType=INTERVIEWER&questionCode=HUT_P9A_DISGUSTO_ABIERTO"
    );
  });

  it("muestra pantalla de entrevista terminada con motivo", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createTerminatedWorkspace(),
      ok: true
    });

    render(await FieldHutPage({ searchParams: Promise.resolve({ folio: "HUT-121", interviewerCode: "JES26" }) }));

    expect(screen.getByText("Entrevista terminada")).toBeInTheDocument();
    expect(screen.getByText("Motivo: HUT_F6_PRODUCTOS_7_DIAS: No selecciono Perfume/fragancia")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Iniciar evaluacion" })).not.toBeInTheDocument();
  });
});

function createCodeRequiredDashboard(error: string | null = null) {
  return {
    actorName: "Campo HUT",
    detail: null,
    interviewerCodes: [],
    participants: [],
    selectedStudyId: null,
    studies: [],
    viewer: {
      error,
      mode: "CODE_REQUIRED"
    }
  };
}

function createFieldDashboard() {
  return {
    actorName: "Campo HUT",
    detail: null,
    interviewerCodes: [],
    participants: [
      {
        folio: "NAV-121",
        hut: {
          applicationPhotoCount: 1,
          currentSection: "DATOS_GENERALES",
          folio: "HUT-121",
          id: "hut-participant-121",
          origin: "CLT_HUT",
          protocolVersion: "APPLICATION_PHOTO",
          questionnaireStatus: "IN_PROGRESS",
          status: "BLOCK_1_CALL_PENDING",
          testMode: false,
          token: "hut-token-121"
        },
        id: "nav:study-participant-121",
        participantId: "study-participant-121",
        participantName: "Participante HUT 121"
      }
    ],
    selectedStudyId: "study-hut",
    studies: [],
    viewer: {
      code: "JES26",
      id: "interviewer-code-1",
      label: "Jesus",
      mode: "INTERVIEWER_CODE"
    }
  };
}

function createSupervisorDashboard() {
  return {
    ...createFieldDashboard(),
    participants: [
      ...createFieldDashboard().participants,
      {
        folio: "NAV-999",
        hut: {
          applicationPhotoCount: 0,
          currentSection: null,
          folio: "HUT-999",
          id: "hut-participant-999",
          origin: "CLT_HUT",
          protocolVersion: "APPLICATION_PHOTO",
          questionnaireStatus: "PENDING",
          status: "NOT_STARTED",
          testMode: false,
          token: "hut-token-999"
        },
        id: "nav:study-participant-999",
        participantId: "study-participant-999",
        participantName: "Participante HUT 999"
      }
    ],
    viewer: {
      code: "SUP26",
      id: "supervisor-code-1",
      label: "Supervisor Campo",
      mode: "SUPERVISOR_CODE"
    }
  };
}

function createAdminDashboard() {
  return {
    ...createFieldDashboard(),
    viewer: {
      filterInterviewerCodeId: null,
      mode: "ADMIN"
    }
  };
}

function createWorkspace() {
  return {
    participant: {
      email: "participante@example.test",
      hutFolio: "HUT-121",
      id: "hut-participant-121",
      name: "Participante HUT 121",
      navFolio: "NAV-121",
      origin: "CLT_HUT",
      phone: "5512345678",
      protocolVersion: "APPLICATION_PHOTO",
      status: "BLOCK_1_CALL_PENDING",
      studyId: "study-hut",
      testMode: false
    },
    phaseCodes: [
      {
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
        expiresAt: null,
        label: "Colocacion / Entrega 1",
        phase: "COLOCACION",
        sentAt: null,
        slot: 1,
        status: "USED",
        updatedAt: new Date("2026-08-01T12:00:00.000Z"),
        usedAt: new Date("2026-08-01T12:00:00.000Z"),
        validatedAt: new Date("2026-08-01T12:00:00.000Z")
      }
    ],
    photos: [
      {
        capturedAt: new Date("2026-08-01T12:30:00.000Z"),
        capturedLocalDate: "2026-08-01",
        phase: "COLOCACION",
        productCode: "247",
        signedUrl: "https://example.test/foto.jpg",
        source: "PHASE_EVIDENCE",
        useDayNumber: null
      }
    ],
    questionnaire: {
      answers: {
        HUT_DG_FOLIO: "NAV-121",
        HUT_DG_NOMBRE: "Participante HUT 121",
        HUT_PARTICIPO_CLT: "SI"
      },
      applicableQuestionCodes: [
        "HUT_DG_NOMBRE",
        "HUT_DG_FOLIO",
        "HUT_DG_FECHA",
        "HUT_F6_PRODUCTOS_7_DIAS",
        "HUT_F20_TIEMPO_USO_MARCA",
        "HUT_F22_IMPORTANCIA_PERFUME",
        "HUT_V1_CONFIRMACION_ENTREGA",
        "HUT_EVA1_GUSTO",
        "HUT_V2_CONFIRMACION_ENTREGA",
        "HUT_P24_PREFERENCIA_GENERAL"
      ],
      attempt: {
        completedAt: null,
        id: "attempt-121",
        participantId: "hut-participant-121",
        startedAt: new Date("2026-08-01T12:00:00.000Z"),
        status: "IN_PROGRESS",
        terminatedAt: null,
        terminationReason: null
      },
      filterStatus: "PENDING",
      omittedQuestionCodes: [],
      participantOrigin: "CLT_HUT",
      visits: []
    },
    rotation: {
      eva1: "247",
      eva2: "583"
    },
    secondStageAuthorized: true
  };
}

function createScaleWorkspace() {
  const workspace = createWorkspace();
  return {
    ...workspace,
    participant: {
      ...workspace.participant,
      testMode: true
    },
    questionnaire: {
      ...workspace.questionnaire,
      answers: {
        HUT_DG_FECHA: "08/08/2026",
        HUT_DG_FOLIO: "NAV-121",
        HUT_DG_NOMBRE: "Participante HUT 121",
        HUT_EVA1_GUSTO: 6,
        HUT_PARTICIPO_CLT: "SI",
        HUT_V1_CONFIRMACION_ENTREGA: "SI"
      },
      applicableQuestionCodes: [
        "HUT_DG_NOMBRE",
        "HUT_DG_FOLIO",
        "HUT_DG_FECHA",
        "HUT_F6_PRODUCTOS_7_DIAS",
        "HUT_F20_TIEMPO_USO_MARCA",
        "HUT_F22_IMPORTANCIA_PERFUME",
        "HUT_V1_CONFIRMACION_ENTREGA",
        "HUT_EVA1_GUSTO",
        "HUT_EVA1_ATRIBUTOS"
      ]
    }
  };
}

function createMatrixWorkspace(participantId: string) {
  const workspace = createScaleWorkspace();
  return {
    ...workspace,
    participant: {
      ...workspace.participant,
      id: participantId
    },
    questionnaire: {
      ...workspace.questionnaire,
      answers: {
        ...workspace.questionnaire.answers,
        HUT_EVA1_ATRIBUTOS: {
          AROMA_AGRADABLE: "7",
          AROMA_DURADERO: "4",
          AROMA_UNICO: "5",
          CANTIDAD_FACIL: "4",
          DIRECCION_FACIL: "5",
          ENVASE_COMODO: "4",
          INTENSIDAD_ADECUADA: "5",
          ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO: "6",
          REFLEJA_MI_PERSONALIDAD: "5",
          SEGURIDAD: "4"
        }
      }
    }
  };
}

function createPairRotationWorkspace(participantId: string) {
  const workspace = createWorkspace();
  return {
    ...workspace,
    participant: {
      ...workspace.participant,
      id: participantId
    },
    questionnaire: {
      ...workspace.questionnaire,
      answers: {
        HUT_EVA1_GUSTO: 6
      },
      applicableQuestionCodes: [
        "HUT_EVA1_GUSTO",
        "HUT_P8A_GUSTO_ABIERTO",
        "HUT_P9A_DISGUSTO_ABIERTO"
      ],
      filterStatus: "COMPLETED"
    }
  };
}

function createTerminatedWorkspace() {
  const workspace = createWorkspace();
  return {
    ...workspace,
    questionnaire: {
      ...workspace.questionnaire,
      attempt: {
        ...workspace.questionnaire.attempt,
        status: "TERMINATED",
        terminatedAt: new Date("2026-08-08T12:00:00.000Z"),
        terminationReason: "HUT_F6_PRODUCTOS_7_DIAS: No selecciono Perfume/fragancia"
      }
    }
  };
}
