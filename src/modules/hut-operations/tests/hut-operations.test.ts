import { describe, expect, it } from "vitest";
import { createHutOperationsRepository } from "../repository";
import { buildHutAnswersTsv, buildHutOperationsTsv } from "../service";

describe("hut operations", () => {
  it("builds a read-only HUT operations dashboard", async () => {
    const repository = createHutOperationsRepository(createFakePrisma());
    const dashboard = await repository.getDashboard({
      detailParticipantId: "hut-1",
      studyId: "study-1"
    });

    expect(dashboard?.study.code).toBe("FMASCULINA-NAVIGO-2026");
    expect(dashboard?.participants).toHaveLength(1);
    expect(dashboard?.participants[0]).toMatchObject({
      hutFolio: "HUT-001",
      navFolio: "NAV-001",
      origin: "CLT_HUT",
      participant: {
        name: "Francisco Ruiz"
      },
      photoCount: 1,
      protocolVersion: "APPLICATION_PHOTO",
      questionnaireStatus: "IN_PROGRESS"
    });
    expect(dashboard?.participants[0]?.phaseCodes.map((code) => code.phase)).toEqual([
      "COLOCACION",
      "REGRESO_1",
      "REGRESO_2"
    ]);
    expect(dashboard?.participants[0]?.rotation).toMatchObject({
      hutEva1: "247",
      hutEva2: "583",
      navigoRotationCode: "ROT-1"
    });
    expect(dashboard?.detail?.photoTimeline[0]).toMatchObject({
      dayLabel: "Entrega",
      status: "AVAILABLE",
      title: "Entrega del producto"
    });
    expect(dashboard?.detail?.photoTimeline[1]).toMatchObject({
      dayLabel: "Producto 1 - Dia 1",
      status: "COMPLETED",
      title: "Colocacion / aplicacion del producto 1"
    });
    expect(dashboard?.detail?.photoTimeline.some((slot) => String(slot.id) === "PLACEMENT")).toBe(false);
    expect(dashboard?.detail?.photoTimeline.some((slot) => slot.id === "PRODUCT_1_DAY_1")).toBe(true);
    expect(dashboard?.detail?.photoTimeline.some((slot) => slot.title === "Evaluacion 1" && slot.interviewerTask)).toBe(true);
    expect(dashboard?.detail?.photoTimeline.some((slot) => slot.title === "Evaluacion 2" && slot.interviewerTask)).toBe(true);
    expect(dashboard?.detail?.answerGroups.some((group) => group.answers.some((answer) => answer.code === "HUT_PARTICIPO_CLT"))).toBe(true);
    expect(dashboard?.detail?.timeline.length).toBeGreaterThan(0);
  });

  it("exports operational and answer TSV without allowing cells to create columns", async () => {
    const repository = createHutOperationsRepository(createFakePrisma());
    const dashboard = await repository.getDashboard({ studyId: "study-1" });

    expect(dashboard).not.toBeNull();

    const operationalExport = buildHutOperationsTsv({
      dashboard: dashboard!,
      now: new Date("2026-08-08T06:00:00.000Z")
    });
    const answersExport = buildHutAnswersTsv({
      dashboard: dashboard!,
      details: dashboard!.participants,
      now: new Date("2026-08-08T06:00:00.000Z")
    });

    expect(operationalExport.body.startsWith("\uFEFF")).toBe(true);
    expect(operationalExport.body).toContain("Folio HUT\tFolio NAV\tParticipante");
    expect(answersExport.body).toContain("HUT-001\tNAV-001\tFrancisco Ruiz\tCLT_HUT");
    expect(answersExport.body).not.toContain("Texto con\t tab");
    expect(answersExport.body).not.toContain("salto\n");
  });
});

function createFakePrisma(): Parameters<typeof createHutOperationsRepository>[0] {
  const study = {
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Navigo Homme",
    timeZoneIana: "America/Mexico_City"
  };
  const participants = [
    {
      applicationPhotoEntries: [
        {
          capturedAt: new Date("2026-08-08T06:40:00.000Z"),
          capturedLocalDate: "2026-08-08",
          productCode: "247",
          useDayNumber: 1
        }
      ],
      applicationEvidence: [
        {
          capturedAt: new Date("2026-08-08T06:40:00.000Z"),
          phase: "COLOCACION",
          productCode: "247"
        }
      ],
      createdAt: new Date("2026-08-08T06:00:00.000Z"),
      email: "francisco@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-001",
      id: "hut-1",
      name: "Francisco Ruiz",
      origin: "CLT_HUT",
      phaseCodes: [
        {
          expiresAt: null,
          phase: "COLOCACION",
          sentAt: new Date("2026-08-08T06:01:00.000Z"),
          slot: 1,
          status: "USED",
          usedAt: new Date("2026-08-08T06:10:00.000Z"),
          validatedAt: new Date("2026-08-08T06:05:00.000Z")
        },
        {
          expiresAt: null,
          phase: "REGRESO_1",
          sentAt: null,
          slot: 2,
          status: "GENERATED",
          usedAt: null,
          validatedAt: null
        },
        {
          expiresAt: null,
          phase: "REGRESO_2",
          sentAt: null,
          slot: 3,
          status: "GENERATED",
          usedAt: null,
          validatedAt: null
        }
      ],
      phone: "+525500000000",
      protocolVersion: "APPLICATION_PHOTO",
      questionnaireAttempt: {
        answers: [
          {
            answerJson: "SI",
            answeredAt: new Date("2026-08-08T06:12:00.000Z"),
            questionCode: "HUT_PARTICIPO_CLT",
            visitProgress: { section: "FILTROS" }
          },
          {
            answerJson: "Texto con\t tab y salto\ninterno",
            answeredAt: new Date("2026-08-08T06:13:00.000Z"),
            questionCode: "HUT_V1_OBSERVACIONES",
            visitProgress: { section: "PRIMERA_VISITA" }
          }
        ],
        completedAt: null,
        createdAt: new Date("2026-08-08T06:11:00.000Z"),
        startedAt: new Date("2026-08-08T06:11:00.000Z"),
        status: "IN_PROGRESS",
        terminatedAt: null,
        terminationReason: null,
        updatedAt: new Date("2026-08-08T06:13:00.000Z"),
        visits: [
          {
            completedAt: null,
            section: "PRIMERA_VISITA",
            startedAt: new Date("2026-08-08T06:11:00.000Z"),
            status: "IN_PROGRESS",
            updatedAt: new Date("2026-08-08T06:13:00.000Z")
          }
        ]
      },
      secondFragranceRightArm: "583",
      status: "IN_PROGRESS",
      studyParticipant: {
        accessTokens: [
          {
            id: "token-1",
            status: "ACTIVE"
          }
        ],
        participantConfirmation: {
          folio: "NAV-001"
        },
        rotationAssignment: {
          rotationCode: "ROT-1"
        }
      },
      updatedAt: new Date("2026-08-08T06:45:00.000Z")
    }
  ];

  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    hutParticipant: {
      findMany: async () => participants
    },
    study: {
      findUnique: async () => study
    }
  } as unknown as Parameters<typeof createHutOperationsRepository>[0];
}
