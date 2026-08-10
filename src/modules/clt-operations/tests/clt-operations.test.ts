import { describe, expect, it } from "vitest";
import { getCtlQuestions } from "@/modules/ctl/definition";
import { createCltOperationsRepository } from "../repository";
import { buildCltAnswersTsv, buildCltOperationsTsv, resolveCltApplicableProgress } from "../service";

describe("clt operations", () => {
  it("builds a read-only CLT/Navigo/HUT dashboard", async () => {
    const repository = createCltOperationsRepository(createFakePrisma());
    const dashboard = await repository.getDashboard({
      detailSessionId: "session-1",
      studyId: "study-1"
    });

    expect(dashboard?.study.code).toBe("FMASCULINA-NAVIGO-2026");
    expect(dashboard?.participants).toHaveLength(1);
    expect(dashboard?.participants[0]).toMatchObject({
      cltStatus: "COMPLETED",
      folio: "NAV-001",
      hut: {
        origin: "CLT_HUT",
        protocolVersion: "APPLICATION_PHOTO",
        questionnaireStatus: "IN_PROGRESS"
      },
      interviewer: "Jesus",
      navigoLinkToken: "token-1",
      participantName: "Francisco Ruiz"
    });
    expect(dashboard?.participants[0]?.navigoActivities.map((activity) => activity.code)).toEqual([
      "T3_HORAS",
      "T4_5_HORAS"
    ]);
    expect(dashboard?.participants[0]?.whatsapp).toMatchObject({
      lastStatus: "sent",
      messageCount: 1,
      templateNames: ["navigo_acceso_evaluaciones"]
    });
    expect(dashboard?.detail?.answerGroups.some((group) => group.answers.some((answer) => answer.code === "F0"))).toBe(true);
  });

  it("exports operational and answer TSV without allowing cells to create columns", async () => {
    const repository = createCltOperationsRepository(createFakePrisma());
    const dashboard = await repository.getDashboard({ studyId: "study-1" });

    expect(dashboard).not.toBeNull();

    const operationalExport = buildCltOperationsTsv({
      dashboard: dashboard!,
      now: new Date("2026-08-08T06:00:00.000Z")
    });
    const answersExport = buildCltAnswersTsv({
      dashboard: dashboard!,
      details: dashboard!.participants,
      now: new Date("2026-08-08T06:00:00.000Z")
    });

    expect(operationalExport.body.startsWith("\uFEFF")).toBe(true);
    expect(operationalExport.body).toContain("Folio\tParticipante\tEncuestador");
    expect(answersExport.body).toContain("NAV-001\tFrancisco Ruiz\tCOMPLETED\tJesus");
    expect(answersExport.body).not.toContain("Marca A\tMarca B");
    expect(answersExport.body).not.toContain("Marca C\r\notra");
  });

  it("counts F11a as applicable when F11 indicates a difference", () => {
    const progress = resolveCltApplicableProgress(createCompleteCtlAnswers({ f11Value: "1", includeF11A: true }));

    expect(progress.label).toBe("62/62");
    expect(progress.answeredCount).toBe(62);
    expect(progress.questionCount).toBe(62);
  });

  it("does not count F11a as missing when F11 skips it", () => {
    const progress = resolveCltApplicableProgress(createCompleteCtlAnswers({ f11Value: "2", includeF11A: false }));

    expect(progress.label).toBe("61/61");
    expect(progress.answeredCount).toBe(61);
    expect(progress.questionCount).toBe(61);
  });
});

function createCompleteCtlAnswers(input: {
  f11Value: "1" | "2";
  includeF11A: boolean;
}): Array<{ answerValue: unknown; questionCode: string }> {
  return getCtlQuestions()
    .filter((question) => input.includeF11A || question.code !== "F11A")
    .map((question) => ({
      answerValue: question.code === "F11"
        ? input.f11Value
        : question.code === "F11A"
          ? "Mayor frescura"
          : defaultAnswerForCtlQuestion(question),
      questionCode: question.code
    }));
}

function defaultAnswerForCtlQuestion(question: ReturnType<typeof getCtlQuestions>[number]): unknown {
  if (question.type === "MATRIX") {
    return Object.fromEntries(question.rows.map((row) => [row.code, "1"]));
  }

  if (question.type === "SCALE") {
    return question.min;
  }

  if (question.type === "SELECT") {
    return question.options.find((option) => !option.skipTo)?.value ?? question.options[0]?.value ?? "1";
  }

  return "Respuesta";
}

