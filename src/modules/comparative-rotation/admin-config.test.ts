import { describe, expect, it } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import type {
  ComparativeConfigurationRepository,
  ComparativeProduct,
  ComparativeRotationPlan,
  ComparativeStudyConfig,
  CreateArmInput,
  CreateProductInput,
  CreateRotationPlanInput
} from "./admin-repository";
import {
  buildComparativeChecklist,
  createArmForAdmin,
  createProductForAdmin,
  createRotationPlanForAdmin,
  getComparativeConfigurationForAdmin,
  projectFieldSafeRotationPlan,
  projectParticipantRotationPlan,
  retireRotationPlanForAdmin
} from "./admin-service";
import type { ComparativeAdminActor } from "./admin-service";

const studyId = "11111111-1111-4111-8111-111111111111";

const adminActor: ComparativeAdminActor = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "ADMIN",
  status: "ACTIVE"
};

function actor(role: InternalUserRole): ComparativeAdminActor {
  return {
    id: `actor-${role}`,
    role,
    status: "ACTIVE"
  };
}

function product(overrides: Partial<ComparativeProduct> = {}): ComparativeProduct {
  return {
    createdAt: new Date("2026-01-01T10:00:00Z"),
    displayLabel: "Muestra segura A",
    id: "product-a",
    internalCode: "PROD-A",
    isSensitive: true,
    realName: "Nombre real A",
    studyId,
    ...overrides
  };
}

function arm(overrides: Partial<ComparativeStudyConfig["arms"][number]> = {}) {
  return {
    code: "left",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    id: "arm-left",
    label: "Brazo izquierdo",
    sortOrder: 1,
    studyId,
    ...overrides
  };
}

function rotationPlan(overrides: Partial<ComparativeRotationPlan> = {}): ComparativeRotationPlan {
  const productA = product();
  const productB = product({
    displayLabel: "Muestra segura B",
    id: "product-b",
    internalCode: "PROD-B",
    realName: "Nombre real B"
  });
  const leftArm = arm();
  const rightArm = arm({
    code: "right",
    id: "arm-right",
    label: "Brazo derecho",
    sortOrder: 2
  });

  return {
    arms: [
      {
        applicationOrder: 1,
        id: "rotation-arm-left",
        participantVisibleLabel: "Primera fragancia",
        rotationPlanId: "rotation-1",
        studyArm: leftArm,
        studyArmId: leftArm.id,
        studyProduct: productA,
        studyProductId: productA.id
      },
      {
        applicationOrder: 2,
        id: "rotation-arm-right",
        participantVisibleLabel: "Segunda fragancia",
        rotationPlanId: "rotation-1",
        studyArm: rightArm,
        studyArmId: rightArm.id,
        studyProduct: productB,
        studyProductId: productB.id
      }
    ],
    assignmentModeAllowed: "MANUAL",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    id: "rotation-1",
    name: "ROT-01",
    rotationCode: "ROT-01",
    status: "ACTIVE",
    studyId,
    ...overrides
  };
}

function config(overrides: Partial<ComparativeStudyConfig> = {}): ComparativeStudyConfig {
  return {
    arms: [],
    products: [],
    rotationPlans: [],
    study: {
      code: "STUDY-01",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      id: studyId,
      name: "Estudio",
      status: "DRAFT",
      timeZoneIana: "America/Mexico_City",
      updatedAt: new Date("2026-01-01T10:00:00Z")
    },
    ...overrides
  };
}

function fakeRepository(
  currentConfig: ComparativeStudyConfig | null,
  hooks: {
    onCreateProduct?: (input: CreateProductInput) => void;
    onCreateArm?: (input: CreateArmInput) => void;
    onCreateRotation?: (input: CreateRotationPlanInput) => void;
  } = {}
): ComparativeConfigurationRepository {
  return {
    async createArm(input) {
      hooks.onCreateArm?.(input);
      currentConfig?.arms.push({
        code: input.code,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        id: `arm-${input.code}`,
        label: input.label,
        sortOrder: input.sortOrder,
        studyId: input.studyId
      });
    },
    async createProduct(input) {
      hooks.onCreateProduct?.(input);
      currentConfig?.products.push({
        createdAt: new Date("2026-01-01T10:00:00Z"),
        displayLabel: input.displayLabel,
        id: `product-${input.internalCode}`,
        internalCode: input.internalCode,
        isSensitive: input.isSensitive,
        realName: input.realName,
        studyId: input.studyId
      });
    },
    async createRotationPlan(input) {
      hooks.onCreateRotation?.(input);
      const plan = rotationPlan({
        arms: input.arms.map((rotationArm, index) => {
          const foundArm = currentConfig?.arms.find((item) => item.id === rotationArm.studyArmId);
          const foundProduct = currentConfig?.products.find(
            (item) => item.id === rotationArm.studyProductId
          );

          return {
            applicationOrder: rotationArm.applicationOrder,
            id: `rotation-arm-${index}`,
            participantVisibleLabel: rotationArm.participantVisibleLabel,
            rotationPlanId: `rotation-${input.rotationCode}`,
            studyArm: foundArm ?? arm(),
            studyArmId: rotationArm.studyArmId,
            studyProduct: foundProduct ?? product(),
            studyProductId: rotationArm.studyProductId
          };
        }),
        id: `rotation-${input.rotationCode}`,
        rotationCode: input.rotationCode
      });
      currentConfig?.rotationPlans.push(plan);
    },
    async deleteArm() {
      return 1;
    },
    async deleteProduct() {
      return 1;
    },
    async getStudyConfig() {
      return currentConfig;
    },
    async retireRotationPlan(input) {
      const plan = currentConfig?.rotationPlans.find((item) => item.id === input.rotationPlanId);

      if (!plan) {
        return 0;
      }

      plan.status = "INACTIVE";
      return 1;
    },
    async updateArm() {
      return 1;
    },
    async updateProduct() {
      return 1;
    },
    async updateRotationPlan() {
      return 1;
    }
  };
}

