import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNavigoFoundationRepository,
  createNavigoMeasurementDefinition,
  createNavigoScheduleSeeds,
  buildNavigoActivityTimeline,
  hashNavigoMeasurementDefinition,
  hashToken,
  NAVIGO_ACTIVITY_CODES,
  NAVIGO_APP_DEFAULT_TIME_ZONE,
  navigoActivityLabel,
  prepareNavigoParticipantActivities,
  resolveNavigoTimeZone,
  validateNavigoMeasurementAnswers
} from "./index";
import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

describe("navigo app schema foundation", () => {
  it("adds optional ActivitySchedule.code and composite uniqueness by study", () => {
    const schema = readWorkspaceFile("prisma", "schema.prisma");

    expect(schema).toContain('code                   String?');
    expect(schema).toContain('@@unique([studyId, code])');
  });

  it("defines ParticipantActivityEvidence with activity and participant relations", () => {
    const schema = readWorkspaceFile("prisma", "schema.prisma");

    expect(schema).toContain("model ParticipantActivityEvidence {");
    expect(schema).toContain("participantActivityId String");
    expect(schema).toContain("studyParticipantId    String");
    expect(schema).toContain("privateStorageKey     String");
    expect(schema).toContain("@@unique([participantActivityId, type])");
  });

  it("creates an additive migration for Navigo app foundation", () => {
    const migration = readWorkspaceFile(
      "prisma",
      "migrations",
      "20260625144216_add_navigo_app_foundation",
      "migration.sql"
    );

    expect(migration).toContain('ALTER TABLE "activity_schedules"');
    expect(migration).toContain('ADD COLUMN "code" TEXT;');
    expect(migration).toContain('CREATE TABLE "participant_activity_evidence"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "participant_activity_evidence_participantActivityId_type_key"'
    );
  });
});

describe("navigo app definition", () => {
  it("creates AP1 to AP7 measurement questions with blind labels only", () => {
    const definition = createNavigoMeasurementDefinition();
    const ids = definition.questions.map((question) => question.id);
    const serializedQuestions = JSON.stringify(definition.questions);

    expect(ids).toEqual([
      "AP1_PREFERENCIA_GENERAL",
      "AP2_PREFERENCIA_INTENSIDAD",
      "AP3_INTENSIDAD_PRIMERA",
      "AP4_INTENSIDAD_SEGUNDA",
      "AP5_CALIFICACION_PRIMERA",
      "AP6_CALIFICACION_SEGUNDA",
      "AP7_MAYOR_DURACION"
    ]);
    expect(serializedQuestions).not.toContain("Homme");
    expect(serializedQuestions).not.toContain("realName");
  });

  it("creates T0, T2, T4 and T8 schedules with expected windows", () => {
    const schedules = createNavigoScheduleSeeds("version-1");

    expect(schedules.map((schedule) => schedule.code)).toEqual(NAVIGO_ACTIVITY_CODES);
    expect(schedules).toMatchObject([
      {
        code: "T0_SALON",
        offsetMinutes: 0,
        questionnaireVersionId: null,
        sortOrder: 0,
        type: "INTERNAL_FOLLOWUP",
        windowEndsMinutes: 0,
        windowStartsMinutes: 0
      },
      {
        code: "T2_HORAS",
        offsetMinutes: 120,
        questionnaireVersionId: "version-1",
        windowEndsMinutes: 480,
        windowStartsMinutes: -30
      },
      {
        code: "T4_HORAS",
        offsetMinutes: 240,
        questionnaireVersionId: "version-1",
        windowEndsMinutes: 360,
        windowStartsMinutes: -30
      },
      {
        code: "T8_HORAS",
        offsetMinutes: 480,
        questionnaireVersionId: "version-1",
        windowEndsMinutes: 120,
        windowStartsMinutes: -30
      }
    ]);
  });
});

