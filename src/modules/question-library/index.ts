export {
  assertLibraryContentIsSafe,
  blockLibraryContentSchema,
  buildBlockLibraryContent,
  buildQuestionLibraryContent,
  createLibraryContentHash,
  insertLibraryContentIntoDefinition,
  libraryContentSchema,
  libraryItemScopeSchema,
  libraryItemTypeSchema,
  libraryRevisionStatusSchema,
  parseLibraryContent,
  questionLibraryContentSchema
} from "./definition";
export type {
  BlockLibraryContent,
  InsertLibraryContentResult,
  LibraryContent,
  LibraryContentMetadata,
  LibraryItemScope,
  LibraryItemType,
  LibraryRevisionStatus,
  QuestionLibraryContent
} from "./definition";

export const questionLibraryModule = {
  description: "Reusable screener question and block library with immutable revisions.",
  key: "question-library",
  status: "active"
} as const;
