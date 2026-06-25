import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  canonicalizeScreenerDefinition,
  createEmptyScreenerDefinition,
  hashScreenerDefinition,
  parseScreenerDefinition,
  projectScreenerDefinitionForRole,
  screenerDefinitionSchema,
  validateScreenerDefinitionForPublication,
  type NseScoreTable,
  type ScreenerCondition,
  type ScreenerDefinition,
  type ScreenerOption,
  type ScreenerOptionAction,
  type ScreenerQuestion,
  type ScreenerRule,
  type ScreenerRuleOutcome
} from "./definition";
import type {
  ScreenerBuilderData,
  ScreenerDraftRecord,
  ScreenerRepository,
  ScreenerVersionRecord
} from "./repository";
import { isPrismaUniqueConstraintError } from "./repository";
import {
  screenerMetadataInputSchema,
  screenerNseInputSchema,
  screenerOptionInputSchema,
  screenerQuestionInputSchema,
  screenerRuleInputSchema,
  screenerVisibilityInputSchema,
  type ScreenerAdminFieldErrors,
  type ScreenerNseInput,
  type ScreenerOptionInput,
  type ScreenerQuestionInput,
  type ScreenerRuleInput,
  type ScreenerVisibilityInput
} from "./validation";

export type ScreenerAdminActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type ScreenerAdminErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "STUDY_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
  | "DRAFT_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "OPTION_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "DUPLICATE_VERSION_HASH"
  | "UNKNOWN_ERROR";

export type ScreenerServiceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: ScreenerAdminErrorCode;
      fieldErrors?: ScreenerAdminFieldErrors;
      message: string;
      ok: false;
    };

type ServiceInput = {
  actor: ScreenerAdminActor | null;
  repository: ScreenerRepository;
  studyId: string;
};

type DraftMutationInput = ServiceInput & {
  formInput?: unknown;
};

export type ScreenerVersionProjection = {
  definition: ScreenerDefinition;
  definitionHash: string;
  id: string;
  publishedAt: Date;
  readOnly: true;
  retiredAt: Date | null;
  status: "ACTIVE" | "RETIRED";
  versionNumber: number;
};

type LoadedDraftContext = {
  builder: ScreenerBuilderData;
  definition: ScreenerDefinition;
  draft: ScreenerDraftRecord;
};

function createConsentDefaultOptions(): ScreenerOption[] {
  return [
    {
      actions: [{ type: "CONTINUE" }],
      isOther: false,
      label: "Sí, acepto participar",
      order: 1,
      otherTextRequired: false,
      value: "SI"
    },
    {
      actions: [
        {
          code: "SIN_CONSENTIMIENTO",
          reason: "La persona no aceptó participar voluntariamente en el estudio.",
          type: "TERMINATE"
        }
      ],
      isOther: false,
      label: "No, no acepto participar",
      order: 2,
      otherTextRequired: false,
      value: "NO"
    }
  ];
}

function isAdmin(actor: ScreenerAdminActor | null): actor is ScreenerAdminActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function unauthorizedResult<T>(): ScreenerServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "Solo Administrador puede administrar el cuestionario de filtro.",
    ok: false
  };
}

function validationResult<T>(
  message: string,
  fieldErrors?: ScreenerAdminFieldErrors
): ScreenerServiceResult<T> {
  return {
    code: "VALIDATION_ERROR",
    fieldErrors,
    message,
    ok: false
  };
}

function ensureAdmin<T>(actor: ScreenerAdminActor | null): ScreenerServiceResult<T> | null {
  return isAdmin(actor) ? null : unauthorizedResult();
}

