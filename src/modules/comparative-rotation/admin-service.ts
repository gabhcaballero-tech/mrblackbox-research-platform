import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import { validateManualTwoArmRotation } from "./manual-rotation";
import {
  armAdminInputSchema,
  CANONICAL_COMPARATIVE_ARMS,
  type CanonicalArmCode,
  getParticipantLabelForOrder,
  normalizeTextForComparison,
  productAdminInputSchema,
  rotationPlanAdminInputSchema,
  updateArmAdminInputSchema,
  type ComparativeAdminFieldErrors
} from "./admin-validation";
import type {
  ComparativeArm,
  ComparativeConfigurationRepository,
  ComparativeProduct,
  ComparativeRotationPlan,
  ComparativeRotationPlanArm,
  ComparativeStudyConfig,
  CreateRotationPlanInput,
  RotationPlanArmInput,
  UpdateRotationPlanInput
} from "./admin-repository";
import {
  isPrismaForeignKeyConstraintError,
  isPrismaUniqueConstraintError
} from "./admin-repository";

export type ComparativeAdminActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type ComparativeAdminErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "STUDY_NOT_FOUND"
  | "STUDY_NOT_DRAFT"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_REFERENCED"
  | "DUPLICATE_INTERNAL_CODE"
  | "DUPLICATE_DISPLAY_LABEL"
  | "ARM_NOT_FOUND"
  | "ARM_REFERENCED"
  | "DUPLICATE_ARM_CODE"
  | "MAX_ARMS_REACHED"
  | "ROTATION_NOT_FOUND"
  | "ROTATION_PREREQUISITES_MISSING"
  | "DUPLICATE_ROTATION_CODE"
  | "INVALID_ROTATION_ASSIGNMENT"
  | "UNKNOWN_ERROR";

export type ComparativeServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      code: ComparativeAdminErrorCode;
      message: string;
      fieldErrors?: ComparativeAdminFieldErrors;
    };

type ServiceInput = {
  actor: ComparativeAdminActor | null;
  repository: ComparativeConfigurationRepository;
  studyId: string;
};

type MutateInput = ServiceInput & {
  formInput?: unknown;
};

type UpdateProductInput = MutateInput & {
  productId: string;
};

type ArmInput = MutateInput & {
  armCode?: CanonicalArmCode;
  armId?: string;
};

type RotationInput = MutateInput & {
  rotationPlanId?: string;
};

export type ComparativeChecklist = {
  productsCount: number;
  armsCount: number;
  activeRotationCount: number;
  canCreateRotation: boolean;
  rotationBlockReason: string | null;
};

export type AdminRotationProjection = {
  rotationCode: string;
  status: string;
  arms: Array<{
    armCode: string;
    armLabel: string;
    applicationOrder: number;
    internalCode: string;
    displayLabel: string;
    realName: string;
    participantVisibleLabel: string;
  }>;
};

export type FieldSafeRotationProjection = {
  rotationCode: string;
  arms: Array<{
    armCode: string;
    armLabel: string;
    applicationOrder: number;
    internalCode: string;
    displayLabel: string;
    participantVisibleLabel: string;
  }>;
};

export type ParticipantRotationProjection = {
  labels: string[];
};

function isAdmin(actor: ComparativeAdminActor | null): actor is ComparativeAdminActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "admin:access"));
}

function unauthorizedResult<T>(): ComparativeServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "Solo ADMIN puede configurar productos, brazos y rotaciones.",
    ok: false
  };
}

function validationResult<T>(
  message: string,
  fieldErrors?: ComparativeAdminFieldErrors
): ComparativeServiceResult<T> {
  return {
    code: "VALIDATION_ERROR",
    fieldErrors,
    message,
    ok: false
  };
}

function ensureAdmin<T>(actor: ComparativeAdminActor | null): ComparativeServiceResult<T> | null {
  return isAdmin(actor) ? null : unauthorizedResult();
}

async function loadConfigForAdmin<T>({
  actor,
  repository,
  studyId
}: ServiceInput): Promise<ComparativeServiceResult<ComparativeStudyConfig>> {
  const denied = ensureAdmin<T>(actor);

  if (denied) {
    return denied as ComparativeServiceResult<ComparativeStudyConfig>;
  }

  const config = await repository.getStudyConfig(studyId);

  if (!config) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  return {
    data: config,
    ok: true
  };
}

async function loadDraftConfigForAdmin<T>(
  input: ServiceInput
): Promise<ComparativeServiceResult<ComparativeStudyConfig>> {
  const result = await loadConfigForAdmin<T>(input);

  if (!result.ok) {
    return result;
  }

  if (result.data.study.status !== "DRAFT") {
    return {
      code: "STUDY_NOT_DRAFT",
      message: "Esta configuracion solo puede modificarse mientras el estudio esta en borrador.",
      ok: false
    };
  }

  return result;
}

