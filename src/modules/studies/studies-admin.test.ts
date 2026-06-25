import { describe, expect, it } from "vitest";
import type { InternalUserRole, InternalUserStatus } from "@/shared/auth/permissions";
import type {
  CreateStudyRecordInput,
  StudiesRepository,
  StudyActivationState,
  StudyEditState,
  StudyListItem,
  StudyRiskState,
  UpdateDraftStudyRecordInput
} from "./repository";
import {
  activateStudyForAdmin,
  archiveStudyForAdmin,
  createStudyForAdmin,
  deleteEmptyStudyForAdmin,
  getStudyRiskForAdmin,
  listStudiesForAdmin,
  type StudiesActor,
  updateDraftStudyForAdmin
} from "./service";
import { studyAdminInputSchema } from "./validation";

const adminActor: StudiesActor = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "ADMIN",
  status: "ACTIVE"
};

function actor(role: InternalUserRole, status: InternalUserStatus = "ACTIVE"): StudiesActor {
  return {
    id: `${role.toLowerCase()}-actor`,
    role,
    status
  };
}

function study(overrides: Partial<StudyListItem> = {}): StudyListItem {
  return {
    code: "STUDY-01",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    id: "22222222-2222-4222-8222-222222222222",
    name: "Estudio base",
    status: "DRAFT",
    timeZoneIana: "America/Mexico_City",
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...overrides
  };
}

function fakeRepository(options: {
  studies?: StudyListItem[];
  risks?: Record<string, StudyRiskState>;
  onArchive?: (id: string) => Promise<{ code: string; id: string; portalDisabled: boolean; status: "ARCHIVED" } | null> | { code: string; id: string; portalDisabled: boolean; status: "ARCHIVED" } | null;
  onCreate?: (input: CreateStudyRecordInput) => Promise<StudyListItem> | StudyListItem;
  onDelete?: (id: string) => Promise<{ code: string; id: string } | null> | { code: string; id: string } | null;
  onUpdate?: (input: UpdateDraftStudyRecordInput) => Promise<number> | number;
  onActivate?: (id: string) => Promise<number> | number;
  onFindActivationState?: (id: string) => Promise<StudyActivationState> | StudyActivationState;
  onFindEditState?: (id: string) => Promise<StudyEditState> | StudyEditState;
} = {}): StudiesRepository {
  return {
    async archiveStudy(id) {
      if (options.onArchive) {
        return options.onArchive(id);
      }

      const found = options.studies?.find((item) => item.id === id);

      return found
        ? {
            code: found.code,
            id: found.id,
            portalDisabled: true,
            status: "ARCHIVED"
          }
        : null;
    },
    async activateStudy(id) {
      if (options.onActivate) {
        return options.onActivate(id);
      }

      return options.studies?.some((item) => item.id === id && item.status === "DRAFT")
        ? 1
        : 0;
    },
    async deleteEmptyStudy(id) {
      if (options.onDelete) {
        return options.onDelete(id);
      }

      const found = options.studies?.find((item) => item.id === id);

      return found ? { code: found.code, id: found.id } : null;
    },
    async createStudy(input) {
      if (options.onCreate) {
        return options.onCreate(input);
      }

      return study({
        code: input.code,
        name: input.name,
        status: input.status,
        timeZoneIana: input.timeZoneIana
      });
    },
    async findStudyEditState(id) {
      if (options.onFindEditState) {
        return options.onFindEditState(id);
      }

      return options.studies?.find((item) => item.id === id) ?? null;
    },
    async getStudyRiskState(id) {
      if (options.risks?.[id]) {
        return options.risks[id];
      }

      const found = options.studies?.find((item) => item.id === id);

      return found ? { ...found, deletionBlockers: [] } : null;
    },
    async findStudyActivationState(id) {
      if (options.onFindActivationState) {
        return options.onFindActivationState(id);
      }

      const found = options.studies?.find((item) => item.id === id);

      return found
        ? {
            id: found.id,
            questionnaireVersions: [],
            status: found.status
          }
        : null;
    },
    async listStudies(mode = "active") {
      return (options.studies ?? []).filter((item) =>
        mode === "archived" ? item.status === "ARCHIVED" : item.status !== "ARCHIVED"
      );
    },
    async updateDraftStudy(input) {
      if (options.onUpdate) {
        return options.onUpdate(input);
      }

      return options.studies?.some((item) => item.id === input.id && item.status === "DRAFT")
        ? 1
        : 0;
    }
  };
}

