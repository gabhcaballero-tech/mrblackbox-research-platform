import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { CanonicalArmCode } from "./admin-validation";

export type ComparativeStudyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type RotationPlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type RotationAssignmentModeAllowed = "MANUAL" | "AUTOMATIC" | "BOTH";

export type ComparativeStudySummary = {
  id: string;
  code: string;
  name: string;
  status: ComparativeStudyStatus;
  timeZoneIana: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ComparativeProduct = {
  id: string;
  studyId: string;
  internalCode: string;
  displayLabel: string;
  realName: string;
  isSensitive: boolean;
  createdAt: Date;
};

export type ComparativeArm = {
  id: string;
  studyId: string;
  code: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
};

export type ComparativeRotationPlanArm = {
  id: string;
  rotationPlanId: string;
  studyArmId: string;
  studyProductId: string;
  applicationOrder: number;
  participantVisibleLabel: string;
  studyArm: ComparativeArm;
  studyProduct: ComparativeProduct;
};

export type ComparativeRotationPlan = {
  id: string;
  studyId: string;
  rotationCode: string;
  name: string;
  assignmentModeAllowed: RotationAssignmentModeAllowed;
  status: RotationPlanStatus;
  createdAt: Date;
  arms: ComparativeRotationPlanArm[];
};

export type ComparativeStudyConfig = {
  study: ComparativeStudySummary;
  products: ComparativeProduct[];
  arms: ComparativeArm[];
  rotationPlans: ComparativeRotationPlan[];
};

export type CreateProductInput = {
  studyId: string;
  internalCode: string;
  displayLabel: string;
  realName: string;
  isSensitive: true;
};

export type UpdateProductInput = {
  studyId: string;
  productId: string;
  internalCode: string;
  displayLabel: string;
  realName: string;
};

export type DeleteProductInput = {
  studyId: string;
  productId: string;
};

export type CreateArmInput = {
  studyId: string;
  code: CanonicalArmCode;
  label: string;
  sortOrder: number;
};

export type UpdateArmInput = {
  studyId: string;
  armId: string;
  label: string;
};

export type DeleteArmInput = {
  studyId: string;
  armId: string;
};

export type RotationPlanArmInput = {
  studyArmId: string;
  studyProductId: string;
  applicationOrder: 1 | 2;
  participantVisibleLabel: string;
};

export type CreateRotationPlanInput = {
  studyId: string;
  rotationCode: string;
  arms: RotationPlanArmInput[];
};

export type UpdateRotationPlanInput = CreateRotationPlanInput & {
  rotationPlanId: string;
};

export type RetireRotationPlanInput = {
  studyId: string;
  rotationPlanId: string;
};

export type ComparativeConfigurationRepository = {
  getStudyConfig: (studyId: string) => Promise<ComparativeStudyConfig | null>;
  createProduct: (input: CreateProductInput) => Promise<void>;
  updateProduct: (input: UpdateProductInput) => Promise<number>;
  deleteProduct: (input: DeleteProductInput) => Promise<number>;
  createArm: (input: CreateArmInput) => Promise<void>;
  updateArm: (input: UpdateArmInput) => Promise<number>;
  deleteArm: (input: DeleteArmInput) => Promise<number>;
  createRotationPlan: (input: CreateRotationPlanInput) => Promise<void>;
  updateRotationPlan: (input: UpdateRotationPlanInput) => Promise<number>;
  retireRotationPlan: (input: RetireRotationPlanInput) => Promise<number>;
};

type ComparativeTransactionClient = {
  rotationPlan: {
    create: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  rotationPlanArm: {
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
};

type ComparativePrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (transaction: ComparativeTransactionClient) => Promise<T>) => Promise<T>;
  study: {
    findUnique: (args: unknown) => Promise<ComparativeStudyConfig | null>;
  };
  studyProduct: {
    create: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  studyArm: {
    create: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  rotationPlan: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const productSelect = {
  createdAt: true,
  displayLabel: true,
  id: true,
  internalCode: true,
  isSensitive: true,
  realName: true,
  studyId: true
} as const;

const armSelect = {
  code: true,
  createdAt: true,
  id: true,
  label: true,
  sortOrder: true,
  studyId: true
} as const;

const rotationPlanArmSelect = {
  applicationOrder: true,
  id: true,
  participantVisibleLabel: true,
  rotationPlanId: true,
  studyArm: {
    select: armSelect
  },
  studyArmId: true,
  studyProduct: {
    select: productSelect
  },
  studyProductId: true
} as const;

export function createComparativeConfigurationRepository(
  prismaClient?: ComparativePrismaClient
): ComparativeConfigurationRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as ComparativePrismaClient);
  }

  return {
    async createArm(input) {
      const prisma = await getPrisma();

      await prisma.studyArm.create({
        data: input
      });
    },
    async createProduct(input) {
      const prisma = await getPrisma();

      await prisma.studyProduct.create({
        data: input
      });
    },
    async createRotationPlan(input) {
      const prisma = await getPrisma();

      await prisma.$transaction(async (transaction) => {
        await transaction.rotationPlan.create({
          data: {
            assignmentModeAllowed: "MANUAL",
            arms: {
              create: input.arms
            },
            name: input.rotationCode,
            rotationCode: input.rotationCode,
            status: "ACTIVE",
            studyId: input.studyId
          }
        });
      });
    },
    async deleteArm(input) {
      const prisma = await getPrisma();
      const result = await prisma.studyArm.deleteMany({
        where: {
          id: input.armId,
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async deleteProduct(input) {
      const prisma = await getPrisma();
      const result = await prisma.studyProduct.deleteMany({
        where: {
          id: input.productId,
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async getStudyConfig(studyId) {
      const prisma = await getPrisma();

      return prisma.study.findUnique({
        select: {
          arms: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: armSelect
          },
          code: true,
          createdAt: true,
          id: true,
          name: true,
          products: {
            orderBy: [{ internalCode: "asc" }],
            select: productSelect
          },
          rotationPlans: {
            orderBy: [{ createdAt: "asc" }],
            select: {
              arms: {
                orderBy: [{ applicationOrder: "asc" }],
                select: rotationPlanArmSelect
              },
              assignmentModeAllowed: true,
              createdAt: true,
              id: true,
              name: true,
              rotationCode: true,
              status: true,
              studyId: true
            }
          },
          status: true,
          timeZoneIana: true,
          updatedAt: true
        },
        where: {
          id: studyId
        }
      });
    },
    async retireRotationPlan(input) {
      const prisma = await getPrisma();
      const result = await prisma.rotationPlan.updateMany({
        data: {
          status: "INACTIVE"
        },
        where: {
          id: input.rotationPlanId,
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async updateArm(input) {
      const prisma = await getPrisma();
      const result = await prisma.studyArm.updateMany({
        data: {
          label: input.label
        },
        where: {
          id: input.armId,
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async updateProduct(input) {
      const prisma = await getPrisma();
      const result = await prisma.studyProduct.updateMany({
        data: {
          displayLabel: input.displayLabel,
          internalCode: input.internalCode,
          realName: input.realName
        },
        where: {
          id: input.productId,
          studyId: input.studyId
        }
      });

      return result.count;
    },
    async updateRotationPlan(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (transaction) => {
        const result = await transaction.rotationPlan.updateMany({
          data: {
            assignmentModeAllowed: "MANUAL",
            name: input.rotationCode,
            rotationCode: input.rotationCode
          },
          where: {
            id: input.rotationPlanId,
            studyId: input.studyId
          }
        });

        if (result.count !== 1) {
          return result.count;
        }

        await transaction.rotationPlanArm.deleteMany({
          where: {
            rotationPlanId: input.rotationPlanId
          }
        });
        await transaction.rotationPlanArm.createMany({
          data: input.arms.map((arm) => ({
            ...arm,
            rotationPlanId: input.rotationPlanId
          }))
        });

        return result.count;
      });
    }
  };
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function isPrismaForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2003"
  );
}
