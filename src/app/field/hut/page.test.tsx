import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldHutPage from "./page";
import { createHutRepository } from "@/modules/hut";
import { requireCapability } from "@/shared/auth/session";

const getFieldQuestionnaireWorkspaceMock = vi.fn();

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

describe("FieldHutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCapability).mockResolvedValue({ id: "field-user-1" } as never);
  });

  it("requiere acceso de campo y permite continuar un cuestionario HUT existente", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createWorkspace(),
      ok: true
    });

    render(await FieldHutPage({ searchParams: Promise.resolve({ folio: "HUT-121" }) }));

    expect(requireCapability).toHaveBeenCalledWith("field:access");
    expect(createHutRepository).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Participante HUT 121" })).toBeInTheDocument();
    expect(screen.getByText("HUT-121")).toBeInTheDocument();
    expect(screen.getByText("NAV-121")).toBeInTheDocument();
    expect(screen.getByText("EVA1")).toBeInTheDocument();
    expect(screen.getAllByText("247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Cronograma HUT")).toBeInTheDocument();
    expect(screen.getByText("Fotos recibidas")).toBeInTheDocument();
    expect(screen.getAllByText("Entrega del producto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Colocacion").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Producto 1 - Dia 3 tarde - Evaluacion 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2 - Dia 3 tarde - Evaluacion 2")).toBeInTheDocument();
    expect(screen.getAllByText("Producto: 247").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("COLOCACION")).not.toBeInTheDocument();
    expect(screen.queryByText("REGRESO_1")).not.toBeInTheDocument();
    expect(screen.queryByText("REGRESO_2")).not.toBeInTheDocument();
    expect(screen.getByText("Respuestas existentes")).toBeInTheDocument();
    expect(screen.getByText(/Participo anteriormente en CLT/)).toBeInTheDocument();
    expect(screen.getByText("Confirmar entrega del primer perfume")).toBeInTheDocument();
    expect(screen.getByText("Primer perfume HUT:")).toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA1")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA2")).not.toBeInTheDocument();
    expect(screen.getByText("Preguntas contestadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar respuesta" })).toBeInTheDocument();
  });

  it("resuelve rotacion, muestra etiquetas de escala y recupera seleccion guardada", async () => {
    getFieldQuestionnaireWorkspaceMock.mockResolvedValue({
      data: createScaleWorkspace(),
      ok: true
    });

    render(await FieldHutPage({
      searchParams: Promise.resolve({
        folio: "HUT-121",
        questionCode: "HUT_EVA1_GUSTO"
      })
    }));

    expect(screen.getByRole("heading", { name: /Que tanto le gusto el primer perfume/i })).toBeInTheDocument();
    expect(screen.getByText("Primer perfume HUT:")).toBeInTheDocument();
    expect(screen.getAllByText("247").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Modo prueba activo: este HUT puede avanzar sin esperar días reales.")).toBeInTheDocument();
    expect(screen.getByText("Me disgusta muchisimo")).toBeInTheDocument();
    expect(screen.getByText("Me gusta mucho")).toBeInTheDocument();
    const selectedScaleOption = screen.getByRole("radio", { name: /Me gusta mucho/i });
    expect(selectedScaleOption).toBeChecked();
    expect(selectedScaleOption.closest("div")).toHaveClass("space-y-3");
    expect(screen.getByRole("link", { name: "Continuar" })).toHaveAttribute(
      "href",
      "/field/hut?folio=HUT-121&questionCode=HUT_EVA1_ATRIBUTOS"
    );
    expect(screen.queryByText("HUT_EVA1")).not.toBeInTheDocument();
    expect(screen.queryByText("HUT_EVA2")).not.toBeInTheDocument();
  });
});

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
        "HUT_PARTICIPO_CLT",
        "HUT_V1_CONFIRMACION_ENTREGA"
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
      omittedQuestionCodes: [],
      participantOrigin: "CLT_HUT",
      visits: []
    },
    rotation: {
      eva1: "247",
      eva2: "583"
    }
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
        "HUT_PARTICIPO_CLT",
        "HUT_V1_CONFIRMACION_ENTREGA",
        "HUT_EVA1_GUSTO",
        "HUT_EVA1_ATRIBUTOS"
      ]
    }
  };
}
