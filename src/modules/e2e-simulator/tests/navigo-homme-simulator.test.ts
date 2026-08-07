import { describe, expect, it } from "vitest";
import { screenerDefinitionSchema, type ScreenerDefinition } from "@/modules/screener";
import { NAVIGO_HUT_ACCESS_QUESTION_ID } from "@/modules/screener/study-overrides";
import { formatSimulationPrecheckReport } from "../report";
import {
  createDefaultSimulatorServiceCatalog,
  runNavigoHommeSimulationPrecheck
} from "../navigo-homme-simulator";
import { NAVIGO_HOMME_SIMULATION_STUDY_CODE, createNavigoHommeSimulationFixtures } from "../fixtures";
import type { NavigoHommeSimulatorRepository, NavigoHommeSimulatorServiceCatalog } from "../types";

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
      true
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
