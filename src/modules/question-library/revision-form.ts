import {
  screenerQuestionSchema,
  screenerRuleSchema,
  type ScreenerCondition,
  type ScreenerOptionAction,
  type ScreenerQuestion,
  type ScreenerQuestionType,
  type ScreenerRule,
  type ScreenerRuleOutcome
} from "@/modules/screener/definition";
import { normalizeDisplayText, normalizeTechnicalKey } from "@/modules/screener/validation";
import { blockLibraryContentSchema, questionLibraryContentSchema, type LibraryContent } from "./definition";

const optionQuestionTypes = new Set<ScreenerQuestionType>([
  "CONSENT_YES_NO",
  "INTERVIEWER_CHECKLIST",
  "MULTIPLE_CHOICE",
  "SINGLE_CHOICE"
]);

export function getLibraryRevisionContentFromFormData(formData: FormData): LibraryContent {
  const kind = text(formData, "kind");
  const metadata = {
    category: optionalText(formData, "metadataCategory"),
    description: optionalText(formData, "metadataDescription"),
    isGenericContentConfirmed: booleanValue(formData, "metadataGenericConfirmed"),
    tags: splitTags(formData.get("metadataTags"))
  };

  if (kind === "QUESTION") {
    return questionLibraryContentSchema.parse({
      compatibleWith: "screening.v1",
      kind: "QUESTION",
      metadata,
      question: readQuestion(formData, "question", 1),
      schemaVersion: "screener-library.v1"
    });
  }

  const questionIndexes = formData.getAll("questionIndex").map(String);
  const questions = questionIndexes.map((index, order) =>
    readQuestion(formData, `questions.${index}`, order + 1)
  );
  const ruleIndexes = formData.getAll("ruleIndex").map(String);
  const rules = ruleIndexes.map((index, order) => readRule(formData, `rules.${index}`, order + 1));
  const nse = booleanValue(formData, "hasNse") ? readNse(formData) : undefined;

  return blockLibraryContentSchema.parse({
    compatibleWith: "screening.v1",
    kind: "BLOCK",
    metadata,
    nse,
    questions,
    rules,
    schemaVersion: "screener-library.v1"
  });
}

function readQuestion(formData: FormData, prefix: string, order: number): ScreenerQuestion {
  const type = text(formData, `${prefix}.type`) as ScreenerQuestionType;
  const validation = {
    max: optionalNumber(formData, `${prefix}.validationMax`),
    maxLength: optionalInteger(formData, `${prefix}.validationMaxLength`),
    maxSelections: optionalInteger(formData, `${prefix}.validationMaxSelections`),
    min: optionalNumber(formData, `${prefix}.validationMin`),
    minLength: optionalInteger(formData, `${prefix}.validationMinLength`),
    minSelections: optionalInteger(formData, `${prefix}.validationMinSelections`)
  };
  const base = {
    dataDestination: text(formData, `${prefix}.dataDestination`),
    helpText: optionalText(formData, `${prefix}.helpText`),
    id: normalizeTechnicalKey(formData.get(`${prefix}.id`)),
    order,
    profileBinding: optionalText(formData, `${prefix}.profileBinding`),
    required: booleanValue(formData, `${prefix}.required`),
    text: text(formData, `${prefix}.text`),
    type,
    validation: removeUndefined(validation),
    visibilityCondition: readVisibilityCondition(formData, prefix)
  };

  if (!optionQuestionTypes.has(type)) {
    return screenerQuestionSchema.parse(base);
  }

  const optionIndexes = formData.getAll(`${prefix}.optionIndex`).map(String);

  return screenerQuestionSchema.parse({
    ...base,
    options: optionIndexes.map((index, optionOrder) =>
      readOption(formData, `${prefix}.options.${index}`, optionOrder + 1)
    )
  });
}

function readVisibilityCondition(formData: FormData, prefix: string): ScreenerCondition | undefined {
  if (text(formData, `${prefix}.visibilityMode`) !== "CONDITIONAL") {
    return undefined;
  }

  return readCondition(formData, `${prefix}.visibility`);
}

function readOption(formData: FormData, prefix: string, order: number) {
  const action = readOptionAction(formData, prefix);

  return {
    actions: action ? [action] : [],
    isOther: booleanValue(formData, `${prefix}.isOther`),
    label: text(formData, `${prefix}.label`),
    order,
    otherTextMaxLength: optionalInteger(formData, `${prefix}.otherTextMaxLength`),
    otherTextRequired: booleanValue(formData, `${prefix}.otherTextRequired`),
    value: normalizeTechnicalKey(formData.get(`${prefix}.value`))
  };
}

