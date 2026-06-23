import { z } from "zod";

export const participantProfileStatusSchema = z.enum(["active", "inactive", "merged"]);

export const participantPersonalDataSchema = z
  .object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    age: z.number().int().min(0).max(130).optional(),
    gender: z.string().trim().min(1).optional()
  })
  .strict();

export const participantProfileSchema = z
  .object({
    id: z.string().trim().min(1),
    externalReference: z.string().trim().min(1).optional(),
    personalData: participantPersonalDataSchema,
    status: participantProfileStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const studyParticipantOperationalStatusSchema = z.enum([
  "created",
  "screening_started",
  "screening_passed",
  "screening_terminated",
  "assigned",
  "in_progress",
  "completed",
  "withdrawn"
]);

export const studyParticipantScreeningStatusSchema = z.enum([
  "not_started",
  "started",
  "passed",
  "terminated",
  "incomplete"
]);

export const studyParticipantSchema = z
  .object({
    id: z.string().trim().min(1),
    participantProfileId: z.string().trim().min(1),
    studyId: z.string().trim().min(1),
    operationalStatus: studyParticipantOperationalStatusSchema,
    screeningStatus: studyParticipantScreeningStatusSchema,
    applicationStartedAt: z.string().datetime().optional(),
    applicationStartedAtRegisteredByUserId: z.string().trim().min(1).optional(),
    applicationStartedAtRegisteredAt: z.string().datetime().optional(),
    applicationStartedAtCorrectedAt: z.string().datetime().optional(),
    createdByUserId: z.string().trim().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export type ParticipantPersonalData = z.infer<typeof participantPersonalDataSchema>;
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;
export type ParticipantProfileStatus = z.infer<typeof participantProfileStatusSchema>;
export type StudyParticipant = z.infer<typeof studyParticipantSchema>;
export type StudyParticipantOperationalStatus = z.infer<
  typeof studyParticipantOperationalStatusSchema
>;
export type StudyParticipantScreeningStatus = z.infer<
  typeof studyParticipantScreeningStatusSchema
>;
