import { describe, expect, it } from "vitest";
import type { HutQuestionDefinition, HutQuestionnaireSectionId } from "./definition";
import { buildHutEffectiveVisitProgress, buildHutQuestionnaireProgress } from "./progress";

describe("HUT questionnaire progress", () => {
  it("counts all applicable filter questions for HUT_DIRECTO", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {
        HUT_PARTICIPO_CLT: "2"
      },
      participantOrigin: "HUT_DIRECTO"
    });
    const filters = progress.sections.find((section) => section.section === "FILTROS");

    expect(filters?.title).toBe("Filtro de participante");
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
      title: "Filtro de participante",
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

  it("shows 23 applicable questions for first perfume evaluation and hides the full second perfume evaluation", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {
        HUT_P12A_CARACTERISTICA_INCOMODA: "1",
        HUT_P12B_CARACTERISTICA_INCOMODA: "1"
      },
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === "EVALUACION_PRIMER_PERFUME")?.total).toBe(23);
    expect(progress.sections.find((section) => section.section === "SEGUNDA_VISITA")).toMatchObject({
      title: "Entrega segundo producto",
      total: 1
    });
    expect(progress.sections.find((section) => section.section === "EVALUACION_SEGUNDO_PERFUME")).toMatchObject({
      title: "Confirmacion uso segundo perfume",
      total: 2
    });
  });

  it("shows four comparative questions", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {},
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === "COMPARATIVA")).toMatchObject({
      title: "Evaluacion comparativa (Regreso 2)",
      total: 4
    });
  });

  it("marks a section as completed when every required applicable question has an answer", () => {
    const answers = completedSectionAnswers("EVALUACION_PRIMER_PERFUME");
    const progress = buildHutQuestionnaireProgress({
      answers,
      participantOrigin: "CLT_HUT"
    });
    const firstEvaluation = progress.sections.find((section) => section.section === "EVALUACION_PRIMER_PERFUME");

    expect(firstEvaluation).toMatchObject({
      answered: firstEvaluation?.total,
      pendingQuestionCodes: [],
      status: "COMPLETED"
    });
  });

  it("completes a section with required answers while reporting optional pending questions separately", () => {
    const progress = buildHutQuestionnaireProgress({
      answers: {
        HUT_DG_FOLIO: "HUT-123",
        HUT_DG_NOMBRE: "Participante HUT"
      },
      participantOrigin: "CLT_HUT"
    });
    const generalData = progress.sections.find((section) => section.section === "DATOS_GENERALES");

    expect(generalData).toMatchObject({
      answered: 2,
      optionalPendingQuestionCodes: [
        "HUT_DG_COLONIA",
        "HUT_DG_TELEFONO",
        "HUT_DG_DIRECCION",
        "HUT_DG_EMAIL"
      ],
      pendingQuestionCodes: [],
      status: "COMPLETED",
      total: 2
    });
  });

  it("keeps a section pending when a required applicable question is missing", () => {
    const answers = completedSectionAnswers("PRIMERA_VISITA");
    const progressWithAllAnswers = buildHutQuestionnaireProgress({
      answers,
      participantOrigin: "CLT_HUT"
    });
    const firstVisit = progressWithAllAnswers.sections.find((section) => section.section === "PRIMERA_VISITA");
    const lastRequiredQuestion = firstVisit?.questions.at(-1)?.code;

    if (lastRequiredQuestion) {
      delete answers[lastRequiredQuestion];
    }

    const progress = buildHutQuestionnaireProgress({
      answers,
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === "PRIMERA_VISITA")).toMatchObject({
      pendingQuestionCodes: lastRequiredQuestion ? [lastRequiredQuestion] : [],
      status: lastRequiredQuestion ? "IN_PROGRESS" : "COMPLETED"
    });
  });

  it("recognizes legacy sections as completed when required answers exist without manual closure", () => {
    const visits = buildHutEffectiveVisitProgress({
      answers: {
        HUT_DG_FOLIO: "HUT-123",
        HUT_DG_NOMBRE: "Participante HUT"
      },
      attemptId: "attempt-legacy",
      participantOrigin: "CLT_HUT",
      storedVisits: [
        {
          attemptId: "attempt-legacy",
          completedAt: null,
          section: "DATOS_GENERALES",
          startedAt: new Date("2026-08-12T15:00:00.000Z"),
          status: "IN_PROGRESS"
        }
      ]
    });

    expect(visits.find((visit) => visit.section === "DATOS_GENERALES")).toMatchObject({
      completedAt: null,
      status: "COMPLETED",
      storedStatus: "IN_PROGRESS"
    });
  });

  it.each([
    "DATOS_GENERALES",
    "PRIMERA_VISITA",
    "EVALUACION_PRIMER_PERFUME",
    "SEGUNDA_VISITA",
    "EVALUACION_SEGUNDO_PERFUME",
    "COMPARATIVA"
  ] satisfies HutQuestionnaireSectionId[])("auto-completes %s when required answers are present", (sectionId) => {
    const progress = buildHutQuestionnaireProgress({
      answers: completedSectionAnswers(sectionId),
      participantOrigin: "CLT_HUT"
    });

    expect(progress.sections.find((section) => section.section === sectionId)?.status).toBe("COMPLETED");
  });
});

function completedSectionAnswers(sectionId: HutQuestionnaireSectionId): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (let index = 0; index < 5; index += 1) {
    const section = buildHutQuestionnaireProgress({
      answers,
      participantOrigin: "CLT_HUT"
    }).sections.find((candidate) => candidate.section === sectionId);

    if (!section?.pendingQuestionCodes.length) {
      break;
    }

    for (const question of section.questions) {
      answers[question.code] ??= sampleAnswer(question);
    }
  }

  return answers;
}

function sampleAnswer(question: HutQuestionDefinition): unknown {
  if (question.type === "MATRIX") {
    return Object.fromEntries(question.rows.map((row) => [row.code, question.columns[0]?.value ?? "1"]));
  }
  if (question.type === "RANKING") {
    return Object.fromEntries(Array.from({ length: question.maxRank }, (_, index) => [
      String(index + 1),
      question.options[index]?.value ?? question.options[0]?.value ?? "1"
    ]));
  }
  if (question.type === "SCALE") {
    return question.min;
  }
  if (question.type === "SELECT") {
    const perfumeOption = question.options.find((option) => option.value === "3");
    const value = perfumeOption?.value ?? question.options[0]?.value ?? "1";
    return question.multiple ? [value] : value;
  }
  return "Respuesta QA";
}
