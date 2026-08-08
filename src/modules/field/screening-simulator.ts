import type { ScreenerDefinition } from "@/modules/screener";
import { NAVIGO_HUT_ACCESS_QUESTION_ID } from "@/modules/screener/study-overrides";
import { PARTICIPANT_EVIDENCE_BUCKET } from "@/modules/participant-portal/evidence-storage";
import { generateParticipantReferenceCode } from "@/modules/participant-portal/review";
import {
  confirmFieldEvidenceUpload,
  getFieldScreeningAttemptScreen,
  PUBLIC_FIELD_ACTOR,
  saveFieldScreeningAnswer,
  startFieldScreeningAttempt
} from "./service";
import type {
  FieldParticipantEvidenceRecord,
  FieldParticipantProfileRecord,
  FieldRepository,
  FieldScreeningAnswerRecord,
  FieldScreeningAttemptRecord,
  FieldScreeningStatus,
  FieldStudyParticipantRecord,
  FieldStudySummary
} from "./repository";

const SIMULATION_STUDY_ID = "field-simulation-study";
const SIMULATION_VERSION_ID = "field-simulation-version";

export type FieldScreeningSimulationCaseId =
  | "ELIGIBLE_PARTICIPANT"
  | "F6_INCOMPLETE_EVIDENCE"
  | "ABANDON_AND_RESUME"
  | "TERMINATION"
  | "HUT_DECISION_OUTSIDE_SCREENING";

export type FieldScreeningSimulationCaseReport = {
  attemptId: string | null;
  caseId: FieldScreeningSimulationCaseId;
  codeGenerated: boolean;
  evidence: "COMPLETE" | "INCOMPLETE" | "NOT_REQUIRED";
  folio: string | null;
  notes: string[];
  result: "OK" | "FAILED";
  state: FieldScreeningStatus | "NOT_STARTED";
};

export type FieldScreeningSimulationReport = {
  cases: FieldScreeningSimulationCaseReport[];
  generatedAt: Date;
  simulationMode: true;
};

export async function runFieldScreeningSimulation(): Promise<FieldScreeningSimulationReport> {
  const cases = [
    await simulateEligibleParticipant(),
    await simulateF6IncompleteEvidence(),
    await simulateAbandonAndResume(),
    await simulateTermination(),
    await simulateHutNavigoFlag()
  ];

  return {
    cases,
    generatedAt: new Date(),
    simulationMode: true
  };
}

