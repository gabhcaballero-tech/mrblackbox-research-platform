import { z } from "zod";
import { actorRoleSchema } from "@/shared/types/roles";

export const activityTypeSchema = z.enum([
  "questionnaire_measurement",
  "video_evidence",
  "internal_followup"
]);

export const activityAnchorEventSchema = z.literal("application_started");

export const activityStatusSchema = z.enum([
  "pending",
  "available",
  "started",
  "incomplete",
  "completed",
  "expired"
]);

export const activityScheduleSchema = z
  .object({
    id: z.string().trim().min(1),
    type: activityTypeSchema,
    name: z.string().trim().min(1),
    code: z.string().trim().min(1).optional(),
    anchorEvent: activityAnchorEventSchema,
    offsetMinutes: z.number().int().min(0),
    windowStartsMinutes: z.number().int(),
    windowEndsMinutes: z.number().int(),
    sortOrder: z.number().int().min(0),
    status: z.enum(["active", "inactive"]).default("active")
  })
  .strict()
  .refine((schedule) => schedule.windowStartsMinutes <= schedule.windowEndsMinutes, {
    message: "Activity window start must be before or equal to window end."
  });

export const participantActivitySchema = z
  .object({
    id: z.string().trim().min(1),
    studyParticipantId: z.string().trim().min(1).optional(),
    activityScheduleId: z.string().trim().min(1),
    occurrenceKey: z.string().trim().min(1),
    scheduledAt: z.date(),
    availableFrom: z.date(),
    availableUntil: z.date(),
    status: activityStatusSchema,
    actualStartedAt: z.date().optional(),
    actualCompletedAt: z.date().optional()
  })
  .strict();

export const applicationTimeCorrectionRequestSchema = z
  .object({
    role: actorRoleSchema,
    previousApplicationStartedAt: z.date(),
    newApplicationStartedAt: z.date(),
    reason: z.string().trim().min(1),
    activities: z.array(participantActivitySchema)
  })
  .strict();

export type ActivityAnchorEvent = z.infer<typeof activityAnchorEventSchema>;
export type ActivitySchedule = z.infer<typeof activityScheduleSchema>;
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ApplicationTimeCorrectionRequest = z.infer<
  typeof applicationTimeCorrectionRequestSchema
>;
export type ParticipantActivity = z.infer<typeof participantActivitySchema>;
