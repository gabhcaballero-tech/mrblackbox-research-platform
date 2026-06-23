import { z } from "zod";

export const fieldParticipantInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value : undefined))
      .pipe(z.string().email().optional()),
    externalReference: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value : undefined))
      .pipe(z.string().min(1).max(120).optional()),
    name: z.string().trim().min(1, "Ingresa nombre o identificador operativo.").max(160),
    phone: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value : undefined))
      .pipe(z.string().min(6).max(40).optional())
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.phone && !input.email && !input.externalReference) {
      context.addIssue({
        code: "custom",
        message:
          "Captura teléfono, correo o referencia externa para poder detectar si el panelista ya estaba registrado.",
        path: ["phone"]
      });
    }
  });

export const fieldAnswerInputSchema = z
  .object({
    otherText: z.string().trim().optional(),
    value: z.union([z.string(), z.array(z.string())]).optional()
  })
  .strict();

export type FieldParticipantInput = z.infer<typeof fieldParticipantInputSchema>;
export type FieldAnswerInput = z.infer<typeof fieldAnswerInputSchema>;

export function getFieldParticipantInputFromFormData(formData: FormData): FieldParticipantInput {
  return {
    email: String(formData.get("email") ?? ""),
    externalReference: String(formData.get("externalReference") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "")
  };
}

export function getFieldAnswerInputFromFormData(formData: FormData): FieldAnswerInput {
  const values = formData.getAll("value").map(String).filter(Boolean);

  return {
    otherText: String(formData.get("otherText") ?? ""),
    value: values.length > 1 ? values : values[0]
  };
}