function readOptionAction(formData: FormData, prefix: string): ScreenerOptionAction | null {
  const actionType = text(formData, `${prefix}.actionType`);
  const code = optionalText(formData, `${prefix}.actionCode`);
  const reason = optionalText(formData, `${prefix}.actionReason`);

  switch (actionType) {
    case "CONTINUE":
      return { type: "CONTINUE" };
    case "FLAG":
      return {
        code: code ?? "",
        label: optionalText(formData, `${prefix}.actionLabel`),
        requiresReview: booleanValue(formData, `${prefix}.actionRequiresReview`),
        type: "FLAG"
      };
    case "PENDING_REVIEW":
      return { code: code ?? "", reason: reason ?? "", type: "PENDING_REVIEW" };
    case "TERMINATE":
      return { code: code ?? "", reason: reason ?? "", type: "TERMINATE" };
    default:
      return null;
  }
}

function readRule(formData: FormData, prefix: string, order: number): ScreenerRule {
  return screenerRuleSchema.parse({
    condition: readCondition(formData, prefix),
    id: normalizeTechnicalKey(formData.get(`${prefix}.id`)),
    order,
    outcome: readRuleOutcome(formData, prefix)
  });
}

function readCondition(formData: FormData, prefix: string): ScreenerCondition {
  const conditionType = text(formData, `${prefix}.conditionType`);
  const questionId = normalizeTechnicalKey(formData.get(`${prefix}.questionId`));

  if (conditionType === "NUMBER_RANGE") {
    return {
      max: optionalNumber(formData, `${prefix}.max`),
      min: optionalNumber(formData, `${prefix}.min`),
      questionId,
      type: "NUMBER_RANGE"
    };
  }

  if (
    conditionType === "ANY_SELECTED" ||
    conditionType === "ALL_SELECTED" ||
    conditionType === "NONE_SELECTED"
  ) {
    return {
      questionId,
      type: conditionType,
      values: splitValues(formData.get(`${prefix}.values`))
    };
  }

  return {
    questionId,
    type: "ANSWER_EQUALS",
    value: text(formData, `${prefix}.value`)
  };
}

function readRuleOutcome(formData: FormData, prefix: string): ScreenerRuleOutcome {
  const outcomeType = text(formData, `${prefix}.outcomeType`);
  const code = optionalText(formData, `${prefix}.outcomeCode`) ?? "";
  const reason = optionalText(formData, `${prefix}.outcomeReason`);

  if (outcomeType === "FLAG") {
    return {
      code,
      label: optionalText(formData, `${prefix}.outcomeLabel`),
      requiresReview: booleanValue(formData, `${prefix}.outcomeRequiresReview`),
      type: "FLAG"
    };
  }

  if (outcomeType === "PENDING_REVIEW") {
    return { code, reason: reason ?? "", type: "PENDING_REVIEW" };
  }

  return { code, reason: reason ?? "", type: "TERMINATE" };
}

function readNse(formData: FormData) {
  const inputIndexes = formData.getAll("nseInputIndex").map(String);
  const rangeIndexes = formData.getAll("nseRangeIndex").map(String);

  return {
    code: normalizeTechnicalKey(formData.get("nse.code")),
    inputs: inputIndexes.map((index) => {
      const scoreIndexes = formData.getAll(`nse.inputs.${index}.scoreIndex`).map(String);
      const scoreByAnswer: Record<string, number> = {};

      scoreIndexes.forEach((scoreIndex) => {
        const answer = text(formData, `nse.inputs.${index}.scores.${scoreIndex}.answer`);
        scoreByAnswer[answer] = numberValue(formData, `nse.inputs.${index}.scores.${scoreIndex}.score`);
      });

      return {
        missingScore: numberValue(formData, `nse.inputs.${index}.missingScore`),
        questionId: normalizeTechnicalKey(formData.get(`nse.inputs.${index}.questionId`)),
        scoreByAnswer
      };
    }),
    label: text(formData, "nse.label"),
    ranges: rangeIndexes.map((index) => ({
      code: normalizeTechnicalKey(formData.get(`nse.ranges.${index}.code`)),
      eligible: booleanValue(formData, `nse.ranges.${index}.eligible`),
      label: text(formData, `nse.ranges.${index}.label`),
      max: numberValue(formData, `nse.ranges.${index}.max`),
      min: numberValue(formData, `nse.ranges.${index}.min`)
    })),
    type: "score_table" as const
  };
}

function text(formData: FormData, key: string): string {
  return normalizeDisplayText(formData.get(key));
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = text(formData, key);
  return value.length > 0 ? value : undefined;
}

function booleanValue(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true";
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? Number(value) : undefined;
}

function optionalInteger(formData: FormData, key: string): number | undefined {
  const value = optionalNumber(formData, key);
  return value === undefined ? undefined : Math.trunc(value);
}

function numberValue(formData: FormData, key: string): number {
  return Number(String(formData.get(key) ?? "0").trim());
}

function splitTags(value: FormDataEntryValue | null): string[] {
  return splitValues(value).map(String);
}

function splitValues(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map(normalizeDisplayText)
    .filter(Boolean);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
  ) as Partial<T>;
}
