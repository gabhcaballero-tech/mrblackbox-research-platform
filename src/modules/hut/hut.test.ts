import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyHutMissedDay,
  applyHutVideoSubmission,
  buildHutTsv,
  createHutRepository,
  decryptHutPhaseCode,
  getHutApplicableQuestions,
  hashHutPhaseCode,
  getHutV5Definition,
  getHutCurrentAvailability,
  hutFormDataToAnswerInput,
  hutBlockDayAvailableAt,
  nextHutVideoSequence,
  parseHutParticipantImportText,
  parseHutQuestionnaireAnswers,
  parseHutQuestionAnswer,
  parseHutRegistrationSlotImportText
} from ".";
import type { OneuiWhatsAppMessageRecord, OneuiWhatsAppRepository } from "@/modules/oneui-whatsapp";
import type { HutQuestionDefinition } from ".";
import type { HutStorageClient } from "./storage";

function readWorkspaceFile(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

function createCompleteHutV5FormData({ participantOrigin }: { participantOrigin: "CLT_HUT" | "HUT_DIRECTO" }) {
  const formData = new FormData();
  const context = { participantOrigin };

  for (let pass = 0; pass < 4; pass += 1) {
    const input = hutFormDataToAnswerInput(formData);
    for (const question of getHutApplicableQuestions({ answers: input, context })) {
      if (!question.required || formData.has(question.code)) {
        continue;
      }

      setDefaultHutAnswer(formData, question, participantOrigin);
    }
  }

  return formData;
}

function setDefaultHutAnswer(
  formData: FormData,
  question: HutQuestionDefinition,
  participantOrigin: "CLT_HUT" | "HUT_DIRECTO"
) {
  if (question.code === "HUT_PARTICIPO_CLT") {
    formData.set(question.code, participantOrigin === "CLT_HUT" ? "1" : "2");
    return;
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    formData.set(question.code, `${question.code} respuesta`);
    return;
  }

  if (question.type === "SCALE") {
    formData.set(question.code, String(question.min));
    return;
  }

  if (question.type === "SELECT") {
    const option = question.options.find((candidate) => !candidate.terminates) ?? question.options[0];
    if (question.multiple) {
      formData.append(question.code, option?.value ?? "1");
    } else {
      formData.set(question.code, option?.value ?? "1");
    }
    return;
  }

  if (question.type === "RANKING") {
    question.options.slice(0, question.maxRank).forEach((option, index) => {
      formData.set(`${question.code}.${index + 1}`, option.value);
    });
    return;
  }

  if (question.type === "MATRIX") {
    question.rows.forEach((row) => {
      formData.set(`${question.code}.${row.code}`, String(question.columns[0]?.value ?? "1"));
    });
  }
}

describe("HUT module foundation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps video sequence strict and does not skip after a missed day", () => {
    expect(nextHutVideoSequence(block({ submittedVideosCount: 1 }))).toBe(2);

    const missed = applyHutMissedDay(block({ missedDaysCount: 0, submittedVideosCount: 1 }));
    expect(missed.disqualified).toBe(false);
    expect(nextHutVideoSequence(block({ missedDaysCount: missed.missedDaysCount, submittedVideosCount: 1 }))).toBe(2);
  });

  it("allows one missed day per block and disqualifies on the second missed day", () => {
    const firstMiss = applyHutMissedDay(block({ missedDaysCount: 0 }));
    expect(firstMiss).toMatchObject({
      blockStatus: "IN_PROGRESS",
      disqualified: false,
      missedDaysCount: 1
    });

    const secondMiss = applyHutMissedDay(block({ missedDaysCount: 1 }));
    expect(secondMiss).toMatchObject({
      blockStatus: "DISQUALIFIED",
      disqualified: true,
      participantStatus: "DISQUALIFIED"
    });
  });

  it("moves a block to call pending after the third video", () => {
    const decision = applyHutVideoSubmission(block({ submittedVideosCount: 2 }));

    expect(decision).toMatchObject({
      blockStatus: "CALL_PENDING",
      participantStatus: "BLOCK_1_CALL_PENDING",
      submittedVideosCount: 3
    });
  });

  it("creates a HUT participant and link independent from Navigo", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const result = await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Uno",
      phone: "5512345678",
      recruiter: "Reclutadora",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.link : "").toContain("https://example.com/hut/p/");
    expect(prisma.state.participants[0]?.status).toBe("BLOCK_1_IN_PROGRESS");
    expect(prisma.state.participants[0]?.blocks).toHaveLength(2);
  });

  it("creates new HUT participants with the application photo protocol by default", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const result = await repository.createParticipant({
      name: "Participante Nuevo Protocolo",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(prisma.state.participants[0]).toMatchObject({
      origin: "HUT_DIRECTO",
      protocolVersion: "APPLICATION_PHOTO"
    });
    expect(prisma.state.participants[0]?.blocks).toHaveLength(0);
  });

  it("syncs HUT contact data from the linked NAV participant without changing rotation or phases", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      firstFragranceLeftArm: "247",
      folio: "HUT-111",
      name: "HUT-111",
      phone: null,
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];

    expect(created.ok).toBe(true);
    expect(participant).toBeDefined();
    if (!participant) {
      throw new Error("missing test participant");
    }

    participant.studyParticipantId = "study-participant-nav-111";
    participant.studyParticipant = {
      participantProfile: {
        email: "martin@example.test",
        name: "Martin Valerio Gonzalez",
        phone: "5569613589"
      }
    };
    participant.phaseCodes = [
      {
        codeHash: "hash-1",
        encryptedCode: "encrypted-1",
        id: "phase-1",
        participantId: participant.id,
        phase: "COLOCACION",
        slot: 1,
        status: "GENERATED"
      }
    ];

    const result = await repository.syncParticipantProfileFromLinkedNav({
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(participant).toMatchObject({
      email: "martin@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-111",
      name: "Martin Valerio Gonzalez",
      phone: "5569613589",
      secondFragranceRightArm: "583"
    });
    expect(participant.phaseCodes).toHaveLength(1);
  });

  it("reconciles a reserved HUT folio with its NAV equivalent without losing phases or evidence", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const slot = await repository.createRegistrationSlot({
      firstFragranceLeftArm: "247",
      folio: "HUT-121",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const created = await repository.createParticipant({
      name: "HUT-121",
      requestOrigin: "https://example.com",
      slotId: slot.ok ? slot.data.slotId : "",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const confirmation = confirmationWithCodes("NAV-121");
    confirmation.studyParticipant.participantProfile = {
      email: "nav121@example.test",
      name: "Participante NAV 121",
      phone: "+525512312121"
    };
    prisma.state.confirmations.push(confirmation);

    expect(created.ok).toBe(true);
    expect(participant).toBeDefined();
    if (!participant) {
      throw new Error("missing test participant");
    }

    participant.phaseCodes.push({
      codeHash: "hash-1",
      encryptedCode: "encrypted-1",
      id: "phase-1",
      participantId: participant.id,
      phase: "COLOCACION",
      slot: 1,
      status: "GENERATED"
    });
    participant.applicationEvidence.push({
      capturedAt: new Date("2026-08-08T12:00:00.000Z"),
      extension: "jpg",
      id: "evidence-1",
      mimeType: "image/jpeg",
      originalFilename: "foto.jpg",
      participantId: participant.id,
      phase: "COLOCACION",
      privateStorageKey: "hut/evidence.jpg",
      productCode: "247",
      sizeBytes: 1024,
      storageBucket: "participant-evidence"
    });
    participant.applicationPhotoEntries.push({
      capturedAt: new Date("2026-08-08T12:00:00.000Z"),
      capturedLocalDate: "2026-08-08",
      capturedLocalTimezone: "America/Mexico_City",
      id: "photo-1",
      participantId: participant.id,
      privateStorageKey: "hut/photo.jpg",
      productCode: "247",
      useDayNumber: 1
    });

    const preview = await repository.previewReservedHutNavReconciliation({ studyId: "study-hut" });
    expect(preview.ok ? preview.data.rows[0] : null).toMatchObject({
      canApply: true,
      existingPhaseCount: 1,
      existingPhotoCount: 2,
      hutFolio: "HUT-121",
      navFolio: "NAV-121",
      navName: "Participante NAV 121"
    });

    const result = await repository.reconcileReservedHutNavParticipants({
      confirmation: "RECONCILIAR HUT",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(participant).toMatchObject({
      email: "nav121@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-121",
      name: "Participante NAV 121",
      origin: "CLT_HUT",
      phone: "+525512312121",
      secondFragranceRightArm: "583",
      studyParticipantId: "study-participant-NAV-121"
    });
    expect(participant.phaseCodes).toHaveLength(1);
    expect(participant.applicationEvidence).toHaveLength(1);
    expect(participant.applicationPhotoEntries).toHaveLength(1);
    expect(prisma.state.registrationSlots[0]).toMatchObject({
      firstFragranceLeftArm: "247",
      folio: "HUT-121",
      participantId: participant.id,
      secondFragranceRightArm: "583",
      status: "REGISTERED"
    });
  });

  it("does not reconcile a reserved HUT folio without NAV equivalent", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const slot = await repository.createRegistrationSlot({
      firstFragranceLeftArm: "247",
      folio: "HUT-123",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    await repository.createParticipant({
      name: "HUT-123",
      requestOrigin: "https://example.com",
      slotId: slot.ok ? slot.data.slotId : "",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];

    const preview = await repository.previewReservedHutNavReconciliation({ studyId: "study-hut" });
    expect(preview.ok ? preview.data.rows[0] : null).toMatchObject({
      canApply: false,
      hutFolio: "HUT-123",
      navFolio: "NAV-123",
      reason: "Pendiente NAV equivalente."
    });

    const result = await repository.reconcileReservedHutNavParticipants({
      confirmation: "RECONCILIAR HUT",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.updated : 0).toBe(0);
    expect(participant).toMatchObject({
      name: "HUT-123",
      origin: "HUT_DIRECTO",
      studyParticipantId: null
    });
  });

  it("automatically reconciles a reserved HUT folio when the NAV participant appears", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const slot = await repository.createRegistrationSlot({
      firstFragranceLeftArm: "247",
      folio: "HUT-115",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    await repository.createParticipant({
      name: "HUT-115",
      requestOrigin: "https://example.com",
      slotId: slot.ok ? slot.data.slotId : "",
      studyId: "study-hut"
    });
    const confirmation = confirmationWithCodes("NAV-115");
    prisma.state.confirmations.push(confirmation);

    const result = await repository.reconcileReservedHutParticipantForStudyParticipant({
      studyParticipantId: confirmation.studyParticipant.id
    });

    expect(result).toMatchObject({
      data: {
        hutFolio: "HUT-115",
        participantId: prisma.state.participants[0]?.id,
        updated: true
      },
      ok: true
    });
    expect(prisma.state.participants[0]).toMatchObject({
      name: "Participante NAV-115",
      origin: "CLT_HUT",
      studyParticipantId: confirmation.studyParticipant.id
    });
  });

  it("defines an optional StudyParticipant link for HUT participants", () => {
    const schema = readWorkspaceFile("prisma", "schema.prisma");
    const migration = readWorkspaceFile(
      "prisma",
      "migrations",
      "20260806120000_add_hut_study_participant_link",
      "migration.sql"
    );

    expect(schema).toMatch(/studyParticipantId\s+String\?/);
    expect(schema).toMatch(/studyParticipant\s+StudyParticipant\?/);
    expect(schema).toMatch(/hutParticipant\s+HutParticipant\?/);
    expect(migration).toContain('ADD COLUMN "studyParticipantId" UUID');
    expect(migration).toContain('FOREIGN KEY ("studyParticipantId") REFERENCES "study_participants"("id")');
  });

  it("defines the HUT v5 questionnaire foundation without changing legacy video tables", () => {
    const schema = readWorkspaceFile("prisma", "schema.prisma");
    const migration = readWorkspaceFile(
      "prisma",
      "migrations",
      "20260808000000_add_hut_v5_questionnaire_foundation",
      "migration.sql"
    );

    expect(schema).toContain("enum HutQuestionnaireAttemptStatus");
    expect(schema).toContain("model HutQuestionnaireAttempt");
    expect(schema).toContain("model HutVisitProgress");
    expect(schema).toContain("model HutAnswer");
    expect(schema).toContain("model HutApplicationPhotoEntry");
    expect(schema).toContain("questionnaireAttempt    HutQuestionnaireAttempt?");
    expect(schema).toContain("applicationPhotoEntries HutApplicationPhotoEntry[]");
    expect(schema).toContain('@@unique([participantId, capturedLocalDate])');
    expect(schema).toContain("model HutBlock");
    expect(schema).toContain("model HutVideoSubmission");
    expect(migration).toContain('CREATE TABLE "hut_questionnaire_attempts"');
    expect(migration).toContain('CREATE TABLE "hut_visit_progress"');
    expect(migration).toContain('CREATE TABLE "hut_answers"');
    expect(migration).toContain('CREATE TABLE "hut_application_photo_entries"');
    expect(migration).not.toContain('DROP TABLE "hut_blocks"');
    expect(migration).not.toContain('DROP TABLE "hut_video_submissions"');
  });

  it("defines the HUT v5 application photo questionnaire sections separately from operational phases", () => {
    const definition = getHutV5Definition();

    expect(definition).toMatchObject({
      protocolVersion: "APPLICATION_PHOTO",
      version: 5
    });
    expect(definition.sections.map((section) => section.id)).toEqual([
      "DATOS_GENERALES",
      "FILTROS",
      "PRIMERA_VISITA",
      "EVALUACION_PRIMER_PERFUME",
      "SEGUNDA_VISITA",
      "EVALUACION_SEGUNDO_PERFUME",
      "COMPARATIVA"
    ]);
    expect(definition.sections.map((section) => section.id)).not.toContain("COLOCACION");
    expect(definition.sections.map((section) => section.id)).not.toContain("REGRESO_1");
    expect(definition.sections.map((section) => section.id)).not.toContain("REGRESO_2");
    expect(definition.sections.flatMap((section) => section.questions).map((question) => question.code)).toContain(
      "HUT_PARTICIPO_CLT"
    );
  });

  it("uses the CLT participation answer to omit repeated HUT filters", () => {
    const cltParticipantQuestions = getHutApplicableQuestions({
      answers: { HUT_PARTICIPO_CLT: "SI" },
      context: { participantOrigin: "CLT_HUT" }
    });
    const directParticipantQuestions = getHutApplicableQuestions({
      answers: { HUT_PARTICIPO_CLT: "NO" },
      context: { participantOrigin: "HUT_DIRECTO" }
    });

    expect(cltParticipantQuestions.map((question) => question.code)).not.toContain("HUT_F1_GENERO");
    expect(cltParticipantQuestions.map((question) => question.code)).not.toContain("HUT_F2_EDAD_EXACTA");
    expect(cltParticipantQuestions.map((question) => question.code)).toContain("HUT_F6_PRODUCTOS_7_DIAS");
    expect(cltParticipantQuestions.map((question) => question.code)).toContain("HUT_F20_TIEMPO_USO_MARCA");
    expect(cltParticipantQuestions.map((question) => question.code)).toContain("HUT_F22_IMPORTANCIA_PERFUME");
    expect(directParticipantQuestions.map((question) => question.code)).toContain("HUT_F1_GENERO");
    expect(directParticipantQuestions.map((question) => question.code)).toContain("HUT_F2_EDAD_EXACTA");
  });

  it("defaults HUT filter visibility from participant origin when the operational answer is not present yet", () => {
    const cltParticipantQuestions = getHutApplicableQuestions({ context: { participantOrigin: "CLT_HUT" } });
    const directParticipantQuestions = getHutApplicableQuestions({ context: { participantOrigin: "HUT_DIRECTO" } });

    expect(cltParticipantQuestions.map((question) => question.code)).not.toContain("HUT_F10_MARCAS_UTILIZA");
    expect(directParticipantQuestions.map((question) => question.code)).toContain("HUT_F10_MARCAS_UTILIZA");
  });

  it("validates HUT v5 select, scale and matrix answers", () => {
    const formData = createCompleteHutV5FormData({ participantOrigin: "HUT_DIRECTO" });
    formData.set("HUT_EVA1_GUSTO", "7");

    const result = parseHutQuestionnaireAnswers(
      hutFormDataToAnswerInput(formData),
      getHutV5Definition(),
      { participantOrigin: "HUT_DIRECTO" }
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.answers.find((answer) => answer.questionCode === "HUT_EVA1_GUSTO")?.answerValue : null).toBe(7);
    expect(result.ok ? result.answers.find((answer) => answer.questionCode === "HUT_EVA1_ATRIBUTOS")?.answerValue : null)
      .toMatchObject({
        AROMA_AGRADABLE: "1",
        AROMA_DURADERO: "1"
      });
  });

  it("rejects invalid HUT v5 values without using legacy video state", () => {
    const invalidScale = parseHutQuestionAnswer("HUT_EVA1_GUSTO", { HUT_EVA1_GUSTO: "8" });
    const missingMatrixRow = parseHutQuestionAnswer("HUT_EVA1_ATRIBUTOS", {
      HUT_EVA1_ATRIBUTOS: {
        AROMA_AGRADABLE: "5"
      }
    });

    expect(invalidScale).toMatchObject({
      message: "Selecciona un valor entre 1 y 7.",
      ok: false
    });
    expect(missingMatrixRow).toMatchObject({
      missingQuestionCodes: [
        "HUT_EVA1_ATRIBUTOS.AROMA_DURADERO",
        "HUT_EVA1_ATRIBUTOS.ENVASE_COMODO",
        "HUT_EVA1_ATRIBUTOS.INTENSIDAD_ADECUADA",
        "HUT_EVA1_ATRIBUTOS.DIRECCION_FACIL",
        "HUT_EVA1_ATRIBUTOS.CANTIDAD_FACIL",
        "HUT_EVA1_ATRIBUTOS.SEGURIDAD",
        "HUT_EVA1_ATRIBUTOS.AROMA_UNICO"
      ],
      ok: false
    });
  });

  it("creates HUT v5 questionnaire attempts idempotently for application photo participants", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      firstFragranceLeftArm: "247",
      folio: "NAV-HUT-V5-001",
      name: "Participante HUT V5",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    expect(participant.ok).toBe(true);
    const participantId = participant.ok ? participant.data.participantId : "";

    const first = await repository.ensureQuestionnaireAttempt({ participantId, studyId: "study-hut" });
    const second = await repository.ensureQuestionnaireAttempt({ participantId, studyId: "study-hut" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && second.ok ? first.data.id : null).toBe(second.ok ? second.data.id : null);
    expect(prisma.state.questionnaireAttempts).toHaveLength(1);
    expect(prisma.state.participants[0]?.blocks).toHaveLength(0);
  });

  it("tracks HUT v5 progress by questionnaire section", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante Progreso",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";

    const started = await repository.ensureQuestionnaireSectionProgress({
      participantId,
      section: "PRIMERA_VISITA",
      studyId: "study-hut"
    });
    const completed = await repository.completeQuestionnaireSection({
      participantId,
      section: "PRIMERA_VISITA",
      studyId: "study-hut"
    });

    expect(started).toMatchObject({
      data: {
        section: "PRIMERA_VISITA",
        status: "IN_PROGRESS"
      },
      ok: true
    });
    expect(completed).toMatchObject({
      data: {
        section: "PRIMERA_VISITA",
        status: "COMPLETED"
      },
      ok: true
    });
    expect(prisma.state.questionnaireAttempts[0]?.visits).toHaveLength(1);
  });

  it("saves HUT v5 answers incrementally and updates instead of duplicating", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante Respuestas",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";

    const first = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_EVA1_GUSTO: "6" },
      participantId,
      questionCode: "HUT_EVA1_GUSTO",
      studyId: "study-hut"
    });
    const second = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_EVA1_GUSTO: "7" },
      participantId,
      questionCode: "HUT_EVA1_GUSTO",
      studyId: "study-hut"
    });
    const matrix = await repository.saveQuestionnaireAnswer({
      answerInput: {
        HUT_EVA1_ATRIBUTOS: {
          AROMA_AGRADABLE: "5",
          AROMA_DURADERO: "4",
          AROMA_UNICO: "5",
          CANTIDAD_FACIL: "4",
          DIRECCION_FACIL: "5",
          ENVASE_COMODO: "4",
          INTENSIDAD_ADECUADA: "5",
          SEGURIDAD: "4"
        }
      },
      participantId,
      questionCode: "HUT_EVA1_ATRIBUTOS",
      studyId: "study-hut"
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      data: {
        answerValue: 7,
        questionCode: "HUT_EVA1_GUSTO"
      },
      ok: true
    });
    expect(matrix.ok).toBe(true);
    expect(prisma.state.answers.filter((answer) => answer.questionCode === "HUT_EVA1_GUSTO")).toHaveLength(1);
    expect(prisma.state.answers.find((answer) => answer.questionCode === "HUT_EVA1_GUSTO")?.answerJson).toBe(7);
    expect(prisma.state.answers.find((answer) => answer.questionCode === "HUT_EVA1_ATRIBUTOS")?.answerJson).toMatchObject({
      AROMA_AGRADABLE: "5",
      AROMA_DURADERO: "4"
    });
  });

  it("continues HUT F6 when multiple selections include perfume", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante F6 Multiple",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";

    const result = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_F6_PRODUCTOS_7_DIAS: ["1", "3", "5"] },
      participantId,
      questionCode: "HUT_F6_PRODUCTOS_7_DIAS",
      studyId: "study-hut"
    });

    expect(result).toMatchObject({
      data: {
        answerValue: ["1", "3", "5"],
        questionCode: "HUT_F6_PRODUCTOS_7_DIAS"
      },
      ok: true
    });
    expect(prisma.state.questionnaireAttempts[0]?.status).not.toBe("TERMINATED");
  });

  it("continues HUT F6 when only perfume is selected", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante F6 Perfume",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";

    const result = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_F6_PRODUCTOS_7_DIAS: "3" },
      participantId,
      questionCode: "HUT_F6_PRODUCTOS_7_DIAS",
      studyId: "study-hut"
    });

    expect(result).toMatchObject({
      data: {
        answerValue: ["3"],
        questionCode: "HUT_F6_PRODUCTOS_7_DIAS"
      },
      ok: true
    });
    expect(prisma.state.questionnaireAttempts[0]?.status).not.toBe("TERMINATED");
  });

  it("terminates HUT F6 when perfume is not selected", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante F6 Sin Perfume",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";

    const result = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_F6_PRODUCTOS_7_DIAS: ["1", "5", "7"] },
      participantId,
      questionCode: "HUT_F6_PRODUCTOS_7_DIAS",
      studyId: "study-hut"
    });

    expect(result).toMatchObject({
      data: {
        answerValue: ["1", "5", "7"],
        questionCode: "HUT_F6_PRODUCTOS_7_DIAS",
        terminated: true
      },
      ok: true
    });
    expect(prisma.state.questionnaireAttempts[0]).toMatchObject({
      status: "TERMINATED",
      terminationReason: "No selecciono la opcion requerida para continuar: 3"
    });
  });

  it("omits repeated HUT filter answers for CLT_HUT participants", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante CLT HUT",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";
    prisma.state.participants[0]!.origin = "CLT_HUT";

    const skipped = await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_F1_GENERO: "HOMBRE" },
      participantId,
      questionCode: "HUT_F1_GENERO",
      studyId: "study-hut"
    });
    const state = await repository.getQuestionnaireState({
      participantId,
      studyId: "study-hut"
    });

    expect(skipped).toMatchObject({
      message: "Esta pregunta HUT se omite para este participante.",
      ok: false
    });
    expect(state.ok ? state.data.omittedQuestionCodes : []).toContain("HUT_F1_GENERO");
    expect(state.ok ? state.data.applicableQuestionCodes : []).toContain("HUT_F6_PRODUCTOS_7_DIAS");
    expect(state.ok ? state.data.applicableQuestionCodes : []).not.toContain("HUT_PARTICIPO_CLT");
  });

  it("blocks a second HUT v5 application photo on the same Mexico City day", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const participant = await repository.createParticipant({
      name: "Participante Foto Diaria",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participantId = participant.ok ? participant.data.participantId : "";
    const now = new Date("2026-08-07T15:00:00.000Z");

    const availabilityBefore = await repository.getApplicationPhotoDailyAvailability({
      now,
      participantId,
      studyId: "study-hut"
    });
    const recorded = await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now,
      participantId,
      privateStorageKey: "hut/application-photo/photo-1.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 1
    });
    const duplicate = await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now: new Date("2026-08-07T23:30:00.000Z"),
      participantId,
      privateStorageKey: "hut/application-photo/photo-2.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 1
    });
    const availabilityAfter = await repository.getApplicationPhotoDailyAvailability({
      now,
      participantId,
      studyId: "study-hut"
    });

    expect(availabilityBefore).toMatchObject({
      data: {
        available: true,
        capturedLocalDate: "2026-08-07",
        reason: "AVAILABLE"
      },
      ok: true
    });
    expect(recorded).toMatchObject({
      data: {
        capturedLocalDate: "2026-08-07",
        productCode: "247",
        useDayNumber: 1
      },
      ok: true
    });
    expect(duplicate).toMatchObject({
      message: "Ya existe una foto de aplicacion registrada para el dia de hoy.",
      ok: false
    });
    expect(availabilityAfter).toMatchObject({
      data: {
        available: false,
        reason: "PHOTO_ALREADY_CAPTURED_TODAY"
      },
      ok: true
    });
  });

  it("test mode allows application photos on the same day without affecting normal HUT participants", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const testParticipant = await repository.createParticipant({
      email: "test-photo@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-TESTMODE",
      name: "Participante Foto Test",
      phone: "5511111111",
      protocolVersion: "APPLICATION_PHOTO",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const normalParticipant = await repository.createParticipant({
      email: "normal-photo@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-NORMAL",
      name: "Participante Foto Normal",
      phone: "5522222222",
      protocolVersion: "APPLICATION_PHOTO",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const testParticipantId = testParticipant.ok ? testParticipant.data.participantId : "";
    const normalParticipantId = normalParticipant.ok ? normalParticipant.data.participantId : "";
    const now = new Date("2026-08-07T15:00:00.000Z");

    await repository.setTestMode({
      enabled: true,
      participantId: testParticipantId,
      studyId: "study-hut"
    });
    await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now,
      participantId: testParticipantId,
      privateStorageKey: "hut/application-photo/test-photo-1.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 1
    });
    await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now,
      participantId: normalParticipantId,
      privateStorageKey: "hut/application-photo/normal-photo-1.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 1
    });

    const testAvailability = await repository.getApplicationPhotoDailyAvailability({
      now,
      participantId: testParticipantId,
      studyId: "study-hut"
    });
    const normalAvailability = await repository.getApplicationPhotoDailyAvailability({
      now,
      participantId: normalParticipantId,
      studyId: "study-hut"
    });
    const testDuplicate = await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now: new Date("2026-08-07T23:30:00.000Z"),
      participantId: testParticipantId,
      privateStorageKey: "hut/application-photo/test-photo-2.jpg",
      productCode: "583",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 2
    });
    const normalDuplicate = await repository.recordApplicationPhotoEntry({
      extension: "jpg",
      mimeType: "image/jpeg",
      now: new Date("2026-08-07T23:30:00.000Z"),
      participantId: normalParticipantId,
      privateStorageKey: "hut/application-photo/normal-photo-2.jpg",
      productCode: "583",
      sizeBytes: 1234,
      storageBucket: "participant-evidence",
      studyId: "study-hut",
      useDayNumber: 2
    });

    expect(testAvailability).toMatchObject({
      data: {
        available: true,
        existingEntry: null,
        reason: "AVAILABLE"
      },
      ok: true
    });
    expect(normalAvailability).toMatchObject({
      data: {
        available: false,
        reason: "PHOTO_ALREADY_CAPTURED_TODAY"
      },
      ok: true
    });
    expect(testDuplicate).toMatchObject({
      data: {
        productCode: "583",
        useDayNumber: 2
      },
      ok: true
    });
    expect(normalDuplicate).toMatchObject({
      message: "Ya existe una foto de aplicacion registrada para el dia de hoy.",
      ok: false
    });
    expect(prisma.state.participants.find((participant) => participant.id === testParticipantId)?.testMode).toBe(true);
    expect(prisma.state.participants.find((participant) => participant.id === normalParticipantId)?.testMode).toBe(false);
  });

  it("lets test mode complete every application photo slot on the same day but blocks duplicate slots", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      email: "slot-test@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-SLOT-TEST",
      name: "Participante Slots Test",
      phone: "5533333333",
      protocolVersion: "APPLICATION_PHOTO",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participantId = created.ok ? created.data.participantId : "";
    const participant = prisma.state.participants.find((item) => item.id === participantId)!;

    await repository.setTestMode({
      enabled: true,
      participantId,
      studyId: "study-hut"
    });

    async function uploadSlot(slotId: "DELIVERY" | "PRODUCT_1_DAY_1" | "PRODUCT_1_DAY_2" | "PRODUCT_1_DAY_3_MORNING") {
      const upload = await repository.requestApplicationPhotoUpload({
        metadata: selfieMetadata(),
        slotId,
        storage,
        token: participant.token
      });
      expect(upload.ok).toBe(true);

      return repository.confirmApplicationPhotoUpload({
        metadata: {
          ...selfieMetadata(),
          privateStorageKey: upload.ok ? upload.data.privateStorageKey : "",
          storageBucket: upload.ok ? upload.data.storageBucket : ""
        },
        slotId,
        token: participant.token
      });
    }

    await expect(uploadSlot("DELIVERY")).resolves.toMatchObject({ ok: true });
    await expect(uploadSlot("PRODUCT_1_DAY_1")).resolves.toMatchObject({ ok: true });
    await expect(uploadSlot("PRODUCT_1_DAY_2")).resolves.toMatchObject({ ok: true });
    await expect(uploadSlot("PRODUCT_1_DAY_3_MORNING")).resolves.toMatchObject({ ok: true });

    const duplicate = await repository.requestApplicationPhotoUpload({
      metadata: selfieMetadata(),
      slotId: "PRODUCT_1_DAY_2",
      storage,
      token: participant.token
    });

    expect(duplicate).toMatchObject({
      message: "Esta foto HUT ya fue registrada.",
      ok: false
    });
    expect(participant.applicationEvidence).toHaveLength(1);
    expect(participant.applicationPhotoEntries.map((entry) => entry.useDayNumber).sort()).toEqual([0, 2, 3]);
  });

  it("resets application photo evidence without deleting rotation or phase codes", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      firstFragranceLeftArm: "247",
      folio: "HUT-RESET-PHOTO",
      name: "Participante Reset Foto",
      protocolVersion: "APPLICATION_PHOTO",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participantId = created.ok ? created.data.participantId : "";
    const participant = prisma.state.participants.find((item) => item.id === participantId)!;
    participant.applicationEvidence.push({
      capturedAt: new Date("2026-08-07T15:00:00.000Z"),
      extension: "jpg",
      id: "application-evidence-reset",
      mimeType: "image/jpeg",
      originalFilename: "foto.jpg",
      participantId,
      phase: "COLOCACION",
      privateStorageKey: "hut/application-photo/reset-photo.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence"
    });
    prisma.state.applicationPhotoEntries.push({
      capturedAt: new Date("2026-08-07T15:00:00.000Z"),
      capturedLocalDate: "2026-08-07",
      capturedLocalTimezone: "America/Mexico_City",
      id: "application-photo-entry-reset",
      participantId,
      privateStorageKey: "hut/application-photo/reset-photo.jpg",
      productCode: "247",
      useDayNumber: 1
    });
    participant.applicationPhotoEntries = prisma.state.applicationPhotoEntries.filter((entry) => entry.participantId === participantId);
    const phaseCodeCount = participant.phaseCodes.length;

    const result = await repository.resetApplicationPhotoEvidence({
      actorUserId: "admin-1",
      confirmation: "RESET EVIDENCIA HUT",
      participantId,
      phase: "COLOCACION",
      reason: "Foto borrosa.",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(participant.firstFragranceLeftArm).toBe("247");
    expect(participant.secondFragranceRightArm).toBe("583");
    expect(participant.phaseCodes).toHaveLength(phaseCodeCount);
    expect(participant.applicationEvidence).toHaveLength(0);
    expect(prisma.state.applicationPhotoEntries).toHaveLength(0);
    expect(prisma.state.auditLogs[0]).toMatchObject({
      action: "PARTICIPANT_MODIFIED",
      actorUserId: "admin-1",
      entityId: participantId,
      entityType: "HutParticipant",
      reason: "Foto borrosa."
    });
  });

  it("resets HUT questionnaire without deleting application photos", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      firstFragranceLeftArm: "247",
      folio: "HUT-RESET-QUESTIONNAIRE",
      name: "Participante Reset Encuesta",
      protocolVersion: "APPLICATION_PHOTO",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participantId = created.ok ? created.data.participantId : "";
    await repository.saveQuestionnaireAnswer({
      answerInput: { HUT_PARTICIPO_CLT: "SI" },
      participantId,
      questionCode: "HUT_PARTICIPO_CLT",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants.find((item) => item.id === participantId)!;
    participant.applicationEvidence.push({
      capturedAt: new Date("2026-08-07T15:00:00.000Z"),
      extension: "jpg",
      id: "application-evidence-keep",
      mimeType: "image/jpeg",
      originalFilename: "foto.jpg",
      participantId,
      phase: "COLOCACION",
      privateStorageKey: "hut/application-photo/keep-photo.jpg",
      productCode: "247",
      sizeBytes: 1234,
      storageBucket: "participant-evidence"
    });

    const result = await repository.resetQuestionnaireAttempt({
      actorUserId: "admin-1",
      confirmation: "RESET ENCUESTA HUT",
      participantId,
      reason: "Captura incorrecta.",
      studyId: "study-hut"
    });
    const state = await repository.getQuestionnaireState({ participantId, studyId: "study-hut" });

    expect(result.ok).toBe(true);
    expect(state.ok ? state.data.attempt.status : null).toBe("PENDING");
    expect(state.ok ? state.data.answers : null).toEqual({});
    expect(participant.applicationEvidence).toHaveLength(1);
    expect(participant.firstFragranceLeftArm).toBe("247");
    expect(participant.secondFragranceRightArm).toBe("583");
    expect(prisma.state.auditLogs[0]).toMatchObject({
      action: "PARTICIPANT_MODIFIED",
      afterJson: expect.objectContaining({
        action: "HUT_QUESTIONNAIRE_ATTEMPT_RESET"
      }),
      entityId: participantId,
      reason: "Captura incorrecta."
    });
  });

  it("syncs HUT phase codes from participant reference codes without overwriting existing records", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      folio: "NAV-001",
      firstFragranceLeftArm: "247",
      name: "Participante Codigos",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    prisma.state.confirmations.push(confirmationWithCodes("NAV-001"));
    const participant = prisma.state.participants[0]!;
    const secret = "hut-phase-secret-for-tests";

    const first = await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      secret,
      studyId: "study-hut"
    });
    const second = await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      secret,
      studyId: "study-hut"
    });

    expect(first).toMatchObject({ data: { created: 3, existing: 0 }, ok: true });
    expect(second).toMatchObject({ data: { created: 0, existing: 3 }, ok: true });
    expect(prisma.state.phaseCodes).toHaveLength(3);
    expect(prisma.state.phaseCodes.map((code) => [code.slot, code.phase])).toEqual([
      [1, "COLOCACION"],
      [2, "REGRESO_1"],
      [3, "REGRESO_2"]
    ]);
    expect(prisma.state.phaseCodes[0]?.codeHash).toBe(hashHutPhaseCode("A7K4", secret));
    expect(decryptHutPhaseCode(prisma.state.phaseCodes[1]?.encryptedCode ?? "", secret)).toBe("M3P9");
  });

  it("detects missing source slots while syncing HUT phase codes", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      folio: "NAV-002",
      firstFragranceLeftArm: "247",
      name: "Participante Incompleta",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    prisma.state.confirmations.push({
      ...confirmationWithCodes("NAV-002"),
      referenceCodes: [
        { code: "A7K4", slot: 1 },
        { code: "M3P9", slot: 2 }
      ]
    });
    const participant = prisma.state.participants[0]!;

    const result = await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      secret: "hut-phase-secret-for-tests",
      studyId: "study-hut"
    });

    expect(result).toMatchObject({
      message: "Faltan codigos de referencia para slots: 3.",
      ok: false
    });
    expect(prisma.state.phaseCodes).toHaveLength(0);
  });

  it("detects inconsistent existing HUT phase code mappings", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      folio: "NAV-003",
      firstFragranceLeftArm: "247",
      name: "Participante Inconsistente",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    prisma.state.confirmations.push(confirmationWithCodes("NAV-003"));
    const participant = prisma.state.participants[0]!;
    prisma.state.phaseCodes.push({
      codeHash: "hash-bad",
      encryptedCode: "encrypted-bad",
      id: "phase-code-bad",
      participantId: participant.id,
      phase: "REGRESO_2",
      slot: 1,
      status: "GENERATED"
    });

    const result = await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      secret: "hut-phase-secret-for-tests",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("Slot 1 esta asociado a REGRESO_2");
  });

  it("keeps phase codes auditable without blocking application photo uploads", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      folio: "NAV-004",
      firstFragranceLeftArm: "247",
      name: "Participante Portal Codigo",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    prisma.state.confirmations.push(confirmationWithCodes("NAV-004"));
    const participant = prisma.state.participants[0]!;
    participant.applicationPhotoEntries.push({
      capturedAt: new Date("2026-08-07T10:00:00.000Z"),
      capturedLocalDate: "2026-08-07",
      capturedLocalTimezone: "America/Mexico_City",
      id: "delivery-entry-1",
      participantId: participant.id,
      privateStorageKey: "hut/delivery.jpg",
      productCode: null,
      useDayNumber: 0
    });

    await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      secret: "hut-phase-secret-for-tests",
      studyId: "study-hut"
    });

    const viewBefore = await repository.getPortalView(participant.token);
    const upload = await repository.requestApplicationPhotoUpload({
      metadata: selfieMetadata(),
      slotId: "PRODUCT_1_DAY_1",
      storage,
      token: participant.token
    });
    const invalid = await repository.validatePhaseCode({
      code: "XXXX",
      phase: "COLOCACION",
      token: participant.token
    });
    const valid = await repository.validatePhaseCode({
      code: "A7K4",
      phase: "COLOCACION",
      token: participant.token
    });
    const viewAfter = await repository.getPortalView(participant.token);
    await repository.confirmApplicationPhotoUpload({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: upload.ok ? upload.data.privateStorageKey : "",
        storageBucket: upload.ok ? upload.data.storageBucket : ""
      },
      slotId: "PRODUCT_1_DAY_1",
      token: participant.token
    });

    expect(viewBefore.ok ? viewBefore.data.phaseGate : null).toBeNull();
    expect(upload.ok).toBe(true);
    expect(invalid).toMatchObject({
      message: "El codigo HUT no es correcto.",
      ok: false
    });
    expect(valid).toMatchObject({
      data: { phase: "COLOCACION" },
      ok: true
    });
    expect(viewAfter.ok ? viewAfter.data.phaseGate : null).toBeNull();
    expect(prisma.state.phaseCodes.find((code) => code.phase === "COLOCACION")).toMatchObject({
      status: "USED"
    });
    expect(prisma.state.participants[0]?.applicationEvidence).toHaveLength(1);
  });

  it("shows historical COLOCACION evidence as delivery and offers product 1 day 1 next", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      folio: "NAV-005",
      firstFragranceLeftArm: "247",
      name: "Participante Entrega Historica",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.status = "BLOCK_1_CALL_PENDING";
    participant.phaseCodes.push({
      codeHash: "hash-regreso-1",
      encryptedCode: "encrypted-regreso-1",
      id: "phase-regreso-1",
      participantId: participant.id,
      phase: "REGRESO_1",
      slot: 2,
      status: "GENERATED"
    });
    participant.applicationEvidence.push({
      capturedAt: new Date("2026-08-07T12:00:00.000Z"),
      extension: "jpg",
      id: "delivery-evidence-1",
      mimeType: "image/jpeg",
      originalFilename: "entrega.jpg",
      participantId: participant.id,
      phase: "COLOCACION",
      privateStorageKey: "hut/delivery.jpg",
      productCode: "247",
      sizeBytes: 1024,
      storageBucket: "participant-evidence"
    });

    const view = await repository.getPortalView(participant.token);
    const upload = await repository.requestApplicationPhotoUpload({
      metadata: selfieMetadata(),
      storage,
      token: participant.token
    });

    expect(view.ok ? view.data.phaseGate : null).toBeNull();
    expect(view.ok ? view.data.availableApplicationPhoto : null).toMatchObject({
      phase: "COLOCACION",
      productCode: "247",
      slotId: "PRODUCT_1_DAY_1"
    });
    expect(upload.ok ? upload.data : null).toMatchObject({
      phase: "COLOCACION",
      productCode: "247"
    });
  });

  it("does not allow the participant token portal to save HUT questionnaire answers", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      folio: "HUT-201",
      firstFragranceLeftArm: "247",
      name: "Participante Solo Fotos",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    const result = await repository.saveQuestionnaireAnswerByToken({
      answerInput: { HUT_DG_NOMBRE: "Respuesta publica" },
      questionCode: "HUT_DG_NOMBRE",
      token: participant.token
    });

    expect(result).toMatchObject({
      message: "El cuestionario HUT debe ser capturado por un encuestador autorizado.",
      ok: false
    });
    expect(prisma.state.answers).toHaveLength(0);
    expect(prisma.state.questionnaireAttempts).toHaveLength(0);
  });

  it("lets admin recover, revoke and regenerate HUT phase codes without storing plain text", async () => {
    vi.stubEnv("HUT_PHASE_CODE_SECRET", "hut-phase-secret-for-tests");
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      folio: "NAV-004",
      firstFragranceLeftArm: "247",
      name: "Participante Admin Codigos",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    prisma.state.confirmations.push(confirmationWithCodes("NAV-004"));
    const participant = prisma.state.participants[0]!;
    await repository.ensureHutPhaseCodesForParticipant({
      participantId: participant.id,
      studyId: "study-hut"
    });

    const recovered = await repository.recoverPhaseCode({
      participantId: participant.id,
      phase: "REGRESO_1",
      studyId: "study-hut"
    });
    const revoked = await repository.revokePhaseCode({
      participantId: participant.id,
      phase: "REGRESO_1",
      studyId: "study-hut"
    });
    const regenerated = await repository.regeneratePhaseCode({
      participantId: participant.id,
      phase: "REGRESO_1",
      studyId: "study-hut"
    });

    expect(recovered).toMatchObject({ data: { code: "M3P9" }, ok: true });
    expect(revoked.ok).toBe(true);
    expect(regenerated.ok).toBe(true);
    expect(regenerated.ok ? regenerated.data.code : "").toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2346789]{4}$/);
    expect(regenerated.ok ? regenerated.data.code : "").not.toBe("M3P9");
    expect(prisma.state.phaseCodes.find((code) => code.phase === "REGRESO_1")).toMatchObject({
      status: "GENERATED",
      usedAt: null,
      validatedAt: null
    });
    expect(prisma.state.phaseCodes.find((code) => code.phase === "REGRESO_1")?.encryptedCode).not.toContain(
      regenerated.ok ? regenerated.data.code : ""
    );
  });

  it("stores a registration reference selfie for a HUT participant", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Selfie",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant?.id ?? "",
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });
    expect(signed.ok).toBe(true);
    const confirmed = await repository.confirmReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      participantId: participant?.id ?? "",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(confirmed.ok).toBe(true);
    expect(participant?.referenceSelfie?.privateStorageKey).toContain("/reference-selfie/");
  });

  it("allows saving the missing registration selfie when block 1 has an operational start date but no evidence", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Con Fecha",
      requestOrigin: "https://example.com",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];

    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant?.id ?? "",
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    expect(signed.ok).toBe(true);
  });

  it("blocks replacing the registration selfie only after block 1 has real daily evidence", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Con Evidencia",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    participant.visualVerifications.push({
      attemptSelfieKey: "daily-selfie.jpg",
      attemptStorageBucket: "participant-evidence",
      blockNumber: 1,
      id: "verification-1",
      overrideReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      sequenceNumber: 1,
      similarityScore: 0.8,
      status: "MATCHED",
      verificationDate: new Date("2026-07-01T13:00:00.000Z")
    });

    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant.id,
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    expect(signed.ok).toBe(false);
    expect(signed.ok ? "" : signed.message).toBe("La selfie de registro sólo puede reemplazarse antes de iniciar el Bloque 1.");
  });

  it("does not send HUT WhatsApp when an admin creates a participant without a registration selfie", async () => {
    const { prisma } = createFakeHutPrisma();
    const whatsapp = createFakeWhatsAppRepository();
    const repository = createHutRepository(prisma as never, whatsapp);

    const created = await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-010",
      name: "Participante Manual",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });

    expect(created.ok).toBe(true);
    expect(whatsapp.createOutboundMessage).not.toHaveBeenCalled();
  });

  it("does not block application photo WhatsApp because registration selfie is missing", async () => {
    const { prisma } = createFakeHutPrisma();
    const whatsapp = createFakeWhatsAppRepository();
    const repository = createHutRepository(prisma as never, whatsapp);
    const created = await repository.createParticipant({
      protocolVersion: "APPLICATION_PHOTO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-010-A",
      name: "Participante Fotos",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    const sent = await repository.sendRegistrationWhatsApp({
      participantId: participant.id,
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(created.ok).toBe(true);
    expect(participant.referenceSelfie).toBeNull();
    expect(sent.ok ? "" : sent.message).not.toBe("Guarda la selfie de registro para habilitar el inicio del HUT.");
    expect(sent.ok ? "" : sent.message).toBe("Faltan variables de entorno para enviar por WhatsApp.");
    expect(whatsapp.createOutboundMessage).toHaveBeenCalled();
  });

  it("sends HUT WhatsApp after saving the admin registration selfie and does not duplicate a sent message", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const whatsapp = createFakeWhatsAppRepository();
    const repository = createHutRepository(prisma as never, whatsapp);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-011",
      name: "Participante WhatsApp",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant.id,
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    const confirmed = await repository.confirmReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      participantId: participant.id,
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const firstSendCount = whatsapp.createOutboundMessage.mock.calls.length;
    whatsapp.latestMessage = fakeWhatsAppMessage({ status: "accepted" });
    const confirmedAgain = await repository.confirmReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      participantId: participant.id,
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(confirmed.ok).toBe(true);
    expect(firstSendCount).toBeGreaterThan(0);
    expect(confirmedAgain.ok).toBe(true);
    expect(whatsapp.createOutboundMessage).toHaveBeenCalledTimes(firstSendCount);
  });

  it("keeps the registration selfie when HUT WhatsApp fails after saving", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const whatsapp = createFakeWhatsAppRepository();
    const repository = createHutRepository(prisma as never, whatsapp);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-012",
      name: "Participante Error WhatsApp",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant.id,
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    const confirmed = await repository.confirmReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      participantId: participant.id,
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok ? confirmed.message : "").toContain("Faltan variables de entorno para enviar por WhatsApp.");
    expect(participant.referenceSelfie?.privateStorageKey).toContain("/reference-selfie/");
  });

  it("creates a HUT registration folio with rotation and registration link", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const result = await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-001",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.link : "").toContain("https://example.com/hut/register/");
    expect(prisma.state.registrationSlots[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-001",
      secondFragranceRightArm: "FRAGANCIA B",
      status: "AVAILABLE"
    });
  });

  it("registers a participant from folio link and stores reference selfie", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-002",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    const registered = await repository.completeRegistration({
      email: "ana@example.com",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana Participante",
      phone: "55 1234 5678",
      recruiter: "Gaby",
      requestOrigin: "https://example.com",
      token
    });

    expect(registered.ok).toBe(true);
    expect(prisma.state.registrationSlots[0]?.status).toBe("REGISTERED");
    expect(prisma.state.participants[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-002",
      name: "ANA PARTICIPANTE",
      phone: "5512345678",
      secondFragranceRightArm: "FRAGANCIA B",
      status: "BLOCK_1_IN_PROGRESS"
    });
    expect(prisma.state.participants[0]?.referenceSelfie?.privateStorageKey).toContain("/hut-registration-slots/");
    expect(registered.ok ? registered.data.participantLink : "").toContain("/hut/p/");
  });

  it("sends HUT WhatsApp after public folio registration because the registration selfie is already stored", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const whatsapp = createFakeWhatsAppRepository();
    const repository = createHutRepository(prisma as never, whatsapp);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-020",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });

    const registered = await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana Participante",
      phone: "55 1234 5678",
      requestOrigin: "https://example.com",
      token
    });

    expect(registered.ok).toBe(true);
    expect(whatsapp.createOutboundMessage).toHaveBeenCalled();
  });

  it("does not allow registering the same HUT folio twice", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-003",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      token
    });
    const second = await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Otra Persona",
      phone: "5587654321",
      requestOrigin: "https://example.com",
      token
    });

    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.message).toBe("Este folio ya fue registrado.");
    expect(prisma.state.participants).toHaveLength(1);
  });

  it("assigns an available HUT slot to an admin-created participant", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Admin",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-010",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const slot = prisma.state.registrationSlots[0]!;
    const assigned = await repository.assignParticipantRotation({
      participantId: participant.id,
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(assigned.ok).toBe(true);
    expect(participant).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-010",
      secondFragranceRightArm: "FRAGANCIA B"
    });
    expect(slot).toMatchObject({
      participantId: participant.id,
      status: "REGISTERED"
    });
  });

  it("syncs linked NAV contact data automatically when assigning a HUT slot", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "HUT temporal",
      phone: null,
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "247",
      folio: "HUT-111",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "583",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.studyParticipantId = "study-participant-nav-111";
    participant.studyParticipant = {
      participantProfile: {
        email: "martin@example.test",
        name: "Martin Valerio Gonzalez",
        phone: "5569613589"
      }
    };
    participant.phaseCodes = [
      {
        codeHash: "hash-1",
        encryptedCode: "encrypted-1",
        id: "phase-1",
        participantId: participant.id,
        phase: "COLOCACION",
        slot: 1,
        status: "GENERATED"
      }
    ];
    const assigned = await repository.assignParticipantRotation({
      participantId: participant.id,
      slotId: prisma.state.registrationSlots[0]!.id,
      studyId: "study-hut"
    });

    expect(assigned.ok).toBe(true);
    expect(participant).toMatchObject({
      email: "martin@example.test",
      firstFragranceLeftArm: "247",
      folio: "HUT-111",
      name: "Martin Valerio Gonzalez",
      phone: "5569613589",
      secondFragranceRightArm: "583"
    });
    expect(participant.phaseCodes).toHaveLength(1);
  });

  it("creates an admin participant directly with an available HUT slot", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-014",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const slot = prisma.state.registrationSlots[0]!;
    const created = await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Con Slot",
      requestOrigin: "https://example.com",
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(created.ok).toBe(true);
    expect(prisma.state.participants[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-014",
      secondFragranceRightArm: "FRAGANCIA B"
    });
    expect(slot).toMatchObject({
      participantId: prisma.state.participants[0]?.id,
      status: "REGISTERED"
    });
  });

  it("blocks assigning a slot already assigned to another participant", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({ name: "Uno", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createParticipant({ name: "Dos", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-011",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const slot = prisma.state.registrationSlots[0]!;
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]!.id,
      slotId: slot.id,
      studyId: "study-hut"
    });
    const second = await repository.assignParticipantRotation({
      participantId: prisma.state.participants[1]!.id,
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.message).toBe("Este folio ya fue registrado.");
  });

  it("shows participant portal link when a HUT registration slot was assigned from admin", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({ name: "Uno", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-015",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]?.id ?? "",
      slotId: prisma.state.registrationSlots[0]?.id ?? "",
      studyId: "study-hut"
    });
    const view = await repository.getRegistrationView(
      prisma.state.registrationSlots[0]?.registrationToken ?? "",
      "https://example.com"
    );

    expect(view.ok).toBe(true);
    expect(view.ok ? view.data.status : "").toBe("REGISTERED");
    expect(view.ok ? view.data.participantLink : "").toContain("https://example.com/hut/p/");
  });

  it("does not allow duplicate manual HUT folio in the same study", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-012",
      name: "Uno",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const duplicate = await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia C",
      folio: "HUT-012",
      name: "Dos",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia D",
      studyId: "study-hut"
    });

    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok ? "" : duplicate.message).toBe("Ya existe un participante HUT con ese folio.");
    expect(prisma.state.participants).toHaveLength(1);
  });

  it("deletes a HUT participant with related records and releases its slot", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-013",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      token
    });
    const participant = prisma.state.participants[0]!;
    participant.visualVerifications.push({
      attemptSelfieKey: "daily.jpg",
      attemptStorageBucket: "participant-evidence",
      blockNumber: 1,
      id: "verification-extra",
      overrideReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      sequenceNumber: 1,
      similarityScore: 0.81,
      status: "MATCHED",
      verificationDate: new Date("2026-07-01T12:00:00.000Z")
    });
    participant.videoSubmissions.push({
      blockId: participant.blocks[0]!.id,
      blockNumber: 1,
      extension: "mp4",
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      participantId: participant.id,
      privateStorageKey: "video.mp4",
      sequenceNumber: 1,
      sizeBytes: 1024,
      storageBucket: "participant-evidence"
    });
    participant.dailyChecks.push({
      blockDayNumber: 1,
      blockId: participant.blocks[0]!.id,
      blockNumber: 1,
      date: new Date(),
      expectedVideoSequence: 1,
      participantId: participant.id,
      status: "COMPLETED"
    });
    const deleted = await repository.deleteParticipant({
      confirmation: "ELIMINAR PARTICIPANTE HUT",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(deleted.ok).toBe(true);
    expect(prisma.state.participants).toHaveLength(0);
    expect(prisma.state.registrationSlots[0]).toMatchObject({
      participantId: null,
      registeredAt: null,
      status: "AVAILABLE"
    });
  });

  it("blocks video upload when registration selfie is missing", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Sin Selfie",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const result = await repository.requestVideoUpload({
      metadata: videoMetadata(),
      storage,
      token: prisma.state.participants[0]?.token ?? ""
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("registro aun no esta completo");
  });

  it("does not request selfie or upload before 5 a.m. in study timezone", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block(),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T10:59:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.available).toBe(false);
    expect(availability.reason).toBe("WAIT_UNTIL_5_AM");
  });

  it("asks for daily selfie after 5 a.m. when no verification exists", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block(),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:00:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.available).toBe(true);
    expect(availability.reason).toBe("AVAILABLE_FOR_SELFIE");
  });

  it("makes video 2 unavailable until 5 a.m. of the next day after video 1", () => {
    const nextAvailable = hutBlockDayAvailableAt({
      blockDayNumber: 2,
      startDate: new Date("2026-07-01T06:00:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });
    const availability = getHutCurrentAvailability({
      block: {
        ...block({ submittedVideosCount: 1 }),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date(nextAvailable.getTime() - 60_000),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.reason).toBe("WAIT_UNTIL_5_AM");
    expect(availability.expectedVideoSequence).toBe(2);
  });

  it("blocks a second video on the same local day even when the next block day is already open", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block({ submittedVideosCount: 1 }),
        startDate: new Date("2026-07-09T00:00:00.000Z")
      },
      dailyChecks: [
        {
          blockDayNumber: 1,
          date: new Date("2026-07-10T02:50:00.000Z")
        }
      ],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-10T02:51:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.available).toBe(false);
    expect(availability.reason).toBe("WAIT_UNTIL_NEXT_DAY");
    expect(availability.expectedVideoSequence).toBe(2);
  });

  it("unlocks video 2 the next day after 5 a.m. in normal mode", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block({ submittedVideosCount: 1 }),
        startDate: new Date("2026-07-09T00:00:00.000Z")
      },
      dailyChecks: [
        {
          blockDayNumber: 1,
          date: new Date("2026-07-10T02:50:00.000Z")
        }
      ],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-10T11:00:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.reason).toBe("AVAILABLE_FOR_SELFIE");
  });

  it("test mode ignores the 5 a.m. availability wait without affecting normal participants", () => {
    const blockInput = {
      ...block({ submittedVideosCount: 1 }),
      startDate: new Date("2026-07-01T06:00:00.000Z")
    };
    const normalAvailability = getHutCurrentAvailability({
      block: blockInput,
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:30:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });
    const testModeAvailability = getHutCurrentAvailability({
      block: blockInput,
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:30:00.000Z"),
      testMode: true,
      timeZoneIana: "America/Mexico_City"
    });

    expect(normalAvailability.reason).toBe("WAIT_UNTIL_5_AM");
    expect(testModeAvailability.reason).toBe("AVAILABLE_FOR_SELFIE");
  });

  it("daily selfie matched allows the video upload", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Matched",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    participant!.referenceSelfie = referenceSelfie();
    const token = participant?.token ?? "";
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });
    const verified = await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("MATCH", 0.62),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });

    expect(verified.ok ? verified.data.status : "").toBe("MATCHED");
    expect(video.ok).toBe(true);
  });

  it("rejects preparing video 2 on the same local day in normal mode even when called directly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T02:50:00.000Z"));
    try {
      const { prisma, storage } = createFakeHutPrisma();
      const repository = createHutRepository(prisma as never);
      await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
        name: "Participante Diario",
        requestOrigin: "https://example.com",
        startDate: new Date("2026-07-09T14:00:00.000Z"),
        studyId: "study-hut"
      });
      const participant = prisma.state.participants[0]!;
      participant.referenceSelfie = referenceSelfie();
      const token = participant.token;
      const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });
      const verified = await repository.confirmDailySelfieUpload({
        faceVerification: faceResult("MATCH", 0.62),
        metadata: {
          ...selfieMetadata(),
          privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
          storageBucket: signed.ok ? signed.data.storageBucket : ""
        },
        token
      });
      const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });
      const confirmedVideo = await repository.confirmVideoUpload({
        metadata: {
          ...videoMetadata(),
          privateStorageKey: video.ok ? video.data.privateStorageKey : "",
          storageBucket: video.ok ? video.data.storageBucket : ""
        },
        token
      });

      expect(verified.ok ? verified.data.status : "").toBe("MATCHED");
      expect(confirmedVideo.ok).toBe(true);
      participant.visualVerifications.push({
        attemptSelfieKey: "daily-selfie-video-2.jpg",
        attemptStorageBucket: "participant-evidence",
        blockNumber: 1,
        id: "verification-video-2",
        overrideReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        sequenceNumber: 2,
        similarityScore: 0.8,
        status: "MATCHED",
        verificationDate: new Date("2026-07-10T02:51:00.000Z")
      });

      const secondVideo = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });

      expect(secondVideo.ok).toBe(false);
      expect(secondVideo.ok ? "" : secondVideo.message).toBe(
        "Este video aún no está disponible. Intenta nuevamente mañana a partir de las 5:00 a.m."
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("test mode allows preparing the next video on the same local day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T02:50:00.000Z"));
    try {
      const { prisma, storage } = createFakeHutPrisma();
      const repository = createHutRepository(prisma as never);
      await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
        name: "Participante Test Mode",
        requestOrigin: "https://example.com",
        startDate: new Date("2026-07-09T14:00:00.000Z"),
        studyId: "study-hut"
      });
      const participant = prisma.state.participants[0]!;
      participant.referenceSelfie = referenceSelfie();
      participant.testMode = true;
      const token = participant.token;
      participant.dailyChecks.push({
        blockDayNumber: 1,
        blockId: participant.blocks[0]!.id,
        blockNumber: 1,
        date: new Date("2026-07-10T02:49:00.000Z"),
        expectedVideoSequence: 1,
        participantId: participant.id,
        status: "COMPLETED"
      });

      const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });

      expect(signed.ok).toBe(true);
      expect(signed.ok ? signed.data.privateStorageKey : "").toContain("/daily-selfie/");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists participant test mode and allows consecutive uploads without calendar waits", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Prueba",
      requestOrigin: "https://example.com",
      startDate: new Date("2026-07-01T06:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const enabled = await repository.setTestMode({
      enabled: true,
      participantId: participant.id,
      studyId: "study-hut"
    });

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    expect(enabled.ok).toBe(true);
    expect(participant.testMode).toBe(true);
    expect(participant.videoSubmissions).toHaveLength(2);
    expect(participant.currentVideoSequence).toBe(3);
  });

  it("allows disabling test mode after it was activated", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Modo",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    await repository.setTestMode({
      enabled: true,
      participantId: participant.id,
      studyId: "study-hut"
    });
    const disabled = await repository.setTestMode({
      enabled: false,
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(disabled.ok).toBe(true);
    expect(participant.testMode).toBe(false);
  });

  it("daily selfie failed blocks the video upload", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Fallo",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    participant!.referenceSelfie = referenceSelfie();
    const token = participant?.token ?? "";
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("NO_MATCH", 0.2),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });

    expect(video.ok).toBe(false);
    expect(video.ok ? "" : video.message).toContain("No pudimos confirmar tu identidad");
  });

  it("uploads video 1, 2 and 3 and then enables phone evaluation", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Uno",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const token = prisma.state.participants[0]?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    expect(prisma.state.participants[0]?.currentVideoSequence).toBe(2);
    await uploadNextVideo(repository, token, storage, prisma.state);
    expect(prisma.state.participants[0]?.currentVideoSequence).toBe(3);
    await uploadNextVideo(repository, token, storage, prisma.state);

    expect(created.ok).toBe(true);
    expect(prisma.state.participants[0]?.blocks[0]?.submittedVideosCount).toBe(3);
    expect(prisma.state.participants[0]?.blocks[0]?.status).toBe("CALL_PENDING");
    expect(prisma.state.participants[0]?.status).toBe("BLOCK_1_CALL_PENDING");
  });

  it("shows submitted videos in the admin dashboard with signed links", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Video",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    const dashboard = await repository.getAdminDashboard({
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    expect(dashboard?.participants[0]?.block1?.videos).toHaveLength(3);
    expect(dashboard?.participants[0]?.block1?.videos[0]).toMatchObject({
      sequenceNumber: 1,
      signedUrl: expect.stringContaining("https://storage.example/")
    });
    expect(dashboard?.participants[0]?.block1?.videos[1]).toMatchObject({
      sequenceNumber: 2,
      signedUrl: null
    });
  });

  it("includes signed identity review URLs without exposing private storage keys", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Identidad",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token: participant.token });
    await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("UNCERTAIN", 0.47),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token: participant.token
    });

    const dashboard = await repository.getAdminDashboard({
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });
    const review = dashboard?.participants[0]?.identityReview.items.find((item) => item.blockNumber === 1 && item.sequenceNumber === 1);

    expect(dashboard?.participants[0]?.referenceSelfie.signedUrl).toContain("https://storage.example/");
    expect(review).toMatchObject({
      reviewLabel: "Revisión requerida",
      similarityPercentage: 47,
      status: "UNCERTAIN"
    });
    expect(review?.attemptSignedUrl).toContain("https://storage.example/");
    expect(review).not.toHaveProperty("attemptSelfieKey");
  });

  it("allows approving identity manually and unlocks the participant when blocked only by visual review", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Manual",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token: participant.token });
    await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("NO_MATCH", 0.22),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token: participant.token
    });
    const verificationId = participant.visualVerifications[0]!.id;

    const approved = await repository.reviewVisualVerification({
      actorUserId: "user-1",
      decision: "approve",
      participantId: participant.id,
      reason: "Supervisor confirma que es la misma persona.",
      studyId: "study-hut",
      verificationId
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token: participant.token });

    expect(approved.ok).toBe(true);
    expect(participant.visualVerifications[0]).toMatchObject({
      overrideReason: "Supervisor confirma que es la misma persona.",
      reviewedAt: expect.any(Date),
      reviewedByUserId: "user-1",
      status: "MATCHED"
    });
    expect(video.ok).toBe(true);
  });

  it("allows rejecting identity manually and keeps the participant blocked", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Rechazo",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token: participant.token });
    await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("UNCERTAIN", 0.41),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token: participant.token
    });
    const verificationId = participant.visualVerifications[0]!.id;

    const rejected = await repository.reviewVisualVerification({
      actorUserId: "user-2",
      decision: "reject",
      participantId: participant.id,
      reason: "No coincide con la selfie base.",
      studyId: "study-hut",
      verificationId
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token: participant.token });

    expect(rejected.ok).toBe(true);
    expect(participant.visualVerifications[0]).toMatchObject({
      overrideReason: "No coincide con la selfie base.",
      reviewedByUserId: "user-2",
      status: "NOT_MATCHED"
    });
    expect(video.ok).toBe(false);
    expect(video.ok ? "" : video.message).toContain("No pudimos confirmar tu identidad");
  });

  it("resets a reference selfie without deleting the HUT participant", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Selfie",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    const reset = await repository.resetReferenceSelfie({
      confirmation: "ELIMINAR SELFIE DE REGISTRO",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(reset.ok).toBe(true);
    expect(prisma.state.participants).toHaveLength(1);
    expect(participant.referenceSelfie).toBeNull();
    expect(participant.visualVerifications).toHaveLength(0);
  });

  it("resets a submitted video and recalculates the next expected sequence", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Reset",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    const reset = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 2",
      participantId: participant.id,
      sequenceNumber: 2,
      studyId: "study-hut"
    });

    expect(reset.ok).toBe(true);
    expect(participant.videoSubmissions.map((video) => video.sequenceNumber)).toEqual([1]);
    expect(participant.visualVerifications.map((verification) => verification.sequenceNumber)).toEqual([1]);
    expect(participant.blocks[0]?.submittedVideosCount).toBe(1);
    expect(participant.currentVideoSequence).toBe(2);
  });

  it("requires special confirmation when resetting a video after call evaluation was completed", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Evaluado",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant.id, studyId: "study-hut" });

    const blocked = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 3",
      participantId: participant.id,
      sequenceNumber: 3,
      studyId: "study-hut"
    });
    const allowed = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 3 CON EVALUACION",
      participantId: participant.id,
      sequenceNumber: 3,
      studyId: "study-hut"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toContain("evaluacion 1 ya esta completada");
    expect(allowed.ok).toBe(true);
    expect(participant.videoSubmissions.map((video) => video.sequenceNumber)).toEqual([1, 2]);
    expect(participant.callEvaluations[0]?.status).toBe("PENDING");
    expect(participant.blocks[0]?.status).toBe("IN_PROGRESS");
  });

  it("blocks resetting evaluation 1 when block 2 has progress unless special confirmation is provided", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-RESET-1",
      name: "Participante Bloque 2",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant.id, studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant.id,
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    const blocked = await repository.resetCallEvaluation({
      blockNumber: 1,
      confirmation: "RESTABLECER EVALUACION 1",
      participantId: participant.id,
      studyId: "study-hut"
    });
    const allowed = await repository.resetCallEvaluation({
      blockNumber: 1,
      confirmation: "RESTABLECER EVALUACION 1 CON BLOQUE 2",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toContain("El bloque 2 ya tiene avance");
    expect(allowed.ok).toBe(true);
    expect(allowed.ok ? allowed.message : "").toContain("Bloque 1 restablecido");
    expect(participant.callEvaluations[0]?.status).toBe("PENDING");
    expect(participant.referenceSelfie).not.toBeNull();
    expect(participant.folio).toBe("HUT-RESET-1");
    expect(participant.firstFragranceLeftArm).toBe("FRAGANCIA A");
    expect(participant.videoSubmissions.filter((video) => video.blockNumber === 1)).toHaveLength(0);
    expect(participant.dailyChecks.filter((check) => check.blockNumber === 1)).toHaveLength(0);
    expect(participant.visualVerifications.filter((verification) => verification.blockNumber === 1)).toHaveLength(0);
    expect(participant.videoSubmissions.filter((video) => video.blockNumber === 2)).toHaveLength(1);
    expect(participant.blocks[0]).toMatchObject({
      missedDaysCount: 0,
      startDate: null,
      status: "NOT_STARTED",
      submittedVideosCount: 0
    });
    expect(participant.blocks[1]?.status).toBe("IN_PROGRESS");
    expect(participant.currentBlockNumber).toBe(1);
    expect(participant.currentVideoSequence).toBe(1);
    expect(participant.status).toBe("NOT_STARTED");
  });

  it("resets block 2 completely without touching block 1", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Reset Bloque 2",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant.id, studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant.id,
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    const reset = await repository.resetCallEvaluation({
      blockNumber: 2,
      confirmation: "RESTABLECER EVALUACION 2",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(reset.ok).toBe(true);
    expect(participant.videoSubmissions.filter((video) => video.blockNumber === 1)).toHaveLength(3);
    expect(participant.videoSubmissions.filter((video) => video.blockNumber === 2)).toHaveLength(0);
    expect(participant.dailyChecks.filter((check) => check.blockNumber === 2)).toHaveLength(0);
    expect(participant.visualVerifications.filter((verification) => verification.blockNumber === 2)).toHaveLength(0);
    expect(participant.blocks[0]?.status).toBe("COMPLETED");
    expect(participant.blocks[1]).toMatchObject({
      missedDaysCount: 0,
      startDate: null,
      status: "NOT_STARTED",
      submittedVideosCount: 0
    });
    expect(participant.currentBlockNumber).toBe(2);
    expect(participant.currentVideoSequence).toBe(1);
    expect(participant.status).toBe("NOT_STARTED");
  });

  it("allows one omitted day and keeps the next upload as video 2", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Dos",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", reminderSent: true, studyId: "study-hut" });
    expect(participant?.currentVideoSequence).toBe(2);
    await uploadNextVideo(repository, token, storage, prisma.state);

    expect(participant?.blocks[0]?.missedDaysCount).toBe(1);
    expect(participant?.videoSubmissions[1]?.sequenceNumber).toBe(2);
  });

  it("disqualifies when a second day is omitted within the same block", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Tres",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", reminderSent: true, studyId: "study-hut" });
    await uploadNextVideo(repository, token, storage, prisma.state);
    const result = await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(result.ok).toBe(true);
    expect(participant?.status).toBe("DISQUALIFIED");
    expect(participant?.blocks[0]?.status).toBe("DISQUALIFIED");
  });

  it("starts block 2 after evaluation 1 and gives it independent tolerance", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Cuatro",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant?.id ?? "", studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant?.id ?? "",
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(participant?.blocks[0]?.missedDaysCount).toBe(1);
    expect(participant?.blocks[1]?.missedDaysCount).toBe(1);
    expect(participant?.status).toBe("BLOCK_2_IN_PROGRESS");
  });

  it("completes evaluation 2 and marks participation as completed", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Cinco",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant?.id ?? "", studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant?.id ?? "",
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 2, participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(participant?.status).toBe("COMPLETED");
  });

  it("exposes captured call evaluation details in the admin dashboard", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      name: "Participante Evaluaciones",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({
      blockNumber: 1,
      evaluatorName: "Supervisora Uno",
      notes: "Respondio sin incidencias.",
      participantId: participant.id,
      studyId: "study-hut"
    });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant.id,
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({
      blockNumber: 2,
      evaluatorName: "Supervisora Dos",
      notes: "Cierre completo.",
      participantId: participant.id,
      studyId: "study-hut"
    });

    const dashboard = await repository.getAdminDashboard({
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(dashboard?.participants[0]?.call1).toMatchObject({
      evaluatorName: "SUPERVISORA UNO",
      notes: "Respondio sin incidencias.",
      status: "COMPLETED"
    });
    expect(dashboard?.participants[0]?.call2).toMatchObject({
      evaluatorName: "SUPERVISORA DOS",
      notes: "Cierre completo.",
      status: "COMPLETED"
    });
  });

  it("exports HUT progress as clean TSV", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      protocolVersion: "LEGACY_VIDEO",
      email: "participante@example.com",
      name: "Participante con Ñ",
      phone: "5512345678",
      recruiter: "Reclutadora",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-004",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]?.id ?? "",
      slotId: prisma.state.registrationSlots[0]?.id ?? "",
      studyId: "study-hut"
    });

    const result = await repository.exportProgress({
      now: new Date("2026-07-01T00:00:00.000Z"),
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(result.ok ? result.data.filename : "").toBe("HUT-TEST_hut_avance_2026-07-01.tsv");
    expect(result.ok ? result.data.body : "").toContain("ID\tFolio\tNombre\tCelular\tCorreo\tReclutador");
    expect(result.ok ? result.data.body : "").toContain("PARTICIPANTE CON Ñ");
    expect(result.ok ? result.data.body : "").toContain("Folio\tLink de registro\tLink participante\tEstado");
    expect(result.ok ? result.data.body : "").toContain("HUT-004\thttps://example.com/hut/register/");
    expect(result.ok ? result.data.body : "").toContain("https://example.com/hut/p/");
    expect(result.ok ? result.data.body : "").toContain("FRAGANCIA A\tFRAGANCIA B");
  });

  it("parses participant import text and preserves tabular export columns", () => {
    const rows = parseHutParticipantImportText("nombre\tcelular\tcorreo\treclutador\nAna Ñ\t5512345678\tana@example.com\tGaby");
    const tsv = buildHutTsv([
      ["Nombre", "Notas"],
      [rows[0]?.name, "Texto con\t tab y\nsalto; conserva comas"]
    ]);

    expect(rows[0]).toMatchObject({ name: "ANA Ñ", phone: "5512345678", recruiter: "GABY" });
    expect(tsv.startsWith("\uFEFF")).toBe(true);
    expect(tsv).toContain("ANA Ñ\tTexto con tab y salto; conserva comas");
  });

  it("parses HUT registration folios with rotation", () => {
    const rows = parseHutRegistrationSlotImportText(
      "folio\tprimera fragancia / brazo izquierdo\tsegunda fragancia / brazo derecho\nHUT-005\tFragancia A\tFragancia B"
    );

    expect(rows[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-005",
      secondFragranceRightArm: "FRAGANCIA B"
    });
  });
});

