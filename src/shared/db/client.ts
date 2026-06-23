import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";
import { Pool, type PoolConfig } from "pg";

type PrismaClientLike = {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
};

type PrismaClientConstructor = new (options: { adapter: PrismaPg }) => PrismaClientLike;

type PgPoolConstructor = new (options: PoolConfig) => Pool;

type PrismaClientDependencies = {
  PoolConstructor?: PgPoolConstructor;
  PrismaClientConstructor?: PrismaClientConstructor;
};

type CreatePrismaClientOptions = {
  databaseUrl?: string;
  loadEnvFile?: boolean;
  dependencies?: PrismaClientDependencies;
};

type GetPrismaPoolOptions = Pick<
  CreatePrismaClientOptions,
  "databaseUrl" | "loadEnvFile" | "dependencies"
>;

type PrismaSingletonState = {
  adapter?: PrismaPg;
  client?: PrismaClientLike;
  clientPromise?: Promise<PrismaClientLike>;
  databaseUrl?: string;
  pool?: Pool;
  poolMax?: number;
};

const DEFAULT_PRISMA_POOL_MAX = 3;
const prismaClientModuleName = "@prisma/client";
const globalForPrisma = globalThis as typeof globalThis & {
  __mrblackboxPrisma?: PrismaSingletonState;
};

function getSingletonState(): PrismaSingletonState {
  globalForPrisma.__mrblackboxPrisma ??= {};
  return globalForPrisma.__mrblackboxPrisma;
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before creating a Prisma client.");
  }

  return databaseUrl;
}

export function getPrismaPoolMax(): number {
  return DEFAULT_PRISMA_POOL_MAX;
}

export function getPrismaPool(options: GetPrismaPoolOptions = {}): Pool {
  if (options.loadEnvFile) {
    loadDotenv();
  }

  const databaseUrl = options.databaseUrl ?? getDatabaseUrl();
  const state = getSingletonState();

  if (state.databaseUrl && state.databaseUrl !== databaseUrl) {
    throw new Error("Prisma singleton was already initialized with a different DATABASE_URL.");
  }

  state.databaseUrl = databaseUrl;
  state.poolMax = DEFAULT_PRISMA_POOL_MAX;

  if (!state.pool) {
    const PoolConstructor = options.dependencies?.PoolConstructor ?? Pool;
    state.pool = new PoolConstructor({
      connectionString: databaseUrl,
      max: DEFAULT_PRISMA_POOL_MAX
    });
  }

  return state.pool;
}

function getPrismaAdapter(options: GetPrismaPoolOptions = {}): PrismaPg {
  const state = getSingletonState();

  if (!state.adapter) {
    state.adapter = new PrismaPg(getPrismaPool(options), {
      disposeExternalPool: false
    });
  }

  return state.adapter;
}

export async function createPrismaClient(
  options: CreatePrismaClientOptions = {}
): Promise<PrismaClientLike> {
  const state = getSingletonState();
  getPrismaPool(options);

  if (state.client) {
    return state.client;
  }

  if (!state.clientPromise) {
    const adapter = getPrismaAdapter(options);
    state.clientPromise = (async () => {
      const PrismaClient =
        options.dependencies?.PrismaClientConstructor ??
        ((await import(prismaClientModuleName)) as {
          PrismaClient: PrismaClientConstructor;
        }).PrismaClient;

      const client = new PrismaClient({ adapter });
      state.client = client;
      return client;
    })().catch((error: unknown) => {
      state.clientPromise = undefined;
      throw error;
    });
  }

  return state.clientPromise;
}

export function resetPrismaClientSingletonForTests(): void {
  delete globalForPrisma.__mrblackboxPrisma;
}

export type { PrismaClientDependencies, PrismaClientLike };
