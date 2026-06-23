import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  buildBlockLibraryContent,
  buildQuestionLibraryContent,
  createLibraryContentHash,
  insertLibraryContentIntoDefinition,
  parseLibraryContent,
  type LibraryContent,
  type LibraryItemType
} from "./definition";
import type {
  InsertLibraryRevisionFailureReason,
  LibraryItemRecord,
  LibraryItemWithRevisions,
  LibraryRevisionRecord,
  UpdateLibraryItemMetadataInput,
  LibrarySearchFilters,
  QuestionLibraryRepository
} from "./repository";
import {
  librarySaveInputSchema,
  librarySearchInputSchema,
  type LibrarySaveInput,
  type QuestionLibraryFieldErrors
} from "./validation";
import { parseScreenerDefinition, type ScreenerDefinition } from "@/modules/screener";
import type {
  ScreenerBuilderData,
  ScreenerDraftRecord,
  ScreenerRepository
} from "@/modules/screener/repository";

export type QuestionLibraryAdminActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type QuestionLibraryErrorCode =
  | "BLOCK_HAS_EXTERNAL_RULE"
  | "CROSS_STUDY_LIBRARY_ITEM"
  | "DRAFT_NOT_FOUND"
  | "INVALID_CONTENT"
  | "ITEM_NOT_FOUND"
  | "NSE_ALREADY_CONFIGURED"
  | "REVISION_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
  | "STUDY_NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export type QuestionLibraryServiceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: QuestionLibraryErrorCode;
      fieldErrors?: QuestionLibraryFieldErrors;
      message: string;
      ok: false;
    };

export type LibraryItemProjection = LibraryItemRecord & {
  activeRevision: LibraryRevisionProjection | null;
  contentSummary: string;
  isSpecificToAnotherStudy: boolean;
  warning: string | null;
};

export type LibraryRevisionProjection = Omit<LibraryRevisionRecord, "contentJson"> & {
  content: LibraryContent;
};

type SaveFromScreenerInput = {
  actor: QuestionLibraryAdminActor | null;
  formInput: unknown;
  libraryRepository: QuestionLibraryRepository;
  screenerRepository: ScreenerRepository;
  studyId: string;
};

class LibraryInsertionFailure extends Error {
  constructor(
    readonly code: QuestionLibraryErrorCode,
    message: string
  ) {
    super(message);
  }
}

function isAdmin(actor: QuestionLibraryAdminActor | null): actor is QuestionLibraryAdminActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function unauthorizedResult<T>(): QuestionLibraryServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "Solo Administrador puede administrar la biblioteca.",
    ok: false
  };
}

function validationResult<T>(
  message: string,
  fieldErrors?: QuestionLibraryFieldErrors
): QuestionLibraryServiceResult<T> {
  return {
    code: "VALIDATION_ERROR",
    fieldErrors,
    message,
    ok: false
  };
}

function ensureAdmin<T>(
  actor: QuestionLibraryAdminActor | null
): QuestionLibraryServiceResult<T> | null {
  return isAdmin(actor) ? null : unauthorizedResult();
}

export async function listLibraryItemsForAdmin({
  actor,
  filters,
  repository,
  studyId
}: {
  actor: QuestionLibraryAdminActor | null;
  filters?: unknown;
  repository: QuestionLibraryRepository;
  studyId?: string;
}): Promise<QuestionLibraryServiceResult<LibraryItemProjection[]>> {
  const denied = ensureAdmin<LibraryItemProjection[]>(actor);

  if (denied) {
    return denied;
  }

  const parsedFilters = librarySearchInputSchema.safeParse(filters ?? {});

  if (!parsedFilters.success) {
    return validationResult(
      "Revisa los filtros de biblioteca.",
      parsedFilters.error.flatten().fieldErrors
    );
  }

  const items = await repository.listItems({
    ...parsedFilters.data,
    showForStudyId: studyId
  });

  return {
    data: items
      .map((item) => projectLibraryItem(item, studyId))
      .filter((item) => item.activeRevision)
      .filter((item) => matchesFilters(item, parsedFilters.data)),
    ok: true
  };
}

