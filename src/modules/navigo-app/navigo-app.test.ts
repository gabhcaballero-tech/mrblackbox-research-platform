import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  OneuiWhatsAppMessageRecord,
  OneuiWhatsAppRepository
} from "@/modules/oneui-whatsapp";
import {
  createNavigoFoundationRepository,
  createNavigoMeasurementDefinition,
  createNavigoParticipantImportTemplateTsv,
  createNavigoRotationTemplateTsv,
  createNavigoScheduleSeeds,
  buildNavigoTsv,
  buildNavigoActivityTimeline,
  buildNavigoStartT0PendingMessage,
  formatNavigoDateTimeLocal,
  hashNavigoMeasurementDefinition,
  hashToken,
  NAVIGO_ACTIVITY_CODES,
  NAVIGO_APP_DEFAULT_TIME_ZONE,
  NAVIGO_COMPARATIVE_INSTRUCTIONS,
  isInitialNavigoEvaluation,
  navigoActivityLabel,
  navigoComparativeNumericEquivalent,
  nowInStudyTimezoneForDateTimeLocal,
  normalizeNavigoParticipantName,
  normalizeNavigoPhone,
  normalizeNavigoRotationCode,
  parseNavigoDateTimeLocal,
  parseNavigoParticipantImportText,
  parseNavigoRotationImportText,
  prepareNavigoParticipantActivities,
  createNavigoAppRepository,
  resolveNavigoTimeZone,
  validateNavigoMeasurementAnswers,
  type NavigoActivityCode
} from "./index";
import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import {
  NAVIGO_HUT_ACCESS_NO_VALUE,
  NAVIGO_HUT_ACCESS_QUESTION_ID,
  NAVIGO_HUT_ACCESS_YES_VALUE
} from "@/modules/screener/study-overrides";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import {
  appendNavigoTestModeParams,
  createNavigoTestModeParams,
  isValidNavigoTestMode
} from "./test-mode";
import {
  FACE_SIMILARITY_APPROVE_THRESHOLD,
  FACE_SIMILARITY_REJECT_THRESHOLD,
  NAVIGO_FACE_VERIFICATION_METHOD,
  classifyNavigoFaceSimilarity,
  normalizeNavigoFaceVerificationForStorage
} from "./face-verification-contract";
import { parseNavigoRotationWorkbook, type NavigoRotationWorkbookRowInput } from "./rotation-workbook";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("keeps APP v3 comparative instructions and numeric equivalence without changing semantic values", () => {
    const definition = createNavigoMeasurementDefinition();
    const definitionSource = readWorkspaceFile("src", "modules", "navigo-app", "definition.ts");

    expect(NAVIGO_COMPARATIVE_INSTRUCTIONS).toEqual([
      "Verifica el orden de las claves según la rotación asignada.",
      "Identifica en qué brazo se colocó cada clave antes de responder.",
      "Por favor huele ambos antebrazos y responde las siguientes preguntas."
    ]);
    expect(navigoComparativeNumericEquivalent("AP1_PREFERENCIA_GENERAL", "PRIMERA_IZQUIERDA")).toBe(1);
    expect(navigoComparativeNumericEquivalent("AP2_PREFERENCIA_INTENSIDAD", "SEGUNDA")).toBe(2);
    expect(navigoComparativeNumericEquivalent("AP7_MAYOR_DURACION", "AMBAS")).toBe(3);
    expect(navigoComparativeNumericEquivalent("AP7_MAYOR_DURACION", "NINGUNA")).toBe(4);
    const ap2 = definition.questions.find((question) => question.id === "AP2_PREFERENCIA_INTENSIDAD");
    if (!ap2 || ap2.type !== "single_choice") {
      throw new Error("AP2 should be single choice");
    }
    expect(ap2.options.map((option) => option.value)).toContain("PRIMERA");
    expect(definitionSource).toContain("NAVIGO_ACTIVITY_CODES = [\"T3_HORAS\", \"T4_5_HORAS\", \"T6_HORAS\"]");
  });

  it("creates T3, T4.5 and T6 active schedules with expected windows", () => {
    const schedules = createNavigoScheduleSeeds("version-1");

    expect(schedules.map((schedule) => schedule.code)).toEqual(NAVIGO_ACTIVITY_CODES);
    expect(schedules).toMatchObject([
      {
        code: "T3_HORAS",
        offsetMinutes: 180,
        questionnaireVersionId: "version-1",
        sortOrder: 0,
        windowEndsMinutes: 420,
        windowStartsMinutes: -30
      },
      {
        code: "T4_5_HORAS",
        offsetMinutes: 270,
        questionnaireVersionId: "version-1",
        sortOrder: 1,
        windowEndsMinutes: 330,
        windowStartsMinutes: -30
      },
      {
        code: "T6_HORAS",
        offsetMinutes: 360,
        questionnaireVersionId: "version-1",
        sortOrder: 2,
        windowEndsMinutes: 240,
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
    expect(first.schedulesCreated).toBe(3);
    expect(first.schedulesUpdated).toBe(0);

    expect(second.draftCreated).toBe(false);
    expect(second.questionnaireVersionCreated).toBe(false);
    expect(second.questionnaireVersionReused).toBe(true);
    expect(second.schedulesCreated).toBe(0);
    expect(second.schedulesUpdated).toBe(0);

    expect(state.drafts).toHaveLength(1);
    expect(state.versions).toHaveLength(1);
    expect(state.schedules).toHaveLength(3);
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

    expect(result.created).toHaveLength(3);
    expect(result.created.map((activity) => activity.code)).toEqual(NAVIGO_ACTIVITY_CODES);
    expect(result.created.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-06-25T18:00:00.000Z",
      "2026-06-25T19:30:00.000Z",
      "2026-06-25T21:00:00.000Z"
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

    expect(result.created.map((activity) => activity.activityScheduleId)).toEqual(["schedule-3"]);
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
  it("classifies local face verification similarity with the updated thresholds", () => {
    expect(classifyNavigoFaceSimilarity(0.62)).toBe("MATCH");
    expect(classifyNavigoFaceSimilarity(0.6)).toBe("MATCH");
    expect(classifyNavigoFaceSimilarity(0.599)).toBe("UNCERTAIN");
    expect(classifyNavigoFaceSimilarity(0.35)).toBe("NO_MATCH");
    expect(classifyNavigoFaceSimilarity(0.351)).toBe("UNCERTAIN");
    expect(classifyNavigoFaceSimilarity(FACE_SIMILARITY_APPROVE_THRESHOLD)).toBe("MATCH");
    expect(classifyNavigoFaceSimilarity(FACE_SIMILARITY_REJECT_THRESHOLD)).toBe("NO_MATCH");
    expect(classifyNavigoFaceSimilarity(null)).toBe("ERROR");
  });

  it("normalizes face verification results before storing ParticipantActivityEvidence", () => {
    const match = normalizeNavigoFaceVerificationForStorage({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      score: 0.9,
      status: "MATCH"
    });
    const noMatch = normalizeNavigoFaceVerificationForStorage({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      score: 0.2,
      status: "NO_MATCH"
    });
    const uncertain = normalizeNavigoFaceVerificationForStorage({
      evaluatedAt: "2026-06-26T12:00:00.000Z",
      method: "@vladmandic/human:faceres+blazeface:v1",
      reason: "CAPTURED_NO_FACE",
      score: null,
      status: "UNCERTAIN"
    });

    expect(match.reviewStatus).toBe("APPROVED");
    expect(match.internalNote).toContain("Verificacion facial automatica: MATCH");
    expect(match.internalNote).toContain("Umbrales: MATCH >= 0.6, NO_MATCH <= 0.35");
    expect(noMatch.reviewStatus).toBe("REJECTED");
    expect(noMatch.rejectionReason).toBe("La verificacion automatica indica que la selfie no coincide con la foto registrada.");
    expect(uncertain.reviewStatus).toBe("PENDING");
    expect(uncertain.internalNote).toContain("CAPTURED_NO_FACE");
  });

  it("opens T0 at 15 minutes and T3 at 3 hours from the initial application", () => {
    const beforeT0 = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t0Status: "STARTED" }),
      now: new Date("2026-06-25T15:14:00.000Z")
    });
    const atT0 = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t0Status: "STARTED" }),
      now: new Date("2026-06-25T15:15:00.000Z")
    });
    const beforeT3 = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T17:29:00.000Z")
    });
    const atT3Window = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T17:30:00.000Z")
    });

    expect(beforeT0.find((activity) => activity.code === "T0_15_MIN")?.availability).toMatchObject({
      canCapture: false,
      reason: "BEFORE_WINDOW"
    });
    expect(atT0.find((activity) => activity.code === "T0_15_MIN")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
    expect(beforeT3.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "BEFORE_WINDOW"
    });
    expect(atT3Window.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
  });

  it("allows admin test mode to skip time windows without skipping measurement order", () => {
    const beforeWindow = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T15:20:00.000Z"),
      testMode: true
    });
    const t4BeforeT2 = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T15:20:00.000Z"),
      testMode: true
    });

    expect(beforeWindow.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
    expect(t4BeforeT2.find((activity) => activity.code === "T4_5_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
  });

  it("does not let test mode skip identity incidents from T0", () => {
    const timeline = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t0IdentityStatus: "REJECTED" }),
      now: new Date("2026-06-25T15:20:00.000Z"),
      testMode: true
    });

    expect(timeline.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "IDENTITY_REVIEW_REQUIRED"
    });
  });

  it("does not block measurements with pending or rejected activity identity review", () => {
    const pending = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t3Completed: false, t3IdentityReviewStatus: "PENDING", t3SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });
    const rejected = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t3Completed: false, t3IdentityReviewStatus: "REJECTED", t3SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });
    const approved = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t3Completed: false, t3IdentityReviewStatus: "APPROVED", t3SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });

    expect(pending.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
    expect(rejected.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
    expect(approved.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
  });

  it("does not allow skipping T4.5 or T8 when previous measurements are pending", () => {
    const t45Blocked = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-25T18:40:00.000Z")
    });
    const t8Blocked = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t3Completed: true, t45Completed: true }),
      now: new Date("2026-06-26T00:40:00.000Z")
    });

    expect(t45Blocked.find((activity) => activity.code === "T4_5_HORAS")?.availability).toMatchObject({
      blockedByCode: "T3_HORAS",
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
    expect(t8Blocked.find((activity) => activity.code === "T8_HORAS")?.availability).toMatchObject({
      blockedByCode: "T6_HORAS",
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
  });

  it("marks pending measurements outside the maximum T0 + 10h window", () => {
    const timeline = buildNavigoActivityTimeline({
      activities: navigoActivityRecords(),
      now: new Date("2026-06-26T01:01:00.000Z")
    });

    expect(timeline.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
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

  it("keeps T3 closed while T0 is not fully completed", () => {
    const timeline = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t0Status: "STARTED" }),
      now: new Date("2026-06-25T16:40:00.000Z")
    });

    expect(timeline.find((activity) => activity.code === "T3_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
  });

  it("shows readable labels for AP options and keeps coded values for analysis", () => {
    const definition = createNavigoMeasurementDefinition();
    const ap1 = definition.questions.find((question) => question.id === "AP1_PREFERENCIA_GENERAL");
    const ap3 = definition.questions.find((question) => question.id === "AP3_INTENSIDAD_PRIMERA");

    if (!ap1 || ap1.type !== "single_choice") {
      throw new Error("AP1 should be single choice");
    }
    expect(ap1.options[0]).toEqual({ label: "La primera fragancia / brazo izquierdo", requiresText: false, value: "PRIMERA_IZQUIERDA" });
    expect(ap1.options[1]).toEqual({ label: "La segunda fragancia / brazo derecho", requiresText: false, value: "SEGUNDA_DERECHA" });
    expect(ap3).toMatchObject({
      max: 7,
      maxLabel: "Extremadamente fuerte",
      min: 1,
      minLabel: "Extremadamente débil"
    });
  });

  it("keeps participant labels blind and token hashes deterministic", () => {
    expect(navigoActivityLabel("T0_15_MIN")).toBe("Evaluacion T0 / 15 minutos");
    expect(navigoActivityLabel("T3_HORAS")).toBe("Evaluacion 3 horas");
    expect(navigoActivityLabel("T4_5_HORAS")).toBe("Evaluacion 4.5 horas");
    expect(navigoActivityLabel("T8_HORAS")).toBe("Evaluacion 8 horas (historica)");
    expect(navigoActivityLabel("T0_SALON")).toBe("Evaluacion 0 / T0 en salon (historica)");
    expect(hashToken("token-123")).toBe(hashToken("token-123"));
    expect(hashToken("token-123")).not.toBe("token-123");
    expect(JSON.stringify(createNavigoMeasurementDefinition())).not.toContain("realName");
  });

  it("signs temporary test mode links for one participant token only", () => {
    const params = createNavigoTestModeParams({
      now: new Date("2026-06-26T12:00:00.000Z"),
      secret: "server-secret",
      token: "participant-token-1"
    });

    expect(params).not.toBeNull();
    if (!params) {
      return;
    }

    expect(isValidNavigoTestMode({
      mode: params.navigoTestMode,
      now: new Date("2026-06-26T12:30:00.000Z"),
      secret: "server-secret",
      signature: params.navigoTestSignature,
      token: "participant-token-1"
    })).toBe(true);
    expect(isValidNavigoTestMode({
      mode: params.navigoTestMode,
      now: new Date("2026-06-26T12:30:00.000Z"),
      secret: "server-secret",
      signature: params.navigoTestSignature,
      token: "other-token"
    })).toBe(false);
    expect(isValidNavigoTestMode({
      mode: params.navigoTestMode,
      now: new Date("2026-06-26T15:01:00.000Z"),
      secret: "server-secret",
      signature: params.navigoTestSignature,
      token: "participant-token-1"
    })).toBe(false);
    expect(appendNavigoTestModeParams("/p/token/activities", params)).toContain("navigoTestMode=");
  });

  it("normalizes rotation codes and reports missing arms without blaming folio", () => {
    expect(normalizeNavigoRotationCode("  ab 12 \n")).toBe("AB12");
    expect(
      buildNavigoStartT0PendingMessage({
        approvalComplete: true,
        folioComplete: true,
        leftArmComplete: false,
        rightArmComplete: false
      })
    ).toBe("Pendiente para iniciar T0: asignar primera fragancia, asignar segunda fragancia.");
  });

  it("does not block T0 on optional triangular codes when folio, approval and arms are ready", () => {
    expect(
      buildNavigoStartT0PendingMessage({
        approvalComplete: true,
        folioComplete: true,
        leftArmComplete: true,
        rightArmComplete: true
      })
    ).toBeNull();
  });

  it("adds visible rotation preparation UI without exposing real product names to participants", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const manualRotationForm = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "NavigoManualRotationForm.tsx"
    );
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const participantShell = readWorkspaceFile("src", "shared", "ui", "PublicParticipantShell.tsx");

    expect(readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "_components", "NavigoRotationImportPanel.tsx")).toContain("Importar rotacion");
    expect(adminPage).toContain("Preparacion de rotacion");
    expect(manualRotationForm).toContain("Codigo primera fragancia / brazo izquierdo");
    expect(adminPage).not.toContain("Codigo aplicacion / kit ambos brazos");
    expect(participantPage).toContain("Primera fragancia");
    expect(participantPage).not.toContain("realName");
    expect(participantShell).not.toContain("Administracion");
    expect(participantShell).not.toContain("Campo");
  });

  it("builds participant links as absolute URLs in the admin panel", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const linkPanel = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "ParticipantLinkPanel.tsx"
    );

    expect(adminPage).toContain("resolveRequestOrigin");
    expect(adminPage).toContain("participant.participantLinkToken");
    expect(adminPage).toContain("new URL(`/p/${encodeURIComponent(participant.participantLinkToken)}/activities`, requestOrigin).toString()");
    expect(adminPage).not.toContain("Guardar aplicacion inicial");
    expect(adminPage).toContain("Enviar enlace de evaluacion al panelista");
    expect(adminPage).toContain("Generar link participante");
    expect(adminPage).toContain("Regenerar link participante");
    expect(adminPage).toContain("Aplicacion inicial registrada en CTL");
    expect(linkPanel).toContain("Copiar link");
    expect(linkPanel).toContain("Abrir link");
    expect(linkPanel).toContain("${url}");
    expect(linkPanel).not.toContain("Participante actualizado");
  });

  it("resolves absolute origin from forwarded headers with local fallback", () => {
    expect(
      resolveRequestOrigin(
        new Headers({
          "x-forwarded-host": "mrblackbox-research-platform.vercel.app",
          "x-forwarded-proto": "https"
        }),
        {}
      )
    ).toBe("https://mrblackbox-research-platform.vercel.app");
    expect(resolveRequestOrigin(new Headers({ host: "localhost:3000" }), {})).toBe("http://localhost:3000");
  });

  it("shows initial application and the active T3/T4.5/T6 protocol in the participant app", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");

    const capture = readWorkspaceFile("src", "app", "p", "[token]", "activities", "_components", "NavigoActivityCapture.tsx");

    expect(adminPage).toContain("Abrir link participante");
    expect(participantPage).toContain("Aplicacion inicial registrada en CTL");
    expect(participantPage).toContain("evaluaciones de fragancia a 3, 4.5 y 6 horas");
    expect(participantPage).toContain("base para calcular las evaluaciones posteriores de 3, 4.5 y 6 horas");
    expect(actions).toContain("La primera evaluacion estara disponible a las 3 horas.");
    expect(repository).toContain("registerInitialApplication");
    expect(repository).toContain("recordApplicationStartedFromCtl");
    expect(repository).toContain("createRegisteredSelfiePreview");
    expect(capture).toContain("Verificación visual de identidad");
    expect(capture).toContain("IdentityConfirmation");
    expect(capture).toContain("IdentityIncidentState");
    expect(capture).toContain("confirmNavigoT0IdentityAction");
    expect(capture).toContain("NAVIGO_COMPARATIVE_INSTRUCTIONS");
    expect(capture).toContain("Rotación asignada");
    expect(capture).toContain("Toma y guarda la selfie antes de enviar las respuestas.");
  });

  it("shows participant name, blind codes and admin-only test links in Navigo app UI", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const activitiesPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const activityPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "[activityId]", "page.tsx");
    const linkPanel = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "ParticipantLinkPanel.tsx"
    );

    expect(adminPage).toContain("actor.role === \"ADMIN\"");
    expect(adminPage).toContain("PARTICIPANT_PORTAL_HASH_SECRET");
    expect(adminPage).toContain("Incidencia de identidad en T0");
    expect(linkPanel).toContain("Abrir link en modo prueba");
    expect(linkPanel).toContain("Modo prueba: link firmado temporal");
    expect(activitiesPage).toContain("Participante");
    expect(activitiesPage).toContain("Primera fragancia / brazo izquierdo");
    expect(activitiesPage).toContain("Segunda fragancia / brazo derecho");
    expect(activityPage).toContain("Datos de participación");
    expect(activityPage).toContain("fragranceCodes={data.blindLabels}");
  });

  it("shows Navigo admin activity details with readable answers, selfies and manual identity review", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "_components", "NavigoActivityCapture.tsx");

    expect(adminPage).toContain("Ver detalle");
    expect(adminPage).toContain("Respuestas AP1 a AP7");
    expect(adminPage).toContain("Selfie registrada del filtro");
    expect(adminPage).toContain("Selfie de esta toma");
    expect(adminPage).toContain("Revisión visual de identidad");
    expect(adminPage).toContain("Marcar como coincide");
    expect(adminPage).toContain("Marcar como no coincide");
    expect(adminPage).toContain("Marcar como requiere revisión");
    expect(adminPage).toContain("Incidencia de identidad: revisar posteriormente con supervisor.");
    expect(adminPage).toContain("Incidencia de identidad: revisar posteriormente. No bloquea el avance del panelista.");
    expect(adminPage).toContain("Verificación automática");
    expect(adminPage).toContain("Score/similitud");
    expect(adminPage).toContain("Umbrales: MATCH &gt;= 0.60, NO_MATCH &lt;= 0.35");
    expect(adminPage).toContain("verificación biométrica automatizada");
    expect(adminPage).toContain("Valor interno conservado");
    expect(participantPage).not.toContain("Score/similitud");
    expect(adminPage).not.toContain("privateStorageKey");
    expect(adminPage).not.toContain("storageBucket");
    expect(repository).toContain("createSignedReadUrl");
    expect(repository).toContain("readableResponses");
    expect(repository).toContain("navigoComparativeNumericEquivalent");
    expect(repository).toContain("reviewActivityIdentity");
    expect(repository).toContain("evidence.internalNote");
    expect(actions).toContain("reviewNavigoActivityIdentityAction");
  });

  it("renders manual rotation save as a visible Navigo-only adjustment with row-level feedback", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const manualRotationForm = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "NavigoManualRotationForm.tsx"
    );
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");

    expect(adminPage).toContain("NavigoManualRotationForm");
    expect(manualRotationForm).toContain("Actualizar rotacion");
    expect(manualRotationForm).toContain('"use client"');
    expect(manualRotationForm).toContain("useActionState");
    expect(manualRotationForm).toContain("configureNavigoRotationInlineAction");
    expect(manualRotationForm).toContain("Guardar rotacion");
    expect(manualRotationForm).toContain("Guardando rotacion...");
    expect(manualRotationForm).toContain("disabled={pending}");
    expect(manualRotationForm).toContain("state.message");
    expect(adminPage).toContain("query?.participant === participant.id");
    expect(manualRotationForm).toContain("La rotacion triangular CTL requiere PR1-PR6 y VERI_1/VERI_2");
    expect(manualRotationForm).toContain("ROTACIONES NAVIGO.xlsx");
    expect(adminPage).not.toContain("configureNavigoRotationAction");
    expect(manualRotationForm).not.toContain("name=\"triangularCode1\"");
    expect(manualRotationForm).not.toContain("name=\"triangularCode2\"");
    expect(actions).toContain("configureNavigoRotationInlineAction");
    expect(actions).toContain("Rotacion Navigo configurada correctamente");
    expect(actions).not.toContain("formData.get(\"triangularCode1\")");
    expect(actions).not.toContain("formData.get(\"triangularCode2\")");
  });

  it("keeps participant pages from exposing maximum closing times", () => {
    const activitiesPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const activityPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "[activityId]", "page.tsx");

    expect(activitiesPage).not.toContain("Cierre máximo");
    expect(activitiesPage).not.toContain("availableUntil, data.timeZoneIana");
    expect(activitiesPage).toContain("Horario ideal");
    expect(activitiesPage).toContain("Disponible desde");
    expect(activitiesPage).toContain("Hazla lo antes posible");
    expect(activitiesPage).toContain("Esta evaluación ya no está disponible. Contacta a tu reclutador.");
    expect(activityPage).not.toContain("Cierre máximo");
  });

  it("converts Navigo datetime-local values using the study time zone", () => {
    const parsed = parseNavigoDateTimeLocal("2026-06-26T09:33", "America/Mexico_City");

    expect(parsed?.toISOString()).toBe("2026-06-26T15:33:00.000Z");
    expect(formatNavigoDateTimeLocal(new Date("2026-06-26T15:33:00.000Z"), "America/Mexico_City")).toBe(
      "2026-06-26T09:33"
    );
    expect(nowInStudyTimezoneForDateTimeLocal("America/Mexico_City", new Date("2026-06-26T15:30:00.000Z"))).toBe(
      "2026-06-26T09:30"
    );
  });

  it("keeps destructive correction actions separated after moving application start to CLT", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");

    expect(adminPage).not.toContain("toISOString().slice");
    expect(adminPage).not.toContain("Guardar aplicacion inicial");
    expect(adminPage).not.toContain("Guardando aplicacion inicial...");
    expect(adminPage).toContain("Aplicacion inicial registrada en CTL");
    expect(adminPage).toContain("sendNavigoEvaluationLinkWhatsAppAction");
    expect(adminPage).toContain("Acciones de correccion");
    expect(adminPage).toContain("REINICIAR APP");
    expect(adminPage).toContain("ELIMINAR ETAPAS");
    expect(adminPage).toContain("Eliminar participante Navigo");
    expect(adminPage).toContain("ELIMINAR PARTICIPANTE");
    expect(adminPage).toContain("deleteNavigoParticipantAction");
    expect(actions).toContain("resetNavigoParticipantAppAction");
    expect(actions).toContain("deleteNavigoParticipantAction");
    expect(actions).toContain("sendNavigoEvaluationLinkWhatsAppAction");
    expect(actions).toContain("admin:access");
    expect(actions).toContain("Selecciona la hora de aplicacion inicial.");
    expect(repository).toContain("NAVIGO_T0_IDENTITY_QUESTION_ID");
    expect(repository).toContain("resetParticipantApp");
    expect(repository).toContain("deleteParticipantStagesFrom");
    expect(repository).toContain("deleteParticipant");
  });

  it("envia recordatorio WhatsApp T3 cuando la evaluacion esta disponible y pendiente", async () => {
    const state = createNavigoParticipantImportState();
    const whatsApp = createFakeNavigoWhatsAppRepository();
    const repository = createNavigoAppRepository(state.prisma as never, whatsApp.repository);
    seedDueNavigoReminderActivity(state, "T3_HORAS", new Date("2026-08-08T09:00:00.000Z"));
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-number-id");
    vi.stubEnv("WHATSAPP_ONEUI_PHONE_NUMBER", "5215511303411");
    const fetcher = vi.fn(async () => ({
      json: async () => ({ messages: [{ id: "wamid-t3", message_status: "accepted" }] }),
      ok: true,
      status: 200
    }));
    vi.stubGlobal("fetch", fetcher);

    const result = await repository.processEvaluationWhatsAppReminders({
      now: new Date("2026-08-08T09:00:00.000Z"),
      requestOrigin: "https://example.test",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.sent : 0).toBe(1);
    expect(result.ok ? result.data.results[0] : null).toMatchObject({
      activityCode: "T3_HORAS",
      status: "SENT"
    });
    expect(state.reminderLogs).toHaveLength(1);
    expect(state.reminderLogs[0]).toMatchObject({
      status: "COMPLETED"
    });
    expect(whatsApp.messages[0]).toMatchObject({
      bodyText: "Tu siguiente evaluacion ya se encuentra disponible.\n\nTe invitamos a realizarla ahora.",
      metaMessageId: "wamid-t3",
      status: "accepted"
    });
    expect((whatsApp.messages[0]?.rawPayload as { request?: { template?: unknown } }).request?.template).toMatchObject({
      components: [
        {
          index: "0",
          parameters: [{ text: "https://example.test/p/token-reminder/activities", type: "text" }],
          sub_type: "url",
          type: "button"
        }
      ],
      name: "navigo_recordatorio_evaluacion"
    });
  });

  it("no duplica recordatorios WhatsApp Navigo ya auditados", async () => {
    const state = createNavigoParticipantImportState();
    const whatsApp = createFakeNavigoWhatsAppRepository();
    const repository = createNavigoAppRepository(state.prisma as never, whatsApp.repository);
    seedDueNavigoReminderActivity(state, "T3_HORAS", new Date("2026-08-08T09:00:00.000Z"));
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-number-id");
    const fetcher = vi.fn(async () => ({
      json: async () => ({ messages: [{ id: "wamid-t3", message_status: "accepted" }] }),
      ok: true,
      status: 200
    }));
    vi.stubGlobal("fetch", fetcher);

    await repository.processEvaluationWhatsAppReminders({
      now: new Date("2026-08-08T09:00:00.000Z"),
      requestOrigin: "https://example.test",
      studyId: state.study.id
    });
    const secondResult = await repository.processEvaluationWhatsAppReminders({
      now: new Date("2026-08-08T09:01:00.000Z"),
      requestOrigin: "https://example.test",
      studyId: state.study.id
    });

    expect(secondResult.ok).toBe(true);
    expect(secondResult.ok ? secondResult.data.sent : -1).toBe(0);
    expect(secondResult.ok ? secondResult.data.skipped : 0).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.reminderLogs).toHaveLength(1);
  });

  it("envia recordatorios WhatsApp para T4.5 y T6 cuando corresponden", async () => {
    const state = createNavigoParticipantImportState();
    const whatsApp = createFakeNavigoWhatsAppRepository();
    const repository = createNavigoAppRepository(state.prisma as never, whatsApp.repository);
    seedDueNavigoReminderActivity(state, "T4_5_HORAS", new Date("2026-08-08T10:30:00.000Z"));
    seedDueNavigoReminderActivity(state, "T6_HORAS", new Date("2026-08-08T12:00:00.000Z"));
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-number-id");
    const fetcher = vi.fn(async () => ({
      json: async () => ({ messages: [{ id: `wamid-${fetcher.mock.calls.length + 1}`, message_status: "accepted" }] }),
      ok: true,
      status: 200
    }));
    vi.stubGlobal("fetch", fetcher);

    const result = await repository.processEvaluationWhatsAppReminders({
      now: new Date("2026-08-08T12:00:00.000Z"),
      requestOrigin: "https://example.test",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.sent : 0).toBe(2);
    expect(result.ok ? result.data.results.map((item) => item.activityCode) : []).toEqual(["T4_5_HORAS", "T6_HORAS"]);
    expect(state.reminderLogs.map((log) => log.status)).toEqual(["COMPLETED", "COMPLETED"]);
  });

  it("returns the same evaluation link sent by WhatsApp for operator backup", async () => {
    const state = createNavigoParticipantImportState();
    const whatsApp = createFakeNavigoWhatsAppRepository();
    const repository = createNavigoAppRepository(state.prisma as never, whatsApp.repository);
    const registered = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5512345678",
      folio: "NAV-001",
      generateLink: false,
      nombre: "Participante Uno",
      studyId: state.study.id
    });
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-number-id");
    const fetcher = vi.fn(async () => ({
      json: async () => ({ messages: [{ id: "wamid-evaluation-link", message_status: "accepted" }] }),
      ok: true,
      status: 200
    }));
    vi.stubGlobal("fetch", fetcher);

    const result = registered.ok
      ? await repository.sendEvaluationLinkWhatsApp({
          actorUserId: "admin-1",
          now: new Date("2026-08-08T07:45:00.000Z"),
          requestOrigin: "https://example.test",
          studyId: state.study.id,
          studyParticipantId: registered.data.studyParticipantId
        })
      : null;

    expect(result?.ok).toBe(true);
    const evaluationUrl = result?.ok ? result.data.evaluationUrl : "";
    const payload = whatsApp.messages[0]?.rawPayload as {
      request?: { template?: { components?: Array<{ parameters?: Array<{ text: string }> }>; name?: string } };
    };
    const parameters = payload.request?.template?.components?.[0]?.parameters ?? [];
    expect(payload.request?.template?.name).toBe("navigo_acceso_evaluaciones");
    expect(parameters[0]?.text).toBe("PARTICIPANTE UNO");
    expect(parameters[1]?.text).toBe(evaluationUrl);
    expect(parameters[2]?.text).toBe("NAV-001");
    expect(result?.ok ? result.data : null).toMatchObject({
      folio: "NAV-001",
      phone: "+525512345678",
      whatsappMessageId: "wamid-evaluation-link",
      whatsappStatus: "ENVIADO"
    });
  });

  it("keeps the evaluation link available when WhatsApp sending fails", async () => {
    const state = createNavigoParticipantImportState();
    const whatsApp = createFakeNavigoWhatsAppRepository();
    const repository = createNavigoAppRepository(state.prisma as never, whatsApp.repository);
    const registered = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5512345678",
      folio: "NAV-001",
      generateLink: false,
      nombre: "Participante Uno",
      studyId: state.study.id
    });

    const result = registered.ok
      ? await repository.sendEvaluationLinkWhatsApp({
          actorUserId: "admin-1",
          now: new Date("2026-08-08T07:45:00.000Z"),
          requestOrigin: "https://example.test",
          studyId: state.study.id,
          studyParticipantId: registered.data.studyParticipantId
        })
      : null;

    expect(result?.ok).toBe(true);
    expect(result?.ok ? result.data.evaluationUrl : "").toContain("https://example.test/p/");
    expect(result?.ok ? result.data.whatsappStatus : "").toBe("ERROR");
    expect(result?.ok ? result.data.whatsappError : "").toBe("Faltan variables de entorno para enviar por WhatsApp.");
    expect(whatsApp.messages[0]).toMatchObject({
      status: "failed"
    });
  });

  it("does not treat T0 as completed only because an application time exists", () => {
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");

    expect(repository).toContain("isNavigoT0Complete");
    expect(repository).toContain("status: isIncompleteT0 ? \"STARTED\" : activity.status");
    expect(participantPage).toContain("Evaluacion T0 / 15 minutos");
    expect(participantPage).toContain("(activity.responseCount ?? 0) >= 7");
  });

  it("creates and parses the rotation import template for CSV or TSV", () => {
    expect(createNavigoRotationTemplateTsv()).toContain("folio\tprimera_fragancia\tsegunda_fragancia");

    const tsv = parseNavigoRotationImportText({
      filename: "rotacion.tsv",
      text: "Folio\t1a fragancia\t2a fragancia\nNAV-001\t codigo-a \tcodigo-b"
    });
    const csv = parseNavigoRotationImportText({
      filename: "rotacion.csv",
      text: "Folio,Primera fragancia,Segunda fragancia\nNAV-002,CODIGO-C,CODIGO-D"
    });
    const xlsx = parseNavigoRotationImportText({
      filename: "rotacion.xlsx",
      text: "irrelevant"
    });

    expect(tsv.ok ? tsv.rows[0] : null).toEqual({
      folio: "NAV-001",
      primeraFragancia: "CODIGO-A",
      segundaFragancia: "CODIGO-B"
    });
    expect(csv.ok ? csv.rows[0]?.folio : null).toBe("NAV-002");
    expect(xlsx.ok).toBe(false);
  });

  it("parses the official Navigo XLSX workbook without using the CSV importer", () => {
    const workbook = createMinimalRotationWorkbook();
    const parsed = parseNavigoRotationWorkbook({
      bytes: workbook,
      filename: "ROTACIONES NAVIGO.xlsx"
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.rows : []).toEqual([
      {
        folio: "NAV-001",
        primeraFragancia: "247",
        segundaFragancia: "583",
        triangular1Pr1: "K-247",
        triangular1Pr2: "0-472",
        triangular1Pr3: "H-358",
        triangular1Verify: "H-358",
        triangular2Pr1: "G-835",
        triangular2Pr2: "Z-724",
        triangular2Pr3: "C-583",
        triangular2Verify: "Z-724"
      }
    ]);
    expect(parsed.ok ? parsed.hutRows : []).toEqual([
      {
        folio: "HUT-001",
        hutEva1: "901",
        hutEva2: "902"
      }
    ]);
  });

  it("parses rotation imports with BOM, semicolon files and header aliases", () => {
    const withBom = parseNavigoRotationImportText({
      filename: "rotacion.tsv",
      text: "\uFEFFFolio\tIzquierdo\tDerecho\r\nNAV-009\t codigo-a \t codigo-b \r\n"
    });
    const semicolon = parseNavigoRotationImportText({
      filename: "rotacion.csv",
      text: "folio;left;right\nNAV-010;frag-a;frag-b"
    });

    expect(withBom.ok ? withBom.rows[0] : null).toEqual({
      folio: "NAV-009",
      primeraFragancia: "CODIGO-A",
      segundaFragancia: "CODIGO-B"
    });
    expect(semicolon.ok ? semicolon.rows[0] : null).toEqual({
      folio: "NAV-010",
      primeraFragancia: "FRAG-A",
      segundaFragancia: "FRAG-B"
    });
  });

  it("returns clear errors for missing rotation import columns", () => {
    const missing = parseNavigoRotationImportText({
      filename: "rotacion.tsv",
      text: "folio\totra_columna\nNAV-001\tCODIGO-A"
    });

    expect(missing.ok).toBe(false);
    expect(missing.ok ? "" : missing.message).toContain("columna primera_fragancia faltante");
    expect(missing.ok ? "" : missing.message).toContain("columna segunda_fragancia faltante");
  });

  it("creates and parses the participant import template for TSV or CSV", () => {
    expect(createNavigoParticipantImportTemplateTsv()).toContain(
      "folio\tnombre\tcelular\tcorreo\treclutador\tobservaciones"
    );

    const tsv = parseNavigoParticipantImportText({
      filename: "participantes.tsv",
      text: "\uFEFFFolio\tParticipante\tTeléfono\tReclutador\nNAV-001\tAna Pérez\t55 1234 5678\treclutadora"
    });
    const csv = parseNavigoParticipantImportText({
      filename: "participantes.csv",
      text: "FOLIO,Nombre,Celular\nNAV-002,Juan Ñunez,5511112222"
    });

    expect(tsv.ok ? tsv.rows[0] : null).toMatchObject({
      celular: "+525512345678",
      folio: "NAV-001",
      nombre: "ANA PÉREZ",
      reclutador: "RECLUTADORA",
      primeraFragancia: "",
      segundaFragancia: ""
    });
    expect(csv.ok ? csv.rows[0] : null).toMatchObject({
      celular: "+525511112222",
      folio: "NAV-002",
      nombre: "JUAN ÑUNEZ"
    });
  });

  it("parses the exact participant TSV sample with CRLF and empty optional email", () => {
    const sample = parseNavigoParticipantImportText({
      filename: "navigo_participantes_template.tsv",
      text: [
        "folio\tnombre\tcelular\tcorreo\treclutador\tobservaciones",
        "NAV-010\tPRUEBA UNO\t5512345678\t\tGABY\tPRUEBA",
        "NAV-011\tPRUEBA DOS\t5598765432\t\tGABY\tPRUEBA",
        "NAV-012\tPRUEBA TRES\t5685185186\t\tGABY\tPRUEBA",
        "NAV-013\tPRUEBA CUATRO\t5771604940\t\tGABY\tPRUEBA",
        "NAV-014\tPRUEBA CINCO\t5858024694\t\tGABY\tPRUEBA",
        "NAV-015\tPRUEBA SEIS\t5944444448\t\tGABY\tPRUEBA"
      ].join("\r\n")
    });

    expect(sample.ok).toBe(true);
    expect(sample.ok ? sample.rows : []).toHaveLength(6);
    expect(sample.ok ? sample.rows[0] : null).toMatchObject({
      celular: "+525512345678",
      correo: null,
      folio: "NAV-010",
      nombre: "PRUEBA UNO",
      primeraFragancia: "",
      reclutador: "GABY",
      segundaFragancia: ""
    });
  });

  it("normalizes direct participant names and phones without losing accents or spaces", () => {
    expect(normalizeNavigoParticipantName("  ana   pérez ñuñez 😊 ")).toBe("ANA PÉREZ ÑUÑEZ");
    expect(normalizeNavigoPhone("55 1234 5678")).toBe("+525512345678");
  });

  it("builds TSV compatible with Excel and cleans tabs or line breaks inside cells", () => {
    const tsv = buildNavigoTsv([
      ["Folio", "Observaciones"],
      ["NAV-001", "Texto con\t tab y\nsalto; conserva comas, acentos y Ñ"]
    ]);

    expect(tsv.startsWith("\uFEFF")).toBe(true);
    expect(tsv).toContain("NAV-001\tTexto con tab y salto; conserva comas, acentos y Ñ");
    expect(tsv).not.toContain("Texto con\t tab");
    expect(tsv).not.toContain("salto\n");
  });

  it("wires participant bulk operations into the Navigo admin UI without touching rotation import", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const operationsPanel = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "NavigoParticipantOperationsPanel.tsx"
    );
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");

    expect(adminPage).toContain("Registrar participante");
    expect(adminPage).toContain("Generar enlaces para todos");
    expect(adminPage).toContain("Configuracion real de muestras");
    expect(adminPage).toContain("Guardar claves y rotaciones");
    expect(adminPage).toContain("configureNavigoStudyRotationAction");
    expect(adminPage).toContain("clearNavigoParticipantRotationAction");
    expect(adminPage).toContain("Identificación visual");
    expect(adminPage).toContain("Identificación visual: ");
    expect(adminPage).toContain("updateNavigoVisualVerificationModeAction");
    expect(adminPage).toContain("visualVerificationMode");
    expect(adminPage).toContain("No requerida");
    expect(operationsPanel).toContain("Importar participantes");
    expect(operationsPanel).toContain("Descargar plantilla de participantes");
    expect(operationsPanel).toContain("Exportar Excel (TSV)");
    expect(operationsPanel).toContain("Previsualizar participantes");
    expect(operationsPanel).toContain("file.text()");
    expect(operationsPanel).toContain("Participantes nuevos");
    expect(operationsPanel).toContain("Participantes existentes");
    expect(operationsPanel).toContain("Correo");
    expect(operationsPanel).toContain("Reclutador");
    expect(operationsPanel).toContain("Errores al aplicar");
    expect(operationsPanel).toContain("La previsualizacion sigue siendo valida, pero ocurrio un error al aplicar algunas filas.");
    expect(operationsPanel).toContain("No fue posible previsualizar participantes por un error tecnico. Revisa logs.");
    expect(actions).toContain("previewNavigoParticipantImportTextAction");
    expect(actions).toContain("applyNavigoParticipantImportRowsAction");
    expect(actions).toContain("generateNavigoParticipantLinksForStudyAction");
    expect(actions).toContain("updateNavigoVisualVerificationModeAction");
  });

  it("previews the sample participant TSV with six valid rows", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const parsed = parseNavigoParticipantImportText({
      filename: "participantes.tsv",
      text: [
        "folio\tnombre\tcelular\tcorreo\treclutador\tobservaciones",
        "NAV-010\tPRUEBA UNO\t5512345678\t\tGABY\tPRUEBA",
        "NAV-011\tPRUEBA DOS\t5598765432\t\tGABY\tPRUEBA",
        "NAV-012\tPRUEBA TRES\t5685185186\t\tGABY\tPRUEBA",
        "NAV-013\tPRUEBA CUATRO\t5771604940\t\tGABY\tPRUEBA",
        "NAV-014\tPRUEBA CINCO\t5858024694\t\tGABY\tPRUEBA",
        "NAV-015\tPRUEBA SEIS\t5944444448\t\tGABY\tPRUEBA"
      ].join("\r\n")
    });

    expect(parsed.ok).toBe(true);

    const result = await repository.previewParticipantImport({
      rows: parsed.ok ? parsed.rows : [],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.summary.totalRows : -1).toBe(6);
    expect(result.ok ? result.data.summary.validRows : -1).toBe(6);
    expect(result.ok ? result.data.summary.rowsWithError : -1).toBe(0);
    expect(result.ok ? result.data.summary.newParticipants : -1).toBe(6);
    expect(result.ok ? result.data.summary.existingParticipants : -1).toBe(0);
    expect(result.ok ? result.data.summary.updatable : -1).toBe(0);
  });

  it("returns a clear database validation error for participant preview", async () => {
    const state = createNavigoParticipantImportState({ failExistingLookup: true });
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.previewParticipantImport({
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: null,
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("No fue posible validar participantes existentes. Intenta nuevamente.");
  });

  it("applies participant import rows without creating Navigo link or activities before CTL", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: true,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.created : -1).toBe(1);
    expect(state.participantProfiles).toHaveLength(1);
    expect(state.studyParticipants).toHaveLength(1);
    expect(state.confirmations).toHaveLength(1);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.armAssignments).toHaveLength(0);
    expect(state.referenceCodes).toHaveLength(3);
    expect(state.accessTokens).toHaveLength(0);
    expect(state.activities).toHaveLength(0);
  });

  it("loads the admin dashboard for CTL sessions claimed by public IKA interviewer codes", async () => {
    const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousSupabaseSecret = process.env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_key";

    try {
      const state = createNavigoParticipantImportState();
      const repository = createNavigoAppRepository(state.prisma as never);
      await repository.applyParticipantImport({
        actorUserId: "admin-1",
        rows: [
          {
            celular: "+525512345678",
            correo: null,
            folio: "NAV-010",
            nombre: "PRUEBA UNO",
            observaciones: "PRUEBA",
            primeraFragancia: "AAA",
            reclutador: "GABY",
            segundaFragancia: "BBB"
          }
        ],
        studyId: state.study.id
      });
      state.ctlSessions.push({
        completedAt: new Date("2026-06-26T15:00:00.000Z"),
        createdAt: new Date("2026-06-26T15:00:00.000Z"),
        ctlInterviewerCode: { label: "Encuestador IKA 3" },
        id: "ctl-session-ika-1",
        interviewer: null,
        status: "COMPLETED",
        studyParticipantId: state.studyParticipants[0]!.id
      });

      const dashboard = await repository.getAdminDashboard(state.study.id);

      expect(dashboard?.participants[0]?.ctl).toMatchObject({
        completed: true,
        interviewerName: "Encuestador IKA 3",
        sessionId: "ctl-session-ika-1",
        status: "COMPLETED"
      });
    } finally {
      if (previousSupabaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
      }

      if (previousSupabaseSecret === undefined) {
        delete process.env.SUPABASE_SECRET_KEY;
      } else {
        process.env.SUPABASE_SECRET_KEY = previousSupabaseSecret;
      }
    }
  });

  it("deletes a direct App Navigo participant and frees its folio record", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: true,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    const participantId = state.studyParticipants[0]!.id;
    await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });
    state.ctlSessions.push({
      completedAt: new Date("2026-06-26T15:00:00.000Z"),
      createdAt: new Date("2026-06-26T15:00:00.000Z"),
      ctlInterviewerCode: null,
      id: "ctl-session-delete-1",
      interviewer: { name: "Encuestador Uno" },
      status: "COMPLETED",
      studyParticipantId: participantId
    });
    await repository.releaseParticipantAfterCtl({ actorUserId: "admin-1", studyParticipantId: participantId });
    const attemptId = state.screeningAttempts[0]!.id;
    const t0Activity = createParticipantActivity("T0_15_MIN", { status: "AVAILABLE" });
    state.schedules.push({ ...t0Activity.activitySchedule, studyId: state.study.id } as (typeof state.schedules)[number]);
    state.activities.push(t0Activity as never);
    const activityId = t0Activity.id;

    state.researchResponses.push({ id: "response-1", participantActivityId: activityId });
    state.participantActivityEvidence.push({
      id: "activity-evidence-1",
      participantActivityId: activityId,
      studyParticipantId: participantId
    });
    state.reminderLogs.push({ id: "reminder-1", participantActivityId: activityId });
    state.mediaEvidencePlaceholders.push({ id: "media-1", participantActivityId: activityId });
    state.applicationTimeEvents.push({ id: "event-1", studyParticipantId: participantId });
    state.participantAttributeOrders.push({ id: "attribute-order-1", studyParticipantId: participantId });
    state.participantEvidence.push({ id: "evidence-1", screeningAttemptId: attemptId, studyParticipantId: participantId });
    state.participantScreeningReviews.push({ id: "review-1", screeningAttemptId: attemptId, studyParticipantId: participantId });
    state.screeningAnswers.push({ id: "answer-1", screeningAttemptId: attemptId });

    const result = await repository.deleteParticipant({
      actorUserId: "admin-1",
      reason: "Registro de prueba creado por error.",
      studyId: state.study.id,
      studyParticipantId: participantId
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.message : "").toBe("Participante eliminado y folio liberado.");
    expect(state.studyParticipants).toHaveLength(0);
    expect(state.participantProfiles).toHaveLength(0);
    expect(state.confirmations).toHaveLength(0);
    expect(state.referenceCodes).toHaveLength(0);
    expect(state.screeningAttempts).toHaveLength(0);
    expect(state.screeningAnswers).toHaveLength(0);
    expect(state.participantEvidence).toHaveLength(0);
    expect(state.participantScreeningReviews).toHaveLength(0);
    expect(state.activities).toHaveLength(0);
    expect(state.researchResponses).toHaveLength(0);
    expect(state.participantActivityEvidence).toHaveLength(0);
    expect(state.reminderLogs).toHaveLength(0);
    expect(state.mediaEvidencePlaceholders).toHaveLength(0);
    expect(state.applicationTimeEvents).toHaveLength(0);
    expect(state.participantAttributeOrders).toHaveLength(0);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.armAssignments).toHaveLength(0);
    expect(state.accessTokens).toHaveLength(0);
  });

  it("blocks deleting a Navigo participant backed by a real screener attempt", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: false,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: null,
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    state.screeningAttempts[0]!.evaluationJson = { source: "FIELD_SCREENING" };

    const result = await repository.deleteParticipant({
      actorUserId: "admin-1",
      reason: "Intento de borrado.",
      studyId: state.study.id,
      studyParticipantId: state.studyParticipants[0]!.id
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("screening_attempt real del filtro");
    expect(state.studyParticipants).toHaveLength(1);
    expect(state.confirmations).toHaveLength(1);
    expect(state.screeningAttempts).toHaveLength(1);
  });

  it("exports participant links and rotation as clean tabular TSV columns for Excel", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: true,
      rows: [
        {
          celular: "+525512345678",
          correo: "ana.navigo@example.com",
          folio: "NAV-010",
          nombre: "ANA PÉREZ ÑUÑEZ",
          observaciones: "Texto largo, con coma; punto y coma\ny salto",
          primeraFragancia: "AAA 123",
          reclutador: "GABY CDMX; TURNO 1",
          segundaFragancia: "BBB 456"
        }
      ],
      studyId: state.study.id
    });
    await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "AAA 123",
      rightFragranceCode: "BBB 456",
      studyParticipantId: state.studyParticipants[0]!.id,
      triangularCode1: "",
      triangularCode2: ""
    });
    state.ctlSessions.push({
      completedAt: new Date("2026-06-26T15:00:00.000Z"),
      createdAt: new Date("2026-06-26T15:00:00.000Z"),
      ctlInterviewerCode: null,
      id: "ctl-session-export-1",
      interviewer: { name: "Encuestador Uno" },
      status: "COMPLETED",
      studyParticipantId: state.studyParticipants[0]!.id
    });
    await repository.releaseParticipantAfterCtl({
      actorUserId: "admin-1",
      studyParticipantId: state.studyParticipants[0]!.id
    });

    const result = await repository.exportLinksAndRotation({
      now: new Date("2026-06-30T12:00:00.000Z"),
      requestOrigin: "https://encuestas.example.com",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    const table = parseTsv(result.ok ? result.data.body : "");
    expect(result.ok ? result.data.filename : "").toBe("FMASCULINA-NAVIGO-2026_links_rotacion_2026-06-30.tsv");
    expect(table[0]).toEqual([
      "Folio",
      "Nombre",
      "Celular",
      "Correo",
      "Reclutador",
      "Link participante",
      "Primera fragancia / brazo izquierdo",
      "Segunda fragancia / brazo derecho",
      "Estado participante"
    ]);
    expect(table[1]).toHaveLength(table[0]?.length);
    expect(table[1]).toEqual([
      "NAV-010",
      "ANA PÉREZ ÑUÑEZ",
      "+525512345678",
      "ana.navigo@example.com",
      "GABY CDMX; TURNO 1",
      expect.stringMatching(/^https:\/\/encuestas\.example\.com\/p\/.+\/activities$/),
      "AAA123",
      "BBB456",
      "APPROVED"
    ]);
    expect(result.ok ? result.data.body : "").toContain("\uFEFF");
    expect(result.ok ? result.data.body : "").toContain("\t");
    expect(result.ok ? result.data.body : "").not.toContain("FolioNombreCelularCorreoReclutador");
  });

  it("does not duplicate participant import when the same row is reimported", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const input = {
      actorUserId: "admin-1",
      generateLinks: false,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    };

    const first = await repository.applyParticipantImport(input);
    const second = await repository.applyParticipantImport(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.ok ? second.data.created : -1).toBe(0);
    expect(second.ok ? second.data.updated : -1).toBe(1);
    expect(state.participantProfiles).toHaveLength(1);
    expect(state.studyParticipants).toHaveLength(1);
    expect(state.confirmations).toHaveLength(1);
    expect(state.rotationAssignments).toHaveLength(0);
  });

  it("completes a partial existing participant without duplicating profile or study participant", async () => {
    const state = createNavigoParticipantImportState();
    state.participantProfiles.push({
      createdByUserId: "admin-1",
      email: null,
      id: "profile-existing",
      name: "PRUEBA UNO",
      phone: "+525512345678",
      status: "ACTIVE"
    });
    state.studyParticipants.push({
      applicationStartedAt: null,
      createdByUserId: "admin-1",
      id: "study-participant-existing",
      operationalStatus: "ASSIGNED",
      participantProfileId: "profile-existing",
      screeningStatus: "PASSED",
      studyId: state.study.id,
      visualVerificationMode: null
    });

    const repository = createNavigoAppRepository(state.prisma as never);
    const result = await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: true,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.participantProfiles).toHaveLength(1);
    expect(state.studyParticipants).toHaveLength(1);
    expect(state.confirmations).toHaveLength(1);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.accessTokens).toHaveLength(0);
  });

  it("does not create random product keys or rotation while importing participants", async () => {
    const state = createNavigoParticipantImportState({ failStudyProductUpsert: true });
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: true,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.products).toHaveLength(0);
    expect(state.rotationPlans).toHaveLength(0);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.referenceCodes).toHaveLength(3);
  });

  it("does not attempt participant rotation updates when reimporting participants after T0", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: false,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    state.studyParticipants[0]!.applicationStartedAt = new Date("2026-06-27T10:00:00.000Z");

    const result = await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: false,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: "PRUEBA",
          primeraFragancia: "CCC",
          reclutador: "GABY",
          segundaFragancia: "DDD"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.products).toHaveLength(0);
  });

  it("configures rotation for a field-approved participant without colliding with existing study arm sort orders", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const studyParticipantId = seedApprovedFieldParticipantForNavigo(state);
    state.arms.push(
      { code: "LEGACY_LEFT", id: "arm-legacy-left", label: "Legacy left", sortOrder: 1, studyId: state.study.id },
      { code: "LEGACY_RIGHT", id: "arm-legacy-right", label: "Legacy right", sortOrder: 2, studyId: state.study.id }
    );

    const result = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "AAA",
      rightFragranceCode: "BBB",
      studyParticipantId,
      triangularCode1: "",
      triangularCode2: ""
    });

    expect(result.ok).toBe(true);
    expect(state.arms).toMatchObject([
      { code: "LEGACY_LEFT", sortOrder: 1 },
      { code: "LEGACY_RIGHT", sortOrder: 2 },
      { code: "LEFT", sortOrder: 3 },
      { code: "RIGHT", sortOrder: 4 }
    ]);
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.armAssignments).toMatchObject([
      { applicationOrder: 1, participantVisibleLabel: "Primera fragancia" },
      { applicationOrder: 2, participantVisibleLabel: "Segunda fragancia" }
    ]);
    expect(state.referenceCodes).toHaveLength(3);
  });

  it("keeps manual participant rotation limited to Navigo and leaves CTL triangular rotation to the official workbook", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const studyParticipantId = seedApprovedFieldParticipantForNavigo(state);

    const result = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "247",
      rightFragranceCode: "583",
      studyParticipantId,
      triangularCode1: "111",
      triangularCode2: "222"
    });

    expect(result.ok).toBe(true);
    expect(state.rotationAssignments).toMatchObject([{ studyParticipantId }]);
    expect(state.products.map((product) => product.internalCode)).toEqual(["247", "583"]);
    expect(state.armAssignments).toMatchObject([
      { applicationOrder: 1, participantVisibleLabel: "Primera fragancia" },
      { applicationOrder: 2, participantVisibleLabel: "Segunda fragancia" }
    ]);
  });

  it("saves real Navigo sample keys and study rotations without assigning participants", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(state.products.map((product) => product.internalCode)).toEqual(["247", "583"]);
    expect(state.products.map((product) => product.realName)).toEqual(["FRAGANCIA A", "FRAGANCIA B"]);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(result.ok ? result.data.rotations : []).toMatchObject([
      {
        name: "Rotacion 1",
        rotationCode: "ROTACION_1",
        arms: [{ sampleKey: "247" }, { sampleKey: "583" }]
      },
      {
        name: "Rotacion 2",
        rotationCode: "ROTACION_2",
        arms: [{ sampleKey: "583" }, { sampleKey: "247" }]
      }
    ]);
  });

  it("keeps WhatsApp reference codes independent from the configured rotation samples", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyParticipantImport({
      actorUserId: "admin-1",
      generateLinks: false,
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: null,
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        }
      ],
      studyId: state.study.id
    });

    await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });

    expect(state.referenceCodes).toHaveLength(3);
    expect(state.referenceCodes.map((code) => code.code)).not.toContain("247");
    expect(state.referenceCodes.map((code) => code.code)).not.toContain("583");
    expect(state.rotationAssignments).toHaveLength(0);
  });

  it("clears provisional participant rotation while preserving folio and WhatsApp codes", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const studyParticipantId = seedApprovedFieldParticipantForNavigo(state);

    const configured = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "247",
      rightFragranceCode: "583",
      studyParticipantId,
      triangularCode1: "",
      triangularCode2: ""
    });
    const codesBefore = state.referenceCodes.map((code) => code.code);
    const cleared = await repository.clearParticipantRotation({
      actorUserId: "admin-1",
      studyParticipantId
    });

    expect(configured.ok).toBe(true);
    expect(cleared.ok).toBe(true);
    expect(state.rotationAssignments).toHaveLength(0);
    expect(state.armAssignments).toHaveLength(0);
    expect(state.confirmations).toHaveLength(1);
    expect(state.referenceCodes.map((code) => code.code)).toEqual(codesBefore);
  });

  it("updates manual Navigo rotation and leaves WhatsApp codes independent", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const studyParticipantId = seedApprovedFieldParticipantForNavigo(state);

    const first = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "247",
      rightFragranceCode: "583",
      studyParticipantId
    });
    const codesBefore = state.referenceCodes.map((code) => code.code);
    const second = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "111",
      rightFragranceCode: "222",
      studyParticipantId
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.armAssignments).toHaveLength(2);
    expect(
      state.armAssignments
        .sort((left, right) => left.applicationOrder - right.applicationOrder)
        .map((assignment) => state.products.find((product) => product.id === assignment.studyProductId)?.internalCode)
    ).toEqual(["111", "222"]);
    expect(state.referenceCodes.map((code) => code.code)).toEqual(codesBefore);
  });

  it("returns a clear message if StudyArm still hits a unique sort order constraint", async () => {
    const state = createNavigoParticipantImportState({ failStudyArmCreateUnique: true });
    const repository = createNavigoAppRepository(state.prisma as never);
    const studyParticipantId = seedApprovedFieldParticipantForNavigo(state);

    const result = await repository.configureParticipantRotation({
      actorUserId: "admin-1",
      leftFragranceCode: "AAA",
      rightFragranceCode: "BBB",
      studyParticipantId,
      triangularCode1: "",
      triangularCode2: ""
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe(
      "No se pudo guardar la rotacion porque ya existe un brazo con ese orden. Actualiza la configuracion e intenta nuevamente."
    );
  });

  it("flags duplicate folios or phones in participant import preview", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.previewParticipantImport({
      rows: [
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA UNO",
          observaciones: null,
          primeraFragancia: "AAA",
          reclutador: "GABY",
          segundaFragancia: "BBB"
        },
        {
          celular: "+525512345678",
          correo: null,
          folio: "NAV-010",
          nombre: "PRUEBA DOS",
          observaciones: null,
          primeraFragancia: "BBB",
          reclutador: "GABY",
          segundaFragancia: "AAA"
        }
      ],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.summary.rowsWithError : -1).toBe(2);
    expect(result.ok ? result.data.rows[0]?.errors : []).toContain("folio duplicado en archivo");
    expect(result.ok ? result.data.rows[0]?.errors : []).toContain("celular duplicado en archivo");
  });

  it("keeps rotation import requiring an existing folio", async () => {
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.previewRotationImport({
      rows: [{ folio: "NAV-999", primeraFragancia: "AAA", segundaFragancia: "BBB" }],
      studyId: state.study.id
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.rows[0]?.errors : []).toContain("folio no encontrado");
  });

  it("keeps participant import apply flow sequential without Promise.all inside the apply transaction path", () => {
    const repositorySource = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");
    const applyStart = repositorySource.indexOf("async applyParticipantImport(input)");
    const applyEnd = repositorySource.indexOf("async startT0(input)");
    const applySource = repositorySource.slice(applyStart, applyEnd);

    expect(applySource).not.toContain("Promise.all");
    expect(applySource).toContain("for (const row of preview.rows)");
    expect(applySource).toContain("await prisma.$transaction(async (tx)");
  });

  it("keeps the rotation import panel from depending on multipart server action upload", () => {
    const panel = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "NavigoRotationImportPanel.tsx"
    );

    expect(panel).toContain("Usa un archivo CSV o TSV compatible con Excel. No se procesa XLSX directamente.");
    expect(panel).toContain("previewNavigoRotationImportTextAction");
    expect(panel).toContain("file.text()");
    expect(panel).toContain("setIsPreviewing(false)");
    expect(panel).toContain("result.status === \"error\" && !result.preview && state.preview");
    expect(panel).toContain("validRows > 0");
    expect(panel).toContain("La previsualizacion sigue siendo valida");
    expect(panel).toContain("Filas validas");
    expect(panel).toContain("Errores encontrados");
    expect(panel).not.toContain("useActionState");
  });

  it("shows the official XLSX rotation workbook importer in Navigo admin", () => {
    const page = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const panel = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "_components",
      "NavigoRotationWorkbookImportPanel.tsx"
    );

    expect(page).toContain("NavigoRotationWorkbookImportPanel");
    expect(panel).toContain("ROTACIONES NAVIGO.xlsx");
    expect(panel).toContain("previewNavigoRotationWorkbookImportAction");
    expect(panel).toContain("applyNavigoRotationWorkbookImportRowsAction");
    expect(panel).toContain("EVA1/EVA2");
    expect(panel).toContain("triangular CTL");
    expect(panel).toContain("Hoja HUT");
  });

  it("applies valid rotation import rows with LEFT and RIGHT assignments", async () => {
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.applyRotationImport({
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "AAA", segundaFragancia: "BBB" }],
      studyId: "study-navigo"
    });

    expect(result.ok).toBe(true);
    expect(state.arms.map((arm) => arm.code)).toEqual(["LEFT", "RIGHT"]);
    expect(state.products.map((product) => product.internalCode)).toEqual(["AAA", "BBB"]);
    expect(state.rotationPlans[0]?.rotationCode).toBe("NAV-001__AAA__BBB");
    expect(state.rotationPlanArms).toMatchObject([
      { applicationOrder: 1, participantVisibleLabel: "Primera fragancia" },
      { applicationOrder: 2, participantVisibleLabel: "Segunda fragancia" }
    ]);
    expect(state.armAssignments).toMatchObject([
      { applicationOrder: 1, participantVisibleLabel: "Primera fragancia" },
      { applicationOrder: 2, participantVisibleLabel: "Segunda fragancia" }
    ]);
  });

  it("applies official workbook rows to Navigo rotation and CTL triangular rotation", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const parsed = parseNavigoRotationWorkbook({
      bytes: createMinimalRotationWorkbook(),
      filename: "ROTACIONES NAVIGO.xlsx"
    });

    expect(parsed.ok).toBe(true);

    const preview = parsed.ok
      ? await repository.previewRotationWorkbookImport({
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(preview?.ok ? preview.data.summary.triangularComplete : 0).toBe(1);

    const applied = parsed.ok
      ? await repository.applyRotationWorkbookImport({
          actorUserId: "admin-1",
          filename: "ROTACIONES NAVIGO.xlsx",
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(applied?.ok).toBe(true);
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.ctlTriangularRotationAssignments).toMatchObject([
      {
        sourceFileName: "ROTACIONES NAVIGO.xlsx",
        studyParticipantId: state.participant.id,
        triangular1Pr1: "K-247",
        triangular1Pr2: "0-472",
        triangular1Pr3: "H-358",
        triangular1Verify: "H-358",
        triangular2Pr1: "G-835",
        triangular2Pr2: "Z-724",
        triangular2Pr3: "C-583",
        triangular2Verify: "Z-724"
      }
    ]);
    expect(state.hutParticipants).toMatchObject([
      {
        firstFragranceLeftArm: "901",
        folio: "HUT-001",
        origin: "CLT_HUT",
        protocolVersion: "APPLICATION_PHOTO",
        secondFragranceRightArm: "902",
        status: "NOT_STARTED",
        studyParticipantId: state.participant.id
      }
    ]);
    expect(state.hutRegistrationSlots).toMatchObject([
      {
        firstFragranceLeftArm: "901",
        folio: "HUT-001",
        secondFragranceRightArm: "902",
        status: "REGISTERED"
      }
    ]);
    expect(state.hutParticipantPhaseCodes).toMatchObject([
      { phase: "COLOCACION", slot: 1, status: "GENERATED" },
      { phase: "REGRESO_1", slot: 2, status: "GENERATED" },
      { phase: "REGRESO_2", slot: 3, status: "GENERATED" }
    ]);
    expect(state.hutParticipants[0]?.blocks).toHaveLength(0);
    expect(state.hutParticipants[0]?.callEvaluations).toHaveLength(0);
  });

  it("applies 100+ official workbook rows in multiple transactions", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState();
    for (let folioNumber = 2; folioNumber <= 105; folioNumber += 1) {
      seedRotationWorkbookParticipant(state, `NAV-${String(folioNumber).padStart(3, "0")}`);
    }
    const repository = createNavigoAppRepository(state.prisma as never);
    const rows = state.participants.map((participant, index) =>
      createRotationWorkbookRow(participant.participantConfirmation.folio, index)
    );

    const applied = await repository.applyRotationWorkbookImport({
      actorUserId: "admin-1",
      filename: "ROTACIONES NAVIGO.xlsx",
      hutRows: [],
      rows,
      studyId: state.study.id
    });

    expect(applied.ok).toBe(true);
    expect(state.rotationAssignments).toHaveLength(105);
    expect(state.ctlTriangularRotationAssignments).toHaveLength(105);
    expect(state.transactionCount).toBeGreaterThanOrEqual(5);
  });

  it("reports the exact folio when a workbook batch has one failing participant", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState({
      failArmAssignmentForParticipantId: "study-participant-26"
    });
    for (let folioNumber = 2; folioNumber <= 30; folioNumber += 1) {
      seedRotationWorkbookParticipant(state, `NAV-${String(folioNumber).padStart(3, "0")}`);
    }
    const repository = createNavigoAppRepository(state.prisma as never);
    const rows = state.participants.map((participant, index) =>
      createRotationWorkbookRow(participant.participantConfirmation.folio, index)
    );

    const applied = await repository.applyRotationWorkbookImport({
      actorUserId: "admin-1",
      filename: "ROTACIONES NAVIGO.xlsx",
      hutRows: [],
      rows,
      studyId: state.study.id
    });

    expect(applied.ok).toBe(false);
    expect(applied.ok ? [] : applied.data?.applyErrors).toMatchObject([
      {
        folio: "NAV-026",
        scope: "CLT",
        step: "participant-arm-left"
      }
    ]);
    expect(state.rotationAssignments.some((assignment) => assignment.studyParticipantId === "study-participant-25")).toBe(true);
    expect(state.rotationAssignments.some((assignment) => assignment.studyParticipantId === "study-participant-27")).toBe(true);
  });

  it("synchronizes HUT rows from workbook without requiring the legacy screening flag", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState({ hutAccessAnswer: NAVIGO_HUT_ACCESS_NO_VALUE });
    const repository = createNavigoAppRepository(state.prisma as never);
    const parsed = parseNavigoRotationWorkbook({
      bytes: createMinimalRotationWorkbook(),
      filename: "ROTACIONES NAVIGO.xlsx"
    });

    expect(parsed.ok).toBe(true);

    const preview = parsed.ok
      ? await repository.previewRotationWorkbookImport({
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(preview?.ok ? preview.data.hutRows[0]?.errors : ["preview failed"]).toEqual([]);

    const applied = parsed.ok
      ? await repository.applyRotationWorkbookImport({
          actorUserId: "admin-1",
          filename: "ROTACIONES NAVIGO.xlsx",
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(applied?.ok).toBe(true);
    expect(state.hutParticipants).toHaveLength(1);
    expect(state.hutRegistrationSlots).toHaveLength(1);
    expect(state.hutParticipantPhaseCodes).toHaveLength(3);
  });

  it("links HUT folios to the equivalent NAV participant when present", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState({ participantFolio: "NAV-003" });
    const repository = createNavigoAppRepository(state.prisma as never);
    const parsed = parseNavigoRotationWorkbook({
      bytes: createMinimalRotationWorkbook({ cltFolio: "3", hutFolio: "HUT-003" }),
      filename: "ROTACIONES NAVIGO.xlsx"
    });

    expect(parsed.ok).toBe(true);

    const preview = parsed.ok
      ? await repository.previewRotationWorkbookImport({
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(preview?.ok ? preview.data.hutRows[0] : null).toMatchObject({
      folio: "HUT-003",
      hutOrigin: "CLT_HUT",
      linkedNavigoFolio: "NAV-003",
      linkedStudyParticipantId: state.participant.id
    });

    const applied = parsed.ok
      ? await repository.applyRotationWorkbookImport({
          actorUserId: "admin-1",
          filename: "ROTACIONES NAVIGO.xlsx",
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(applied?.ok).toBe(true);
    expect(state.hutParticipants).toMatchObject([
      {
        folio: "HUT-003",
        origin: "CLT_HUT",
        protocolVersion: "APPLICATION_PHOTO",
        studyParticipantId: state.participant.id
      }
    ]);
  });

  it("prepares direct HUT participants when the equivalent NAV participant does not exist", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const parsed = parseNavigoRotationWorkbook({
      bytes: createMinimalRotationWorkbook({ hutFolio: "HUT-157" }),
      filename: "ROTACIONES NAVIGO.xlsx"
    });

    expect(parsed.ok).toBe(true);

    const preview = parsed.ok
      ? await repository.previewRotationWorkbookImport({
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(preview?.ok ? preview.data.hutRows[0] : null).toMatchObject({
      errors: [],
      folio: "HUT-157",
      hutOrigin: "HUT_DIRECTO",
      linkedNavigoFolio: "NAV-157",
      linkedStudyParticipantId: null
    });

    const applied = parsed.ok
      ? await repository.applyRotationWorkbookImport({
          actorUserId: "admin-1",
          filename: "ROTACIONES NAVIGO.xlsx",
          hutRows: parsed.hutRows,
          rows: parsed.rows,
          studyId: state.study.id
        })
      : null;

    expect(applied?.ok).toBe(true);
    expect(state.hutParticipants).toMatchObject([
      {
        folio: "HUT-157",
        name: "HUT-157",
        origin: "HUT_DIRECTO",
        protocolVersion: "APPLICATION_PHOTO",
        studyParticipantId: null
      }
    ]);
    expect(state.hutParticipantPhaseCodes).toHaveLength(3);
  });

  it("retries rotation import without duplicating plans or assignments", async () => {
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const input = {
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "AAA", segundaFragancia: "BBB" }],
      studyId: "study-navigo"
    };

    await repository.applyRotationImport(input);
    await repository.applyRotationImport(input);

    expect(state.arms).toHaveLength(2);
    expect(state.products).toHaveLength(2);
    expect(state.rotationPlans).toHaveLength(1);
    expect(state.rotationPlanArms).toHaveLength(2);
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.armAssignments).toHaveLength(2);
  });

  it("updates rotation import before T0 and blocks changes after T0", async () => {
    const state = createNavigoRotationImportState();
    const repository = createNavigoAppRepository(state.prisma as never);

    await repository.applyRotationImport({
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "AAA", segundaFragancia: "BBB" }],
      studyId: "study-navigo"
    });
    const updated = await repository.applyRotationImport({
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "CCC", segundaFragancia: "DDD" }],
      studyId: "study-navigo"
    });
    state.participant.applicationStartedAt = new Date("2026-06-26T16:00:00.000Z");
    const blocked = await repository.applyRotationImport({
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "EEE", segundaFragancia: "FFF" }],
      studyId: "study-navigo"
    });

    expect(updated.ok).toBe(true);
    expect(state.rotationPlans.map((plan) => plan.rotationCode)).toContain("NAV-001__CCC__DDD");
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toBe("Corrige los errores de la previsualizacion antes de aplicar la importacion.");
    expect(blocked.ok ? 0 : blocked.data?.summary.rowsWithError).toBe(1);
  });

  it("blocks Navigo before CTL and creates only T3, T4.5 and T6 after initial application", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });
    const registered = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5512345678",
      folio: "NAV-001",
      generateLink: true,
      nombre: "Participante Uno",
      studyId: state.study.id
    });

    expect(registered.ok).toBe(true);
    expect(registered.ok ? registered.data.linkToken : "unexpected").toBeNull();
    expect(state.accessTokens).toHaveLength(0);
    expect(state.activities).toHaveLength(0);

    const participantId = registered.ok ? registered.data.studyParticipantId : "";
    const blocked = await repository.generateParticipantLink({
      actorUserId: "admin-1",
      studyParticipantId: participantId
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toBe("Pendiente para iniciar T0: completar CTL presencial.");

    state.ctlSessions.push({
      completedAt: new Date("2026-06-26T15:00:00.000Z"),
      createdAt: new Date("2026-06-26T15:00:00.000Z"),
      ctlInterviewerCode: null,
      id: "ctl-session-1",
      interviewer: { name: "Encuestador Uno" },
      status: "COMPLETED",
      studyParticipantId: participantId
    });

    const released = await repository.releaseParticipantAfterCtl({
      actorUserId: "admin-1",
      now: new Date("2026-06-26T15:05:00.000Z"),
      studyParticipantId: participantId
    });

    expect(released.ok).toBe(true);
    expect(state.accessTokens).toHaveLength(1);
    expect(state.activities).toHaveLength(0);
    expect(state.rotationAssignments).toMatchObject([{ rotationCode: "ROTACION_1" }]);
    expect(state.armAssignments).toHaveLength(2);

    const application = await repository.registerInitialApplication({
      now: new Date("2026-06-26T16:00:00.000Z"),
      token: state.accessTokens[0]?.id ?? ""
    });

    expect(application.ok).toBe(true);
    expect(state.activities).toHaveLength(3);
    const createdActivities = state.activities
      .map((activity) => ({
        code: state.schedules.find((schedule) => schedule.id === activity.activityScheduleId)?.code,
        scheduledAt: activity.scheduledAt
      }))
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
    expect(createdActivities.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-06-26T19:00:00.000Z",
      "2026-06-26T20:30:00.000Z",
      "2026-06-26T22:00:00.000Z"
    ]);
    expect(createdActivities.map((activity) => activity.code)).toEqual(["T3_HORAS", "T4_5_HORAS", "T6_HORAS"]);
    expect(state.activities.some((activity) => {
      const code = String(state.schedules.find((schedule) => schedule.id === activity.activityScheduleId)?.code ?? "");
      return code === "T0_15_MIN" || code === "T8_HORAS";
    })).toBe(false);
  });

  it("records T0 from CTL comparative start and keeps existing availability calculations", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });
    const registered = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5512345678",
      folio: "NAV-001",
      generateLink: false,
      nombre: "Participante Uno",
      studyId: state.study.id
    });
    const participantId = registered.ok ? registered.data.studyParticipantId : "";
    state.ctlSessions.push({
      completedAt: new Date("2026-08-08T06:20:00.000Z"),
      createdAt: new Date("2026-08-08T05:00:00.000Z"),
      ctlInterviewerCode: { label: "Jesus" },
      id: "ctl-session-1",
      interviewer: null,
      status: "COMPLETED",
      studyParticipantId: participantId
    });

    const result = await repository.recordApplicationStartedFromCtl({
      actorUserId: "admin-1",
      now: new Date("2026-08-08T06:30:00.000Z"),
      studyParticipantId: participantId
    });

    expect(result.ok).toBe(true);
    expect(state.studyParticipants.find((participant) => participant.id === participantId)?.applicationStartedAt?.toISOString()).toBe("2026-08-08T06:30:00.000Z");
    const createdActivities = state.activities
      .map((activity) => ({
        code: state.schedules.find((schedule) => schedule.id === activity.activityScheduleId)?.code,
        scheduledAt: activity.scheduledAt
      }))
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
    expect(createdActivities.map((activity) => activity.code)).toEqual(["T3_HORAS", "T4_5_HORAS", "T6_HORAS"]);
    expect(createdActivities.map((activity) => activity.scheduledAt.toISOString())).toEqual([
      "2026-08-08T09:30:00.000Z",
      "2026-08-08T11:00:00.000Z",
      "2026-08-08T12:30:00.000Z"
    ]);
    expect(state.applicationTimeEvents).toHaveLength(1);
  });

  it("keeps CTL release rotation fixed and assigns independent rotations to two participants", async () => {
    const state = createNavigoParticipantImportState();
    const repository = createNavigoAppRepository(state.prisma as never);
    await repository.configureStudyRotation({
      actorUserId: "admin-1",
      firstInternalName: "Fragancia A",
      firstSampleKey: "247",
      secondInternalName: "Fragancia B",
      secondSampleKey: "583",
      studyId: state.study.id
    });
    const first = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5512345678",
      folio: "NAV-001",
      nombre: "Participante Uno",
      studyId: state.study.id
    });
    const second = await repository.registerDirectParticipant({
      actorUserId: "admin-1",
      celular: "5598765432",
      folio: "NAV-002",
      nombre: "Participante Dos",
      studyId: state.study.id
    });
    const firstId = first.ok ? first.data.studyParticipantId : "";
    const secondId = second.ok ? second.data.studyParticipantId : "";
    state.ctlSessions.push(
      {
        completedAt: new Date("2026-06-26T15:00:00.000Z"),
        createdAt: new Date("2026-06-26T15:00:00.000Z"),
        ctlInterviewerCode: null,
        id: "ctl-session-1",
        interviewer: { name: "Encuestador Uno" },
        status: "COMPLETED",
        studyParticipantId: firstId
      },
      {
        completedAt: new Date("2026-06-26T15:10:00.000Z"),
        createdAt: new Date("2026-06-26T15:10:00.000Z"),
        ctlInterviewerCode: null,
        id: "ctl-session-2",
        interviewer: { name: "Encuestador Uno" },
        status: "COMPLETED",
        studyParticipantId: secondId
      }
    );

    await repository.releaseParticipantAfterCtl({ actorUserId: "admin-1", studyParticipantId: firstId });
    await repository.releaseParticipantAfterCtl({ actorUserId: "admin-1", studyParticipantId: secondId });
    await repository.releaseParticipantAfterCtl({ actorUserId: "admin-1", studyParticipantId: firstId });

    expect(state.rotationAssignments).toMatchObject([
      { rotationCode: "ROTACION_1", studyParticipantId: firstId },
      { rotationCode: "ROTACION_2", studyParticipantId: secondId }
    ]);
    expect(state.armAssignments.filter((assignment) => assignment.studyParticipantId === firstId)).toHaveLength(2);
    expect(state.armAssignments.filter((assignment) => assignment.studyParticipantId === secondId)).toHaveLength(2);
  });

  it("returns sanitized database errors without dropping the valid preview", async () => {
    const state = createNavigoRotationImportState({ failProductUpsert: true });
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.applyRotationImport({
      actorUserId: "admin-1",
      rows: [{ folio: "NAV-001", primeraFragancia: "AAA", segundaFragancia: "BBB" }],
      studyId: "study-navigo"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("Error de base de datos al guardar la rotacion. Revisa logs.");
    expect(result.ok ? null : result.data?.summary.rowsWithError).toBe(0);
    expect(result.ok ? null : result.data?.summary.validRows).toBe(1);
  });

  it("does not let a T2 selfie enable AP1 to AP7 in T4", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);

    state.activities.find((activity) => activity.id === "activity-T4_HORAS")?.participantActivityEvidence.push(
      createActivitySelfieEvidence({
        id: "evidence-t2-leaked",
        participantActivityId: "activity-T2_HORAS",
        reviewStatus: "APPROVED"
      })
    );

    const view = await repository.getActivityCaptureView({
      activityId: "activity-T4_HORAS",
      storage: state.storage,
      testMode: true,
      token: "token-1"
    });

    expect(view.ok).toBe(true);
    expect(view.ok ? view.data.selfieCount : -1).toBe(0);
    expect(view.ok ? view.data.selfieReviewStatus : "missing").toBeNull();
  });

  it("requires a selfie from the current T4 activity before saving responses without requiring approval", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const t4 = state.activities.find((activity) => activity.id === "activity-T4_HORAS");

    t4?.participantActivityEvidence.push(
      createActivitySelfieEvidence({
        id: "evidence-t2-leaked",
        participantActivityId: "activity-T2_HORAS",
        reviewStatus: "APPROVED"
      })
    );

    const blocked = await repository.submitActivityResponses({
      activityId: "activity-T4_HORAS",
      answers: completeNavigoAnswers(),
      testMode: true,
      token: "token-1"
    });

    t4?.participantActivityEvidence.push(
      createActivitySelfieEvidence({
        id: "evidence-t4",
        participantActivityId: "activity-T4_HORAS",
        reviewStatus: "REJECTED"
      })
    );
    const saved = await repository.submitActivityResponses({
      activityId: "activity-T4_HORAS",
      answers: completeNavigoAnswers(),
      testMode: true,
      token: "token-1"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toBe("Toma y guarda la selfie de esta evaluacion antes de guardar las respuestas.");
    expect(saved.ok).toBe(true);
    expect(state.responses.filter((response) => response.participantActivityId === "activity-T4_HORAS")).toHaveLength(7);
    expect(t4?.status).toBe("COMPLETED");
  });

  it("skips activity selfies when the participant visual verification mode is disabled", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const originalMode = process.env.NAVIGO_VISUAL_VERIFICATION_MODE;
    process.env.NAVIGO_VISUAL_VERIFICATION_MODE = "required";
    state.participant.visualVerificationMode = "disabled";
    state.participant.participantEvidence = [];

    try {
      const view = await repository.getActivityCaptureView({
        activityId: "activity-T4_HORAS",
        testMode: true,
        token: "token-1"
      });
      const saved = await repository.submitActivityResponses({
        activityId: "activity-T4_HORAS",
        answers: completeNavigoAnswers(),
        testMode: true,
        token: "token-1"
      });

      expect(view.ok).toBe(true);
      expect(view.ok ? view.data.requiresSelfie : true).toBe(false);
      expect(view.ok ? view.data.visualVerificationStatus : null).toBe("not_required");
      expect(saved.ok).toBe(true);
      expect(state.responses.filter((response) => response.participantActivityId === "activity-T4_HORAS")).toHaveLength(7);
    } finally {
      if (originalMode === undefined) {
        delete process.env.NAVIGO_VISUAL_VERIFICATION_MODE;
      } else {
        process.env.NAVIGO_VISUAL_VERIFICATION_MODE = originalMode;
      }
    }
  });

  it("uses the global visual verification mode only when the participant has no override", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    const originalMode = process.env.NAVIGO_VISUAL_VERIFICATION_MODE;
    process.env.NAVIGO_VISUAL_VERIFICATION_MODE = "disabled";
    state.participant.visualVerificationMode = null;
    state.participant.participantEvidence = [];

    try {
      const view = await repository.getActivityCaptureView({
        activityId: "activity-T4_HORAS",
        testMode: true,
        token: "token-1"
      });

      expect(view.ok).toBe(true);
      expect(view.ok ? view.data.requiresSelfie : true).toBe(false);
      expect(view.ok ? view.data.visualVerificationMode : "required").toBe("disabled");
    } finally {
      if (originalMode === undefined) {
        delete process.env.NAVIGO_VISUAL_VERIFICATION_MODE;
      } else {
        process.env.NAVIGO_VISUAL_VERIFICATION_MODE = originalMode;
      }
    }
  });

  it("allows admin or supervisor workflow to set participant visual verification before T0", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    state.participant.applicationStartedAt = null;
    for (const activity of state.activities) {
      activity.actualCompletedAt = null;
      activity.actualStartedAt = null;
      activity.status = "AVAILABLE";
      activity.responses = [];
    }

    const result = await repository.updateParticipantVisualVerificationMode({
      actorUserId: "supervisor-1",
      mode: "disabled",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok).toBe(true);
    expect(state.participant.visualVerificationMode).toBe("disabled");
  });

  it("blocks changing participant visual verification after T0 starts", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.updateParticipantVisualVerificationMode({
      actorUserId: "supervisor-1",
      mode: "disabled",
      studyParticipantId: "study-participant-1"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("La identificación visual solo puede cambiarse antes de iniciar T0.");
  });

  it("creates a reference selfie at T0 without running activity face comparison", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    state.participant.participantEvidence = [];

    const request = await repository.requestActivitySelfieUpload({
      activityId: "activity-T0_SALON",
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "referencia.jpg",
        sizeBytes: 100
      },
      storage: state.storage,
      token: "token-1"
    });

    expect(request.ok).toBe(true);
    expect(request.ok ? request.data.privateStorageKey : "").toContain("/screening-attempts/attempt-1/");

    const confirmed = await repository.confirmActivitySelfieUpload({
      activityId: "activity-T0_SALON",
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        faceVerification: null,
        mimeType: "image/jpeg",
        originalFilename: "referencia.jpg",
        privateStorageKey: request.ok ? request.data.privateStorageKey : "",
        sizeBytes: 100,
        storageBucket: "participant-evidence"
      },
      token: "token-1"
    });

    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok ? confirmed.data.reviewStatus : "PENDING").toBe("APPROVED");
    expect(confirmed.ok ? confirmed.data.internalNote : null).toBe("reference_created");
    expect(state.participant.participantEvidence).toHaveLength(1);
    expect(state.participant.participantEvidence[0]?.privateStorageKey).toContain("/screening-attempts/attempt-1/");
    expect(state.responses.some((response) => response.questionId === "T0_IDENTITY_CONFIRMED")).toBe(true);
  });

  it("keeps the historical T0, T2, T4 and T8 participant flow working without real WhatsApp", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    state.participant.visualVerificationMode = "required";
    state.participant.participantEvidence = [];
    state.participant.applicationStartedAt = new Date("2026-06-25T15:00:00.000Z");
    for (const activity of state.activities) {
      activity.actualCompletedAt = null;
      activity.actualStartedAt = null;
      activity.participantActivityEvidence = [];
      activity.responses = [];
      activity.status = "AVAILABLE";
    }
    const legacyCodes = ["T0_SALON", "T2_HORAS", "T4_HORAS", "T8_HORAS"] as const satisfies readonly NavigoActivityCode[];
    const captureTimes = {
      T0_SALON: new Date("2026-06-25T15:00:00.000Z"),
      T2_HORAS: new Date("2026-06-25T17:00:00.000Z"),
      T4_HORAS: new Date("2026-06-25T19:00:00.000Z"),
      T8_HORAS: new Date("2026-06-25T23:00:00.000Z")
    } satisfies Record<(typeof legacyCodes)[number], Date>;

    const initial = await repository.getParticipantActivitiesView({
      now: new Date("2026-06-25T15:00:00.000Z"),
      testMode: true,
      token: "token-1"
    });

    expect(initial.ok).toBe(true);
    expect(initial.ok ? initial.data.timeline.map((activity) => activity.code) : []).toEqual([
      "T0_SALON",
      "T2_HORAS",
      "T4_HORAS",
      "T8_HORAS"
    ]);
    expect(initial.ok ? JSON.stringify(initial.data) : "").not.toContain("T6");

    for (const code of legacyCodes) {
      const activityId = `activity-${code}`;
      const beforeCapture = await repository.getActivityCaptureView({
        activityId,
        now: captureTimes[code],
        testMode: true,
        token: "token-1"
      });
      expect(beforeCapture.ok).toBe(true);
      expect(beforeCapture.ok ? beforeCapture.data.requiresSelfie : false).toBe(true);

      const upload = await repository.requestActivitySelfieUpload({
        activityId,
        metadata: {
          evidenceType: "SELFIE_IDENTIFICATION",
          mimeType: "image/jpeg",
          originalFilename: `${code}.jpg`,
          sizeBytes: 100
        },
        storage: state.storage,
        token: "token-1"
      });
      expect(upload.ok).toBe(true);

      const confirmed = await repository.confirmActivitySelfieUpload({
        activityId,
        metadata: {
          evidenceType: "SELFIE_IDENTIFICATION",
          faceVerification:
            isInitialNavigoEvaluation(code)
              ? null
              : {
                  evaluatedAt: "2026-06-25T15:00:00.000Z",
                  method: NAVIGO_FACE_VERIFICATION_METHOD,
                  score: 0.88,
                  status: "MATCH"
                },
          mimeType: "image/jpeg",
          originalFilename: `${code}.jpg`,
          privateStorageKey: upload.ok ? upload.data.privateStorageKey : "",
          sizeBytes: 100,
          storageBucket: "participant-evidence"
        },
        token: "token-1"
      });
      expect(confirmed.ok).toBe(true);
      expect(confirmed.ok ? confirmed.data.reviewStatus : "PENDING").toBe("APPROVED");
      expect(confirmed.ok ? confirmed.data.internalNote : "").toContain(
        isInitialNavigoEvaluation(code) ? "reference_created" : "MATCH"
      );

      if (isInitialNavigoEvaluation(code)) {
        const identity = await repository.confirmT0Identity({
          activityId,
          identityConfirmed: "YES",
          now: captureTimes[code],
          token: "token-1"
        });
        expect(identity.ok).toBe(true);
      }

      const saved = await repository.submitActivityResponses({
        activityId,
        answers: completeNavigoAnswers(),
        testMode: true,
        token: "token-1"
      });
      if (!saved.ok) {
        throw new Error(`${code}: ${saved.message}`);
      }
      expect(saved.ok).toBe(true);
    }

    const final = await repository.getParticipantActivitiesView({
      now: new Date("2026-06-25T23:00:00.000Z"),
      testMode: true,
      token: "token-1"
    });

    expect(final.ok).toBe(true);
    expect(final.ok ? final.data.timeline.map((activity) => activity.code) : []).toEqual([
      "T0_SALON",
      "T2_HORAS",
      "T4_HORAS",
      "T8_HORAS"
    ]);
    expect(state.participant.participantEvidence).toHaveLength(1);
    expect(state.activities.every((activity) => activity.status === "COMPLETED")).toBe(true);
    expect(state.responses.filter((response) => response.questionId.startsWith("AP"))).toHaveLength(28);
    expect(state.activities.some((activity) => String(activity.activitySchedule.code) === "T6_HORAS")).toBe(false);
  });

  it("blocks later activities when visual verification is required and reference selfie is missing", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    state.participant.participantEvidence = [];

    const view = await repository.getActivityCaptureView({
      activityId: "activity-T4_HORAS",
      testMode: true,
      token: "token-1"
    });

    expect(view.ok).toBe(false);
    expect(view.ok ? "" : view.message).toBe("No encontramos una foto registrada para comparar. Contacta al supervisor antes de continuar.");
  });

  it("creates the three current protocol activities from the public portal without duplicates", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);
    state.activities.length = 0;
    state.activitySchedules.length = 0;

    const first = await repository.getParticipantActivitiesView({
      now: new Date("2026-06-25T18:00:00.000Z"),
      testMode: true,
      token: "token-1"
    });
    const second = await repository.getParticipantActivitiesView({
      now: new Date("2026-06-25T18:00:00.000Z"),
      testMode: true,
      token: "token-1"
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.data.timeline.map((activity) => activity.code)).toEqual([
      "T3_HORAS",
      "T4_5_HORAS",
      "T6_HORAS"
    ]);
    expect(first.data.timeline.find((activity) => activity.code === "T3_HORAS")).toMatchObject({
      scheduledAt: new Date("2026-06-25T18:00:00.000Z")
    });
    expect(first.data.timeline.find((activity) => activity.code === "T4_5_HORAS")).toMatchObject({
      scheduledAt: new Date("2026-06-25T19:30:00.000Z")
    });
    expect(first.data.timeline.find((activity) => activity.code === "T6_HORAS")).toMatchObject({
      scheduledAt: new Date("2026-06-25T21:00:00.000Z")
    });
    expect(second.data.timeline.map((activity) => activity.code)).toEqual(first.data.timeline.map((activity) => activity.code));
    expect(state.activities).toHaveLength(3);
  });

  it("keeps legacy participant activities on the historical protocol", async () => {
    const state = createNavigoParticipantActivityState();
    const repository = createNavigoAppRepository(state.prisma as never);

    const result = await repository.getParticipantActivitiesView({
      now: new Date("2026-06-25T18:00:00.000Z"),
      testMode: true,
      token: "token-1"
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.timeline.map((activity) => activity.code)).toEqual([
      "T0_SALON",
      "T2_HORAS",
      "T4_HORAS",
      "T8_HORAS"
    ]);
    expect(result.data.timeline).toHaveLength(4);
    expect(result.data.timeline.some((activity) => activity.code === "T0_15_MIN")).toBe(false);
    expect(result.data.timeline.some((activity) => activity.code === "T3_HORAS")).toBe(false);
    expect(result.data.timeline.some((activity) => activity.code === "T4_5_HORAS")).toBe(false);
    expect(result.data.timeline.some((activity) => activity.code === "T6_HORAS")).toBe(false);
  });

  it("serves the rotation template as a tab-separated file with UTF-8 BOM", () => {
    const route = readWorkspaceFile(
      "src",
      "app",
      "admin",
      "studies",
      "[studyId]",
      "navigo-app",
      "rotation-template",
      "route.ts"
    );

    expect(createNavigoRotationTemplateTsv()).toContain("\t");
    expect(route).toContain("\\uFEFF");
    expect(route).toContain("text/tab-separated-values; charset=utf-8");
    expect(route).toContain(".tsv");
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
  t0IdentityStatus = "CONFIRMED",
  t0Status = "COMPLETED",
  t3Completed = false,
  t3IdentityReviewStatus,
  t3SelfieCount = 0,
  t45Completed = false,
  t6Completed = false
}: {
  t0IdentityStatus?: "CONFIRMED" | "PENDING" | "REJECTED";
  t0Status?: "COMPLETED" | "STARTED";
  t3Completed?: boolean;
  t3IdentityReviewStatus?: "APPROVED" | "PENDING" | "REJECTED";
  t3SelfieCount?: number;
  t45Completed?: boolean;
  t6Completed?: boolean;
} = {}) {
  return [
    navigoActivityRecord("T0_15_MIN", 15, 0, 585, t0Status, t0Status === "COMPLETED" ? new Date("2026-06-25T15:15:00.000Z") : null, t0Status === "COMPLETED" ? new Date("2026-06-25T15:15:00.000Z") : null, {
      identityStatus: t0IdentityStatus
    }),
    navigoActivityRecord("T3_HORAS", 180, -30, 420, t3Completed ? "COMPLETED" : "PENDING", null, null, {
      identityReviewStatus: t3IdentityReviewStatus,
      selfieCount: t3SelfieCount
    }),
    navigoActivityRecord("T4_5_HORAS", 270, -30, 330, t45Completed ? "COMPLETED" : "PENDING", null, null),
    navigoActivityRecord("T6_HORAS", 360, -30, 240, t6Completed ? "COMPLETED" : "PENDING", null, null),
    navigoActivityRecord("T8_HORAS", 480, -30, 120, "PENDING", null, null)
  ];
}

function navigoActivityRecord(
  code: NavigoActivityCode,
  offsetMinutes: number,
  windowStartsMinutes: number,
  windowEndsMinutes: number,
  status: "COMPLETED" | "PENDING" | "STARTED",
  actualStartedAt: Date | null,
  actualCompletedAt: Date | null,
  extra: Partial<{
    identityReviewStatus: "APPROVED" | "PENDING" | "REJECTED";
    identityStatus: "CONFIRMED" | "PENDING" | "REJECTED";
    selfieCount: number;
  }> = {}
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
    status,
    ...extra
  };
}

