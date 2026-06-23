import { z } from "zod";
import { normalizeStudyCode, studyIdSchema } from "@/modules/studies/validation";

const SAFE_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const PARTICIPANT_LABEL_BY_ORDER = {
  1: "Primera fragancia",
  2: "Segunda fragancia"
} as const;

export const CANONICAL_COMPARATIVE_ARMS = [
  {
    code: "left",
    defaultLabel: "Brazo izquierdo",
    sortOrder: 1
  },
  {
    code: "right",
    defaultLabel: "Brazo derecho",
    sortOrder: 2
  }
] as const;

export type CanonicalArmCode = (typeof CANONICAL_COMPARATIVE_ARMS)[number]["code"];

export function normalizeDisplayText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTextForComparison(value: unknown): string {
  return normalizeDisplayText(value).toUpperCase();
}

export function getParticipantLabelForOrder(order: 1 | 2): string {
  return PARTICIPANT_LABEL_BY_ORDER[order];
}

export const productAdminInputSchema = z
  .object({
    displayLabel: z.preprocess(
      normalizeDisplayText,
      z
        .string()
        .min(1, "La etiqueta segura es obligatoria.")
        .max(80, "La etiqueta segura no puede superar 80 caracteres.")
    ),
    internalCode: z.preprocess(
      normalizeStudyCode,
      z
        .string()
        .min(2, "El código interno debe tener al menos 2 caracteres.")
        .max(32, "El código interno no puede superar 32 caracteres.")
        .regex(SAFE_CODE_PATTERN, "Usa solo letras, números y guiones internos.")
    ),
    realName: z.preprocess(
      normalizeDisplayText,
      z
        .string()
        .min(1, "El nombre real es obligatorio.")
        .max(160, "El nombre real no puede superar 160 caracteres.")
    )
  })
  .superRefine((input, context) => {
    if (normalizeTextForComparison(input.displayLabel) === normalizeTextForComparison(input.realName)) {
      context.addIssue({
        code: "custom",
        message: "La etiqueta segura no puede coincidir con el nombre real.",
        path: ["displayLabel"]
      });
    }
  });

export const armAdminInputSchema = z.object({
  code: z.enum(["left", "right"]),
  label: z.preprocess(
    normalizeDisplayText,
    z
      .string()
      .min(1, "La etiqueta operativa es obligatoria.")
      .max(80, "La etiqueta operativa no puede superar 80 caracteres.")
  )
});

export const updateArmAdminInputSchema = armAdminInputSchema.pick({
  label: true
});

const applicationOrderSchema = z.coerce
  .number()
  .int()
  .refine((value): value is 1 | 2 => value === 1 || value === 2, {
    message: "El orden debe ser 1 o 2."
  });

export const rotationPlanAdminInputSchema = z.object({
  leftApplicationOrder: applicationOrderSchema,
  leftProductId: z.string().trim().min(1, "Selecciona el producto del brazo izquierdo."),
  rightApplicationOrder: applicationOrderSchema,
  rightProductId: z.string().trim().min(1, "Selecciona el producto del brazo derecho."),
  rotationCode: z.preprocess(
    normalizeStudyCode,
    z
      .string()
      .min(2, "El código de rotación debe tener al menos 2 caracteres.")
      .max(32, "El código de rotación no puede superar 32 caracteres.")
      .regex(SAFE_CODE_PATTERN, "Usa solo letras, números y guiones internos.")
  )
});

export const comparativeStudyIdSchema = studyIdSchema;

export type ProductAdminInput = z.infer<typeof productAdminInputSchema>;
export type ArmAdminInput = z.infer<typeof armAdminInputSchema>;
export type UpdateArmAdminInput = z.infer<typeof updateArmAdminInputSchema>;
export type RotationPlanAdminInput = z.infer<typeof rotationPlanAdminInputSchema>;

export type ComparativeAdminField =
  | keyof ProductAdminInput
  | keyof ArmAdminInput
  | keyof RotationPlanAdminInput
  | "id"
  | "studyId";

export type ComparativeAdminFieldErrors = Partial<Record<ComparativeAdminField, string[]>>;

export function getProductInputFromFormData(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    displayLabel: formData.get("displayLabel"),
    internalCode: formData.get("internalCode"),
    realName: formData.get("realName")
  };
}

export function getArmInputFromFormData(
  formData: FormData,
  code: CanonicalArmCode
): Record<string, FormDataEntryValue | string | null> {
  return {
    code,
    label: formData.get("label")
  };
}

export function getUpdateArmInputFromFormData(
  formData: FormData
): Record<string, FormDataEntryValue | null> {
  return {
    label: formData.get("label")
  };
}

export function getRotationPlanInputFromFormData(
  formData: FormData
): Record<string, FormDataEntryValue | null> {
  return {
    leftApplicationOrder: formData.get("leftApplicationOrder"),
    leftProductId: formData.get("leftProductId"),
    rightApplicationOrder: formData.get("rightApplicationOrder"),
    rightProductId: formData.get("rightProductId"),
    rotationCode: formData.get("rotationCode")
  };
}
