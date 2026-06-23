export {
  calculateParticipantActivities,
  createDefaultMeasurementSchedules,
  DEFAULT_MEASUREMENT_OFFSETS_MINUTES,
  evaluateApplicationTimeCorrection,
  getScheduledActivityStatus
} from "./scheduler";
export type {
  ActivityWindowConfig,
  ApplicationTimeCorrectionResult
} from "./scheduler";
export {
  activityAnchorEventSchema,
  activityScheduleSchema,
  activityStatusSchema,
  activityTypeSchema,
  applicationTimeCorrectionRequestSchema,
  participantActivitySchema
} from "./schemas";
export type {
  ActivityAnchorEvent,
  ActivitySchedule,
  ActivityStatus,
  ActivityType,
  ApplicationTimeCorrectionRequest,
  ParticipantActivity
} from "./schemas";

export const activitiesModule = {
  key: "activities",
  status: "planned",
  description: "Boundary for scheduled activities and application time correction rules."
} as const;
