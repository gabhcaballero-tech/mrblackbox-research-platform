import { describe, expect, it } from "vitest";
import type { InternalUserRole, InternalUserStatus } from "@/shared/auth/permissions";
import type {
  CreateStudyRecordInput,
  StudiesRepository,
  StudyActivationState,
  StudyEditState,
  StudyListItem,
  UpdateDraftStudyRecordInput
} from "./repository";
import {
  activateStudyForAdmin,
  createStudyForAdmin,
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
  onCreate?: (input: CreateStudyRecordInput) => Promise<StudyListItem> | StudyListItem;
  onUpdate?: (input: UpdateDraftStudyRecordInput) => Promise<number> | number;
  onActivate?: (id: string) => Promise<number> | number;
  onFindActivationState?: (id: string) => Promise<StudyActivationState> | StudyActivationState;
  onFindEditState?: (id: string) => Promise<StudyEditState> | StudyEditState;
} = {}): StudiesRepository {
  return {
    async activateStudy(id) {
      if (options.onActivate) {
        return options.onActivate(id);
      }

      return options.studies?.some((item) => item.id === id && item.status === "DRAFT")
        ? 1
        : 0;
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
    async listStudies() {
      return options.studies ?? [];
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
});
