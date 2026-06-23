import { z } from "zod";

const STUDY_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_STUDY_TIME_ZONE = "America/Mexico_City";

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function normalizeStudyName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeStudyCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTimeZone(value: unknown): string {
  return String(value ?? "").trim();
}

export function isValidIanaTimeZone(value: string): boolean {
  const timeZone = normalizeTimeZone(value);

  if (!timeZone) {
    return false;
  }

  const intlWithSupportedValues = Intl as IntlWithSupportedValues;

  if (typeof intlWithSupportedValues.supportedValuesOf === "function") {
    try {
      if (!intlWithSupportedValues.supportedValuesOf("timeZone").includes(timeZone)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date("2026-01-01T00:00:00Z"));
    return true;
  } catch {
    return false;
  }
}

export const studyIdSchema = z
  .preprocess((value) => String(value ?? "").trim(), z.string())
  .refine((value) => UUID_PATTERN.test(value), "El estudio indicado no es valido.");

export const studyAdminInputSchema = z.object({
  code: z.preprocess(
    normalizeStudyCode,
    z
      .string()
      .min(2, "El codigo debe tener al menos 2 caracteres.")
      .max(32, "El codigo no puede superar 32 caracteres.")
      .regex(STUDY_CODE_PATTERN, "Usa solo letras, numeros y guiones internos.")
  ),
  name: z.preprocess(
    normalizeStudyName,
    z
      .string()
      .min(1, "El nombre es obligatorio.")
      .max(120, "El nombre no puede superar 120 caracteres.")
  ),
  timeZoneIana: z.preprocess(
    normalizeTimeZone,
    z
      .string()
      .min(1, "La zona horaria es obligatoria.")
      .refine(isValidIanaTimeZone, "La zona horaria IANA no es valida.")
  )
});

export const updateStudyAdminInputSchema = studyAdminInputSchema.extend({
  id: studyIdSchema
});

export type StudyAdminInput = z.infer<typeof studyAdminInputSchema>;
export type UpdateStudyAdminInput = z.infer<typeof updateStudyAdminInputSchema>;

export type StudyAdminField = keyof UpdateStudyAdminInput;
export type StudyAdminFieldErrors = Partial<Record<StudyAdminField, string[]>>;

export function getStudyInputFromFormData(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    timeZoneIana: formData.get("timeZoneIana")
  };
}

export function getUpdateStudyInputFromFormData(
  formData: FormData
): Record<string, FormDataEntryValue | null> {
  return {
    ...getStudyInputFromFormData(formData),
    id: formData.get("id")
  };
}