describe("navigo app foundation repository", () => {
  it("creates and then reuses the measurement questionnaire and schedules without duplicates", async () => {
    const state = createNavigoFoundationState();
    const repository = createNavigoFoundationRepository(state.prisma as never);
    const definition = createNavigoMeasurementDefinition();
    const definitionHash = hashNavigoMeasurementDefinition(definition);

    const first = await repository.ensureNavigoFoundation({
      actorUserId: "admin-1",
      definition,
      definitionHash,
      studyCode: NAVIGO_STUDY_CODE
    });
    const second = await repository.ensureNavigoFoundation({
      actorUserId: "admin-1",
      definition,
      definitionHash,
      studyCode: NAVIGO_STUDY_CODE
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    if (!first || !second) {
      return;
    }

    expect(first.draftCreated).toBe(true);
    expect(first.questionnaireVersionCreated).toBe(true);
    expect(first.questionnaireVersionReused).toBe(false);
    expect(first.schedulesCreated).toBe(4);
    expect(first.schedulesUpdated).toBe(0);

    expect(second.draftCreated).toBe(false);
    expect(second.questionnaireVersionCreated).toBe(false);
    expect(second.questionnaireVersionReused).toBe(true);
    expect(second.schedulesCreated).toBe(0);
    expect(second.schedulesUpdated).toBe(0);

    expect(state.drafts).toHaveLength(1);
    expect(state.versions).toHaveLength(1);
    expect(state.schedules).toHaveLength(4);
  });

  it("keeps detergent studies untouched", async () => {
    const state = createNavigoFoundationState();
    const repository = createNavigoFoundationRepository(state.prisma as never);

    await repository.ensureNavigoFoundation({
      actorUserId: "admin-1",
      definition: createNavigoMeasurementDefinition(),
      definitionHash: hashNavigoMeasurementDefinition(createNavigoMeasurementDefinition()),
      studyCode: NAVIGO_STUDY_CODE
    });

    expect(state.studies.find((study) => study.code === DETERGENTS_STUDY_CODE)?.id).toBe("study-detergents");
    expect(state.schedules.every((schedule) => schedule.studyId !== "study-detergents")).toBe(true);
  });
});

describe("navigo participant activities", () => {
  it("creates activities for a confirmed Navigo participant from applicationStartedAt", () => {
    const schedules = createNavigoScheduleSeeds("version-1").map((schedule, index) => ({
      ...schedule,
      id: `schedule-${index + 1}`,
      status: "ACTIVE" as const
    }));
    const result = prepareNavigoParticipantActivities({
      existingActivities: [],
      now: new Date("2026-06-25T18:00:00.000Z"),
      participant: {
        applicationStartedAt: new Date("2026-06-25T15:00:00.000Z"),
        id: "study-participant-1",
        reviewStatus: "CONFIRMED",
        studyCode: NAVIGO_STUDY_CODE,
        timeZoneIana: "America/Mexico_City"
      },
      schedules
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.created).toHaveLength(4);
    expect(result.created.map((activity) => activity.code)).toEqual(NAVIGO_ACTIVITY_CODES);
    expect(result.created.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-06-25T15:00:00.000Z",
      "2026-06-25T17:00:00.000Z",
      "2026-06-25T19:00:00.000Z",
      "2026-06-25T23:00:00.000Z"
    ]);
    expect(result.timeZoneIana).toBe("America/Mexico_City");
  });

  it("does not create activities for rejected participants", () => {
    const schedules = createNavigoScheduleSeeds("version-1").map((schedule, index) => ({
      ...schedule,
      id: `schedule-${index + 1}`,
      status: "ACTIVE" as const
    }));
    const result = prepareNavigoParticipantActivities({
      existingActivities: [],
      participant: {
        applicationStartedAt: new Date("2026-06-25T15:00:00.000Z"),
        id: "study-participant-1",
        reviewStatus: "REJECTED",
        studyCode: NAVIGO_STUDY_CODE
      },
      schedules
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "NOT_CONFIRMED"
    });
  });

  it("does not duplicate existing activities and can reschedule pending ones", () => {
    const schedules = createNavigoScheduleSeeds("version-1").map((schedule, index) => ({
      ...schedule,
      id: `schedule-${index + 1}`,
      status: "ACTIVE" as const
    }));
    const existingActivities = [
      {
        activityScheduleId: "schedule-1",
        availableFrom: new Date("2026-06-25T15:00:00.000Z"),
        availableUntil: new Date("2026-06-25T15:00:00.000Z"),
        occurrenceKey: "DEFAULT",
        scheduledAt: new Date("2026-06-25T15:00:00.000Z"),
        status: "COMPLETED" as const
      },
      {
        activityScheduleId: "schedule-2",
        availableFrom: new Date("2026-06-25T16:30:00.000Z"),
        availableUntil: new Date("2026-06-26T01:00:00.000Z"),
        occurrenceKey: "DEFAULT",
        scheduledAt: new Date("2026-06-25T17:00:00.000Z"),
        status: "PENDING" as const
      }
    ];
    const result = prepareNavigoParticipantActivities({
      existingActivities,
      participant: {
        applicationStartedAt: new Date("2026-06-25T15:10:00.000Z"),
        id: "study-participant-1",
        reviewStatus: "APPROVED",
        studyCode: NAVIGO_STUDY_CODE
      },
      schedules
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.created.map((activity) => activity.activityScheduleId)).toEqual(["schedule-3", "schedule-4"]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]?.activityScheduleId).toBe("schedule-2");
    expect(result.retained).toHaveLength(1);
    expect(result.retained[0]?.activityScheduleId).toBe("schedule-1");
  });

  it("uses America/Mexico_City as fallback time zone", () => {
    expect(resolveNavigoTimeZone(null)).toBe(NAVIGO_APP_DEFAULT_TIME_ZONE);
    expect(resolveNavigoTimeZone("")).toBe(NAVIGO_APP_DEFAULT_TIME_ZONE);
    expect(resolveNavigoTimeZone("America/Mexico_City")).toBe("America/Mexico_City");
  });
});

describe("navigo app MVP rules", () => {
  it("does not open T2 before 1.5 hours and opens it afterwards", () => {
    const activities = navigoActivityRecords();
    const before = buildNavigoActivityTimeline({
      activities,
      now: new Date("2026-06-25T16:20:00.000Z")
    });
    const after = buildNavigoActivityTimeline({
      activities,
      now: new Date("2026-06-25T16:31:00.000Z")
    });

    expect(before.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "BEFORE_WINDOW"
    });
    expect(after.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
  });

  it("does not allow skipping T4 or T8 when previous measurements are pending", () => {
    const t4Blocked = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T18:40:00.000Z")
    });
    const t8Blocked = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t2Completed: true }),
      now: new Date("2026-06-25T22:40:00.000Z")
    });

    expect(t4Blocked.find((activity) => activity.code === "T4_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
    expect(t8Blocked.find((activity) => activity.code === "T8_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
  });

  it("marks pending measurements outside the maximum T0 + 10h window", () => {
    const timeline = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-26T01:01:00.000Z")
    });

    expect(timeline.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "AFTER_WINDOW"
    });
  });

  it("validates complete AP1 to AP7 answers and rejects incomplete submissions", () => {
    const complete = validateNavigoMeasurementAnswers({
      input: {
        AP1_PREFERENCIA_GENERAL: "AMBAS",
        AP2_PREFERENCIA_INTENSIDAD: "PRIMERA",
        AP3_INTENSIDAD_PRIMERA: "4",
        AP4_INTENSIDAD_SEGUNDA: "5",
        AP5_CALIFICACION_PRIMERA: "8",
        AP6_CALIFICACION_SEGUNDA: "7",
        AP7_MAYOR_DURACION: "SEGUNDA"
      }
    });
    const incomplete = validateNavigoMeasurementAnswers({
      input: {
        AP1_PREFERENCIA_GENERAL: "AMBAS"
      }
    });

    expect(complete.ok).toBe(true);
    expect(complete.ok ? complete.answers : []).toHaveLength(7);
    expect(incomplete.ok).toBe(false);
    expect(incomplete.ok ? [] : incomplete.missingQuestionIds).toContain("AP2_PREFERENCIA_INTENSIDAD");
  });

  it("keeps participant labels blind and token hashes deterministic", () => {
    expect(navigoActivityLabel("T2_HORAS")).toBe("Evaluacion 2 horas");
    expect(hashToken("token-123")).toBe(hashToken("token-123"));
    expect(hashToken("token-123")).not.toBe("token-123");
    expect(JSON.stringify(createNavigoMeasurementDefinition())).not.toContain("realName");
  });

  it("adds operable participant routes for token activities", () => {
    expect(readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx")).toContain(
      "Evaluaciones de fragancia"
    );
    expect(
      readWorkspaceFile("src", "app", "p", "[token]", "activities", "_components", "NavigoActivityCapture.tsx")
    ).toContain(
      "Selfie"
    );
  });
});

