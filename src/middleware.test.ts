import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

async function runMiddleware(pathname: string) {
  return proxy(new NextRequest(`https://mrblackbox-research-platform.vercel.app${pathname}`));
}

describe("V1 migration middleware", () => {
  it.each([
    "/participar/FMASCULINA-NAVIGO-2026",
    "/participar/FMASCULINA-NAVIGO-2026/filtro",
    "/p/token-123/activities",
    "/ctl/FMASCULINA-NAVIGO-2026",
    "/hut/p/token-123",
    "/hut/p/token-123/photo/PRODUCT_1_DAY_1",
    "/hut/register/token-123"
  ])("rewrites participant route %s to migration screen", async (pathname) => {
    const response = await runMiddleware(pathname);

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://mrblackbox-research-platform.vercel.app/migracion-v1"
    );
  });
});
