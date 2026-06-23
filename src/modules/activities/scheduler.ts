import {
  activityScheduleSchema,
  applicationTimeCorrectionRequestSchema,
  type ActivitySchedule,
  type ActivityStatus,
  type ApplicationTimeCorrectionRequest,
  type ParticipantActivity
} from "./schemas";

export type ActivityWindowConfig = {
  windowStartsMinutes: number;
  windowEndsMinutes: number;
};

export type ApplicationTimeCorrectionResult = {
  allowed: boolean;
  requiresAudit: boolean;
  recalculatesPendingActivities: boolean;
  code:
    | "admin_correction_requires_audit"
    | "supervisor_correction_before_activity_start"
    | "supervisor_correction_denied_activity_started"
    | "role_not_allowed";
  message: string;
};

export type ActivityOccurrenceInput = {
  occurrenceKey: string;
  offsetMinutes: number;
};

export type ActivityOccurrenceValidationResult =
  | {
      success: true;
    }
  | {
      success: false;
      duplicateKeys: string[];
    };

export const DEFAULT_MEASUREMENT_OFFSETS_MINUTES = [15, 120, 240, 480] as const;
export const DEFAULT_ACTIVITY_OCCURRENCE_KEY = "DEFAULT";

export function createDefaultMeasurementSchedules(
  windowConfig: ActivityWindowConfig
): ActivitySchedule[] {
  return DEFAULT_MEASUREMENT_OFFSETS_MINUTES.map((offsetMinutes, index) => ({
    id: `measurement-${offsetMinutes}`,
    type: "questionnaire_measurement",
    name: `Measurement at ${offsetMinutes} minutes`,
    anchorEvent: "application_started",
    offsetMinutes,
    windowStartsMinutes: windowConfig.windowStartsMinutes,
    windowEndsMinutes: windowConfig.windowEndsMinutes,
    sortOrder: index + 1,
    status: "active"
  }));
}

export function calculateParticipantActivities(
  applicationStartedAt: Date,
  schedulesInput: ActivitySchedule[],
  now: Date = applicationStartedAt
): ParticipantActivity[] {
  return schedulesInput
    .map((scheduleInput) => activityScheduleSchema.parse(scheduleInput))
    .filter((schedule) => schedule.status === "active")
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((schedule) => {
      const scheduledAt = addMinutes(applicationStartedAt, schedule.offsetMinutes);
      const availableFrom = addMinutes(scheduledAt, schedule.windowStartsMinutes);
      const availableUntil = addMinutes(scheduledAt, schedule.windowEndsMinutes);

      return {
        id: `activity-${schedule.id}`,
        activityScheduleId: schedule.id,
        occurrenceKey: DEFAULT_ACTIVITY_OCCURRENCE_KEY,
        scheduledAt,
        availableFrom,
        availableUntil,
        status: getScheduledActivityStatus(now, availableFrom, availableUntil)
      };
    });
}

export function calculateParticipantActivityOccurrences(
  applicationStartedAt: Date,
  scheduleInput: ActivitySchedule,
  occurrences: ActivityOccurrenceInput[],
  now: Date = applicationStartedAt
): ParticipantActivity[] {
  const schedule = activityScheduleSchema.parse(scheduleInput);

  return occurrences.map((occurrence) => {
    const scheduledAt = addMinutes(applicationStartedAt, occurrence.offsetMinutes);
    const availableFrom = addMinutes(scheduledAt, schedule.windowStartsMinutes);
    const availableUntil = addMinutes(scheduledAt, schedule.windowEndsMinutes);

    return {
      id: `activity-${schedule.id}-${occurrence.occurrenceKey}`,
      activityScheduleId: schedule.id,
      occurrenceKey: occurrence.occurrenceKey,
      scheduledAt,
      availableFrom,
      availableUntil,
      status: getScheduledActivityStatus(now, availableFrom, availableUntil)
    };
  });
}

export function validateUniqueActivityOccurrences(
  activities: Array<Pick<ParticipantActivity, "activityScheduleId" | "occurrenceKey">>
): ActivityOccurrenceValidationResult {
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  for (const activity of activities) {
    const key = `${activity.activityScheduleId}:${activity.occurrenceKey}`;

    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      continue;
    }

    seenKeys.add(key);
  }

  if (duplicateKeys.size > 0) {
    return {
      success: false,
      duplicateKeys: [...duplicateKeys]
    };
  }

  return {
    success: true
  };
}

export function getScheduledActivityStatus(
  now: Date,
  availableFrom: Date,
  availableUntil: Date
): ActivityStatus {
  if (now < availableFrom) {
    return "pending";
  }

  if (now > availableUntil) {
    return "expired";
  }

  return "available";
}

export function evaluateApplicationTimeCorrection(
  requestInput: ApplicationTimeCorrectionRequest
): ApplicationTimeCorrectionResult {
  const request = applicationTimeCorrectionRequestSchema.parse(requestInput);
  const hasStartedActivity = request.activities.some((activity) => {
    return (
      activity.actualStartedAt !== undefined ||
      activity.status === "started" ||
      activity.status === "incomplete" ||
      activity.status === "completed"
    );
  });

  if (request.role === "admin") {
    return {
      allowed: true,
      requiresAudit: true,
      recalculatesPendingActivities: !hasStartedActivity,
      code: "admin_correction_requires_audit",
      message: "Admin can correct application time, with audit required."
    };
  }

  if (request.role === "supervisor") {
    if (hasStartedActivity) {
      return {
        allowed: false,
        requiresAudit: false,
        recalculatesPendingActivities: false,
        code: "supervisor_correction_denied_activity_started",
        message: "Supervisor can correct application time only before any activity starts."
      };
    }

    return {
      allowed: true,
      requiresAudit: true,
      recalculatesPendingActivities: true,
      code: "supervisor_correction_before_activity_start",
      message: "Supervisor can correct application time before any activity starts."
    };
  }

  return {
    allowed: false,
    requiresAudit: false,
    recalculatesPendingActivities: false,
    code: "role_not_allowed",
    message: "This role cannot correct application time."
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