export async function getLibraryItemForAdmin({
  actor,
  itemId,
  repository
}: {
  actor: QuestionLibraryAdminActor | null;
  itemId: string;
  repository: QuestionLibraryRepository;
}): Promise<QuestionLibraryServiceResult<LibraryItemProjection & { revisions: LibraryRevisionProjection[] }>> {
  const denied = ensureAdmin<LibraryItemProjection & { revisions: LibraryRevisionProjection[] }>(actor);

  if (denied) {
    return denied;
  }

  const item = await repository.getItemById(itemId);

  if (!item) {
    return {
      code: "ITEM_NOT_FOUND",
      message: "El elemento de biblioteca no existe.",
      ok: false
    };
  }

  return {
    data: {
      ...projectLibraryItem(item),
      revisions: item.revisions.map(projectRevision).filter(Boolean) as LibraryRevisionProjection[]
    },
    ok: true
  };
}

export async function saveQuestionFromScreenerForAdmin({
  actor,
  formInput,
  libraryRepository,
  questionId,
  screenerRepository,
  studyId
}: SaveFromScreenerInput & {
  questionId: string;
}): Promise<QuestionLibraryServiceResult<{ item: LibraryItemRecord; revision: LibraryRevisionRecord }>> {
  const loaded = await loadDraftForLibraryMutation<{
    item: LibraryItemRecord;
    revision: LibraryRevisionRecord;
  }>({
    actor,
    screenerRepository,
    studyId
  });

  if (!loaded.ok) {
    return loaded;
  }

  const parsedInput = parseSaveInput(formInput);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  const question = loaded.data.definition.questions.find((item) => item.id === questionId);

  if (!question) {
    return {
      code: "VALIDATION_ERROR",
      message: "La pregunta seleccionada no existe en el borrador.",
      ok: false
    };
  }

  const content = buildQuestionLibraryContent({
    metadata: toContentMetadata(parsedInput.data),
    question
  });

  return createLibraryItemRevisionFromContent({
    actor: actor!,
    content,
    input: parsedInput.data,
    libraryRepository,
    sourceStudyId: studyId,
    type: "QUESTION"
  });
}

export async function saveBlockFromScreenerForAdmin({
  actor,
  formInput,
  libraryRepository,
  questionIds,
  screenerRepository,
  studyId
}: SaveFromScreenerInput & {
  questionIds: string[];
}): Promise<QuestionLibraryServiceResult<{ item: LibraryItemRecord; revision: LibraryRevisionRecord }>> {
  const loaded = await loadDraftForLibraryMutation<{
    item: LibraryItemRecord;
    revision: LibraryRevisionRecord;
  }>({
    actor,
    screenerRepository,
    studyId
  });

  if (!loaded.ok) {
    return loaded;
  }

  const parsedInput = parseSaveInput(formInput);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  let content: LibraryContent;

  try {
    content = buildBlockLibraryContent({
      definition: loaded.data.definition,
      metadata: toContentMetadata(parsedInput.data),
      questionIds
    });
  } catch (error) {
    return {
      code: "BLOCK_HAS_EXTERNAL_RULE",
      message:
        error instanceof Error
          ? error.message
          : "El bloque contiene reglas que no se pueden guardar.",
      ok: false
    };
  }

  return createLibraryItemRevisionFromContent({
    actor: actor!,
    content,
    input: parsedInput.data,
    libraryRepository,
    sourceStudyId: studyId,
    type: "BLOCK_TEMPLATE"
  });
}

