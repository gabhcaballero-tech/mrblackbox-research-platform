import { z } from "zod";

const studyRefSchema = z
  .object({
    id: z.string().trim().min(1)
  })
  .strict();

const rotationPlanRefSchema = z
  .object({
    id: z.string().trim().min(1),
    studyId: z.string().trim().min(1)
  })
  .strict();

const studyParticipantRefSchema = z
  .object({
    id: z.string().trim().min(1),
    studyId: z.string().trim().min(1)
  })
  .strict();

const studyArmRefSchema = z
  .object({
    id: z.string().trim().min(1),
    studyId: z.string().trim().min(1),
    code: z.string().trim().min(1)
  })
  .strict();

const studyProductRefSchema = z
  .object({
    id: z.string().trim().min(1),
    studyId: z.string().trim().min(1),
    internalCode: z.string().trim().min(1),
    realName: z.string().trim().min(1)
  })
  .strict();

const participantRotationAssignmentRefSchema = z
  .object({
    id: z.string().trim().min(1),
    studyParticipantId: z.string().trim().min(1),
    rotationPlanId: z.string().trim().min(1),
    assignmentMode: z.literal("manual_cover_code")
  })
  .strict();

const participantArmAssignmentDraftSchema = z
  .object({
    studyParticipantId: z.string().trim().min(1),
    studyArm: studyArmRefSchema,
    studyProduct: studyProductRefSchema,
    applicationOrder: z.number().int(),
    participantVisibleLabel: z.string().trim().min(1)
  })
  .strict();

export const rotationPersistenceConsistencyInputSchema = z
  .object({
    study: studyRefSchema,
    rotationPlan: rotationPlanRefSchema,
    studyParticipant: studyParticipantRefSchema,
    participantRotationAssignment: participantRotationAssignmentRefSchema,
    participantArmAssignments: z.array(participantArmAssignmentDraftSchema)
  })
  .strict();

export type RotationPersistenceConsistencyInput = z.infer<
  typeof rotationPersistenceConsistencyInputSchema
>;

export type RotationPersistenceConsistencyResult =
  | {
      success: true;
    }
  | {
      success: false;
      errors: string[];
    };

export function validateRotationPersistenceConsistency(
  input: RotationPersistenceConsistencyInput
): RotationPersistenceConsistencyResult {
  const parsed = rotationPersistenceConsistencyInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => issue.message)
    };
  }

  const errors: string[] = [];
  const { study, rotationPlan, studyParticipant, participantRotationAssignment } = parsed.data;

  if (rotationPlan.studyId !== study.id) {
    errors.push("RotationPlan must belong to the same study.");
  }

  if (studyParticipant.studyId !== study.id) {
    errors.push("StudyParticipant must belong to the same study.");
  }

  if (participantRotationAssignment.rotationPlanId !== rotationPlan.id) {
    errors.push("ParticipantRotationAssignment must reference the provided RotationPlan.");
  }

  if (participantRotationAssignment.studyParticipantId !== studyParticipant.id) {
    errors.push("ParticipantRotationAssignment must reference the provided StudyParticipant.");
  }

  if (parsed.data.participantArmAssignments.length !== 2) {
    errors.push("A V1 manual comparative rotation must have exactly two arm assignments.");
  }

  const seenArmIds = new Set<string>();
  const seenApplicationOrders = new Set<number>();

  for (const armAssignment of parsed.data.participantArmAssignments) {
    if (armAssignment.studyParticipantId !== participantRotationAssignment.studyParticipantId) {
      errors.push("ParticipantArmAssignment must match the rotation assignment participant.");
    }

    if (armAssignment.studyArm.studyId !== study.id) {
      errors.push("StudyArm must belong to the same study.");
    }

    if (armAssignment.studyProduct.studyId !== study.id) {
      errors.push("StudyProduct must belong to the same study.");
    }

    if (seenArmIds.has(armAssignment.studyArm.id)) {
      errors.push("Arm assignments must not duplicate StudyArm.");
    }
    seenArmIds.add(armAssignment.studyArm.id);

    if (seenApplicationOrders.has(armAssignment.applicationOrder)) {
      errors.push("Arm assignments must not duplicate application order.");
    }
    seenApplicationOrders.add(armAssignment.applicationOrder);

    if (
      armAssignment.participantVisibleLabel === armAssignment.studyProduct.internalCode ||
      armAssignment.participantVisibleLabel === armAssignment.studyProduct.realName
    ) {
      errors.push("Participant-visible label must stay separate from real product keys.");
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors
    };
  }

  return {
    success: true
  };
}
