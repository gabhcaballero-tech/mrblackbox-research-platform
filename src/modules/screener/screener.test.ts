import { describe, expect, it } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import {
  canonicalizeScreenerDefinition,
  hashScreenerDefinition,
  projectScreenerDefinitionForRole,
  screenerDefinitionSchema,
  type ScreenerDefinition
} from "./definition";
import { conditionMatches, evaluateScreener, getVisibleQuestions, isQuestionVisible } from "./evaluator";
import type {
  ScreenerBuilderData,
  ScreenerDraftRecord,
  ScreenerRepository,
  ScreenerStudySummary,
  ScreenerVersionRecord
} from "./repository";
import {
  addConsentDefaultOptionsForAdmin,
  addScreenerOptionForAdmin,
  addScreenerQuestionForAdmin,
  addScreenerRuleForAdmin,
  createScreenerDraftForAdmin,
  moveScreenerQuestionForAdmin,
  projectScreenerVersionForAdmin,
  publishScreenerForAdmin,
  saveScreenerNseForAdmin,
  updateScreenerOptionForAdmin,
  updateScreenerRuleForAdmin,
  type ScreenerAdminActor
} from "./service";

const studyId = "11111111-1111-4111-8111-111111111111";
const adminActor: ScreenerAdminActor = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "ADMIN",
  status: "ACTIVE"
};

function actor(role: InternalUserRole): ScreenerAdminActor {
  return {
    id: `actor-${role}`,
    role,
    status: "ACTIVE"
  };
}

function definition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    purpose: "SCREENER",
    questions: [
      {
        dataDestination: "SCREENING",
        id: "q-consent",
        options: [
          {
            actions: [{ type: "CONTINUE" }],
            isOther: false,
            label: "Sí, acepto participar",
            order: 1,
            otherTextRequired: false,
            value: "SI"
          },
          {
            actions: [
              {
                code: "SIN_CONSENTIMIENTO",
                reason: "La persona no aceptó participar voluntariamente en el estudio.",
                type: "TERMINATE"
              }
            ],
            isOther: false,
            label: "No, no acepto participar",
            order: 2,
            otherTextRequired: false,
            value: "NO"
          }
        ],
        order: 1,
        required: true,
        text: "Consentimiento",
        type: "CONSENT_YES_NO"
      },
      {
        dataDestination: "SCREENING",
        id: "q-choice",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Si",
            order: 1,
            otherTextRequired: false,
            value: "yes"
          },
          {
            actions: [
              {
                code: "choice-no",
                reason: "No cumple condicion.",
                type: "TERMINATE"
              }
            ],
            isOther: false,
            label: "No",
            order: 2,
            otherTextRequired: false,
            value: "no"
          },
          {
            actions: [],
            isOther: true,
            label: "Otro",
            order: 3,
            otherTextRequired: true,
            value: "other"
          }
        ],
        order: 2,
        required: true,
        text: "Seleccion unica",
        type: "SINGLE_CHOICE"
      },
      {
        dataDestination: "SCREENING",
        id: "q-multiple",
        options: [
          {
            actions: [],
            isOther: false,
            label: "A",
            order: 1,
            otherTextRequired: false,
            value: "a"
          },
          {
            actions: [
              {
                code: "review-flag",
                label: "Revisar seleccion",
                requiresReview: true,
                type: "FLAG"
              }
            ],
            isOther: false,
            label: "B",
            order: 2,
            otherTextRequired: false,
            value: "b"
          }
        ],
        order: 3,
        required: true,
        text: "Seleccion multiple",
        type: "MULTIPLE_CHOICE"
      },
      {
        dataDestination: "SCREENING",
        id: "q-age",
        order: 4,
        required: true,
        text: "Edad",
        type: "INTEGER",
        validation: { min: 18, max: 99 }
      },
      {
        dataDestination: "PARTICIPANT_PROFILE",
        id: "q-phone",
        order: 5,
        profileBinding: "PHONE",
        required: false,
        text: "Telefono",
        type: "SHORT_TEXT"
      },
      {
        dataDestination: "OPERATIONAL_INTERNAL",
        id: "q-open",
        order: 6,
        required: false,
        text: "Comentario",
        type: "LONG_TEXT"
      },
      {
        dataDestination: "OPERATIONAL_INTERNAL",
        id: "q-checklist",
        options: [
          {
            actions: [],
            isOther: false,
            label: "Validado",
            order: 1,
            otherTextRequired: false,
            value: "validated"
          }
        ],
        order: 7,
        required: false,
        text: "Checklist",
        type: "INTERVIEWER_CHECKLIST"
      }
    ],
    rules: [
      {
        condition: {
          questionId: "q-age",
          type: "NUMBER_RANGE",
          max: 17
        },
        id: "minor",
        order: 1,
        outcome: {
          code: "age-out",
          reason: "Edad fuera de rango.",
          type: "TERMINATE"
        }
      }
    ],
    schemaVersion: "screening.v1",
    title: "Screener generico",
    ...overrides
  });
}

