import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
  navigoActivityLabel,
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
  validateNavigoMeasurementAnswers
} from "./index";
import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import {
  appendNavigoTestModeParams,
  createNavigoTestModeParams,
  isValidNavigoTestMode
} from "./test-mode";
import {
  FACE_SIMILARITY_APPROVE_THRESHOLD,
  FACE_SIMILARITY_REJECT_THRESHOLD,
  classifyNavigoFaceSimilarity,
  normalizeNavigoFaceVerificationForStorage
} from "./face-verification-contract";

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

    expect(beforeWindow.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: true,
      reason: "AVAILABLE"
    });
    expect(t4BeforeT2.find((activity) => activity.code === "T4_HORAS")?.availability).toMatchObject({
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

    expect(timeline.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "IDENTITY_REVIEW_REQUIRED"
    });
  });

  it("blocks measurements with pending or rejected identity review and allows approved review", () => {
    const pending = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t2Completed: false, t2IdentityReviewStatus: "PENDING", t2SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });
    const rejected = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t2Completed: false, t2IdentityReviewStatus: "REJECTED", t2SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });
    const approved = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t2Completed: false, t2IdentityReviewStatus: "APPROVED", t2SelfieCount: 1 }),
      now: new Date("2026-06-25T16:40:00.000Z"),
      testMode: true
    });

    expect(pending.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "IDENTITY_REVIEW_REQUIRED"
    });
    expect(rejected.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
      canCapture: false,
      reason: "IDENTITY_REVIEW_REQUIRED"
    });
    expect(approved.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
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
      blockedByCode: "T2_HORAS",
      canCapture: false,
      reason: "PREVIOUS_REQUIRED"
    });
    expect(t8Blocked.find((activity) => activity.code === "T8_HORAS")?.availability).toMatchObject({
      blockedByCode: "T4_HORAS",
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

  it("keeps T2 closed while T0 is not fully completed", () => {
    const timeline = buildNavigoActivityTimeline({
      activities: navigoActivityRecords({ t0Status: "STARTED" }),
      now: new Date("2026-06-25T16:40:00.000Z")
    });

    expect(timeline.find((activity) => activity.code === "T2_HORAS")?.availability).toMatchObject({
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
    expect(navigoActivityLabel("T0_SALON")).toBe("Evaluacion 0 / T0 en salon");
    expect(navigoActivityLabel("T2_HORAS")).toBe("Evaluacion 2 horas");
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
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const participantShell = readWorkspaceFile("src", "shared", "ui", "PublicParticipantShell.tsx");

    expect(readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "_components", "NavigoRotationImportPanel.tsx")).toContain("Importar rotacion");
    expect(adminPage).toContain("Preparacion de rotacion");
    expect(adminPage).toContain("Codigo primera fragancia / brazo izquierdo");
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
    expect(adminPage).toContain("Guardar corrección T0");
    expect(adminPage).toContain("Generar link participante");
    expect(adminPage).toContain("Regenerar link participante");
    expect(adminPage).toContain("Corregir hora base T0");
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

  it("shows T0 in the participant app as the salon capture step", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");

    const capture = readWorkspaceFile("src", "app", "p", "[token]", "activities", "_components", "NavigoActivityCapture.tsx");

    expect(adminPage).toContain("Abrir link para capturar T0 en salón");
    expect(participantPage).toContain("Iniciar evaluación 0 en salón");
    expect(repository).toContain("ensureNavigoT0Activity");
    expect(repository).toContain("createRegisteredSelfiePreview");
    expect(capture).toContain("Verificación visual de identidad");
    expect(capture).toContain("IdentityConfirmation");
    expect(capture).toContain("IdentityIncidentState");
    expect(capture).toContain("confirmNavigoT0IdentityAction");
    expect(capture).toContain("Recuerda oler ambos antebrazos antes de responder.");
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
    expect(adminPage).toContain("Incidencia de identidad: bloquear avance hasta revisión.");
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
    expect(repository).toContain("reviewActivityIdentity");
    expect(repository).toContain("evidence.internalNote");
    expect(actions).toContain("reviewNavigoActivityIdentityAction");
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

  it("keeps T0 form operable and separates correction actions in admin", () => {
    const adminPage = readWorkspaceFile("src", "app", "admin", "studies", "[studyId]", "navigo-app", "page.tsx");
    const actions = readWorkspaceFile("src", "modules", "navigo-app", "actions.ts");
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");

    expect(adminPage).toContain("nowInStudyTimezoneForDateTimeLocal");
    expect(adminPage).not.toContain("toISOString().slice");
    expect(adminPage).toContain("defaultChecked={readAnswerValue(answer)");
    expect(adminPage).toContain("Guardar corrección T0");
    expect(adminPage).toContain("Guardando corrección T0...");
    expect(adminPage).toContain("Acciones de correccion");
    expect(adminPage).toContain("REINICIAR APP");
    expect(adminPage).toContain("ELIMINAR ETAPAS");
    expect(actions).toContain("resetNavigoParticipantAppAction");
    expect(actions).toContain("Selecciona la hora base T0.");
    expect(repository).toContain("NAVIGO_T0_IDENTITY_QUESTION_ID");
    expect(repository).toContain("resetParticipantApp");
    expect(repository).toContain("deleteParticipantStagesFrom");
  });

  it("does not treat T0 as completed only because an application time exists", () => {
    const repository = readWorkspaceFile("src", "modules", "navigo-app", "repository.ts");
    const participantPage = readWorkspaceFile("src", "app", "p", "[token]", "activities", "page.tsx");

    expect(repository).toContain("isNavigoT0Complete");
    expect(repository).toContain("status: isIncompleteT0 ? \"STARTED\" : activity.status");
    expect(participantPage).toContain("Evaluación 0 / T0 en salón");
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
      "folio\tnombre\tcelular\tcorreo\tprimera_fragancia\tsegunda_fragancia\treclutador\tobservaciones"
    );

    const tsv = parseNavigoParticipantImportText({
      filename: "participantes.tsv",
      text: "\uFEFFFolio\tParticipante\tTeléfono\tBrazo izquierdo\tBrazo derecho\tReclutador\nNAV-001\tAna Pérez\t55 1234 5678\t cod-a \t cod-b \t reclutadora"
    });
    const csv = parseNavigoParticipantImportText({
      filename: "participantes.csv",
      text: "FOLIO,Nombre,Celular,Primera fragancia,Segunda fragancia\nNAV-002,Juan Ñunez,5511112222,COD-C,COD-D"
    });

    expect(tsv.ok ? tsv.rows[0] : null).toMatchObject({
      celular: "+525512345678",
      folio: "NAV-001",
      nombre: "ANA PÉREZ",
      primeraFragancia: "COD-A",
      reclutador: "RECLUTADORA",
      segundaFragancia: "COD-B"
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
        "folio\tnombre\tcelular\tcorreo\tprimera_fragancia\tsegunda_fragancia\treclutador\tobservaciones",
        "NAV-010\tPRUEBA UNO\t5512345678\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-011\tPRUEBA DOS\t5598765432\t\tBBB\tAAA\tGABY\tPRUEBA",
        "NAV-012\tPRUEBA TRES\t5685185186\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-013\tPRUEBA CUATRO\t5771604940\t\tBBB\tAAA\tGABY\tPRUEBA",
        "NAV-014\tPRUEBA CINCO\t5858024694\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-015\tPRUEBA SEIS\t5944444448\t\tAAA\tBBB\tGABY\tPRUEBA"
      ].join("\r\n")
    });

    expect(sample.ok).toBe(true);
    expect(sample.ok ? sample.rows : []).toHaveLength(6);
    expect(sample.ok ? sample.rows[0] : null).toMatchObject({
      celular: "+525512345678",
      correo: null,
      folio: "NAV-010",
      nombre: "PRUEBA UNO",
      primeraFragancia: "AAA",
      reclutador: "GABY",
      segundaFragancia: "BBB"
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
        "folio\tnombre\tcelular\tcorreo\tprimera_fragancia\tsegunda_fragancia\treclutador\tobservaciones",
        "NAV-010\tPRUEBA UNO\t5512345678\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-011\tPRUEBA DOS\t5598765432\t\tBBB\tAAA\tGABY\tPRUEBA",
        "NAV-012\tPRUEBA TRES\t5685185186\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-013\tPRUEBA CUATRO\t5771604940\t\tBBB\tAAA\tGABY\tPRUEBA",
        "NAV-014\tPRUEBA CINCO\t5858024694\t\tAAA\tBBB\tGABY\tPRUEBA",
        "NAV-015\tPRUEBA SEIS\t5944444448\t\tAAA\tBBB\tGABY\tPRUEBA"
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

  it("applies participant import rows by creating participant, confirmation, rotation and link", async () => {
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
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.armAssignments).toHaveLength(2);
    expect(state.referenceCodes).toHaveLength(3);
    expect(state.accessTokens).toHaveLength(1);
    expect(state.activities).toHaveLength(1);
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
      "AAA 123",
      "BBB 456",
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
    expect(state.rotationAssignments).toHaveLength(1);
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
    expect(state.rotationAssignments).toHaveLength(1);
    expect(state.accessTokens).toHaveLength(1);
  });

  it("reports a sanitized per-row error when study product creation fails and preserves preview", async () => {
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

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.data?.applyErrors).toHaveLength(1);
    expect(result.ok ? "" : result.data?.applyErrors[0]?.message ?? "").toContain(
      "Fila 2 / NAV-010: no se pudo crear StudyProduct para primera fragancia."
    );
    expect(result.ok ? null : result.data?.preview).not.toBeNull();
  });

  it("blocks participant rotation changes after T0 has started", async () => {
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

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.data?.applyErrors[0]?.message ?? "").toContain(
      "Fila 2 / NAV-010: no se puede actualizar la rotacion porque T0 ya fue iniciado."
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

  it("requires an approved selfie from the current T4 activity before saving responses", async () => {
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
        reviewStatus: "APPROVED"
      })
    );
    const saved = await repository.submitActivityResponses({
      activityId: "activity-T4_HORAS",
      answers: completeNavigoAnswers(),
      testMode: true,
      token: "token-1"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toBe("Toma una selfie aprobada de esta evaluacion antes de guardar las respuestas.");
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
  t2Completed = false,
  t2IdentityReviewStatus,
  t2SelfieCount = 0,
  t4Completed = false
}: {
  t0IdentityStatus?: "CONFIRMED" | "PENDING" | "REJECTED";
  t0Status?: "COMPLETED" | "STARTED";
  t2Completed?: boolean;
  t2IdentityReviewStatus?: "APPROVED" | "PENDING" | "REJECTED";
  t2SelfieCount?: number;
  t4Completed?: boolean;
} = {}) {
  const base = new Date("2026-06-25T15:00:00.000Z");
  return [
    navigoActivityRecord("T0_SALON", 0, 0, 0, t0Status, base, t0Status === "COMPLETED" ? base : null, {
      identityStatus: t0IdentityStatus
    }),
    navigoActivityRecord("T2_HORAS", 120, -30, 480, t2Completed ? "COMPLETED" : "PENDING", null, null, {
      identityReviewStatus: t2IdentityReviewStatus,
      selfieCount: t2SelfieCount
    }),
    navigoActivityRecord("T4_HORAS", 240, -30, 360, t4Completed ? "COMPLETED" : "PENDING", null, null),
    navigoActivityRecord("T8_HORAS", 480, -30, 120, "PENDING", null, null)
  ];
}

function navigoActivityRecord(
  code: (typeof NAVIGO_ACTIVITY_CODES)[number],
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
  const participant = {
    accessTokens: [],
    activities,
    applicationStartedAt: new Date("2026-06-25T15:00:00.000Z") as Date | null,
    id: "study-participant-1",
    participantConfirmation: {
      folio: "NAV-001",
      referenceCodes: [],
      screeningAttempt: {
        evaluationJson: null,
        id: "attempt-1"
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
      async findMany() {
        return activities.map((activity) => activity.activitySchedule);
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
      async update(args: { data: Partial<(typeof activities)[number]>; where: { id: string } }) {
        const target = activities.find((activity) => activity.id === args.where.id);
        if (!target) {
          throw new Error("activity not found");
        }
        Object.assign(target, args.data);
        return target;
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
          return target;
        }

        responses.push({ ...args.create });
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

  return {
    activities,
    participant,
    prisma,
    responses,
    storage
  };
}

function createParticipantActivity(
  code: (typeof NAVIGO_ACTIVITY_CODES)[number],
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
    T0_SALON: 0,
    T2_HORAS: 120,
    T4_HORAS: 240,
    T8_HORAS: 480
  } satisfies Record<(typeof NAVIGO_ACTIVITY_CODES)[number], number>;
  const windows = {
    T0_SALON: [0, 0],
    T2_HORAS: [-30, 480],
    T4_HORAS: [-30, 360],
    T8_HORAS: [-30, 120]
  } satisfies Record<(typeof NAVIGO_ACTIVITY_CODES)[number], [number, number]>;
  const base = new Date("2026-06-25T15:00:00.000Z");
  const scheduledAt = new Date(base.getTime() + offsets[code] * 60000);
  const [windowStartsMinutes, windowEndsMinutes] = windows[code];

  return {
    activitySchedule: {
      code,
      id: `schedule-${code}`,
      offsetMinutes: offsets[code],
      questionnaireVersionId: overrides.questionnaireVersionId ?? "version-1",
      sortOrder: NAVIGO_ACTIVITY_CODES.indexOf(code),
      status: "ACTIVE" as const,
      type: code === "T0_SALON" ? ("INTERNAL_FOLLOWUP" as const) : ("QUESTIONNAIRE_MEASUREMENT" as const),
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

function createNavigoParticipantImportState(
  {
    failExistingLookup = false,
    failStudyProductUpsert = false
  }: { failExistingLookup?: boolean; failStudyProductUpsert?: boolean } = {}
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
  const arms: Array<{ code: string; id: string; label: string; sortOrder: number; studyId: string }> = [];
  const products: Array<{
    displayLabel: string;
    id: string;
    internalCode: string;
    isSensitive: boolean;
    realName: string;
    studyId: string;
  }> = [];
  const rotationPlans: Array<{ id: string; name: string; rotationCode: string; studyId: string }> = [];
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
      id: participant.id,
      participantConfirmation: confirmation
        ? {
            folio: confirmation.folio,
            referenceCodes: referenceCodes
              .filter((item) => item.confirmationId === confirmation.id)
              .sort((left, right) => left.slot - right.slot),
            screeningAttempt: attempt ? { evaluationJson: attempt.evaluationJson, id: attempt.id } : null
          }
        : null,
      participantEvidence: [],
      participantProfile: {
        email: profile.email,
        id: profile.id,
        name: profile.name,
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
      async findFirst(args: { where: { code: string; status: string; studyId: string } }) {
        return (
          schedules.find(
            (item) =>
              item.code === args.where.code && item.status === args.where.status && item.studyId === args.where.studyId
          ) ?? null
        );
      }
    },
    participantAccessToken: {
      async create(args: { data: (typeof accessTokens)[number] }) {
        accessTokens.push(args.data);
        return args.data;
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
      }
    },
    participantArmAssignment: {
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
    participantConfirmation: {
      async create(args: { data: Omit<(typeof confirmations)[number], "id">; select: { id: true } }) {
        const record = { ...args.data, id: `confirmation-${confirmations.length + 1}` };
        confirmations.push(record);
        return { id: record.id };
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
      }
    },
    participantReferenceCode: {
      async createMany(args: { data: Array<{ code: string; confirmationId: string; slot: number }> }) {
        referenceCodes.push(...args.data);
        return { count: args.data.length };
      },
      async findMany() {
        return referenceCodes.map((item) => ({ code: item.code }));
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
    screeningAttempt: {
      async create(args: {
        data: Omit<(typeof screeningAttempts)[number], "id">;
        select: { id: true };
      }) {
        const record = { ...args.data, id: `attempt-${screeningAttempts.length + 1}` };
        screeningAttempts.push(record);
        return { id: record.id };
      }
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === study.id ? study : null;
      }
    },
    studyArm: {
      async create(args: { data: Omit<(typeof arms)[number], "id">; select: { id: true } }) {
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
      }
    },
    studyProduct: {
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
    activities,
    armAssignments,
    arms,
    confirmations,
    participantProfiles,
    prisma,
    referenceCodes,
    rotationAssignments,
    rotationPlanArms,
    rotationPlans,
    schedules,
    screeningAttempts,
    study,
    studyParticipants
  };
}

function createNavigoRotationImportState({ failProductUpsert = false }: { failProductUpsert?: boolean } = {}) {
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
    id: "study-participant-1",
    participantConfirmation: {
      folio: "NAV-001",
      referenceCodes: [],
      screeningAttempt: {
        evaluationJson: null,
        id: "attempt-1"
      }
    },
    participantEvidence: [],
    participantProfile: {
      email: null,
      id: "profile-1",
      name: "Participante Uno",
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
  const arms: Array<{ code: string; id: string; label: string; sortOrder: number; studyId: string }> = [];
  const products: Array<{
    displayLabel: string;
    id: string;
    internalCode: string;
    isSensitive: boolean;
    realName: string;
    studyId: string;
  }> = [];
  const rotationPlans: Array<{ id: string; name: string; rotationCode: string; studyId: string }> = [];
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

  function syncParticipantRotation() {
    const assignment = rotationAssignments.find((candidate) => candidate.studyParticipantId === participant.id) ?? null;

    if (!assignment) {
      participant.rotationAssignment = null;
      return;
    }

    participant.rotationAssignment = {
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

  const tx = {
    participantArmAssignment: {
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
          syncParticipantRotation();
          return target;
        }

        const record = { ...args.create, id: `arm-assignment-${armAssignments.length + 1}` };
        armAssignments.push(record);
        syncParticipantRotation();
        return record;
      }
    },
    participantConfirmation: {
      async findMany(args: { where: { folio: { in: string[] }; studyId: string } }) {
        if (args.where.studyId !== study.id || !args.where.folio.in.includes(participant.participantConfirmation.folio)) {
          return [];
        }

        syncParticipantRotation();
        return [
          {
            folio: participant.participantConfirmation.folio,
            studyParticipant: participant
          }
        ];
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
          syncParticipantRotation();
          return { id: target.id };
        }

        const record = { ...args.create, id: `rotation-assignment-${rotationAssignments.length + 1}` };
        rotationAssignments.push(record);
        syncParticipantRotation();
        return { id: record.id };
      }
    },
    rotationPlan: {
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

  const prisma = {
    ...tx,
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
      return callback(tx);
    }
  };

  return {
    armAssignments,
    arms,
    participant,
    prisma,
    products,
    rotationAssignments,
    rotationPlanArms,
    rotationPlans,
    study
  };
}

function readWorkspaceFile(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

function parseTsv(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n/)
    .filter(Boolean)
    .map((row) => row.split("\t"));
}

