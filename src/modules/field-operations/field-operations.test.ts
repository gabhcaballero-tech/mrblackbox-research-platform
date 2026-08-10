import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFieldOperationsRepository } from "./repository";
import type { CltOperationsDetail } from "@/modules/clt-operations/types";
import { hashCtlInterviewerCode } from "@/modules/ctl/service";

const getCltDashboardMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/clt-operations", () => ({
  createCltOperationsRepository: vi.fn(() => ({
    getDashboard: getCltDashboardMock
  }))
}));

describe("FieldOperationsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra participantes solo CLT, solo HUT, CLT + HUT y Navigo sin HUT", async () => {
    const cltOnly = createDetail({ folio: "NAV-150", id: "ctl-only", participantId: "sp-clt-only" });
    const cltWithHut = createDetail({ folio: "NAV-046", id: "ctl-both", participantId: "sp-both" });
    getCltDashboardMock.mockResolvedValue({
      detail: null,
      participants: [cltOnly, cltWithHut],
      study: study()
    });
    const repository = createFieldOperationsRepository(createFakePrisma() as never);

    const dashboard = await repository.getDashboard({
      actorName: "Admin Uno",
      actorRole: "ADMIN",
      interviewerUserId: "admin-1",
      mode: "ADMIN",
      studyId: "study-1"
    });

    expect(dashboard.participants.map((participant) => participant.folio).sort()).toEqual([
      "HUT-121",
      "NAV-046",
      "NAV-150",
      "NAV-200"
    ]);
    expect(dashboard.participants.find((participant) => participant.folio === "NAV-150")?.hut.id).toBeNull();
    expect(dashboard.participants.find((participant) => participant.folio === "HUT-121")?.cltStatus).toBe("NO_DISPONIBLE");
    expect(dashboard.participants.find((participant) => participant.folio === "NAV-200")?.navigoActivities[0]?.code).toBe("T3_HORAS");
    expect(dashboard.participants.find((participant) => participant.folio === "NAV-046")?.hut.folio).toBe("HUT-046");
  });

  it("mantiene el filtro de encuestador para codigo operativo", async () => {
    getCltDashboardMock.mockResolvedValue({
      detail: null,
      participants: [createDetail({ folio: "NAV-046", id: "ctl-both", participantId: "sp-both" })],
      study: study()
    });
    const repository = createFieldOperationsRepository(createFakePrisma() as never);

    const dashboard = await repository.getDashboard({
      actorName: "Campo HUT",
      actorRole: "INTERVIEWER",
      interviewerCode: "JES26",
      interviewerUserId: "field-code",
      mode: "INTERVIEWER_CODE"
    });

    expect(dashboard.viewer).toMatchObject({
      code: "JES26",
      label: "Jesus",
      mode: "INTERVIEWER_CODE"
    });
    expect(getCltDashboardMock).toHaveBeenCalledWith(expect.objectContaining({
      ctlInterviewerCodeId: "code-jesus"
    }));
  });

  it("permite a supervisor ver todos los participantes del estudio", async () => {
    getCltDashboardMock.mockResolvedValue({
      detail: null,
      participants: [createDetail({ folio: "NAV-046", id: "ctl-both", participantId: "sp-both" })],
      study: study()
    });
    const repository = createFieldOperationsRepository(createFakePrisma() as never);

    const dashboard = await repository.getDashboard({
      actorName: "Campo HUT",
      actorRole: "INTERVIEWER",
      interviewerCode: "SUP26",
      interviewerUserId: "field-code",
      mode: "SUPERVISOR_CODE"
    });

    expect(dashboard.viewer).toMatchObject({
      code: "SUP26",
      label: "Supervisor Campo",
      mode: "SUPERVISOR_CODE"
    });
    expect(getCltDashboardMock).toHaveBeenCalledWith(expect.objectContaining({
      ctlInterviewerCodeId: null
    }));
    expect(dashboard.participants.map((participant) => participant.folio).sort()).toEqual([
      "HUT-121",
      "NAV-046",
      "NAV-200"
    ]);
  });

  it("bloquea modo supervisor con codigo de encuestador", async () => {
    const repository = createFieldOperationsRepository(createFakePrisma() as never);

    const dashboard = await repository.getDashboard({
      actorName: "Campo HUT",
      actorRole: "INTERVIEWER",
      interviewerCode: "JES26",
      interviewerUserId: "field-code",
      mode: "SUPERVISOR_CODE"
    });

    expect(dashboard.viewer).toMatchObject({
      error: "El codigo de supervisor no es valido.",
      mode: "CODE_REQUIRED"
    });
  });
});

