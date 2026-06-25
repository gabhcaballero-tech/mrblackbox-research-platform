import { describe, expect, it } from "vitest";
import {
  evaluateScreener,
  getVisibleQuestions,
  type ScreenerAnswers,
  type ScreenerDefinition
} from "@/modules/screener";
import { getParticipantPortalAccessMode } from "@/modules/participant-portal/access-mode";
import {
  createDetergentsScreenerDefinition,
  DETERGENTS_TEMPLATE_SUMMARY
} from "./detergents";
import {
  DetergentsPartialStudyUnsafeError,
  loadDetergentsStudyTemplateForAdmin,
  type DetergentsTemplateRepository
} from "./detergents-loader";
import { applyStudyScreenerDefinitionOverrides } from "@/modules/screener/study-overrides";
import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "./study-behavior";

const adminActor = {
  id: "admin-1",
  role: "ADMIN" as const,
  status: "ACTIVE" as const
};

describe("detergents screener template", () => {
  it("defines F0 recruiter at the beginning and keeps question ids unique", () => {
    const definition = createDetergentsScreenerDefinition();
    const ids = definition.questions.map((question) => question.id);

    expect(ids[0]).toBe("F0_RECLUTADOR");
    expect(ids[1]).toBe("F1_CIUDAD");
    expect(new Set(ids).size).toBe(ids.length);
    expect(definition.questions).toHaveLength(23);
  });

  it("does not duplicate F0 when study overrides are applied", () => {
    const definition = createDetergentsScreenerDefinition();
    const overridden = applyStudyScreenerDefinitionOverrides(DETERGENTS_STUDY_CODE, definition);

    expect(overridden.questions.filter((question) => question.id === "F0_RECLUTADOR")).toHaveLength(1);
    expect(overridden.questions.find((question) => question.id === "F1_CIUDAD")?.order).toBe(2);
  });

  it("opens the detergent public portal in direct mode without changing Navigo", () => {
    expect(getParticipantPortalAccessMode(DETERGENTS_STUDY_CODE)).toBe("DIRECT");
    expect(getParticipantPortalAccessMode(NAVIGO_STUDY_CODE)).toBe("DIRECT");
    expect(DETERGENTS_TEMPLATE_SUMMARY).toMatchObject({
      filterOnly: true,
      requiresEvidence: false,
      requiresManualRotation: false,
      requiresSelfie: false
    });
  });

  it("terminates when city is outside CDMX and GDL", () => {
    const result = evaluateScreener(
      createDetergentsScreenerDefinition(),
      eligibleAnswers({
        F1_CIUDAD: "OTRA_CIUDAD"
      })
    );

    expect(result).toMatchObject({
      status: "TERMINATED",
      termination: { code: "CIUDAD_NO_ELEGIBLE" }
    });
  });

  it("terminates when gender is not Mujer", () => {
    const result = evaluateScreener(
      createDetergentsScreenerDefinition(),
      eligibleAnswers({
        F2_GENERO: "HOMBRE"
      })
    );

    expect(result).toMatchObject({
      status: "TERMINATED",
      termination: { code: "GENERO_NO_ELEGIBLE" }
    });
  });

  it("terminates age below 18 and above 55", () => {
    const definition = createDetergentsScreenerDefinition();
    const tooYoung = evaluateScreener(
      definition,
      eligibleAnswers({
        F3_RANGO_EDAD: "MENOS_18",
        F4_EDAD_EXACTA: 17
      })
    );
    const tooOld = evaluateScreener(
      definition,
      eligibleAnswers({
        F3_RANGO_EDAD: "MAYOR_55",
        F4_EDAD_EXACTA: 56
      })
    );

    expect(tooYoung).toMatchObject({ status: "TERMINATED", termination: { code: "EDAD_MENOR_18" } });
    expect(tooOld).toMatchObject({ status: "TERMINATED", termination: { code: "EDAD_MAYOR_55" } });
  });

  it("terminates sensitive activities, recent participation, small household and responsibility exclusions", () => {
    const definition = createDetergentsScreenerDefinition();

    expect(
      evaluateScreener(definition, eligibleAnswers({ F5_ACTIVIDADES_SENSIBLES: ["INVESTIGACION_MERCADOS"] }))
    ).toMatchObject({ status: "TERMINATED", termination: { code: "EXCLUSION_LABORAL" } });
    expect(evaluateScreener(definition, eligibleAnswers({ F6_PARTICIPACION_PREVIA: "SI" }))).toMatchObject({
      status: "TERMINATED",
      termination: { code: "PARTICIPACION_RECIENTE" }
    });
    expect(evaluateScreener(definition, eligibleAnswers({ F7_MIEMBROS_HOGAR: "UNA_DOS_PERSONAS" }))).toMatchObject({
      status: "TERMINATED",
      termination: { code: "HOGAR_NO_ELEGIBLE" }
    });
    expect(evaluateScreener(definition, eligibleAnswers({ F8_RESPONSABLE_COMPRAS: "OTRA_PERSONA" }))).toMatchObject({
      status: "TERMINATED",
      termination: { code: "NO_RESPONSABLE_COMPRAS" }
    });
    expect(evaluateScreener(definition, eligibleAnswers({ F9_RESPONSABLE_LAVADO: "OTRA_PERSONA" }))).toMatchObject({
      status: "TERMINATED",
      termination: { code: "NO_RESPONSABLE_LAVADO" }
    });
  });

  it("qualifies detergent liquid, powder or both and terminates when neither is selected", () => {
    const definition = createDetergentsScreenerDefinition();

    expect(
      evaluateScreener(definition, eligibleAnswers({ F10_PRODUCTOS_USO_FRECUENTE: ["DETERGENTE_LIQUIDO"] })).status
    ).toBe("PASSED");
    expect(
      evaluateScreener(
        definition,
        eligibleAnswers({
          F10_PRODUCTOS_USO_FRECUENTE: ["DETERGENTE_POLVO"],
          F11_TIPO_DETERGENTE: "POLVO"
        })
      ).status
    ).toBe("PASSED");
    expect(
      evaluateScreener(
        definition,
        eligibleAnswers({
          F10_PRODUCTOS_USO_FRECUENTE: ["DETERGENTE_LIQUIDO", "DETERGENTE_POLVO"],
          F11_TIPO_DETERGENTE: "AMBOS_POR_IGUAL"
        })
      ).status
    ).toBe("PASSED");
    expect(evaluateScreener(definition, eligibleAnswers({ F10_PRODUCTOS_USO_FRECUENTE: ["SUAVIZANTE"] }))).toMatchObject({
      status: "TERMINATED",
      termination: { code: "NO_USA_DETERGENTE" }
    });
  });

  it("rejects an inconsistent detergent type answer", () => {
    const result = evaluateScreener(
      createDetergentsScreenerDefinition(),
      eligibleAnswers({
        F10_PRODUCTOS_USO_FRECUENTE: ["DETERGENTE_LIQUIDO"],
        F11_TIPO_DETERGENTE: "POLVO"
      })
    );

    expect(result).toMatchObject({
      status: "TERMINATED",
      termination: { code: "TIPO_DETERGENTE_INCONSISTENTE" }
    });
  });

  it("shows F11 only when detergent liquid or powder was selected", () => {
    const definition = createDetergentsScreenerDefinition();
    const withoutDetergent = getVisibleQuestions(
      definition,
      eligibleAnswers({
        F10_PRODUCTOS_USO_FRECUENTE: ["SUAVIZANTE"]
      })
    );
    const withDetergent = getVisibleQuestions(definition, eligibleAnswers());

    expect(withoutDetergent.some((question) => question.id === "F11_TIPO_DETERGENTE")).toBe(false);
    expect(withDetergent.some((question) => question.id === "F11_TIPO_DETERGENTE")).toBe(true);
  });

  it("passes NSE C+, C típico and C-, and terminates D+ or inferior", () => {
    const definition = createDetergentsScreenerDefinition();

    expect(evaluateScreener(definition, eligibleAnswers(cPlusNseAnswers()))).toMatchObject({
      nse: { classCode: "C_PLUS", classLabel: "C+" },
      status: "PASSED"
    });
    expect(evaluateScreener(definition, eligibleAnswers(cTypicalNseAnswers()))).toMatchObject({
      nse: { classCode: "C", classLabel: "C típico" },
      status: "PASSED"
    });
    expect(evaluateScreener(definition, eligibleAnswers(cMinusNseAnswers()))).toMatchObject({
      nse: { classCode: "C_MINUS", classLabel: "C-" },
      status: "PASSED"
    });
    expect(evaluateScreener(definition, eligibleAnswers(dPlusNseAnswers()))).toMatchObject({
      nse: { classCode: "D_PLUS", classLabel: "D+" },
      status: "TERMINATED",
      termination: { code: "NSE_NO_ELEGIBLE" }
    });
    expect(evaluateScreener(definition, eligibleAnswers(inferiorNseAnswers()))).toMatchObject({
      nse: { classCode: "INFERIOR", classLabel: "Inferior" },
      status: "TERMINATED",
      termination: { code: "NSE_NO_ELEGIBLE" }
    });
  });
});