export async function createLibraryRevisionForAdmin({
  actor,
  content,
  libraryItemId,
  repository
}: {
  actor: QuestionLibraryAdminActor | null;
  content: unknown;
  libraryItemId: string;
  repository: QuestionLibraryRepository;
}): Promise<QuestionLibraryServiceResult<LibraryRevisionRecord>> {
  const denied = ensureAdmin<LibraryRevisionRecord>(actor);

  if (denied) {
    return denied;
  }

  const item = await repository.getItemById(libraryItemId);

  if (!item || item.status !== "ACTIVE") {
    return {
      code: "ITEM_NOT_FOUND",
      message: "El elemento de biblioteca no existe o ya fue retirado.",
      ok: false
    };
  }

  const activeRevision = item.revisions.find((revision) => revision.status === "ACTIVE");

  if (!activeRevision) {
    return {
      code: "REVISION_NOT_FOUND",
      message: "El elemento no tiene una revision activa para reemplazar.",
      ok: false
    };
  }

  let parsedContent: LibraryContent;

  try {
    parsedContent = parseLibraryContent(content);
  } catch (error) {
    return {
      code: "INVALID_CONTENT",
      message: error instanceof Error ? error.message : "El contenido no es valido.",
      ok: false
    };
  }

  if (
    (item.type === "QUESTION" && parsedContent.kind !== "QUESTION") ||
    (item.type === "BLOCK_TEMPLATE" && parsedContent.kind !== "BLOCK")
  ) {
    return {
      code: "INVALID_CONTENT",
      message: "El tipo de contenido no coincide con el elemento de biblioteca.",
      ok: false
    };
  }

  const revision = await repository.createRevision({
    contentHash: createLibraryContentHash(parsedContent),
    contentJson: parsedContent,
    createdByUserId: actor!.id,
    libraryItemId
  });

  return {
    data: revision,
    ok: true
  };
}

export async function updateLibraryItemMetadataForAdmin({
  actor,
  formInput,
  itemId,
  repository
}: {
  actor: QuestionLibraryAdminActor | null;
  formInput: unknown;
  itemId: string;
  repository: QuestionLibraryRepository;
}): Promise<QuestionLibraryServiceResult<LibraryItemRecord>> {
  const denied = ensureAdmin<LibraryItemRecord>(actor);

  if (denied) {
    return denied;
  }

  const parsedInput = parseSaveInput(formInput);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  const updated = await repository.updateItemMetadata({
    category: parsedInput.data.category,
    description: parsedInput.data.description,
    itemId,
    name: parsedInput.data.name,
    scope: parsedInput.data.scope,
    tags: parsedInput.data.tags
  } satisfies UpdateLibraryItemMetadataInput);

  if (!updated) {
    return {
      code: "ITEM_NOT_FOUND",
      message: "El elemento de biblioteca no existe o ya fue retirado.",
      ok: false
    };
  }

  return {
    data: updated,
    ok: true
  };
}

export async function retireLibraryRevisionForAdmin({
  actor,
  repository,
  revisionId
}: {
  actor: QuestionLibraryAdminActor | null;
  repository: QuestionLibraryRepository;
  revisionId: string;
}): Promise<QuestionLibraryServiceResult<{ retired: true }>> {
  const denied = ensureAdmin<{ retired: true }>(actor);

  if (denied) {
    return denied;
  }

  const retiredCount = await repository.retireRevision({
    retiredByUserId: actor!.id,
    revisionId
  });

  if (retiredCount !== 1) {
    return {
      code: "REVISION_NOT_FOUND",
      message: "La revision no existe o ya fue retirada.",
      ok: false
    };
  }

  return {
    data: { retired: true },
    ok: true
  };
}

export async function insertLibraryRevisionIntoScreenerForAdmin({
  actor,
  libraryRepository,
  revisionId,
  studyId
}: {
  actor: QuestionLibraryAdminActor | null;
  libraryRepository: QuestionLibraryRepository;
  revisionId: string;
  studyId: string;
}): Promise<
  QuestionLibraryServiceResult<{
    idMap: { questions: Record<string, string>; rules: Record<string, string> };
    renamedQuestionIds: Array<{ from: string; to: string }>;
  }>