function duplicateInternalCodeResult<T>(): ComparativeServiceResult<T> {
  return {
    code: "DUPLICATE_INTERNAL_CODE",
    fieldErrors: {
      internalCode: ["Ya existe un producto con ese codigo interno en el estudio."]
    },
    message: "Ya existe un producto con ese codigo interno en el estudio.",
    ok: false
  };
}

function duplicateDisplayLabelResult<T>(): ComparativeServiceResult<T> {
  return {
    code: "DUPLICATE_DISPLAY_LABEL",
    fieldErrors: {
      displayLabel: ["Ya existe un producto con esa etiqueta segura en el estudio."]
    },
    message: "Ya existe un producto con esa etiqueta segura en el estudio.",
    ok: false
  };
}

function hasDuplicateDisplayLabel(
  products: ComparativeProduct[],
  displayLabel: string,
  ignoredProductId?: string
): boolean {
  const nextLabel = normalizeTextForComparison(displayLabel);

  return products.some((product) => {
    return product.id !== ignoredProductId && normalizeTextForComparison(product.displayLabel) === nextLabel;
  });
}

function isProductReferenced(config: ComparativeStudyConfig, productId: string): boolean {
  return config.rotationPlans.some((plan) => {
    return plan.arms.some((arm) => arm.studyProductId === productId);
  });
}

function isArmReferenced(config: ComparativeStudyConfig, armId: string): boolean {
  return config.rotationPlans.some((plan) => {
    return plan.arms.some((arm) => arm.studyArmId === armId);
  });
}

function findCanonicalArm(config: ComparativeStudyConfig, code: CanonicalArmCode): ComparativeArm | null {
  return config.arms.find((arm) => arm.code === code) ?? null;
}

function findProduct(config: ComparativeStudyConfig, productId: string): ComparativeProduct | null {
  return config.products.find((product) => product.id === productId) ?? null;
}

function findRotationPlan(
  config: ComparativeStudyConfig,
  rotationPlanId: string
): ComparativeRotationPlan | null {
  return config.rotationPlans.find((plan) => plan.id === rotationPlanId) ?? null;
}

function getCanonicalSortOrder(code: CanonicalArmCode): number {
  return CANONICAL_COMPARATIVE_ARMS.find((arm) => arm.code === code)?.sortOrder ?? 99;
}

function activeRotationPlans(config: ComparativeStudyConfig): ComparativeRotationPlan[] {
  return config.rotationPlans.filter((plan) => plan.status === "ACTIVE");
}

export function buildComparativeChecklist(config: ComparativeStudyConfig): ComparativeChecklist {
  const productsCount = config.products.length;
  const armsCount = config.arms.filter((arm) => arm.code === "left" || arm.code === "right").length;
  const activeRotationCount = activeRotationPlans(config).length;

  let rotationBlockReason: string | null = null;

  if (armsCount !== 2) {
    rotationBlockReason = "Configura exactamente los dos brazos canonicos antes de crear rotaciones.";
  } else if (productsCount < 2) {
    rotationBlockReason = "Crea al menos dos productos antes de crear rotaciones.";
  }

  return {
    activeRotationCount,
    armsCount,
    canCreateRotation: rotationBlockReason === null,
    productsCount,
    rotationBlockReason
  };
}

export function projectAdminRotationPlan(plan: ComparativeRotationPlan): AdminRotationProjection {
  return {
    arms: plan.arms.map((arm) => ({
      applicationOrder: arm.applicationOrder,
      armCode: arm.studyArm.code,
      armLabel: arm.studyArm.label,
      displayLabel: arm.studyProduct.displayLabel,
      internalCode: arm.studyProduct.internalCode,
      participantVisibleLabel: arm.participantVisibleLabel,
      realName: arm.studyProduct.realName
    })),
    rotationCode: plan.rotationCode,
    status: plan.status
  };
}

export function projectFieldSafeRotationPlan(plan: ComparativeRotationPlan): FieldSafeRotationProjection {
  return {
    arms: plan.arms.map((arm) => ({
      applicationOrder: arm.applicationOrder,
      armCode: arm.studyArm.code,
      armLabel: arm.studyArm.label,
      displayLabel: arm.studyProduct.displayLabel,
      internalCode: arm.studyProduct.internalCode,
      participantVisibleLabel: arm.participantVisibleLabel
    })),
    rotationCode: plan.rotationCode
  };
}

