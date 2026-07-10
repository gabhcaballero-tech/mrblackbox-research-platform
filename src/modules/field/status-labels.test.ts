import { describe, expect, it } from "vitest";
import { fieldAttemptStatusLabel } from "./status-labels";

describe("field status labels", () => {
  it("can translate attempt statuses from a server-safe module", () => {
    expect(fieldAttemptStatusLabel("PASSED")).toBe("Intento elegible");
    expect(fieldAttemptStatusLabel("TERMINATED")).toBe("Intento terminado");
    expect(fieldAttemptStatusLabel("PENDING_REVIEW")).toBe("Intento pendiente de revisión");
    expect(fieldAttemptStatusLabel("INCOMPLETE")).toBe("Intento incompleto");
    expect(fieldAttemptStatusLabel("STARTED")).toBe("Intento iniciado");
  });
});
