export {
  calculateParticipantActivities,
  calculateParticipantActivityOccurrences,
  createDefaultMeasurementSchedules,
  DEFAULT_ACTIVITY_OCCURRENCE_KEY,
  DEFAULT_MEASUREMENT_OFFSETS_MINUTES,
  evaluateApplicationTimeCorrection,
  getScheduledActivityStatus,
  validateUniqueActivityOccurrences
} from "./scheduler";
export type {
  ActivityOccurrenceInput,
  ActivityOccurrenceValidationResult,
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