function createNavigoParticipantActivityState() {
  const study = {
    code: NAVIGO_STUDY_CODE,
    id: "study-navigo",
    name: "Fragancia Masculina",
    status: "ACTIVE" as const,
    timeZoneIana: "America/Mexico_City"
  };
  const activities = [
    createParticipantActivity("T0_SALON", {
      actualCompletedAt: new Date("2026-06-25T15:00:00.000Z"),
      actualStartedAt: new Date("2026-06-25T15:00:00.000Z"),
      questionnaireVersionId: null,
      responses: [
        { answerJson: { value: "YES" }, questionId: "T0_IDENTITY_CONFIRMED" },
        ...completeNavigoResponseRows()
      ],
      status: "COMPLETED" as const
    }),
    createParticipantActivity("T2_HORAS", {
      actualCompletedAt: new Date("2026-06-25T17:05:00.000Z"),
      actualStartedAt: new Date("2026-06-25T17:00:00.000Z"),
      participantActivityEvidence: [
        createActivitySelfieEvidence({
          id: "evidence-t2",
          participantActivityId: "activity-T2_HORAS",
          reviewStatus: "APPROVED"
        })
      ],
      responses: completeNavigoResponseRows(),
      status: "COMPLETED" as const
    }),
    createParticipantActivity("T4_HORAS"),
    createParticipantActivity("T8_HORAS")
  ];
  const activitySchedules: Array<{
    code: string;
    id: string;
    offsetMinutes: number;
    questionnaireVersionId: string | null;
    sortOrder: number;
    status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
    type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT" | "VIDEO_EVIDENCE";
    windowEndsMinutes: number;
    windowStartsMinutes: number;
  }> = activities.map((activity) => activity.activitySchedule);
  const participant = {
    accessTokens: [],
    activities,
    applicationStartedAt: new Date("2026-06-25T15:00:00.000Z") as Date | null,
    ctlSessions: [
      {
        completedAt: new Date("2026-06-25T14:30:00.000Z"),
        ctlInterviewerCode: null,
        id: "ctl-session-1",
        interviewer: { name: "Encuestador Uno" },
        status: "COMPLETED" as const
      }
    ],
    id: "study-participant-1",
    participantConfirmation: {
      id: "confirmation-1",
      folio: "NAV-001",
      referenceCodes: [
        { code: "CODE-1", slot: 1 },
        { code: "CODE-2", slot: 2 },
        { code: "CODE-3", slot: 3 }
      ],
      screeningAttempt: {
        evaluationJson: null,
        id: "attempt-1",
        source: "FIELD"
      }
    },
    participantEvidence: [
      {
        id: "registered-selfie",
        privateStorageKey: "studies/study-navigo/participants/profile-1/selfie.jpg",
        storageBucket: "participant-evidence",
        type: "SELFIE_IDENTIFICATION" as const
      }
    ],
    participantProfile: {
      email: null,
      id: "profile-1",
      name: "Participante Uno",
      participantAuthUserId: null,
      phone: null
    },
    participantScreeningReviews: [{ status: "APPROVED" as const }],
    rotationAssignment: {
      arms: [
        {
          applicationOrder: 1,
          participantVisibleLabel: "Primera fragancia",
          studyArm: { code: "LEFT", label: "Brazo izquierdo", sortOrder: 1 },
          studyProduct: { displayLabel: "Primera fragancia", id: "product-left", internalCode: "AAA" }
        },
        {
          applicationOrder: 2,
          participantVisibleLabel: "Segunda fragancia",
          studyArm: { code: "RIGHT", label: "Brazo derecho", sortOrder: 2 },
          studyProduct: { displayLabel: "Segunda fragancia", id: "product-right", internalCode: "BBB" }
        }
      ],
      rotationCode: "NAV-001__AAA__BBB"
    },
    screeningStatus: "PASSED" as const,
    study,
    visualVerificationMode: null as string | null
  };
  const responses: Array<{
    answerJson: unknown;
    participantActivityId: string;
    questionId: string;
    questionnaireVersionId: string;
    responseKey: string;
    validationStatus: string;
  }> = [];
  const tx = {
    activitySchedule: {
      async create(args: {
        data: {
          code: string;
          name: string;
          offsetMinutes: number;
          questionnaireVersionId: string | null;
          sortOrder: number;
          status: "ACTIVE";
          studyId?: string;
          type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT";
          windowEndsMinutes: number;
          windowStartsMinutes: number;
        };
      }) {
        const record = {
          code: args.data.code,
          id: `schedule-${args.data.code}`,
          offsetMinutes: args.data.offsetMinutes,
          questionnaireVersionId: args.data.questionnaireVersionId,
          sortOrder: args.data.sortOrder,
          status: args.data.status,
          type: args.data.type,
          windowEndsMinutes: args.data.windowEndsMinutes,
          windowStartsMinutes: args.data.windowStartsMinutes
        };
        activitySchedules.push(record);
        return { id: record.id };
      },
      async findMany(args?: { where?: { code?: { in?: string[] }; status?: string; studyId?: string } }) {
        const requestedCodes: readonly string[] = args?.where?.code?.in ?? NAVIGO_ACTIVITY_CODES;
        return activitySchedules
          .filter(
            (schedule) =>
              requestedCodes.includes(schedule.code) &&
              (!args?.where?.status || schedule.status === args.where.status)
          );
      },
      async update(args: { data: Partial<(typeof activitySchedules)[number]>; where: { id: string } }) {
        const target = activitySchedules.find((schedule) => schedule.id === args.where.id);
        if (!target) {
          throw new Error("schedule not found");
        }
        Object.assign(target, args.data);
        return { id: target.id };
      }
    },
    participantAccessToken: {
      async findFirst() {
        return {
          expiresAt: new Date("2026-12-31T00:00:00.000Z"),
          id: "token-row-1",
          status: "ACTIVE",
          studyParticipant: participant,
          tokenHash: hashToken("token-1")
        };
      },
      async update() {
        return { id: "token-row-1" };
      }
    },
    participantActivity: {
      async create(args: {
        data: {
          activityScheduleId: string;
          actualCompletedAt: Date | null;
          actualStartedAt: Date | null;
          availableFrom: Date;
          availableUntil: Date;
          occurrenceKey: string;
          scheduledAt: Date;
          status: "AVAILABLE" | "COMPLETED" | "PENDING" | "STARTED";
          studyParticipantId: string;
        };
      }) {
        const schedule = activitySchedules.find((item) => item.id === args.data.activityScheduleId);
        if (!schedule) {
          throw new Error("schedule not found");
        }
        if (!NAVIGO_ACTIVITY_CODES.includes(schedule.code as never)) {
          throw new Error("legacy schedule cannot create active participant activity");
        }

        const record = {
          ...args.data,
          activitySchedule: schedule as (typeof activities)[number]["activitySchedule"],
          id: `activity-${schedule.code}`,
          participantActivityEvidence: [],
          responses: []
        };
        activities.push(record);
        participant.activities = activities;
        return record;
      },
      async update(args: {
        data: Partial<(typeof activities)[number]>;
        where:
          | { id: string }
          | {
              studyParticipantId_activityScheduleId_occurrenceKey: {
                activityScheduleId: string;
                occurrenceKey: string;
                studyParticipantId: string;
              };
            };
      }) {
        const where = args.where;
        const target =
          "id" in where
            ? activities.find((activity) => activity.id === where.id)
            : activities.find(
                (activity) =>
                  activity.activityScheduleId === where.studyParticipantId_activityScheduleId_occurrenceKey.activityScheduleId &&
                  activity.occurrenceKey === where.studyParticipantId_activityScheduleId_occurrenceKey.occurrenceKey
              );
        if (!target) {
          throw new Error("activity not found");
        }
        Object.assign(target, args.data);
        return target;
      }
    },
    participantActivityEvidence: {
      async create(args: {
        data: {
          extension: string;
          internalNote: string;
          mimeType: string;
          originalFilename: string;
          participantActivityId: string;
          privateStorageKey: string;
          rejectionReason: string | null;
          reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
          sizeBytes: number;
          storageBucket: string;
          studyParticipantId: string;
          type: "SELFIE_IDENTIFICATION";
        };
      }) {
        const activity = activities.find((item) => item.id === args.data.participantActivityId);
        if (!activity) {
          throw new Error("activity not found");
        }

        const record = {
          ...args.data,
          id: `activity-evidence-${activity.participantActivityEvidence.length + 1}`,
          rejectionReason: null,
          reviewedAt: null,
          uploadedAt: new Date("2026-06-25T17:00:00.000Z")
        };
        activity.participantActivityEvidence.push(record);
        return record;
      }
    },
    participantEvidence: {
      async create(args: { data: (typeof participant.participantEvidence)[number] & { internalNote?: string | null; reviewStatus?: string } }) {
        participant.participantEvidence.unshift({
          id: `participant-evidence-${participant.participantEvidence.length + 1}`,
          privateStorageKey: args.data.privateStorageKey,
          storageBucket: args.data.storageBucket,
          type: args.data.type
        });
        return args.data;
      }
    },
    questionnaireVersion: {
      async findFirst() {
        return { id: "version-1" };
      }
    },
    studyParticipant: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === participant.id ? participant : null;
      },
      async update(args: { data: { visualVerificationMode?: string | null }; where: { id: string } }) {
        if (args.where.id !== participant.id) {
          throw new Error("participant not found");
        }
        participant.visualVerificationMode = args.data.visualVerificationMode ?? null;
        return participant;
      }
    },
    researchResponse: {
      async upsert(args: {
        create: (typeof responses)[number];
        update: Partial<(typeof responses)[number]>;
        where: { participantActivityId_responseKey: { participantActivityId: string; responseKey: string } };
      }) {
        const target = responses.find(
          (response) =>
            response.participantActivityId === args.where.participantActivityId_responseKey.participantActivityId &&
            response.responseKey === args.where.participantActivityId_responseKey.responseKey
        );

        if (target) {
          Object.assign(target, args.update);
          syncActivityResponses(target);
          return target;
        }

        responses.push({ ...args.create });
        syncActivityResponses(args.create);
        return args.create;
      }
    }
  };
  const prisma = {
    ...tx,
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      return callback(tx);
    }
  };
  const storage = {
    async createSignedReadUrl() {
      return "https://example.test/signed-selfie.jpg";
    },
    async createSignedUploadUrl() {
      return {
        signedUrl: "https://example.test/upload",
        token: "signed-upload-token"
      };
    }
  };

  function syncActivityResponses(response: (typeof responses)[number]) {
    const activity = activities.find((item) => item.id === response.participantActivityId);
    if (!activity) {
      return;
    }

    const existing = activity.responses.find((item) => item.questionId === response.questionId);
    const next = { answerJson: response.answerJson, questionId: response.questionId };
    if (existing) {
      Object.assign(existing, next);
    } else {
      activity.responses.push(next);
    }
  }

  return {
    activities,
    activitySchedules,
    participant,
    prisma,
    responses,
    storage
  };
}

