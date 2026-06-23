import { describe, expect, it } from "vitest";
import {
  assertLibraryContentIsSafe,
  buildBlockLibraryContent,
  buildQuestionLibraryContent,
  insertLibraryContentIntoDefinition,
  type LibraryContent
} from "./definition";
import {
  createLibraryRevisionForAdmin,
  insertLibraryRevisionIntoScreenerForAdmin,
  listLibraryItemsForAdmin,
  saveBlockFromScreenerForAdmin,
  saveQuestionFromScreenerForAdmin
} from "./service";
import type {
  LibraryItemRecord,
  LibraryItemWithRevisions,
  LibraryRevisionRecord,
  QuestionLibraryRepository
} from "./repository";
import type { ScreenerDefinition } from "@/modules/screener";
import type { ScreenerBuilderData, ScreenerRepository } from "@/modules/screener/repository";

const admin = { id: "user-admin", role: "ADMIN", status: "ACTIVE" } as const;
const analyst = { id: "user-analyst", role: "ANALYST", status: "ACTIVE" } as const;

function baseDefinition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return {
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "GENERO",
        options: [
          {
            actions: [{ type: "CONTINUE" }],
            isOther: false,
            label: "Hombre",
            order: 1,
            otherTextRequired: false,
            value: "HOMBRE"
          },
          {
            actions: [
              {
                code: "GENERO_NO_ELEGIBLE",
                reason: "El estudio esta dirigido a hombres.",
                type: "TERMINATE"
              }
            ],
            isOther: false,
            label: "Mujer",
            order: 2,
            otherTextRequired: false,
            value: "MUJER"
          }
        ],
        order: 1,
        required: true,
        text: "Genero",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "EDAD",
        order: 2,
        required: true,
        text: "Edad",
        type: "INTEGER",
        validation: { max: 80, min: 18 }
      },
      {
        dataDestination: "SCREENING",
        id: "FRECUENCIA",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Diario",
            order: 1,
            otherTextRequired: false,
            value: "DIARIO"
          }
        ],
        order: 3,
        required: true,
        text: "Frecuencia de uso",
        type: "MULTIPLE_CHOICE",
        validation: {}
      }
    ],
    rules: [
      {
        condition: {
          max: 19,
          min: 0,
          questionId: "EDAD",
          type: "NUMBER_RANGE"
        },
        id: "EDAD_MENOR",
        order: 1,
        outcome: {
          code: "EDAD_MENOR",
          reason: "Edad menor al rango.",
          type: "TERMINATE"
        }
      }
    ],
    schemaVersion: "screening.v1",
    title: "Filtro",
    ...overrides
  };
}

type LibraryMemoryScreener = {
  builder: ScreenerBuilderData;
  updates: ScreenerDefinition[];
};