function block(input: Partial<Parameters<typeof applyHutVideoSubmission>[0]> = {}) {
  return {
    blockNumber: 1 as const,
    maxMissedDaysAllowed: 1,
    missedDaysCount: 0,
    requiredVideos: 3,
    status: "IN_PROGRESS" as const,
    submittedVideosCount: 0,
    ...input
  };
}

async function uploadNextVideo(
  repository: ReturnType<typeof createHutRepository>,
  token: string,
  storage: HutStorageClient,
  state: { participants: FakeParticipant[] }
) {
  const participant = state.participants.find((item) => item.token === token);
  if (participant) {
    participant.referenceSelfie ??= referenceSelfie();
    participant.testMode = true;
    const activeBlock = participant.blocks.find((item) => item.status === "IN_PROGRESS");
    const sequenceNumber = activeBlock ? activeBlock.submittedVideosCount + 1 : 1;
    participant.visualVerifications.unshift({
      attemptSelfieKey: `daily-${activeBlock?.blockNumber ?? 1}-${sequenceNumber}.jpg`,
      attemptStorageBucket: "participant-evidence",
      blockNumber: activeBlock?.blockNumber ?? 1,
      id: `verification-${participant.visualVerifications.length + 1}`,
      overrideReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      sequenceNumber,
      similarityScore: 0.82,
      status: "MATCHED",
      verificationDate: new Date("2026-07-01T12:00:00.000Z")
    });
  }
  const requested = await repository.requestVideoUpload({
    metadata: {
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      sizeBytes: 1024
    },
    storage,
    token
  });
  expect(requested.ok).toBe(true);

  const confirmed = await repository.confirmVideoUpload({
    metadata: {
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      privateStorageKey: requested.ok ? requested.data.privateStorageKey : "",
      sizeBytes: 1024,
      storageBucket: requested.ok ? requested.data.storageBucket : ""
    },
    token
  });

  expect(confirmed.ok).toBe(true);
}