function navigoActivityRecords({
  t2Completed = false,
  t4Completed = false
}: {
  t2Completed?: boolean;
  t4Completed?: boolean;
} = {}) {
  const base = new Date("2026-06-25T15:00:00.000Z");
  return [
    navigoActivityRecord("T0_SALON", 0, 0, 0, "COMPLETED", base, base),
    navigoActivityRecord("T2_HORAS", 120, -30, 480, t2Completed ? "COMPLETED" : "PENDING", null, null),
    navigoActivityRecord("T4_HORAS", 240, -30, 360, t4Completed ? "COMPLETED" : "PENDING", null, null),
    navigoActivityRecord("T8_HORAS", 480, -30, 120, "PENDING", null, null)
  ];
}

function navigoActivityRecord(
  code: (typeof NAVIGO_ACTIVITY_CODES)[number],
  offsetMinutes: number,
  windowStartsMinutes: number,
  windowEndsMinutes: number,
  status: "COMPLETED" | "PENDING",
  actualStartedAt: Date | null,
  actualCompletedAt: Date | null
) {
  const base = new Date("2026-06-25T15:00:00.000Z");
  const scheduledAt = new Date(base.getTime() + offsetMinutes * 60000);
  return {
    activityScheduleId: `schedule-${code}`,
    actualCompletedAt,
    actualStartedAt,
    availableFrom: new Date(scheduledAt.getTime() + windowStartsMinutes * 60000),
    availableUntil: new Date(scheduledAt.getTime() + windowEndsMinutes * 60000),
    code,
    id: `activity-${code}`,
    occurrenceKey: "DEFAULT",
    scheduledAt,
    status
  };
}