function createParticipantActivity(
  code: NavigoActivityCode,
  overrides: Partial<{
    actualCompletedAt: Date | null;
    actualStartedAt: Date | null;
    participantActivityEvidence: ReturnType<typeof createActivitySelfieEvidence>[];
    questionnaireVersionId: string | null;
    responses: Array<{ answerJson: unknown; questionId: string }>;
    status: "AVAILABLE" | "COMPLETED" | "PENDING" | "STARTED";
  }> = {}
) {
  const offsets = {
    T0_15_MIN: 15,
    T3_HORAS: 180,
    T4_5_HORAS: 270,
    T6_HORAS: 360,
    T8_HORAS: 480,
    T0_SALON: 0,
    T2_HORAS: 120,
    T4_HORAS: 240
  } satisfies Record<NavigoActivityCode, number>;
  const windows = {
    T0_15_MIN: [0, 585],
    T3_HORAS: [-30, 420],
    T4_5_HORAS: [-30, 330],
    T6_HORAS: [-30, 240],
    T8_HORAS: [-30, 120],
    T0_SALON: [0, 0],
    T2_HORAS: [-30, 480],
    T4_HORAS: [-30, 360]
  } satisfies Record<NavigoActivityCode, [number, number]>;
  const base = new Date("2026-06-25T15:00:00.000Z");
  const scheduledAt = new Date(base.getTime() + offsets[code] * 60000);
  const [windowStartsMinutes, windowEndsMinutes] = windows[code];

  return {
    activitySchedule: {
      code,
      id: `schedule-${code}`,
      offsetMinutes: offsets[code],
      questionnaireVersionId: overrides.questionnaireVersionId ?? "version-1",
      sortOrder: NAVIGO_ACTIVITY_CODES.includes(code as never) ? NAVIGO_ACTIVITY_CODES.indexOf(code as never) : offsets[code],
      status: "ACTIVE" as const,
      type: isInitialNavigoEvaluation(code) && code === "T0_SALON" ? ("INTERNAL_FOLLOWUP" as const) : ("QUESTIONNAIRE_MEASUREMENT" as const),
      windowEndsMinutes,
      windowStartsMinutes
    },
    activityScheduleId: `schedule-${code}`,
    actualCompletedAt: overrides.actualCompletedAt ?? null,
    actualStartedAt: overrides.actualStartedAt ?? null,
    availableFrom: new Date(scheduledAt.getTime() + windowStartsMinutes * 60000),
    availableUntil: new Date(scheduledAt.getTime() + windowEndsMinutes * 60000),
    id: `activity-${code}`,
    occurrenceKey: "DEFAULT",
    participantActivityEvidence: overrides.participantActivityEvidence ?? [],
    responses: overrides.responses ?? [],
    scheduledAt,
    studyParticipantId: "study-participant-1",
    status: overrides.status ?? "PENDING"
  };
}

