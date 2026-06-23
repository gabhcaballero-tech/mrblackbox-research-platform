import { describe, expect, it } from "vitest";
import { measurementSchedules } from "@/modules/testing/fixtures";
import {
  calculateParticipantActivities,
  calculateParticipantActivityOccurrences,
  evaluateApplicationTimeCorrection,
  validateUniqueActivityOccurrences
} from "./scheduler";

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
    expect(activities.every((activity) => activity.occurrenceKey === "DEFAULT")).toBe(true);
  });

  it("calculates three recurring video activities for DAY_1, DAY_2, and DAY_3", () => {
    const applicationStartedAt = new Date("2026-06-22T12:00:00.000Z");
    const videoSchedule = {
      id: "video-evidence",
      type: "video_evidence" as const,
      name: "Video futuro",
      anchorEvent: "application_started" as const,
      offsetMinutes: 0,
      windowStartsMinutes: 0,
      windowEndsMinutes: 720,
      sortOrder: 10,
      status: "active" as const
    };
    const activities = calculateParticipantActivityOccurrences(
      applicationStartedAt,
      videoSchedule,
      [
        { occurrenceKey: "DAY_1", offsetMinutes: 1_440 },
        { occurrenceKey: "DAY_2", offsetMinutes: 2_880 },
        { occurrenceKey: "DAY_3", offsetMinutes: 4_320 }
      ],
      applicationStartedAt
    );

    expect(activities.map((activity) => activity.occurrenceKey)).toEqual([
      "DAY_1",
      "DAY_2",
      "DAY_3"
    ]);
    expect(activities.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-06-23T12:00:00.000Z",
      "2026-06-24T12:00:00.000Z",
      "2026-06-25T12:00:00.000Z"
    ]);
  });

  it("prevents duplicate activity schedule and occurrenceKey values", () => {
    const result = validateUniqueActivityOccurrences([
      {
        activityScheduleId: "video-evidence",
        occurrenceKey: "DAY_1"
      },
      {
        activityScheduleId: "video-evidence",
        occurrenceKey: "DAY_1"
      }
    ]);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.duplicateKeys).toEqual(["video-evidence:DAY_1"]);
    }
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
