import { describe, expect, it } from "vitest";
import {
  normalizeParticipantTextInput,
  normalizeParticipantTextInputDraft,
  stripEmoji
} from "./text-normalization";

describe("participant portal text normalization", () => {
  it("uppercases participant free text while preserving accents and ene", () => {
    expect(normalizeParticipantTextInput("  fragancia ni\u00f1a \u00e1mbar  ")).toBe(
      "FRAGANCIA NI\u00d1A \u00c1MBAR"
    );
  });

  it("preserves spaces between words while removing emojis and control characters", () => {
    expect(normalizeParticipantTextInput(" compr\u00e9 en mayo \ud83d\ude0a ")).toBe("COMPR\u00c9 EN MAYO");
    expect(normalizeParticipantTextInput(" azul\u200Brojo \n fresco ")).toBe("AZUL ROJO FRESCO");
  });

  it("collapses repeated spaces after removing unsupported characters", () => {
    expect(normalizeParticipantTextInput("  marca    con     espacios  ")).toBe("MARCA CON ESPACIOS");
  });

  it("keeps a single trailing separator while the participant is still writing", () => {
    expect(normalizeParticipantTextInputDraft("2 ")).toBe("2 ");
    expect(normalizeParticipantTextInputDraft("hace  2   meses")).toBe("HACE 2 MESES");
  });

  it("does not remove ordinary letters when stripping emoji", () => {
    expect(stripEmoji("\u00d1AND\u00da azul \ud83d\ude00")).toBe("\u00d1AND\u00da azul ");
  });
});
