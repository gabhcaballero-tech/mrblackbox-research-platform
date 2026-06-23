import { createHash } from "node:crypto";
import { z } from "zod";
import {
  nseScoreTableSchema,
  screenerQuestionSchema,
  screenerRuleSchema,
  stableStringify,
  type NseScoreTable,
  type ScreenerCondition,
  type ScreenerDefinition,
  type ScreenerQuestion,
  type ScreenerRule
} from "@/modules/screener/definition";
import { screenerDefinitionSchema } from "@/modules/screener";

export const libraryItemScopeSchema = z.enum(["GENERIC", "STUDY_SPECIFIC"]);
export const libraryItemTypeSchema = z.enum(["QUESTION", "BLOCK_TEMPLATE"]);
export const libraryRevisionStatusSchema = z.enum(["ACTIVE", "SUPERSEDED", "RETIRED"]);

const libraryMetadataSchema = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    isGenericContentConfirmed: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(40)).default([])
  })
  .strict();

export const questionLibraryContentSchema = z
  .object({
    compatibleWith: z.literal("screening.v1"),
    kind: z.literal("QUESTION"),
    metadata: libraryMetadataSchema,
    question: screenerQuestionSchema,
    schemaVersion: z.literal("screener-library.v1")
  })
  .strict();

export const blockLibraryContentSchema = z
  .object({
    compatibleWith: z.literal("screening.v1"),
    kind: z.literal("BLOCK"),
    metadata: libraryMetadataSchema,
    nse: nseScoreTableSchema.optional(),
    questions: z.array(screenerQuestionSchema).min(1),
    rules: z.array(screenerRuleSchema).default([]),
    schemaVersion: z.literal("screener-library.v1")
  })
  .strict()
  .superRefine((content, context) => {
    const questionIds = new Set(content.questions.map((question) => question.id));

    content.rules.forEach((rule, ruleIndex) => {
      const externalQuestionId = getConditionQuestionIds(rule.condition).find(
        (questionId) => !questionIds.has(questionId)
      );

      if (externalQuestionId) {
        context.addIssue({
          code: "custom",
          message: "Las reglas del bloque no pueden apuntar a preguntas fuera del bloque.",
          path: ["rules", ruleIndex]
        });
      }
    });

    content.nse?.inputs.forEach((input, inputIndex) => {
      if (!questionIds.has(input.questionId)) {
        context.addIssue({
          code: "custom",
          message: "El NSE del bloque solo puede usar preguntas incluidas en el bloque.",
          path: ["nse", "inputs", inputIndex, "questionId"]
        });
      }
    });
  });

export const libraryContentSchema = z.discriminatedUnion("kind", [
  questionLibraryContentSchema,
  blockLibraryContentSchema
]);

export type LibraryItemScope = z.infer<typeof libraryItemScopeSchema>;
export type LibraryItemType = z.infer<typeof libraryItemTypeSchema>;
export type LibraryRevisionStatus = z.infer<typeof libraryRevisionStatusSchema>;
export type QuestionLibraryContent = z.infer<typeof questionLibraryContentSchema>;
export type BlockLibraryContent = z.infer<typeof blockLibraryContentSchema>;
export type LibraryContent = z.infer<typeof libraryContentSchema>;

export type LibraryContentMetadata = z.infer<typeof libraryMetadataSchema>;

export type InsertLibraryContentResult = {
  definition: ScreenerDefinition;
  idMap: {
    questions: Record<string, string>;
    rules: Record<string, string>;
  };
  insertedContentHash: string;
  renamedQuestionIds: Array<{
    from: string;
    to: string;
  }>;
};

const forbiddenContentKeys = new Set([
  "answerJson",
  "participantProfile",
  "participantProfileId",
  "researchResponses",
  "rotationCode",
  "studyParticipant",
  "studyParticipantId",
  "quotaDefinition",
  "quotaEvaluations",
  "realName"
]);

export function createLibraryContentHash(content: LibraryContent): string {
  const parsed = libraryContentSchema.parse(content);

  return createHash("sha256").update(stableStringify(parsed)).digest("hex");
}

export function assertLibraryContentIsSafe(content: LibraryContent): void {
  const foundKey = findForbiddenKey(content);

  if (foundKey) {
    throw new Error(`La biblioteca no puede guardar datos operativos o sensibles: ${foundKey}.`);
  }
}