describe("comparative configuration authorization and study state", () => {
  it("allows ADMIN and denies non ADMIN", async () => {
    const current = config();

    await expect(
      getComparativeConfigurationForAdmin({
        actor: adminActor,
        repository: fakeRepository(current),
        studyId
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      getComparativeConfigurationForAdmin({
        actor: actor("SUPERVISOR"),
        repository: fakeRepository(current),
        studyId
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("reports a missing study", async () => {
    const result = await getComparativeConfigurationForAdmin({
      actor: adminActor,
      repository: fakeRepository(null),
      studyId
    });

    expect(result).toMatchObject({ code: "STUDY_NOT_FOUND", ok: false });
  });

  it("rejects mutations when the study is not DRAFT", async () => {
    const result = await createProductForAdmin({
      actor: adminActor,
      formInput: {
        displayLabel: "Muestra segura",
        internalCode: "PROD-01",
        realName: "Nombre real"
      },
      repository: fakeRepository(
        config({
          study: {
            ...config().study,
            status: "ACTIVE"
          }
        })
      ),
      studyId
    });

    expect(result).toMatchObject({ code: "STUDY_NOT_DRAFT", ok: false });
  });
});

describe("comparative products", () => {
  it("creates a valid product with normalized code and sensitive flag", async () => {
    let received: CreateProductInput | null = null;

    const result = await createProductForAdmin({
      actor: adminActor,
      formInput: {
        displayLabel: "  Muestra   segura  ",
        internalCode: " prod__01 ",
        realName: "  Nombre   real  "
      },
      repository: fakeRepository(config(), {
        onCreateProduct(input) {
          received = input;
        }
      }),
      studyId
    });

    expect(result).toMatchObject({ ok: true });
    expect(received).toMatchObject({
      displayLabel: "Muestra segura",
      internalCode: "PROD-01",
      isSensitive: true,
      realName: "Nombre real"
    });
  });

  it("rejects duplicate internal code and duplicate displayLabel", async () => {
    const duplicateCode = await createProductForAdmin({
      actor: adminActor,
      formInput: {
        displayLabel: "Muestra B",
        internalCode: "PROD-A",
        realName: "Nombre B"
      },
      repository: fakeRepository(config(), {
        onCreateProduct() {
          throw { code: "P2002" };
        }
      }),
      studyId
    });

    expect(duplicateCode).toMatchObject({ code: "DUPLICATE_INTERNAL_CODE", ok: false });

    const duplicateLabel = await createProductForAdmin({
      actor: adminActor,
      formInput: {
        displayLabel: "  muestra   segura a ",
        internalCode: "PROD-B",
        realName: "Nombre B"
      },
      repository: fakeRepository(
        config({
          products: [product()]
        })
      ),
      studyId
    });

    expect(duplicateLabel).toMatchObject({ code: "DUPLICATE_DISPLAY_LABEL", ok: false });
  });
});

describe("comparative arms", () => {
  it("does not allow a third arm", async () => {
    const result = await createArmForAdmin({
      actor: adminActor,
      armCode: "right",
      formInput: {
        label: "Brazo derecho"
      },
      repository: fakeRepository(
        config({
          arms: [
            arm(),
            arm({
              code: "legacy",
              id: "legacy-arm",
              sortOrder: 2
            })
          ]
        })
      ),
      studyId
    });

    expect(result).toMatchObject({ code: "MAX_ARMS_REACHED", ok: false });
  });
});

describe("manual rotation plans", () => {
  const productA = product();
  const productB = product({
    displayLabel: "Muestra segura B",
    id: "product-b",
    internalCode: "PROD-B",
    realName: "Nombre real B"
  });
  const leftArm = arm();
  const rightArm = arm({
    code: "right",
    id: "arm-right",
    label: "Brazo derecho",
    sortOrder: 2
  });

  function readyConfig(overrides: Partial<ComparativeStudyConfig> = {}) {
    return config({
      arms: [leftArm, rightArm],
      products: [productA, productB],
      ...overrides
    });
  }

  it("rejects rotation when there are not exactly two arms", async () => {
    const result = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productB.id,
        rotationCode: "ROT-01"
      },
      repository: fakeRepository(
        config({
          arms: [leftArm],
          products: [productA, productB]
        })
      ),
      studyId
    });

    expect(result).toMatchObject({ code: "ROTATION_PREREQUISITES_MISSING", ok: false });
  });

  it("creates a valid rotation with two products and two arms", async () => {
    let received: CreateRotationPlanInput | null = null;
    const result = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productB.id,
        rotationCode: " rot__01 "
      },
      repository: fakeRepository(readyConfig(), {
        onCreateRotation(input) {
          received = input;
        }
      }),
      studyId
    });

    expect(result).toMatchObject({ ok: true });
    expect(received).toMatchObject({
      rotationCode: "ROT-01",
      arms: [
        {
          applicationOrder: 1,
          participantVisibleLabel: "Primera fragancia",
          studyArmId: leftArm.id,
          studyProductId: productA.id
        },
        {
          applicationOrder: 2,
          participantVisibleLabel: "Segunda fragancia",
          studyArmId: rightArm.id,
          studyProductId: productB.id
        }
      ]
    });
  });

  it("rejects duplicate product, duplicate arm and duplicate order", async () => {
    const duplicateProduct = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productA.id,
        rotationCode: "ROT-02"
      },
      repository: fakeRepository(readyConfig()),
      studyId
    });

    expect(duplicateProduct).toMatchObject({ code: "INVALID_ROTATION_ASSIGNMENT", ok: false });

    const duplicateArm = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productB.id,
        rotationCode: "ROT-03"
      },
      repository: fakeRepository(
        readyConfig({
          arms: [
            leftArm,
            {
              ...rightArm,
              id: leftArm.id
            }
          ]
        })
      ),
      studyId
    });

    expect(duplicateArm).toMatchObject({ code: "INVALID_ROTATION_ASSIGNMENT", ok: false });

    const duplicateOrder = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 1,
        rightProductId: productB.id,
        rotationCode: "ROT-04"
      },
      repository: fakeRepository(readyConfig()),
      studyId
    });

    expect(duplicateOrder).toMatchObject({ code: "INVALID_ROTATION_ASSIGNMENT", ok: false });
  });

  it("rejects a product or arm from another study", async () => {
    const result = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productB.id,
        rotationCode: "ROT-05"
      },
      repository: fakeRepository(
        readyConfig({
          products: [
            productA,
            {
              ...productB,
              studyId: "other-study"
            }
          ]
        })
      ),
      studyId
    });

    expect(result).toMatchObject({ code: "INVALID_ROTATION_ASSIGNMENT", ok: false });
  });

  it("rejects duplicate rotationCode", async () => {
    const result = await createRotationPlanForAdmin({
      actor: adminActor,
      formInput: {
        leftApplicationOrder: 1,
        leftProductId: productA.id,
        rightApplicationOrder: 2,
        rightProductId: productB.id,
        rotationCode: "ROT-01"
      },
      repository: fakeRepository(
        readyConfig({
          rotationPlans: [rotationPlan()]
        })
      ),
      studyId
    });

    expect(result).toMatchObject({ code: "DUPLICATE_ROTATION_CODE", ok: false });
  });

  it("excludes retired rotations from active checklist count", async () => {
    const current = readyConfig({
      rotationPlans: [rotationPlan()]
    });

    expect(buildComparativeChecklist(current).activeRotationCount).toBe(1);

    const result = await retireRotationPlanForAdmin({
      actor: adminActor,
      repository: fakeRepository(current),
      rotationPlanId: "rotation-1",
      studyId
    });

    expect(result).toMatchObject({ ok: true });
    expect(buildComparativeChecklist(current).activeRotationCount).toBe(0);
  });
});

describe("safe projections", () => {
  it("does not expose realName in field safe projection", () => {
    const projection = projectFieldSafeRotationPlan(rotationPlan());

    expect(JSON.stringify(projection)).not.toContain("Nombre real");
    expect(projection.arms[0]).toMatchObject({
      displayLabel: "Muestra segura A",
      internalCode: "PROD-A"
    });
  });

  it("only exposes Primera/Segunda fragancia to participant", () => {
    const projection = projectParticipantRotationPlan(rotationPlan());

    expect(projection).toEqual({
      labels: ["Primera fragancia", "Segunda fragancia"]
    });
  });
});