describe("detergents template loader", () => {
  it("creates the study as an editable draft and keeps it idempotent", async () => {
    const state = createMemoryTemplateRepository();

    const first = await loadDetergentsStudyTemplateForAdmin({ actor: adminActor, repository: state.repository });
    const second = await loadDetergentsStudyTemplateForAdmin({ actor: adminActor, repository: state.repository });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.data.studyCreated).toBe(true);
    expect(first.data.studyActivated).toBe(false);
    expect(first.data.activeVersionCreated).toBe(false);
    expect(first.data.versionNumber).toBe(0);
    expect(first.data.draftCreated).toBe(true);
    expect(first.data.studyResetToDraft).toBe(false);

    expect(second.data.studyCreated).toBe(false);
    expect(second.data.matchedBy).toBe("CODE");
    expect(second.data.draftUpdated).toBe(true);
    expect(second.data.activeVersionReused).toBe(false);

    expect(state.studies).toHaveLength(1);
    expect(state.studies[0]?.status).toBe("DRAFT");
    expect(state.drafts).toHaveLength(1);
    expect(state.versions).toHaveLength(0);
  });

  it("reuses a safe partial detergents study instead of creating a duplicate", async () => {
    const state = createMemoryTemplateRepository([
      {
        code: "DET-PARCIAL",
        id: "partial-study",
        name: "Detergentes y cuidado de la ropa",
        participantsCount: 0,
        status: "DRAFT"
      }
    ]);

    const result = await loadDetergentsStudyTemplateForAdmin({
      actor: adminActor,
      repository: state.repository
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.studyCreated).toBe(false);
    expect(result.data.matchedBy).toBe("NAME");
    expect(result.data.partialStudyUpdated).toBe(true);
    expect(result.data.studyActivated).toBe(false);
    expect(result.data.versionNumber).toBe(0);
    expect(state.studies).toHaveLength(1);
    expect(state.studies[0]).toMatchObject({
      code: DETERGENTS_STUDY_CODE,
      id: "partial-study",
      status: "DRAFT"
    });
  });

  it("returns an existing active detergents study to draft when it has no operational data", async () => {
    const state = createMemoryTemplateRepository([
      {
        code: DETERGENTS_STUDY_CODE,
        id: "study-detergents",
        name: "Detergentes y cuidado de la ropa — CDMX/GDL",
        participantsCount: 0,
        status: "ACTIVE"
      }
    ]);

    const result = await loadDetergentsStudyTemplateForAdmin({
      actor: adminActor,
      repository: state.repository
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.studyCreated).toBe(false);
    expect(result.data.studyResetToDraft).toBe(true);
    expect(result.data.draftCreated).toBe(true);
    expect(result.data.draftUpdated).toBe(false);
    expect(state.studies[0]?.status).toBe("DRAFT");
  });

  it("blocks resetting an active detergents study when it already has operational data", async () => {
    const state = createMemoryTemplateRepository([
      {
        code: DETERGENTS_STUDY_CODE,
        id: "study-detergents",
        name: "Detergentes y cuidado de la ropa — CDMX/GDL",
        participantsCount: 2,
        status: "ACTIVE"
      }
    ]);

    const result = await loadDetergentsStudyTemplateForAdmin({
      actor: adminActor,
      repository: state.repository
    });

    expect(result).toMatchObject({
      code: "PARTIAL_STUDY_HAS_DATA",
      message: "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro.",
      ok: false
    });
    expect(state.studies[0]?.status).toBe("ACTIVE");
    expect(state.drafts).toHaveLength(0);
  });

  it("does not claim a partial detergents study when it already has operational data", async () => {
    const repository: DetergentsTemplateRepository = {
      async ensureDetergentsStudy() {
        throw new DetergentsPartialStudyUnsafeError("partial-study");
      }
    };

    const result = await loadDetergentsStudyTemplateForAdmin({
      actor: adminActor,
      repository
    });

    expect(result).toMatchObject({
      code: "PARTIAL_STUDY_HAS_DATA",
      message: "El estudio ya tiene datos registrados. Para editarlo crea una nueva versión del filtro.",
      ok: false
    });
  });

  it("denies loading the detergents template to non-admin users", async () => {
    const result = await loadDetergentsStudyTemplateForAdmin({
      actor: { id: "interviewer-1", role: "INTERVIEWER", status: "ACTIVE" },
      repository: createMemoryTemplateRepository().repository
    });

    expect(result).toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });
});

function eligibleAnswers(overrides: ScreenerAnswers = {}): ScreenerAnswers {
  return {
    F0_RECLUTADOR: "RECLUTADORA",
    F1_CIUDAD: "CDMX",
    F2_GENERO: "MUJER",
    F3_RANGO_EDAD: "26_35",
    F4_EDAD_EXACTA: 30,
    F5_ACTIVIDADES_SENSIBLES: ["NINGUNA"],
    F6_PARTICIPACION_PREVIA: "NO",
    F7_MIEMBROS_HOGAR: "TRES_O_MAS",
    F8_RESPONSABLE_COMPRAS: "YO_PERSONALMENTE",
    F9_RESPONSABLE_LAVADO: "YO_PRINCIPALMENTE",
    F10_PRODUCTOS_USO_FRECUENTE: ["DETERGENTE_LIQUIDO"],
    F11_TIPO_DETERGENTE: "LIQUIDO",
    F12_MARCA_DETERGENTE: "MARCA EJEMPLO",
    F13_VARIANTE_DETERGENTE: "REGULAR",
    F14_PRODUCTOS_ADICIONALES_ROPA: ["NINGUNO"],
    ...cTypicalNseAnswers(),
    ...overrides
  };
}

function cTypicalNseAnswers(): ScreenerAnswers {
  return {
    NSE_D1_CUARTOS: "5_6",
    NSE_D2_BANOS: "DOS",
    NSE_D3_REGADERA: "SI_TIENE",
    NSE_D4_FOCOS: "11_15",
    NSE_D5_PISO: "OTRO_MATERIAL",
    NSE_D6_AUTOS: "UNO",
    NSE_D7_ESTUFA: "SI_TIENE",
    NSE_D8_ESCOLARIDAD: "NO_CONTESTO"
  };
}

function cPlusNseAnswers(): ScreenerAnswers {
  return {
    ...cTypicalNseAnswers(),
    NSE_D4_FOCOS: "6_10",
    NSE_D8_ESCOLARIDAD: "CARRERA_COMERCIAL"
  };
}

function cMinusNseAnswers(): ScreenerAnswers {
  return {
    ...cTypicalNseAnswers(),
    NSE_D2_BANOS: "UNO"
  };
}

function dPlusNseAnswers(): ScreenerAnswers {
  return {
    ...cMinusNseAnswers(),
    NSE_D7_ESTUFA: "NO_TIENE"
  };
}

function inferiorNseAnswers(): ScreenerAnswers {
  return {
    NSE_D1_CUARTOS: "1_4",
    NSE_D2_BANOS: "NINGUNO",
    NSE_D3_REGADERA: "NO_TIENE",
    NSE_D4_FOCOS: "0_5",
    NSE_D5_PISO: "TIERRA_CEMENTO",
    NSE_D6_AUTOS: "CERO",
    NSE_D7_ESTUFA: "NO_TIENE",
    NSE_D8_ESCOLARIDAD: "NO_ESTUDIO"
  };
}

function createMemoryTemplateRepository(
  initialStudies: Array<{
    code: string;
    id: string;
    name: string;
    participantsCount: number;
    status: "ACTIVE" | "DRAFT";
  }> = []
) {
  const studies = initialStudies.map((study) => ({ ...study }));
  const drafts: Array<{ definitionJson: ScreenerDefinition; id: string; studyId: string }> = [];
  const versions: Array<{ definitionHash: string; id: string; status: "ACTIVE" | "RETIRED"; versionNumber: number }> = [];

  const repository: DetergentsTemplateRepository = {
    async ensureDetergentsStudy(input) {
      let study = studies.find((item) => item.code === input.study.code);
      let matchedBy: "CODE" | "NAME" | "NONE" = study ? "CODE" : "NONE";
      let partialStudyUpdated = false;
      let studyCreated = false;
      let studyResetToDraft = false;

      if (!study) {
        study = studies.find((item) => /detergentes|cuidado de la ropa/i.test(item.name));
        matchedBy = study ? "NAME" : "NONE";
      }

      if (study && study.code !== input.study.code) {
        if (study.participantsCount > 0) {
          throw new DetergentsPartialStudyUnsafeError(study.id);
        }

        studyResetToDraft = study.status !== "DRAFT";
        study.code = input.study.code;
        study.name = input.study.name;
        study.status = "DRAFT";
        partialStudyUpdated = true;
      } else if (study) {
        if (study.status !== "DRAFT" && study.participantsCount > 0) {
          throw new DetergentsPartialStudyUnsafeError(study.id);
        }

        if (study.status !== "DRAFT" || study.name !== input.study.name) {
          studyResetToDraft = study.status !== "DRAFT";
          study.name = input.study.name;
          study.status = "DRAFT";
          partialStudyUpdated = true;
        }
      }

      if (!study) {
        study = {
          code: input.study.code,
          id: "study-1",
          name: input.study.name,
          participantsCount: 0,
          status: "DRAFT"
        };
        studies.push(study);
        studyCreated = true;
      }

      const existingDraft = drafts.find((draft) => draft.studyId === study.id);
      let draftCreated = false;
      let draftUpdated = false;

      if (existingDraft) {
        existingDraft.definitionJson = input.definition;
        draftUpdated = true;
      } else {
        drafts.push({
          definitionJson: input.definition,
          id: `draft-${drafts.length + 1}`,
          studyId: study.id
        });
        draftCreated = true;
      }

      return {
        activeVersionCreated: false,
        activeVersionReused: false,
        draftCreated,
        draftUpdated,
        matchedBy,
        matchedExistingStudy: !studyCreated,
        partialStudyUpdated,
        portalConfigUpserted: true,
        studyActivated: false,
        studyCreated,
        studyId: study.id,
        studyResetToDraft,
        versionNumber: 0
      };
    }
  };

  return { drafts, repository, studies, versions };
}