describe("study admin validation", () => {
  it("normalizes and validates name, code and time zone", () => {
    const parsed = studyAdminInputSchema.safeParse({
      code: "  prueba__campo   01 ",
      name: "  Estudio   de   prueba  ",
      timeZoneIana: "America/Mexico_City"
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : null).toEqual({
      code: "PRUEBA-CAMPO-01",
      name: "Estudio de prueba",
      timeZoneIana: "America/Mexico_City"
    });
  });

  it("rejects empty name, invalid code and invalid time zone", () => {
    const parsed = studyAdminInputSchema.safeParse({
      code: "-",
      name: "   ",
      timeZoneIana: "Not/A_TimeZone"
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? {} : parsed.error.flatten().fieldErrors).toMatchObject({
      code: expect.any(Array),
      name: expect.any(Array),
      timeZoneIana: expect.any(Array)
    });
  });
});

describe("study admin service", () => {
  it("allows ADMIN to list studies ordered by newest first", async () => {
    const older = study({
      code: "OLDER",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      id: "33333333-3333-4333-8333-333333333333"
    });
    const newer = study({
      code: "NEWER",
      createdAt: new Date("2026-01-02T10:00:00Z"),
      id: "44444444-4444-4444-8444-444444444444"
    });

    const result = await listStudiesForAdmin({
      actor: adminActor,
      repository: fakeRepository({ studies: [older, newer] })
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.map((item) => item.code) : []).toEqual(["NEWER", "OLDER"]);
  });

  it("hides archived studies from the active list and exposes them in the archived list", async () => {
    const active = study({ code: "ACTIVE", status: "ACTIVE" });
    const archived = study({
      code: "ARCHIVED",
      id: "55555555-5555-4555-8555-555555555555",
      status: "ARCHIVED"
    });

    await expect(
      listStudiesForAdmin({
        actor: adminActor,
        repository: fakeRepository({ studies: [active, archived] })
      })
    ).resolves.toMatchObject({
      data: [active],
      ok: true
    });

    await expect(
      listStudiesForAdmin({
        actor: adminActor,
        mode: "archived",
        repository: fakeRepository({ studies: [active, archived] })
      })
    ).resolves.toMatchObject({
      data: [archived],
      ok: true
    });
  });

  it("denies administration when there is no session actor", async () => {
    const result = await listStudiesForAdmin({
      actor: null,
      repository: fakeRepository()
    });

    expect(result).toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("denies non ADMIN users from creating studies", async () => {
    const result = await createStudyForAdmin({
      actor: actor("SUPERVISOR"),
      formInput: {
        code: "SUP-01",
        name: "Supervisor study",
        timeZoneIana: "America/Mexico_City"
      },
      repository: fakeRepository()
    });

    expect(result).toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("creates a valid study as DRAFT and records the creator", async () => {
    let receivedInput: CreateStudyRecordInput | null = null;

    const result = await createStudyForAdmin({
      actor: adminActor,
      formInput: {
        code: "draft 01",
        name: "Nuevo estudio",
        timeZoneIana: "America/Mexico_City"
      },
      repository: fakeRepository({
        onCreate(input) {
          receivedInput = input;
          return study({
            code: input.code,
            name: input.name,
            status: input.status,
            timeZoneIana: input.timeZoneIana
          });
        }
      })
    });

    expect(result.ok).toBe(true);
    expect(receivedInput).toMatchObject({
      code: "DRAFT-01",
      createdByUserId: adminActor.id,
      name: "Nuevo estudio",
      status: "DRAFT"
    });
  });

  it("rejects duplicate study codes", async () => {
    const result = await createStudyForAdmin({
      actor: adminActor,
      formInput: {
        code: "DUP-01",
        name: "Duplicado",
        timeZoneIana: "America/Mexico_City"
      },
      repository: fakeRepository({
        onCreate() {
          throw { code: "P2002" };
        }
      })
    });

    expect(result).toMatchObject({
      code: "DUPLICATE_CODE",
      fieldErrors: { code: ["Ya existe un estudio con ese código."] },
      ok: false
    });
  });

  it("allows editing DRAFT studies", async () => {
    const result = await updateDraftStudyForAdmin({
      actor: adminActor,
      formInput: {
        code: "EDIT-01",
        id: "22222222-2222-4222-8222-222222222222",
        name: "Editado",
        timeZoneIana: "America/Mexico_City"
      },
      repository: fakeRepository({
        onUpdate() {
          return 1;
        }
      })
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("rejects editing non DRAFT studies", async () => {
    const result = await updateDraftStudyForAdmin({
      actor: adminActor,
      formInput: {
        code: "ACTIVE-01",
        id: "22222222-2222-4222-8222-222222222222",
        name: "Activo",
        timeZoneIana: "America/Mexico_City"
      },
      repository: fakeRepository({
        onFindEditState() {
          return {
            id: "22222222-2222-4222-8222-222222222222",
            status: "ACTIVE"
          };
        },
        onUpdate() {
          return 0;
        }
      })
    });

    expect(result).toMatchObject({
      code: "STUDY_NOT_DRAFT",
      ok: false
    });
  });

  it("allows ADMIN to activate a DRAFT study with active published screener", async () => {
    let activatedId: string | null = null;
    const definitionJson = {
      purpose: "SCREENER",
      questions: [
        {
          dataDestination: "SCREENING",
          id: "CONSENT",
          options: [
            {
              actions: [{ type: "CONTINUE" }],
              isOther: false,
              label: "Sí",
              order: 1,
              otherTextRequired: false,
              value: "SI"
            }
          ],
          order: 1,
          required: true,
          text: "Consentimiento",
          type: "SINGLE_CHOICE",
          validation: {}
        }
      ],
      rules: [],
      schemaVersion: "screening.v1",
      title: "Filtro"
    };

    const result = await activateStudyForAdmin({
      actor: adminActor,
      repository: fakeRepository({
        onActivate(id) {
          activatedId = id;
          return 1;
        },
        onFindActivationState() {
          return {
            id: "study-1",
            questionnaireVersions: [{ definitionJson, id: "version-1" }],
            status: "DRAFT"
          };
        }
      }),
      studyId: "study-1"
    });

    expect(result).toMatchObject({ ok: true });
    expect(activatedId).toBe("study-1");
    expect(definitionJson).toMatchObject({ title: "Filtro" });
  });

  it("denies non ADMIN activation and studies without published screener", async () => {
    await expect(
      activateStudyForAdmin({
        actor: actor("SUPERVISOR"),
        repository: fakeRepository(),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });

    await expect(
      activateStudyForAdmin({
        actor: adminActor,
        repository: fakeRepository({
          onFindActivationState() {
            return {
              id: "study-1",
              questionnaireVersions: [],
              status: "DRAFT"
            };
          }
        }),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "SCREENER_NOT_PUBLISHED", ok: false });
  });

  it("allows ADMIN to inspect deletion blockers for a study", async () => {
    const risk = {
      ...study({ id: "22222222-2222-4222-8222-222222222222" }),
      deletionBlockers: [
        {
          count: 2,
          key: "screeningAttempts",
          label: "intentos de screener"
        }
      ]
    };

    const result = await getStudyRiskForAdmin({
      actor: adminActor,
      repository: fakeRepository({ risks: { [risk.id]: risk } }),
      studyId: risk.id
    });

    expect(result.ok ? result.data.deletionBlockers[0]?.label : null).toBe("intentos de screener");
  });

  it("archives a study and closes its public access when ADMIN confirms explicitly", async () => {
    let archivedId: string | null = null;

    const result = await archiveStudyForAdmin({
      actor: adminActor,
      confirmation: "ARCHIVAR ESTUDIO",
      repository: fakeRepository({
        onArchive(id) {
          archivedId = id;
          return {
            code: "STUDY-01",
            id,
            portalDisabled: true,
            status: "ARCHIVED"
          };
        }
      }),
      studyId: "study-1"
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.data.portalDisabled : false).toBe(true);
    expect(archivedId).toBe("study-1");
  });

  it("does not archive when confirmation is missing or actor is not ADMIN", async () => {
    await expect(
      archiveStudyForAdmin({
        actor: adminActor,
        confirmation: "archivar",
        repository: fakeRepository(),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "INVALID_CONFIRMATION", ok: false });

    await expect(
      archiveStudyForAdmin({
        actor: actor("SUPERVISOR"),
        confirmation: "ARCHIVAR ESTUDIO",
        repository: fakeRepository(),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });
  });

  it("deletes a test study only when it has no operational blockers", async () => {
    const empty = { ...study({ id: "study-empty" }), deletionBlockers: [] };

    const result = await deleteEmptyStudyForAdmin({
      actor: adminActor,
      confirmation: "ELIMINAR ESTUDIO",
      repository: fakeRepository({
        onDelete(id) {
          return { code: "EMPTY", id };
        },
        risks: {
          "study-empty": empty
        }
      }),
      studyId: "study-empty"
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.data.code : null).toBe("EMPTY");
  });

  it("blocks hard deletion when there are attempts, participants, evidence or folios", async () => {
    const risk = {
      ...study({ id: "study-with-data" }),
      deletionBlockers: [
        { count: 1, key: "screeningAttempts", label: "intentos de screener" },
        { count: 1, key: "studyParticipants", label: "participantes del estudio" },
        { count: 3, key: "participantEvidence", label: "evidencias" },
        { count: 3, key: "participantReferenceCodes", label: "folios o codigos" }
      ]
    };

    const result = await deleteEmptyStudyForAdmin({
      actor: adminActor,
      confirmation: "ELIMINAR ESTUDIO",
      repository: fakeRepository({
        risks: {
          "study-with-data": risk
        }
      }),
      studyId: "study-with-data"
    });

    expect(result).toMatchObject({ code: "STUDY_HAS_OPERATIONAL_DATA", ok: false });
    expect(result.ok ? "" : result.message).toContain("intentos de screener");
    expect(result.ok ? "" : result.message).toContain("participantes del estudio");
    expect(result.ok ? "" : result.message).toContain("evidencias");
    expect(result.ok ? "" : result.message).toContain("folios o codigos");
  });

  it("denies hard deletion to non ADMIN users and requires exact confirmation", async () => {
    await expect(
      deleteEmptyStudyForAdmin({
        actor: actor("SUPERVISOR"),
        confirmation: "ELIMINAR ESTUDIO",
        repository: fakeRepository(),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "UNAUTHORIZED", ok: false });

    await expect(
      deleteEmptyStudyForAdmin({
        actor: adminActor,
        confirmation: "ELIMINAR",
        repository: fakeRepository(),
        studyId: "study-1"
      })
    ).resolves.toMatchObject({ code: "INVALID_CONFIRMATION", ok: false });
  });
});