export function projectParticipantRotationPlan(
  plan: ComparativeRotationPlan
): ParticipantRotationProjection {
  return {
    labels: [...plan.arms]
      .sort((left, right) => left.applicationOrder - right.applicationOrder)
      .map((arm) => arm.participantVisibleLabel)
  };
}

export async function getComparativeConfigurationForAdmin(
  input: ServiceInput
): Promise<ComparativeServiceResult<ComparativeStudyConfig>> {
  return loadConfigForAdmin(input);
}

export async function createProductForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: MutateInput): Promise<ComparativeServiceResult<{ created: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ created: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  const parsed = productAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los campos del producto.", parsed.error.flatten().fieldErrors);
  }

  if (hasDuplicateDisplayLabel(configResult.data.products, parsed.data.displayLabel)) {
    return duplicateDisplayLabelResult();
  }

  try {
    await repository.createProduct({
      ...parsed.data,
      isSensitive: true,
      studyId
    });

    return {
      data: { created: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateInternalCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo crear el producto.",
      ok: false
    };
  }
}

export async function updateProductForAdmin({
  actor,
  formInput,
  productId,
  repository,
  studyId
}: UpdateProductInput): Promise<ComparativeServiceResult<{ updated: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ updated: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!findProduct(configResult.data, productId)) {
    return {
      code: "PRODUCT_NOT_FOUND",
      message: "El producto no existe en este estudio.",
      ok: false
    };
  }

  const parsed = productAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los campos del producto.", parsed.error.flatten().fieldErrors);
  }

  if (hasDuplicateDisplayLabel(configResult.data.products, parsed.data.displayLabel, productId)) {
    return duplicateDisplayLabelResult();
  }

  try {
    const updated = await repository.updateProduct({
      ...parsed.data,
      productId,
      studyId
    });

    if (updated !== 1) {
      return {
        code: "PRODUCT_NOT_FOUND",
        message: "El producto no existe en este estudio.",
        ok: false
      };
    }

    return {
      data: { updated: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateInternalCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo actualizar el producto.",
      ok: false
    };
  }
}

