import { describe, expect, it } from "vitest";
import { normalizeParticipantTextInput, stripEmoji } from "./text-normalization";

describe("participant portal text normalization", () => {
  it("uppercases participant free text while preserving accents and Ñ", () => {
    expect(normalizeParticipantTextInput("  fragancia niña ámbar  ")).toBe("FRAGANCIA NIÑA ÁMBAR");
  });

  it("removes emojis and invisible control characters", () => {
    expect(normalizeParticipantTextInput(" azul\u200Brojo 😀\n fresco ")).toBe("AZULROJO FRESCO");
  });

  it("collapses repeated spaces after removing unsupported characters", () => {
    expect(normalizeParticipantTextInput("  marca    con     espacios  ")).toBe("MARCA CON ESPACIOS");
  });

  it("does not remove ordinary letters when stripping emoji", () => {
    expect(stripEmoji("ÑANDÚ azul 😀")).toBe("ÑANDÚ azul ");
  });
});