export async function getScreenerBuilderForAdmin({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ScreenerServiceResult<ScreenerBuilderData>> {
  const denied = ensureAdmin<ScreenerBuilderData>(actor);

  if (denied) {
    return denied;
  }

  const builder = await repository.getBuilderData(studyId);

  if (!builder) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  return {
    data: projectBuilderForSafeEditing(builder),
    ok: true
  };
}

export async function createScreenerDraftForAdmin({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ScreenerServiceResult<{ draftId: string }>> {
  const denied = ensureAdmin<{ draftId: string }>(actor);

  if (denied) {
    return denied;
  }

  const builder = await repository.getBuilderData(studyId);

  if (!builder) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  const editableBuilder = projectBuilderForSafeEditing(builder);

  if (editableBuilder.draft) {
    return {
      data: { draftId: editableBuilder.draft.id },
      ok: true
    };
  }

  if (builder.study.status !== "DRAFT" && builder.study.status !== "ACTIVE") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "Solo se puede crear un borrador si el estudio está en borrador o activo con una versión publicada.",
      ok: false
    };
  }

  const activeVersion = getActiveScreenerVersion(builder);

  if (builder.study.status === "ACTIVE" && !activeVersion) {
    return {
      code: "VERSION_NOT_FOUND",
      message: "No existe una versión activa para crear un nuevo borrador.",
      ok: false
    };
  }

  const definition =
    builder.study.status === "ACTIVE" && activeVersion
      ? parseScreenerDefinition(activeVersion.definitionJson)
      : createEmptyScreenerDefinition(`Filtro ${builder.study.code}`);
  const draft = await repository.createDraft({
    createdByUserId: actor!.id,
    definitionJson: definition,
    name: definition.title,
    studyId
  });

  return {
    data: { draftId: draft.id },
    ok: true
  };
}

export async function saveScreenerMetadataForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: DraftMutationInput): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerMetadataInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los metadatos del cuestionario de filtro.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      return {
        ...definition,
        description: parsed.data.description,
        title: parsed.data.title
      };
    },
    repository,
    studyId
  });
}

export async function addScreenerQuestionForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: DraftMutationInput): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerQuestionInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la pregunta.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      const order = nextOrder(definition.questions);
      const question = buildQuestion(parsed.data, order);

      return normalizeDefinitionOrders({
        ...definition,
        questions: [...definition.questions, question]
      });
    },
    repository,
    studyId
  });
}

export async function updateScreenerQuestionForAdmin({
  actor,
  formInput,
  questionId,
  repository,
  studyId
}: DraftMutationInput & { questionId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerQuestionInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la pregunta.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      const current = definition.questions.find((question) => question.id === questionId);

      if (!current) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      const nextQuestion = {
        ...buildQuestion(
          {
            ...parsed.data,
            id: questionId
          },
          current.order,
          "options" in current ? current.options : []
        ),
        visibilityCondition: current.visibilityCondition
      };

      return normalizeDefinitionOrders({
        ...definition,
        questions: definition.questions.map((question) =>
          question.id === questionId ? nextQuestion : question
        )
      });
    },
    repository,
    studyId
  });
}

export async function deleteScreenerQuestionForAdmin({
  actor,
  questionId,
  repository,
  studyId
}: ServiceInput & { questionId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      if (!definition.questions.some((question) => question.id === questionId)) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      return normalizeDefinitionOrders({
        ...definition,
        nse: definition.nse
          ? {
              ...definition.nse,
              inputs: definition.nse.inputs.filter((input) => input.questionId !== questionId)
            }
          : undefined,
        questions: definition.questions
          .filter((question) => question.id !== questionId)
          .map((question) =>
            question.visibilityCondition &&
            conditionReferencesQuestion(question.visibilityCondition, questionId)
              ? { ...question, visibilityCondition: undefined }
              : question
          ),
        rules: definition.rules.filter((rule) => !ruleReferencesQuestion(rule, questionId))
      });
    },
    repository,
    studyId
  });
}

export async function moveScreenerQuestionForAdmin({
  actor,
  direction,
  questionId,
  repository,
  studyId
}: ServiceInput & {
  direction: "down" | "up";
  questionId: string;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      const questions = [...definition.questions].sort((left, right) => left.order - right.order);
      const index = questions.findIndex((question) => question.id === questionId);

      if (index === -1) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= questions.length) {
        return definition;
      }

      [questions[index], questions[targetIndex]] = [questions[targetIndex], questions[index]];
      const reorderedQuestions = questions.map((question, nextIndex) => ({
        ...question,
        order: nextIndex + 1
      }));

      const nextDefinition = normalizeDefinitionOrders({
        ...definition,
        questions: reorderedQuestions
      });
      const visibilityMoveError = getQuestionMoveVisibilityError(nextDefinition, questionId);

      if (visibilityMoveError) {
        throw new ScreenerServiceMutationError("VALIDATION_ERROR", visibilityMoveError);
      }

      return nextDefinition;
    },
    repository,
    studyId
  });
}