function createActivitySelfieEvidence({
  id,
  participantActivityId,
  reviewStatus
}: {
  id: string;
  participantActivityId: string;
  reviewStatus: "APPROVED" | "PENDING" | "REJECTED";
}) {
  return {
    id,
    internalNote: reviewStatus === "APPROVED" ? "Verificacion facial automatica: MATCH" : null,
    participantActivityId,
    privateStorageKey: `studies/study-navigo/participants/profile-1/activities/${participantActivityId}/selfie.jpg`,
    rejectionReason: null,
    reviewStatus,
    reviewedAt: null,
    storageBucket: "participant-evidence",
    type: "SELFIE_IDENTIFICATION" as const,
    uploadedAt: new Date("2026-06-25T17:00:00.000Z")
  };
}

function completeNavigoAnswers() {
  return Object.fromEntries(
    completeNavigoResponseRows().map((response) => [response.questionId, readAnswerValueForInput(response.answerJson)])
  );
}

function completeNavigoResponseRows() {
  return [
    { answerJson: { value: "AMBAS" }, questionId: "AP1_PREFERENCIA_GENERAL" },
    { answerJson: { value: "PRIMERA" }, questionId: "AP2_PREFERENCIA_INTENSIDAD" },
    { answerJson: { value: 5 }, questionId: "AP3_INTENSIDAD_PRIMERA" },
    { answerJson: { value: 5 }, questionId: "AP4_INTENSIDAD_SEGUNDA" },
    { answerJson: { value: 8 }, questionId: "AP5_CALIFICACION_PRIMERA" },
    { answerJson: { value: 8 }, questionId: "AP6_CALIFICACION_SEGUNDA" },
    { answerJson: { value: "AMBAS" }, questionId: "AP7_MAYOR_DURACION" }
  ];
}