> {
  const denied = ensureAdmin<{
    idMap: { questions: Record<string, string>; rules: Record<string, string> };
    renamedQuestionIds: Array<{ from: string; to: string }>;
  }>(actor);

  if (denied) {
    return denied;
  }

  try {
    const transactionResult = await libraryRepository.insertRevisionIntoDraft({
      buildDraftUpdate: ({ draft, revision }) => {
        let content: LibraryContent;

        try {
          content = parseLibraryContent(revision.contentJson);
        } catch (error) {
          throw new LibraryInsertionFailure(
            "INVALID_CONTENT",
            error instanceof Error ? error.message : "La revision no contiene un bloque valido."
          );
        }

        let inserted;

        try {
          inserted = insertLibraryContentIntoDefinition({
            content,
            destination: parseScreenerDefinition(draft.definitionJson)
          });
        } catch (error) {
          throw new LibraryInsertionFailure(
            error instanceof Error && error.message.includes("NSE")
              ? "NSE_ALREADY_CONFIGURED"
              : "VALIDATION_ERROR",
            error instanceof Error ? error.message : "No se pudo insertar desde biblioteca."
          );
        }

        return {
          definitionJson: inserted.definition,
          idMapJson: inserted.idMap,
          insertedContentHash: inserted.insertedContentHash,
          name: inserted.definition.title,
          payload: {
            idMap: inserted.idMap,
            renamedQuestionIds: inserted.renamedQuestionIds
          }
        };
      },
      insertedByUserId: actor!.id,
      revisionId,
      studyId
    });

    if (!transactionResult.ok) {
      return mapInsertionFailure(transactionResult.reason);
    }

    return {
      data: transactionResult.payload,
      ok: true
    };
  } catch (error) {
    if (error instanceof LibraryInsertionFailure) {
      return {
        code: error.code,
        message: error.message,
        ok: false
      };
    }

    throw error;
  }
}

function mapInsertionFailure<T>(
  reason: InsertLibraryRevisionFailureReason
): QuestionLibraryServiceResult<T> {
  switch (reason) {
    case "CROSS_STUDY":
      return {
        code: "CROSS_STUDY_LIBRARY_ITEM",
        message: "Este elemento es específico de otro estudio y no puede insertarse aquí.",
        ok: false
      };
    case "DRAFT_NOT_FOUND":
    case "DRAFT_UPDATE_FAILED":
      return {
        code: "DRAFT_NOT_FOUND",
        message: "El borrador destino no existe.",
        ok: false
      };
    case "REVISION_NOT_FOUND":
      return {
        code: "REVISION_NOT_FOUND",
        message: "La revision activa de biblioteca no existe.",
        ok: false
      };
    case "STUDY_NOT_DRAFT":
      return {
        code: "STUDY_NOT_DRAFT",
        message: "La biblioteca solo puede modificar borradores de estudios en borrador.",
        ok: false
      };
    case "STUDY_NOT_FOUND":
      return {
        code: "STUDY_NOT_FOUND",
        message: "El estudio no existe.",
        ok: false
      };
  }
}

async function loadDraftForLibraryMutation<T>({
  actor,
  screenerRepository,
  studyId
}: {
  actor: QuestionLibraryAdminActor | null;
  screenerRepository: ScreenerRepository;
  studyId: string;
}): Promise<QuestionLibraryServiceResult<{ builder: ScreenerBuilderData; definition: ScreenerDefinition; draft: ScreenerDraftRecord }>> {
  const denied = ensureAdmin<T>(actor);

  if (denied) {
    return denied as QuestionLibraryServiceResult<{
      builder: ScreenerBuilderData;
      definition: ScreenerDefinition;
      draft: ScreenerDraftRecord;
    }>;
  }

  const builder = await screenerRepository.getBuilderData(studyId);

  if (!builder) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  if (builder.study.status !== "DRAFT") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "La biblioteca solo puede modificar borradores de estudios en borrador.",
      ok: false
    };
  }

  if (!builder.draft) {
    return {
      code: "DRAFT_NOT_FOUND",
      message: "Primero crea el borrador del cuestionario de filtro.",
      ok: false
    };
  }

  return {
    data: {
      builder,
      definition: parseScreenerDefinition(builder.draft.definitionJson),
      draft: builder.draft
    },
    ok: true
  };
}

