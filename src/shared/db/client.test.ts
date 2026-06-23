import type { PoolConfig } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  getPrismaPool,
  getPrismaPoolMax,
  resetPrismaClientSingletonForTests,
  type PrismaClientDependencies,
  type PrismaClientLike
} from "./client";

const databaseUrl = "postgresql://test:test@localhost:5432/test";

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

  it("uses a conservative pool maximum", () => {
    getPrismaPool({
      databaseUrl,
      dependencies: fakeDependencies()
    });

    expect(getPrismaPoolMax()).toBe(3);
    expect(createdPools[0]?.options).toMatchObject({
      connectionString: databaseUrl,
      max: 3
    });
  });
});