export async function addScreenerOptionForAdmin({
  actor,
  formInput,
  questionId,
  repository,
  studyId
}: DraftMutationInput & { questionId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerOptionInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la opción.", parsed.error.flatten().fieldErrors);
  }

  return mutateQuestionOptions({
    actor,
    mutateOptions(options) {
      return normalizeOptionOrders([...options, buildOption(parsed.data, nextOrder(options))]);
    },
    questionId,
    repository,
    studyId
  });
}

export async function updateScreenerOptionForAdmin({
  actor,
  formInput,
  optionValue,
  questionId,
  repository,
  studyId
}: DraftMutationInput & {
  optionValue: string;
  questionId: string;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerOptionInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la opción.", parsed.error.flatten().fieldErrors);
  }

  return mutateQuestionOptions({
    actor,
    mutateOptions(options) {
      const current = options.find((option) => option.value === optionValue);

      if (!current) {
        throw new ScreenerServiceMutationError("OPTION_NOT_FOUND", "La opción no existe.");
      }

      return normalizeOptionOrders(
        options.map((option) =>
          option.value === optionValue
            ? {
                ...buildOption({ ...parsed.data, value: optionValue }, current.order)
              }
            : option
        )
      );
    },
    questionId,
    repository,
    studyId
  });
}

export async function deleteScreenerOptionForAdmin({
  actor,
  optionValue,
  questionId,
  repository,
  studyId
}: ServiceInput & {
  optionValue: string;
  questionId: string;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateQuestionOptions({
    actor,
    mutateOptions(options) {
      if (!options.some((option) => option.value === optionValue)) {
        throw new ScreenerServiceMutationError("OPTION_NOT_FOUND", "La opción no existe.");
      }

      return normalizeOptionOrders(options.filter((option) => option.value !== optionValue));
    },
    questionId,
    repository,
    studyId
  });
}

export async function moveScreenerOptionForAdmin({
  actor,
  direction,
  optionValue,
  questionId,
  repository,
  studyId
}: ServiceInput & {
  direction: "down" | "up";
  optionValue: string;
  questionId: string;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateQuestionOptions({
    actor,
    mutateOptions(options) {
      const nextOptions = [...options].sort((left, right) => left.order - right.order);
      const index = nextOptions.findIndex((option) => option.value === optionValue);

      if (index === -1) {
        throw new ScreenerServiceMutationError("OPTION_NOT_FOUND", "La opción no existe.");
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= nextOptions.length) {
        return nextOptions;
      }

      [nextOptions[index], nextOptions[targetIndex]] = [nextOptions[targetIndex], nextOptions[index]];
      return normalizeOptionOrders(nextOptions);
    },
    questionId,
    repository,
    studyId
  });
}

export async function addConsentDefaultOptionsForAdmin({
  actor,
  questionId,
  repository,
  studyId
}: ServiceInput & { questionId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      let foundQuestion = false;
      const questions = definition.questions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        foundQuestion = true;

        if (question.type !== "CONSENT_YES_NO") {
          throw new ScreenerServiceMutationError(
            "VALIDATION_ERROR",
            "Las opciones predeterminadas solo aplican a preguntas de consentimiento."
          );
        }

        if (!("options" in question)) {
          throw new ScreenerServiceMutationError(
            "VALIDATION_ERROR",
            "La pregunta de consentimiento no admite opciones en este borrador."
          );
        }

        return {
          ...question,
          options: normalizeOptionOrders(mergeMissingConsentOptions(question.options)),
          required: true
        };
      });

      if (!foundQuestion) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      return {
        ...definition,
        questions
      };
    },
    repository,
    studyId
  });
}

export async function addScreenerRuleForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: DraftMutationInput): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerRuleInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la regla.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      const rule = buildRule(parsed.data, nextOrder(definition.rules));

      assertRuleQuestionExists(definition, rule);

      return normalizeDefinitionOrders({
        ...definition,
        rules: [...definition.rules, rule]
      });
    },
    repository,
    studyId
  });
}

