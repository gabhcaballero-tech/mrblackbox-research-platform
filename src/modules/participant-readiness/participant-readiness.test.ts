import { describe, expect, it } from "vitest";
import { calculateParticipantOperationalReadiness } from "./service";
import type { ParticipantReadinessInput } from "./types";

describe("participant operational readiness", () => {
  it("observes a CLT participant completed and waiting for Navigo preparation", () => {
    const readiness = calculateParticipantOperationalReadiness({
      ...baseCltParticipant(),
      accessTokens: [],
      activities: [],
      applicationStartedAt: new Date("2026-08-08T06:30:00.000Z"),
      ctlSessions: [{ status: "COMPLETED" }]
    });

    expect(readiness.protocolType).toBe("CLT_NAVIGO_HUT");
    expect(readiness.currentStage).toBe("CLT_COMPLETED");
    expect(readiness.nextAllowedStage).toBe("NAVIGO");
    expect(readiness.stages.navigo.ready).toBe(false);
    expect(readiness.blockingReasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["ACTIVE_TOKEN_MISSING", "ACTIVITIES_MISSING"])
    );
  });

  it("observes an active Navigo participant", () => {
    const readiness = calculateParticipantOperationalReadiness({
      ...baseCltParticipant(),
      accessTokens: [{ expiresAt: new Date("2099-01-01T00:00:00.000Z"), status: "ACTIVE" }],
      activities: [
        activity("T3_HORAS", "PENDING"),
        activity("T4_5_HORAS", "PENDING"),
        activity("T6_HORAS", "PENDING")
      ],
      applicationStartedAt: new Date("2026-08-08T06:30:00.000Z"),
      ctlSessions: [{ status: "COMPLETED" }],
      hutParticipant: null
    });

    expect(readiness.currentStage).toBe("NAVIGO_READY");
    expect(readiness.nextAllowedStage).toBe("NAVIGO");
    expect(readiness.stages.navigo.ready).toBe(true);
  });

  it("observes a HUT direct participant without requiring CLT or Navigo", () => {
    const readiness = calculateParticipantOperationalReadiness({
      ...baseHutDirectParticipant()
    });

    expect(readiness.protocolType).toBe("HUT_DIRECTO");
    expect(readiness.currentStage).toBe("SCREENING_COMPLETED");
    expect(readiness.nextAllowedStage).toBe("HUT");
    expect(readiness.stages.clt.status).toBe("NOT_APPLICABLE");
    expect(readiness.stages.navigo.status).toBe("NOT_APPLICABLE");
    expect(readiness.stages.hut.ready).toBe(true);
  });

  it("blocks a reserved HUT without operational identity", () => {
    const readiness = calculateParticipantOperationalReadiness({
      accessTokens: [],
      activities: [],
      ctlSessions: [],
      hutParticipant: {
        firstFragranceLeftArm: "247",
        id: "hut-reserve-143",
        name: "HUT-143",
        origin: "HUT_DIRECTO",
        phaseCodes: [],
        protocolVersion: "APPLICATION_PHOTO",
        secondFragranceRightArm: "583",
        status: "NOT_STARTED",
        studyParticipantId: null
      },
      id: null,
      participantConfirmation: null,
      screeningStatus: null
    });

    expect(readiness.protocolType).toBe("HUT_DIRECTO");
    expect(readiness.currentStage).toBe("NO_IDENTITY");
    expect(readiness.stages.hut.blockingReasons.map((reason) => reason.code)).toContain(
      "RESERVED_WITHOUT_OPERATIONAL_IDENTITY"
    );
  });

  it("reports legacy HUT phase codes as warnings without blocking the observation", () => {
    const readiness = calculateParticipantOperationalReadiness({
      ...baseCltParticipant(),
      accessTokens: [{ expiresAt: new Date("2099-01-01T00:00:00.000Z"), status: "ACTIVE" }],
      activities: [
        activity("T3_HORAS", "COMPLETED"),
        activity("T4_5_HORAS", "COMPLETED"),
        activity("T6_HORAS", "COMPLETED")
      ],
      applicationStartedAt: new Date("2026-08-08T06:30:00.000Z"),
      ctlSessions: [{ status: "COMPLETED" }],
      hutParticipant: {
        firstFragranceLeftArm: "247",
        id: "hut-legacy-1",
        name: "Participante legacy",
        origin: "CLT_HUT",
        phaseCodes: [
          { phase: "COLOCACION", status: "VALIDATED" },
          { phase: "REGRESO_2", status: "GENERATED" }
        ],
        protocolVersion: "APPLICATION_PHOTO",
        secondFragranceRightArm: "583",
        status: "BLOCK_1_IN_PROGRESS",
        studyParticipantId: "participant-1"
      }
    });

    expect(readiness.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["LEGACY_HUT_PHASE_CODES_USED", "LEGACY_REGRESO_2_CODE"])
    );
    expect(readiness.stages.hut.ready).toBe(true);
  });
});

function baseCltParticipant(): ParticipantReadinessInput {
  return {
    accessTokens: [],
    activities: [],
    applicationStartedAt: null,
    ctlSessions: [],
    ctlTriangularRotationAssignment: { id: "triangular-1" },
    hutParticipant: {
      firstFragranceLeftArm: "247",
      id: "hut-1",
      name: "Participante CLT HUT",
      origin: "CLT_HUT",
      phaseCodes: [],
      protocolVersion: "APPLICATION_PHOTO",
      secondFragranceRightArm: "583",
      status: "NOT_STARTED",
      studyParticipantId: "participant-1"
    },
    id: "participant-1",
    operationalStatus: "SCREENING_PASSED",
    participantConfirmation: {
      referenceCodes: [{ slot: 1 }, { slot: 2 }, { slot: 3 }],
      screeningAttempt: { status: "PASSED" }
    },
    participantScreeningReviews: [{ status: "APPROVED" }],
    rotationAssignment: {
      arms: [
        { applicationOrder: 1, studyProduct: { internalCode: "247" } },
        { applicationOrder: 2, studyProduct: { internalCode: "583" } }
      ]
    },
    screeningStatus: "PASSED"
  };
}

function baseHutDirectParticipant(): ParticipantReadinessInput {
  return {
    ...baseCltParticipant(),
    ctlSessions: [],
    ctlTriangularRotationAssignment: null,
    hutParticipant: {
      firstFragranceLeftArm: "247",
      id: "hut-direct-1",
      name: "Participante HUT Directo",
      origin: "HUT_DIRECTO",
      phaseCodes: [],
      protocolVersion: "APPLICATION_PHOTO",
      secondFragranceRightArm: "583",
      status: "NOT_STARTED",
      studyParticipantId: "participant-hut-direct"
    },
    id: "participant-hut-direct",
    rotationAssignment: null
  };
}

function activity(code: string, status: string) {
  return {
    activitySchedule: { code },
    status
  };
}
