import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import { validateScreenerDefinitionForPublication } from "@/modules/screener";
import type {
  CreateStudyRecordInput,
  StudiesRepository,
  StudyDeletionBlocker,
  StudyListMode,
  StudyListItem,
  StudyRiskState,
  UpdateDraftStudyRecordInput
} from "./repository";
import {
  isPrismaUniqueConstraintError,
  isStudyDeletionBlockedError,
  sortStudiesByCreatedAtDescending
} from "./repository";
import {
  studyAdminInputSchema,
  type StudyAdminFieldErrors,
  updateStudyAdminInputSchema
} from "./validation";

export type StudiesActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type StudyServiceErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "DUPLICATE_CODE"
  | "INVALID_CONFIRMATION"
  | "STUDY_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
  | "STUDY_HAS_OPERATIONAL_DATA"
  | "SCREENER_NOT_PUBLISHED"
  | "SCREENER_INVALID"
  | "CONCURRENT_UPDATE_FAILED"
  | "UNKNOWN_ERROR";

export type StudyServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      code: StudyServiceErrorCode;
      message: string;
      fieldErrors?: StudyAdminFieldErrors;
    };

type ListStudiesInput = {
  actor: StudiesActor | null;
  repository: StudiesRepository;
  mode?: StudyListMode;
};

type MutateStudyInput = {
  actor: StudiesActor | null;
  repository: StudiesRepository;
  formInput: unknown;
};

type StudyLifecycleInput = {
  actor: StudiesActor | null;
  confirmation: unknown;
  repository: StudiesRepository;
  studyId: string;
};

function isAdmin(actor: StudiesActor | null): actor is StudiesActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function unauthorizedResult<T>(): StudyServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "Solo Administrador puede administrar estudios.",
    ok: false
  };
}

function duplicateCodeResult<T>(): StudyServiceResult<T> {
  return {
    code: "DUPLICATE_CODE",
    fieldErrors: {
      code: ["Ya existe un estudio con ese código."]
    },
    message: "Ya existe un estudio con ese código.",
    ok: false
  };
}

function exactConfirmation(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function blockersMessage(blockers: StudyDeletionBlocker[]): string {
  const labels = blockers.map((blocker) => `${blocker.label} (${blocker.count})`);

  return `Este estudio ya tiene datos registrados. Para conservar trazabilidad solo puede archivarse. Relaciones: ${labels.join(", ")}.`;
}

export async function listStudiesForAdmin({
  actor,
  mode = "active",
  repository
}: ListStudiesInput): Promise<StudyServiceResult<StudyListItem[]>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const studies = await repository.listStudies(mode);

  return {
    data: sortStudiesByCreatedAtDescending(studies),
    ok: true
  };
}

export async function getStudyRiskForAdmin({
  actor,
  repository,
  studyId
}: {
  actor: StudiesActor | null;
  repository: StudiesRepository;
  studyId: string;
}): Promise<StudyServiceResult<StudyRiskState>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const study = await repository.getStudyRiskState(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  return {
    data: study,
    ok: true
  };
}

export async function archiveStudyForAdmin({
  actor,
  confirmation,
  repository,
  studyId
}: StudyLifecycleInput): Promise<StudyServiceResult<{ code: string; id: string; portalDisabled: boolean }>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  if (exactConfirmation(confirmation) !== "ARCHIVAR ESTUDIO") {
    return {
      code: "INVALID_CONFIRMATION",
      message: "Escribe ARCHIVAR ESTUDIO para confirmar.",
      ok: false
    };
  }

  const archived = await repository.archiveStudy(studyId);

  if (!archived) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  return {
    data: {
      code: archived.code,
      id: archived.id,
      portalDisabled: archived.portalDisabled
    },
    ok: true
  };
}

