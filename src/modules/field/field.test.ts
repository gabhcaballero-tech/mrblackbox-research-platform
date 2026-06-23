import { describe, expect, it } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import type { InternalUserRole } from "@/shared/auth/permissions";
import {
  getFieldScreeningAttemptScreen,
  listFieldStudies,
  saveFieldScreeningAnswer,
  startFieldScreeningAttempt,
  type FieldActor
} from "./service";
import type {
  FieldRepository,
  FieldScreeningAnswerRecord,
  FieldScreeningAttemptRecord,
  FieldStudyParticipantRecord,
  FieldStudySummary,
  FieldScreenerVersionSummary,
  FieldParticipantProfileRecord
} from "./repository";

const studyId = "study-1";
const activeVersionId = "version-1";

const admin: FieldActor = { id: "admin-1", role: "ADMIN", status: "ACTIVE" };
const interviewer: FieldActor = { id: "interviewer-1", role: "INTERVIEWER", status: "ACTIVE" };
const analyst: FieldActor = { id: "analyst-1", role: "ANALYST", status: "ACTIVE" };

function actor(role: InternalUserRole): FieldActor {
  return { id: `actor-${role}`, role, status: "ACTIVE" };
}

function screenerDefinition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: ["D1", "D2", "D3", "D4", "D5", "D6"].map((questionId) => ({
        missingScore: 0,
        questionId,
        scoreByAnswer: { HIGH: 30, LOW: 0 }
      })),
      label: "Nivel socioeconómico",
      ranges: [
        { code: "AB", eligible: false, label: "A/B", max: 300, min: 202 },
        { code: "C_PLUS", eligible: true, label: "C+", max: 201, min: 168 },
        { code: "C", eligible: true, label: "C típico", max: 167, min: 141 },
        { code: "C_MINUS", eligible: true, label: "C-", max: 140, min: 116 },
        { code: "D_PLUS", eligible: false, label: "D+", max: 115, min: 95 },
        { code: "D", eligible: false, label: "D", max: 94, min: 48 },
        { code: "E", eligible: false, label: "E", max: 47, min: 0 }
      ],
      type: "score_table"
    },
    purpose: "SCREENER",
    questions: [
      choiceQuestion("CONSENTIMIENTO", 1, "Consentimiento", [
        option("SI", "Sí, acepto participar"),
        option("NO", "No, no acepto participar", "TERMINATE", "SIN_CONSENTIMIENTO", "No aceptó participar.")
      ], "CONSENT_YES_NO"),
      choiceQuestion("F1_GENERO", 2, "Género", [
        option("HOMBRE", "Hombre"),
        option("MUJER", "Mujer", "TERMINATE", "GENERO_NO_ELEGIBLE", "El estudio está dirigido a hombres.")
      ]),
      {
        dataDestination: "SCREENING",
        id: "F2_EDAD",
        order: 3,
        required: true,
        text: "Edad exacta",
        type: "INTEGER",
        validation: { max: 120, min: 0 }
      },
      choiceQuestion("F9_FRECUENCIA_SEMANAL", 4, "Frecuencia semanal", [
        option("UN_DIA", "Un día", "TERMINATE", "FRECUENCIA_INSUFICIENTE", "Frecuencia insuficiente."),
        option("DOS_DIAS", "Dos días", "TERMINATE", "FRECUENCIA_INSUFICIENTE", "Frecuencia insuficiente."),
        option("MAS_DE_UNA_VEZ_DIA", "Más de una vez al día")
      ]),
      {
        dataDestination: "SCREENING",
        id: "F9A_VECES_AL_DIA",
        order: 5,
        required: true,
        text: "Veces al día",
        type: "INTEGER",
        validation: { max: 20, min: 2 },
        visibilityCondition: {
          questionId: "F9_FRECUENCIA_SEMANAL",
          type: "ANSWER_EQUALS",
          value: "MAS_DE_UNA_VEZ_DIA"
        }
      },
      ...["D1", "D2", "D3", "D4", "D5", "D6"].map((id, index) =>
        choiceQuestion(id, 6 + index, `Pregunta NSE ${index + 1}`, [
          option("HIGH", "Alto"),
          option("LOW", "Bajo")
        ])
      ),
      {
        dataDestination: "SCREENING",
        id: "OTRO",
        options: [
          {
            actions: [],
            isOther: true,
            label: "Otra",
            order: 1,
            otherTextRequired: true,
            value: "OTRA"
          }
        ],
        order: 12,
        required: false,
        text: "Otra opción",
        type: "SINGLE_CHOICE",
        validation: {}
      }
    ],
    rules: [
      {
        condition: { max: 19, min: 0, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
        id: "EDAD_MENOR_20",
        order: 1,
        outcome: { code: "EDAD_MENOR_20", reason: "La edad es menor a 20 años.", type: "TERMINATE" }
      },
      {
        condition: { max: 120, min: 51, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
        id: "EDAD_MAYOR_50",
        order: 2,
        outcome: { code: "EDAD_MAYOR_50", reason: "La edad es mayor a 50 años.", type: "TERMINATE" }
      }
    ],
    schemaVersion: "screening.v1",
    title: "Filtro de prueba"
  };
}

