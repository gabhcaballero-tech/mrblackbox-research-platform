import { z } from "zod";

export const rotationArmCodeSchema = z.enum(["left", "right"]);

export const participantArmAssignmentSchema = z
  .object({
    armCode: rotationArmCodeSchema,
    realProductKey: z.string().trim().min(1),
    participantVisibleLabel: z.string().trim().min(1),
    applicationOrder: z.union([z.literal(1), z.literal(2)])
  })
  .strict();

export const manualTwoArmRotationAssignmentSchema = z
  .object({
    rotationCode: z.string().trim().min(1),
    assignmentMode: z.literal("manual_cover_code"),
    arms: z.array(participantArmAssignmentSchema).length(2)
  })
  .strict()
  .superRefine((assignment, context) => {
    const armCodes = assignment.arms.map((arm) => arm.armCode);
    const applicationOrders = assignment.arms.map((arm) => arm.applicationOrder);
    const realProductKeys = assignment.arms.map((arm) => arm.realProductKey);

    if (!armCodes.includes("left") || !armCodes.includes("right")) {
      context.addIssue({
        code: "custom",
        message: "A manual two-arm rotation must include one left arm and one right arm."
      });
    }

    if (new Set(armCodes).size !== 2) {
      context.addIssue({
        code: "custom",
        message: "Arm codes must not be duplicated."
      });
    }

    if (!applicationOrders.includes(1) || !applicationOrders.includes(2)) {
      context.addIssue({
        code: "custom",
        message: "Application order must include positions 1 and 2."
      });
    }

    if (new Set(applicationOrders).size !== 2) {
      context.addIssue({
        code: "custom",
        message: "Application order must not be duplicated."
      });
    }

    if (new Set(realProductKeys).size !== 2) {
      context.addIssue({
        code: "custom",
        message: "Each arm must reference a different real product key."
      });
    }

    for (const arm of assignment.arms) {
      if (arm.participantVisibleLabel === arm.realProductKey) {
        context.addIssue({
          code: "custom",
          message: "Participant-visible labels must stay separate from real product keys.",
          path: ["arms", assignment.arms.indexOf(arm), "participantVisibleLabel"]
        });
      }
    }
  });

export type RotationArmCode = z.infer<typeof rotationArmCodeSchema>;
export type ParticipantArmAssignment = z.infer<typeof participantArmAssignmentSchema>;
export type ManualTwoArmRotationAssignment = z.infer<
  typeof manualTwoArmRotationAssignmentSchema
>;
