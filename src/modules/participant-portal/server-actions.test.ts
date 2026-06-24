import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const serverActionFiles = [
  "src/modules/participant-portal/actions.ts",
  "src/modules/participant-portal/registration-actions.ts",
  "src/modules/participant-portal/screener-actions.ts",
  "src/modules/participant-portal/evidence-actions.ts",
  "src/modules/participant-portal/admin-actions.ts",
  "src/modules/participant-portal/evidence-review-actions.ts"
];

describe("participant portal server actions", () => {
  it("export only async functions from use server files", () => {
    for (const relativePath of serverActionFiles) {
      const source = readFileSync(join(root, relativePath), "utf8");

      expect(source).toContain('"use server"');
      expect(source).not.toMatch(/^export\s+(const|let|var|class)\s/m);
      expect(source).not.toMatch(/^export\s+function\s+(?!async\b)/m);
      expect(source).not.toMatch(/^export\s+\{/m);
      expect(source).not.toMatch(/^export\s+type\s/m);
      expect(source).not.toMatch(/^export\s+interface\s/m);
    }
  });
});
