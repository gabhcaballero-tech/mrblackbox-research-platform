import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNavigoFoundationRepository,
  createNavigoMeasurementDefinition,
  createNavigoRotationTemplateTsv,
  createNavigoScheduleSeeds,
  buildNavigoActivityTimeline,
  buildNavigoStartT0PendingMessage,
  formatNavigoDateTimeLocal,
  hashNavigoMeasurementDefinition,
  hashToken,
  NAVIGO_ACTIVITY_CODES,
  NAVIGO_APP_DEFAULT_TIME_ZONE,
  navigoActivityLabel,
  nowInStudyTimezoneForDateTimeLocal,
  normalizeNavigoRotationCode,
  parseNavigoDateTimeLocal,
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

    expect(adminPage).toContain("Ver detalle");
    expect(adminPage).toContain("Respuestas AP1 a AP7");
    expect(adminPage).toContain("Selfie registrada del filtro");
    expect(adminPage).toContain("Selfie de esta toma");
    expect(adminPage).toContain("Revisión visual de identidad");
    expect(adminPage).toContain("Marcar como coincide");
    expect(adminPage).toContain("Marcar como no coincide");
    expect(adminPage).toContain("Marcar como requiere revisión");
    expect(adminPage).toContain("Incidencia de identidad en esta toma.");
    expect(adminPage).toContain("Valor interno conservado");
    expect(adminPage).not.toContain("privateStorageKey");
    expect(adminPage).not.toContain("storageBucket");
    expect(repository).toContain("createSignedReadUrl");
    expect(repository).toContain("readableResponses");
    expect(repository).toContain("reviewActivityIdentity");
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
  t0Status = "COMPLETED",
  t2Completed = false,
  t4Completed = false
}: {
  t0Status?: "COMPLETED" | "STARTED";
  t2Completed?: boolean;
  t4Completed?: boolean;
} = {}) {
  const base = new Date("2026-06-25T15:00:00.000Z");
  return [
    navigoActivityRecord("T0_SALON", 0, 0, 0, t0Status, base, t0Status === "COMPLETED" ? base : null),
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
  status: "COMPLETED" | "PENDING" | "STARTED",
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
      referenceCodes: []
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
    study
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