function createLibraryMemory(
  initialItems: LibraryItemWithRevisions[] = [],
  options: {
    failRecordDraftUse?: boolean;
    failUpdateDraft?: boolean;
    screener?: LibraryMemoryScreener;
  } = {}
) {
  const items = initialItems.map((item) => ({
    ...item,
    revisions: item.revisions.map((revision) => ({ ...revision }))
  }));
  const uses: unknown[] = [];
  const repository: QuestionLibraryRepository = {
    async createItemWithRevision(input) {
      const item: LibraryItemRecord = {
        category: input.category ?? null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: input.createdByUserId,
        description: input.description ?? null,
        id: `item-${items.length + 1}`,
        name: input.name,
        scope: input.scope,
        status: "ACTIVE",
        studyId: input.studyId,
        tags: input.tags,
        type: input.type,
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      };
      const revision: LibraryRevisionRecord = {
        contentHash: input.contentHash,
        contentJson: input.contentJson,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: input.createdByUserId,
        id: `revision-${items.length + 1}`,
        libraryItemId: item.id,
        retiredAt: null,
        retiredByUserId: null,
        revisionNumber: 1,
        status: "ACTIVE"
      };
      items.push({ ...item, revisions: [revision] });
      return { item, revision };
    },
    async createRevision(input) {
      const item = items.find((entry) => entry.id === input.libraryItemId);

      if (!item) {
        throw new Error("missing item");
      }

      for (const revision of item.revisions) {
        if (revision.status === "ACTIVE") {
          revision.status = "SUPERSEDED";
        }
      }

      const revision: LibraryRevisionRecord = {
        contentHash: input.contentHash,
        contentJson: input.contentJson,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        createdByUserId: input.createdByUserId,
        id: `revision-${item.revisions.length + 1}`,
        libraryItemId: item.id,
        retiredAt: null,
        retiredByUserId: null,
        revisionNumber: item.revisions.length + 1,
        status: "ACTIVE"
      };
      item.revisions.push(revision);
      return revision;
    },
    async getItemById(itemId) {
      return items.find((item) => item.id === itemId) ?? null;
    },
    async getRevisionWithItem(revisionId) {
      for (const item of items) {
        const revision = item.revisions.find((entry) => entry.id === revisionId);

        if (revision) {
          return { item, revision };
        }
      }

      return null;
    },
    async insertRevisionIntoDraft(input) {
      const screener = options.screener;

      if (!screener) {
        throw new Error("missing screener memory");
      }

      const draft = screener.builder.draft;
      const originalDefinition = draft ? cloneJson(draft.definitionJson) : null;
      const originalUsesLength = uses.length;
      const originalUpdatesLength = screener.updates.length;

      try {
        if (screener.builder.study.id !== input.studyId) {
          return { ok: false, reason: "STUDY_NOT_FOUND" } as const;
        }

        if (screener.builder.study.status !== "DRAFT") {
          return { ok: false, reason: "STUDY_NOT_DRAFT" } as const;
        }

        if (!draft) {
          return { ok: false, reason: "DRAFT_NOT_FOUND" } as const;
        }

        const revisionResult = await repository.getRevisionWithItem(input.revisionId);

        if (!revisionResult || revisionResult.revision.status !== "ACTIVE") {
          return { ok: false, reason: "REVISION_NOT_FOUND" } as const;
        }

        if (
          revisionResult.item.scope === "STUDY_SPECIFIC" &&
          revisionResult.item.studyId !== input.studyId
        ) {
          return { ok: false, reason: "CROSS_STUDY" } as const;
        }

        const built = input.buildDraftUpdate({
          draft,
          item: revisionResult.item,
          revision: revisionResult.revision,
          study: screener.builder.study
        });

        if (options.failUpdateDraft) {
          return { ok: false, reason: "DRAFT_UPDATE_FAILED" } as const;
        }

        screener.updates.push(built.definitionJson);
        draft.definitionJson = built.definitionJson;

        if (options.failRecordDraftUse) {
          throw new Error("trace failed");
        }

        uses.push({
          idMapJson: built.idMapJson,
          insertedByUserId: input.insertedByUserId,
          insertedContentHash: built.insertedContentHash,
          libraryItemRevisionId: input.revisionId,
          questionnaireDraftId: draft.id
        });

        return {
          ok: true,
          payload: built.payload
        } as const;
      } catch (error) {
        if (draft && originalDefinition) {
          draft.definitionJson = originalDefinition;
        }

        uses.splice(originalUsesLength);
        screener.updates.splice(originalUpdatesLength);
        throw error;
      }
    },
    async listItems() {
      return items;
    },
    async recordDraftUse(input) {
      uses.push(input);
    },
    async retireRevision(input) {
      for (const item of items) {
        const revision = item.revisions.find((entry) => entry.id === input.revisionId);

        if (revision && revision.status !== "RETIRED") {
          revision.status = "RETIRED";
          revision.retiredAt = new Date("2026-01-03T00:00:00.000Z");
          revision.retiredByUserId = input.retiredByUserId;
          return 1;
        }
      }

      return 0;
    }
  };

  return { items, repository, uses };
}

