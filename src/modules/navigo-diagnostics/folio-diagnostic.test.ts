import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFolioDiagnosticReport,
  type FolioDiagnosticSnapshot
} from "./folio-diagnostic";

const now = new Date("2026-08-06T18:00:00.000Z");

describe("navigo folio diagnostic", () => {
  it("marks a fully connected folio as ready", () => {
    const report = buildFolioDiagnosticReport(completeSnapshot());

    expect(report.e2eStatus).toBe("LISTO");
    expect(blockStatus(report, "SCREENING")).toBe("OK");
    expect(blockStatus(report, "ROTACIONES")).toBe("OK");
    expect(blockStatus(report, "CTL")).toBe("OK");
    expect(blockStatus(report, "NAVIGO")).toBe("OK");
    expect(blockStatus(report, "HUT")).toBe("OK");
    expect(itemValue(report, "Codigo slot 1")).toBe("Existe");
    expect(itemValue(report, "HUT_ACCESO_CORRIDO")).toBe("SI - candidato HUT");
    expect(itemValue(report, "Navigo primera fragancia")).toBe("Existe");
    expect(report.technicalDetails).toBeNull();
  });

  it("only includes real rotation values in technical details when requested", () => {
    const report = buildFolioDiagnosticReport(completeSnapshot(), { includeTechnicalDetail: true });

    expect(itemValue(report, "Navigo primera fragancia")).toBe("Existe");
    expect(itemValue(report, "CTL PR1")).toBe("Existe");
    expect(itemValue(report, "HUT EVA1")).toBe("Existe");
    expect(report.technicalDetails).toMatchObject({
      ctlTriangular: {
        triangular1: {
          pr1: "247",
          pr2: "583",
          pr3: "912",
          veri1: "583"
        },
        triangular2: {
          pr4: "247",
          pr5: "912",
          pr6: "583",
          veri2: "247"
        }
      },
      hut: {
        eva1: "247",
        eva2: "583",
        source: "HutRegistrationSlot"
      },
      navigo: {
        firstFragrance: "247",
        firstFragranceArm: "Brazo izquierdo",
        firstFragranceApplicationOrder: 1,
        source: "ParticipantRotationAssignment",
        secondFragrance: "583",
        secondFragranceArm: "Brazo derecho",
        secondFragranceApplicationOrder: 2
      }
    });
    expect(report.technicalDetails?.ctlTriangular.source).toBe("CtlTriangularRotationAssignment");
  });

  it("prefers CTL triangular snapshot over the current assignment for technical audit", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.studyParticipant.ctlSessions = [
      {
        ctlInterviewerCodeId: "ika-1",
        id: "session-1",
        status: "COMPLETED",
        triangularRotationSnapshot: {
          assignmentId: "old-assignment",
          triangular1: { pr1: "101", pr2: "102", pr3: "103", verify: "102" },
          triangular2: { pr1: "201", pr2: "202", pr3: "203", verify: "201" }
        }
      }
    ];

    const report = buildFolioDiagnosticReport(snapshot, { includeTechnicalDetail: true });

    expect(report.technicalDetails?.ctlTriangular.source).toBe("CtlSession snapshot");
    expect(report.technicalDetails?.ctlTriangular.triangular1).toMatchObject({
      pr1: "101",
      pr2: "102",
      pr3: "103",
      veri1: "102"
    });
    expect(report.technicalDetails?.ctlTriangular.triangular2).toMatchObject({
      pr4: "201",
      pr5: "202",
      pr6: "203",
      veri2: "201"
    });
  });

  it("shows clear source labels for a participant without rotations", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.studyParticipant.rotationAssignment = null;
    snapshot.confirmation!.studyParticipant.ctlTriangularRotationAssignment = null;
    snapshot.confirmation!.studyParticipant.hutParticipant = null;

    const report = buildFolioDiagnosticReport(snapshot, { includeTechnicalDetail: true });

    expect(report.technicalDetails).toMatchObject({
      ctlTriangular: { source: "No importado" },
      hut: { source: "No importado" },
      navigo: { source: "No asignado" }
    });
    expect(report.technicalDetails?.navigo.firstFragrance).toBeNull();
    expect(report.technicalDetails?.hut.eva1).toBeNull();
  });

  it("labels historical CTL sessions without snapshot as missing snapshot", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.studyParticipant.ctlTriangularRotationAssignment = null;
    snapshot.confirmation!.studyParticipant.ctlSessions = [
      {
        ctlInterviewerCodeId: null,
        id: "historical-session",
        status: "COMPLETED",
        triangularRotationSnapshot: null
      }
    ];

    const report = buildFolioDiagnosticReport(snapshot, { includeTechnicalDetail: true });

    expect(report.technicalDetails?.ctlTriangular.source).toBe("Sin snapshot");
  });

  it("does not expose access tokens or full WhatsApp/reference codes in the diagnostic report", () => {
    const report = buildFolioDiagnosticReport(completeSnapshot(), { includeTechnicalDetail: true });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("token-1");
    expect(serialized).not.toContain("CODE-SLOT");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("codeHash");
  });

  it("blocks CTL when triangular rotation is missing", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.studyParticipant.ctlTriangularRotationAssignment = null;

    const report = buildFolioDiagnosticReport(snapshot);

    expect(report.e2eStatus).toBe("BLOQUEADO");
    expect(itemValue(report, "Puede aparecer en CTL")).toBe("NO - falta rotacion triangular CTL");
    expect(report.suggestions).toContain("CTL triangular asignada: Falta");
  });

  it("keeps HUT as not applicable when the screening answer is not affirmative", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.screeningAttempt.answers = [{ answerJson: { value: "NO" }, questionId: "HUT_ACCESO_CORRIDO" }];
    snapshot.confirmation!.studyParticipant.hutParticipant = null;

    const report = buildFolioDiagnosticReport(snapshot);

    expect(blockStatus(report, "HUT")).toBe("OK");
    expect(itemValue(report, "Preparado para HUT")).toBe("No aplica: HUT_ACCESO_CORRIDO no es SI");
  });

  it("blocks HUT candidate when phase codes are missing", () => {
    const snapshot = completeSnapshot();
    snapshot.confirmation!.studyParticipant.hutParticipant!.phaseCodes = [
      { phase: "COLOCACION", slot: 1, status: "GENERATED" }
    ];

    const report = buildFolioDiagnosticReport(snapshot);

    expect(blockStatus(report, "HUT")).toBe("BLOCKED");
    expect(itemValue(report, "PhaseCode REGRESO_1")).toBe("Falta");
    expect(itemValue(report, "PhaseCode REGRESO_2")).toBe("Falta");
  });

  it("validates the optional IKA code against the study and responsible user", () => {
    const snapshot = completeSnapshot({
      ctlInterviewerCode: {
        createdByUserId: null,
        expiresAt: null,
        id: "ika-1",
        label: "Encuestador 1",
        status: "ACTIVE",
        studyId: "study-navigo"
      }
    });

    const report = buildFolioDiagnosticReport(snapshot);

    expect(itemValue(report, "Codigo IKA")).toBe("Activo - Encuestador 1");
    expect(itemValue(report, "Codigo IKA createdByUserId")).toBe("Falta");
    expect(report.e2eStatus).toBe("BLOQUEADO");
  });

  it("keeps technical detail mode restricted to ADMIN in the admin page", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src", "app", "admin", "studies", "[studyId]", "diagnostico-folio", "page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain('const canViewTechnicalDetail = actor.role === "ADMIN"');
    expect(pageSource).toContain("const includeTechnicalDetail = canViewTechnicalDetail && query.detalleTecnico === \"1\"");
  });

  it("loads StudyArm labels with the current Prisma field", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "modules", "navigo-diagnostics", "folio-diagnostic.ts"),
      "utf8"
    );

    expect(source).toContain("studyArm: { select: { label: true } }");
    expect(source).not.toContain("studyArm: { select: { name: true } }");
    expect(source).not.toContain("studyArm?.name");
  });
});