function choiceQuestion(
  id: string,
  order: number,
  text: string,
  options: ReturnType<typeof option>[],
  type: "CONSENT_YES_NO" | "SINGLE_CHOICE" = "SINGLE_CHOICE"
) {
  return {
    dataDestination: "SCREENING" as const,
    id,
    options: options.map((item, index) => ({ ...item, order: index + 1 })),
    order,
    required: true,
    text,
    type,
    validation: {}
  };
}

function option(
  value: string,
  label: string,
  actionType?: "TERMINATE",
  code?: string,
  reason?: string
) {
  return {
    actions: actionType ? [{ code: code!, reason: reason!, type: actionType }] : [],
    isOther: false,
    label,
    order: 1,
    otherTextRequired: false,
    value
  };
}

function version(definition = screenerDefinition()): FieldScreenerVersionSummary {
  return {
    definitionHash: "hash-1",
    definitionJson: definition,
    id: activeVersionId,
    publishedAt: new Date("2026-06-23T10:00:00Z"),
    status: "ACTIVE",
    versionNumber: 1
  };
}

function study(status: "ACTIVE" | "DRAFT" = "ACTIVE", definition = screenerDefinition()): FieldStudySummary {
  return {
    activeScreenerVersion: version(definition),
    code: "FMASCULINA-NAVIGO-2026",
    id: studyId,
    name: "Fragancia Masculina — Navigo Homme",
    status,
    timeZoneIana: "America/Mexico_City"
  };
}

function createMemoryRepository(studies: FieldStudySummary[] = [study()]): FieldRepository {
  const profiles: FieldParticipantProfileRecord[] = [];
  const participants: FieldStudyParticipantRecord[] = [];
  const attempts: FieldScreeningAttemptRecord[] = [];
  const answers = new Map<string, FieldScreeningAnswerRecord[]>();

  return {
    async createParticipantProfile(input) {
      const profile = {
        email: input.email ?? null,
        externalReference: input.externalReference ?? null,
        id: `profile-${profiles.length + 1}`,
        name: input.name,
        phone: input.phone ?? null
      };
      profiles.push(profile);
      return profile;
    },
    async createScreeningAttempt(input) {
      const participant = participants.find((item) => item.id === input.studyParticipantId)!;
      const currentStudy = studies.find((item) => item.activeScreenerVersion.id === input.questionnaireVersionId)!;
      const attempt: FieldScreeningAttemptRecord = {
        completedAt: null,
        evaluationJson: null,
        fieldUserId: input.fieldUserId,
        id: `attempt-${attempts.length + 1}`,
        nseClass: null,
        nseScore: null,
        questionnaireVersion: {
          ...currentStudy.activeScreenerVersion,
          study: {
            code: currentStudy.code,
            id: currentStudy.id,
            name: currentStudy.name,
            status: currentStudy.status,
            timeZoneIana: currentStudy.timeZoneIana
          }
        },
        questionnaireVersionId: input.questionnaireVersionId,
        status: "STARTED",
        studyParticipant: {
          ...participant,
          participantProfile: profiles.find((profile) => profile.id === participant.participantProfileId)!
        },
        studyParticipantId: input.studyParticipantId,
        terminationCode: null,
        terminationReason: null
      };
      attempts.push(attempt);
      answers.set(attempt.id, []);
      return attempt;
    },
    async createStudyParticipant(input) {
      const participant = {
        id: `study-participant-${participants.length + 1}`,
        participantProfileId: input.participantProfileId,
        screeningStatus: input.screeningStatus,
        studyId: input.studyId
      };
      participants.push(participant);
      return participant;
    },
    async findReusableParticipantProfile(input) {
      return profiles.find((profile) =>
        (input.phone && profile.phone === input.phone) ||
        (input.email && profile.email === input.email) ||
        (input.externalReference && profile.externalReference === input.externalReference)
      ) ?? null;
    },
    async findStudyParticipant(input) {
      return participants.find(
        (participant) =>
          participant.participantProfileId === input.participantProfileId &&
          participant.studyId === input.studyId
      ) ?? null;
    },
    async getAttempt(attemptId) {
      return attempts.find((attempt) => attempt.id === attemptId) ?? null;
    },
    async getStudyWithActiveScreener(id) {
      return studies.find((item) => item.id === id && item.status === "ACTIVE") ?? null;
    },
    async listAnswers(attemptId) {
      return answers.get(attemptId) ?? [];
    },
    async listAvailableStudies() {
      return studies.filter((item) => item.status === "ACTIVE" && item.activeScreenerVersion.status === "ACTIVE");
    },
    async updateAttemptEvaluation(input) {
      const attempt = attempts.find((item) => item.id === input.attemptId)!;
      attempt.completedAt = input.completedAt;
      attempt.evaluationJson = input.evaluationJson;
      attempt.nseClass = input.nseClass ?? null;
      attempt.nseScore = input.nseScore ?? null;
      attempt.status = input.status;
      attempt.terminationCode = input.terminationCode ?? null;
      attempt.terminationReason = input.terminationReason ?? null;
      const participant = participants.find((item) => item.id === input.studyParticipantId)!;
      participant.screeningStatus = input.screeningStatus;
    },
    async updateStudyParticipantScreening(input) {
      const participant = participants.find((item) => item.id === input.studyParticipantId)!;
      participant.screeningStatus = input.screeningStatus;
    },
    async upsertAnswer(input) {
      const currentAnswers = answers.get(input.screeningAttemptId) ?? [];
      const existing = currentAnswers.find((answer) => answer.questionId === input.questionId);

      if (existing) {
        existing.answerJson = input.answerJson;
        return existing;
      }

      const answer = {
        answerJson: input.answerJson,
        questionId: input.questionId
      };
      currentAnswers.push(answer);
      answers.set(input.screeningAttemptId, currentAnswers);
      return answer;
    }
  };
}