export async function updateScreenerRuleForAdmin({
  actor,
  formInput,
  repository,
  ruleId,
  studyId
}: DraftMutationInput & { ruleId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerRuleInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la regla.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      const current = definition.rules.find((rule) => rule.id === ruleId);

      if (!current) {
        throw new ScreenerServiceMutationError("VALIDATION_ERROR", "La regla no existe.");
      }

      const rule = buildRule({ ...parsed.data, id: ruleId }, current.order);

      assertRuleQuestionExists(definition, rule);

      return normalizeDefinitionOrders({
        ...definition,
        rules: definition.rules.map((item) => (item.id === ruleId ? rule : item))
      });
    },
    repository,
    studyId
  });
}

export async function deleteScreenerRuleForAdmin({
  actor,
  repository,
  ruleId,
  studyId
}: ServiceInput & { ruleId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      return normalizeDefinitionOrders({
        ...definition,
        rules: definition.rules.filter((rule) => rule.id !== ruleId)
      });
    },
    repository,
    studyId
  });
}

export async function updateScreenerQuestionVisibilityForAdmin({
  actor,
  formInput,
  questionId,
  repository,
  studyId
}: DraftMutationInput & { questionId: string }): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerVisibilityInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa la visibilidad condicional.", parsed.error.flatten().fieldErrors);
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      let foundQuestion = false;
      const visibilityCondition =
        parsed.data.mode === "CONDITIONAL" ? buildCondition(parsed.data) : undefined;

      const questions = definition.questions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        foundQuestion = true;

        return {
          ...question,
          visibilityCondition
        };
      });

      if (!foundQuestion) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      return {
        ...definition,
        questions
      };
    },
    repository,
    studyId
  });
}

export async function saveScreenerNseForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: DraftMutationInput): Promise<ScreenerServiceResult<{ updated: true }>> {
  const parsed = screenerNseInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa el cálculo NSE.", parsed.error.flatten().fieldErrors);
  }

  let nse: NseScoreTable;

  try {
    nse = buildNse(parsed.data);
  } catch (error) {
    return validationResult(error instanceof Error ? error.message : "Revisa el cálculo NSE.");
  }

  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      return {
        ...definition,
        nse
      };
    },
    repository,
    studyId
  });
}

export async function clearScreenerNseForAdmin({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      return {
        ...definition,
        nse: undefined
      };
    },
    repository,
    studyId
  });
}

