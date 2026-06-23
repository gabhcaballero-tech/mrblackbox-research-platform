import { questionnaireSnapshotSchema, type QuestionnaireSnapshot } from "./snapshot-schema";

export type ReadonlyDeep<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
    : T;

export function createQuestionnaireSnapshot(
  input: QuestionnaireSnapshot
): ReadonlyDeep<QuestionnaireSnapshot> {
  const snapshot = questionnaireSnapshotSchema.parse(input);
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): ReadonlyDeep<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const nestedValue of Object.values(value)) {
      if (nestedValue && typeof nestedValue === "object") {
        deepFreeze(nestedValue);
      }
    }
  }

  return value as ReadonlyDeep<T>;
}