function parseSaveInput(formInput: unknown): QuestionLibraryServiceResult<LibrarySaveInput> {
  const parsed = librarySaveInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los datos del elemento de biblioteca.", parsed.error.flatten().fieldErrors);
  }

  return {
    data: parsed.data,
    ok: true
  };
}

async function createLibraryItemRevisionFromContent({
  actor,
  content,
  input,
  libraryRepository,
  sourceStudyId,
  type
}: {
  actor: QuestionLibraryAdminActor;
  content: LibraryContent;
  input: LibrarySaveInput;
  libraryRepository: QuestionLibraryRepository;
  sourceStudyId: string;
  type: LibraryItemType;
}): Promise<QuestionLibraryServiceResult<{ item: LibraryItemRecord; revision: LibraryRevisionRecord }>> {
  const contentHash = createLibraryContentHash(content);
  const result = await libraryRepository.createItemWithRevision({
    category: input.category,
    contentHash,
    contentJson: content,
    createdByUserId: actor.id,
    description: input.description,
    name: input.name,
    scope: input.scope,
    studyId: input.scope === "STUDY_SPECIFIC" ? sourceStudyId : null,
    tags: input.tags,
    type
  });

  return {
    data: result,
    ok: true
  };
}

function toContentMetadata(input: LibrarySaveInput) {
  return {
    category: input.category,
    description: input.description,
    isGenericContentConfirmed: input.scope === "GENERIC" ? input.confirmGeneric : false,
    tags: input.tags
  };
}

function projectLibraryItem(
  item: LibraryItemWithRevisions,
  studyId?: string
): LibraryItemProjection {
  const activeRevision = item.revisions.find((revision) => revision.status === "ACTIVE") ?? null;
  const projectedRevision = activeRevision ? projectRevision(activeRevision) : null;
  const isSpecificToAnotherStudy =
    item.scope === "STUDY_SPECIFIC" && Boolean(studyId) && item.studyId !== studyId;

  return {
    ...item,
    activeRevision: projectedRevision,
    contentSummary: projectedRevision ? summarizeContent(projectedRevision.content) : "Sin revision activa",
    isSpecificToAnotherStudy,
    warning: isSpecificToAnotherStudy
      ? "Este elemento es especifico de otro estudio. Revisa que no contenga criterios exclusivos antes de insertarlo."
      : null
  };
}

function projectRevision(revision: LibraryRevisionRecord): LibraryRevisionProjection | null {
  try {
    return {
      ...revision,
      content: parseLibraryContent(revision.contentJson)
    };
  } catch {
    return null;
  }
}

function summarizeContent(content: LibraryContent): string {
  if (content.kind === "QUESTION") {
    return `Pregunta: ${content.question.text}`;
  }

  const nseText = content.nse ? " Incluye NSE." : "";
  return `Bloque: ${content.questions.length} preguntas, ${content.rules.length} reglas.${nseText}`;
}

function matchesFilters(item: LibraryItemProjection, filters: LibrarySearchFilters): boolean {
  const query = filters.query?.toLowerCase();

  if (query) {
    const text = `${item.name} ${item.description ?? ""}`.toLowerCase();

    if (!text.includes(query)) {
      return false;
    }
  }

  if (filters.category && !item.category?.toLowerCase().includes(filters.category.toLowerCase())) {
    return false;
  }

  if (filters.tag && !item.tags.some((tag) => tag.toLowerCase() === filters.tag!.toLowerCase())) {
    return false;
  }

  if (filters.scope && item.scope !== filters.scope) {
    return false;
  }

  if (filters.type && item.type !== filters.type) {
    return false;
  }

  return true;
}