export async function publishScreenerForAdmin({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ScreenerServiceResult<{ retiredCount: number; version: ScreenerVersionRecord }>> {
  const loaded = await loadDraftContextForMutation<{ retiredCount: number; version: ScreenerVersionRecord }>({
    actor,
    repository,
    studyId
  });

  if (!loaded.ok) {
    return loaded;
  }

  let canonicalDefinition: ScreenerDefinition;
  let definitionHash: string;

  try {
    canonicalDefinition = canonicalizeScreenerDefinition(
      validateScreenerDefinitionForPublication(loaded.data.definition)
    );
    definitionHash = hashScreenerDefinition(canonicalDefinition);
  } catch (error) {
    return validationResult(
      error instanceof Error ? error.message : "El cuestionario de filtro no es publicable."
    );
  }

  try {
    const published = await repository.publishVersion({
      definitionHash,
      definitionJson: canonicalDefinition,
      draftId: loaded.data.draft.id,
      publishedByUserId: actor!.id,
      studyId
    });

    return {
      data: published,
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return {
        code: "DUPLICATE_VERSION_HASH",
        message: "Esta definición ya fue publicada para el estudio.",
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo publicar la versión.",
      ok: false
    };
  }
}

export async function retireScreenerVersionForAdmin({
  actor,
  repository,
  studyId,
  versionId
}: ServiceInput & { versionId: string }): Promise<ScreenerServiceResult<{ retired: true }>> {
  const builderResult = await loadDraftCapableBuilder<{ retired: true }>({
    actor,
    repository,
    studyId
  });

  if (!builderResult.ok) {
    return builderResult;
  }

  if (builderResult.data.study.status !== "DRAFT") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "Solo se puede retirar manualmente una versión mientras el estudio está en borrador.",
      ok: false
    };
  }

  const retired = await repository.retireVersion({
    retiredByUserId: actor!.id,
    studyId,
    versionId
  });

  if (retired !== 1) {
    return {
      code: "VERSION_NOT_FOUND",
      message: "La versión activa no existe o ya fue retirada.",
      ok: false
    };
  }

  return {
    data: { retired: true },
    ok: true
  };
}

export function projectScreenerVersionForAdmin(
  version: ScreenerVersionRecord
): ScreenerVersionProjection {
  return {
    definition: parseScreenerDefinition(version.definitionJson),
    definitionHash: version.definitionHash,
    id: version.id,
    publishedAt: version.publishedAt,
    readOnly: true,
    retiredAt: version.retiredAt,
    status: version.status,
    versionNumber: version.versionNumber
  };
}

export { projectScreenerDefinitionForRole };

async function loadDraftCapableBuilder<T>({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ScreenerServiceResult<ScreenerBuilderData>> {
  const denied = ensureAdmin<T>(actor);

  if (denied) {
    return denied as ScreenerServiceResult<ScreenerBuilderData>;
  }

  const builder = await repository.getBuilderData(studyId);

  if (!builder) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  const safeBuilder = projectBuilderForSafeEditing(builder);

  if (safeBuilder.study.status === "ACTIVE" && !safeBuilder.draft) {
    return {
      code: "DRAFT_NOT_FOUND",
      message: "Crea primero un borrador de nueva versión desde la versión activa.",
      ok: false
    };
  }

  if (safeBuilder.study.status !== "DRAFT" && safeBuilder.study.status !== "ACTIVE") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "El cuestionario de filtro solo puede modificarse mientras el estudio está en borrador o preparando una nueva versión.",
      ok: false
    };
  }

  return {
    data: safeBuilder,
    ok: true
  };
}

async function loadDraftContextForMutation<T>(
  input: ServiceInput
): Promise<ScreenerServiceResult<LoadedDraftContext>> {
  const builderResult = await loadDraftCapableBuilder<T>(input);

  if (!builderResult.ok) {
    return builderResult;
  }

  const draft = builderResult.data.draft;

  if (!draft) {
    return {
      code: "DRAFT_NOT_FOUND",
      message: "Primero crea el borrador del cuestionario de filtro.",
      ok: false
    };
  }

  return {
    data: {
      builder: builderResult.data,
      definition: parseScreenerDefinition(draft.definitionJson),
      draft
    },
    ok: true
  };
}

function projectBuilderForSafeEditing(builder: ScreenerBuilderData): ScreenerBuilderData {
  if (builder.study.status !== "ACTIVE") {
    return {
      ...builder
    };
  }

  const activeVersion = getActiveScreenerVersion(builder);
  const draft =
    builder.draft && activeVersion && builder.draft.createdAt > activeVersion.publishedAt ? builder.draft : null;

  return {
    ...builder,
    draft
  };
}

function getActiveScreenerVersion(builder: ScreenerBuilderData): ScreenerVersionRecord | null {
  return (
    [...builder.versions]
      .filter((version) => version.status === "ACTIVE")
      .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
  );
}

async function mutateDraftForAdmin({
  actor,
  mutate,
  repository,
  studyId
}: ServiceInput & {
  mutate: (definition: ScreenerDefinition) => ScreenerDefinition;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  const loaded = await loadDraftContextForMutation<{ updated: true }>({
    actor,
    repository,
    studyId
  });

  if (!loaded.ok) {
    return loaded;
  }

  try {
    const nextDefinition = screenerDefinitionSchema.parse(mutate(loaded.data.definition));
    const updated = await repository.updateDraft({
      definitionJson: nextDefinition,
      draftId: loaded.data.draft.id,
      name: nextDefinition.title,
      studyId,
      updatedByUserId: actor!.id
    });

    if (updated !== 1) {
      return {
        code: "DRAFT_NOT_FOUND",
        message: "El borrador del cuestionario de filtro no existe.",
        ok: false
      };
    }

    return {
      data: { updated: true },
      ok: true
    };
  } catch (error) {
    if (error instanceof ScreenerServiceMutationError) {
      return {
        code: error.code,
        message: error.message,
        ok: false
      };
    }

    return validationResult(
      error instanceof Error ? error.message : "La definición del cuestionario de filtro no es válida."
    );
  }
}

function mutateQuestionOptions({
  actor,
  mutateOptions,
  questionId,
  repository,
  studyId
}: ServiceInput & {
  mutateOptions: (options: ScreenerOption[]) => ScreenerOption[];
  questionId: string;
}): Promise<ScreenerServiceResult<{ updated: true }>> {
  return mutateDraftForAdmin({
    actor,
    mutate(definition) {
      let foundQuestion = false;
      const questions = definition.questions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        foundQuestion = true;

        if (!("options" in question)) {
          throw new ScreenerServiceMutationError(
            "VALIDATION_ERROR",
            "La pregunta no admite opciones."
          );
        }

        return {
          ...question,
          options: mutateOptions(question.options)
        };
      });

      if (!foundQuestion) {
        throw new ScreenerServiceMutationError("QUESTION_NOT_FOUND", "La pregunta no existe.");
      }

      return {
        ...definition,
        questions
      };
    },
    repository,
    studyId
  });
}