export async function deleteEmptyStudyForAdmin({
  actor,
  confirmation,
  repository,
  studyId
}: StudyLifecycleInput): Promise<StudyServiceResult<{ code: string; id: string }>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  if (exactConfirmation(confirmation) !== "ELIMINAR ESTUDIO") {
    return {
      code: "INVALID_CONFIRMATION",
      message: "Escribe ELIMINAR ESTUDIO para confirmar.",
      ok: false
    };
  }

  const risk = await repository.getStudyRiskState(studyId);

  if (!risk) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  if (risk.deletionBlockers.length > 0) {
    return {
      code: "STUDY_HAS_OPERATIONAL_DATA",
      message: blockersMessage(risk.deletionBlockers),
      ok: false
    };
  }

  try {
    const deleted = await repository.deleteEmptyStudy(studyId);

    if (!deleted) {
      return {
        code: "STUDY_NOT_FOUND",
        message: "El estudio no existe.",
        ok: false
      };
    }

    return {
      data: deleted,
      ok: true
    };
  } catch (error) {
    if (isStudyDeletionBlockedError(error)) {
      return {
        code: "STUDY_HAS_OPERATIONAL_DATA",
        message: blockersMessage(error.blockers),
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo eliminar el estudio de prueba.",
      ok: false
    };
  }
}

export async function createStudyForAdmin({
  actor,
  formInput,
  repository
}: MutateStudyInput): Promise<StudyServiceResult<StudyListItem>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const parsed = studyAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: "Revisa los campos del estudio.",
      ok: false
    };
  }

  const createInput: CreateStudyRecordInput = {
    ...parsed.data,
    createdByUserId: actor.id,
    status: "DRAFT"
  };

  try {
    const study = await repository.createStudy(createInput);

    return {
      data: study,
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo crear el estudio.",
      ok: false
    };
  }
}

export async function updateDraftStudyForAdmin({
  actor,
  formInput,
  repository
}: MutateStudyInput): Promise<StudyServiceResult<{ id: string }>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const parsed = updateStudyAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: "Revisa los campos del estudio.",
      ok: false
    };
  }

  const updateInput: UpdateDraftStudyRecordInput = parsed.data;

  try {
    const updatedCount = await repository.updateDraftStudy(updateInput);

    if (updatedCount === 1) {
      return {
        data: { id: updateInput.id },
        ok: true
      };
    }

    const study = await repository.findStudyEditState(updateInput.id);

    if (!study) {
      return {
        code: "STUDY_NOT_FOUND",
        message: "El estudio no existe.",
        ok: false
      };
    }

    if (study.status !== "DRAFT") {
      return {
        code: "STUDY_NOT_DRAFT",
        message: "Solo se pueden editar estudios en borrador.",
        ok: false
      };
    }

    return {
      code: "CONCURRENT_UPDATE_FAILED",
      message: "No se pudo actualizar el estudio. Intenta de nuevo.",
      ok: false
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo actualizar el estudio.",
      ok: false
    };
  }
}

export async function activateStudyForAdmin({
  actor,
  repository,
  studyId
}: {
  actor: StudiesActor | null;
  repository: StudiesRepository;
  studyId: string;
}): Promise<StudyServiceResult<{ id: string }>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const activationState = await repository.findStudyActivationState(studyId);

  if (!activationState) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  if (activationState.status !== "DRAFT") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "Solo se pueden activar estudios en borrador.",
      ok: false
    };
  }

  const activeScreener = activationState.questionnaireVersions[0];

  if (!activeScreener) {
    return {
      code: "SCREENER_NOT_PUBLISHED",
      message: "Publica un screener activo antes de activar el estudio.",
      ok: false
    };
  }

  try {
    validateScreenerDefinitionForPublication(activeScreener.definitionJson);
  } catch {
    return {
      code: "SCREENER_INVALID",
      message: "El screener publicado tiene errores críticos y no permite activar el estudio.",
      ok: false
    };
  }

  const updatedCount = await repository.activateStudy(studyId);

  if (updatedCount !== 1) {
    return {
      code: "CONCURRENT_UPDATE_FAILED",
      message: "No se pudo activar el estudio. Intenta de nuevo.",
      ok: false
    };
  }

  return {
    data: { id: studyId },
    ok: true
  };
}
