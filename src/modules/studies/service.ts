import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import type {
  CreateStudyRecordInput,
  StudiesRepository,
  StudyListItem,
  UpdateDraftStudyRecordInput
} from "./repository";
import {
  isPrismaUniqueConstraintError,
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
  | "STUDY_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
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
};

type MutateStudyInput = {
  actor: StudiesActor | null;
  repository: StudiesRepository;
  formInput: unknown;
};

function isAdmin(actor: StudiesActor | null): actor is StudiesActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function unauthorizedResult<T>(): StudyServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "Solo ADMIN puede administrar estudios.",
    ok: false
  };
}

function duplicateCodeResult<T>(): StudyServiceResult<T> {
  return {
    code: "DUPLICATE_CODE",
    fieldErrors: {
      code: ["Ya existe un estudio con ese codigo."]
    },
    message: "Ya existe un estudio con ese codigo.",
    ok: false
  };
}

export async function listStudiesForAdmin({
  actor,
  repository
}: ListStudiesInput): Promise<StudyServiceResult<StudyListItem[]>> {
  if (!isAdmin(actor)) {
    return unauthorizedResult();
  }

  const studies = await repository.listStudies();

  return {
    data: sortStudiesByCreatedAtDescending(studies),
    ok: true
  };
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