function buildQuestion(
  input: ScreenerQuestionInput,
  order: number,
  existingOptions: ScreenerOption[] = []
): ScreenerQuestion {
  const base = {
    dataDestination: input.dataDestination,
    helpText: input.helpText,
    id: input.id,
    order,
    profileBinding: input.profileBinding,
    required: input.type === "CONSENT_YES_NO" ? true : input.required,
    text: input.text,
    validation: compactObject({
      max: input.validationMax,
      maxLength: input.validationMaxLength,
      maxSelections: input.validationMaxSelections,
      min: input.validationMin,
      minLength: input.validationMinLength,
      minSelections: input.validationMinSelections
    })
  };

  if (input.type === "CONSENT_YES_NO") {
    return {
      ...base,
      options: existingOptions.length > 0 ? existingOptions : createConsentDefaultOptions(),
      type: input.type
    };
  }

  if (
    input.type === "SINGLE_CHOICE" ||
    input.type === "MULTIPLE_CHOICE" ||
    input.type === "INTERVIEWER_CHECKLIST"
  ) {
    return {
      ...base,
      options: existingOptions,
      type: input.type
    };
  }

  return {
    ...base,
    type: input.type
  };
}

function buildOption(input: ScreenerOptionInput, order: number): ScreenerOption {
  return {
    actions: buildOptionActions(input),
    isOther: input.isOther,
    label: input.label,
    order,
    otherTextMaxLength: input.otherTextMaxLength,
    otherTextRequired: input.otherTextRequired,
    value: input.value
  };
}

function buildOptionActions(input: ScreenerOptionInput): ScreenerOptionAction[] {
  if (input.actionType === "NONE") {
    return [];
  }

  if (input.actionType === "CONTINUE") {
    return [{ type: "CONTINUE" }];
  }

  if (!input.actionCode) {
    throw new Error("Las acciones requieren código.");
  }

  if (input.actionType === "FLAG") {
    return [
      {
        code: input.actionCode,
        requiresReview: input.actionRequiresReview,
        type: "FLAG"
      }
    ];
  }

  if (!input.actionReason) {
    throw new Error("Las acciones de terminación o revisión requieren motivo.");
  }

  return [
    {
      code: input.actionCode,
      reason: input.actionReason,
      type: input.actionType
    }
  ];
}

function buildRule(input: ScreenerRuleInput, order: number): ScreenerRule {
  return {
    condition: buildCondition(input),
    id: input.id,
    order,
    outcome: buildRuleOutcome(input)
  };
}

