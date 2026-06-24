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
  env?: NodeJS.ProcessEnv;
  loadEnvFile?: boolean;
  dependencies?: PrismaClientDependencies;
};

type GetPrismaPoolOptions = Pick<
  CreatePrismaClientOptions,
  "databaseUrl" | "env" | "loadEnvFile" | "dependencies"
>;

type PrismaSingletonState = {
  adapter?: PrismaPg;
  client?: PrismaClientLike;
  clientPromise?: Promise<PrismaClientLike>;
  databaseUrl?: string;
  loggedPoolInitialization?: boolean;
  pool?: Pool;
  poolMax?: number;
};

const LOCAL_PRISMA_POOL_MAX = 3;
const PRODUCTION_PRISMA_POOL_MAX = 1;
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

export function getPrismaPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const configuredMax = parseDatabasePoolMax(env.DATABASE_POOL_MAX);

  if (configuredMax !== null) {
    return configuredMax;
  }

  return isProductionRuntime(env) ? PRODUCTION_PRISMA_POOL_MAX : LOCAL_PRISMA_POOL_MAX;
}

export function getPrismaPool(options: GetPrismaPoolOptions = {}): Pool {
  if (options.loadEnvFile) {
    loadDotenv();
  }

  const env = options.env ?? process.env;
  const databaseUrl = options.databaseUrl ?? getDatabaseUrl(env);
  const poolMax = getPrismaPoolMax(env);
  const state = getSingletonState();

  if (state.databaseUrl && state.databaseUrl !== databaseUrl) {
    throw new Error("Prisma singleton was already initialized with a different DATABASE_URL.");
  }

  state.databaseUrl = databaseUrl;

  if (!state.pool) {
    const PoolConstructor = options.dependencies?.PoolConstructor ?? Pool;
    state.poolMax = poolMax;
    state.pool = new PoolConstructor({
      connectionString: databaseUrl,
      max: poolMax
    });
    logPrismaPoolInitialization({ env, poolMax, state });
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

function parseDatabasePoolMax(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL === "1" || env.VERCEL === "true" || env.NODE_ENV === "production";
}

function logPrismaPoolInitialization({
  env,
  poolMax,
  state
}: {
  env: NodeJS.ProcessEnv;
  poolMax: number;
  state: PrismaSingletonState;
}) {
  if (state.loggedPoolInitialization || env.NODE_ENV === "test") {
    return;
  }

  state.loggedPoolInitialization = true;
  const runtime = env.VERCEL ? "vercel" : env.NODE_ENV ?? "unknown";

  console.info(`Prisma pg pool initialized: max=${poolMax} runtime=${runtime}`);
}

export type { PrismaClientDependencies, PrismaClientLike };
