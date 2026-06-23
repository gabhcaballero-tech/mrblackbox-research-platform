import { describe, expect, it } from "vitest";
import { measurementSchedules } from "@/modules/testing/fixtures";
import { calculateParticipantActivities, evaluateApplicationTimeCorrection } from "./scheduler";

describe("scheduled activities", () => {
  it("calculates activities at 15 minutes, 2 hours, 4 hours, and 8 hours", () => {
    const applicationStartedAt = new Date("2026-06-22T12:00:00.000Z");
    const activities = calculateParticipantActivities(
      applicationStartedAt,
      measurementSchedules,
      applicationStartedAt
    );

    expect(activities.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-06-22T12:15:00.000Z",
      "2026-06-22T14:00:00.000Z",
      "2026-06-22T16:00:00.000Z",
      "2026-06-22T20:00:00.000Z"
    ]);
  });

  it("applies application time correction rules by role and activity state", () => {
    const applicationStartedAt = new Date("2026-06-22T12:00:00.000Z");
    const correctedAt = new Date("2026-06-22T12:10:00.000Z");
    const pendingActivities = calculateParticipantActivities(
      applicationStartedAt,
      measurementSchedules,
      applicationStartedAt
    );
    const supervisorBeforeStart = evaluateApplicationTimeCorrection({
      role: "supervisor",
      previousApplicationStartedAt: applicationStartedAt,
      newApplicationStartedAt: correctedAt,
      reason: "Correccion de captura",
      activities: pendingActivities
    });
    const startedActivities = [
      {
        ...pendingActivities[0],
        status: "started" as const,
        actualStartedAt: new Date("2026-06-22T12:16:00.000Z")
      },
      ...pendingActivities.slice(1)
    ];
    const supervisorAfterStart = evaluateApplicationTimeCorrection({
      role: "supervisor",
      previousApplicationStartedAt: applicationStartedAt,
      newApplicationStartedAt: correctedAt,
      reason: "Correccion de captura",
      activities: startedActivities
    });
    const adminAfterStart = evaluateApplicationTimeCorrection({
      role: "admin",
      previousApplicationStartedAt: applicationStartedAt,
      newApplicationStartedAt: correctedAt,
      reason: "Correccion de captura",
      activities: startedActivities
    });

    expect(supervisorBeforeStart).toMatchObject({
      allowed: true,
      requiresAudit: true,
      recalculatesPendingActivities: true
    });
    expect(supervisorAfterStart).toMatchObject({
      allowed: false,
      requiresAudit: false,
      recalculatesPendingActivities: false
    });
    expect(adminAfterStart).toMatchObject({
      allowed: true,
      requiresAudit: true,
      recalculatesPendingActivities: false
    });
  });
});