function answers(overrides: Record<string, unknown> = {}) {
  return {
    "q-age": 25,
    "q-choice": "yes",
    "q-consent": true,
    "q-multiple": ["a"],
    ...overrides
  };
}

function definitionWithConditionalQuestion(
  visibilityCondition: ScreenerDefinition["questions"][number]["visibilityCondition"]
): ScreenerDefinition {
  const current = definition();

  return definition({
    questions: [
      ...current.questions,
      {
        dataDestination: "SCREENING",
        id: "q-follow",
        order: 8,
        required: true,
        text: "Pregunta condicional",
        type: "INTEGER",
        validation: {},
        visibilityCondition
      }
    ]
  });
}

function study(overrides: Partial<ScreenerStudySummary> = {}): ScreenerStudySummary {
  return {
    code: "STUDY-01",
    id: studyId,
    name: "Estudio",
    status: "DRAFT",
    timeZoneIana: "America/Mexico_City",
    ...overrides
  };
}

function draft(definitionJson: ScreenerDefinition = definition()): ScreenerDraftRecord {
  return {
    createdAt: new Date("2026-01-01T10:00:00Z"),
    createdByUserId: adminActor.id,
    definitionJson,
    id: "draft-1",
    name: definitionJson.title,
    purpose: "SCREENER",
    status: "DRAFT",
    studyId,
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    updatedByUserId: adminActor.id
  };
}

function version(versionNumber: number, status: "ACTIVE" | "RETIRED" = "ACTIVE"): ScreenerVersionRecord {
  const currentDefinition = definition();

  return {
    definitionHash: `hash-${versionNumber}`,
    definitionJson: currentDefinition,
    id: `version-${versionNumber}`,
    publishedAt: new Date("2026-01-01T10:00:00Z"),
    publishedByUserId: adminActor.id,
    questionnaireDraftId: "draft-1",
    retiredAt: status === "RETIRED" ? new Date("2026-01-02T10:00:00Z") : null,
    retiredByUserId: status === "RETIRED" ? adminActor.id : null,
    status,
    studyId,
    versionNumber
  };
}

function fakeRepository(builder: ScreenerBuilderData): ScreenerRepository {
  return {
    async createDraft(input) {
      const created = draft(input.definitionJson);
      builder.draft = created;
      return created;
    },
    async getBuilderData() {
      return builder;
    },
    async publishVersion(input) {
      const retiredCount = builder.versions.filter((item) => item.status === "ACTIVE").length;
      builder.versions = builder.versions.map((item) =>
        item.status === "ACTIVE"
          ? {
              ...item,
              retiredAt: new Date("2026-01-02T10:00:00Z"),
              retiredByUserId: input.publishedByUserId,
              status: "RETIRED"
            }
          : item
      );
      const nextVersion = version(builder.versions.length + 1, "ACTIVE");
      nextVersion.definitionHash = input.definitionHash;
      nextVersion.definitionJson = input.definitionJson;
      builder.versions.unshift(nextVersion);

      return {
        retiredCount,
        version: nextVersion
      };
    },
    async retireVersion(input) {
      const found = builder.versions.find(
        (item) => item.id === input.versionId && item.status === "ACTIVE"
      );

      if (!found) {
        return 0;
      }

      found.status = "RETIRED";
      found.retiredAt = new Date("2026-01-02T10:00:00Z");
      found.retiredByUserId = input.retiredByUserId;
      return 1;
    },
    async updateDraft(input) {
      if (!builder.draft || builder.draft.id !== input.draftId) {
        return 0;
      }

      builder.draft = {
        ...builder.draft,
        definitionJson: input.definitionJson,
        name: input.name,
        updatedByUserId: input.updatedByUserId
      };
      return 1;
    }
  };
}

describe("screening.v1 definition", () => {
  it("validates every V1 question type", () => {
    expect(definition().questions.map((question) => question.type)).toEqual([
      "CONSENT_YES_NO",
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "INTEGER",
      "SHORT_TEXT",
      "LONG_TEXT",
      "INTERVIEWER_CHECKLIST"
    ]);
  });

  it("rejects duplicate question ids", () => {
    const current = definition();

    expect(() =>
      screenerDefinitionSchema.parse({
        ...current,
        questions: [
          ...current.questions,
          {
            ...current.questions[0],
            order: 99
          }
        ]
      })
    ).toThrow();
  });

  it("rejects rules that reference unknown questions or options", () => {
    const current = definition();

    expect(() =>
      screenerDefinitionSchema.parse({
        ...current,
        rules: [
          {
            condition: {
              questionId: "missing-question",
              type: "ANSWER_EQUALS",
              value: "yes"
            },
            id: "missing-question",
            order: 2,
            outcome: {
              code: "missing",
              reason: "Missing.",
              type: "TERMINATE"
            }
          }
        ]
      })
    ).toThrow();

    expect(() =>
      screenerDefinitionSchema.parse({
        ...current,
        rules: [
          {
            condition: {
              questionId: "q-choice",
              type: "ANSWER_EQUALS",
              value: "missing-option"
            },
            id: "missing-option",
            order: 2,
            outcome: {
              code: "missing",
              reason: "Missing.",
              type: "TERMINATE"
            }
          }
        ]
      })
    ).toThrow();
  });

  it("uses a stable canonical hash", () => {
    const current = definition();
    const shuffled = {
      ...current,
      questions: [...current.questions].reverse(),
      rules: [...current.rules].reverse()
    };

    expect(hashScreenerDefinition(current)).toBe(hashScreenerDefinition(shuffled));
    expect(canonicalizeScreenerDefinition(shuffled).questions[0].id).toBe("q-consent");
  });
});

