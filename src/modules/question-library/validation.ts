import { z } from "zod";
import { normalizeDisplayText } from "@/modules/screener/validation";
import { libraryItemScopeSchema, libraryItemTypeSchema } from "./definition";

function optionalText(value: unknown): string | undefined {
  const normalized = normalizeDisplayText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function checkboxValue(value: unknown): boolean {
  return value === "on" || value === "true" || value === true;
}

function splitTags(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((tag) => normalizeDisplayText(tag))
    .filter(Boolean)
    .slice(0, 20);
}

export const librarySaveInputSchema = z
  .object({
    category: z.preprocess(optionalText, z.string().max(80).optional()),
    confirmGeneric: z.preprocess(checkboxValue, z.boolean()),
    description: z.preprocess(optionalText, z.string().max(500).optional()),
    name: z.preprocess(
      normalizeDisplayText,
      z.string().min(1, "El nombre es obligatorio.").max(160)
    ),
    scope: libraryItemScopeSchema.default("STUDY_SPECIFIC"),
    tags: z.preprocess(splitTags, z.array(z.string().min(1).max(40)))
  })
  .superRefine((input, context) => {
    if (input.scope === "GENERIC" && !input.confirmGeneric) {
      context.addIssue({
        code: "custom",
        message:
          "Confirma que este contenido no incluye marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio.",
        path: ["confirmGeneric"]
      });
    }
  });

export const librarySearchInputSchema = z.object({
  category: z.preprocess(optionalText, z.string().max(80).optional()),
  query: z.preprocess(optionalText, z.string().max(160).optional()),
  scope: z.preprocess(optionalText, libraryItemScopeSchema.optional()),
  tag: z.preprocess(optionalText, z.string().max(40).optional()),
  type: z.preprocess(optionalText, libraryItemTypeSchema.optional())
});

export type LibrarySaveInput = z.infer<typeof librarySaveInputSchema>;
export type LibrarySearchInput = z.infer<typeof librarySearchInputSchema>;

export type QuestionLibraryFieldErrors = Record<string, string[] | undefined>;

export function getLibrarySaveInputFromFormData(formData: FormData): LibrarySaveInput {
  return librarySaveInputSchema.parse({
    category: formData.get("category"),
    confirmGeneric: formData.get("confirmGeneric"),
    description: formData.get("description"),
    name: formData.get("name"),
    scope: formData.get("scope") ?? "STUDY_SPECIFIC",
    tags: formData.get("tags")
  });
}

export function getLibrarySearchInputFromSearchParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
): LibrarySearchInput {
  const getValue = (key: string) => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key);
    }

    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return librarySearchInputSchema.parse({
    category: getValue("category"),
    query: getValue("query"),
    scope: getValue("scope"),
    tag: getValue("tag"),
    type: getValue("type")
  });
}