function createNavigoFoundationState() {
  const studies = [
    { code: NAVIGO_STUDY_CODE, id: "study-navigo", timeZoneIana: "America/Mexico_City" },
    { code: DETERGENTS_STUDY_CODE, id: "study-detergents", timeZoneIana: "America/Mexico_City" }
  ];
  const drafts: Array<{
    createdAt: Date;
    definitionJson: unknown;
    id: string;
    purpose: "MEASUREMENT";
    status: "DRAFT" | "READY";
    studyId: string;
  }> = [];
  const versions: Array<{
    definitionHash: string;
    definitionJson: unknown;
    id: string;
    publishedByUserId: string;
    questionnaireDraftId: string;
    retiredAt: Date | null;
    retiredByUserId: string | null;
    status: "ACTIVE" | "RETIRED";
    studyId: string;
    versionNumber: number;
  }> = [];
  const schedules: Array<{
    code: string | null;
    id: string;
    name: string;
    offsetMinutes: number;
    questionnaireVersionId: string | null;
    sortOrder: number;
    status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
    studyId: string;
    type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
    windowEndsMinutes: number;
    windowStartsMinutes: number;
  }> = [];

  const tx = {
    activitySchedule: {
      async create(args: { data: Omit<(typeof schedules)[number], "id"> }) {
        const record = { ...args.data, id: `schedule-${schedules.length + 1}` };
        schedules.push(record);
        return { id: record.id };
      },
      async findMany(args: { where: { code: { in: string[] }; studyId: string } }) {
        return schedules.filter(
          (schedule) =>
            schedule.studyId === args.where.studyId &&
            schedule.code !== null &&
            args.where.code.in.includes(schedule.code)
        );
      },
      async update(args: { data: Partial<(typeof schedules)[number]>; where: { id: string } }) {
        const target = schedules.find((schedule) => schedule.id === args.where.id);
        if (!target) {
          throw new Error("schedule not found");
        }
        Object.assign(target, args.data);
        return { id: target.id };
      }
    },
    questionnaireDraft: {
      async create(args: {
        data: {
          createdByUserId: string;
          definitionJson: unknown;
          name: string;
          purpose: "MEASUREMENT";
          status: "DRAFT";
          studyId: string;
          updatedByUserId: string;
        };
        select: { id: true };
      }) {
        const record = {
          createdAt: new Date(`2026-06-25T00:00:0${drafts.length}.000Z`),
          definitionJson: args.data.definitionJson,
          id: `draft-${drafts.length + 1}`,
          purpose: args.data.purpose,
          status: args.data.status,
          studyId: args.data.studyId
        };
        drafts.push(record);
        return { id: record.id };
      },
      async findFirst(args: { where: { purpose: "MEASUREMENT"; studyId: string } }) {
        return (
          [...drafts]
            .filter((draft) => draft.studyId === args.where.studyId && draft.purpose === args.where.purpose)
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
        );
      },
      async update(args: {
        data: { definitionJson: unknown; name: string; status: "DRAFT"; updatedByUserId: string };
        select: { id: true };
        where: { id: string };
      }) {
        const target = drafts.find((draft) => draft.id === args.where.id);
        if (!target) {
          throw new Error("draft not found");
        }
        target.definitionJson = args.data.definitionJson;
        target.status = args.data.status;
        return { id: target.id };
      }
    },
    questionnaireVersion: {
      async create(args: {
        data: {
          definitionHash: string;
          definitionJson: unknown;
          publishedByUserId: string;
          questionnaireDraftId: string;
          studyId: string;
          versionNumber: number;
        };
        select: { id: true };
      }) {
        const record = {
          definitionHash: args.data.definitionHash,
          definitionJson: args.data.definitionJson,
          id: `version-${versions.length + 1}`,
          publishedByUserId: args.data.publishedByUserId,
          questionnaireDraftId: args.data.questionnaireDraftId,
          retiredAt: null,
          retiredByUserId: null,
          status: "ACTIVE" as const,
          studyId: args.data.studyId,
          versionNumber: args.data.versionNumber
        };
        versions.push(record);
        return { id: record.id };
      },
      async findFirst(args: {
        where: {
          definitionHash: string;
          questionnaireDraft: { purpose: "MEASUREMENT" };
          status: "ACTIVE";
          studyId: string;
        };
      }) {
        const version =
          versions.find(
            (candidate) =>
              candidate.studyId === args.where.studyId &&
              candidate.definitionHash === args.where.definitionHash &&
              candidate.status === args.where.status &&
              drafts.find((draft) => draft.id === candidate.questionnaireDraftId)?.purpose ===
                args.where.questionnaireDraft.purpose
          ) ?? null;

        return version ? { id: version.id } : null;
      },
      async findMany(args: {
        where: { questionnaireDraft: { purpose: "MEASUREMENT" }; studyId: string };
      }) {
        return [...versions]
          .filter(
            (version) =>
              version.studyId === args.where.studyId &&
              drafts.find((draft) => draft.id === version.questionnaireDraftId)?.purpose ===
                args.where.questionnaireDraft.purpose
          )
          .sort((left, right) => right.versionNumber - left.versionNumber)
          .map((version) => ({ id: version.id, versionNumber: version.versionNumber }));
      },
      async updateMany(args: {
        data: { retiredAt: Date; retiredByUserId: string; status: "RETIRED" };
        where: { questionnaireDraft: { purpose: "MEASUREMENT" }; status: "ACTIVE"; studyId: string };
      }) {
        let count = 0;
        for (const version of versions) {
          const draft = drafts.find((candidate) => candidate.id === version.questionnaireDraftId);
          if (
            version.studyId === args.where.studyId &&
            version.status === args.where.status &&
            draft?.purpose === args.where.questionnaireDraft.purpose
          ) {
            version.status = "RETIRED";
            version.retiredAt = args.data.retiredAt;
            version.retiredByUserId = args.data.retiredByUserId;
            count += 1;
          }
        }

        return { count };
      }
    },
    study: {
      async findUnique(args: { where: { code: string }; select: { code: true; id: true; timeZoneIana: true } }) {
        return studies.find((study) => study.code === args.where.code) ?? null;
      }
    }
  };

  const prisma = {
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      return callback(tx);
    }
  };

  Object.assign(prisma, tx);

  return {
    drafts,
    prisma,
    schedules,
    studies,
    versions
  };
}

function readWorkspaceFile(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}