function readAnswerValueForInput(answerJson: unknown): string {
  if (typeof answerJson === "object" && answerJson !== null && "value" in answerJson) {
    return String((answerJson as { value: string | number }).value);
  }

  return "";
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

function seedApprovedFieldParticipantForNavigo(state: ReturnType<typeof createNavigoParticipantImportState>) {
  const studyParticipantId = "study-participant-field-1";
  state.participantProfiles.push({
    createdByUserId: "field-user-1",
    email: null,
    id: "profile-field-1",
    name: "PARTICIPANTE FIELD",
    participantAuthUserId: null,
    phone: "+525500000001",
    status: "ACTIVE"
  });
  state.studyParticipants.push({
    applicationStartedAt: null,
    createdByUserId: "field-user-1",
    id: studyParticipantId,
    operationalStatus: "ASSIGNED",
    participantProfileId: "profile-field-1",
    screeningStatus: "PASSED",
    studyId: state.study.id,
    visualVerificationMode: "required"
  });
  state.screeningAttempts.push({
    completedAt: new Date("2026-06-25T15:00:00.000Z"),
    evaluationJson: { status: "PASSED" },
    fieldUserId: null,
    id: "attempt-field-1",
    questionnaireVersionId: "questionnaire-active-1",
    source: "FIELD",
    status: "PASSED",
    studyParticipantId
  });
  state.participantScreeningReviews.push({
    id: "review-field-1",
    screeningAttemptId: "attempt-field-1",
    studyParticipantId
  });
  state.confirmations.push({
    approvedAt: new Date("2026-06-25T15:10:00.000Z"),
    approvedByUserId: "admin-1",
    folio: "NAV-010",
    folioSequence: 10,
    id: "confirmation-field-1",
    manualMessageStatus: "NOT_SENT",
    screeningAttemptId: "attempt-field-1",
    studyId: state.study.id,
    studyParticipantId
  });
  state.referenceCodes.push(
    { code: "A7K4", confirmationId: "confirmation-field-1", slot: 1 },
    { code: "M3P9", confirmationId: "confirmation-field-1", slot: 2 },
    { code: "T8R2", confirmationId: "confirmation-field-1", slot: 3 }
  );

  return studyParticipantId;
}

function createNavigoParticipantImportState(
  {
    failExistingLookup = false,
    failStudyArmCreateUnique = false,
    failStudyProductUpsert = false
  }: { failExistingLookup?: boolean; failStudyArmCreateUnique?: boolean; failStudyProductUpsert?: boolean } = {}
) {
  const study = {
    code: NAVIGO_STUDY_CODE,
    id: "study-navigo",
    name: "Fragancia Masculina",
    status: "ACTIVE" as const,
    timeZoneIana: "America/Mexico_City"
  };
  const schedules = [
    {
      code: "T0_SALON" as const,
      id: "schedule-t0",
      offsetMinutes: 0,
      questionnaireVersionId: "questionnaire-active-1",
      sortOrder: 1,
      status: "ACTIVE" as const,
      studyId: study.id,
      type: "QUESTIONNAIRE_MEASUREMENT" as const,
      windowEndsMinutes: 20160,
      windowStartsMinutes: 0
    }
  ];
  const questionnaireVersions = [{ id: "questionnaire-active-1", status: "ACTIVE" as const, studyId: study.id, versionNumber: 1 }];
  const participantProfiles: Array<{
    createdByUserId: string | null;
    email: string | null;
    id: string;
    name: string;
    participantAuthUserId?: string | null;
    phone: string | null;
    status: "ACTIVE";
  }> = [];
  const studyParticipants: Array<{
    applicationStartedAt: Date | null;
    createdByUserId: string | null;
    id: string;
    operationalStatus: "ASSIGNED";
    participantProfileId: string;
    screeningStatus: "PASSED";
    studyId: string;
    visualVerificationMode: string | null;
  }> = [];
  const screeningAttempts: Array<{
    completedAt: Date | null;
    evaluationJson: unknown;
    fieldUserId: string | null;
    id: string;
    questionnaireVersionId: string;
    source: "FIELD";
    status: "PASSED";
    studyParticipantId: string;
  }> = [];
  const confirmations: Array<{
    approvedAt: Date;
    approvedByUserId: string | null;
    folio: string;
    folioSequence: number;
    id: string;
    manualMessageStatus: "NOT_SENT";
    screeningAttemptId: string;
    studyId: string;
    studyParticipantId: string;
  }> = [];
  const referenceCodes: Array<{ code: string; confirmationId: string; slot: number }> = [];
  const accessTokens: Array<{
    createdByUserId: string | null;
    expiresAt: Date;
    id: string;
    revokedAt?: Date | null;
    revokedByUserId?: string | null;
    revocationReason?: string | null;
    status: "ACTIVE" | "REVOKED";
    studyParticipantId: string;
    tokenHash: string;
  }> = [];
  const ctlSessions: Array<{
    completedAt: Date | null;
    createdAt: Date;
    ctlInterviewerCode: { label: string } | null;
    id: string;
    interviewer: { name: string } | null;
    status: "CANCELLED" | "COMPLETED" | "IN_PROGRESS" | "PENDING";
    studyParticipantId: string;
  }> = [];
  const applicationTimeEvents: Array<{ id: string; studyParticipantId: string }> = [];
  const activities: Array<{
    activityScheduleId: string;
    actualCompletedAt: Date | null;
    actualStartedAt: Date | null;
    availableFrom: Date;
    availableUntil: Date;
    id: string;
    occurrenceKey: string;
    scheduledAt: Date;
    status: "AVAILABLE";
    studyParticipantId: string;
  }> = [];
  const participantActivityEvidence: Array<{ id: string; participantActivityId: string; studyParticipantId: string }> = [];
  const participantAttributeOrders: Array<{ id: string; studyParticipantId: string }> = [];
  const participantEvidence: Array<{ id: string; screeningAttemptId: string; studyParticipantId: string }> = [];
  const participantScreeningReviews: Array<{ id: string; screeningAttemptId: string; studyParticipantId: string }> = [];
  const participantConsents: Array<{ id: string; studyParticipantId: string }> = [];
  const quotaEvaluations: Array<{ id: string; studyParticipantId: string }> = [];
  const reminderLogs: Array<{
    channel?: string;
    id: string;
    metadataJson?: unknown;
    participantActivityId: string;
    scheduledFor?: Date | null;
    sentAt?: Date | null;
    status?: string;
  }> = [];
  const mediaEvidencePlaceholders: Array<{ id: string; participantActivityId: string }> = [];
  const researchResponses: Array<{ id: string; participantActivityId: string }> = [];
  const screeningAnswers: Array<{ id: string; screeningAttemptId: string }> = [];
  const arms: Array<{ code: string; id: string; label: string; sortOrder: number; studyId: string }> = [];
  const products: Array<{
    displayLabel: string;
    id: string;
    internalCode: string;
    isSensitive: boolean;
    realName: string;
    studyId: string;
  }> = [];
  const rotationPlans: Array<{ id: string; name: string; rotationCode: string; status?: string; studyId: string }> = [];
  const rotationPlanArms: Array<{
    applicationOrder: number;
    participantVisibleLabel: string;
    rotationPlanId: string;
    studyArmId: string;
    studyProductId: string;
  }> = [];
  const rotationAssignments: Array<{
    id: string;
    rotationCode: string;
    rotationPlanId: string;
    studyParticipantId: string;
  }> = [];
  const armAssignments: Array<{
    applicationOrder: number;
    id: string;
    participantRotationAssignmentId: string;
    participantVisibleLabel: string;
    studyArmId: string;
    studyParticipantId: string;
    studyProductId: string;
  }> = [];

  function deleteWhere<T>(items: T[], predicate: (item: T) => boolean) {
    const retained = items.filter((item) => !predicate(item));
    const count = items.length - retained.length;
    items.splice(0, items.length, ...retained);
    return { count };
  }

  function buildParticipantRecord(studyParticipantId: string) {
    const participant = studyParticipants.find((item) => item.id === studyParticipantId);
    if (!participant) {
      return null;
    }

    const profile = participantProfiles.find((item) => item.id === participant.participantProfileId);
    if (!profile) {
      throw new Error("test fixture missing participant profile");
    }

    const confirmation = confirmations.find((item) => item.studyParticipantId === participant.id) ?? null;
    const attempt = confirmation
      ? screeningAttempts.find((item) => item.id === confirmation.screeningAttemptId) ?? null
      : null;
    const assignment = rotationAssignments.find((item) => item.studyParticipantId === participant.id) ?? null;

    return {
      accessTokens: accessTokens
        .filter((item) => item.studyParticipantId === participant.id && item.status === "ACTIVE")
        .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime()),
      activities: activities
        .filter((item) => item.studyParticipantId === participant.id)
        .map((activity) => {
          const schedule = schedules.find((item) => item.id === activity.activityScheduleId);
          if (!schedule) {
            throw new Error("test fixture missing schedule");
          }

          return {
            ...activity,
            activitySchedule: schedule,
            participantActivityEvidence: [],
            responses: []
          };
        }),
      applicationStartedAt: participant.applicationStartedAt,
      ctlSessions: ctlSessions
        .filter((session) => session.studyParticipantId === participant.id)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((session) => ({
          completedAt: session.completedAt,
          ctlInterviewerCode: session.ctlInterviewerCode,
          id: session.id,
          interviewer: session.interviewer,
          status: session.status
        })),
      id: participant.id,
      participantConfirmation: confirmation
        ? {
            id: confirmation.id,
            folio: confirmation.folio,
            referenceCodes: referenceCodes
              .filter((item) => item.confirmationId === confirmation.id)
              .sort((left, right) => left.slot - right.slot),
            screeningAttempt: attempt ? { evaluationJson: attempt.evaluationJson, id: attempt.id, source: attempt.source } : null
          }
        : null,
      participantEvidence: [],
      participantProfile: {
        email: profile.email,
        id: profile.id,
        name: profile.name,
        participantAuthUserId: profile.participantAuthUserId,
        phone: profile.phone
      },
      participantScreeningReviews: [],
      rotationAssignment: assignment
        ? {
            arms: armAssignments
              .filter((item) => item.participantRotationAssignmentId === assignment.id)
              .sort((left, right) => left.applicationOrder - right.applicationOrder)
              .map((item) => {
                const arm = arms.find((candidate) => candidate.id === item.studyArmId);
                const product = products.find((candidate) => candidate.id === item.studyProductId);
                if (!arm || !product) {
                  throw new Error("test fixture missing rotation relation");
                }

                return {
                  applicationOrder: item.applicationOrder,
                  participantVisibleLabel: item.participantVisibleLabel,
                  studyArm: { code: arm.code, label: arm.label, sortOrder: arm.sortOrder },
                  studyProduct: {
                    displayLabel: product.displayLabel,
                    id: product.id,
                    internalCode: product.internalCode
                  }
                };
              }),
            rotationCode: assignment.rotationCode
          }
        : null,
      screeningStatus: participant.screeningStatus,
      study,
      visualVerificationMode: participant.visualVerificationMode
    };
  }

  const tx = {
    activitySchedule: {
      async create(args: { data: (typeof schedules)[number] }) {
        const record = { ...args.data, id: `schedule-${args.data.code}` };
        schedules.push(record);
        return { id: record.id };
      },
      async findMany(args: { where: { code?: { in: readonly string[] }; status?: string; studyId: string } }) {
        return schedules
          .filter(
            (schedule) =>
              schedule.studyId === args.where.studyId &&
              (args.where.status === undefined || schedule.status === args.where.status) &&
              (args.where.code === undefined || args.where.code.in.includes(schedule.code))
          )
          .sort((left, right) => left.sortOrder - right.sortOrder);
      },
      async findFirst(args: { where: { code: string; status: string; studyId: string } }) {
        return (
          schedules.find(
            (item) =>
              item.code === args.where.code && item.status === args.where.status && item.studyId === args.where.studyId
          ) ?? null
        );
      },
      async update(args: { data: Partial<(typeof schedules)[number]>; where: { id: string } }) {
        const target = schedules.find((schedule) => schedule.id === args.where.id);
        if (!target) {
          throw new Error("schedule not found");
        }
        Object.assign(target, args.data);
        return target;
      }
    },
    participantAccessToken: {
      async create(args: { data: (typeof accessTokens)[number] }) {
        accessTokens.push(args.data);
        return args.data;
      },
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(accessTokens, (token) => token.studyParticipantId === args.where.studyParticipantId);
      },
      async findFirst(args: { where: { status: string; tokenHash: string } }) {
        const token = accessTokens.find(
          (candidate) => candidate.status === args.where.status && candidate.tokenHash === args.where.tokenHash
        );
        if (!token) {
          return null;
        }
        const participant = buildParticipantRecord(token.studyParticipantId);
        return participant
          ? {
              ...token,
              studyParticipant: participant
            }
          : null;
      },
      async update(args: { data: Partial<(typeof accessTokens)[number]>; where: { id: string } }) {
        const target = accessTokens.find((token) => token.id === args.where.id);
        if (!target) {
          throw new Error("token not found");
        }
        Object.assign(target, args.data);
        return target;
      },
      async updateMany(args: { data: Partial<(typeof accessTokens)[number]>; where: { status: string; studyParticipantId: string } }) {
        let count = 0;
        for (const token of accessTokens) {
          if (token.studyParticipantId === args.where.studyParticipantId && token.status === args.where.status) {
            Object.assign(token, args.data);
            count += 1;
          }
        }
        return { count };
      }
    },
    participantActivity: {
      async create(args: { data: Omit<(typeof activities)[number], "id">; select: { id: true } }) {
        const record = { ...args.data, id: `activity-${activities.length + 1}` };
        activities.push(record);
        return { id: record.id };
      },
      async deleteMany(args: { where: { id: { in: string[] } } }) {
        return deleteWhere(activities, (activity) => args.where.id.in.includes(activity.id));
      },
      async findMany(args: {
        where: {
          activitySchedule?: { code?: { in: readonly string[] }; status?: string };
          availableFrom?: { lte: Date };
          status?: { not: string };
          studyParticipant?: { studyId?: string };
          studyParticipantId?: string;
        };
      }) {
        if (args.where.studyParticipantId) {
          return activities.filter((activity) => activity.studyParticipantId === args.where.studyParticipantId);
        }

        return activities
          .filter((activity) => {
            const schedule = schedules.find((item) => item.id === activity.activityScheduleId);
            const participant = studyParticipants.find((item) => item.id === activity.studyParticipantId);

            return (
              Boolean(schedule) &&
              Boolean(participant) &&
              (args.where.activitySchedule?.code === undefined ||
                args.where.activitySchedule.code.in.includes(schedule!.code)) &&
              (args.where.activitySchedule?.status === undefined || schedule!.status === args.where.activitySchedule.status) &&
              (args.where.availableFrom === undefined || activity.availableFrom.getTime() <= args.where.availableFrom.lte.getTime()) &&
              (args.where.status === undefined || activity.status !== args.where.status.not) &&
              (args.where.studyParticipant?.studyId === undefined || participant!.studyId === args.where.studyParticipant.studyId)
            );
          })
          .map((activity) => {
            const schedule = schedules.find((item) => item.id === activity.activityScheduleId);
            const participant = buildParticipantRecord(activity.studyParticipantId);
            if (!schedule || !participant) {
              throw new Error("test fixture missing reminder relation");
            }

            return {
              activitySchedule: {
                code: schedule.code,
                id: schedule.id
              },
              availableFrom: activity.availableFrom,
              id: activity.id,
              reminders: reminderLogs
                .filter((log) => log.participantActivityId === activity.id && log.channel === "INTERNAL_FOLLOWUP")
                .map((log) => ({ id: log.id, metadataJson: log.metadataJson, status: log.status })),
              status: activity.status,
              studyParticipant: {
                accessTokens: participant.accessTokens,
                id: participant.id,
                participantConfirmation: participant.participantConfirmation
                  ? { folio: participant.participantConfirmation.folio }
                  : null,
                participantProfile: participant.participantProfile,
                qaParticipantRun: null,
                study: participant.study,
                studyId: participant.study.id
              }
            };
          });
      }
    },
    participantActivityEvidence: {
      async deleteMany(args: { where: { participantActivityId: { in: string[] } } }) {
        return deleteWhere(participantActivityEvidence, (evidence) =>
          args.where.participantActivityId.in.includes(evidence.participantActivityId)
        );
      }
    },
    ctlSession: {
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(ctlSessions, (session) => session.studyParticipantId === args.where.studyParticipantId);
      }
    },
    participantArmAssignment: {
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(armAssignments, (assignment) => assignment.studyParticipantId === args.where.studyParticipantId);
      },
      async upsert(args: {
        create: Omit<(typeof armAssignments)[number], "id">;
        update: Partial<(typeof armAssignments)[number]>;
        where: { studyParticipantId_studyArmId: { studyArmId: string; studyParticipantId: string } };
      }) {
        const target = armAssignments.find(
          (assignment) =>
            assignment.studyArmId === args.where.studyParticipantId_studyArmId.studyArmId &&
            assignment.studyParticipantId === args.where.studyParticipantId_studyArmId.studyParticipantId
        );

        if (target) {
          Object.assign(target, args.update);
          return target;
        }

        const record = { ...args.create, id: `arm-assignment-${armAssignments.length + 1}` };
        armAssignments.push(record);
        return record;
      }
    },
    participantAttributeOrder: {
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(participantAttributeOrders, (order) => order.studyParticipantId === args.where.studyParticipantId);
      }
    },
    participantConsent: {
      async findMany(args: { where: { studyParticipantId: string } }) {
        return participantConsents.filter((consent) => consent.studyParticipantId === args.where.studyParticipantId);
      }
    },
    participantConfirmation: {
      async create(args: { data: Omit<(typeof confirmations)[number], "id">; select: { id: true } }) {
        const record = { ...args.data, id: `confirmation-${confirmations.length + 1}` };
        confirmations.push(record);
        return { id: record.id };
      },
      async deleteMany(args: { where: { id: string } }) {
        return deleteWhere(confirmations, (confirmation) => confirmation.id === args.where.id);
      },
      async findMany(args: { where: { folio?: { in: string[] }; studyId: string } }) {
        if (failExistingLookup) {
          throw new Error("participant confirmation lookup failed");
        }

        return confirmations
          .filter(
            (item) =>
              item.studyId === args.where.studyId &&
              (!args.where.folio || args.where.folio.in.includes(item.folio))
          )
          .map((confirmation) => ({
            folio: confirmation.folio,
            studyParticipant: buildParticipantRecord(confirmation.studyParticipantId)
          }));
      }
    },
    participantEvidence: {
      async deleteMany(args: { where: { screeningAttemptId: string; studyParticipantId: string } }) {
        return deleteWhere(
          participantEvidence,
          (evidence) =>
            evidence.screeningAttemptId === args.where.screeningAttemptId &&
            evidence.studyParticipantId === args.where.studyParticipantId
        );
      },
      async findMany(args: { where: { screeningAttemptId: { not: string }; studyParticipantId: string } }) {
        return participantEvidence.filter(
          (evidence) =>
            evidence.studyParticipantId === args.where.studyParticipantId &&
            evidence.screeningAttemptId !== args.where.screeningAttemptId.not
        );
      }
    },
    participantProfile: {
      async create(args: {
        data: Omit<(typeof participantProfiles)[number], "id">;
        select: { email: true; id: true; name: true; phone: true };
      }) {
        const record = { ...args.data, id: `profile-${participantProfiles.length + 1}` };
        participantProfiles.push(record);
        return { email: record.email, id: record.id, name: record.name, phone: record.phone };
      },
      async update(args: { data: Partial<(typeof participantProfiles)[number]>; where: { id: string } }) {
        const target = participantProfiles.find((item) => item.id === args.where.id);
        if (!target) {
          throw new Error("profile not found");
        }
        Object.assign(target, args.data);
        return target;
      },
      async deleteMany(args: { where: { id: string } }) {
        return deleteWhere(participantProfiles, (profile) => profile.id === args.where.id);
      }
    },
    participantReferenceCode: {
      async createMany(args: { data: Array<{ code: string; confirmationId: string; slot: number }> }) {
        referenceCodes.push(...args.data);
        return { count: args.data.length };
      },
      async deleteMany(args: { where: { confirmationId: string } }) {
        return deleteWhere(referenceCodes, (code) => code.confirmationId === args.where.confirmationId);
      },
      async findMany() {
        return referenceCodes.map((item) => ({ code: item.code }));
      }
    },
    participantRotationAssignment: {
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(
          rotationAssignments,
          (assignment) => assignment.studyParticipantId === args.where.studyParticipantId
        );
      },
      async findMany(args: { where: { rotationPlanId: { in: string[] } } }) {
        return rotationAssignments
          .filter((assignment) => args.where.rotationPlanId.in.includes(assignment.rotationPlanId))
          .map((assignment) => ({ rotationPlanId: assignment.rotationPlanId }));
      },
      async upsert(args: {
        create: {
          assignedByUserId?: string;
          assignmentMode?: string;
          rotationCode: string;
          rotationPlanId: string;
          studyParticipantId: string;
        };
        update: Partial<{
          rotationCode: string;
          rotationPlanId: string;
        }>;
        where: { studyParticipantId: string };
      }) {
        const target = rotationAssignments.find((item) => item.studyParticipantId === args.where.studyParticipantId);

        if (target) {
          Object.assign(target, args.update);
          return { id: target.id };
        }

        const record = { ...args.create, id: `rotation-assignment-${rotationAssignments.length + 1}` };
        rotationAssignments.push(record);
        return { id: record.id };
      }
    },
    participantScreeningReview: {
      async deleteMany(args: { where: { screeningAttemptId: string } }) {
        return deleteWhere(
          participantScreeningReviews,
          (review) => review.screeningAttemptId === args.where.screeningAttemptId
        );
      }
    },
    quotaEvaluation: {
      async findMany(args: { where: { studyParticipantId: string } }) {
        return quotaEvaluations.filter((evaluation) => evaluation.studyParticipantId === args.where.studyParticipantId);
      }
    },
    questionnaireVersion: {
      async findFirst(args: { where: { status: string; studyId: string } }) {
        return (
          questionnaireVersions.find(
            (item) => item.studyId === args.where.studyId && item.status === args.where.status
          ) ?? null
        );
      }
    },
    rotationPlan: {
      async findMany(args: { where: { status?: string; studyId: string } }) {
        return rotationPlans
          .filter(
            (plan) =>
              plan.studyId === args.where.studyId &&
              (args.where.status === undefined || (plan as { status?: string }).status === args.where.status)
          )
          .sort((left, right) => left.rotationCode.localeCompare(right.rotationCode))
          .map((plan) => ({
            arms: rotationPlanArms
              .filter((arm) => arm.rotationPlanId === plan.id)
              .sort((left, right) => left.applicationOrder - right.applicationOrder)
              .map((arm) => {
                const product = products.find((candidate) => candidate.id === arm.studyProductId);
                return {
                  applicationOrder: arm.applicationOrder,
                  participantVisibleLabel: arm.participantVisibleLabel,
                  studyArmId: arm.studyArmId,
                  studyProductId: arm.studyProductId,
                  studyProduct: { internalCode: product?.internalCode ?? "" }
                };
              }),
            name: plan.name,
            id: plan.id,
            rotationCode: plan.rotationCode
          }));
      },
      async upsert(args: {
        create: { name: string; rotationCode: string; studyId: string };
        update: { name: string };
        where: { studyId_rotationCode: { rotationCode: string; studyId: string } };
      }) {
        const target = rotationPlans.find(
          (item) =>
            item.rotationCode === args.where.studyId_rotationCode.rotationCode &&
            item.studyId === args.where.studyId_rotationCode.studyId
        );

        if (target) {
          Object.assign(target, args.update);
          return { id: target.id };
        }

        const record = { ...args.create, id: `rotation-plan-${rotationPlans.length + 1}` };
        rotationPlans.push(record);
        return { id: record.id };
      }
    },
    rotationPlanArm: {
      async createMany(args: { data: typeof rotationPlanArms }) {
        rotationPlanArms.push(...args.data);
        return { count: args.data.length };
      },
      async deleteMany(args: { where: { rotationPlanId: string } }) {
        const retained = rotationPlanArms.filter((item) => item.rotationPlanId !== args.where.rotationPlanId);
        const count = rotationPlanArms.length - retained.length;
        rotationPlanArms.splice(0, rotationPlanArms.length, ...retained);
        return { count };
      }
    },
    reminderLog: {
      async create(args: {
        data: {
          channel: string;
          metadataJson: unknown;
          participantActivityId: string;
          scheduledFor: Date;
          status: string;
        };
        select?: { id: true };
      }) {
        const record = {
          ...args.data,
          id: `reminder-${reminderLogs.length + 1}`,
          sentAt: null
        };
        reminderLogs.push(record);
        return args.select ? { id: record.id } : record;
      },
      async deleteMany(args: { where: { participantActivityId: { in: string[] } } }) {
        return deleteWhere(reminderLogs, (log) => args.where.participantActivityId.in.includes(log.participantActivityId));
      },
      async update(args: {
        data: {
          metadataJson?: unknown;
          sentAt?: Date | null;
          status?: string;
        };
        where: { id: string };
      }) {
        const target = reminderLogs.find((log) => log.id === args.where.id);
        if (!target) {
          throw new Error("reminder not found");
        }
        Object.assign(target, args.data);
        return target;
      }
    },
    researchResponse: {
      async deleteMany(args: { where: { participantActivityId: { in: string[] } } }) {
        return deleteWhere(researchResponses, (response) =>
          args.where.participantActivityId.in.includes(response.participantActivityId)
        );
      }
    },
    mediaEvidencePlaceholder: {
      async deleteMany(args: { where: { participantActivityId: { in: string[] } } }) {
        return deleteWhere(mediaEvidencePlaceholders, (placeholder) =>
          args.where.participantActivityId.in.includes(placeholder.participantActivityId)
        );
      }
    },
    applicationTimeEvent: {
      async create(args: { data: { studyParticipantId: string } }) {
        const record = { id: `application-time-event-${applicationTimeEvents.length + 1}`, studyParticipantId: args.data.studyParticipantId };
        applicationTimeEvents.push(record);
        return record;
      },
      async deleteMany(args: { where: { studyParticipantId: string } }) {
        return deleteWhere(applicationTimeEvents, (event) => event.studyParticipantId === args.where.studyParticipantId);
      }
    },
    screeningAnswer: {
      async deleteMany(args: { where: { screeningAttemptId: string } }) {
        return deleteWhere(screeningAnswers, (answer) => answer.screeningAttemptId === args.where.screeningAttemptId);
      }
    },
    screeningAttempt: {
      async create(args: {
        data: Omit<(typeof screeningAttempts)[number], "id">;
        select: { id: true };
      }) {
        const record = { ...args.data, id: `attempt-${screeningAttempts.length + 1}` };
        screeningAttempts.push(record);
        return { id: record.id };
      },
      async deleteMany(args: { where: { id: string } }) {
        return deleteWhere(screeningAttempts, (attempt) => attempt.id === args.where.id);
      },
      async findMany(args: { where: { id: { not: string }; studyParticipantId: string } }) {
        return screeningAttempts.filter(
          (attempt) => attempt.studyParticipantId === args.where.studyParticipantId && attempt.id !== args.where.id.not
        );
      }
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === study.id ? study : null;
      }
    },
    studyArm: {
      async create(args: { data: Omit<(typeof arms)[number], "id">; select: { id: true } }) {
        if (
          failStudyArmCreateUnique ||
          arms.some((arm) => arm.studyId === args.data.studyId && arm.sortOrder === args.data.sortOrder)
        ) {
          throw { code: "P2002", message: "Unique constraint failed on the fields: (`studyId`, `sortOrder`)" };
        }

        const record = { ...args.data, id: `arm-${arms.length + 1}` };
        arms.push(record);
        return { id: record.id };
      },
      async findFirst(args: { where: { code?: string; sortOrder?: number; studyId: string }; select?: { id: true; sortOrder: true } }) {
        return (
          arms.find(
            (arm) =>
              arm.studyId === args.where.studyId &&
              (args.where.code === undefined || arm.code === args.where.code) &&
              (args.where.sortOrder === undefined || arm.sortOrder === args.where.sortOrder)
          ) ?? null
        );
      },
      async findMany(args: { where: { studyId: string } }) {
        return [...arms].filter((arm) => arm.studyId === args.where.studyId).sort((left, right) => right.sortOrder - left.sortOrder);
      },
      async update(args: { data: Partial<(typeof arms)[number]>; where: { id: string } }) {
        const target = arms.find((arm) => arm.id === args.where.id);
        if (!target) {
          throw new Error("arm not found");
        }
        Object.assign(target, args.data);
        return { id: target.id };
      }
    },
    studyParticipant: {
      async create(args: { data: Omit<(typeof studyParticipants)[number], "id" | "applicationStartedAt"> }) {
        const record = { ...args.data, applicationStartedAt: null, id: `study-participant-${studyParticipants.length + 1}` };
        studyParticipants.push(record);
        return record;
      },
      async findMany(args: {
        orderBy?: unknown;
        where: {
          participantConfirmation?: { isNot: null };
          participantProfileId?: string;
          participantProfile?: { is: { phone: { in: string[] } } };
          studyId: string;
        };
      }) {
        if (failExistingLookup) {
          throw new Error("study participant lookup failed");
        }

        if (args.where.participantConfirmation) {
          return studyParticipants
            .filter((item) => item.studyId === args.where.studyId)
            .filter((item) => confirmations.some((confirmation) => confirmation.studyParticipantId === item.id))
            .sort((left, right) => {
              const leftConfirmation = confirmations.find((confirmation) => confirmation.studyParticipantId === left.id);
              const rightConfirmation = confirmations.find((confirmation) => confirmation.studyParticipantId === right.id);
              return (leftConfirmation?.folioSequence ?? 0) - (rightConfirmation?.folioSequence ?? 0);
            })
            .map((item) => buildParticipantRecord(item.id));
        }

        if (args.where.participantProfileId) {
          return studyParticipants
            .filter(
              (item) =>
                (args.where.studyId === undefined || item.studyId === args.where.studyId) &&
                item.participantProfileId === args.where.participantProfileId
            )
            .map((item) => buildParticipantRecord(item.id));
        }

        const phones = args.where.participantProfile?.is.phone.in ?? [];
        return studyParticipants
          .filter((item) => {
            const profile = participantProfiles.find((candidate) => candidate.id === item.participantProfileId);
            return item.studyId === args.where.studyId && Boolean(profile?.phone && phones.includes(profile.phone));
          })
          .map((item) => buildParticipantRecord(item.id));
      },
      async findUnique(args: {
        where: { id?: string; participantProfileId_studyId?: { participantProfileId: string; studyId: string } };
      }) {
        const found =
          args.where.id
            ? studyParticipants.find((item) => item.id === args.where.id)
            : studyParticipants.find(
                (item) =>
                  item.participantProfileId === args.where.participantProfileId_studyId?.participantProfileId &&
                  item.studyId === args.where.participantProfileId_studyId?.studyId
              );

        return found ? buildParticipantRecord(found.id) : null;
      },
      async update(args: { data: Partial<(typeof studyParticipants)[number]>; where: { id: string } }) {
        const target = studyParticipants.find((item) => item.id === args.where.id);
        if (!target) {
          throw new Error("study participant not found");
        }
        Object.assign(target, args.data);
        return target;
      },
      async deleteMany(args: { where: { id: string } }) {
        return deleteWhere(studyParticipants, (participant) => participant.id === args.where.id);
      }
    },
    studyProduct: {
      async findMany(args: { where: { studyId: string } }) {
        return products
          .filter((product) => product.studyId === args.where.studyId)
          .sort((left, right) => left.internalCode.localeCompare(right.internalCode));
      },
      async upsert(args: {
        create: Omit<(typeof products)[number], "id">;
        update: Partial<(typeof products)[number]>;
        where: { studyId_internalCode: { internalCode: string; studyId: string } };
      }) {
        if (failStudyProductUpsert) {
          throw { code: "P2002", message: "duplicate key in study product upsert" };
        }

        const target = products.find(
          (item) =>
            item.internalCode === args.where.studyId_internalCode.internalCode &&
            item.studyId === args.where.studyId_internalCode.studyId
        );

        if (target) {
          Object.assign(target, args.update);
          return { id: target.id };
        }

        const record = { ...args.create, id: `product-${products.length + 1}` };
        products.push(record);
        return { id: record.id };
      }
    }
  };

  const prisma = {
    ...tx,
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      return callback(tx);
    }
  };

  return {
    accessTokens,
    applicationTimeEvents,
    activities,
    armAssignments,
    arms,
    confirmations,
    ctlSessions,
    mediaEvidencePlaceholders,
    participantActivityEvidence,
    participantAttributeOrders,
    participantConsents,
    participantEvidence,
    participantProfiles,
    participantScreeningReviews,
    prisma,
    products,
    quotaEvaluations,
    referenceCodes,
    reminderLogs,
    researchResponses,
    rotationAssignments,
    rotationPlanArms,
    rotationPlans,
    schedules,
    screeningAnswers,
    screeningAttempts,
    study,
    studyParticipants
  };
}

