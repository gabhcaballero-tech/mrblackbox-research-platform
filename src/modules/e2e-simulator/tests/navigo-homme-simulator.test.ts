import { describe, expect, it } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "@/modules/screener";
import { NAVIGO_HUT_ACCESS_QUESTION_ID } from "@/modules/screener/study-overrides";
import { createFixedSimulationClock } from "../clock";
import { formatSimulationPhase2Report, formatSimulationPrecheckReport } from "../report";
import {
  createDefaultSimulatorServiceCatalog,
  runNavigoHommeSimulationPhase2,
  runNavigoHommeSimulationPrecheck
} from "../navigo-homme-simulator";
import { NAVIGO_HOMME_SIMULATION_STUDY_CODE, createNavigoHommeSimulationFixtures } from "../fixtures";
import type {
  NavigoHommeSimulationExecutionPort,
  NavigoHommeSimulatorRepository,
  NavigoHommeSimulatorServiceCatalog
} from "../types";

describe("Navigo Homme E2E simulator precheck", () => {
  it("validates the safe precheck path without writing data", async () => {
    const report = await runNavigoHommeSimulationPrecheck({
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.simulationMode).toBe(true);
    expect(report.status).toBe("OK");
    expect(report.study?.code).toBe(NAVIGO_HOMME_SIMULATION_STUDY_CODE);
    expect(report.screenerDefinition?.questions.some((question) => question.id === NAVIGO_HUT_ACCESS_QUESTION_ID)).toBe(
      false
    );
    expect(report.sections.map((section) => section.title)).toEqual([
      "ESTUDIO",
      "SCREENING",
      "ROTACIONES",
      "CTL",
      "NAVIGO",
      "HUT"
    ]);
  });

  it("reports a blocked study when the study code is missing", async () => {
    const report = await runNavigoHommeSimulationPrecheck({
      repository: {
        async getStudyByCode() {
          return null;
        }
      },
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.status).toBe("BLOCKED");
    expect(sectionStatus(report, "ESTUDIO")).toBe("BLOCKED");
    expect(sectionStatus(report, "SCREENING")).toBe("BLOCKED");
  });

  it("reports missing rotation fixtures without invoking production flows", async () => {
    const fixtures = createNavigoHommeSimulationFixtures();
    fixtures.rotations.ctl.triangular2Verify = "";

    const report = await runNavigoHommeSimulationPrecheck({
      fixtures,
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.status).toBe("BLOCKED");
    expect(sectionStatus(report, "ROTACIONES")).toBe("BLOCKED");
    expect(
      report.sections
        .find((section) => section.title === "ROTACIONES")
        ?.checks.find((check) => check.code === "rotation.ctl_triangular")?.status
    ).toBe("BLOCKED");
  });

  it("formats a readable in-memory report", async () => {
    const report = await runNavigoHommeSimulationPrecheck({
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(formatSimulationPrecheckReport(report)).toContain("SIMULACION PRECHECK");
    expect(formatSimulationPrecheckReport(report)).toContain("SCREENING:");
    expect(formatSimulationPrecheckReport(report)).toContain("NAVIGO:");
  });

  it("keeps the default service catalog available for the implementation phase", () => {
    const catalog = createDefaultSimulatorServiceCatalog();

    expect(catalog.screening.canCreateAttempt).toBe(true);
    expect(catalog.ctl.canClaimFolio).toBe(true);
    expect(catalog.navigo.canRegisterInitialApplication).toBe(true);
    expect(catalog.hut.canEnsurePhaseCodes).toBe(true);
  });

  it("ships a safe deterministic participant fixture", () => {
    expect(createNavigoHommeSimulationFixtures().participant.externalReference).toBe("SIM-NAV-001");
  });

  it("runs phase 2 with the fixture executor and returns the expected partial report", async () => {
    const report = await runNavigoHommeSimulationPhase2({
      clock: createFixedSimulationClock(new Date("2026-08-07T14:00:00.000Z")),
      executor: createFixtureExecutor(),
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.simulationMode).toBe(true);
    expect(report.status).toBe("OK");
    expect(report.participant).toMatchObject({
      folio: "SIM-NAV-001",
      screeningStatus: "PASSED"
    });
    expect(report.participant?.referenceCodes).toHaveLength(3);
    expect(report.rotations).toMatchObject({
      ctl: { ready: true },
      hut: { ready: true },
      navigo: { ready: true }
    });
    expect(report.readiness).toMatchObject({
      candidateHut: true,
      ctlReady: true,
      rotationsComplete: true
    });
  });

  it("uses the simulated clock to preview Navigo activity times", async () => {
    const report = await runNavigoHommeSimulationPhase2({
      clock: createFixedSimulationClock(new Date("2026-08-07T14:00:00.000Z")),
      executor: createFixtureExecutor(),
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.activitySchedulePreview.map((item) => [item.activityCode, item.expectedAt.toISOString()])).toEqual([
      ["T3_HORAS", "2026-08-07T17:00:00.000Z"],
      ["T4_5_HORAS", "2026-08-07T18:30:00.000Z"],
      ["T6_HORAS", "2026-08-07T20:00:00.000Z"]
    ]);
  });

  it("keeps phase 2 isolated from real data by requiring an explicit execution port", async () => {
    const calls: string[] = [];
    const report = await runNavigoHommeSimulationPhase2({
      executor: createFixtureExecutor(calls),
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });

    expect(report.status).toBe("OK");
    expect(calls).toEqual(["createScreeningParticipant", "applyRotationFixtures", "validateInitialReadiness"]);
  });

  it("formats the phase 2 report with the requested operational blocks", async () => {
    const report = await runNavigoHommeSimulationPhase2({
      executor: createFixtureExecutor(),
      repository: repositoryWithStudy(),
      serviceCatalog: createPassingServiceCatalog()
    });
    const body = formatSimulationPhase2Report(report);

    expect(body).toContain("SIMULACION FASE 2");
    expect(body).toContain("Participante: SIM-NAV-001");
    expect(body).toContain("SCREENING:");
    expect(body).toContain("FOLIO:");
    expect(body).toContain("CODIGOS:");
    expect(body).toContain("ROTACION:");
    expect(body).toContain("CTL:");
  });
});

function repositoryWithStudy(): NavigoHommeSimulatorRepository {
  return {
    async getStudyByCode(studyCode) {
      return {
        activeScreenerDefinitionJson: baseScreenerDefinition(),
        code: studyCode,
        id: "study-navigo",
        name: "FMASCULINA NAVIGO 2026",
        status: "ACTIVE"
      };
    }
  };
}

function baseScreenerDefinition(): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "CONSENTIMIENTO",
        options: [
          {
            actions: [{ type: "CONTINUE" }],
            isOther: false,
            label: "Si",
            order: 1,
            otherTextRequired: false,
            value: "SI"
          }
        ],
        order: 1,
        required: true,
        text: "Acepta participar?",
        type: "SINGLE_CHOICE",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Screener Navigo"
  });
}

function createPassingServiceCatalog(): NavigoHommeSimulatorServiceCatalog {
  return {
    ctl: {
      canClaimFolio: true,
      canCompleteCtl: true,
      canCreateInterviewerCode: true,
      canSaveAnswers: true
    },
    hut: {
      canCreateParticipant: true,
      canCreateRegistrationSlot: true,
      canEnsurePhaseCodes: true,
      canValidatePhase: true
    },
    navigo: {
      canCreateActivities: true,
      canCreateToken: true,
      canRegisterInitialApplication: true,
      canReleaseParticipant: true
    },
    screening: {
      canCreateAttempt: true,
      canSaveAnswers: true
    }
  };
}

function sectionStatus(
  report: Awaited<ReturnType<typeof runNavigoHommeSimulationPrecheck>>,
  title: string
) {
  return report.sections.find((section) => section.title === title)?.status;
}

function createFixtureExecutor(calls: string[] = []): NavigoHommeSimulationExecutionPort {
  return {
    async applyRotationFixtures() {
      calls.push("applyRotationFixtures");
      return {
        ctl: {
          ready: true,
          triangularAssignmentId: "ctl-triangular-sim-1"
        },
        hut: {
          hutParticipantId: "hut-participant-sim-1",
          ready: true,
          registrationSlotId: "hut-slot-sim-1"
        },
        navigo: {
          armAssignmentCount: 2,
          ready: true,
          rotationAssignmentId: "rotation-sim-1"
        }
      };
    },
    async createScreeningParticipant({ fixtures }) {
      calls.push("createScreeningParticipant");
      return {
        confirmationId: "confirmation-sim-1",
        folio: fixtures.participant.externalReference,
        participantId: "study-participant-sim-1",
        participantName: fixtures.participant.name,
        referenceCodes: [
          { generated: true, slot: 1 },
          { generated: true, slot: 2 },
          { generated: true, slot: 3 }
        ],
        screeningAttemptId: "screening-attempt-sim-1",
        screeningStatus: "PASSED"
      };
    },
    async validateInitialReadiness() {
      calls.push("validateInitialReadiness");
      return {
        candidateHut: true,
        ctlReady: true,
        reasons: ["CTL listo para reclamar"],
        rotationsComplete: true
      };
    }
  };
}