function createFakeHutPrisma() {
  const state = {
    applicationPhotoEntries: [] as FakeApplicationPhotoEntry[],
    auditLogs: [] as FakeAuditLog[],
    answers: [] as FakeHutAnswer[],
    confirmations: [] as FakeParticipantConfirmation[],
    nextId: 1,
    phaseCodes: [] as FakeHutPhaseCode[],
    participants: [] as FakeParticipant[],
    questionnaireAttempts: [] as FakeHutQuestionnaireAttempt[],
    registrationSlots: [] as FakeRegistrationSlot[],
    study: {
      code: "HUT-TEST",
      id: "study-hut",
      name: "Estudio HUT",
      status: "ACTIVE",
      timeZoneIana: "America/Mexico_City"
    }
  };

  type FakePrisma = {
    [key: string]: unknown;
    $connect: ReturnType<typeof vi.fn>;
    $disconnect: ReturnType<typeof vi.fn>;
    $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
    state: typeof state;
  };

  const prisma: FakePrisma = {
    state,
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>) {
      return callback(prisma);
    },
    auditLog: {
      async create(args: { data: FakeAuditLog }) {
        state.auditLogs.push(args.data);
        return args.data;
      }
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === state.study.id ? state.study : null;
      }
    },
    participantConfirmation: {
      async findFirst(args: { where: { folio?: string; studyId?: string; studyParticipantId?: string } }) {
        return (
          state.confirmations.find(
            (confirmation) =>
              (!args.where.folio || confirmation.folio === args.where.folio) &&
              (!args.where.studyId || confirmation.studyId === args.where.studyId) &&
              (!args.where.studyParticipantId || confirmation.studyParticipant.id === args.where.studyParticipantId)
          ) ?? null
        );
      },
      async findMany(args: { where: { folio?: { in: string[] }; studyId: string } }) {
        return state.confirmations.filter(
          (confirmation) =>
            confirmation.studyId === args.where.studyId &&
            (!args.where.folio?.in.length || args.where.folio.in.includes(confirmation.folio))
        );
      }
    },
    hutParticipant: {
      async create(args: { data: Partial<FakeParticipant> }) {
        const participant: FakeParticipant = {
          applicationEvidence: [],
          applicationPhotoEntries: [],
          blocks: [],
          callEvaluations: [],
          currentBlockNumber: Number(args.data.currentBlockNumber ?? 1),
          currentVideoSequence: Number(args.data.currentVideoSequence ?? 1),
          dailyChecks: [],
          email: (args.data.email as string | null) ?? null,
          firstFragranceLeftArm: (args.data.firstFragranceLeftArm as string | null) ?? null,
          folio: (args.data.folio as string | null) ?? null,
          id: `participant-${state.nextId++}`,
          name: String(args.data.name),
          origin: (args.data.origin as FakeParticipant["origin"]) ?? "HUT_DIRECTO",
          phaseCodes: [],
          phone: (args.data.phone as string | null) ?? null,
          protocolVersion: (args.data.protocolVersion as FakeParticipant["protocolVersion"]) ?? "LEGACY_VIDEO",
          questionnaireAttempt: null,
          recruiter: (args.data.recruiter as string | null) ?? null,
          referenceSelfie: null,
          registrationSlot: null,
          secondFragranceRightArm: (args.data.secondFragranceRightArm as string | null) ?? null,
          startDate: (args.data.startDate as Date | null) ?? null,
          status: (args.data.status as FakeParticipant["status"]) ?? "NOT_STARTED",
          study: state.study,
          studyId: String(args.data.studyId),
          studyParticipant: null,
          studyParticipantId: (args.data.studyParticipantId as string | null) ?? null,
          testMode: Boolean(args.data.testMode ?? false),
          token: String(args.data.token),
          visualOverrideEnabled: false,
          visualOverrideReason: null,
          visualVerifications: [],
          videoSubmissions: []
        };
        state.participants.push(participant);
        return { id: participant.id };
      },
      async findFirst(args: { where: { OR?: Array<{ email?: string; phone?: string }>; folio?: string; studyId?: string; studyParticipantId?: string } }) {
        if (args.where.studyParticipantId) {
          return (
            state.participants.find(
              (participant) =>
                participant.studyParticipantId === args.where.studyParticipantId &&
                (!args.where.studyId || participant.studyId === args.where.studyId)
            ) ?? null
          );
        }
        if (args.where.folio) {
          return (
            state.participants.find(
              (participant) => (!args.where.studyId || participant.studyId === args.where.studyId) && participant.folio === args.where.folio
            ) ?? null
          );
        }
        return (
          state.participants.find(
            (participant) =>
              (!args.where.studyId || participant.studyId === args.where.studyId) &&
              args.where.OR?.some((condition) =>
                condition.email ? condition.email === participant.email : condition.phone === participant.phone
              )
          ) ?? null
        );
      },
      async findMany(args: { where: { studyId: string } }) {
        return state.participants.filter((participant) => participant.studyId === args.where.studyId);
      },
      async findUnique(args: { where: { id?: string; token?: string } }) {
        return state.participants.find((participant) => participant.id === args.where.id || participant.token === args.where.token) ?? null;
      },
      async update(args: { data: Partial<FakeParticipant>; where: { id: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.id);
        if (participant) {
          Object.assign(participant, args.data);
          if (args.data.studyParticipantId) {
            const confirmation = state.confirmations.find((item) => item.studyParticipant.id === args.data.studyParticipantId);
            participant.studyParticipant = confirmation
              ? {
                  participantProfile: confirmation.studyParticipant.participantProfile
                }
              : participant.studyParticipant;
          }
        }
        return participant;
      },
      async delete(args: { where: { id: string } }) {
        const index = state.participants.findIndex((item) => item.id === args.where.id);
        if (index >= 0) {
          const [deleted] = state.participants.splice(index, 1);
          return deleted;
        }
        return null;
      }
    },
    hutParticipantPhaseCode: {
      async create(args: { data: Omit<FakeHutPhaseCode, "id"> }) {
        const phaseCode: FakeHutPhaseCode = {
          ...args.data,
          createdAt: (args.data.createdAt as Date | null) ?? new Date("2026-07-01T12:00:00.000Z"),
          expiresAt: (args.data.expiresAt as Date | null) ?? null,
          id: `phase-code-${state.nextId++}`,
          sentAt: (args.data.sentAt as Date | null) ?? null,
          updatedAt: new Date("2026-07-01T12:00:00.000Z"),
          usedAt: (args.data.usedAt as Date | null) ?? null,
          validatedAt: (args.data.validatedAt as Date | null) ?? null
        };
        state.phaseCodes.push(phaseCode);
        const participant = state.participants.find((item) => item.id === phaseCode.participantId);
        participant?.phaseCodes.push(phaseCode);
        return phaseCode;
      },
      async findMany(args: { where: { participantId: string } }) {
        return state.phaseCodes.filter((code) => code.participantId === args.where.participantId);
      },
      async findFirst(args: { where: { codeHash?: string } }) {
        return state.phaseCodes.find((code) => code.codeHash === args.where.codeHash) ?? null;
      },
      async update(args: { data: Partial<FakeHutPhaseCode>; where: { id: string } }) {
        const phaseCode = state.phaseCodes.find((code) => code.id === args.where.id);
        if (phaseCode) {
          Object.assign(phaseCode, args.data, { updatedAt: new Date("2026-07-01T12:00:00.000Z") });
        }
        return phaseCode;
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const before = state.phaseCodes.length;
        state.phaseCodes = state.phaseCodes.filter((code) => code.participantId !== args.where.participantId);
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        if (participant) {
          participant.phaseCodes = [];
        }
        return { count: before - state.phaseCodes.length };
      }
    },
    hutRegistrationSlot: {
      async create(args: { data: Partial<FakeRegistrationSlot> }) {
        const slot: FakeRegistrationSlot = {
          firstFragranceLeftArm: String(args.data.firstFragranceLeftArm),
          folio: String(args.data.folio),
          id: `slot-${state.nextId++}`,
          participantId: null,
          registeredAt: null,
          registrationToken: String(args.data.registrationToken),
          secondFragranceRightArm: String(args.data.secondFragranceRightArm),
          status: (args.data.status as FakeRegistrationSlot["status"]) ?? "AVAILABLE",
          study: state.study,
          studyId: String(args.data.studyId)
        };
        state.registrationSlots.push(slot);
        return { id: slot.id };
      },
      async findFirst(args: { where: { folio?: string; studyId: string } }) {
        const slot =
          state.registrationSlots.find((item) => item.studyId === args.where.studyId && item.folio === args.where.folio) ?? null;
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async findMany(args: { where: { studyId: string } }) {
        return state.registrationSlots
          .filter((slot) => slot.studyId === args.where.studyId)
          .map((slot) => slotWithParticipant(slot, state.participants));
      },
      async findUnique(args: { where: { registrationToken?: string } }) {
        const slot =
          state.registrationSlots.find(
            (item) =>
              (args.where.registrationToken && item.registrationToken === args.where.registrationToken) ||
              ("id" in args.where && item.id === (args.where as { id?: string }).id)
          ) ?? null;
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async update(args: { data: Partial<FakeRegistrationSlot>; where: { id: string } }) {
        const slot = state.registrationSlots.find((item) => item.id === args.where.id);
        if (slot) {
          Object.assign(slot, args.data);
          const participant = state.participants.find((item) => item.id === slot.participantId);
          if (participant) {
            participant.registrationSlot = slot;
          }
        }
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async updateMany(args: { data: Partial<FakeRegistrationSlot>; where: { participantId: string } }) {
        const slots = state.registrationSlots.filter((item) => item.participantId === args.where.participantId);
        slots.forEach((slot) => Object.assign(slot, args.data));
        return { count: slots.length };
      }
    },
    hutBlock: {
      async create(args: { data: Partial<FakeBlock> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const block: FakeBlock = {
          blockNumber: args.data.blockNumber as 1 | 2,
          disqualificationReason: null,
          id: `block-${state.nextId++}`,
          maxMissedDaysAllowed: Number(args.data.maxMissedDaysAllowed ?? 1),
          missedDaysCount: 0,
          requiredVideos: Number(args.data.requiredVideos ?? 3),
          startDate: (args.data.startDate as Date | null) ?? null,
          status: (args.data.status as FakeBlock["status"]) ?? "NOT_STARTED",
          submittedVideosCount: 0
        };
        participant?.blocks.push(block);
        return block;
      },
      async update(args: { data: Partial<FakeBlock>; where: { id: string } }) {
        const block = state.participants.flatMap((participant) => participant.blocks).find((item) => item.id === args.where.id);
        if (block) {
          Object.assign(block, args.data);
        }
        return block;
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.blocks.length ?? 0;
        if (participant) {
          participant.blocks = [];
        }
        return { count };
      }
    },
    hutReferenceSelfie: {
      async create(args: { data: Partial<FakeReferenceSelfie> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const selfie = {
          capturedAt: (args.data.capturedAt as Date) ?? new Date(),
          id: `reference-${state.nextId++}`,
          privateStorageKey: String(args.data.privateStorageKey),
          storageBucket: String(args.data.storageBucket)
        };
        if (participant) {
          participant.referenceSelfie = selfie;
        }
        return selfie;
      },
      async findFirst(args: { where: { participantId: string } }) {
        return state.participants.find((item) => item.id === args.where.participantId)?.referenceSelfie ?? null;
      },
      async update(args: { data: Partial<FakeReferenceSelfie>; where: { id: string } }) {
        const participant = state.participants.find((item) => item.referenceSelfie?.id === args.where.id);
        if (participant?.referenceSelfie) {
          Object.assign(participant.referenceSelfie, args.data);
        }
        return participant?.referenceSelfie ?? null;
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.referenceSelfie ? 1 : 0;
        if (participant) {
          participant.referenceSelfie = null;
        }
        return { count };
      }
    },
    hutApplicationEvidence: {
      async create(args: { data: Partial<FakeApplicationEvidence> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const evidence: FakeApplicationEvidence = {
          capturedAt: (args.data.capturedAt as Date) ?? new Date(),
          extension: String(args.data.extension ?? "jpg"),
          id: `application-evidence-${state.nextId++}`,
          mimeType: String(args.data.mimeType),
          originalFilename: (args.data.originalFilename as string | null) ?? null,
          participantId: String(args.data.participantId),
          phase: args.data.phase as FakeApplicationEvidence["phase"],
          privateStorageKey: String(args.data.privateStorageKey),
          productCode: (args.data.productCode as string | null) ?? null,
          sizeBytes: Number(args.data.sizeBytes ?? 0),
          storageBucket: String(args.data.storageBucket)
        };
        participant?.applicationEvidence.push(evidence);
        return evidence;
      },
      async deleteMany(args: { where: { participantId: string; phase?: FakeApplicationEvidence["phase"] } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.applicationEvidence.length ?? 0;
        if (participant) {
          participant.applicationEvidence = participant.applicationEvidence.filter(
            (evidence) => args.where.phase && evidence.phase !== args.where.phase
          );
        }
        return { count: before - (participant?.applicationEvidence.length ?? 0) };
      }
    },
    hutQuestionnaireAttempt: {
      async upsert(args: {
        create: Partial<FakeHutQuestionnaireAttempt> & { participantId: string };
        update: Partial<FakeHutQuestionnaireAttempt>;
        where: { participantId?: string };
      }) {
        let attempt = state.questionnaireAttempts.find((item) => item.participantId === args.where.participantId);
        if (attempt) {
          Object.assign(attempt, args.update);
          const participant = state.participants.find((item) => item.id === attempt?.participantId);
          if (participant) {
            participant.questionnaireAttempt = attempt;
          }
          return attemptWithRelations(attempt, state);
        }
        attempt = {
          answers: [],
          completedAt: (args.create.completedAt as Date | null) ?? null,
          id: `hut-questionnaire-attempt-${state.nextId++}`,
          participantId: args.create.participantId,
          startedAt: (args.create.startedAt as Date | null) ?? null,
          status: (args.create.status as FakeHutQuestionnaireAttempt["status"]) ?? "PENDING",
          terminatedAt: (args.create.terminatedAt as Date | null) ?? null,
          terminationReason: (args.create.terminationReason as string | null) ?? null,
          visits: []
        };
        state.questionnaireAttempts.push(attempt);
        const participant = state.participants.find((item) => item.id === attempt?.participantId);
        if (participant) {
          participant.questionnaireAttempt = attempt;
        }
        return attemptWithRelations(attempt, state);
      },
      async findUnique(args: { where: { id?: string; participantId?: string } }) {
        const attempt =
          state.questionnaireAttempts.find(
            (item) => item.id === args.where.id || item.participantId === args.where.participantId
          ) ?? null;
        return attempt ? attemptWithRelations(attempt, state) : null;
      },
      async update(args: { data: Partial<FakeHutQuestionnaireAttempt>; where: { id: string } }) {
        const attempt = state.questionnaireAttempts.find((item) => item.id === args.where.id);
        if (attempt) {
          Object.assign(attempt, args.data);
        }
        return attempt ? attemptWithRelations(attempt, state) : null;
      }
    },
    hutVisitProgress: {
      async upsert(args: {
        create: Partial<FakeHutVisitProgress> & { attemptId: string; section: FakeHutVisitProgress["section"] };
        update: Partial<FakeHutVisitProgress>;
        where: { attemptId_section: { attemptId: string; section: FakeHutVisitProgress["section"] } };
      }) {
        let visit = state.questionnaireAttempts
          .flatMap((attempt) => attempt.visits)
          .find(
            (item) =>
              item.attemptId === args.where.attemptId_section.attemptId &&
              item.section === args.where.attemptId_section.section
          );
        if (visit) {
          Object.assign(visit, args.update);
          return visit;
        }
        visit = {
          attemptId: args.create.attemptId,
          completedAt: (args.create.completedAt as Date | null) ?? null,
          id: `hut-visit-progress-${state.nextId++}`,
          section: args.create.section,
          startedAt: (args.create.startedAt as Date | null) ?? null,
          status: (args.create.status as FakeHutVisitProgress["status"]) ?? "PENDING"
        };
        const attempt = state.questionnaireAttempts.find((item) => item.id === visit?.attemptId);
        attempt?.visits.push(visit);
        return visit;
      },
      async deleteMany(args: { where: { attemptId: string } }) {
        const attempt = state.questionnaireAttempts.find((item) => item.id === args.where.attemptId);
        const count = attempt?.visits.length ?? 0;
        if (attempt) {
          attempt.visits = [];
        }
        return { count };
      }
    },
    hutAnswer: {
      async findMany(args: { where: { attemptId: string } }) {
        return state.answers.filter((answer) => answer.attemptId === args.where.attemptId);
      },
      async upsert(args: {
        create: Partial<FakeHutAnswer> & { answerJson: unknown; attemptId: string; questionCode: string };
        update: Partial<FakeHutAnswer>;
        where: { attemptId_questionCode: { attemptId: string; questionCode: string } };
      }) {
        let answer = state.answers.find(
          (item) =>
            item.attemptId === args.where.attemptId_questionCode.attemptId &&
            item.questionCode === args.where.attemptId_questionCode.questionCode
        );
        if (answer) {
          Object.assign(answer, args.update);
          return answer;
        }
        answer = {
          answerJson: args.create.answerJson,
          attemptId: args.create.attemptId,
          id: `hut-answer-${state.nextId++}`,
          questionCode: args.create.questionCode,
          visitProgressId: (args.create.visitProgressId as string | null) ?? null
        };
        state.answers.push(answer);
        const attempt = state.questionnaireAttempts.find((item) => item.id === answer?.attemptId);
        attempt?.answers.push(answer);
        return answer;
      },
      async deleteMany(args: { where: { attemptId: string } }) {
        const before = state.answers.length;
        state.answers = state.answers.filter((answer) => answer.attemptId !== args.where.attemptId);
        const attempt = state.questionnaireAttempts.find((item) => item.id === args.where.attemptId);
        if (attempt) {
          attempt.answers = [];
        }
        return { count: before - state.answers.length };
      }
    },
    hutApplicationPhotoEntry: {
      async count(args: { where: { participantId: string } }) {
        return state.applicationPhotoEntries.filter((entry) => entry.participantId === args.where.participantId).length;
      },
      async create(args: { data: Partial<FakeApplicationPhotoEntry> & { participantId: string } }) {
        const entry: FakeApplicationPhotoEntry = {
          capturedAt: (args.data.capturedAt as Date) ?? new Date(),
          capturedLocalDate: String(args.data.capturedLocalDate),
          capturedLocalTimezone: String(args.data.capturedLocalTimezone ?? "America/Mexico_City"),
          id: `hut-application-photo-entry-${state.nextId++}`,
          participantId: args.data.participantId,
          privateStorageKey: String(args.data.privateStorageKey),
          productCode: (args.data.productCode as string | null) ?? null,
          useDayNumber: Number(args.data.useDayNumber)
        };
        state.applicationPhotoEntries.push(entry);
        const participant = state.participants.find((item) => item.id === entry.participantId);
        participant?.applicationPhotoEntries.push(entry);
        return entry;
      },
      async findFirst(args: { where: { capturedLocalDate?: string; participantId: string; useDayNumber?: number } }) {
        return (
          state.applicationPhotoEntries.find(
            (entry) =>
              entry.participantId === args.where.participantId &&
              (!args.where.capturedLocalDate || entry.capturedLocalDate === args.where.capturedLocalDate) &&
              (typeof args.where.useDayNumber !== "number" || entry.useDayNumber === args.where.useDayNumber)
          ) ?? null
        );
      },
      async deleteMany(args: { where: { participantId: string; privateStorageKey?: string } }) {
        const before = state.applicationPhotoEntries.length;
        state.applicationPhotoEntries = state.applicationPhotoEntries.filter(
          (entry) =>
            entry.participantId !== args.where.participantId ||
            (args.where.privateStorageKey ? entry.privateStorageKey !== args.where.privateStorageKey : false)
        );
        for (const participant of state.participants) {
          participant.applicationPhotoEntries = state.applicationPhotoEntries.filter((entry) => entry.participantId === participant.id);
        }
        return { count: before - state.applicationPhotoEntries.length };
      }
    },
    hutCallEvaluation: {
      async create(args: { data: Partial<FakeCall> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const call: FakeCall = {
          blockNumber: args.data.blockNumber as 1 | 2,
          completedAt: null,
          evaluatorName: null,
          notes: null,
          status: (args.data.status as FakeCall["status"]) ?? "PENDING"
        };
        participant?.callEvaluations.push(call);
        return call;
      },
      async update(args: { data: Partial<FakeCall>; where: { participantId_blockNumber: { blockNumber: number; participantId: string } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId_blockNumber.participantId);
        const call = participant?.callEvaluations.find((item) => item.blockNumber === args.where.participantId_blockNumber.blockNumber);
        if (call) {
          Object.assign(call, args.data);
        }
        return call;
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.callEvaluations.length ?? 0;
        if (participant) {
          participant.callEvaluations = [];
        }
        return { count };
      }
    },
    hutDailyCheck: {
      async create(args: { data: FakeDailyCheck }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        participant?.dailyChecks.push(args.data);
        return args.data;
      },
      async deleteMany(args: { where: { blockId?: string; expectedVideoSequence?: { gte: number }; participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.dailyChecks.length ?? 0;
        if (participant) {
          participant.dailyChecks = participant.dailyChecks.filter((check) => {
            if (args.where.blockId && check.blockId !== args.where.blockId) {
              return true;
            }
            if (args.where.expectedVideoSequence && check.expectedVideoSequence < args.where.expectedVideoSequence.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.dailyChecks.length ?? 0) };
      }
    },
    hutVideoSubmission: {
      async create(args: { data: FakeVideo }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const video = { ...args.data, id: `video-${state.nextId++}` };
        participant?.videoSubmissions.push(video);
        return video;
      },
      async deleteMany(args: { where: { blockNumber?: number; participantId: string; sequenceNumber?: { gte: number } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.videoSubmissions.length ?? 0;
        if (participant) {
          participant.videoSubmissions = participant.videoSubmissions.filter((video) => {
            if (args.where.blockNumber && video.blockNumber !== args.where.blockNumber) {
              return true;
            }
            if (args.where.sequenceNumber && video.sequenceNumber < args.where.sequenceNumber.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.videoSubmissions.length ?? 0) };
      }
    },
    hutVisualVerification: {
      async create(args: { data: Partial<FakeVisualVerification> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const verification: FakeVisualVerification = {
          attemptSelfieKey: String(args.data.attemptSelfieKey),
          attemptStorageBucket: String(args.data.attemptStorageBucket ?? "participant-evidence"),
          blockNumber: Number(args.data.blockNumber),
          id: `verification-${state.nextId++}`,
          overrideReason: (args.data.overrideReason as string | null) ?? null,
          reviewedAt: (args.data.reviewedAt as Date | null) ?? null,
          reviewedByUserId: (args.data.reviewedByUserId as string | null) ?? null,
          sequenceNumber: Number(args.data.sequenceNumber),
          similarityScore: (args.data.similarityScore as number | null) ?? null,
          status: args.data.status as FakeVisualVerification["status"],
          verificationDate: (args.data.verificationDate as Date) ?? new Date(),
          videoSubmissionId: (args.data.videoSubmissionId as string | undefined) ?? undefined
        };
        participant?.visualVerifications.unshift(verification);
        return verification;
      },
      async update(args: {
        data: {
          overrideReason?: string | null;
          reviewedAt?: Date | null;
          reviewedByUserId?: string | null;
          status?: FakeVisualVerification["status"];
          videoSubmissionId?: string;
        };
        where: { id: string };
      }) {
        const verification = state.participants.flatMap((item) => item.visualVerifications).find((item) => item.id === args.where.id);
        if (verification) {
          Object.assign(verification, args.data);
        }
        return verification;
      },
      async deleteMany(args: { where: { blockNumber?: number; participantId: string; sequenceNumber?: { gte: number } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.visualVerifications.length ?? 0;
        if (participant) {
          participant.visualVerifications = participant.visualVerifications.filter((verification) => {
            if (args.where.blockNumber && verification.blockNumber !== args.where.blockNumber) {
              return true;
            }
            if (args.where.sequenceNumber && verification.sequenceNumber < args.where.sequenceNumber.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.visualVerifications.length ?? 0) };
      }
    }
  };

  const storage: HutStorageClient = {
    createSignedReadUrl: vi.fn(async () => "https://storage.example/reference-selfie.jpg"),
    createSignedUploadUrl: vi.fn(async (input) => ({
      signedUrl: `https://storage.example/${input.privateStorageKey}`,
      token: "signed-token"
    }))
  };

  return { prisma, storage };
}

type FakeParticipant = {
  applicationEvidence: FakeApplicationEvidence[];
  applicationPhotoEntries: FakeApplicationPhotoEntry[];
  blocks: FakeBlock[];
  callEvaluations: FakeCall[];
  currentBlockNumber: number;
  currentVideoSequence: number;
  dailyChecks: FakeDailyCheck[];
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  origin: "CLT_HUT" | "HUT_DIRECTO";
  phaseCodes: FakeHutPhaseCode[];
  phone: string | null;
  protocolVersion: "APPLICATION_PHOTO" | "LEGACY_VIDEO";
  questionnaireAttempt: FakeHutQuestionnaireAttempt | null;
  recruiter: string | null;
  referenceSelfie: FakeReferenceSelfie | null;
  registrationSlot: FakeRegistrationSlot | null;
  secondFragranceRightArm: string | null;
  startDate: Date | null;
  status:
    | "NOT_STARTED"
    | "BLOCK_1_IN_PROGRESS"
    | "BLOCK_1_CALL_PENDING"
    | "BLOCK_2_IN_PROGRESS"
    | "BLOCK_2_CALL_PENDING"
    | "COMPLETED"
    | "DISQUALIFIED";
  study: {
    code: string;
    id: string;
    name: string;
    status: string;
    timeZoneIana: string;
  };
  studyId: string;
  studyParticipant: {
    participantProfile: {
      email: string | null;
      name: string;
      phone: string | null;
    };
  } | null;
  studyParticipantId: string | null;
  testMode: boolean;
  token: string;
  visualOverrideEnabled: boolean;
  visualOverrideReason: string | null;
  visualVerifications: FakeVisualVerification[];
  videoSubmissions: Array<FakeVideo & { id?: string }>;
};

type FakeAuditLog = {
  action: string;
  actorUserId?: string | null;
  afterJson?: unknown;
  beforeJson?: unknown;
  entityId: string;
  entityType: string;
  reason?: string | null;
};

type FakeHutQuestionnaireAttempt = {
  answers: FakeHutAnswer[];
  completedAt: Date | null;
  id: string;
  participantId: string;
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING" | "TERMINATED";
  terminatedAt: Date | null;
  terminationReason: string | null;
  visits: FakeHutVisitProgress[];
};

type FakeHutVisitProgress = {
  attemptId: string;
  completedAt: Date | null;
  id: string;
  section:
    | "COMPARATIVA"
    | "DATOS_GENERALES"
    | "EVALUACION_PRIMER_PERFUME"
    | "EVALUACION_SEGUNDO_PERFUME"
    | "FILTROS"
    | "PRIMERA_VISITA"
    | "SEGUNDA_VISITA";
  startedAt: Date | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
};

type FakeHutAnswer = {
  answerJson: unknown;
  attemptId: string;
  id: string;
  questionCode: string;
  visitProgressId: string | null;
};

type FakeApplicationPhotoEntry = {
  capturedAt: Date;
  capturedLocalDate: string;
  capturedLocalTimezone: string;
  id: string;
  participantId: string;
  privateStorageKey: string;
  productCode: string | null;
  useDayNumber: number;
};

type FakeApplicationEvidence = {
  capturedAt: Date;
  extension: string;
  id: string;
  mimeType: string;
  originalFilename: string | null;
  participantId: string;
  phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2";
  privateStorageKey: string;
  productCode: string | null;
  sizeBytes: number;
  storageBucket: string;
};

type FakeParticipantConfirmation = {
  folio: string;
  id: string;
  referenceCodes: Array<{ code: string; slot: number }>;
  studyId: string;
  studyParticipant: {
    id: string;
    participantConfirmation?: FakeParticipantConfirmation;
    participantProfile: {
      email: string | null;
      name: string;
      phone: string | null;
    };
  };
};

type FakeHutPhaseCode = {
  codeHash: string;
  createdAt?: Date | null;
  encryptedCode: string;
  encryptionVersion?: number;
  expiresAt?: Date | null;
  id: string;
  participantId: string;
  phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2";
  sentAt?: Date | null;
  slot: number;
  status: "EXPIRED" | "GENERATED" | "REVOKED" | "SENT" | "USED" | "VALIDATED";
  updatedAt?: Date | null;
  usedAt?: Date | null;
  validatedAt?: Date | null;
};

type FakeRegistrationSlot = {
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  participantId: string | null;
  registeredAt: Date | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  study: {
    code: string;
    id: string;
    name: string;
    status: string;
    timeZoneIana: string;
  };
  studyId: string;
};

type FakeReferenceSelfie = {
  capturedAt: Date;
  id: string;
  privateStorageKey: string;
  storageBucket: string;
};

type FakeBlock = {
  blockNumber: 1 | 2;
  disqualificationReason: string | null;
  id: string;
  maxMissedDaysAllowed: number;
  missedDaysCount: number;
  requiredVideos: number;
  startDate: Date | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "CALL_PENDING" | "COMPLETED" | "DISQUALIFIED";
  submittedVideosCount: number;
};

type FakeCall = {
  blockNumber: 1 | 2;
  completedAt: Date | null;
  evaluatorName: string | null;
  notes: string | null;
  status: "PENDING" | "SCHEDULED" | "COMPLETED" | "NO_ANSWER" | "RESCHEDULE_NEEDED";
};

type FakeDailyCheck = {
  blockDayNumber: number;
  blockId: string;
  blockNumber: number;
  date: Date;
  expectedVideoSequence: number;
  participantId: string;
  reminderSentAt?: Date | null;
  status: string;
};

type FakeVideo = {
  blockId: string;
  blockNumber: number;
  extension: string;
  mimeType: string;
  originalFilename: string;
  participantId: string;
  privateStorageKey: string;
  sequenceNumber: number;
  sizeBytes: number;
  storageBucket: string;
};

type FakeVisualVerification = {
  attemptSelfieKey: string;
  attemptStorageBucket: string;
  blockNumber: number;
  id: string;
  overrideReason: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  sequenceNumber: number;
  similarityScore: number | null;
  status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
  verificationDate: Date;
  videoSubmissionId?: string;
};

function videoMetadata() {
  return {
    mimeType: "video/mp4",
    originalFilename: "video.mp4",
    sizeBytes: 1024
  };
}

function selfieMetadata() {
  return {
    mimeType: "image/jpeg",
    originalFilename: "selfie.jpg",
    sizeBytes: 1024
  };
}

function referenceSelfie(): FakeReferenceSelfie {
  return {
    capturedAt: new Date("2026-07-01T12:00:00.000Z"),
    id: "reference-selfie",
    privateStorageKey: "studies/study-hut/hut-participants/participant-1/reference-selfie/base.jpg",
    storageBucket: "participant-evidence"
  };
}

function confirmationWithCodes(folio: string): FakeParticipantConfirmation {
  const confirmation: FakeParticipantConfirmation = {
    folio,
    id: `confirmation-${folio}`,
    referenceCodes: [
      { code: "A7K4", slot: 1 },
      { code: "M3P9", slot: 2 },
      { code: "T8R2", slot: 3 }
    ],
    studyId: "study-hut",
    studyParticipant: {
      id: `study-participant-${folio}`,
      participantProfile: {
        email: `${folio.toLowerCase()}@example.com`,
        name: `Participante ${folio}`,
        phone: "+525500000000"
      }
    }
  };

  confirmation.studyParticipant.participantConfirmation = confirmation;

  return {
    ...confirmation
  };
}

function createFakeWhatsAppRepository() {
  let latestMessage: OneuiWhatsAppMessageRecord | null = null;
  const repository = {
    get latestMessage() {
      return latestMessage;
    },
    set latestMessage(value: OneuiWhatsAppMessageRecord | null) {
      latestMessage = value;
    },
    createOutboundMessage: vi.fn(async (input) => fakeWhatsAppMessage({
      bodyText: input.bodyText,
      status: "pending"
    })),
    findLatestOutboundTemplateMessage: vi.fn(async () => latestMessage),
    getConversationWithMessages: vi.fn(async () => null),
    listConversations: vi.fn(async () => []),
    markOutboundMessageAccepted: vi.fn(async (input) => fakeWhatsAppMessage({
      metaMessageId: input.metaMessageId,
      status: input.status
    })),
    markOutboundMessageFailed: vi.fn(async (input) => fakeWhatsAppMessage({
      rawPayload: input.rawPayload,
      status: input.status
    })),
    saveInboundMessage: vi.fn(async (input) => fakeWhatsAppMessage({
      bodyText: input.bodyText,
      direction: "INBOUND"
    })),
    saveStatusEvent: vi.fn(async (input) => ({
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
      id: "status-event-1",
      messageId: null,
      metaMessageId: input.metaMessageId,
      rawPayload: input.rawPayload,
      status: input.status,
      timestamp: input.timestamp
    })),
    upsertInboundConversation: vi.fn(async (input) => ({
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
      id: "conversation-1",
      lastInboundAt: input.lastInboundAt,
      lastMessageAt: input.lastInboundAt,
      lastOutboundAt: null,
      linkedParticipantId: null,
      linkedStudyId: null,
      phoneNumber: input.phoneNumber,
      profileName: input.profileName,
      sourceModule: "GENERAL" as const,
      updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      waId: input.waId
    })),
    upsertOutboundConversation: vi.fn(async (input) => ({
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
      id: "conversation-1",
      lastInboundAt: null,
      lastMessageAt: new Date("2026-07-01T12:00:00.000Z"),
      lastOutboundAt: new Date("2026-07-01T12:00:00.000Z"),
      linkedParticipantId: input.linkedParticipantId ?? null,
      linkedStudyId: input.linkedStudyId ?? null,
      phoneNumber: input.phoneNumber,
      profileName: input.profileName ?? null,
      sourceModule: input.sourceModule,
      updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      waId: input.waId
    }))
  } satisfies OneuiWhatsAppRepository & { latestMessage: OneuiWhatsAppMessageRecord | null };

  return repository;
}

function fakeWhatsAppMessage(input: Partial<OneuiWhatsAppMessageRecord> = {}): OneuiWhatsAppMessageRecord {
  const now = new Date("2026-07-01T12:00:00.000Z");
  return {
    bodyText: input.bodyText ?? "Mensaje HUT",
    conversationId: input.conversationId ?? "conversation-1",
    createdAt: input.createdAt ?? now,
    direction: input.direction ?? "OUTBOUND",
    fromPhone: input.fromPhone ?? "5215511111111",
    id: input.id ?? "message-1",
    messageType: input.messageType ?? "template",
    metaMessageId: input.metaMessageId ?? null,
    rawPayload: input.rawPayload ?? {},
    status: input.status ?? "accepted",
    timestamp: input.timestamp ?? now,
    toPhone: input.toPhone ?? "5215512345678",
    updatedAt: input.updatedAt ?? now
  };
}

function faceResult(status: "MATCH" | "NO_MATCH" | "UNCERTAIN", score: number) {
  return {
    evaluatedAt: new Date("2026-07-01T12:00:00.000Z").toISOString(),
    method: "@vladmandic/human:faceres+blazeface:v1",
    score,
    status
  };
}

function slotWithParticipant(slot: FakeRegistrationSlot, participants: FakeParticipant[]) {
  const participant = participants.find((item) => item.id === slot.participantId) ?? null;

  return {
    ...slot,
    participant: participant
        ? {
            email: participant.email,
            id: participant.id,
            name: participant.name,
            phone: participant.phone,
            referenceSelfie: participant.referenceSelfie,
            token: participant.token
          }
        : null
  };
}

function attemptWithRelations(
  attempt: FakeHutQuestionnaireAttempt,
  state: ReturnType<typeof createFakeHutPrisma>["prisma"]["state"]
) {
  return {
    ...attempt,
    answers: state.answers.filter((answer) => answer.attemptId === attempt.id),
    visits: attempt.visits
  };
}
