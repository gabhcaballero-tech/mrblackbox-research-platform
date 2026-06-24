import type { PoolConfig } from "pg";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPrismaClient,
  getPrismaPool,
  getPrismaPoolMax,
  resetPrismaClientSingletonForTests,
  type PrismaClientDependencies,
  type PrismaClientLike
} from "./client";

const databaseUrl = "postgresql://test:test@localhost:5432/test";
const sourceRoot = join(process.cwd(), "src");

let createdPools: FakePool[];
let createdClients: FakePrismaClient[];

class FakePool {
  readonly options: PoolConfig;

  constructor(options: PoolConfig) {
    this.options = options;
    createdPools.push(this);
  }
}

class FakePrismaClient implements PrismaClientLike {
  constructor() {
    createdClients.push(this);
  }

  async $connect(): Promise<void> {
    return undefined;
  }

  async $disconnect(): Promise<void> {
    return undefined;
  }
}

function fakeDependencies(): PrismaClientDependencies {
  return {
    PoolConstructor: FakePool as unknown as NonNullable<
      PrismaClientDependencies["PoolConstructor"]
    >,
    PrismaClientConstructor: FakePrismaClient as unknown as NonNullable<
      PrismaClientDependencies["PrismaClientConstructor"]
    >
  };
}

describe("Prisma shared client", () => {
  beforeEach(() => {
    createdPools = [];
    createdClients = [];
    resetPrismaClientSingletonForTests();
  });

  afterEach(() => {
    resetPrismaClientSingletonForTests();
    vi.restoreAllMocks();
  });

  it("reuses the same pg pool across repeated calls", () => {
    const firstPool = getPrismaPool({
      databaseUrl,
      dependencies: fakeDependencies()
    });
    const secondPool = getPrismaPool({
      databaseUrl,
      dependencies: fakeDependencies()
    });

    expect(secondPool).toBe(firstPool);
    expect(createdPools).toHaveLength(1);
  });

  it("reuses the same Prisma client across repeated calls", async () => {
    const firstClient = await createPrismaClient({
      databaseUrl,
      dependencies: fakeDependencies()
    });
    const secondClient = await createPrismaClient({
      databaseUrl,
      dependencies: fakeDependencies()
    });

    expect(secondClient).toBe(firstClient);
    expect(createdClients).toHaveLength(1);
    expect(createdPools).toHaveLength(1);
  });

  it("does not construct a new client for every requested operation", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        createPrismaClient({
          databaseUrl,
          dependencies: fakeDependencies()
        })
      )
    );

    expect(createdClients).toHaveLength(1);
    expect(createdPools).toHaveLength(1);
  });

  it("uses max 1 in production and Vercel by default", () => {
    expect(getPrismaPoolMax({ NODE_ENV: "production" })).toBe(1);
    expect(getPrismaPoolMax({ NODE_ENV: "development", VERCEL: "1" })).toBe(1);

    getPrismaPool({
      databaseUrl,
      env: {
        NODE_ENV: "production"
      },
      dependencies: fakeDependencies()
    });

    expect(createdPools[0]?.options).toMatchObject({
      connectionString: databaseUrl,
      max: 1
    });
  });

  it("uses max 3 in local development by default", () => {
    getPrismaPool({
      databaseUrl,
      env: {
        NODE_ENV: "development"
      },
      dependencies: fakeDependencies()
    });

    expect(getPrismaPoolMax({ NODE_ENV: "development" })).toBe(3);
    expect(createdPools[0]?.options).toMatchObject({
      connectionString: databaseUrl,
      max: 3
    });
  });

  it("allows DATABASE_POOL_MAX override when it is a valid positive integer", () => {
    getPrismaPool({
      databaseUrl,
      env: {
        DATABASE_POOL_MAX: "2",
        NODE_ENV: "production"
      },
      dependencies: fakeDependencies()
    });

    expect(getPrismaPoolMax({ DATABASE_POOL_MAX: "2", NODE_ENV: "production" })).toBe(2);
    expect(createdPools[0]?.options).toMatchObject({
      connectionString: databaseUrl,
      max: 2
    });
  });

  it("falls back to the safe environment default when DATABASE_POOL_MAX is invalid", () => {
    expect(getPrismaPoolMax({ DATABASE_POOL_MAX: "0", NODE_ENV: "production" })).toBe(1);
    expect(getPrismaPoolMax({ DATABASE_POOL_MAX: "abc", NODE_ENV: "development" })).toBe(3);
  });

  it("does not print DATABASE_URL when logging pool initialization", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    getPrismaPool({
      databaseUrl,
      env: {
        NODE_ENV: "development"
      },
      dependencies: fakeDependencies()
    });

    const loggedText = info.mock.calls.flat().join(" ");

    expect(loggedText).toContain("max=3");
    expect(loggedText).not.toContain(databaseUrl);
    expect(loggedText).not.toContain("DATABASE_URL");
  });

  it("keeps Prisma and pg pool creation centralized in the shared DB client", () => {
    const offenders = readSourceFiles(sourceRoot)
      .filter((filePath) => !filePath.endsWith(join("src", "shared", "db", "client.ts")))
      .flatMap((filePath) => {
        const content = readFileSync(filePath, "utf8");
        const relativePath = relative(process.cwd(), filePath);
        const issues = [];

        if (/new\s+PrismaClient\s*\(/.test(content)) {
          issues.push(`${relativePath}: direct PrismaClient construction`);
        }

        if (/new\s+Pool\s*\(/.test(content)) {
          issues.push(`${relativePath}: direct pg Pool construction`);
        }

        return issues;
      });

    expect(offenders).toEqual([]);
  });

  it("does not disconnect the shared Prisma client or pool in application flow", () => {
    const offenders = readSourceFiles(sourceRoot)
      .filter((filePath) => !filePath.includes(".test."))
      .flatMap((filePath) => {
        const content = readFileSync(filePath, "utf8");
        const relativePath = relative(process.cwd(), filePath);
        const issues = [];

        if (/\.\$disconnect\s*\(/.test(content)) {
          issues.push(`${relativePath}: Prisma disconnect call`);
        }

        if (/\.end\s*\(/.test(content) && /pool/i.test(content)) {
          issues.push(`${relativePath}: pool end call`);
        }

        return issues;
      });

    expect(offenders).toEqual([]);
  });
});

function readSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return readSourceFiles(entryPath);
    }

    if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      return [];
    }

    return [entryPath];
  });
}