function buildCondition(input: ScreenerRuleInput | ScreenerVisibilityInput): ScreenerRule["condition"] {
  switch (input.conditionType) {
    case "ANSWER_EQUALS":
      return {
        questionId: input.questionId ?? "",
        type: "ANSWER_EQUALS",
        value: input.value ?? ""
      };
    case "ANY_SELECTED":
      return {
        questionId: input.questionId ?? "",
        type: "ANY_SELECTED",
        values: splitValues(input.values ?? input.value ?? "")
      };
    case "ALL_SELECTED":
      return {
        questionId: input.questionId ?? "",
        type: "ALL_SELECTED",
        values: splitValues(input.values ?? input.value ?? "")
      };
    case "NONE_SELECTED":
      return {
        questionId: input.questionId ?? "",
        type: "NONE_SELECTED",
        values: splitValues(input.values ?? input.value ?? "")
      };
    case "NUMBER_RANGE":
      return {
        max: input.max,
        min: input.min,
        questionId: input.questionId ?? "",
        type: "NUMBER_RANGE"
      };
  }
}

function buildRuleOutcome(input: ScreenerRuleInput): ScreenerRuleOutcome {
  if (!input.outcomeCode) {
    throw new Error("La regla requiere código de resultado.");
  }

  if (input.outcomeType === "FLAG") {
    return {
      code: input.outcomeCode,
      requiresReview: input.outcomeRequiresReview,
      type: "FLAG"
    };
  }

  if (!input.outcomeReason) {
    throw new Error("La regla requiere motivo.");
  }

  return {
    code: input.outcomeCode,
    reason: input.outcomeReason,
    type: input.outcomeType
  };
}

function buildNse(input: ScreenerNseInput): NseScoreTable {
  return {
    code: input.code,
    inputs: parseNseInputs(input.inputsText),
    label: input.label,
    ranges: parseNseRanges(input.rangesText),
    type: "score_table"
  };
}

function parseNseInputs(value: string): NseScoreTable["inputs"] {
  const inputs = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [questionId, scoresPart, missingPart] = line.split("|").map((part) => part.trim());

      if (!questionId || !scoresPart) {
        throw new Error("Formato de entradas NSE: questionId|valor=puntaje,valor=puntaje|missing=0.");
      }

      return {
        missingScore: missingPart?.startsWith("missing=")
          ? Number(missingPart.replace("missing=", ""))
          : 0,
        questionId,
        scoreByAnswer: Object.fromEntries(
          scoresPart.split(",").map((entry) => {
            const [answer, score] = entry.split("=").map((part) => part.trim());

            if (!answer || score === undefined || !Number.isFinite(Number(score))) {
              throw new Error("Cada puntaje NSE debe usar valor=puntaje.");
            }

            return [answer, Number(score)];
          })
        )
      };
    });

  const questionIds = new Set<string>();

  for (const input of inputs) {
    if (questionIds.has(input.questionId)) {
      throw new Error("Cada pregunta puede agregarse una sola vez al cálculo NSE.");
    }

    questionIds.add(input.questionId);

    if (!Number.isFinite(input.missingScore)) {
      throw new Error("El puntaje por respuesta faltante debe ser numérico.");
    }
  }

  return inputs;
}

function parseNseRanges(value: string): NseScoreTable["ranges"] {
  const ranges = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, label, min, max, eligible] = line.split("|").map((part) => part.trim());

      if (
        !code ||
        !label ||
        !Number.isFinite(Number(min)) ||
        !Number.isFinite(Number(max)) ||
        !eligible
      ) {
        throw new Error("Formato de rangos NSE: código|etiqueta|min|max|true.");
      }

      return {
        code,
        eligible: ["true", "si", "sí", "yes", "1"].includes(eligible.toLowerCase()),
        label,
        max: Number(max),
        min: Number(min)
      };
    });

  const codes = new Set<string>();

  for (const range of ranges) {
    if (codes.has(range.code)) {
      throw new Error("No puede haber dos rangos NSE con el mismo código.");
    }

    codes.add(range.code);

    if (!Number.isInteger(range.min) || !Number.isInteger(range.max)) {
      throw new Error("El puntaje mínimo y máximo de cada rango deben ser enteros.");
    }

    if (range.min > range.max) {
      throw new Error("El puntaje mínimo no puede ser mayor que el puntaje máximo.");
    }
  }

  const sortedRanges = [...ranges].sort((left, right) => left.min - right.min);

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const previous = sortedRanges[index - 1]!;
    const current = sortedRanges[index]!;

    if (current.min <= previous.max) {
      throw new Error("Los rangos NSE no pueden traslaparse.");
    }
  }

  if (!ranges.some((range) => range.eligible)) {
    throw new Error("Marca al menos un rango NSE como elegible.");
  }

  return ranges;
}