async function startAttempt(repository: FieldRepository, currentActor = interviewer) {
  const result = await startFieldScreeningAttempt({
    actor: currentActor,
    formInput: {
      email: "",
      externalReference: "",
      name: "Participante prueba",
      phone: "5550000000"
    },
    repository,
    studyId
  });

  expect(result).toMatchObject({ ok: true });
  return result.ok ? result.data.attemptId : "";
}

async function answer(repository: FieldRepository, attemptId: string, questionId: string, value: string | string[]) {
  return saveFieldScreeningAnswer({
    actor: interviewer,
    attemptId,
    formInput: { value },
    questionId,
    repository
  });
}

async function answerEligibleBase(repository: FieldRepository, attemptId: string, nseValue: "HIGH" | "LOW" = "HIGH") {
  await answer(repository, attemptId, "CONSENTIMIENTO", "SI");
  await answer(repository, attemptId, "F1_GENERO", "HOMBRE");
  await answer(repository, attemptId, "F2_EDAD", "25");
  await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
  await answer(repository, attemptId, "F9A_VECES_AL_DIA", "3");

  for (const questionId of ["D1", "D2", "D3", "D4", "D5", "D6"]) {
    await answer(repository, attemptId, questionId, nseValue);
  }
}

describe("field service", () => {
  it("lists only ACTIVE studies with active screener", async () => {
    const repository = createMemoryRepository([study("ACTIVE"), study("DRAFT")]);
    const result = await listFieldStudies({ actor: interviewer, repository });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.data : []).toHaveLength(1);
    expect(result.ok ? result.data[0]?.status : null).toBe("ACTIVE");
  });

  it("does not list DRAFT even with published screener", async () => {
    const repository = createMemoryRepository([study("DRAFT")]);
    const result = await listFieldStudies({ actor: interviewer, repository });

    expect(result.ok ? result.data : []).toHaveLength(0);
  });

  it("starts an attempt and creates participant records", async () => {
    const repository = createMemoryRepository();
    const result = await startFieldScreeningAttempt({
      actor: interviewer,
      formInput: { email: "", externalReference: "REF-1", name: "Persona", phone: "5551111111" },
      repository,
      studyId
    });

    expect(result).toMatchObject({
      data: {
        attemptId: "attempt-1",
        participantProfileId: "profile-1",
        studyParticipantId: "study-participant-1"
      },
      ok: true
    });
  });

  it("reuses ParticipantProfile by reliable data", async () => {
    const repository = createMemoryRepository();
    await startAttempt(repository);
    const second = await startFieldScreeningAttempt({
      actor: interviewer,
      formInput: { email: "", externalReference: "", name: "Otra captura", phone: "5550000000" },
      repository,
      studyId
    });

    expect(second.ok ? second.data.reusedParticipantProfile : false).toBe(true);
    expect(second.ok ? second.data.participantProfileId : null).toBe("profile-1");
  });

  it("rejects study without active screener and unauthorized users", async () => {
    const repository = createMemoryRepository([]);

    await expect(
      startFieldScreeningAttempt({
        actor: interviewer,
        formInput: { email: "", externalReference: "", name: "Persona", phone: "" },
        repository,
        studyId
      })
    ).resolves.toMatchObject({ code: "STUDY_NOT_AVAILABLE", ok: false });

    await expect(listFieldStudies({ actor: analyst, repository })).resolves.toMatchObject({
      code: "UNAUTHORIZED",
      ok: false
    });
  });

  it("upserts and replaces a previous answer", async () => {
    const repository = createMemoryRepository();
    const attemptId = await startAttempt(repository);

    await answer(repository, attemptId, "F2_EDAD", "25");
    await answer(repository, attemptId, "F2_EDAD", "30");
    const screen = await getFieldScreeningAttemptScreen({ actor: interviewer, attemptId, repository });

    expect(screen.ok ? screen.data.answers.F2_EDAD : null).toBe(30);
  });

  it("requires text for Other option", async () => {
    const repository = createMemoryRepository();
    const attemptId = await startAttempt(repository);
    const result = await saveFieldScreeningAnswer({
      actor: interviewer,
      attemptId,
      formInput: { otherText: "", value: "OTRA" },
      questionId: "OTRO",
      repository
    });

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Especifica la respuesta en Otro.",
      ok: false
    });
  });

  it("terminates by gender, age and insufficient frequency", async () => {
    const genderRepository = createMemoryRepository();
    const genderAttempt = await startAttempt(genderRepository);
    const gender = await answer(genderRepository, genderAttempt, "F1_GENERO", "MUJER");

    const ageRepository = createMemoryRepository();
    const ageAttempt = await startAttempt(ageRepository);
    const age = await answer(ageRepository, ageAttempt, "F2_EDAD", "18");

    const frequencyRepository = createMemoryRepository();
    const frequencyAttempt = await startAttempt(frequencyRepository);
    const frequency = await answer(frequencyRepository, frequencyAttempt, "F9_FRECUENCIA_SEMANAL", "UN_DIA");

    expect(gender).toMatchObject({ data: { closed: true, status: "TERMINATED" }, ok: true });
    expect(age).toMatchObject({ data: { closed: true, status: "TERMINATED" }, ok: true });
    expect(frequency).toMatchObject({ data: { closed: true, status: "TERMINATED" }, ok: true });
  });

  it("shows F9A only when frequency is more than once per day and requires it only when visible", async () => {
    const repository = createMemoryRepository();
    const attemptId = await startAttempt(repository);

    await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
    let screen = await getFieldScreeningAttemptScreen({ actor: interviewer, attemptId, repository });
    expect(screen.ok ? screen.data.visibleQuestions.map((question) => question.id) : []).toContain("F9A_VECES_AL_DIA");

    await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "DOS_DIAS");
    screen = await getFieldScreeningAttemptScreen({ actor: interviewer, attemptId, repository });
    expect(screen.ok ? screen.data.visibleQuestions.map((question) => question.id) : []).not.toContain("F9A_VECES_AL_DIA");
  });

  it("passes with eligible NSE C+ and terminates when NSE is out of range", async () => {
    const eligibleRepository = createMemoryRepository();
    const eligibleAttempt = await startAttempt(eligibleRepository);
    await answerEligibleBase(eligibleRepository, eligibleAttempt, "HIGH");
    const eligible = await getFieldScreeningAttemptScreen({ actor: interviewer, attemptId: eligibleAttempt, repository: eligibleRepository });

    const notEligibleRepository = createMemoryRepository();
    const notEligibleAttempt = await startAttempt(notEligibleRepository);
    await answerEligibleBase(notEligibleRepository, notEligibleAttempt, "LOW");
    const notEligible = await getFieldScreeningAttemptScreen({ actor: interviewer, attemptId: notEligibleAttempt, repository: notEligibleRepository });

    expect(eligible.ok ? eligible.data.attempt.status : null).toBe("PASSED");
    expect(eligible.ok ? eligible.data.attempt.nseClass : null).toBe("C_PLUS");
    expect(notEligible.ok ? notEligible.data.attempt.status : null).toBe("TERMINATED");
    expect(notEligible.ok ? notEligible.data.attempt.nseClass : null).toBe("E");
  });

  it("keeps closed attempts read-only", async () => {
    const repository = createMemoryRepository();
    const attemptId = await startAttempt(repository);
    await answer(repository, attemptId, "F1_GENERO", "MUJER");
    const result = await answer(repository, attemptId, "F2_EDAD", "25");

    expect(result).toMatchObject({
      code: "ATTEMPT_CLOSED",
      ok: false
    });
  });

  it("allows ADMIN and SUPERVISOR while denying ANALYST", async () => {
    const repository = createMemoryRepository();

    await expect(listFieldStudies({ actor: admin, repository })).resolves.toMatchObject({ ok: true });
    await expect(listFieldStudies({ actor: actor("SUPERVISOR"), repository })).resolves.toMatchObject({ ok: true });
    await expect(listFieldStudies({ actor: analyst, repository })).resolves.toMatchObject({ ok: false });
  });
});