function seedDueNavigoReminderActivity(
  state: ReturnType<typeof createNavigoParticipantImportState>,
  activityCode: "T3_HORAS" | "T4_5_HORAS" | "T6_HORAS",
  availableFrom: Date
) {
  const participantId = state.studyParticipants[0]?.id ?? seedApprovedFieldParticipantForNavigo(state);
  const schedule = {
    code: activityCode,
    id: `schedule-${activityCode}`,
    offsetMinutes: activityCode === "T3_HORAS" ? 180 : activityCode === "T4_5_HORAS" ? 270 : 360,
    questionnaireVersionId: "questionnaire-active-1",
    sortOrder: state.schedules.length + 1,
    status: "ACTIVE" as const,
    studyId: state.study.id,
    type: "QUESTIONNAIRE_MEASUREMENT" as const,
    windowEndsMinutes: 420,
    windowStartsMinutes: -30
  };
  state.schedules.push(schedule as never);
  if (!state.accessTokens.some((token) => token.id === "token-reminder")) {
    state.accessTokens.push({
      createdByUserId: "admin-1",
      expiresAt: new Date("2026-08-15T09:00:00.000Z"),
      id: "token-reminder",
      status: "ACTIVE",
      studyParticipantId: participantId,
      tokenHash: hashToken("token-reminder")
    });
  }
  state.activities.push({
    activityScheduleId: schedule.id,
    actualCompletedAt: null,
    actualStartedAt: null,
    availableFrom,
    availableUntil: new Date(availableFrom.getTime() + 4 * 60 * 60 * 1000),
    id: `activity-${activityCode}`,
    occurrenceKey: "DEFAULT",
    scheduledAt: availableFrom,
    status: "AVAILABLE",
    studyParticipantId: participantId
  });
}

