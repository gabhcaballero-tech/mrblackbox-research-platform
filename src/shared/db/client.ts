import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";

type PrismaClientLike = {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
};

type PrismaClientConstructor = new (options: { adapter: PrismaPg }) => PrismaClientLike;

type CreatePrismaClientOptions = {
  databaseUrl?: string;
  loadEnvFile?: boolean;
};

const prismaClientModuleName = "@prisma/client";

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before creating a Prisma client.");
  }

  return databaseUrl;
}

export async function createPrismaClient(
  options: CreatePrismaClientOptions = {}
): Promise<PrismaClientLike> {
  if (options.loadEnvFile) {
    loadDotenv();
  }

  const databaseUrl = options.databaseUrl ?? getDatabaseUrl();
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const { PrismaClient } = (await import(prismaClientModuleName)) as {
    PrismaClient: PrismaClientConstructor;
  };

  return new PrismaClient({ adapter });
}

export type { PrismaClientLike };
