import { z } from "zod";

export const supervisionAttemptStatusSchema = z.enum([
  "STARTED",
  "INCOMPLETE",
  "PASSED",
  "TERMINATED",
  "PENDING_REVIEW"
]);

const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const optionalDateSchema = optionalTextSchema
  .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
    message: "La fecha no es válida."
  })
  .transform((value) => (value ? new Date(`${value}T00:00:00`) : undefined));

export const screeningAttemptFiltersSchema = z
  .object({
    code: optionalTextSchema,
    dateFrom: optionalDateSchema,
    dateTo: optionalDateSchema,
    fieldUserId: optionalTextSchema,
    participantQuery: optionalTextSchema,
    status: z
      .union([supervisionAttemptStatusSchema, z.literal("")])
      .optional()
      .transform((value) => (value ? value : undefined))
  })
  .superRefine((filters, context) => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      context.addIssue({
        code: "custom",
        message: "La fecha inicial no puede ser posterior a la fecha final.",
        path: ["dateFrom"]
      });
    }
  });

export type ScreeningAttemptFiltersInput = z.input<typeof screeningAttemptFiltersSchema>;
export type ScreeningAttemptFilters = z.output<typeof screeningAttemptFiltersSchema>;
export type SupervisionAttemptStatus = z.infer<typeof supervisionAttemptStatusSchema>;

export function parseScreeningAttemptFilters(input: unknown): ScreeningAttemptFilters {
  return screeningAttemptFiltersSchema.parse(input);
}