function createFakeNavigoWhatsAppRepository(): {
  conversations: Array<{ id: string; linkedParticipantId: string | null; linkedStudyId: string | null; phoneNumber: string }>;
  messages: OneuiWhatsAppMessageRecord[];
  repository: OneuiWhatsAppRepository;
} {
  const conversations: Array<{ id: string; linkedParticipantId: string | null; linkedStudyId: string | null; phoneNumber: string }> = [];
  const messages: OneuiWhatsAppMessageRecord[] = [];
  const repository: OneuiWhatsAppRepository = {
    async createOutboundMessage(input) {
      const message = createFakeWhatsAppMessage({
        bodyText: input.bodyText,
        conversationId: input.conversationId,
        fromPhone: input.fromPhone,
        id: `message-${messages.length + 1}`,
        rawPayload: input.rawPayload,
        timestamp: input.timestamp,
        toPhone: input.toPhone
      });
      messages.push(message);
      return message;
    },
    async findLatestOutboundTemplateMessage() {
      return null;
    },
    async getConversationWithMessages() {
      return null;
    },
    async listConversations() {
      return [];
    },
    async markOutboundMessageAccepted(input) {
      const message = messages.find((candidate) => candidate.id === input.messageId);
      if (!message) {
        throw new Error("message not found");
      }
      Object.assign(message, {
        metaMessageId: input.metaMessageId,
        rawPayload: input.rawPayload,
        status: input.status,
        timestamp: input.timestamp,
        updatedAt: input.timestamp
      });
      return message;
    },
    async markOutboundMessageFailed(input) {
      const message = messages.find((candidate) => candidate.id === input.messageId);
      if (!message) {
        throw new Error("message not found");
      }
      Object.assign(message, {
        rawPayload: input.rawPayload,
        status: input.status
      });
      return message;
    },
    async saveInboundMessage() {
      throw new Error("not implemented");
    },
    async saveStatusEvent() {
      throw new Error("not implemented");
    },
    async upsertInboundConversation() {
      throw new Error("not implemented");
    },
    async upsertOutboundConversation(input) {
      let conversation = conversations.find((candidate) => candidate.phoneNumber === input.phoneNumber);
      if (!conversation) {
        conversation = {
          id: `conversation-${conversations.length + 1}`,
          linkedParticipantId: input.linkedParticipantId ?? null,
          linkedStudyId: input.linkedStudyId ?? null,
          phoneNumber: input.phoneNumber
        };
        conversations.push(conversation);
      }
      return {
        createdAt: new Date("2026-08-08T09:00:00.000Z"),
        id: conversation.id,
        lastInboundAt: null,
        lastMessageAt: null,
        lastOutboundAt: null,
        linkedParticipantId: conversation.linkedParticipantId,
        linkedStudyId: conversation.linkedStudyId,
        phoneNumber: conversation.phoneNumber,
        profileName: input.profileName ?? null,
        sourceModule: input.sourceModule,
        updatedAt: new Date("2026-08-08T09:00:00.000Z"),
        waId: input.waId
      };
    }
  };

  return { conversations, messages, repository };
}

function createFakeWhatsAppMessage(input: {
  bodyText: string;
  conversationId: string;
  fromPhone: string;
  id: string;
  rawPayload: unknown;
  timestamp: Date;
  toPhone: string;
}): OneuiWhatsAppMessageRecord {
  return {
    bodyText: input.bodyText,
    conversationId: input.conversationId,
    createdAt: input.timestamp,
    direction: "OUTBOUND",
    fromPhone: input.fromPhone,
    id: input.id,
    messageType: "template",
    metaMessageId: null,
    rawPayload: input.rawPayload,
    status: "pending",
    timestamp: input.timestamp,
    toPhone: input.toPhone,
    updatedAt: input.timestamp
  };
}

function seedRotationWorkbookParticipant(
  state: ReturnType<typeof createNavigoRotationImportState>,
  folio: string
) {
  const sequence = state.participants.length + 1;
  const participant = {
    ...state.participant,
    ctlTriangularRotationAssignment: null,
    id: `study-participant-${sequence}`,
    participantConfirmation: {
      ...state.participant.participantConfirmation,
      folio,
      id: `confirmation-${sequence}`,
      referenceCodes: [
        { code: `CODE-${sequence}-1`, slot: 1 },
        { code: `CODE-${sequence}-2`, slot: 2 },
        { code: `CODE-${sequence}-3`, slot: 3 }
      ],
      screeningAttempt: {
        ...state.participant.participantConfirmation.screeningAttempt,
        id: `attempt-${sequence}`
      }
    },
    participantProfile: {
      ...state.participant.participantProfile,
      id: `profile-${sequence}`,
      name: `Participante ${sequence}`
    },
    rotationAssignment: null
  };
  state.participants.push(participant);

  return participant;
}

function createRotationWorkbookRow(folio: string, index: number): NavigoRotationWorkbookRowInput {
  return {
    folio,
    primeraFragancia: index % 2 === 0 ? "247" : "583",
    segundaFragancia: index % 2 === 0 ? "583" : "247",
    triangular1Pr1: `PR1-${index}`,
    triangular1Pr2: `PR2-${index}`,
    triangular1Pr3: `PR3-${index}`,
    triangular1Verify: `PR2-${index}`,
    triangular2Pr1: `PR4-${index}`,
    triangular2Pr2: `PR5-${index}`,
    triangular2Pr3: `PR6-${index}`,
    triangular2Verify: `PR5-${index}`
  };
}

