import { describe, expect, it } from "vitest";
import type { InternalUserRole } from "@/shared/auth/permissions";
import {
  canonicalizeScreenerDefinition,
  hashScreenerDefinition,
  projectScreenerDefinitionForRole,
  screenerDefinitionSchema,
  type ScreenerDefinition
} from "./definition";
import { conditionMatches, evaluateScreener } from "./evaluator";
import type {
  ScreenerBuilderData,
  ScreenerDraftRecord,
  ScreenerRepository,
  ScreenerStudySummary,
  ScreenerVersionRecord
} from "./repository";
import {
  addScreenerQuestionForAdmin,
  createScreenerDraftForAdmin,
  projectScreenerVersionForAdmin,
  publishScreenerForAdmin,
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