function createScreenerMemory(definition = baseDefinition(), status: "ACTIVE" | "DRAFT" = "DRAFT") {
  const builder: ScreenerBuilderData = {
    draft: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: "user-admin",
      definitionJson: definition,
      id: "draft-1",
      name: "Filtro",
      purpose: "SCREENER",
      status: "DRAFT",
      studyId: "study-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedByUserId: null
    },
    study: {
      code: "STUDY",
      id: "study-1",
      name: "Study",
      status,
      timeZoneIana: "America/Mexico_City"
    },
    versions: []
  };
  const updates: ScreenerDefinition[] = [];
  const repository: ScreenerRepository = {
    async createDraft() {
      throw new Error("not needed");
    },
    async getBuilderData() {
      return builder;
    },
    async publishVersion() {
      throw new Error("not needed");
    },
    async retireVersion() {
      return 0;
    },
    async updateDraft(input) {
      updates.push(input.definitionJson);
      builder.draft!.definitionJson = input.definitionJson;
      return 1;
    }
  };

  return { builder, repository, updates };
}

function saveInput(overrides = {}) {
  return {
    category: "Demograficos",
    confirmGeneric: false,
    description: "Contenido base",
    name: "Pregunta reutilizable",
    scope: "STUDY_SPECIFIC",
    tags: ["perfil", "filtro"],
    ...overrides
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("question-library", () => {
  it("guarda una pregunta en biblioteca", async () => {
    const library = createLibraryMemory();
    const screener = createScreenerMemory();

    const result = await saveQuestionFromScreenerForAdmin({
      actor: admin,
      formInput: saveInput(),
      libraryRepository: library.repository,
      questionId: "GENERO",
      screenerRepository: screener.repository,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(library.items[0]?.type).toBe("QUESTION");
    expect(library.items[0]?.scope).toBe("STUDY_SPECIFIC");
    expect(library.items[0]?.studyId).toBe("study-1");
    expect(library.items[0]?.revisions[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("guarda un bloque con preguntas, opciones y acciones", async () => {
    const library = createLibraryMemory();
    const screener = createScreenerMemory();

    const result = await saveBlockFromScreenerForAdmin({
      actor: admin,
      formInput: saveInput({ name: "Bloque demografico" }),
      libraryRepository: library.repository,
      questionIds: ["GENERO", "EDAD"],
      screenerRepository: screener.repository,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    const content = library.items[0]?.revisions[0]?.contentJson as LibraryContent;
    expect(content.kind).toBe("BLOCK");
    expect(content.kind === "BLOCK" ? content.questions : []).toHaveLength(2);
    expect(content.kind === "BLOCK" ? content.rules : []).toHaveLength(1);
    expect(
      content.kind === "BLOCK" && "options" in content.questions[0]!
        ? content.questions[0]!.options[1]?.actions[0]?.type
        : null
    ).toBe("TERMINATE");
  });

  it("rechaza una regla que apunta fuera del bloque", () => {
    expect(() =>
      buildBlockLibraryContent({
        definition: baseDefinition({
          rules: [
            {
              condition: {
                conditions: [
                  { max: 19, min: 0, questionId: "EDAD", type: "NUMBER_RANGE" },
                  { questionId: "GENERO", type: "ANSWER_EQUALS", value: "HOMBRE" }
                ],
                type: "ALL"
              },
              id: "EDAD_Y_GENERO",
              order: 1,
              outcome: {
                code: "EDAD_Y_GENERO",
                reason: "Regla compuesta.",
                type: "TERMINATE"
              }
            }
          ]
        }),
        metadata: { isGenericContentConfirmed: false, tags: [] },
        questionIds: ["EDAD"]
      })
    ).toThrow(/fuera del bloque/);
  });

  it("guarda una nueva revision sin mutar el contenido de revisiones anteriores", async () => {
    const originalContent = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const library = createLibraryMemory();
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: originalContent,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "STUDY_SPECIFIC",
      studyId: "study-1",
      tags: [],
      type: "QUESTION"
    });
    const nextContent = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: { ...baseDefinition().questions[0]!, text: "Genero actualizado" }
    });

    const result = await createLibraryRevisionForAdmin({
      actor: admin,
      content: nextContent,
      libraryItemId: created.item.id,
      repository: library.repository
    });

    expect(result.ok).toBe(true);
    expect(library.items[0]?.revisions[0]?.status).toBe("SUPERSEDED");
    expect((library.items[0]?.revisions[0]?.contentJson as LibraryContent & { question: { text: string } }).question.text).toBe("Genero");
    expect(library.items[0]?.revisions[1]?.status).toBe("ACTIVE");
  });

  it("retira una revision sin borrarla", async () => {
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const library = createLibraryMemory();
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "STUDY_SPECIFIC",
      studyId: "study-1",
      tags: [],
      type: "QUESTION"
    });

    const retired = await library.repository.retireRevision({
      retiredByUserId: admin.id,
      revisionId: created.revision.id
    });

    expect(retired).toBe(1);
    expect(library.items[0]?.revisions).toHaveLength(1);
    expect(library.items[0]?.revisions[0]?.status).toBe("RETIRED");
  });

  it("inserta una copia independiente", () => {
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const destination = baseDefinition({ questions: [], rules: [] });

    const inserted = insertLibraryContentIntoDefinition({ content, destination });

    expect(inserted.definition.questions).toHaveLength(1);
    expect(inserted.definition.questions[0]).not.toBe(content.question);
    const localCopy = { ...inserted.definition.questions[0]!, text: "Cambio local" };
    expect(content.question.text).toBe("Genero");
    expect(localCopy.text).toBe("Cambio local");
  });

  it("remapea una colision de ID y actualiza reglas", () => {
    const content = buildBlockLibraryContent({
      definition: baseDefinition(),
      metadata: { isGenericContentConfirmed: false, tags: [] },
      questionIds: ["GENERO", "EDAD"]
    });
    const inserted = insertLibraryContentIntoDefinition({
      content,
      destination: baseDefinition()
    });

    expect(inserted.renamedQuestionIds).toContainEqual({ from: "GENERO", to: "GENERO_COPIA" });
    expect(inserted.renamedQuestionIds).toContainEqual({ from: "EDAD", to: "EDAD_COPIA" });
    expect(inserted.definition.rules.some((rule) => rule.id === "EDAD_MENOR_COPIA")).toBe(true);
    const copiedRule = inserted.definition.rules.find((rule) => rule.id === "EDAD_MENOR_COPIA");
    expect(copiedRule?.condition.type === "NUMBER_RANGE" ? copiedRule.condition.questionId : "").toBe("EDAD_COPIA");
  });

  it("inserta NSE solo cuando no existe NSE destino", () => {
    const definitionWithNse = baseDefinition({
      nse: {
        code: "NSE",
        inputs: [{ missingScore: 0, questionId: "GENERO", scoreByAnswer: { HOMBRE: 1, MUJER: 0 } }],
        label: "NSE",
        ranges: [{ code: "A", eligible: true, label: "A", max: 10, min: 0 }],
        type: "score_table"
      }
    });
    const content = buildBlockLibraryContent({
      definition: definitionWithNse,
      metadata: { isGenericContentConfirmed: false, tags: [] },
      questionIds: ["GENERO", "EDAD", "FRECUENCIA"]
    });
    const inserted = insertLibraryContentIntoDefinition({
      content,
      destination: baseDefinition({ questions: [], rules: [] })
    });

    expect(inserted.definition.nse?.code).toBe("NSE");
    expect(() =>
      insertLibraryContentIntoDefinition({
        content,
        destination: definitionWithNse
      })
    ).toThrow(/NSE/);
  });

  it("inserta STUDY_SPECIFIC del mismo estudio y registra trazabilidad", async () => {
    const screener = createScreenerMemory(baseDefinition({ questions: [], rules: [] }));
    const library = createLibraryMemory([], { screener });
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "STUDY_SPECIFIC",
      studyId: "study-1",
      tags: [],
      type: "QUESTION"
    });

    const result = await insertLibraryRevisionIntoScreenerForAdmin({
      actor: admin,
      libraryRepository: library.repository,
      revisionId: created.revision.id,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect((screener.builder.draft?.definitionJson as ScreenerDefinition).questions).toHaveLength(1);
    expect(library.uses).toHaveLength(1);
    expect(screener.updates).toHaveLength(1);
  });

  it("rechaza STUDY_SPECIFIC de otro estudio desde el servicio", async () => {
    const screener = createScreenerMemory(baseDefinition({ questions: [], rules: [] }));
    const library = createLibraryMemory([], { screener });
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "STUDY_SPECIFIC",
      studyId: "other-study",
      tags: [],
      type: "QUESTION"
    });

    const result = await insertLibraryRevisionIntoScreenerForAdmin({
      actor: admin,
      libraryRepository: library.repository,
      revisionId: created.revision.id,
      studyId: "study-1"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe(
      "Este elemento es específico de otro estudio y no puede insertarse aquí."
    );
    expect((screener.builder.draft?.definitionJson as ScreenerDefinition).questions).toHaveLength(0);
    expect(library.uses).toHaveLength(0);
  });

  it("permite insertar GENERIC en otro estudio", async () => {
    const screener = createScreenerMemory(baseDefinition({ questions: [], rules: [] }));
    const library = createLibraryMemory([], { screener });
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: true, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "GENERIC",
      studyId: null,
      tags: [],
      type: "QUESTION"
    });

    const result = await insertLibraryRevisionIntoScreenerForAdmin({
      actor: admin,
      libraryRepository: library.repository,
      revisionId: created.revision.id,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect((screener.builder.draft?.definitionJson as ScreenerDefinition).questions[0]?.id).toBe(
      "GENERO"
    );
    expect(library.uses).toHaveLength(1);
  });

  it("revierte el borrador si falla la trazabilidad", async () => {
    const screener = createScreenerMemory(baseDefinition({ questions: [], rules: [] }));
    const library = createLibraryMemory([], { failRecordDraftUse: true, screener });
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: true, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "GENERIC",
      studyId: null,
      tags: [],
      type: "QUESTION"
    });

    await expect(
      insertLibraryRevisionIntoScreenerForAdmin({
        actor: admin,
        libraryRepository: library.repository,
        revisionId: created.revision.id,
        studyId: "study-1"
      })
    ).rejects.toThrow("trace failed");

    expect((screener.builder.draft?.definitionJson as ScreenerDefinition).questions).toHaveLength(0);
    expect(screener.updates).toHaveLength(0);
    expect(library.uses).toHaveLength(0);
  });

  it("no crea trazabilidad si falla la actualizacion del borrador", async () => {
    const screener = createScreenerMemory(baseDefinition({ questions: [], rules: [] }));
    const library = createLibraryMemory([], { failUpdateDraft: true, screener });
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: true, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "GENERIC",
      studyId: null,
      tags: [],
      type: "QUESTION"
    });

    const result = await insertLibraryRevisionIntoScreenerForAdmin({
      actor: admin,
      libraryRepository: library.repository,
      revisionId: created.revision.id,
      studyId: "study-1"
    });

    expect(result.ok).toBe(false);
    expect((screener.builder.draft?.definitionJson as ScreenerDefinition).questions).toHaveLength(0);
    expect(screener.updates).toHaveLength(0);
    expect(library.uses).toHaveLength(0);
  });

  it("rechaza insercion si el estudio destino no esta en borrador", async () => {
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const screener = createScreenerMemory(baseDefinition(), "ACTIVE");
    const library = createLibraryMemory([], { screener });
    const created = await library.repository.createItemWithRevision({
      category: "Base",
      contentHash: "hash-1",
      contentJson: content,
      createdByUserId: admin.id,
      description: "Original",
      name: "Genero",
      scope: "GENERIC",
      studyId: null,
      tags: [],
      type: "QUESTION"
    });

    const result = await insertLibraryRevisionIntoScreenerForAdmin({
      actor: admin,
      libraryRepository: library.repository,
      revisionId: created.revision.id,
      studyId: "study-1"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.code).toBe("STUDY_NOT_DRAFT");
  });

  it("autoriza ADMIN y deniega no ADMIN", async () => {
    const library = createLibraryMemory();
    const screener = createScreenerMemory();

    const denied = await saveQuestionFromScreenerForAdmin({
      actor: analyst,
      formInput: saveInput(),
      libraryRepository: library.repository,
      questionId: "GENERO",
      screenerRepository: screener.repository,
      studyId: "study-1"
    });

    expect(denied.ok).toBe(false);
    expect(denied.ok ? "" : denied.code).toBe("UNAUTHORIZED");
  });

  it("busca por nombre, categoria y etiquetas", async () => {
    const content = buildQuestionLibraryContent({
      metadata: { category: "Demograficos", isGenericContentConfirmed: false, tags: ["perfil"] },
      question: baseDefinition().questions[0]!
    });
    const library = createLibraryMemory([
      {
        category: "Demograficos",
        createdAt: new Date(),
        createdByUserId: admin.id,
        description: "Base",
        id: "item-1",
        name: "Genero base",
        revisions: [
          {
            contentHash: "hash-1",
            contentJson: content,
            createdAt: new Date(),
            createdByUserId: admin.id,
            id: "revision-1",
            libraryItemId: "item-1",
            retiredAt: null,
            retiredByUserId: null,
            revisionNumber: 1,
            status: "ACTIVE"
          }
        ],
        scope: "GENERIC",
        status: "ACTIVE",
        studyId: null,
        tags: ["perfil"],
        type: "QUESTION",
        updatedAt: new Date()
      }
    ]);

    const result = await listLibraryItemsForAdmin({
      actor: admin,
      filters: { category: "demo", query: "genero", tag: "perfil" },
      repository: library.repository
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data : []).toHaveLength(1);
  });

  it("muestra advertencia para elementos especificos de otro estudio", async () => {
    const content = buildQuestionLibraryContent({
      metadata: { isGenericContentConfirmed: false, tags: [] },
      question: baseDefinition().questions[0]!
    });
    const library = createLibraryMemory([
      {
        category: null,
        createdAt: new Date(),
        createdByUserId: admin.id,
        description: null,
        id: "item-1",
        name: "Especifico",
        revisions: [
          {
            contentHash: "hash-1",
            contentJson: content,
            createdAt: new Date(),
            createdByUserId: admin.id,
            id: "revision-1",
            libraryItemId: "item-1",
            retiredAt: null,
            retiredByUserId: null,
            revisionNumber: 1,
            status: "ACTIVE"
          }
        ],
        scope: "STUDY_SPECIFIC",
        status: "ACTIVE",
        studyId: "other-study",
        tags: [],
        type: "QUESTION",
        updatedAt: new Date()
      }
    ]);

    const result = await listLibraryItemsForAdmin({
      actor: admin,
      repository: library.repository,
      studyId: "study-1"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data[0]?.warning : null).toMatch(/otro estudio/);
  });

  it("no permite guardar PII real, respuestas ni nombres reales de productos", () => {
    expect(() =>
      assertLibraryContentIsSafe({
        ...buildQuestionLibraryContent({
          metadata: { isGenericContentConfirmed: false, tags: [] },
          question: baseDefinition().questions[0]!
        }),
        realName: "Producto secreto"
      } as unknown as LibraryContent)
    ).toThrow(/sensibles/);
  });
});
