import { describe, expect, it, vi } from "vitest";
import type { ScreenerDefinition } from "@/modules/screener";
import { DETERGENTS_STUDY_CODE, DETERGENT_RECRUITER_QUESTION_ID } from "@/modules/screener/study-overrides";
import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import { createParticipantPortalScreenerRepository } from "./screener-repository";
import type {
  ParticipantPortalScreenerRepository,
  PortalParticipantConsentRecord,
  PortalParticipantProfileRecord,
  PortalScreeningAnswerRecord,
  PortalScreeningAttemptRecord,
  PortalScreenerStudyRecord,
  PortalStudyParticipantRecord
} from "./screener-repository";
import {
  PARTICIPANT_PORTAL_PUBLIC_FILTER_ONLY_PASSED_MESSAGE,
  PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE,
  getParticipantPortalPublicResult,
  getParticipantPortalScreenerScreen,
  saveParticipantPortalScreenerAnswer
} from "./screener-service";

const identity: ParticipantPortalIdentity = {
  email: "persona@example.com",
  id: "11111111-1111-4111-8111-111111111111"
};

function screenerDefinition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: ["D1", "D2", "D3", "D4", "D5", "D6"].map((questionId) => ({
        missingScore: 0,
        questionId,
        scoreByAnswer: { HIGH: 25, LOW: 0 }
      })),
      label: "Nivel socioeconómico",
      ranges: [
        { code: "AB", eligible: false, label: "A/B", max: 300, min: 202 },
        { code: "C_PLUS", eligible: true, label: "C+", max: 201, min: 168 },
        { code: "C", eligible: true, label: "C típico", max: 167, min: 141 },
        { code: "C_MINUS", eligible: true, label: "C-", max: 140, min: 116 },
        { code: "E", eligible: false, label: "E", max: 47, min: 0 }
      ],
      type: "score_table"
    },
    purpose: "SCREENER",
    questions: [
      choiceQuestion("CONSENTIMIENTO", 1, "Aceptación", [
        option("SI", "Sí, acepto participar"),
        option("NO", "No, no acepto", "TERMINATE", "SIN_CONSENTIMIENTO", "No aceptó participar.")
      ], "CONSENT_YES_NO"),
      choiceQuestion("F1_GENERO", 2, "Género", [
        option("HOMBRE", "Hombre"),
        option("MUJER", "Mujer", "TERMINATE", "GENERO_NO_ELEGIBLE", "No elegible por género.")
      ]),
      {
        dataDestination: "SCREENING",
        id: "F6_MARCAS_UTILIZA",
        order: 3,
        required: true,
        text: "¿Qué marcas utilizas?",
        type: "LONG_TEXT",
        validation: { maxLength: 500, minLength: 2 }
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
      {
        dataDestination: "SCREENING",
        id: "F10_ULTIMA_COMPRA",
        order: 6,
        required: false,
        text: "Cuando fue la ultima vez que compro perfume?",
        type: "SHORT_TEXT",
        validation: { maxLength: 120, minLength: 2 }
      },
      ...["D1", "D2", "D3", "D4", "D5", "D6"].map((id, index) =>
        choiceQuestion(id, 7 + index, `Pregunta NSE ${index + 1}`, [
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
        order: 13,
        required: false,
        text: "Otra fragancia",
        type: "SINGLE_CHOICE",
        validation: {}
      }
    ],
    rules: [],
    schemaVersion: "screening.v1",
    title: "Filtro publicado"
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

function activeStudy(overrides: Partial<PortalScreenerStudyRecord> = {}): PortalScreenerStudyRecord {
  return {
    activeScreenerVersion: {
      definitionHash: "hash-1",
      definitionJson: screenerDefinition(),
      id: "version-1",
      publishedAt: new Date("2026-06-23T10:00:00Z"),
      status: "ACTIVE",
      versionNumber: 1
    },
    code: "FMASCULINA-NAVIGO-2026",
    id: "study-1",
    name: "Fragancia Masculina",
    portalConfig: {
      enabled: true,
      maxPerfumePhotos: 5,
      minPerfumePhotos: 1,
      privacyNoticeHash: "notice-hash",
      privacyNoticeText: "Aviso.",
      privacyNoticeVersion: "v1"
    },
    status: "ACTIVE",
    ...overrides
  };
}

function createMemoryRepository({
  consents,
  initialEvidence = [portalEvidence("PERFUME_PHOTO")],
  participants,
  profile,
  study
}: {
  consents?: PortalParticipantConsentRecord[];
  initialEvidence?: PortalScreeningAttemptRecord["participantEvidence"];
  participants?: PortalStudyParticipantRecord[];
  profile?: PortalParticipantProfileRecord | null;
  study?: PortalScreenerStudyRecord;
} = {}) {
  const currentStudy = study ?? activeStudy();
  const profiles = profile === undefined ? [participantProfile()] : profile ? [profile] : [];
  const studyParticipants = participants ?? [studyParticipant()];
  const participantConsents =
    consents ??
    [
      {
        id: "consent-1",
        noticeVersion: currentStudy.portalConfig?.privacyNoticeVersion ?? "v1",
        participantAuthUserId: identity.id,
        studyParticipantId: "study-participant-1"
      }
    ];
  const attempts: PortalScreeningAttemptRecord[] = [];
  const answers = new Map<string, PortalScreeningAnswerRecord[]>();
  const reviews: Array<{ screeningAttemptId: string; studyParticipantId: string }> = [];

  const repository: ParticipantPortalScreenerRepository = {
    async createPortalScreeningAttempt(input) {
      const participant = studyParticipants.find((item) => item.id === input.studyParticipantId)!;
      const attempt = buildAttempt({
        evidence: initialEvidence,
        id: `attempt-${attempts.length + 1}`,
        participant,
        source: "PARTICIPANT_PORTAL",
        status: "STARTED",
        study: currentStudy
      });
      attempts.push(attempt);
      answers.set(attempt.id, []);
      return attempt;
    },
    async findCurrentParticipantConsent(input) {
      return (
        participantConsents.find(
          (consent) =>
            consent.noticeVersion === input.noticeVersion &&
            consent.participantAuthUserId === input.participantAuthUserId &&
            consent.studyParticipantId === input.studyParticipantId
        ) ?? null
      );
    },
    async findParticipantProfileByAuthUserId(participantAuthUserId) {
      return profiles.find((item) => item.participantAuthUserId === participantAuthUserId) ?? null;
    },
    async findStudyParticipant(input) {
      return (
        studyParticipants.find(
          (item) =>
            item.participantProfileId === input.participantProfileId &&
            item.studyId === input.studyId
        ) ?? null
      );
    },
    async getAttempt(attemptId) {
      return attempts.find((attempt) => attempt.id === attemptId) ?? null;
    },
    async getStudyByCode(studyCode) {
      return currentStudy.code === studyCode ? currentStudy : null;
    },
    async listAnswers(attemptId) {
      return answers.get(attemptId) ?? [];
    },
    async listPortalAttemptsForStudyParticipant(studyParticipantId) {
      return attempts.filter((attempt) => attempt.studyParticipantId === studyParticipantId);
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

      const participant = studyParticipants.find((item) => item.id === input.studyParticipantId)!;
      participant.screeningStatus = input.screeningStatus;
    },
    async updateStudyParticipantScreening(input) {
      const participant = studyParticipants.find((item) => item.id === input.studyParticipantId)!;
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
    },
    async upsertPendingScreeningReview(input) {
      reviews.push(input);
      const attempt = attempts.find((item) => item.id === input.screeningAttemptId);

      if (attempt) {
        attempt.participantScreeningReview = {
          id: `review-${reviews.length}`,
          rejectionReason: null,
          status: "PENDING"
        };
      }
    }
  };

  return {
    answers,
    attempts,
    repository,
    reviews,
    studyParticipants
  };
}

function participantProfile(): PortalParticipantProfileRecord {
  return {
    email: "persona@example.com",
    id: "profile-1",
    name: "Persona Participante",
    participantAuthUserId: identity.id,
    phone: "+525512345678"
  };
}

function studyParticipant(): PortalStudyParticipantRecord {
  return {
    id: "study-participant-1",
    participantProfileId: "profile-1",
    screeningStatus: "NOT_STARTED",
    studyId: "study-1"
  };
}

function buildAttempt({
  evidence = [portalEvidence("PERFUME_PHOTO")],
  id,
  participant,
  source,
  status,
  study
}: {
  evidence?: PortalScreeningAttemptRecord["participantEvidence"];
  id: string;
  participant: PortalStudyParticipantRecord;
  source: "FIELD" | "PARTICIPANT_PORTAL";
  status: PortalScreeningAttemptRecord["status"];
  study: PortalScreenerStudyRecord;
}): PortalScreeningAttemptRecord {
  return {
    completedAt: status === "STARTED" || status === "INCOMPLETE" ? null : new Date("2026-06-23T11:00:00Z"),
    evaluationJson: null,
    fieldUserId: null,
    id,
    nseClass: null,
    nseScore: null,
    participantConfirmation: null,
    participantEvidence: evidence,
    participantScreeningReview: status === "PENDING_REVIEW"
      ? { id: "review-1", rejectionReason: null, status: "PENDING" }
      : null,
    questionnaireVersion: {
      ...study.activeScreenerVersion!,
      study: {
        code: study.code,
        id: study.id,
        name: study.name,
        status: study.status
      }
    },
    questionnaireVersionId: study.activeScreenerVersion!.id,
    source,
    startedAt: new Date("2026-06-23T10:00:00Z"),
    status,
    studyParticipant: {
      ...participant,
      participantProfile: participantProfile()
    },
    studyParticipantId: participant.id,
    terminationCode: null,
    terminationReason: null
  };
}

function portalEvidence(type: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION") {
  return {
    id: `${type.toLowerCase()}-1`,
    relatedQuestionId: type === "PERFUME_PHOTO" ? "F6_MARCAS_UTILIZA" : null,
    type
  };
}

async function answer(
  repository: ParticipantPortalScreenerRepository,
  attemptId: string,
  questionId: string,
  value: string | string[],
  otherText = "",
  studyCode = "FMASCULINA-NAVIGO-2026"
) {
  return saveParticipantPortalScreenerAnswer({
    attemptId,
    formInput: { otherText, value },
    identity,
    questionId,
    repository,
    studyCode
  });
}

async function start(repository: ParticipantPortalScreenerRepository, studyCode = "FMASCULINA-NAVIGO-2026") {
  const result = await getParticipantPortalScreenerScreen({
    identity,
    repository,
    studyCode
  });

  expect(result.ok).toBe(true);
  return result.ok ? result.data.attempt.id : "";
}

async function answerEligible(
  repository: ParticipantPortalScreenerRepository,
  attemptId: string,
  studyCode = "FMASCULINA-NAVIGO-2026"
) {
  if (studyCode === DETERGENTS_STUDY_CODE) {
    await answer(repository, attemptId, DETERGENT_RECRUITER_QUESTION_ID, "RECLUTADORA", "", studyCode);
  }

  await answer(repository, attemptId, "CONSENTIMIENTO", "SI", "", studyCode);
  await answer(repository, attemptId, "F1_GENERO", "HOMBRE", "", studyCode);
  await answer(repository, attemptId, "F6_MARCAS_UTILIZA", "Uso varias fragancias.", "", studyCode);
  await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA", "", studyCode);
  await answer(repository, attemptId, "F9A_VECES_AL_DIA", "3", "", studyCode);

  for (const questionId of ["D1", "D2", "D3", "D4", "D5", "D6"]) {
    await answer(repository, attemptId, questionId, "HIGH", "", studyCode);
  }
}

describe("participant portal screener service", () => {
  it("does not enter when portal is disabled", async () => {
    const { repository } = createMemoryRepository({
      study: activeStudy({ portalConfig: { ...activeStudy().portalConfig!, enabled: false } })
    });

    const result = await getParticipantPortalScreenerScreen({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result).toMatchObject({ code: "PORTAL_UNAVAILABLE", ok: false });
  });

  it("does not enter without registration or consent", async () => {
    const withoutProfile = await getParticipantPortalScreenerScreen({
      identity,
      repository: createMemoryRepository({ profile: null }).repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });
    const withoutConsent = await getParticipantPortalScreenerScreen({
      identity,
      repository: createMemoryRepository({ consents: [] }).repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(withoutProfile).toMatchObject({ code: "REGISTRATION_REQUIRED", ok: false });
    expect(withoutConsent).toMatchObject({ code: "CONSENT_REQUIRED", ok: false });
  });

  it("creates a PARTICIPANT_PORTAL attempt with null fieldUserId", async () => {
    const { attempts, repository } = createMemoryRepository();
    const attemptId = await start(repository);

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      fieldUserId: null,
      id: attemptId,
      source: "PARTICIPANT_PORTAL",
      status: "STARTED"
    });
  });

  it("creates new portal attempts with the current ACTIVE screener version", async () => {
    const { attempts, repository } = createMemoryRepository({
      study: activeStudy({
        activeScreenerVersion: {
          ...activeStudy().activeScreenerVersion!,
          id: "version-2",
          versionNumber: 2
        }
      })
    });

    await start(repository);

    expect(attempts[0]).toMatchObject({
      questionnaireVersionId: "version-2",
      questionnaireVersion: {
        id: "version-2",
        versionNumber: 2
      }
    });
  });

  it("continues a STARTED attempt", async () => {
    const { attempts, repository } = createMemoryRepository();
    const attemptId = await start(repository);
    const second = await getParticipantPortalScreenerScreen({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(second.ok ? second.data.attempt.id : null).toBe(attemptId);
    expect(attempts).toHaveLength(1);
  });

  it("blocks a closed portal attempt", async () => {
    const memory = createMemoryRepository();
    const participant = studyParticipant();
    memory.attempts.push(
      buildAttempt({ id: "attempt-closed", participant, source: "PARTICIPANT_PORTAL", status: "TERMINATED", study: activeStudy() })
    );
    const result = await getParticipantPortalScreenerScreen({
      identity,
      repository: memory.repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result).toMatchObject({ code: "CLOSED_ATTEMPT_EXISTS", ok: false });
  });

  it("respects conditional visibility for F9A", async () => {
    const { repository } = createMemoryRepository();
    const attemptId = await start(repository);
    let screen = await getParticipantPortalScreenerScreen({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(screen.ok ? screen.data.visibleQuestions.some((question) => question.id === "F9A_VECES_AL_DIA") : true).toBe(false);

    await answer(repository, attemptId, "CONSENTIMIENTO", "SI");
    await answer(repository, attemptId, "F1_GENERO", "HOMBRE");
    await answer(repository, attemptId, "F6_MARCAS_UTILIZA", "Uso perfume.");
    await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
    screen = await getParticipantPortalScreenerScreen({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(screen.ok ? screen.data.currentQuestion?.id : null).toBe("F9A_VECES_AL_DIA");
  });

  it("shows and saves the detergent recruiter question as normalized short text", async () => {
    const { answers, repository } = createMemoryRepository({
      study: activeStudy({
        code: DETERGENTS_STUDY_CODE,
        name: "Detergentes y cuidado de la ropa"
      })
    });
    const screen = await getParticipantPortalScreenerScreen({
      identity,
      repository,
      studyCode: DETERGENTS_STUDY_CODE
    });
    const attemptId = screen.ok ? screen.data.attempt.id : "";

    expect(screen.ok ? screen.data.currentQuestion?.id : null).toBe(DETERGENT_RECRUITER_QUESTION_ID);
    expect(screen.ok ? screen.data.visibleQuestions[0]?.id : null).toBe(DETERGENT_RECRUITER_QUESTION_ID);

    const saved = await answer(
      repository,
      attemptId,
      DETERGENT_RECRUITER_QUESTION_ID,
      "  Mar\u00eda   \u00d1and\u00fa  \ud83d\ude0a ",
      "",
      DETERGENTS_STUDY_CODE
    );

    expect(saved.ok).toBe(true);
    expect(saved.ok ? saved.data.nextQuestionId : null).toBe("CONSENTIMIENTO");
    expect(answers.get(attemptId)?.find((item) => item.questionId === DETERGENT_RECRUITER_QUESTION_ID)?.answerJson).toBe(
      "MAR\u00cdA \u00d1AND\u00da"
    );
  });

  it("saves single choice, short text, long text, integer and Other text with preserved spaces", async () => {
    const { answers, repository } = createMemoryRepository();
    const attemptId = await start(repository);

    await answer(repository, attemptId, "CONSENTIMIENTO", "SI");
    await answer(repository, attemptId, "F1_GENERO", "HOMBRE");
    await answer(repository, attemptId, "F6_MARCAS_UTILIZA", "  navigo   homme azul  ");
    await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
    await answer(repository, attemptId, "F9A_VECES_AL_DIA", "4");
    await answer(repository, attemptId, "F10_ULTIMA_COMPRA", "  2   meses  ");
    await answer(repository, attemptId, "OTRO", "OTRA", "Fragancia  de ejemplo azul 💐");

    const saved = answers.get(attemptId) ?? [];
    expect(saved.find((item) => item.questionId === "F1_GENERO")?.answerJson).toBe("HOMBRE");
    expect(saved.find((item) => item.questionId === "F6_MARCAS_UTILIZA")?.answerJson).toBe("NAVIGO HOMME AZUL");
    expect(saved.find((item) => item.questionId === "F9A_VECES_AL_DIA")?.answerJson).toBe(4);
    expect(saved.find((item) => item.questionId === "F10_ULTIMA_COMPRA")?.answerJson).toBe("2 MESES");
    expect(saved.find((item) => item.questionId === "OTRO")?.answerJson).toEqual({
      otherText: "FRAGANCIA DE EJEMPLO AZUL",
      value: "OTRA"
    });
  });

  it("rejects an invalid option value", async () => {
    const { repository } = createMemoryRepository();
    const attemptId = await start(repository);
    const result = await answer(repository, attemptId, "CONSENTIMIENTO", "VALOR_INVALIDO");

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
  });

  it("blocks F6 when there are no perfume photos yet", async () => {
    const { repository } = createMemoryRepository({
      initialEvidence: [portalEvidence("SELFIE_IDENTIFICATION")]
    });
    const attemptId = await start(repository);

    await answer(repository, attemptId, "CONSENTIMIENTO", "SI");
    await answer(repository, attemptId, "F1_GENERO", "HOMBRE");
    const result = await answer(repository, attemptId, "F6_MARCAS_UTILIZA", "Uso perfume.");

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
  });

  it("shows generic public termination for insufficient frequency and hides reason or code", async () => {
    const { repository } = createMemoryRepository();
    const attemptId = await start(repository);

    await answer(repository, attemptId, "CONSENTIMIENTO", "SI");
    await answer(repository, attemptId, "F1_GENERO", "HOMBRE");
    await answer(repository, attemptId, "F6_MARCAS_UTILIZA", "Uso perfume.");
    await answer(repository, attemptId, "F9_FRECUENCIA_SEMANAL", "UN_DIA");

    const result = await getParticipantPortalPublicResult({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result.ok ? result.data.message : "").toBe(PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE);
    expect(result.ok ? result.data.message : "").not.toContain("FRECUENCIA_INSUFICIENTE");
    expect(result.ok ? result.data.message : "").not.toContain("Frecuencia insuficiente");
  });

  it("keeps a preliminary eligible result in PASSED until the final selfie is completed", async () => {
    const { attempts, repository, reviews } = createMemoryRepository();
    const attemptId = await start(repository);

    await answerEligible(repository, attemptId);

    expect(attempts[0]).toMatchObject({
      nseClass: "C",
      nseScore: 150,
      status: "PASSED",
      participantScreeningReview: null,
      terminationCode: null,
      terminationReason: null
    });
    expect(reviews).toEqual([]);

    const result = await getParticipantPortalPublicResult({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result.ok ? result.data.kind : "").toBe("PENDING_EVIDENCE");
    expect(result.ok ? result.data.message : "").toContain("Falta tu selfie");
  });

  it("shows a final public message for a filter-only passed attempt without asking for selfie", async () => {
    const { repository } = createMemoryRepository({
      study: activeStudy({
        code: DETERGENTS_STUDY_CODE,
        name: "Detergentes"
      })
    });
    const attemptId = await start(repository, DETERGENTS_STUDY_CODE);

    await answerEligible(repository, attemptId, DETERGENTS_STUDY_CODE);

    const result = await getParticipantPortalPublicResult({
      identity,
      repository,
      studyCode: DETERGENTS_STUDY_CODE
    });

    expect(result).toMatchObject({
      data: {
        kind: "COMPLETED",
        message: PARTICIPANT_PORTAL_PUBLIC_FILTER_ONLY_PASSED_MESSAGE,
        showEvidencePlaceholder: false
      },
      ok: true
    });
  });

  it("does not use QuestionnaireDraft to discover the active public screener", async () => {
    const prisma = {
      study: {
        findUnique: vi.fn(async () => ({
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina",
          participantPortalConfig: activeStudy().portalConfig,
          questionnaireVersions: [activeStudy().activeScreenerVersion],
          status: "ACTIVE"
        }))
      }
    };
    const repository = createParticipantPortalScreenerRepository(prisma as never);
    await repository.getStudyByCode("FMASCULINA-NAVIGO-2026");
    const calls = prisma.study.findUnique.mock.calls as unknown[][];
    const query = JSON.stringify(calls[0]?.[0]);

    expect(query).not.toContain("questionnaireDraft");
  });
});
