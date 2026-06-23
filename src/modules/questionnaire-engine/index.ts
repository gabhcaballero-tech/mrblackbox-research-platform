export { createQuestionnaireSnapshot } from "./snapshot";
export type { ReadonlyDeep } from "./snapshot";
export {
  questionnaireQuestionSchema,
  questionnaireSnapshotSchema
} from "./snapshot-schema";
export type {
  QuestionnaireOption,
  QuestionnaireQuestion,
  QuestionnaireSnapshot
} from "./snapshot-schema";

export const questionnaireEngineModule = {
  key: "questionnaire-engine",
  status: "planned",
  description: "Boundary for published questionnaire snapshots and future rendering rules."
} as const;
