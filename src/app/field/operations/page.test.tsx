import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldOperationsPage from "./page";
import { createFieldOperationsRepository } from "@/modules/field-operations";
import { requireCapability } from "@/shared/auth/session";

const getDashboardMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "example.test", "x-forwarded-proto": "https" }))
}));

vi.mock("@/shared/auth/session", () => ({
  requireCapability: vi.fn()
}));

vi.mock("@/modules/field-operations", () => ({
  createFieldOperationsRepository: vi.fn(() => ({
    getDashboard: getDashboardMock
  }))
}));

describe("FieldOperationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCapability).mockResolvedValue({
      id: "interviewer-1",
      name: "Encuestadora Uno",
      role: "INTERVIEWER"
    } as never);
    getDashboardMock.mockResolvedValue(createDashboard());
  });

  it("muestra seguimiento operativo del encuestador validado por codigo", async () => {
    render(await FieldOperationsPage({
      searchParams: Promise.resolve({
        interviewerCode: "JES26",
        sessionId: "ctl-1",
        studyId: "study-1"
      })
    }));

    expect(requireCapability).toHaveBeenCalledWith("field:access");
    expect(createFieldOperationsRepository).toHaveBeenCalled();
    expect(getDashboardMock).toHaveBeenCalledWith({
      actorName: "Encuestadora Uno",
      actorRole: "INTERVIEWER",
      detailSessionId: "ctl-1",
      interviewerCode: "JES26",
      interviewerCodeId: undefined,
      interviewerUserId: "interviewer-1",
      mode: "INTERVIEWER_CODE",
      studyId: "study-1"
    });
    expect(screen.getByRole("heading", { name: "Seguimiento de participantes" })).toBeInTheDocument();
    expect(screen.getAllByText("Encuestador").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("JES26")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cambiar encuestador" })).toHaveAttribute("href", "/field/dashboard");
    expect(screen.getAllByText("NAV-121").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HUT-121").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Encargado")).toBeInTheDocument();
    expect(screen.getByText("Participante Seguimiento")).toBeInTheDocument();
    expect(screen.getByText(/link enviado/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Abrir Navigo" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: /Copiar Navigo|Copiar enlace/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /Abrir fotos HUT|HUT/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/🧪 Modo prueba/)).toBeInTheDocument();
    expect(screen.getByText("Modo prueba activo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir captura HUT" })).toHaveAttribute("href", "/field/hut?folio=HUT-121");
    expect(screen.getAllByRole("button", { name: "Enviar recordatorio ahora" }).length).toBeGreaterThan(0);
  });

  it("bloquea el dashboard cuando falta codigo de encuestador", async () => {
    getDashboardMock.mockResolvedValue({
      ...createDashboard(),
      detail: null,
      participants: [],
      selectedStudyId: null,
      studies: [],
      viewer: {
        error: null,
        mode: "CODE_REQUIRED"
      }
    });

    render(await FieldOperationsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Selecciona tu encuestador" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código de encuestador")).toBeInTheDocument();
    expect(screen.queryByText("NAV-121")).not.toBeInTheDocument();
  });

  it("muestra error si el codigo de encuestador no es valido", async () => {
    getDashboardMock.mockResolvedValue({
      ...createDashboard(),
      detail: null,
      participants: [],
      selectedStudyId: null,
      studies: [],
      viewer: {
        error: "El código de encuestador no es válido.",
        mode: "CODE_REQUIRED"
      }
    });

    render(await FieldOperationsPage({ searchParams: Promise.resolve({ interviewerCode: "BAD26" }) }));

    expect(screen.getByText("El código de encuestador no es válido.")).toBeInTheDocument();
    expect(screen.queryByText("Participante Seguimiento")).not.toBeInTheDocument();
  });

  it("permite a administrador ver todos y filtrar por encuestador", async () => {
    vi.mocked(requireCapability).mockResolvedValue({
      id: "admin-1",
      name: "Admin Uno",
      role: "ADMIN"
    } as never);
    getDashboardMock.mockResolvedValue({
      ...createDashboard(),
      viewer: {
        filterInterviewerCodeId: null,
        mode: "ADMIN"
      }
    });

    render(await FieldOperationsPage({ searchParams: Promise.resolve({ mode: "admin", studyId: "study-1" }) }));

    expect(getDashboardMock).toHaveBeenCalledWith(expect.objectContaining({
      actorRole: "ADMIN",
      mode: "ADMIN"
    }));
    expect(screen.getByText("Modo administrador")).toBeInTheDocument();
    expect(screen.getByLabelText("Encuestador")).toBeInTheDocument();
    expect(screen.getByText("Participante Seguimiento")).toBeInTheDocument();
  });
});

function createDashboard() {
  const detail = {
    answerGroups: [
      {
        answers: [{ code: "P5A", label: "Gusto", value: "7" }],
        sectionId: "FRAGRANCIA_1",
        sectionTitle: "Evaluacion primera fragancia"
      }
    ],
    answeredCount: 1,
    cltCompletedAt: new Date("2026-08-08T06:00:00.000Z"),
    cltProgressLabel: "1/1",
    cltStartedAt: new Date("2026-08-08T05:00:00.000Z"),
    cltStatus: "COMPLETED",
    folio: "NAV-121",
    hut: {
      applicationPhotoCount: 1,
      currentSection: "PRIMERA_VISITA",
      folio: "HUT-121",
      id: "hut-121",
      origin: "CLT_HUT",
      protocolVersion: "APPLICATION_PHOTO",
      questionnaireStatus: "IN_PROGRESS",
      status: "BLOCK_1_CALL_PENDING",
      testMode: true,
      token: "hut-token-121"
    },
    id: "ctl-1",
    interviewer: "Encuestadora Uno",
    navigoActivities: [
      {
        availableFrom: new Date("2026-08-08T09:00:00.000Z"),
        code: "T3_HORAS",
        completedAt: null,
        evidenceCount: 0,
        id: "activity-t3",
        name: "Evaluacion 3 horas",
        scheduledAt: new Date("2026-08-08T09:00:00.000Z"),
        status: "AVAILABLE"
      }
    ],
    navigoLinkToken: "token-navigo",
    participantId: "study-participant-121",
    participantName: "Participante Seguimiento",
    phaseProgress: [],
    questionCount: 1,
    reminders: [
      {
        activityCode: "T3_HORAS",
        id: "reminder-1",
        sentAt: new Date("2026-08-08T09:05:00.000Z"),
        status: "COMPLETED"
      }
    ],
    rotation: {
      arms: [],
      firstSampleKey: "247",
      rotationCode: "ROT-1",
      secondSampleKey: "583"
    },
    t0: new Date("2026-08-08T06:00:00.000Z"),
    whatsapp: {
      lastMessageAt: new Date("2026-08-08T06:10:00.000Z"),
      lastStatus: "sent",
      messageCount: 1,
      templateNames: ["navigo_acceso_evaluaciones"]
    }
  };

  return {
    actorName: "Encuestadora Uno",
    detail,
    interviewerCodes: [
      {
        id: "ctl-code-jesus",
        label: "Jesus",
        status: "ACTIVE"
      }
    ],
    participants: [detail],
    selectedStudyId: "study-1",
    studies: [
      {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Navigo Homme",
        timeZoneIana: "America/Mexico_City"
      }
    ],
    viewer: {
      code: "JES26",
      id: "ctl-code-jesus",
      label: "Jesus",
      mode: "INTERVIEWER_CODE"
    }
  };
}
