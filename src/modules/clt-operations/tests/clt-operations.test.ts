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
    expect(dashboard?.participants).toHaveLength(2);
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
    expect(answersExport.body).toContain("TRI1_SYSTEM_POS1\tTRI1_SYSTEM_POS2\tTRI1_SYSTEM_POS3");
    expect(answersExport.body).toContain("TRI1_SELECTED\tTRI1_SELECTED_POSITION\tTRI1_CORRECT");
    expect(answersExport.body).toContain("EVA1_PRODUCT\tEVA1_ORDER\tEVA1_ARM\tEVA1_CONFIRMED_PRODUCT\tEVA1_CONFIRMED_ARM\tEVA1_CONFIRMED_ORDER");
    expect(answersExport.body).toContain("EVA2_PRODUCT\tEVA2_ORDER\tEVA2_ARM\tEVA2_CONFIRMED_PRODUCT\tEVA2_CONFIRMED_ARM\tEVA2_CONFIRMED_ORDER");
    expect(answersExport.body).toContain("P8A_LIMPIA");
    expect(answersExport.body).toContain("P9A_FLORAL");
    expect(answersExport.body).toContain("P8A_ATTRIBUTE_ORDER");
    const [headerLine, firstRowLine, secondRowLine] = answersExport.body.replace(/^\uFEFF/, "").split("\r\n");
    const header = headerLine!.split("\t");
    expect(header.slice(4, 35)).toEqual([
      "ROTATION_CODE",
      "ROTATION_PLAN",
      "ROTATION_EVA1",
      "ROTATION_EVA2",
      "EVA_APPLICATION_ORDER",
      "TRI1_DELIVERY_ORDER",
      "TRI1_SYSTEM_POS1",
      "TRI1_SYSTEM_POS2",
      "TRI1_SYSTEM_POS3",
      "TRI1_CONFIRMED_POS1",
      "TRI1_CONFIRMED_POS2",
      "TRI1_CONFIRMED_POS3",
      "TRI2_DELIVERY_ORDER",
      "TRI2_SYSTEM_POS1",
      "TRI2_SYSTEM_POS2",
      "TRI2_SYSTEM_POS3",
      "TRI2_CONFIRMED_POS1",
      "TRI2_CONFIRMED_POS2",
      "TRI2_CONFIRMED_POS3",
      "EVA1_PRODUCT",
      "EVA1_ORDER",
      "EVA1_ARM",
      "EVA1_CONFIRMED_PRODUCT",
      "EVA1_CONFIRMED_ARM",
      "EVA1_CONFIRMED_ORDER",
      "EVA2_PRODUCT",
      "EVA2_ORDER",
      "EVA2_ARM",
      "EVA2_CONFIRMED_PRODUCT",
      "EVA2_CONFIRMED_ARM",
      "EVA2_CONFIRMED_ORDER"
    ]);
    expect(header).not.toContain("P8A");
    expect(header).not.toContain("P9A");
    expect(header).not.toContain("P8B");
    expect(header).not.toContain("P9B");
    expect(header.indexOf("DG_NOMBRE")).toBeLessThan(header.indexOf("F0"));
    expect(header.indexOf("F14")).toBeLessThan(header.indexOf("TRI1_SELECTED"));
    expect(header.indexOf("TRI1_CORRECT")).toBeLessThan(header.indexOf("TRI2_SELECTED"));
    expect(header.indexOf("TRI2_CORRECT")).toBeLessThan(header.indexOf("P5A"));
    expect(header.indexOf("P13A")).toBeLessThan(header.indexOf("P5B"));
    expect(header.indexOf("P13B")).toBeLessThan(header.indexOf("P14"));
    expect(header.indexOf("P20")).toBeLessThan(header.indexOf("D1_ESCOLARIDAD_JEFE_HOGAR"));
    expect(header.indexOf("P8A_ATTRIBUTE_ORDER")).toBeLessThan(header.indexOf("P8A_LIMPIA"));
    expect(header.indexOf("P9A_ATTRIBUTE_ORDER")).toBeLessThan(header.indexOf("P9A_FLORAL"));
    const firstRow = firstRowLine!.split("\t");
    const secondRow = secondRowLine!.split("\t");
    expect(firstRow[header.indexOf("ROTATION_CODE")]).toBe("ROT-1");
    expect(firstRow[header.indexOf("ROTATION_PLAN")]).toBe("Rotacion 1");
    expect(firstRow[header.indexOf("EVA1_PRODUCT")]).toBe("247");
    expect(firstRow[header.indexOf("EVA1_CONFIRMED_PRODUCT")]).toBe("247");
    expect(firstRow[header.indexOf("EVA1_CONFIRMED_ARM")]).toBe("Brazo izquierdo");
    expect(firstRow[header.indexOf("EVA1_CONFIRMED_ORDER")]).toBe("1");
    expect(firstRow[header.indexOf("EVA2_PRODUCT")]).toBe("583");
    expect(firstRow[header.indexOf("EVA2_CONFIRMED_PRODUCT")]).toBe("583");
    expect(firstRow[header.indexOf("EVA2_CONFIRMED_ARM")]).toBe("Brazo derecho");
    expect(firstRow[header.indexOf("EVA2_CONFIRMED_ORDER")]).toBe("2");
    expect(firstRow[header.indexOf("TRI1_DELIVERY_ORDER")]).toBe("247|583|912");
    expect(firstRow[header.indexOf("TRI1_SYSTEM_POS1")]).toBe("247");
    expect(firstRow[header.indexOf("TRI1_SYSTEM_POS2")]).toBe("583");
    expect(firstRow[header.indexOf("TRI1_SYSTEM_POS3")]).toBe("912");
    expect(firstRow[header.indexOf("TRI1_CONFIRMED_POS1")]).toBe("247");
    expect(firstRow[header.indexOf("TRI1_CONFIRMED_POS2")]).toBe("583");
    expect(firstRow[header.indexOf("TRI1_CONFIRMED_POS3")]).toBe("912");
    expect(firstRow[header.indexOf("TRI2_DELIVERY_ORDER")]).toBe("835|724|583");
    expect(firstRow[header.indexOf("TRI2_SYSTEM_POS1")]).toBe("835");
    expect(firstRow[header.indexOf("TRI2_SYSTEM_POS2")]).toBe("724");
    expect(firstRow[header.indexOf("TRI2_SYSTEM_POS3")]).toBe("583");
    expect(firstRow[header.indexOf("TRI2_CONFIRMED_POS1")]).toBe("835");
    expect(firstRow[header.indexOf("TRI2_CONFIRMED_POS2")]).toBe("724");
    expect(firstRow[header.indexOf("TRI2_CONFIRMED_POS3")]).toBe("583");
    expect(firstRow[header.indexOf("TRI1_SELECTED")]).toBe("583");
    expect(firstRow[header.indexOf("TRI1_SELECTED_POSITION")]).toBe("PR2");
    expect(firstRow[header.indexOf("TRI1_CORRECT")]).toBe("1");
    expect(secondRow[header.indexOf("EVA1_PRODUCT")]).toBe("");
    expect(secondRow[header.indexOf("EVA1_CONFIRMED_PRODUCT")]).toBe("");
    expect(secondRow[header.indexOf("EVA2_CONFIRMED_PRODUCT")]).toBe("");
    expect(secondRow[header.indexOf("TRI1_CONFIRMED_POS1")]).toBe("");
    expect(secondRow[header.indexOf("TRI2_CONFIRMED_POS1")]).toBe("");
    expect(secondRow[header.indexOf("TRI1_SYSTEM_POS1")]).toBe("247");
    expect(secondRow[header.indexOf("TRI1_SELECTED")]).toBe("583");
    expect(secondRow[header.indexOf("TRI1_SELECTED_POSITION")]).toBe("PR2");
    expect(secondRow[header.indexOf("TRI1_CORRECT")]).toBe("1");
    expect(answersExport.body).not.toContain("NAV-002\tHistorico Sin Trazabilidad\tCOMPLETED\tJesus\t247\t583\t912");
    expect(answersExport.body).not.toContain("Marca A\tMarca B");
    expect(answersExport.body).not.toContain("Marca C\r\notra");
  });

  it("counts F11a as applicable when F11 indicates a difference", () => {
    const progress = resolveCltApplicableProgress(createCompleteCtlAnswers({ f11Value: "1", includeF11A: true }));

    expect(progress.label).toBe("74/74");
    expect(progress.answeredCount).toBe(74);
    expect(progress.questionCount).toBe(74);
  });

  it("does not count F11a as missing when F11 skips it", () => {
    const progress = resolveCltApplicableProgress(createCompleteCtlAnswers({ f11Value: "2", includeF11A: false }));

    expect(progress.label).toBe("73/73");
    expect(progress.answeredCount).toBe(73);
    expect(progress.questionCount).toBe(73);
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
        { answerValue: "247", questionCode: "TRI1_CONFIRMED_POS1" },
        { answerValue: "583", questionCode: "TRI1_CONFIRMED_POS2" },
        { answerValue: "912", questionCode: "TRI1_CONFIRMED_POS3" },
        {
          answerValue: {
            correct: 1,
            deliveryOrder: ["247", "583", "912"],
            positions: { PR1: "247", PR2: "583", PR3: "912" },
            selectedKey: "583",
            selectedPosition: "PR2"
          },
          questionCode: "P1"
        },
        { answerValue: "835", questionCode: "TRI2_CONFIRMED_POS1" },
        { answerValue: "724", questionCode: "TRI2_CONFIRMED_POS2" },
        { answerValue: "583", questionCode: "TRI2_CONFIRMED_POS3" },
        {
          answerValue: {
            correct: 0,
            deliveryOrder: ["835", "724", "583"],
            positions: { PR1: "835", PR2: "724", PR3: "583" },
            selectedKey: "835",
            selectedPosition: "PR1"
          },
          questionCode: "P3"
        },
        { answerValue: { FRESCA: "5", LIMPIA: "4", MASCULINA: "3" }, questionCode: "P8A" },
        { answerValue: { FLORAL: "1", FRUTAL: "2" }, questionCode: "P9A" },
        {
          answerValue: { armCode: "LEFT", armLabel: "Brazo izquierdo", order: 1, productCode: "247" },
          questionCode: "SYS_EVA1_TRACE"
        },
        { answerValue: "247", questionCode: "EVA1_CONFIRMED_PRODUCT" },
        { answerValue: "Brazo izquierdo", questionCode: "EVA1_CONFIRMED_ARM" },
        { answerValue: "1", questionCode: "EVA1_CONFIRMED_ORDER" },
        {
          answerValue: { armCode: "RIGHT", armLabel: "Brazo derecho", order: 2, productCode: "583" },
          questionCode: "SYS_EVA2_TRACE"
        },
        { answerValue: "583", questionCode: "EVA2_CONFIRMED_PRODUCT" },
        { answerValue: "Brazo derecho", questionCode: "EVA2_CONFIRMED_ARM" },
        { answerValue: "2", questionCode: "EVA2_CONFIRMED_ORDER" }
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
      triangularRotationSnapshot: {
        assignmentId: "triangular-1",
        triangular1: {
          pr1: "247",
          pr2: "583",
          pr3: "912",
          verify: "583"
        },
        triangular2: {
          pr1: "835",
          pr2: "724",
          pr3: "583",
          verify: "724"
        }
      },
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
    },
    {
      answers: [
        { answerValue: { correct: 1, selectedKey: "583", selectedPosition: "PR2" }, questionCode: "P1" },
        { answerValue: { correct: 0, selectedKey: "835", selectedPosition: "PR1" }, questionCode: "P3" }
      ],
      claimedAt: new Date("2026-08-08T05:00:00.000Z"),
      completedAt: new Date("2026-08-08T06:00:00.000Z"),
      ctlInterviewerCode: { label: "Jesus" },
      id: "session-2",
      interviewer: null,
      phaseProgress: [],
      startedAt: new Date("2026-08-08T05:00:00.000Z"),
      status: "COMPLETED",
      triangularRotationSnapshot: {
        assignmentId: "triangular-2",
        triangular1: {
          pr1: "247",
          pr2: "583",
          pr3: "912",
          verify: "583"
        },
        triangular2: {
          pr1: "835",
          pr2: "724",
          pr3: "583",
          verify: "724"
        }
      },
      studyParticipant: {
        accessTokens: [],
        activities: [],
        applicationStartedAt: null,
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
        hutParticipant: null,
        id: "participant-2",
        participantConfirmation: { folio: "NAV-002" },
        participantProfile: { name: "Historico Sin Trazabilidad" },
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