function normalizeDefinitionOrders(definition: ScreenerDefinition): ScreenerDefinition {
  return {
    ...definition,
    questions: definition.questions
      .sort((left, right) => left.order - right.order)
      .map((question, index) => {
        if ("options" in question) {
          return {
            ...question,
            options: normalizeOptionOrders(question.options),
            order: index + 1
          };
        }

        return {
          ...question,
          order: index + 1
        };
      }),
    rules: definition.rules
      .sort((left, right) => left.order - right.order)
      .map((rule, index) => ({
        ...rule,
        order: index + 1
      }))
  };
}

function normalizeOptionOrders(options: ScreenerOption[]): ScreenerOption[] {
  return options
    .sort((left, right) => left.order - right.order)
    .map((option, index) => ({
      ...option,
      order: index + 1
    }));
}

function mergeMissingConsentOptions(options: ScreenerOption[]): ScreenerOption[] {
  const existingValues = new Set(options.map((option) => option.value));
  const nextOptions = [...options];

  for (const defaultOption of createConsentDefaultOptions()) {
    if (!existingValues.has(defaultOption.value)) {
      nextOptions.push({
        ...defaultOption,
        order: nextOrder(nextOptions)
      });
    }
  }

  return nextOptions;
}

function nextOrder(items: Array<{ order: number }>): number {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.order)) + 1;
}

function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function ruleReferencesQuestion(rule: ScreenerRule, questionId: string): boolean {
  return conditionReferencesQuestion(rule.condition, questionId);
}

function assertRuleQuestionExists(definition: ScreenerDefinition, rule: ScreenerRule): void {
  const questionIds = new Set(definition.questions.map((question) => question.id));

  if (!conditionReferencesExistingQuestion(rule.condition, questionIds)) {
    throw new ScreenerServiceMutationError(
      "QUESTION_NOT_FOUND",
      "La pregunta seleccionada no existe en el borrador."
    );
  }
}

function conditionReferencesExistingQuestion(
  condition: ScreenerRule["condition"],
  questionIds: Set<string>
): boolean {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return condition.conditions.every((nestedCondition) =>
      conditionReferencesExistingQuestion(nestedCondition, questionIds)
    );
  }

  return questionIds.has(condition.questionId);
}

function conditionReferencesQuestion(condition: ScreenerRule["condition"], questionId: string): boolean {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return condition.conditions.some((nestedCondition) =>
      conditionReferencesQuestion(nestedCondition, questionId)
    );
  }

  return condition.questionId === questionId;
}

function getQuestionMoveVisibilityError(
  definition: ScreenerDefinition,
  movedQuestionId: string
): string | null {
  const questionsById = new Map(definition.questions.map((question) => [question.id, question]));

  for (const question of definition.questions) {
    if (!question.visibilityCondition) {
      continue;
    }

    const sourceQuestionIds = getConditionQuestionIds(question.visibilityCondition);

    for (const sourceQuestionId of sourceQuestionIds) {
      const sourceQuestion = questionsById.get(sourceQuestionId);

      if (!sourceQuestion) {
        continue;
      }

      if (sourceQuestion.order >= question.order) {
        if (question.id === movedQuestionId) {
          return "No se puede mover esta pregunta antes de la pregunta de la que depende.";
        }

        if (sourceQuestionId === movedQuestionId) {
          return "No se puede mover esta pregunta despues de una pregunta que depende de ella.";
        }

        return "No se pudo reordenar la pregunta porque romperia una dependencia de visibilidad.";
      }
    }
  }

  return null;
}

function getConditionQuestionIds(condition: ScreenerCondition): string[] {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return condition.conditions.flatMap(getConditionQuestionIds);
  }

  return [condition.questionId];
}

class ScreenerServiceMutationError extends Error {
  readonly code: ScreenerAdminErrorCode;

  constructor(code: ScreenerAdminErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