function createFakePrisma() {
  const navigoOnly = {
    accessTokens: [{ expiresAt: new Date("2026-08-10T00:00:00.000Z"), id: "token-nav-200", status: "ACTIVE" }],
    activities: [activity("activity-nav-200", "T3_HORAS", "AVAILABLE")],
    applicationStartedAt: new Date("2026-08-08T06:00:00.000Z"),
    armAssignments: [],
    id: "sp-nav-only",
    participantConfirmation: { folio: "NAV-200" },
    participantProfile: { name: "Participante Navigo" },
    rotationAssignment: null
  };
  const hutOnly = {
    applicationPhotoEntries: [{ id: "photo-hut-121" }],
    createdAt: new Date("2026-08-08T05:00:00.000Z"),
    folio: "HUT-121",
    id: "hut-only",
    name: "Participante HUT",
    origin: "HUT_DIRECTO",
    protocolVersion: "APPLICATION_PHOTO",
    questionnaireAttempt: { status: "IN_PROGRESS", visits: [] },
    status: "BLOCK_1_CALL_PENDING",
    studyParticipant: null,
    testMode: false,
    token: "hut-token-121",
    updatedAt: new Date("2026-08-08T05:00:00.000Z")
  };
  const hutLinked = {
    ...hutOnly,
    applicationPhotoEntries: [],
    folio: "HUT-046",
    id: "hut-linked",
    name: "Participante Both",
    origin: "CLT_HUT",
    studyParticipant: {
      id: "sp-both",
      participantConfirmation: { folio: "NAV-046" },
      participantProfile: { name: "Participante Both" }
    },
    token: "hut-token-046"
  };

  return {
    ctlInterviewerCode: {
      findFirst: async (args: { where?: { codeHash?: string } }) => {
        if (args.where?.codeHash === hashCtlInterviewerCode("JES26")) {
          return {
            expiresAt: null,
            id: "code-jesus",
            label: "Jesus",
            status: "ACTIVE",
            study: study(),
            studyId: "study-1"
          };
        }
        if (args.where?.codeHash === hashCtlInterviewerCode("SUP26")) {
          return {
            expiresAt: null,
            id: "code-supervisor",
            label: "Supervisor Campo",
            status: "ACTIVE",
            study: study(),
            studyId: "study-1"
          };
        }
        return null;
      },
      findMany: async () => []
    },
    hutParticipant: {
      findMany: async () => [hutOnly, hutLinked]
    },
    study: {
      findMany: async () => [study()]
    },
    studyParticipant: {
      findMany: async () => [navigoOnly]
    }
  };
}

function createDetail(input: { folio: string; id: string; participantId: string }): CltOperationsDetail {
  return {
    answerGroups: [],
    answeredCount: 1,
    cltCompletedAt: new Date("2026-08-08T06:00:00.000Z"),
    cltProgressLabel: "1/1",
    cltStartedAt: new Date("2026-08-08T05:00:00.000Z"),
    cltStatus: "COMPLETED",
    folio: input.folio,
    hut: {
      applicationPhotoCount: 0,
      currentSection: null,
      folio: null,
      id: null,
      origin: null,
      protocolVersion: null,
      questionnaireStatus: null,
      status: null,
      testMode: false,
      token: null
    },
    id: input.id,
    interviewer: "Jesus",
    navigoActivities: [],
    navigoLinkToken: null,
    participantId: input.participantId,
    participantName: `Participante ${input.folio}`,
    phaseProgress: [],
    questionCount: 1,
    rawAnswers: [],
    reminders: [],
    rotation: {
      arms: [],
      firstSampleKey: null,
      rotationCode: null,
      secondSampleKey: null
    },
    t0: null,
    triangularRotation: {
      triangular1: null,
      triangular2: null
    },
    whatsapp: {
      lastMessageAt: null,
      lastStatus: null,
      messageCount: 0,
      templateNames: []
    }
  };
}

function activity(id: string, code: string, status: string) {
  const scheduledAt = new Date("2026-08-08T09:00:00.000Z");
  return {
    activitySchedule: {
      code,
      name: "Evaluacion 3 horas",
      sortOrder: 1
    },
    actualCompletedAt: null,
    availableFrom: scheduledAt,
    id,
    participantActivityEvidence: [],
    reminders: [],
    scheduledAt,
    status
  };
}

function study() {
  return {
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Navigo Homme",
    timeZoneIana: "America/Mexico_City"
  };
}
