import { describe, expect, it } from "vitest";
import { validateQaE2eRun } from "./validator";

describe("qa e2e validator", () => {
  it("valida un run CLT_ONLY listo para CTL", async () => {
    const report = await validateQaE2eRun({
      now: new Date("2026-08-08T12:00:00.000Z"),
      prismaClient: createValidatorPrisma({
        run: baseRun({ scenario: "CLT_ONLY" })
      }) as never,
      runId: "run-1",
      studyId: "study-qa"
    });

    expect(report.status).toBe("PASS");
    expect(report.blocks.map((block) => block.title)).toEqual(["SCREENING", "ROTACIONES", "CTL DISPONIBLE"]);
  });

  it("valida un run CLT_NAVIGO con CTL completado, token y schedules", async () => {
    const report = await validateQaE2eRun({
      now: new Date("2026-08-08T12:00:00.000Z"),
      prismaClient: createValidatorPrisma({
        run: baseRun({
          scenario: "CLT_NAVIGO",
          studyParticipant: studyParticipant({
            accessTokens: [{ expiresAt: new Date("2026-08-09T12:00:00.000Z"), id: "token-1", status: "ACTIVE" }],
            ctlSessions: [
              {
                completedAt: new Date("2026-08-08T12:00:00.000Z"),
                id: "ctl-1",
                phaseProgress: [
                  { phase: "COLOCACION", status: "COMPLETED" },
                  { phase: "EVALUACION_1", status: "COMPLETED" },
                  { phase: "EVALUACION_2", status: "COMPLETED" }
                ],
                status: "COMPLETED"
              }
            ]
          })
        })
      }) as never,
      runId: "run-1",
      studyId: "study-qa"
    });

    expect(report.status).toBe("PASS");
    expect(report.links.navigoParticipant).toBe("/p/token-1/activities");
    expect(report.relatedIds.completedCtlSessionId).toBe("ctl-1");
  });

  it("marca FAIL cuando falta un phase code HUT en CLT_NAVIGO_HUT", async () => {
    const report = await validateQaE2eRun({
      now: new Date("2026-08-08T12:00:00.000Z"),
      prismaClient: createValidatorPrisma({
        run: baseRun({
          hutParticipant: hutParticipant({
            phaseCodes: [
              { id: "phase-1", phase: "COLOCACION", slot: 1, status: "GENERATED" },
              { id: "phase-2", phase: "REGRESO_1", slot: 2, status: "GENERATED" }
            ]
          }),
          scenario: "CLT_NAVIGO_HUT",
          studyParticipant: studyParticipant({
            accessTokens: [{ expiresAt: new Date("2026-08-09T12:00:00.000Z"), id: "token-1", status: "ACTIVE" }],
            ctlSessions: [
              {
                completedAt: new Date("2026-08-08T12:00:00.000Z"),
                id: "ctl-1",
                phaseProgress: [
                  { phase: "COLOCACION", status: "COMPLETED" },
                  { phase: "EVALUACION_1", status: "COMPLETED" },
                  { phase: "EVALUACION_2", status: "COMPLETED" }
                ],
                status: "COMPLETED"
              }
            ]
          })
        })
      }) as never,
      runId: "run-1",
      studyId: "study-qa"
    });

    expect(report.status).toBe("FAIL");
    expect(report.blocks.find((block) => block.title === "HUT")?.checks).toContainEqual(
      expect.objectContaining({
        cause: "Slots encontrados: 1, 2.",
        label: "Phase codes HUT slots 1,2,3 existen",
        status: "FAIL"
      })
    );
  });

  it("valida un run HUT_DIRECTO APPLICATION_PHOTO", async () => {
    const report = await validateQaE2eRun({
      now: new Date("2026-08-08T12:00:00.000Z"),
      prismaClient: createValidatorPrisma({
        run: baseRun({
          hutParticipant: hutParticipant({ origin: "HUT_DIRECTO" }),
          hutParticipantId: "hut-1",
          scenario: "HUT_DIRECTO",
          studyParticipant: null,
          studyParticipantId: null
        })
      }) as never,
      runId: "run-1",
      studyId: "study-qa"
    });

    expect(report.status).toBe("PASS");
    expect(report.blocks.map((block) => block.title)).toEqual(["HUT"]);
    expect(report.links.hutParticipant).toBe("/hut/p/hut-token-1");
  });
});

