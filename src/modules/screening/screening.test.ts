import { describe, expect, it } from "vitest";
import {
  genericScreeningDefinition,
  passingScreeningAnswers,
  terminatingScreeningAnswers
} from "@/modules/testing/fixtures";
import { calculateScreeningScore, evaluateScreening } from "./engine";

describe("screening engine", () => {
  it("passes a filter when required answers are complete and no termination rule matches", () => {
    const result = evaluateScreening(genericScreeningDefinition, passingScreeningAnswers);

    expect(result.status).toBe("passed");
    expect(result.termination).toBeUndefined();
  });

  it("terminates a filter when a configured selected option matches", () => {
    const result = evaluateScreening(genericScreeningDefinition, terminatingScreeningAnswers);

    expect(result.status).toBe("terminated");
    expect(result.termination).toEqual({
      code: "exclusion_selected",
      reason: "Selecciono una opcion excluyente.",
      questionId: "q-exclusions"
    });
  });

  it("calculates and classifies a generic NSE score", () => {
    const nseCalculation = genericScreeningDefinition.scoreCalculations[0];
    const result = calculateScreeningScore(nseCalculation, passingScreeningAnswers);

    expect(result.score).toBe(10);
    expect(result.classification).toEqual({
      code: "high",
      label: "NSE alto"
    });
  });
});
