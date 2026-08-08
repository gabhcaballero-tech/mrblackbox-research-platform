import { describe, expect, it } from "vitest";
import type { ScreenerDefinition } from "./definition";
import {
  DETERGENTS_STUDY_CODE,
  DETERGENT_RECRUITER_QUESTION_ID,
  NAVIGO_HUT_ACCESS_NO_VALUE,
  NAVIGO_HUT_ACCESS_QUESTION_ID,
  NAVIGO_HUT_ACCESS_YES_VALUE,
  NAVIGO_STUDY_CODE,
  applyStudyScreenerDefinitionOverrides,
  ensureDetergentRecruiterQuestion,
  ensureNavigoHutAccessQuestion,
  isNavigoHutAccessEnabled
} from "./study-overrides";

function baseDefinition(): ScreenerDefinition {
  return {
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "F1_CIUDAD",
        options: [
          {
            actions: [],
            isOther: false,
            label: "CDMX",
            order: 1,
            otherTextRequired: false,
            value: "CDMX"
          }
        ],
        order: 1,
        required: true,
        text: "Ciudad",
        type: "SINGLE_CHOICE",
        validation: {}
      },
      {
        dataDestination: "SCREENING",
        id: "F2_EDAD",
        order: 2,
        required: true,
        text: "Edad",
        type: "INTEGER",
        validation: { max: 75, min: 18 }
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro detergentes"
  };
}

describe("study screener definition overrides", () => {
  it("adds F0_RECLUTADOR before F1_CIUDAD for the detergent screener", () => {
    const definition = applyStudyScreenerDefinitionOverrides(DETERGENTS_STUDY_CODE, baseDefinition());

    expect(definition.questions.map((question) => question.id)).toEqual([
      DETERGENT_RECRUITER_QUESTION_ID,
      "F1_CIUDAD",
      "F2_EDAD"
    ]);
    expect(definition.questions[0]).toMatchObject({
      dataDestination: "SCREENING",
      id: DETERGENT_RECRUITER_QUESTION_ID,
      order: 1,
      required: true,
      text: "Escribe el nombre de tu reclutador o reclutadora.",
      type: "SHORT_TEXT"
    });
  });

  it("keeps the recruiter override idempotent without duplicating questions", () => {
    const once = ensureDetergentRecruiterQuestion(baseDefinition());
    const twice = ensureDetergentRecruiterQuestion(once);

    expect(twice.questions.filter((question) => question.id === DETERGENT_RECRUITER_QUESTION_ID)).toHaveLength(1);
    expect(twice.questions.map((question) => question.order)).toEqual([1, 2, 3]);
  });

  it("does not alter other studies", () => {
    const original = baseDefinition();
    const definition = applyStudyScreenerDefinitionOverrides("OTRO-ESTUDIO-2026", original);

    expect(definition).toBe(original);
  });

  it("does not inject the legacy Navigo HUT access question for new screeners", () => {
    const definition = applyStudyScreenerDefinitionOverrides(NAVIGO_STUDY_CODE, baseDefinition());

    expect(definition.questions.map((question) => question.id)).toEqual([
      "F1_CIUDAD",
      "F2_EDAD"
    ]);
    expect(definition.questions.some((question) => question.id === NAVIGO_HUT_ACCESS_QUESTION_ID)).toBe(false);
  });

  it("keeps the legacy Navigo HUT access helper idempotent for historical definitions", () => {
    const once = ensureNavigoHutAccessQuestion(baseDefinition());
    const twice = ensureNavigoHutAccessQuestion(once);

    expect(twice.questions.filter((question) => question.id === NAVIGO_HUT_ACCESS_QUESTION_ID)).toHaveLength(1);
    expect(twice.questions.map((question) => question.order)).toEqual([1, 2, 3]);
  });

  it("detects the affirmative HUT screening answer", () => {
    expect(isNavigoHutAccessEnabled(NAVIGO_HUT_ACCESS_YES_VALUE)).toBe(true);
    expect(isNavigoHutAccessEnabled({ value: NAVIGO_HUT_ACCESS_YES_VALUE })).toBe(true);
    expect(isNavigoHutAccessEnabled(NAVIGO_HUT_ACCESS_NO_VALUE)).toBe(false);
    expect(isNavigoHutAccessEnabled(undefined)).toBe(false);
  });
});