export async function deleteProductForAdmin({
  actor,
  productId,
  repository,
  studyId
}: Omit<UpdateProductInput, "formInput">): Promise<ComparativeServiceResult<{ deleted: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ deleted: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!findProduct(configResult.data, productId)) {
    return {
      code: "PRODUCT_NOT_FOUND",
      message: "El producto no existe en este estudio.",
      ok: false
    };
  }

  if (isProductReferenced(configResult.data, productId)) {
    return {
      code: "PRODUCT_REFERENCED",
      message: "Primero modifica o retira la rotacion que usa este producto.",
      ok: false
    };
  }

  try {
    const deleted = await repository.deleteProduct({ productId, studyId });

    if (deleted !== 1) {
      return {
        code: "PRODUCT_NOT_FOUND",
        message: "El producto no existe en este estudio.",
        ok: false
      };
    }

    return {
      data: { deleted: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaForeignKeyConstraintError(error)) {
      return {
        code: "PRODUCT_REFERENCED",
        message: "Primero modifica o retira la rotacion que usa este producto.",
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo eliminar el producto.",
      ok: false
    };
  }
}

export async function createArmForAdmin({
  actor,
  armCode,
  formInput,
  repository,
  studyId
}: ArmInput): Promise<ComparativeServiceResult<{ created: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ created: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  const parsed = armAdminInputSchema.safeParse({
    ...(typeof formInput === "object" && formInput !== null ? formInput : {}),
    code: armCode
  });

  if (!parsed.success) {
    return validationResult("Revisa los campos del brazo.", parsed.error.flatten().fieldErrors);
  }

  if (findCanonicalArm(configResult.data, parsed.data.code)) {
    return {
      code: "DUPLICATE_ARM_CODE",
      message: "Ese brazo ya esta configurado.",
      ok: false
    };
  }

  if (configResult.data.arms.length >= 2) {
    return {
      code: "MAX_ARMS_REACHED",
      message: "V1 comparativa solo permite dos brazos.",
      ok: false
    };
  }

  try {
    await repository.createArm({
      ...parsed.data,
      sortOrder: getCanonicalSortOrder(parsed.data.code),
      studyId
    });

    return {
      data: { created: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return {
        code: "DUPLICATE_ARM_CODE",
        message: "Ese brazo ya esta configurado.",
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo crear el brazo.",
      ok: false
    };
  }
}

export async function updateArmForAdmin({
  actor,
  armId,
  formInput,
  repository,
  studyId
}: ArmInput): Promise<ComparativeServiceResult<{ updated: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ updated: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!armId || !configResult.data.arms.some((arm) => arm.id === armId)) {
    return {
      code: "ARM_NOT_FOUND",
      message: "El brazo no existe en este estudio.",
      ok: false
    };
  }

  const parsed = updateArmAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los campos del brazo.", parsed.error.flatten().fieldErrors);
  }

  const updated = await repository.updateArm({
    armId,
    label: parsed.data.label,
    studyId
  });

  if (updated !== 1) {
    return {
      code: "ARM_NOT_FOUND",
      message: "El brazo no existe en este estudio.",
      ok: false
    };
  }

  return {
    data: { updated: true },
    ok: true
  };
}

export async function deleteArmForAdmin({
  actor,
  armId,
  repository,
  studyId
}: Omit<ArmInput, "formInput" | "armCode">): Promise<ComparativeServiceResult<{ deleted: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ deleted: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!armId || !configResult.data.arms.some((arm) => arm.id === armId)) {
    return {
      code: "ARM_NOT_FOUND",
      message: "El brazo no existe en este estudio.",
      ok: false
    };
  }

  if (isArmReferenced(configResult.data, armId)) {
    return {
      code: "ARM_REFERENCED",
      message: "Primero modifica o retira la rotacion que usa este brazo.",
      ok: false
    };
  }

  try {
    const deleted = await repository.deleteArm({ armId, studyId });

    if (deleted !== 1) {
      return {
        code: "ARM_NOT_FOUND",
        message: "El brazo no existe en este estudio.",
        ok: false
      };
    }

    return {
      data: { deleted: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaForeignKeyConstraintError(error)) {
      return {
        code: "ARM_REFERENCED",
        message: "Primero modifica o retira la rotacion que usa este brazo.",
        ok: false
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo eliminar el brazo.",
      ok: false
    };
  }
}

function buildRotationPlanArms(
  config: ComparativeStudyConfig,
  input: {
    leftApplicationOrder: 1 | 2;
    leftProductId: string;
    rightApplicationOrder: 1 | 2;
    rightProductId: string;
    rotationCode: string;
  }
): ComparativeServiceResult<RotationPlanArmInput[]> {
  const leftArm = findCanonicalArm(config, "left");
  const rightArm = findCanonicalArm(config, "right");

  if (config.arms.length !== 2 || !leftArm || !rightArm || config.products.length < 2) {
    return {
      code: "ROTATION_PREREQUISITES_MISSING",
      message: buildComparativeChecklist(config).rotationBlockReason ?? "Faltan datos para crear rotaciones.",
      ok: false
    };
  }

  if (leftArm.id === rightArm.id) {
    return {
      code: "INVALID_ROTATION_ASSIGNMENT",
      message: "Cada asignacion debe usar un brazo distinto.",
      ok: false
    };
  }

  const leftProduct = findProduct(config, input.leftProductId);
  const rightProduct = findProduct(config, input.rightProductId);

  if (!leftProduct || !rightProduct) {
    return {
      code: "INVALID_ROTATION_ASSIGNMENT",
      message: "Los productos de la rotacion deben pertenecer al estudio actual.",
      ok: false
    };
  }

  if (
    leftArm.studyId !== config.study.id ||
    rightArm.studyId !== config.study.id ||
    leftProduct.studyId !== config.study.id ||
    rightProduct.studyId !== config.study.id
  ) {
    return {
      code: "INVALID_ROTATION_ASSIGNMENT",
      message: "Los productos y brazos de la rotacion deben pertenecer al estudio actual.",
      ok: false
    };
  }

  const validation = validateManualTwoArmRotation({
    arms: [
      {
        applicationOrder: input.leftApplicationOrder,
        armCode: "left",
        participantVisibleLabel: getParticipantLabelForOrder(input.leftApplicationOrder),
        realProductKey: leftProduct.internalCode
      },
      {
        applicationOrder: input.rightApplicationOrder,
        armCode: "right",
        participantVisibleLabel: getParticipantLabelForOrder(input.rightApplicationOrder),
        realProductKey: rightProduct.internalCode
      }
    ],
    assignmentMode: "manual_cover_code",
    rotationCode: input.rotationCode
  });

  if (!validation.success) {
    return {
      code: "INVALID_ROTATION_ASSIGNMENT",
      message: validation.errors.join(" "),
      ok: false
    };
  }

  return {
    data: [
      {
        applicationOrder: input.leftApplicationOrder,
        participantVisibleLabel: getParticipantLabelForOrder(input.leftApplicationOrder),
        studyArmId: leftArm.id,
        studyProductId: leftProduct.id
      },
      {
        applicationOrder: input.rightApplicationOrder,
        participantVisibleLabel: getParticipantLabelForOrder(input.rightApplicationOrder),
        studyArmId: rightArm.id,
        studyProductId: rightProduct.id
      }
    ],
    ok: true
  };
}

function hasDuplicateRotationCode(
  plans: ComparativeRotationPlan[],
  rotationCode: string,
  ignoredPlanId?: string
): boolean {
  return plans.some((plan) => plan.id !== ignoredPlanId && plan.rotationCode === rotationCode);
}

function duplicateRotationCodeResult<T>(): ComparativeServiceResult<T> {
  return {
    code: "DUPLICATE_ROTATION_CODE",
    fieldErrors: {
      rotationCode: ["Ya existe una rotacion con ese codigo en el estudio."]
    },
    message: "Ya existe una rotacion con ese codigo en el estudio.",
    ok: false
  };
}

export async function createRotationPlanForAdmin({
  actor,
  formInput,
  repository,
  studyId
}: MutateInput): Promise<ComparativeServiceResult<{ created: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ created: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  const parsed = rotationPlanAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los campos de la rotacion.", parsed.error.flatten().fieldErrors);
  }

  if (hasDuplicateRotationCode(configResult.data.rotationPlans, parsed.data.rotationCode)) {
    return duplicateRotationCodeResult();
  }

  const armsResult = buildRotationPlanArms(configResult.data, parsed.data);

  if (!armsResult.ok) {
    return armsResult;
  }

  const createInput: CreateRotationPlanInput = {
    arms: armsResult.data,
    rotationCode: parsed.data.rotationCode,
    studyId
  };

  try {
    await repository.createRotationPlan(createInput);

    return {
      data: { created: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateRotationCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo crear la rotacion.",
      ok: false
    };
  }
}

export async function updateRotationPlanForAdmin({
  actor,
  formInput,
  repository,
  rotationPlanId,
  studyId
}: RotationInput): Promise<ComparativeServiceResult<{ updated: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ updated: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!rotationPlanId || !findRotationPlan(configResult.data, rotationPlanId)) {
    return {
      code: "ROTATION_NOT_FOUND",
      message: "La rotacion no existe en este estudio.",
      ok: false
    };
  }

  const parsed = rotationPlanAdminInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return validationResult("Revisa los campos de la rotacion.", parsed.error.flatten().fieldErrors);
  }

  if (hasDuplicateRotationCode(configResult.data.rotationPlans, parsed.data.rotationCode, rotationPlanId)) {
    return duplicateRotationCodeResult();
  }

  const armsResult = buildRotationPlanArms(configResult.data, parsed.data);

  if (!armsResult.ok) {
    return armsResult;
  }

  const updateInput: UpdateRotationPlanInput = {
    arms: armsResult.data,
    rotationCode: parsed.data.rotationCode,
    rotationPlanId,
    studyId
  };

  try {
    const updated = await repository.updateRotationPlan(updateInput);

    if (updated !== 1) {
      return {
        code: "ROTATION_NOT_FOUND",
        message: "La rotacion no existe en este estudio.",
        ok: false
      };
    }

    return {
      data: { updated: true },
      ok: true
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return duplicateRotationCodeResult();
    }

    return {
      code: "UNKNOWN_ERROR",
      message: "No se pudo actualizar la rotacion.",
      ok: false
    };
  }
}