export async function simulateEligibleParticipant(): Promise<FieldScreeningSimulationCaseReport> {
  const simulator = createFieldScreeningSimulationRepository();
  const attemptId = await startSimulationAttempt(simulator, "SIM-ELEGIBLE-001");

  await answer(simulator.repository, attemptId, "CONSENTIMIENTO", "SI");
  await answer(simulator.repository, attemptId, "F1_GENERO", "HOMBRE");
  await answer(simulator.repository, attemptId, "F2_EDAD", "25");
  await addPerfumePhoto(simulator.repository, attemptId);
  await answer(simulator.repository, attemptId, "F6_MARCAS_UTILIZA", "NAVIGO HOMME AZUL");
  await answer(simulator.repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
  await answer(simulator.repository, attemptId, "F9A_VECES_AL_DIA", "3");
  await answerNse(simulator.repository, attemptId, "HIGH");
  if (simulator.getAttemptSnapshot(attemptId)?.status === "PASSED") {
    simulator.ensureParticipantConfirmation(attemptId);
  }

  const attempt = simulator.getAttemptSnapshot(attemptId);

  return caseReport({
    attempt,
    caseId: "ELIGIBLE_PARTICIPANT",
    codeGenerated: Boolean(attempt?.participantConfirmation?.referenceCodes.length === 3),
    evidence: "COMPLETE",
    folio: attempt?.participantConfirmation?.folio ?? null,
    notes: [
      `Estado esperado PASSED: ${attempt?.status === "PASSED" ? "OK" : "FALLO"}`,
      `Folio generado: ${attempt?.participantConfirmation?.folio ?? "NO"}`,
      `Codigos 1,2,3 generados: ${attempt?.participantConfirmation?.referenceCodes.length === 3 ? "SI" : "NO"}`
    ],
    result:
      attempt?.status === "PASSED" && attempt.participantConfirmation?.referenceCodes.length === 3
        ? "OK"
        : "FAILED"
  });
}

export async function simulateF6IncompleteEvidence(): Promise<FieldScreeningSimulationCaseReport> {
  const simulator = createFieldScreeningSimulationRepository();
  const attemptId = await startSimulationAttempt(simulator, "SIM-F6-001");

  await answer(simulator.repository, attemptId, "CONSENTIMIENTO", "SI");
  await answer(simulator.repository, attemptId, "F1_GENERO", "HOMBRE");
  await answer(simulator.repository, attemptId, "F2_EDAD", "25");
  const blocked = await answer(simulator.repository, attemptId, "F6_MARCAS_UTILIZA", "NAVIGO HOMME AZUL");
  const blockedScreen = await getFieldScreeningAttemptScreen({
    actor: PUBLIC_FIELD_ACTOR,
    attemptId,
    repository: simulator.repository
  });
  await addPerfumePhoto(simulator.repository, attemptId);
  const retry = await answer(simulator.repository, attemptId, "F6_MARCAS_UTILIZA", "NAVIGO HOMME AZUL");
  const attempt = simulator.getAttemptSnapshot(attemptId);
  const staysInF6 = blockedScreen.ok && blockedScreen.data.currentQuestion?.id === "F6_MARCAS_UTILIZA";
  const retryAllowed = retry.ok && !retry.data.closed && retry.data.nextQuestionId === "F9_FRECUENCIA_SEMANAL";

  return caseReport({
    attempt,
    caseId: "F6_INCOMPLETE_EVIDENCE",
    codeGenerated: false,
    evidence: "INCOMPLETE",
    folio: null,
    notes: [
      `Continuar sin foto fue bloqueado: ${!blocked.ok ? "SI" : "NO"}`,
      `F6 permanecio pendiente: ${staysInF6 ? "SI" : "NO"}`,
      `Reintento despues de evidencia valida permitido: ${retryAllowed ? "SI" : "NO"}`
    ],
    result: !blocked.ok && staysInF6 && retryAllowed ? "OK" : "FAILED"
  });
}

export async function simulateAbandonAndResume(): Promise<FieldScreeningSimulationCaseReport> {
  const simulator = createFieldScreeningSimulationRepository();
  const attemptId = await startSimulationAttempt(simulator, "SIM-RESUME-001");

  await answer(simulator.repository, attemptId, "CONSENTIMIENTO", "SI");
  await answer(simulator.repository, attemptId, "F1_GENERO", "HOMBRE");
  const duplicate = await startFieldScreeningAttempt({
    actor: PUBLIC_FIELD_ACTOR,
    formInput: participantInput("SIM-RESUME-001"),
    repository: simulator.repository,
    studyId: SIMULATION_STUDY_ID
  });
  const resumed = await getFieldScreeningAttemptScreen({
    actor: PUBLIC_FIELD_ACTOR,
    attemptId,
    repository: simulator.repository
  });
  const attempt = simulator.getAttemptSnapshot(attemptId);
  const duplicatePointsToAttempt =
    duplicate.ok &&
    duplicate.data.kind === "duplicate_found" &&
    duplicate.data.matches.some((match) => match.continueAttemptHref === `/field/screening/${attemptId}`);

  return caseReport({
    attempt,
    caseId: "ABANDON_AND_RESUME",
    codeGenerated: false,
    evidence: "NOT_REQUIRED",
    folio: null,
    notes: [
      `Mismo intento disponible: ${duplicatePointsToAttempt ? "SI" : "NO"}`,
      `Pregunta pendiente al reanudar: ${resumed.ok ? resumed.data.currentQuestion?.id ?? "NINGUNA" : "ERROR"}`,
      `Intentos creados: ${simulator.countAttempts()}`
    ],
    result:
      duplicatePointsToAttempt &&
      resumed.ok &&
      resumed.data.currentQuestion?.id === "F2_EDAD" &&
      simulator.countAttempts() === 1
        ? "OK"
        : "FAILED"
  });
}

export async function simulateTermination(): Promise<FieldScreeningSimulationCaseReport> {
  const simulator = createFieldScreeningSimulationRepository();
  const attemptId = await startSimulationAttempt(simulator, "SIM-TERMINATED-001");

  await answer(simulator.repository, attemptId, "CONSENTIMIENTO", "SI");
  const result = await answer(simulator.repository, attemptId, "F1_GENERO", "MUJER");
  const attempt = simulator.getAttemptSnapshot(attemptId);
  const evaluationJson = attempt?.evaluationJson as
    | { closureDiagnostics?: { status?: string; triggerQuestionId?: string } }
    | null
    | undefined;

  return caseReport({
    attempt,
    caseId: "TERMINATION",
    codeGenerated: false,
    evidence: "NOT_REQUIRED",
    folio: null,
    notes: [
      `Cierre reportado por servicio: ${result.ok && result.data.closed ? "SI" : "NO"}`,
      `terminationCode: ${attempt?.terminationCode ?? "NO"}`,
      `terminationReason: ${attempt?.terminationReason ?? "NO"}`,
      `closureDiagnostics: ${evaluationJson?.closureDiagnostics?.status ?? "NO"}`
    ],
    result:
      attempt?.status === "TERMINATED" &&
      attempt.terminationCode === "GENERO_NO_ELEGIBLE" &&
      Boolean(attempt.terminationReason) &&
      evaluationJson?.closureDiagnostics?.triggerQuestionId === "F1_GENERO"
        ? "OK"
        : "FAILED"
  });
}

export async function simulateHutNavigoFlag(): Promise<FieldScreeningSimulationCaseReport> {
  const simulator = createFieldScreeningSimulationRepository();
  const attemptId = await startSimulationAttempt(simulator, "SIM-HUT-001");

  await answer(simulator.repository, attemptId, "CONSENTIMIENTO", "SI");
  await answer(simulator.repository, attemptId, "F1_GENERO", "HOMBRE");
  await answer(simulator.repository, attemptId, "F2_EDAD", "25");
  await addPerfumePhoto(simulator.repository, attemptId);
  await answer(simulator.repository, attemptId, "F6_MARCAS_UTILIZA", "NAVIGO HOMME AZUL");
  await answer(simulator.repository, attemptId, "F9_FRECUENCIA_SEMANAL", "MAS_DE_UNA_VEZ_DIA");
  await answer(simulator.repository, attemptId, "F9A_VECES_AL_DIA", "3");
  await answerNse(simulator.repository, attemptId, "HIGH");
  const answers = simulator.getAnswersSnapshot(attemptId);
  const attempt = simulator.getAttemptSnapshot(attemptId);

  return caseReport({
    attempt,
    caseId: "HUT_DECISION_OUTSIDE_SCREENING",
    codeGenerated: false,
    evidence: "COMPLETE",
    folio: null,
    notes: [
      `Pregunta HUT legacy en screener: ${NAVIGO_HUT_ACCESS_QUESTION_ID in answers ? "SI" : "NO"}`,
      `Decision HUT fuera del screening: ${!(NAVIGO_HUT_ACCESS_QUESTION_ID in answers) && attempt?.status === "PASSED" ? "SI" : "NO"}`
    ],
    result: !(NAVIGO_HUT_ACCESS_QUESTION_ID in answers) && attempt?.status === "PASSED"
      ? "OK"
      : "FAILED"
  });
}

export function formatFieldScreeningSimulationReport(report: FieldScreeningSimulationReport): string {
  return report.cases
    .map((item) =>
      [
        `Caso: ${item.caseId}`,
        `Resultado: ${item.result}`,
        `Estado: ${item.state}`,
        `Evidencia: ${item.evidence}`,
        `Folio: ${item.folio ?? "NO"}`,
        `Codigo generado: ${item.codeGenerated ? "SI" : "NO"}`,
        ...item.notes.map((note) => `- ${note}`)
      ].join("\n")
    )
    .join("\n\n");
}

function caseReport(input: {
  attempt: FieldScreeningAttemptRecord | null;
  caseId: FieldScreeningSimulationCaseId;
  codeGenerated: boolean;
  evidence: FieldScreeningSimulationCaseReport["evidence"];
  folio: string | null;
  notes: string[];
  result: "OK" | "FAILED";
}): FieldScreeningSimulationCaseReport {
  return {
    attemptId: input.attempt?.id ?? null,
    caseId: input.caseId,
    codeGenerated: input.codeGenerated,
    evidence: input.evidence,
    folio: input.folio,
    notes: input.notes,
    result: input.result,
    state: input.attempt?.status ?? "NOT_STARTED"
  };
}

async function startSimulationAttempt(
  simulator: FieldScreeningSimulationRepository,
  externalReference: string
): Promise<string> {
  const result = await startFieldScreeningAttempt({
    actor: PUBLIC_FIELD_ACTOR,
    formInput: participantInput(externalReference),
    repository: simulator.repository,
    studyId: SIMULATION_STUDY_ID
  });

  if (!result.ok || result.data.kind !== "started") {
    throw new Error("No fue posible iniciar el intento simulado.");
  }

  return result.data.attemptId;
}

async function answer(
  repository: FieldRepository,
  attemptId: string,
  questionId: string,
  value: string | string[]
) {
  return saveFieldScreeningAnswer({
    actor: PUBLIC_FIELD_ACTOR,
    attemptId,
    formInput: { value },
    questionId,
    repository
  });
}

async function answerNse(repository: FieldRepository, attemptId: string, value: "HIGH" | "LOW") {
  for (const questionId of ["D1", "D2", "D3", "D4", "D5", "D6"]) {
    await answer(repository, attemptId, questionId, value);
  }
}

async function addPerfumePhoto(repository: FieldRepository, attemptId: string) {
  const attempt = await repository.getAttempt(attemptId);

  if (!attempt) {
    throw new Error("Intento simulado no encontrado.");
  }

  return confirmFieldEvidenceUpload({
    actor: PUBLIC_FIELD_ACTOR,
    attemptId,
    input: {
      evidenceType: "PERFUME_PHOTO",
      mimeType: "image/jpeg",
      originalFilename: "perfume-simulado.jpg",
      privateStorageKey: `studies/${SIMULATION_STUDY_ID}/participants/${attempt.studyParticipant.participantProfile.id}/screening-attempts/${attemptId}/perfume_photo/perfume-simulado.jpg`,
      sizeBytes: 1200,
      storageBucket: PARTICIPANT_EVIDENCE_BUCKET
    },
    repository
  });
}

function participantInput(externalReference: string) {
  return {
    email: "",
    externalReference,
    name: `Participante ${externalReference}`,
    phone: `555${externalReference.replace(/\D/g, "").padStart(7, "0").slice(-7)}`
  };
}

function createFieldScreeningSimulationRepository(): FieldScreeningSimulationRepository {
  return new FieldScreeningSimulationRepository();
}

class FieldScreeningSimulationRepository {
  private readonly answers = new Map<string, FieldScreeningAnswerRecord[]>();
  private readonly attempts: FieldScreeningAttemptRecord[] = [];
  private readonly participants: FieldStudyParticipantRecord[] = [];
  private readonly profiles: FieldParticipantProfileRecord[] = [];
  private nextConfirmationSequence = 1;
  private readonly study = simulationStudy();

  readonly repository: FieldRepository = {
    createEvidence: async (input) => {
      const attempt = this.attempts.find((item) => item.id === input.screeningAttemptId)!;
      const evidence: FieldParticipantEvidenceRecord = {
        extension: input.extension,
        id: `evidence-${attempt.participantEvidence.length + 1}`,
        mimeType: input.mimeType,
        originalFilename: input.originalFilename,
        privateStorageKey: input.privateStorageKey,
        relatedQuestionId: input.relatedQuestionId,
        reviewStatus: "PENDING",
        sizeBytes: input.sizeBytes,
        storageBucket: input.storageBucket,
        type: input.type,
        uploadedAt: new Date("2026-08-07T08:10:00.000Z")
      };
      attempt.participantEvidence.push(evidence);
      return evidence;
    },
    createParticipantProfile: async (input) => {
      const profile: FieldParticipantProfileRecord = {
        email: input.email ?? null,
        externalReference: input.externalReference ?? null,
        id: `profile-${this.profiles.length + 1}`,
        name: input.name,
        phone: input.phone ?? null
      };
      this.profiles.push(profile);
      return profile;
    },
    createScreeningAttempt: async (input) => {
      const participant = this.participants.find((item) => item.id === input.studyParticipantId)!;
      const profile = this.profiles.find((item) => item.id === participant.participantProfileId)!;
      const attempt: FieldScreeningAttemptRecord = {
        completedAt: null,
        evaluationJson: null,
        fieldUserId: input.fieldUserId,
        id: `attempt-${this.attempts.length + 1}`,
        nseClass: null,
        nseScore: null,
        participantEvidence: [],
        participantScreeningReview: null,
        questionnaireVersion: {
          ...this.study.activeScreenerVersion,
          study: {
            code: this.study.code,
            id: this.study.id,
            name: this.study.name,
            participantPortalConfig: {
              maxImageBytes: 8388608,
              maxPerfumePhotos: 5,
              minPerfumePhotos: 1
            },
            status: this.study.status,
            timeZoneIana: this.study.timeZoneIana
          }
        },
        participantConfirmation: null,
        questionnaireVersionId: input.questionnaireVersionId,
        source: "FIELD",
        startedAt: new Date("2026-08-07T08:00:00.000Z"),
        status: "STARTED",
        studyParticipant: {
          ...participant,
          participantProfile: profile
        },
        studyParticipantId: input.studyParticipantId,
        terminationCode: null,
        terminationReason: null
      };
      this.attempts.push(attempt);
      this.answers.set(attempt.id, []);
      return attempt;
    },
    createStudyParticipant: async (input) => {
      const participant: FieldStudyParticipantRecord = {
        id: `study-participant-${this.participants.length + 1}`,
        participantProfileId: input.participantProfileId,
        screeningStatus: input.screeningStatus,
        studyId: input.studyId
      };
      this.participants.push(participant);
      return participant;
    },
    findParticipantProfileById: async (participantProfileId) =>
      this.profiles.find((profile) => profile.id === participantProfileId) ?? null,
    findParticipantProfileMatches: async (input) =>
      this.profiles.filter(
        (profile) =>
          (input.phone && profile.phone === input.phone) ||
          (input.email && profile.email === input.email) ||
          (input.externalReference && profile.externalReference === input.externalReference)
      ),
    findReusableParticipantProfile: async (input) =>
      this.profiles.find(
        (profile) =>
          (input.phone && profile.phone === input.phone) ||
          (input.email && profile.email === input.email) ||
          (input.externalReference && profile.externalReference === input.externalReference)
      ) ?? null,
    findStudyParticipant: async (input) =>
      this.participants.find(
        (participant) =>
          participant.participantProfileId === input.participantProfileId &&
          participant.studyId === input.studyId
      ) ?? null,
    getAttempt: async (attemptId) => this.attempts.find((attempt) => attempt.id === attemptId) ?? null,
    getStudyWithActiveScreener: async (studyId) => (this.study.id === studyId ? this.study : null),
    listAnswers: async (attemptId) => this.answers.get(attemptId) ?? [],
    listAvailableStudies: async () => [this.study],
    listScreeningAttemptsForProfileInStudy: async (input) =>
      this.attempts.filter(
        (attempt) =>
          attempt.studyParticipant.participantProfileId === input.participantProfileId &&
          attempt.studyParticipant.studyId === input.studyId
      ),
    updateAttemptEvaluation: async (input) => {
      const attempt = this.attempts.find((item) => item.id === input.attemptId)!;
      attempt.completedAt = input.completedAt;
      attempt.evaluationJson = input.evaluationJson;
      attempt.nseClass = input.nseClass ?? null;
      attempt.nseScore = input.nseScore ?? null;
      attempt.status = input.status;
      attempt.terminationCode = input.terminationCode ?? null;
      attempt.terminationReason = input.terminationReason ?? null;
      const participant = this.participants.find((item) => item.id === input.studyParticipantId)!;
      participant.screeningStatus = input.screeningStatus;
    },
    updateStudyParticipantScreening: async (input) => {
      const participant = this.participants.find((item) => item.id === input.studyParticipantId)!;
      participant.screeningStatus = input.screeningStatus;
      void input.operationalStatus;
    },
    upsertAnswer: async (input) => {
      const currentAnswers = this.answers.get(input.screeningAttemptId) ?? [];
      const existing = currentAnswers.find((answer) => answer.questionId === input.questionId);

      if (existing) {
        existing.answerJson = input.answerJson;
        return existing;
      }

      const answerRecord = {
        answerJson: input.answerJson,
        questionId: input.questionId
      };
      currentAnswers.push(answerRecord);
      this.answers.set(input.screeningAttemptId, currentAnswers);
      return answerRecord;
    },
    upsertPendingReview: async (input) => {
      const attempt = this.attempts.find((item) => item.id === input.screeningAttemptId)!;
      attempt.participantScreeningReview = {
        rejectionReason: null,
        status: "PENDING"
      };
      void input.studyParticipantId;
    }
  };

  countAttempts(): number {
    return this.attempts.length;
  }

  ensureParticipantConfirmation(attemptId: string) {
    const attempt = this.attempts.find((item) => item.id === attemptId);

    if (!attempt) {
      throw new Error("Intento simulado no encontrado.");
    }

    if (!attempt.participantConfirmation) {
      const sequence = this.nextConfirmationSequence;
      this.nextConfirmationSequence += 1;
      attempt.participantConfirmation = {
        folio: `SIM-${String(sequence).padStart(3, "0")}`,
        referenceCodes: [1, 2, 3].map((slot) => ({
          code: generateParticipantReferenceCode(),
          slot
        }))
      };
    }

    return attempt.participantConfirmation;
  }

  getAnswersSnapshot(attemptId: string): Record<string, unknown> {
    return Object.fromEntries((this.answers.get(attemptId) ?? []).map((answer) => [answer.questionId, answer.answerJson]));
  }

  getAttemptSnapshot(attemptId: string): FieldScreeningAttemptRecord | null {
    return this.attempts.find((attempt) => attempt.id === attemptId) ?? null;
  }
}

function simulationStudy(): FieldStudySummary {
  return {
    activeScreenerVersion: {
      definitionHash: "field-simulation-definition",
      definitionJson: simulationScreenerDefinition(),
      id: SIMULATION_VERSION_ID,
      publishedAt: new Date("2026-08-07T08:00:00.000Z"),
      status: "ACTIVE",
      versionNumber: 1
    },
    code: "FMASCULINA-NAVIGO-2026",
    createdByUserId: "admin-simulation",
    id: SIMULATION_STUDY_ID,
    name: "Simulacion Campo Navigo",
    status: "ACTIVE",
    timeZoneIana: "America/Mexico_City"
  };
}

function simulationScreenerDefinition(): ScreenerDefinition {
  return {
    nse: {
      code: "NSE",
      inputs: ["D1", "D2", "D3", "D4", "D5", "D6"].map((questionId) => ({
        missingScore: 0,
        questionId,
        scoreByAnswer: { HIGH: 30, LOW: 0 }
      })),
      label: "Nivel socioeconomico",
      ranges: [
        { code: "AB", eligible: false, label: "A/B", max: 300, min: 202 },
        { code: "C_PLUS", eligible: true, label: "C+", max: 201, min: 168 },
        { code: "C", eligible: true, label: "C tipico", max: 167, min: 141 },
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
        option("SI", "Si, acepto participar"),
        option("NO", "No, no acepto participar", "TERMINATE", "SIN_CONSENTIMIENTO", "No acepto participar.")
      ], "CONSENT_YES_NO"),
      choiceQuestion("F1_GENERO", 2, "Genero", [
        option("HOMBRE", "Hombre"),
        option("MUJER", "Mujer", "TERMINATE", "GENERO_NO_ELEGIBLE", "El estudio esta dirigido a hombres.")
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
      {
        dataDestination: "SCREENING",
        id: "F6_MARCAS_UTILIZA",
        order: 4,
        required: true,
        text: "Que marcas de perfume utiliza",
        type: "LONG_TEXT",
        validation: {}
      },
      choiceQuestion("F9_FRECUENCIA_SEMANAL", 5, "Frecuencia semanal", [
        option("UN_DIA", "Un dia", "TERMINATE", "FRECUENCIA_INSUFICIENTE", "Frecuencia insuficiente."),
        option("DOS_DIAS", "Dos dias", "TERMINATE", "FRECUENCIA_INSUFICIENTE", "Frecuencia insuficiente."),
        option("MAS_DE_UNA_VEZ_DIA", "Mas de una vez al dia")
      ]),
      {
        dataDestination: "SCREENING",
        id: "F9A_VECES_AL_DIA",
        order: 6,
        required: true,
        text: "Veces al dia",
        type: "INTEGER",
        validation: { max: 20, min: 2 },
        visibilityCondition: {
          questionId: "F9_FRECUENCIA_SEMANAL",
          type: "ANSWER_EQUALS",
          value: "MAS_DE_UNA_VEZ_DIA"
        }
      },
      ...["D1", "D2", "D3", "D4", "D5", "D6"].map((id, index) =>
        choiceQuestion(id, 7 + index, `Pregunta NSE ${index + 1}`, [
          option("HIGH", "Alto"),
          option("LOW", "Bajo")
        ])
      )
    ],
    rules: [
      {
        condition: { max: 19, min: 0, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
        id: "EDAD_MENOR_20",
        order: 1,
        outcome: { code: "EDAD_MENOR_20", reason: "La edad es menor a 20 anos.", type: "TERMINATE" }
      },
      {
        condition: { max: 120, min: 51, questionId: "F2_EDAD", type: "NUMBER_RANGE" },
        id: "EDAD_MAYOR_50",
        order: 2,
        outcome: { code: "EDAD_MAYOR_50", reason: "La edad es mayor a 50 anos.", type: "TERMINATE" }
      }
    ],
    schemaVersion: "screening.v1",
    title: "Simulacion de filtro campo"
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