describe("screener evaluator", () => {
  it("marks Other as incomplete when required text is missing", () => {
    const result = evaluateScreener(definition(), answers({ "q-choice": { value: "other" } }));

    expect(result.status).toBe("INCOMPLETE");
    expect(result.missingQuestionIds).toContain("q-choice");
  });

  it("supports ANY, ALL, equality and range conditions", () => {
    expect(
      conditionMatches(
        {
          conditions: [
            { questionId: "q-choice", type: "ANSWER_EQUALS", value: "yes" },
            { questionId: "q-age", type: "NUMBER_RANGE", min: 18, max: 30 }
          ],
          type: "ALL"
        },
        answers()
      )
    ).toBe(true);

    expect(
      conditionMatches(
        {
          conditions: [
            { questionId: "q-multiple", type: "ANY_SELECTED", values: ["b"] },
            { questionId: "q-multiple", type: "ALL_SELECTED", values: ["a"] }
          ],
          type: "ANY"
        },
        answers()
      )
    ).toBe(true);
  });

  it("treats questions without visibility condition as always visible", () => {
    const current = definition();

    expect(isQuestionVisible(current.questions[0]!, answers(), current)).toBe(true);
    expect(getVisibleQuestions(current, answers()).map((question) => question.id)).toContain("q-choice");
  });

  it("shows a question when an equality visibility condition matches", () => {
    const current = definitionWithConditionalQuestion({
      questionId: "q-choice",
      type: "ANSWER_EQUALS",
      value: "yes"
    });

    expect(getVisibleQuestions(current, answers()).map((question) => question.id)).toContain("q-follow");
  });

  it("hides a question when visibility condition does not match or source answer is missing", () => {
    const current = definitionWithConditionalQuestion({
      questionId: "q-choice",
      type: "ANSWER_EQUALS",
      value: "other"
    });

    expect(getVisibleQuestions(current, answers()).map((question) => question.id)).not.toContain("q-follow");
    expect(
      getVisibleQuestions(current, answers({ "q-choice": undefined })).map((question) => question.id)
    ).not.toContain("q-follow");
  });

  it("supports numeric range and selected option visibility conditions", () => {
    const rangeDefinition = definitionWithConditionalQuestion({
      max: 30,
      min: 18,
      questionId: "q-age",
      type: "NUMBER_RANGE"
    });
    const selectedDefinition = definitionWithConditionalQuestion({
      questionId: "q-multiple",
      type: "ANY_SELECTED",
      values: ["b"]
    });

    expect(getVisibleQuestions(rangeDefinition, answers({ "q-age": 25 })).map((question) => question.id)).toContain("q-follow");
    expect(getVisibleQuestions(selectedDefinition, answers({ "q-multiple": ["b"] })).map((question) => question.id)).toContain("q-follow");
  });

  it("does not mark hidden required questions as incomplete", () => {
    const current = definitionWithConditionalQuestion({
      questionId: "q-choice",
      type: "ANSWER_EQUALS",
      value: "other"
    });

    const result = evaluateScreener(current, answers());

    expect(result.status).toBe("PASSED");
    expect(result.missingQuestionIds).not.toContain("q-follow");
  });

  it("marks visible required questions as incomplete when answer is missing", () => {
    const current = definitionWithConditionalQuestion({
      questionId: "q-choice",
      type: "ANSWER_EQUALS",
      value: "yes"
    });

    const result = evaluateScreener(current, answers());

    expect(result.status).toBe("INCOMPLETE");
    expect(result.missingQuestionIds).toContain("q-follow");
  });

  it("rejects invalid visibility references", () => {
    const current = definition();

    expect(() =>
      definition({
        questions: current.questions.map((question) =>
          question.id === "q-choice"
            ? {
                ...question,
                visibilityCondition: {
                  questionId: "q-choice",
                  type: "ANSWER_EQUALS",
                  value: "yes"
                }
              }
            : question
        )
      })
    ).toThrow();

    expect(() =>
      definition({
        questions: current.questions.map((question) =>
          question.id === "q-choice"
            ? {
                ...question,
                visibilityCondition: {
                  max: 99,
                  min: 18,
                  questionId: "q-age",
                  type: "NUMBER_RANGE"
                }
              }
            : question
        )
      })
    ).toThrow();

    expect(() =>
      definitionWithConditionalQuestion({
        questionId: "q-missing",
        type: "ANSWER_EQUALS",
        value: "yes"
      })
    ).toThrow();
  });

  it("terminates by option action", () => {
    const result = evaluateScreener(definition(), answers({ "q-choice": "no" }));

    expect(result.status).toBe("TERMINATED");
    expect(result.result).toBe("NOT_ELIGIBLE");
    expect(result.termination?.code).toBe("choice-no");
  });

  it("returns pending review when a review flag matches", () => {
    const result = evaluateScreener(definition(), answers({ "q-multiple": ["b"] }));

    expect(result.status).toBe("PENDING_REVIEW");
    expect(result.evaluationJson.flags[0]).toMatchObject({
      code: "review-flag",
      requiresReview: true
    });
  });

  it("calculates NSE and determines eligibility", () => {
    const current = definition({
      nse: {
        code: "nse",
        inputs: [
          {
            missingScore: 0,
            questionId: "q-choice",
            scoreByAnswer: { no: 0, other: 1, yes: 5 }
          },
          {
            missingScore: 0,
            questionId: "q-multiple",
            scoreByAnswer: { a: 5, b: 1 }
          }
        ],
        label: "NSE generico",
        ranges: [
          { code: "low", eligible: false, label: "Bajo", max: 6, min: 0 },
          { code: "high", eligible: true, label: "Alto", max: 10, min: 7 }
        ],
        type: "score_table"
      }
    });

    const eligible = evaluateScreener(current, answers());
    const notEligible = evaluateScreener(current, answers({ "q-multiple": ["b"] }));

    expect(eligible.status).toBe("PASSED");
    expect(eligible.nse).toMatchObject({ classCode: "high", eligible: true, score: 10 });
    expect(notEligible.status).toBe("TERMINATED");
    expect(notEligible.nse).toMatchObject({ classCode: "low", eligible: false, score: 6 });
  });
});

