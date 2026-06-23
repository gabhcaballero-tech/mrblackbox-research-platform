export {
  participantPersonalDataSchema,
  participantProfileSchema,
  participantProfileStatusSchema,
  studyParticipantOperationalStatusSchema,
  studyParticipantSchema,
  studyParticipantScreeningStatusSchema
} from "./schemas";
export type {
  ParticipantPersonalData,
  ParticipantProfile,
  ParticipantProfileStatus,
  StudyParticipant,
  StudyParticipantOperationalStatus,
  StudyParticipantScreeningStatus
} from "./schemas";

export const participantsModule = {
  key: "participants",
  status: "planned",
  description: "Boundary for personal profiles and study-specific participation records."
} as const;