export function buildQuestionLibraryContent({
  metadata,
  question
}: {
  metadata: LibraryContentMetadata;
  question: ScreenerQuestion;
}): QuestionLibraryContent {
  const content = questionLibraryContentSchema.parse({
    compatibleWith: "screening.v1",
    kind: "QUESTION",
    metadata,
    question: cloneJson(question),
    schemaVersion: "screener-library.v1"
  });

  assertLibraryContentIsSafe(content);
  return content;
}

export function buildBlockLibraryContent({
  definition,
  metadata,
  questionIds
}: {
  definition: ScreenerDefinition;
  metadata: LibraryContentMetadata;
  questionIds: string[];
}): BlockLibraryContent {
  const selectedIds = new Set(questionIds);

  if (selectedIds.size === 0) {
    throw new Error("Selecciona al menos una pregunta para guardar el bloque.");
  }

  const selectedQuestions = definition.questions
    .filter((question) => selectedIds.has(question.id))
    .sort((left, right) => left.order - right.order);

  if (selectedQuestions.length !== selectedIds.size) {
    throw new Error("El bloque contiene una pregunta que no existe en el borrador.");
  }

  const relatedRules = definition.rules.filter((rule) => {
    const referencedIds = getConditionQuestionIds(rule.condition);
    return referencedIds.some((questionId) => selectedIds.has(questionId));
  });

  for (const rule of relatedRules) {
    const externalQuestionId = getConditionQuestionIds(rule.condition).find(
      (questionId) => !selectedIds.has(questionId)
    );

    if (externalQuestionId) {
      throw new Error(
        `La regla ${rule.id} apunta a una pregunta fuera del bloque: ${externalQuestionId}.`
      );
    }
  }

  const nse =
    definition.nse &&
    definition.nse.inputs.every((input) => selectedIds.has(input.questionId))
      ? cloneJson(definition.nse)
      : undefined;

  const content = blockLibraryContentSchema.parse({
    compatibleWith: "screening.v1",
    kind: "BLOCK",
    metadata,
    nse,
    questions: cloneJson(selectedQuestions),
    rules: cloneJson(relatedRules.sort((left, right) => left.order - right.order)),
    schemaVersion: "screener-library.v1"
  });

  assertLibraryContentIsSafe(content);
  return content;
}

export function parseLibraryContent(input: unknown): LibraryContent {
  const content = libraryContentSchema.parse(input);

  assertLibraryContentIsSafe(content);
  return content;
}

export function insertLibraryContentIntoDefinition({
  content,
  destination
}: {
  content: LibraryContent;
  destination: ScreenerDefinition;
}): InsertLibraryContentResult {
  const parsedContent = parseLibraryContent(content);
  const destinationDefinition = screenerDefinitionSchema.parse(destination);
  const contentQuestions =
    parsedContent.kind === "QUESTION" ? [parsedContent.question] : parsedContent.questions;
  const contentRules = parsedContent.kind === "BLOCK" ? parsedContent.rules : [];
  const contentNse = parsedContent.kind === "BLOCK" ? parsedContent.nse : undefined;

  if (contentNse && destinationDefinition.nse) {
    throw new Error(
      "Este bloque incluye NSE y el borrador destino ya tiene NSE configurado. Retira o revisa el NSE antes de insertar."
    );
  }

  const existingQuestionIds = new Set(destinationDefinition.questions.map((question) => question.id));
  const questionIdMap: Record<string, string> = {};
  const renamedQuestionIds: InsertLibraryContentResult["renamedQuestionIds"] = [];
  const newQuestionIds = new Set<string>();

  for (const question of contentQuestions) {
    const nextId = createUniqueId(question.id, existingQuestionIds, newQuestionIds);
    questionIdMap[question.id] = nextId;
    newQuestionIds.add(nextId);

    if (nextId !== question.id) {
      renamedQuestionIds.push({ from: question.id, to: nextId });
    }
  }

  const existingRuleIds = new Set(destinationDefinition.rules.map((rule) => rule.id));
  const ruleIdMap: Record<string, string> = {};
  const newRuleIds = new Set<string>();

  for (const rule of contentRules) {
    const nextId = createUniqueId(rule.id, existingRuleIds, newRuleIds);
    ruleIdMap[rule.id] = nextId;
    newRuleIds.add(nextId);
  }

  const nextQuestionStartOrder = nextOrder(destinationDefinition.questions);
  const copiedQuestions = contentQuestions.map((question, index) => {
    const questionCopy = cloneJson(question);
    const visibilityCondition = questionCopy.visibilityCondition
      ? remapConditionQuestionIds(questionCopy.visibilityCondition, questionIdMap)
      : undefined;

    assertVisibilityConditionCanBeInserted({
      condition: visibilityCondition,
      destinationQuestionIds: existingQuestionIds,
      insertedQuestionIds: newQuestionIds
    });

    return {
      ...questionCopy,
      id: questionIdMap[question.id]!,
      order: nextQuestionStartOrder + index,
      visibilityCondition
    };
  });
  const nextRuleStartOrder = nextOrder(destinationDefinition.rules);
  const copiedRules = contentRules.map((rule, index) => ({
    ...cloneJson(rule),
    condition: remapConditionQuestionIds(rule.condition, questionIdMap),
    id: ruleIdMap[rule.id]!,
    order: nextRuleStartOrder + index
  }));
  const copiedNse = contentNse ? remapNseQuestionIds(contentNse, questionIdMap) : undefined;

  const nextDefinition = screenerDefinitionSchema.parse({
    ...destinationDefinition,
    nse: copiedNse ?? destinationDefinition.nse,
    questions: normalizeQuestions([...destinationDefinition.questions, ...copiedQuestions]),
    rules: normalizeRules([...destinationDefinition.rules, ...copiedRules])
  });

  return {
    definition: nextDefinition,
    idMap: {
      questions: questionIdMap,
      rules: ruleIdMap
    },
    insertedContentHash: createLibraryContentHash(parsedContent),
    renamedQuestionIds
  };
}