describe("screener admin service", () => {
  it("allows ADMIN and denies non ADMIN", async () => {
    const builder = {
      draft: null,
      study: study(),
      versions: []
    };

    await expect(
      createScreenerDraftForAdmin({
        actor: adminActor,
        repository: fakeRepository(builder),
        studyId
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      createScreenerDraftForAdmin({
        actor: actor("SUPERVISOR"),
        repository: fakeRepository(builder),
        studyId
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("rejects mutations when study is not DRAFT", async () => {
    const result = await addScreenerQuestionForAdmin({
      actor: adminActor,
      formInput: {
        dataDestination: "SCREENING",
        id: "q-new",
        required: true,
        text: "Nueva",
        type: "SHORT_TEXT"
      },
      repository: fakeRepository({
        draft: draft(),
        study: study({ status: "ACTIVE" }),
        versions: []
      }),
      studyId
    });

    expect(result).toMatchObject({ code: "STUDY_NOT_DRAFT", ok: false });
  });

  it("creates default SI and NO options for a new consent question", async () => {
    const builder = {
      draft: draft(definition({ questions: [], rules: [] })),
      study: study(),
      versions: []
    };

    const result = await addScreenerQuestionForAdmin({
      actor: adminActor,
      formInput: {
        dataDestination: "SCREENING",
        id: "q-consent-new",
        required: false,
        text: "Consentimiento",
        type: "CONSENT_YES_NO"
      },
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      id: "q-consent-new",
      required: true,
      type: "CONSENT_YES_NO",
      options: [
        {
          actions: [{ type: "CONTINUE" }],
          label: "Sí, acepto participar",
          order: 1,
          value: "SI"
        },
        {
          actions: [
            {
              code: "SIN_CONSENTIMIENTO",
              reason: "La persona no aceptó participar voluntariamente en el estudio.",
              type: "TERMINATE"
            }
          ],
          label: "No, no acepto participar",
          order: 2,
          value: "NO"
        }
      ]
    });
  });

  it("repairs an existing consent question without options", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-consent-old",
              order: 1,
              required: true,
              text: "Consentimiento",
              type: "CONSENT_YES_NO"
            } as unknown as ScreenerDefinition["questions"][number]
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await addConsentDefaultOptionsForAdmin({
      actor: adminActor,
      questionId: "q-consent-old",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [
        { label: "Sí, acepto participar", value: "SI" },
        { label: "No, no acepto participar", value: "NO" }
      ],
      required: true
    });
  });

  it("does not duplicate SI or NO when repairing consent options", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-consent-partial",
              options: [
                {
                  actions: [{ type: "CONTINUE" }],
                  isOther: false,
                  label: "Acepto personalizado",
                  order: 1,
                  otherTextRequired: false,
                  value: "SI"
                }
              ],
              order: 1,
              required: true,
              text: "Consentimiento",
              type: "CONSENT_YES_NO",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    await addConsentDefaultOptionsForAdmin({
      actor: adminActor,
      questionId: "q-consent-partial",
      repository: fakeRepository(builder),
      studyId
    });
    await addConsentDefaultOptionsForAdmin({
      actor: adminActor,
      questionId: "q-consent-partial",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);
    const question = nextDefinition.questions[0];

    expect("options" in question ? question.options.filter((option) => option.value === "SI") : []).toHaveLength(1);
    expect("options" in question ? question.options.filter((option) => option.value === "NO") : []).toHaveLength(1);
    expect(question).toMatchObject({
      options: [
        { label: "Acepto personalizado", value: "SI" },
        { label: "No, no acepto participar", value: "NO" }
      ]
    });
  });

  it("does not overwrite a customized consent option", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-consent-custom",
              options: [
                {
                  actions: [
                    {
                      code: "NO_CUSTOM",
                      reason: "Motivo personalizado.",
                      type: "TERMINATE"
                    }
                  ],
                  isOther: false,
                  label: "No personalizado",
                  order: 1,
                  otherTextRequired: false,
                  value: "NO"
                }
              ],
              order: 1,
              required: true,
              text: "Consentimiento",
              type: "CONSENT_YES_NO",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await addConsentDefaultOptionsForAdmin({
      actor: adminActor,
      questionId: "q-consent-custom",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [
        {
          actions: [
            {
              code: "NO_CUSTOM",
              reason: "Motivo personalizado.",
              type: "TERMINATE"
            }
          ],
          label: "No personalizado",
          value: "NO"
        },
        {
          actions: [{ type: "CONTINUE" }],
          label: "Sí, acepto participar",
          value: "SI"
        }
      ]
    });
  });

  it("publishes consecutive versions and retires the previous active version", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: [version(1, "ACTIVE")]
    };
    const result = await publishScreenerForAdmin({
      actor: adminActor,
      repository: fakeRepository(builder),
      studyId
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.data.version.versionNumber : null).toBe(2);
    expect(result.ok ? result.data.retiredCount : null).toBe(1);
    expect(builder.versions.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
    expect(builder.versions.find((item) => item.versionNumber === 1)?.status).toBe("RETIRED");
  });

  it("saves guided NSE values into the existing definition contract", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };
    const result = await saveScreenerNseForAdmin({
      actor: adminActor,
      formInput: {
        code: "nse",
        inputsText: "q-choice|yes=3,no=0,other=1|missing=0",
        label: "Nivel NSE",
        rangesText: "BAJO|Bajo|0|2|false\nALTO|Alto|3|10|true"
      },
      repository: fakeRepository(builder),
      studyId
    });

    expect(result).toMatchObject({ ok: true });
    expect(builder.draft?.definitionJson).toMatchObject({
      nse: {
        code: "nse",
        inputs: [
          {
            missingScore: 0,
            questionId: "q-choice",
            scoreByAnswer: {
              no: 0,
              other: 1,
              yes: 3
            }
          }
        ],
        label: "Nivel NSE",
        ranges: [
          { code: "BAJO", eligible: false, label: "Bajo", max: 2, min: 0 },
          { code: "ALTO", eligible: true, label: "Alto", max: 10, min: 3 }
        ],
        type: "score_table"
      }
    });
  });

  it("adds the first option to an option question", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await addScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Hombre",
        otherTextRequired: false,
        value: "HOMBRE"
      },
      questionId: "q-gender",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [{ label: "Hombre", value: "HOMBRE" }]
    });
  });

  it("adds a second distinct option to the same question", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };
    const repository = fakeRepository(builder);

    await addScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Hombre",
        otherTextRequired: false,
        value: "HOMBRE"
      },
      questionId: "q-gender",
      repository,
      studyId
    });
    const result = await addScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Mujer",
        otherTextRequired: false,
        value: "MUJER"
      },
      questionId: "q-gender",
      repository,
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [
        { label: "Hombre", order: 1, value: "HOMBRE" },
        { label: "Mujer", order: 2, value: "MUJER" }
      ]
    });
  });

  it("rejects duplicate option values without replacing the current options", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };
    const repository = fakeRepository(builder);

    await addScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Hombre",
        otherTextRequired: false,
        value: "HOMBRE"
      },
      questionId: "q-gender",
      repository,
      studyId
    });
    const result = await addScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Duplicado",
        otherTextRequired: false,
        value: "HOMBRE"
      },
      questionId: "q-gender",
      repository,
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ code: "VALIDATION_ERROR", ok: false });
    expect(JSON.stringify(result)).toContain("duplicado");
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [{ label: "Hombre", value: "HOMBRE" }]
    });
  });

  it("updates an existing option with TERMINATE action and persists code and reason", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [
                {
                  actions: [],
                  isOther: false,
                  label: "Mujer",
                  order: 1,
                  otherTextRequired: false,
                  value: "MUJER"
                }
              ],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await updateScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionCode: "GENERO_NO_ELEGIBLE",
        actionReason: "El estudio esta dirigido a hombres.",
        actionRequiresReview: false,
        actionType: "TERMINATE",
        isOther: false,
        label: "Mujer",
        otherTextRequired: false,
        value: "MUJER"
      },
      optionValue: "MUJER",
      questionId: "q-gender",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [
        {
          actions: [
            {
              code: "GENERO_NO_ELEGIBLE",
              reason: "El estudio esta dirigido a hombres.",
              type: "TERMINATE"
            }
          ],
          label: "Mujer",
          value: "MUJER"
        }
      ]
    });
  });

  it.each([
    {
      actionCode: undefined,
      actionReason: undefined,
      actionRequiresReview: false,
      actionType: "CONTINUE",
      expectedActions: [{ type: "CONTINUE" }]
    },
    {
      actionCode: "GENERO_NO_ELEGIBLE",
      actionReason: "No califica.",
      actionRequiresReview: false,
      actionType: "TERMINATE",
      expectedActions: [
        { code: "GENERO_NO_ELEGIBLE", reason: "No califica.", type: "TERMINATE" }
      ]
    },
    {
      actionCode: "REVISAR_GENERO",
      actionReason: "Requiere revisión.",
      actionRequiresReview: false,
      actionType: "PENDING_REVIEW",
      expectedActions: [
        { code: "REVISAR_GENERO", reason: "Requiere revisión.", type: "PENDING_REVIEW" }
      ]
    },
    {
      actionCode: "BANDERA_GENERO",
      actionReason: undefined,
      actionRequiresReview: true,
      actionType: "FLAG",
      expectedActions: [
        { code: "BANDERA_GENERO", requiresReview: true, type: "FLAG" }
      ]
    }
  ] as const)("saves direct option action $actionType", async ({
    actionCode,
    actionReason,
    actionRequiresReview,
    actionType,
    expectedActions
  }) => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [
                {
                  actions: [],
                  isOther: false,
                  label: "Mujer",
                  order: 1,
                  otherTextRequired: false,
                  value: "MUJER"
                }
              ],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await updateScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionCode,
        actionReason,
        actionRequiresReview,
        actionType,
        isOther: false,
        label: "Mujer",
        otherTextRequired: false,
        value: "MUJER"
      },
      optionValue: "MUJER",
      questionId: "q-gender",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [{ actions: expectedActions, label: "Mujer", value: "MUJER" }]
    });
  });

  it("rejects TERMINATE option updates without code or reason", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [
                {
                  actions: [],
                  isOther: false,
                  label: "Mujer",
                  order: 1,
                  otherTextRequired: false,
                  value: "MUJER"
                }
              ],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await updateScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionRequiresReview: false,
        actionType: "TERMINATE",
        isOther: false,
        label: "Mujer",
        otherTextRequired: false,
        value: "MUJER"
      },
      optionValue: "MUJER",
      questionId: "q-gender",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ code: "VALIDATION_ERROR", ok: false });
    expect(result.ok ? null : result.fieldErrors?.actionCode?.[0]).toMatch(/código de acción/);
    expect(result.ok ? null : result.fieldErrors?.actionReason?.[0]).toMatch(/motivo/);
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [{ actions: [], label: "Mujer", value: "MUJER" }]
    });
  });

  it("keeps No aplica only when NONE is the saved option action", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-gender",
              options: [
                {
                  actions: [
                    {
                      code: "GENERO_NO_ELEGIBLE",
                      reason: "No califica.",
                      type: "TERMINATE"
                    }
                  ],
                  isOther: false,
                  label: "Mujer",
                  order: 1,
                  otherTextRequired: false,
                  value: "MUJER"
                }
              ],
              order: 1,
              required: true,
              text: "Genero",
              type: "SINGLE_CHOICE",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await updateScreenerOptionForAdmin({
      actor: adminActor,
      formInput: {
        actionCode: "IGNORED",
        actionReason: "Ignorado",
        actionRequiresReview: false,
        actionType: "NONE",
        isOther: false,
        label: "Mujer",
        otherTextRequired: false,
        value: "MUJER"
      },
      optionValue: "MUJER",
      questionId: "q-gender",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions[0]).toMatchObject({
      options: [{ actions: [], label: "Mujer", value: "MUJER" }]
    });
  });

  it("rejects invalid guided NSE ranges on the server side", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };

    await expect(
      saveScreenerNseForAdmin({
        actor: adminActor,
        formInput: {
          code: "nse",
          inputsText: "q-choice|yes=3,no=0,other=1|missing=0",
          label: "Nivel NSE",
          rangesText: "BAJO|Bajo|0|5|true\nMEDIO|Medio|5|10|false"
        },
        repository: fakeRepository(builder),
        studyId
      })
    ).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Los rangos NSE no pueden traslaparse.",
      ok: false
    });
  });

  it("rejects rules that point to a missing draft question", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };

    const result = await addScreenerRuleForAdmin({
      actor: adminActor,
      formInput: {
        conditionType: "ANSWER_EQUALS",
        id: "missing-question-rule",
        outcomeCode: "missing-question",
        outcomeReason: "Pregunta no disponible.",
        outcomeRequiresReview: false,
        outcomeType: "TERMINATE",
        questionId: "missing-question",
        value: "yes"
      },
      repository: fakeRepository(builder),
      studyId
    });

    expect(result).toMatchObject({
      code: "QUESTION_NOT_FOUND",
      message: "La pregunta seleccionada no existe en el borrador.",
      ok: false
    });
  });

  it("updates an existing rule without duplicating it", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };

    const result = await updateScreenerRuleForAdmin({
      actor: adminActor,
      formInput: {
        conditionType: "NUMBER_RANGE",
        id: "minor",
        max: "19",
        min: "0",
        outcomeCode: "EDAD_MENOR_20",
        outcomeReason: "La edad es menor a 20 años.",
        outcomeRequiresReview: false,
        outcomeType: "TERMINATE",
        questionId: "q-age"
      },
      repository: fakeRepository(builder),
      ruleId: "minor",
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.rules).toHaveLength(1);
    expect(nextDefinition.rules[0]).toMatchObject({
      condition: {
        max: 19,
        min: 0,
        questionId: "q-age",
        type: "NUMBER_RANGE"
      },
      id: "minor",
      outcome: {
        code: "EDAD_MENOR_20",
        reason: "La edad es menor a 20 años.",
        type: "TERMINATE"
      }
    });
  });

  it("rejects invalid numeric ranges before saving a rule", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };

    const result = await addScreenerRuleForAdmin({
      actor: adminActor,
      formInput: {
        conditionType: "NUMBER_RANGE",
        id: "invalid-range-rule",
        max: "5",
        min: "10",
        outcomeCode: "age-range",
        outcomeReason: "Edad fuera de rango.",
        outcomeRequiresReview: false,
        outcomeType: "TERMINATE",
        questionId: "q-age"
      },
      repository: fakeRepository(builder),
      studyId
    });

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
    expect(result.ok ? null : result.fieldErrors?.min?.[0]).toMatch(/mínimo.*máximo/);
  });

  it("rejects incompatible question and rule condition combinations", async () => {
    const builder = {
      draft: draft(),
      study: study(),
      versions: []
    };

    const result = await updateScreenerRuleForAdmin({
      actor: adminActor,
      formInput: {
        conditionType: "NUMBER_RANGE",
        id: "minor",
        max: "19",
        min: "0",
        outcomeCode: "INVALID_RANGE",
        outcomeReason: "No aplica.",
        outcomeRequiresReview: false,
        outcomeType: "TERMINATE",
        questionId: "q-choice"
      },
      repository: fakeRepository(builder),
      ruleId: "minor",
      studyId
    });

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
    expect(result.ok ? "" : result.message).toMatch(/n.mero entero/);
  });

  it("moves up a question without visibility condition", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-1",
              order: 1,
              required: true,
              text: "Pregunta 1",
              type: "SHORT_TEXT",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "q-2",
              order: 2,
              required: true,
              text: "Pregunta 2",
              type: "SHORT_TEXT",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "q-3",
              order: 3,
              required: true,
              text: "Pregunta 3",
              type: "SHORT_TEXT",
              validation: {}
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "q-3",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions.map((question) => question.id)).toEqual(["q-1", "q-3", "q-2"]);
  });

  it("moves up a dependent question while it stays after its source question", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-source",
              options: [
                {
                  actions: [],
                  isOther: false,
                  label: "Si",
                  order: 1,
                  otherTextRequired: false,
                  value: "YES"
                }
              ],
              order: 1,
              required: true,
              text: "Pregunta origen",
              type: "SINGLE_CHOICE",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "q-middle",
              order: 2,
              required: false,
              text: "Pregunta intermedia",
              type: "SHORT_TEXT",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "q-dependent",
              order: 3,
              required: true,
              text: "Pregunta dependiente",
              type: "INTEGER",
              validation: {},
              visibilityCondition: {
                questionId: "q-source",
                type: "ANSWER_EQUALS",
                value: "YES"
              }
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };

    const result = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "q-dependent",
      repository: fakeRepository(builder),
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);
    const dependent = nextDefinition.questions.find((question) => question.id === "q-dependent");

    expect(result).toMatchObject({ ok: true });
    expect(nextDefinition.questions.map((question) => question.id)).toEqual([
      "q-source",
      "q-dependent",
      "q-middle"
    ]);
    expect(dependent?.visibilityCondition).toMatchObject({
      questionId: "q-source",
      type: "ANSWER_EQUALS",
      value: "YES"
    });
  });

  it("blocks moving a dependent question above its source question", async () => {
    const builder = {
      draft: draft(
        definition({
          nse: {
            code: "nse",
            inputs: [
              {
                missingScore: 0,
                questionId: "q-dependent",
                scoreByAnswer: { "2": 2 }
              }
            ],
            label: "NSE",
            ranges: [{ code: "OK", eligible: true, label: "OK", max: 10, min: 0 }],
            type: "score_table"
          },
          questions: [
            {
              dataDestination: "SCREENING",
              id: "q-source",
              options: [
                {
                  actions: [],
                  isOther: false,
                  label: "Si",
                  order: 1,
                  otherTextRequired: false,
                  value: "YES"
                }
              ],
              order: 1,
              required: true,
              text: "Pregunta origen",
              type: "SINGLE_CHOICE",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "q-dependent",
              order: 2,
              required: true,
              text: "Pregunta dependiente",
              type: "INTEGER",
              validation: { max: 20, min: 2 },
              visibilityCondition: {
                questionId: "q-source",
                type: "ANSWER_EQUALS",
                value: "YES"
              }
            }
          ],
          rules: [
            {
              condition: {
                max: 20,
                min: 2,
                questionId: "q-dependent",
                type: "NUMBER_RANGE"
              },
              id: "dependent-range",
              order: 1,
              outcome: {
                code: "DEPENDENT_OK",
                reason: "La respuesta es valida.",
                type: "TERMINATE"
              }
            }
          ]
        })
      ),
      study: study(),
      versions: []
    };

    const before = screenerDefinitionSchema.parse(builder.draft?.definitionJson);
    const result = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "q-dependent",
      repository: fakeRepository(builder),
      studyId
    });
    const after = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "No se puede mover esta pregunta antes de la pregunta de la que depende.",
      ok: false
    });
    expect(after.questions.map((question) => question.id)).toEqual(before.questions.map((question) => question.id));
    expect(after.questions.find((question) => question.id === "q-dependent")?.visibilityCondition).toEqual(
      before.questions.find((question) => question.id === "q-dependent")?.visibilityCondition
    );
    expect(after.rules).toEqual(before.rules);
    expect(after.nse).toEqual(before.nse);
    expect(new Set(after.questions.map((question) => question.id)).size).toBe(after.questions.length);
  });

  it("allows F9A to move until it is immediately after F9 and no further", async () => {
    const builder = {
      draft: draft(
        definition({
          questions: [
            {
              dataDestination: "SCREENING",
              id: "F9_FRECUENCIA_SEMANAL",
              options: [
                {
                  actions: [{ type: "CONTINUE" }],
                  isOther: false,
                  label: "Mas de una vez al dia",
                  order: 1,
                  otherTextRequired: false,
                  value: "MAS_DE_UNA_VEZ_DIA"
                }
              ],
              order: 1,
              required: true,
              text: "Frecuencia semanal",
              type: "SINGLE_CHOICE",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "F10_OTRA",
              order: 2,
              required: false,
              text: "Pregunta 10",
              type: "SHORT_TEXT",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "F11_OTRA",
              order: 3,
              required: false,
              text: "Pregunta 11",
              type: "SHORT_TEXT",
              validation: {}
            },
            {
              dataDestination: "SCREENING",
              id: "F9A_VECES_AL_DIA",
              order: 4,
              required: true,
              text: "Veces al dia",
              type: "INTEGER",
              validation: { max: 20, min: 2 },
              visibilityCondition: {
                questionId: "F9_FRECUENCIA_SEMANAL",
                type: "ANSWER_EQUALS",
                value: "MAS_DE_UNA_VEZ_DIA"
              }
            }
          ],
          rules: []
        })
      ),
      study: study(),
      versions: []
    };
    const repository = fakeRepository(builder);

    const firstMove = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "F9A_VECES_AL_DIA",
      repository,
      studyId
    });
    const secondMove = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "F9A_VECES_AL_DIA",
      repository,
      studyId
    });
    const thirdMove = await moveScreenerQuestionForAdmin({
      actor: adminActor,
      direction: "up",
      questionId: "F9A_VECES_AL_DIA",
      repository,
      studyId
    });
    const nextDefinition = screenerDefinitionSchema.parse(builder.draft?.definitionJson);

    expect(firstMove).toMatchObject({ ok: true });
    expect(secondMove).toMatchObject({ ok: true });
    expect(nextDefinition.questions.map((question) => question.id)).toEqual([
      "F9_FRECUENCIA_SEMANAL",
      "F9A_VECES_AL_DIA",
      "F10_OTRA",
      "F11_OTRA"
    ]);
    expect(thirdMove).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "No se puede mover esta pregunta antes de la pregunta de la que depende.",
      ok: false
    });
  });

  it("projects published and retired versions as read-only", () => {
    expect(projectScreenerVersionForAdmin(version(1, "ACTIVE"))).toMatchObject({
      readOnly: true,
      status: "ACTIVE"
    });
    expect(projectScreenerVersionForAdmin(version(1, "RETIRED"))).toMatchObject({
      readOnly: true,
      status: "RETIRED"
    });
  });

  it("does not expose participant profile PII fields to ANALYST projections", () => {
    const projection = projectScreenerDefinitionForRole(definition(), "ANALYST");

    expect(JSON.stringify(projection)).not.toContain("Telefono");
    expect(JSON.stringify(projection)).not.toContain("PHONE");
    expect(
      projection.questions.find((question) => question.id === "q-phone")
    ).toMatchObject({
      text: "Campo de perfil restringido"
    });
  });
});