export async function retireRotationPlanForAdmin({
  actor,
  repository,
  rotationPlanId,
  studyId
}: Omit<RotationInput, "formInput">): Promise<ComparativeServiceResult<{ retired: true }>> {
  const configResult = await loadDraftConfigForAdmin<{ retired: true }>({ actor, repository, studyId });

  if (!configResult.ok) {
    return configResult;
  }

  if (!rotationPlanId || !findRotationPlan(configResult.data, rotationPlanId)) {
    return {
      code: "ROTATION_NOT_FOUND",
      message: "La rotacion no existe en este estudio.",
      ok: false
    };
  }

  const updated = await repository.retireRotationPlan({ rotationPlanId, studyId });

  if (updated !== 1) {
    return {
      code: "ROTATION_NOT_FOUND",
      message: "La rotacion no existe en este estudio.",
      ok: false
    };
  }

  return {
    data: { retired: true },
    ok: true
  };
}

export function getActiveRotationPlans(config: ComparativeStudyConfig): ComparativeRotationPlan[] {
  return activeRotationPlans(config);
}

export function orderRotationPlanArms(arms: ComparativeRotationPlanArm[]): ComparativeRotationPlanArm[] {
  return [...arms].sort((left, right) => left.applicationOrder - right.applicationOrder);
}