function createFakePrisma(): Parameters<typeof createCltOperationsRepository>[0] {
  const study = {
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Navigo Homme",
    timeZoneIana: "America/Mexico_City"
  };
  const sessions = [
    {
      answers: [
        { answerValue: "1", questionCode: "F0" },
        { answerValue: "Marca A\tMarca B\nMarca C", questionCode: "F6" },
        { answerValue: { selectedKey: "583", selectedPosition: "PR2" }, questionCode: "P1" }
      ],
      claimedAt: new Date("2026-08-08T05:00:00.000Z"),
      completedAt: new Date("2026-08-08T06:00:00.000Z"),
      ctlInterviewerCode: { label: "Jesus" },
      id: "session-1",
      interviewer: null,
      phaseProgress: [
        {
          completedAt: new Date("2026-08-08T05:20:00.000Z"),
          phase: "COLOCACION",
          status: "COMPLETED",
          validatedAt: null
        }
      ],
      startedAt: new Date("2026-08-08T05:00:00.000Z"),
      status: "COMPLETED",
      studyParticipant: {
        accessTokens: [
          {
            expiresAt: new Date("2026-08-15T06:00:00.000Z"),
            id: "token-1",
            status: "ACTIVE"
          }
        ],
        activities: [
          {
            activitySchedule: {
              code: "T3_HORAS",
              name: "Evaluacion 3 horas",
              sortOrder: 1
            },
            actualCompletedAt: null,
            availableFrom: new Date("2026-08-08T09:00:00.000Z"),
            id: "activity-1",
            participantActivityEvidence: [{ id: "activity-evidence-1" }],
            reminders: [
              {
                id: "reminder-1",
                scheduledFor: new Date("2026-08-08T09:00:00.000Z"),
                sentAt: new Date("2026-08-08T09:01:00.000Z"),
                status: "COMPLETED"
              }
            ],
            scheduledAt: new Date("2026-08-08T09:00:00.000Z"),
            status: "PENDING"
          },
          {
            activitySchedule: {
              code: "T4_5_HORAS",
              name: "Evaluacion 4.5 horas",
              sortOrder: 2
            },
            actualCompletedAt: null,
            availableFrom: new Date("2026-08-08T10:30:00.000Z"),
            id: "activity-2",
            participantActivityEvidence: [],
            reminders: [],
            scheduledAt: new Date("2026-08-08T10:30:00.000Z"),
            status: "PENDING"
          }
        ],
        applicationStartedAt: new Date("2026-08-08T06:00:00.000Z"),
        armAssignments: [
          {
            applicationOrder: 1,
            participantVisibleLabel: "247",
            studyArm: { code: "LEFT", label: "Brazo izquierdo" },
            studyProduct: { displayLabel: "Fragancia 247", internalCode: "247" }
          },
          {
            applicationOrder: 2,
            participantVisibleLabel: "583",
            studyArm: { code: "RIGHT", label: "Brazo derecho" },
            studyProduct: { displayLabel: "Fragancia 583", internalCode: "583" }
          }
        ],
        hutParticipant: {
          applicationPhotoEntries: [{ id: "photo-1" }],
          folio: "HUT-001",
          id: "hut-1",
          origin: "CLT_HUT",
          protocolVersion: "APPLICATION_PHOTO",
          questionnaireAttempt: {
            status: "IN_PROGRESS",
            visits: [{ section: "PRIMERA_VISITA", status: "IN_PROGRESS" }]
          },
          status: "IN_PROGRESS",
          testMode: false,
          token: "hut-token-1"
        },
        id: "participant-1",
        participantConfirmation: { folio: "NAV-001" },
        participantProfile: { name: "Francisco Ruiz" },
        rotationAssignment: {
          rotationCode: "ROT-1",
          rotationPlan: { name: "Rotacion 1" }
        }
      }
    }
  ];
  const conversations = [
    {
      lastMessageAt: new Date("2026-08-08T06:10:00.000Z"),
      linkedParticipantId: "participant-1",
      messages: [
        {
          rawPayload: {
            template: { name: "navigo_acceso_evaluaciones" }
          },
          status: "sent",
          timestamp: new Date("2026-08-08T06:10:00.000Z")
        }
      ]
    }
  ];

  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    ctlSession: {
      findMany: async () => sessions
    },
    oneuiWhatsAppConversation: {
      findMany: async () => conversations
    },
    study: {
      findUnique: async () => study
    }
  } as unknown as Parameters<typeof createCltOperationsRepository>[0];
}