export function getConditionQuestionIds(condition: ScreenerCondition): string[] {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return condition.conditions.flatMap(getConditionQuestionIds);
  }

  return [condition.questionId];
}

function remapConditionQuestionIds(
  condition: ScreenerCondition,
  questionIdMap: Record<string, string>
): ScreenerCondition {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return {
      ...condition,
      conditions: condition.conditions.map((nestedCondition) =>
        remapConditionQuestionIds(nestedCondition, questionIdMap)
      )
    };
  }

  return {
    ...condition,
    questionId: questionIdMap[condition.questionId] ?? condition.questionId
  };
}

function remapNseQuestionIds(
  nse: NseScoreTable,
  questionIdMap: Record<string, string>
): NseScoreTable {
  return {
    ...cloneJson(nse),
    inputs: nse.inputs.map((input) => ({
      ...input,
      questionId: questionIdMap[input.questionId] ?? input.questionId
    }))
  };
}

function assertVisibilityConditionCanBeInserted({
  condition,
  destinationQuestionIds,
  insertedQuestionIds
}: {
  condition: ScreenerCondition | undefined;
  destinationQuestionIds: Set<string>;
  insertedQuestionIds: Set<string>;
}) {
  if (!condition) {
    return;
  }

  const missingQuestionId = getConditionQuestionIds(condition).find(
    (questionId) => !destinationQuestionIds.has(questionId) && !insertedQuestionIds.has(questionId)
  );

  if (missingQuestionId) {
    throw new Error(
      `La visibilidad condicional apunta a una pregunta que no existe en el destino: ${missingQuestionId}.`
    );
  }
}

function normalizeQuestions(questions: ScreenerQuestion[]): ScreenerQuestion[] {
  return [...questions]
    .sort((left, right) => left.order - right.order)
    .map((question, index) => ({
      ...question,
      order: index + 1
    }));
}

function normalizeRules(rules: ScreenerRule[]): ScreenerRule[] {
  return [...rules]
    .sort((left, right) => left.order - right.order)
    .map((rule, index) => ({
      ...rule,
      order: index + 1
    }));
}

function createUniqueId(originalId: string, existingIds: Set<string>, newIds: Set<string>): string {
  if (!existingIds.has(originalId) && !newIds.has(originalId)) {
    return originalId;
  }

  const baseId = `${originalId}_COPIA`;
  let candidate = baseId;
  let suffix = 2;

  while (existingIds.has(candidate) || newIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function nextOrder(items: Array<{ order: number }>): number {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.order)) + 1;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findForbiddenKey(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenContentKeys.has(key)) {
      return key;
    }

    const found = findForbiddenKey(nestedValue);

    if (found) {
      return found;
    }
  }

  return null;
}
