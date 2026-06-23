import { describe, expect, it } from "vitest";
import { genericQuestionnaireSnapshot } from "@/modules/testing/fixtures";
import { createQuestionnaireSnapshot, questionnaireSnapshotSchema } from ".";

describe("questionnaire snapshot", () => {
  it("validates and freezes a published questionnaire snapshot", () => {
    const snapshot = createQuestionnaireSnapshot(genericQuestionnaireSnapshot);

    expect(questionnaireSnapshotSchema.parse(snapshot).versionNumber).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.questions)).toBe(true);
    expect(Object.isFrozen(snapshot.questions[0])).toBe(true);
    expect(snapshot.questions.map((question) => question.type)).toEqual([
      "single_choice",
      "multiple_choice",
      "text",
      "number",
      "yes_no",
      "scale",
      "matrix",
      "attribute_block"
    ]);
  });

  it("rejects snapshots that are not published immutable versions", () => {
    expect(() =>
      questionnaireSnapshotSchema.parse({
        ...genericQuestionnaireSnapshot,
        status: "draft"
      })
    ).toThrow();
  });
});