type FakeRun = Parameters<typeof baseRun>[0] & ReturnType<typeof baseRun>;

function createValidatorPrisma({ run }: { run: FakeRun }) {
  return {
    activitySchedule: {
      findMany: async () => [
        { code: "T3_HORAS", id: "schedule-t3", offsetMinutes: 180, status: "ACTIVE" },
        { code: "T4_5_HORAS", id: "schedule-t45", offsetMinutes: 270, status: "ACTIVE" },
        { code: "T6_HORAS", id: "schedule-t6", offsetMinutes: 360, status: "ACTIVE" }
      ]
    },
    qaParticipantRun: {
      findUnique: async () => run
    }
  };
}

function baseRun(input: Partial<{
  hutParticipant: ReturnType<typeof hutParticipant> | null;
  hutParticipantId: string | null;
  scenario: "CLT_NAVIGO" | "CLT_NAVIGO_HUT" | "CLT_ONLY" | "HUT_DIRECTO";
  studyParticipant: ReturnType<typeof studyParticipant> | null;
  studyParticipantId: string | null;
}> = {}) {
  return {
    hutParticipant: null,
    hutParticipantId: null,
    id: "run-1",
    reportJson: {
      links: { ctlPublic: "/ctl/FMASCULINA-NAVIGO-2026" },
      objects: {},
      qa: true
    },
    scenario: "CLT_ONLY" as const,
    status: "CREATED",
    studyId: "study-qa",
    studyParticipant: studyParticipant(),
    studyParticipantId: "participant-1",
    ...input
  };
}

function studyParticipant(input: Partial<{
  accessTokens: Array<{ expiresAt: Date; id: string; status: string }>;
  ctlSessions: Array<{
    completedAt: Date | null;
    id: string;
    phaseProgress: Array<{ phase: string; status: string }>;
    status: string;
  }>;
}> = {}) {
  return {
    accessTokens: [],
    ctlSessions: [],
    ctlTriangularRotationAssignment: { id: "triangular-1" },
    id: "participant-1",
    participantConfirmation: {
      folio: "QA-RUN1",
      id: "confirmation-1",
      referenceCodes: [
        { id: "ref-1", slot: 1 },
        { id: "ref-2", slot: 2 },
        { id: "ref-3", slot: 3 }
      ],
      screeningAttempt: {
        id: "screening-1",
        status: "PASSED"
      }
    },
    rotationAssignment: {
      arms: [
        { applicationOrder: 1, id: "arm-1" },
        { applicationOrder: 2, id: "arm-2" }
      ],
      id: "rotation-1"
    },
    screeningStatus: "PASSED",
    ...input
  };
}

function hutParticipant(input: Partial<{
  origin: string;
  phaseCodes: Array<{ id: string; phase: string; slot: number; status: string }>;
}> = {}) {
  return {
    folio: "QA-RUN1",
    id: "hut-1",
    origin: "CLT_HUT",
    phaseCodes: [
      { id: "phase-1", phase: "COLOCACION", slot: 1, status: "GENERATED" },
      { id: "phase-2", phase: "REGRESO_1", slot: 2, status: "GENERATED" },
      { id: "phase-3", phase: "REGRESO_2", slot: 3, status: "GENERATED" }
    ],
    protocolVersion: "APPLICATION_PHOTO",
    questionnaireAttempt: {
      id: "hut-attempt-1",
      status: "PENDING"
    },
    token: "hut-token-1",
    ...input
  };
}