function blockStatus(report: ReturnType<typeof buildFolioDiagnosticReport>, title: string) {
  return report.blocks.find((block) => block.title === title)?.status;
}

function itemValue(report: ReturnType<typeof buildFolioDiagnosticReport>, label: string) {
  return report.blocks.flatMap((block) => block.items).find((item) => item.label === label)?.value;
}

function completeSnapshot(overrides: Partial<FolioDiagnosticSnapshot> = {}): FolioDiagnosticSnapshot {
  return {
    confirmation: {
      folio: "NAV-106",
      referenceCodes: [{ slot: 1 }, { slot: 2 }, { slot: 3 }],
      screeningAttempt: {
        answers: [{ answerJson: { value: "SI" }, questionId: "HUT_ACCESO_CORRIDO" }],
        id: "attempt-1",
        status: "PASSED"
      },
      studyParticipant: {
        accessTokens: [
          {
            expiresAt: new Date("2026-08-20T18:00:00.000Z"),
            id: "token-1",
            status: "ACTIVE"
          }
        ],
        activities: [
          activity("T0_15_MIN"),
          activity("T3_HORAS"),
          activity("T4_5_HORAS"),
          activity("T6_HORAS"),
          activity("T8_HORAS")
        ],
        applicationStartedAt: new Date("2026-08-06T17:00:00.000Z"),
        ctlSessions: [],
        ctlTriangularRotationAssignment: {
          triangular1Pr1: "247",
          triangular1Pr2: "583",
          triangular1Pr3: "912",
          triangular1Verify: "583",
          triangular2Pr1: "247",
          triangular2Pr2: "912",
          triangular2Pr3: "583",
          triangular2Verify: "247"
        },
        hutParticipant: {
          firstFragranceLeftArm: "247",
          id: "hut-1",
          phaseCodes: [
            { phase: "COLOCACION", slot: 1, status: "GENERATED" },
            { phase: "REGRESO_1", slot: 2, status: "GENERATED" },
            { phase: "REGRESO_2", slot: 3, status: "GENERATED" }
          ],
          registrationSlot: {
            firstFragranceLeftArm: "247",
            secondFragranceRightArm: "583",
            status: "AVAILABLE"
          },
          secondFragranceRightArm: "583",
          status: "NOT_STARTED",
          studyParticipantId: "participant-1"
        },
        id: "participant-1",
        participantProfile: {
          name: "Participante Demo"
        },
        rotationAssignment: {
          arms: [
            {
              applicationOrder: 1,
              participantVisibleLabel: "Brazo izquierdo",
              studyArm: { label: "Brazo izquierdo" },
              studyProduct: { internalCode: "247" }
            },
            {
              applicationOrder: 2,
              participantVisibleLabel: "Brazo derecho",
              studyArm: { label: "Brazo derecho" },
              studyProduct: { internalCode: "583" }
            }
          ],
          rotationCode: "ROT-1"
        },
        screeningStatus: "PASSED"
      }
    },
    ctlInterviewerCode: null,
    folio: "NAV-106",
    hutParticipantByFolio: null,
    now,
    schedules: [
      schedule("T0_15_MIN", 15),
      schedule("T3_HORAS", 180),
      schedule("T4_5_HORAS", 270),
      schedule("T6_HORAS", 360),
      schedule("T8_HORAS", 480)
    ],
    study: {
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-navigo",
      name: "Navigo"
    },
    ...overrides
  };
}

function schedule(code: string, offsetMinutes: number) {
  return {
    code,
    offsetMinutes,
    status: "ACTIVE"
  };
}

function activity(code: string) {
  return {
    activitySchedule: { code },
    status: "PENDING"
  };
}