function createNavigoRotationImportState({
  failProductUpsert = false,
  failArmAssignmentForParticipantId = null,
  hutAccessAnswer = NAVIGO_HUT_ACCESS_YES_VALUE,
  participantFolio = "NAV-001"
}: {
  failArmAssignmentForParticipantId?: string | null;
  failProductUpsert?: boolean;
  hutAccessAnswer?: string;
  participantFolio?: string;
} = {}) {
  const study = {
    code: NAVIGO_STUDY_CODE,
    id: "study-navigo",
    name: "Fragancia Masculina",
    status: "ACTIVE" as const,
    timeZoneIana: "America/Mexico_City"
  };
  const participant = {
    accessTokens: [],
    activities: [],
    applicationStartedAt: null as Date | null,
    ctlTriangularRotationAssignment: null as null | {
      id: string;
      triangular1Pr1: string;
      triangular1Pr2: string;
      triangular1Pr3: string;
      triangular1Verify: string;
      triangular2Pr1: string;
      triangular2Pr2: string;
      triangular2Pr3: string;
      triangular2Verify: string;
    },
    id: "study-participant-1",
    participantConfirmation: {
      id: "confirmation-1",
      folio: participantFolio,
      referenceCodes: [
        { code: "CODE-1", slot: 1 },
        { code: "CODE-2", slot: 2 },
        { code: "CODE-3", slot: 3 }
      ],
      screeningAttempt: {
        answers: [
          {
            answerJson: hutAccessAnswer,
            questionId: NAVIGO_HUT_ACCESS_QUESTION_ID
          }
        ],
        evaluationJson: null,
        id: "attempt-1",
        source: "FIELD"
      }
    },
    participantEvidence: [],
    participantProfile: {
      email: null,
      id: "profile-1",
      name: "Participante Uno",
      participantAuthUserId: null,
      phone: null
    },
    participantScreeningReviews: [{ status: "APPROVED" as const }],
    rotationAssignment: null as null | {
      arms: Array<{
        applicationOrder: number;
        participantVisibleLabel: string;
        studyArm: { code: string; label: string; sortOrder: number };
        studyProduct: { displayLabel: string; id: string; internalCode: string };
      }>;
      rotationCode: string;
    },
    screeningStatus: "PASSED" as const,
    study,
    visualVerificationMode: null
  };
  const participants = [participant];
  const arms: Array<{ code: string; id: string; label: string; sortOrder: number; studyId: string }> = [];
  const products: Array<{
    displayLabel: string;
    id: string;
    internalCode: string;
    isSensitive: boolean;
    realName: string;
    studyId: string;
  }> = [];
  const rotationPlans: Array<{ id: string; name: string; rotationCode: string; status?: string; studyId: string }> = [];
  const rotationPlanArms: Array<{
    applicationOrder: number;
    participantVisibleLabel: string;
    rotationPlanId: string;
    studyArmId: string;
    studyProductId: string;
  }> = [];
  const rotationAssignments: Array<{
    id: string;
    rotationCode: string;
    rotationPlanId: string;
    studyParticipantId: string;
  }> = [];
  const armAssignments: Array<{
    applicationOrder: number;
    id: string;
    participantRotationAssignmentId: string;
    participantVisibleLabel: string;
    studyArmId: string;
    studyParticipantId: string;
    studyProductId: string;
  }> = [];
  const ctlTriangularRotationAssignments: Array<{
    id: string;
    importedAt?: Date;
    importedByUserId: string | null;
    sourceFileName: string | null;
    studyParticipantId: string;
    triangular1Pr1: string;
    triangular1Pr2: string;
    triangular1Pr3: string;
    triangular1Verify: string;
    triangular2Pr1: string;
    triangular2Pr2: string;
    triangular2Pr3: string;
    triangular2Verify: string;
  }> = [];
  const hutParticipants: Array<{
    blocks: Array<{ status: string; submittedVideosCount: number }>;
    callEvaluations: Array<{ completedAt: Date | null; status: string }>;
    dailyChecks: Array<{ id: string }>;
    email: string | null;
    firstFragranceLeftArm: string | null;
    folio: string | null;
    id: string;
    name: string;
    origin: "CLT_HUT" | "HUT_DIRECTO";
    phone: string | null;
    phaseCodes: Array<{ id: string; phase: string; slot: number; status: string }>;
    protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
    secondFragranceRightArm: string | null;
    status: string;
    studyId: string;
    studyParticipantId: string | null;
    token: string;
    videoSubmissions: Array<{ id: string }>;
  }> = [];
  const hutRegistrationSlots: Array<{
    firstFragranceLeftArm: string;
    folio: string;
    id: string;
    participantId: string | null;
    registrationToken: string;
    secondFragranceRightArm: string;
    status: string;
    studyId: string;
  }> = [];
  const hutParticipantPhaseCodes: Array<{
    codeHash: string;
    encryptedCode: string;
    encryptionVersion: number;
    id: string;
    participantId: string;
    phase: string;
    slot: number;
    status: string;
  }> = [];

  function syncParticipantRotation(studyParticipantId = participant.id) {
    const targetParticipant = participants.find((candidate) => candidate.id === studyParticipantId);
    if (!targetParticipant) {
      return;
    }
    const assignment = rotationAssignments.find((candidate) => candidate.studyParticipantId === targetParticipant.id) ?? null;

    if (!assignment) {
      targetParticipant.rotationAssignment = null;
      return;
    }

    targetParticipant.rotationAssignment = {
      arms: armAssignments
        .filter((armAssignment) => armAssignment.participantRotationAssignmentId === assignment.id)
        .sort((left, right) => left.applicationOrder - right.applicationOrder)
        .map((armAssignment) => {
          const arm = arms.find((candidate) => candidate.id === armAssignment.studyArmId);
          const product = products.find((candidate) => candidate.id === armAssignment.studyProductId);

          if (!arm || !product) {
            throw new Error("test fixture missing rotation relation");
          }

          return {
            applicationOrder: armAssignment.applicationOrder,
            participantVisibleLabel: armAssignment.participantVisibleLabel,
            studyArm: { code: arm.code, label: arm.label, sortOrder: arm.sortOrder },
            studyProduct: {
              displayLabel: product.displayLabel,
              id: product.id,
              internalCode: product.internalCode
            }
          };
        }),
      rotationCode: assignment.rotationCode
    };
  }

  function syncCtlTriangularRotation(studyParticipantId = participant.id) {
    const targetParticipant = participants.find((candidate) => candidate.id === studyParticipantId);
    if (!targetParticipant) {
      return;
    }
    targetParticipant.ctlTriangularRotationAssignment =
      ctlTriangularRotationAssignments.find((assignment) => assignment.studyParticipantId === targetParticipant.id) ?? null;
  }

  const tx = {
    ctlTriangularRotationAssignment: {
      async upsert(args: {
        create: Omit<(typeof ctlTriangularRotationAssignments)[number], "id">;
        update: Partial<(typeof ctlTriangularRotationAssignments)[number]>;
        where: { studyParticipantId: string };
      }) {
        const target = ctlTriangularRotationAssignments.find(
          (assignment) => assignment.studyParticipantId === args.where.studyParticipantId
        );

        if (target) {
          Object.assign(target, args.update);
          syncCtlTriangularRotation(args.where.studyParticipantId);
          return target;
        }

        const record = { ...args.create, id: `ctl-triangular-${ctlTriangularRotationAssignments.length + 1}` };
        ctlTriangularRotationAssignments.push(record);
        syncCtlTriangularRotation(args.where.studyParticipantId);
        return record;
      }
    },
    hutBlock: {
      async create(args: { data: { participantId: string; status: string; submittedVideosCount?: number } }) {
        const target = hutParticipants.find((item) => item.id === args.data.participantId);
        target?.blocks.push({
          status: args.data.status,
          submittedVideosCount: args.data.submittedVideosCount ?? 0
        });
        return { id: `hut-block-${target?.blocks.length ?? 1}` };
      }
    },
    hutCallEvaluation: {
      async create(args: { data: { completedAt?: Date | null; participantId: string; status: string } }) {
        const target = hutParticipants.find((item) => item.id === args.data.participantId);
        target?.callEvaluations.push({
          completedAt: args.data.completedAt ?? null,
          status: args.data.status
        });
        return { id: `hut-call-${target?.callEvaluations.length ?? 1}` };
      }
    },
    hutParticipant: {
      async create(args: {
        data: Omit<(typeof hutParticipants)[number], "blocks" | "callEvaluations" | "dailyChecks" | "id" | "phaseCodes" | "videoSubmissions">;
      }) {
        const record = {
          ...args.data,
          blocks: [],
          callEvaluations: [],
          dailyChecks: [],
          id: `hut-participant-${hutParticipants.length + 1}`,
          phaseCodes: [],
          videoSubmissions: []
        };
        hutParticipants.push(record);
        return record;
      },
      async findFirst(args: { where: { folio?: string; studyId: string; studyParticipantId?: string } }) {
        return (
          hutParticipants.find(
            (item) =>
              item.studyId === args.where.studyId &&
              (args.where.folio === undefined || item.folio === args.where.folio) &&
              (args.where.studyParticipantId === undefined || item.studyParticipantId === args.where.studyParticipantId)
          ) ?? null
        );
      },
      async findMany(args: { where: { folio: { in: string[] }; studyId: string } }) {
        return hutParticipants.filter((item) => item.studyId === args.where.studyId && item.folio && args.where.folio.in.includes(item.folio));
      },
      async update(args: { data: Partial<(typeof hutParticipants)[number]>; where: { id: string } }) {
        const target = hutParticipants.find((item) => item.id === args.where.id);
        if (!target) {
          throw new Error("hut participant not found");
        }
        Object.assign(target, args.data);
        return target;
      }
    },
    hutParticipantPhaseCode: {
      async create(args: { data: Omit<(typeof hutParticipantPhaseCodes)[number], "id"> }) {
        const record = { ...args.data, id: `hut-phase-code-${hutParticipantPhaseCodes.length + 1}` };
        hutParticipantPhaseCodes.push(record);
        const participantRecord = hutParticipants.find((item) => item.id === record.participantId);
        participantRecord?.phaseCodes.push({
          id: record.id,
          phase: record.phase,
          slot: record.slot,
          status: record.status
        });
        return record;
      }
    },
    hutRegistrationSlot: {
      async create(args: { data: Omit<(typeof hutRegistrationSlots)[number], "id"> }) {
        const record = { ...args.data, id: `hut-slot-${hutRegistrationSlots.length + 1}` };
        hutRegistrationSlots.push(record);
        return record;
      },
      async findMany(args: { where: { folio: { in: string[] }; studyId: string } }) {
        return hutRegistrationSlots.filter((item) => item.studyId === args.where.studyId && args.where.folio.in.includes(item.folio));
      },
      async findUnique(args: { where: { studyId_folio: { folio: string; studyId: string } } }) {
        return (
          hutRegistrationSlots.find(
            (item) =>
              item.studyId === args.where.studyId_folio.studyId &&
              item.folio === args.where.studyId_folio.folio
          ) ?? null
        );
      },
      async update(args: { data: Partial<(typeof hutRegistrationSlots)[number]>; where: { id: string } }) {
        const target = hutRegistrationSlots.find((item) => item.id === args.where.id);
        if (!target) {
          throw new Error("hut slot not found");
        }
        Object.assign(target, args.data);
        return target;
      }
    },
    participantArmAssignment: {
      async upsert(args: {
        create: Omit<(typeof armAssignments)[number], "id">;
        update: Partial<(typeof armAssignments)[number]>;
        where: { studyParticipantId_studyArmId: { studyArmId: string; studyParticipantId: string } };
      }) {
        if (args.where.studyParticipantId_studyArmId.studyParticipantId === failArmAssignmentForParticipantId) {
          throw { code: "P2028", message: "A query cannot be executed on an expired transaction." };
        }

        const target = armAssignments.find(
          (assignment) =>
            assignment.studyArmId === args.where.studyParticipantId_studyArmId.studyArmId &&
            assignment.studyParticipantId === args.where.studyParticipantId_studyArmId.studyParticipantId
        );

        if (target) {
          Object.assign(target, args.update);
          syncParticipantRotation(args.where.studyParticipantId_studyArmId.studyParticipantId);
          return target;
        }

        const record = { ...args.create, id: `arm-assignment-${armAssignments.length + 1}` };
        armAssignments.push(record);
        syncParticipantRotation(args.where.studyParticipantId_studyArmId.studyParticipantId);
        return record;
      }
    },
    participantConfirmation: {
      async findMany(args: { where: { folio: { in: string[] }; studyId: string } }) {
        if (args.where.studyId !== study.id) {
          return [];
        }

        return participants
          .filter((candidate) => args.where.folio.in.includes(candidate.participantConfirmation.folio))
          .map((candidate) => {
            syncParticipantRotation(candidate.id);
            syncCtlTriangularRotation(candidate.id);
            return {
              folio: candidate.participantConfirmation.folio,
              studyParticipant: candidate
            };
          });
      }
    },
    participantRotationAssignment: {
      async upsert(args: {
        create: {
          rotationCode: string;
          rotationPlanId: string;
          studyParticipantId: string;
        };
        update: {
          rotationCode: string;
          rotationPlanId: string;
        };
        where: { studyParticipantId: string };
      }) {
        const target = rotationAssignments.find(
          (assignment) => assignment.studyParticipantId === args.where.studyParticipantId
        );

        if (target) {
          Object.assign(target, args.update);
          syncParticipantRotation(args.where.studyParticipantId);
          return { id: target.id };
        }

        const record = { ...args.create, id: `rotation-assignment-${rotationAssignments.length + 1}` };
        rotationAssignments.push(record);
        syncParticipantRotation(args.where.studyParticipantId);
        return { id: record.id };
      }
    },
    rotationPlan: {
      async findMany(args: { where: { status?: string; studyId: string } }) {
        return rotationPlans
          .filter(
            (plan) =>
              plan.studyId === args.where.studyId &&
              (args.where.status === undefined || (plan as { status?: string }).status === args.where.status)
          )
          .sort((left, right) => left.rotationCode.localeCompare(right.rotationCode))
          .map((plan) => ({
            arms: rotationPlanArms
              .filter((arm) => arm.rotationPlanId === plan.id)
              .sort((left, right) => left.applicationOrder - right.applicationOrder)
              .map((arm) => {
                const product = products.find((candidate) => candidate.id === arm.studyProductId);
                return {
                  applicationOrder: arm.applicationOrder,
                  participantVisibleLabel: arm.participantVisibleLabel,
                  studyProduct: { internalCode: product?.internalCode ?? "" }
                };
              }),
            name: plan.name,
            rotationCode: plan.rotationCode
          }));
      },
      async upsert(args: {
        create: {
          name: string;
          rotationCode: string;
          studyId: string;
        };
        update: {
          name: string;
        };
        where: { studyId_rotationCode: { rotationCode: string; studyId: string } };
      }) {
        const target = rotationPlans.find(
          (plan) =>
            plan.rotationCode === args.where.studyId_rotationCode.rotationCode &&
            plan.studyId === args.where.studyId_rotationCode.studyId
        );

        if (target) {
          Object.assign(target, args.update);
          return { id: target.id };
        }

        const record = { ...args.create, id: `rotation-plan-${rotationPlans.length + 1}` };
        rotationPlans.push(record);
        return { id: record.id };
      }
    },
    rotationPlanArm: {
      async createMany(args: { data: typeof rotationPlanArms }) {
        rotationPlanArms.push(...args.data);
        return { count: args.data.length };
      },
      async deleteMany(args: { where: { rotationPlanId: string } }) {
        const retained = rotationPlanArms.filter((arm) => arm.rotationPlanId !== args.where.rotationPlanId);
        const count = rotationPlanArms.length - retained.length;
        rotationPlanArms.splice(0, rotationPlanArms.length, ...retained);
        return { count };
      }
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === study.id ? study : null;
      }
    },
    studyArm: {
      async create(args: { data: Omit<(typeof arms)[number], "id"> }) {
        const record = { ...args.data, id: `arm-${arms.length + 1}` };
        arms.push(record);
        return { id: record.id };
      },
      async findFirst(args: { where: { code?: string; sortOrder?: number; studyId: string } }) {
        return (
          arms.find(
            (arm) =>
              arm.studyId === args.where.studyId &&
              (args.where.code === undefined || arm.code === args.where.code) &&
              (args.where.sortOrder === undefined || arm.sortOrder === args.where.sortOrder)
          ) ?? null
        );
      },
      async findMany(args: { where: { studyId: string } }) {
        return [...arms].filter((arm) => arm.studyId === args.where.studyId).sort((left, right) => right.sortOrder - left.sortOrder);
      },
      async update(args: { data: Partial<(typeof arms)[number]>; where: { id: string } }) {
        const target = arms.find((arm) => arm.id === args.where.id);
        if (!target) {
          throw new Error("arm not found");
        }
        Object.assign(target, args.data);
        return { id: target.id };
      }
    },
    studyProduct: {
      async findMany(args: { where: { studyId: string } }) {
        return products
          .filter((product) => product.studyId === args.where.studyId)
          .sort((left, right) => left.internalCode.localeCompare(right.internalCode));
      },
      async upsert(args: {
        create: Omit<(typeof products)[number], "id">;
        update: Partial<(typeof products)[number]>;
        where: { studyId_internalCode: { internalCode: string; studyId: string } };
      }) {
        if (failProductUpsert) {
          throw { code: "P2002", message: "duplicate sensitive database detail" };
        }

        const target = products.find(
          (product) =>
            product.internalCode === args.where.studyId_internalCode.internalCode &&
            product.studyId === args.where.studyId_internalCode.studyId
        );

        if (target) {
          Object.assign(target, args.update);
          return { id: target.id };
        }

        const record = { ...args.create, id: `product-${products.length + 1}` };
        products.push(record);
        return { id: record.id };
      }
    }
  };

  let transactionCount = 0;
  const prisma = {
    ...tx,
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      transactionCount += 1;
      return callback(tx);
    }
  };

  return {
    armAssignments,
    arms,
    ctlTriangularRotationAssignments,
    hutParticipantPhaseCodes,
    hutParticipants,
    hutRegistrationSlots,
    participant,
    participants,
    prisma,
    products,
    rotationAssignments,
    rotationPlanArms,
    rotationPlans,
    study,
    get transactionCount() {
      return transactionCount;
    }
  };
}

function readWorkspaceFile(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

function createMinimalRotationWorkbook({
  cltFolio = "1",
  hutFolio = "1"
}: {
  cltFolio?: string;
  hutFolio?: string;
} = {}): Buffer {
  const cltFolioCell = /^\d+$/.test(cltFolio)
    ? `<c r="A3"><v>${cltFolio}</v></c>`
    : `<c r="A3" t="inlineStr"><is><t>${cltFolio}</t></is></c>`;
  const hutFolioCell = /^\d+$/.test(hutFolio)
    ? `<c r="A2"><v>${hutFolio}</v></c>`
    : `<c r="A2" t="inlineStr"><is><t>${hutFolio}</t></is></c>`;
  const files = new Map([
    [
      "xl/workbook.xml",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<sheets><sheet name="CLT" sheetId="1" r:id="rId1"/><sheet name="HUT" sheetId="2" r:id="rId2"/></sheets>',
        "</workbook>"
      ].join("")
    ],
    [
      "xl/_rels/workbook.xml.rels",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>',
        "</Relationships>"
      ].join("")
    ],
    [
      "xl/worksheets/sheet1.xml",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<sheetData>",
        '<row r="1"><c r="A1" t="inlineStr"><is><t>FOLIO</t></is></c></row>',
        [
          '<row r="2">',
          '<c r="B2" t="inlineStr"><is><t>PR1</t></is></c>',
          '<c r="C2" t="inlineStr"><is><t>PR2</t></is></c>',
          '<c r="D2" t="inlineStr"><is><t>PR3</t></is></c>',
          '<c r="E2" t="inlineStr"><is><t>VERI_1</t></is></c>',
          '<c r="F2" t="inlineStr"><is><t>PR4</t></is></c>',
          '<c r="G2" t="inlineStr"><is><t>PR5</t></is></c>',
          '<c r="H2" t="inlineStr"><is><t>PR6</t></is></c>',
          '<c r="I2" t="inlineStr"><is><t>VERI_2</t></is></c>',
          '<c r="J2" t="inlineStr"><is><t>EVA1</t></is></c>',
          '<c r="K2" t="inlineStr"><is><t>EVA2</t></is></c>',
          "</row>"
        ].join(""),
        [
          '<row r="3">',
          cltFolioCell,
          '<c r="B3" t="inlineStr"><is><t>K-247</t></is></c>',
          '<c r="C3" t="inlineStr"><is><t>0-472</t></is></c>',
          '<c r="D3" t="inlineStr"><is><t>H-358</t></is></c>',
          '<c r="E3" t="inlineStr"><is><t>H-358</t></is></c>',
          '<c r="F3" t="inlineStr"><is><t>G-835</t></is></c>',
          '<c r="G3" t="inlineStr"><is><t>Z-724</t></is></c>',
          '<c r="H3" t="inlineStr"><is><t>C-583</t></is></c>',
          '<c r="I3" t="inlineStr"><is><t>Z-724</t></is></c>',
          '<c r="J3"><v>247</v></c>',
          '<c r="K3"><v>583</v></c>',
          "</row>"
        ].join(""),
        "</sheetData></worksheet>"
      ].join("")
    ],
    [
      "xl/worksheets/sheet2.xml",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<sheetData>",
        [
          '<row r="1">',
          '<c r="A1" t="inlineStr"><is><t>FOLIO</t></is></c>',
          '<c r="B1" t="inlineStr"><is><t>EVA1</t></is></c>',
          '<c r="C1" t="inlineStr"><is><t>EVA2</t></is></c>',
          "</row>"
        ].join(""),
        [
          '<row r="2">',
          hutFolioCell,
          '<c r="B2"><v>901</v></c>',
          '<c r="C2"><v>902</v></c>',
          "</row>"
        ].join(""),
        "</sheetData></worksheet>"
      ].join("")
    ]
  ]);

  return createZip(files);
}

function createZip(files: Map<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [filename, text] of files) {
    const filenameBuffer = Buffer.from(filename, "utf8");
    const compressed = deflateRawSync(Buffer.from(text, "utf8"));
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(Buffer.byteLength(text, "utf8"), 22);
    localHeader.writeUInt16LE(filenameBuffer.length, 26);

    localParts.push(localHeader, filenameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(Buffer.byteLength(text, "utf8"), 24);
    centralHeader.writeUInt16LE(filenameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, filenameBuffer);

    offset += localHeader.length + filenameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(files.size, 8);
  endOfCentralDirectory.writeUInt16LE(files.size, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function parseTsv(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n/)
    .filter(Boolean)
    .map((row) => row.split("\t"));
}

