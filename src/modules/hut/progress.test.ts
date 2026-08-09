import { describe, expect, it } from "vitest";
import { buildHutQuestionnaireProgress } from "./progress";

describe("HUT questionnaire progress", () => {
  it("counts all applicable filter questions for HUT_DIRECTO", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {
        HUT_PARTICIPO_CLT: "2"
      },
      participantOrigin: "HUT_DIRECTO"
    });
    const filters = progress.sections.find((section) => section.section === "FILTROS");

    expect(filters?.title).toBe("Filtros");
    expect(filters?.total).toBeGreaterThan(3);
    expect(filters?.pendingQuestionCodes).toContain("HUT_F0_ACEPTA");
    expect(filters?.pendingQuestionCodes).toContain("HUT_F22_IMPORTANCIA_PERFUME");
  });

  it("counts only required CLT_HUT filters", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {},
      participantOrigin: "CLT_HUT"
    });
    const filters = progress.sections.find((section) => section.section === "FILTROS");

    expect(filters).toMatchObject({
      answered: 0,
      pendingQuestionCodes: [
        "HUT_F6_PRODUCTOS_7_DIAS",
        "HUT_F20_TIEMPO_USO_MARCA",
        "HUT_F22_IMPORTANCIA_PERFUME"
      ],
      title: "Filtros obligatorios",
      total: 3
    });
  });

  it("recalculates denominator when logical skips hide follow-up questions", () => {
    const withoutFollowUp = buildHutQuestionnaireProgress({
      answers: {
        HUT_P12A_CARACTERISTICA_INCOMODA: "2"
      },
      participantOrigin: "CLT_HUT"
    });
    const withFollowUp = buildHutQuestionnaireProgress({
      answers: {
        HUT_P12A_CARACTERISTICA_INCOMODA: "1"
      },
      participantOrigin: "CLT_HUT"
    });

    expect(withoutFollowUp.sections.find((section) => section.section === "EVALUACION_PRIMER_PERFUME")?.total).toBe(22);
    expect(withFollowUp.sections.find((section) => section.section === "EVALUACION_PRIMER_PERFUME")?.total).toBe(23);
  });

  it("shows 23 applicable questions for each perfume evaluation when the conditional detail applies", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {
        HUT_P12A_CARACTERISTICA_INCOMODA: "1",
        HUT_P12B_CARACTERISTICA_INCOMODA: "1"
      },
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === "EVALUACION_PRIMER_PERFUME")?.total).toBe(23);
    expect(progress.sections.find((section) => section.section === "EVALUACION_SEGUNDO_PERFUME")?.total).toBe(23);
  });

  it("shows four comparative questions", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {},
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === "COMPARATIVA")).toMatchObject({
      title: "Evaluacion comparativa",
      total: 4
    });
  });
});
