import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  conditionMatches,
  evaluateScreener,
  getVisibleQuestions,
  parseScreenerDefinition,
  type ScreenerAnswer,
  type ScreenerAnswers,
  type ScreenerDefinition,
  type ScreenerEvaluationReason,
  type ScreenerEvaluationResult,
  type ScreenerQuestion
} from "@/modules/screener";
import {
  fieldAnswerInputSchema,
  fieldParticipantInputSchema,
  type FieldAnswerInput,
  type FieldParticipantInput
} from "./validation";
import type {
  FieldOperationalStatus,
  FieldRepository,
  FieldScreeningAnswerRecord,
  FieldScreeningAttemptRecord,
  FieldScreeningStatus,
  FieldStudySummary
} from "./repository";

export type FieldActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type FieldServiceErrorCode =
  | "ATTEMPT_CLOSED"
  | "ATTEMPT_NOT_FOUND"
  | "QUESTION_HIDDEN"
  | "QUESTION_NOT_FOUND"
  | "STUDY_NOT_AVAILABLE"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export type FieldServiceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: FieldServiceErrorCode;
      message: string;
      ok: false;
    };

export type FieldAttemptStartResult = {
  attemptId: string;
  participantProfileId: string;
  reusedParticipantProfile: boolean;
  studyParticipantId: string;
};

export type FieldAttemptScreen = {
  answers: ScreenerAnswers;
  attempt: FieldScreeningAttemptRecord;
  currentQuestion: ScreenerQuestion | null;
  definition: ScreenerDefinition;
  progress: {
    answeredVisibleQuestions: number;
    currentIndex: number;
    totalVisibleQuestions: number;
  };
  result: ScreenerEvaluationResult;
  visibleQuestions: ScreenerQuestion[];
};

export type FieldAnswerSaveResult = {
  attemptId: string;
  closed: boolean;
  nextQuestionId: string | null;
  status: FieldScreeningStatus;
};

function isFieldActor(actor: FieldActor | null): actor is FieldActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "screening:apply"));
}

function canReadAttempt(actor: FieldActor, attempt: FieldScreeningAttemptRecord): boolean {
  if (actor.role === "ADMIN" || actor.role === "SUPERVISOR") {
    return true;
  }

  return attempt.fieldUserId === actor.id;
}

function unauthorizedResult<T>(): FieldServiceResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "No tienes permiso para aplicar filtros de campo.",
    ok: false
  };
}

export async function listFieldStudies({
  actor,
  repository
}: {
  actor: FieldActor | null;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldStudySummary[]>> {
  if (!isFieldActor(actor)) {
    return unauthorizedResult();
  }

  return {
    data: await repository.listAvailableStudies(),
    ok: true
  };
}

export async function getFieldStudy({
  actor,
  repository,
  studyId
}: {
  actor: FieldActor | null;
  repository: FieldRepository;
  studyId: string;
}): Promise<FieldServiceResult<FieldStudySummary>> {
  if (!isFieldActor(actor)) {
    return unauthorizedResult();
  }

  const study = await repository.getStudyWithActiveScreener(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El estudio no está activo o no tiene screener publicado activo.",
      ok: false
    };
  }

  parseScreenerDefinition(study.activeScreenerVersion.definitionJson);

  return {
    data: study,
    ok: true
  };
}

export async function startFieldScreeningAttempt({
  actor,
  formInput,
  repository,
  studyId
}: {
  actor: FieldActor | null;
  formInput: unknown;
  repository: FieldRepository;
  studyId: string;
}): Promise<FieldServiceResult<FieldAttemptStartResult>> {
  if (!isFieldActor(actor)) {
    return unauthorizedResult();
  }

  const parsed = fieldParticipantInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del participante.",
      ok: false
    };
  }

  const study = await repository.getStudyWithActiveScreener(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El estudio no está activo o no tiene screener publicado activo.",
      ok: false
    };
  }

  parseScreenerDefinition(study.activeScreenerVersion.definitionJson);

  const participantProfile = await findOrCreateParticipantProfile({
    actorId: actor.id,
    input: parsed.data,
    repository
  });
  const studyParticipant =
    (await repository.findStudyParticipant({
      participantProfileId: participantProfile.profile.id,
      studyId
    })) ??
    (await repository.createStudyParticipant({
      createdByUserId: actor.id,
      participantProfileId: participantProfile.profile.id,
      screeningStatus: "STARTED",
      studyId
    }));

  await repository.updateStudyParticipantScreening({
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "STARTED",
    studyParticipantId: studyParticipant.id
  });

  const attempt = await repository.createScreeningAttempt({
    fieldUserId: actor.id,
    questionnaireVersionId: study.activeScreenerVersion.id,
    studyParticipantId: studyParticipant.id
  });

  return {
    data: {
      attemptId: attempt.id,
      participantProfileId: participantProfile.profile.id,
      reusedParticipantProfile: participantProfile.reused,
      studyParticipantId: studyParticipant.id
    },
    ok: true
  };
}

export async function getFieldScreeningAttemptScreen({
  actor,
  attemptId,
  questionId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  questionId?: string;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldAttemptScreen>> {
  const loaded = await loadAttemptContext({ actor, attemptId, repository });

  if (!loaded.ok) {
    return loaded;
  }

  return {
    data: buildAttemptScreen(loaded.data.attempt, loaded.data.definition, loaded.data.answers, questionId),
    ok: true
  };
}

export async function saveFieldScreeningAnswer({
  actor,
  attemptId,
  formInput,
  questionId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  formInput: unknown;
  questionId: string;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldAnswerSaveResult>> {
  const loaded = await loadAttemptContext({ actor, attemptId, repository });

  if (!loaded.ok) {
    return loaded;
  }

  if (isClosedStatus(loaded.data.attempt.status)) {
    return {
      code: "ATTEMPT_CLOSED",
      message: "Este intento ya está cerrado y no puede modificarse.",
      ok: false
    };
  }

  const parsed = fieldAnswerInputSchema.safeParse(formInput);

  if (!parsed.success) {
    return {
      code: "VALIDATION_ERROR",
      message: "Revisa la respuesta capturada.",
      ok: false
    };
  }

  const visibleQuestions = getVisibleQuestions(loaded.data.definition, loaded.data.answers);
  const question = visibleQuestions.find((candidate) => candidate.id === questionId);

  if (!question) {
    const exists = loaded.data.definition.questions.some((candidate) => candidate.id === questionId);

    return {
      code: exists ? "QUESTION_HIDDEN" : "QUESTION_NOT_FOUND",
      message: exists
        ? "La pregunta no está visible con las respuestas actuales."
        : "La pregunta no existe en el screener publicado.",
      ok: false
    };
  }

  let answer: ScreenerAnswer;

  try {
    answer = normalizeAnswerForQuestion(question, parsed.data);
  } catch (error) {
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Revisa la respuesta capturada.",
      ok: false
    };
  }

  await repository.upsertAnswer({
    answerJson: answer,
    questionId,
    screeningAttemptId: attemptId
  });

  const answers = {
    ...loaded.data.answers,
    [questionId]: answer
  };
  const immediateTermination = findImmediateTermination(loaded.data.definition, answers);

  if (immediateTermination) {
    await closeAttempt({
      attempt: loaded.data.attempt,
      evaluation: buildImmediateTerminationEvaluation(loaded.data.definition, answers, immediateTermination),
      repository
    });

    return {
      data: {
        attemptId,
        closed: true,
        nextQuestionId: null,
        status: "TERMINATED"
      },
      ok: true
    };
  }

  const evaluation = evaluateScreener(loaded.data.definition, answers);

  if (evaluation.status === "PASSED" || evaluation.status === "PENDING_REVIEW" || evaluation.status === "TERMINATED") {
    await closeAttempt({
      attempt: loaded.data.attempt,
      evaluation,
      repository
    });

    return {
      data: {
        attemptId,
        closed: true,
        nextQuestionId: null,
        status: evaluation.status
      },
      ok: true
    };
  }

  await repository.updateAttemptEvaluation({
    attemptId,
    completedAt: null,
    evaluationJson: evaluation.evaluationJson,
    nseClass: evaluation.nse?.classCode ?? null,
    nseScore: evaluation.nse?.score ?? null,
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "INCOMPLETE",
    status: "INCOMPLETE",
    studyParticipantId: loaded.data.attempt.studyParticipantId,
    terminationCode: null,
    terminationReason: null
  });

  return {
    data: {
      attemptId,
      closed: false,
      nextQuestionId: getNextPendingQuestionId(loaded.data.definition, answers, questionId),
      status: "INCOMPLETE"
    },
    ok: true
  };
}

async function findOrCreateParticipantProfile({
  actorId,
  input,
  repository
}: {
  actorId: string;
  input: FieldParticipantInput;
  repository: FieldRepository;
}) {
  const reusableProfile = await repository.findReusableParticipantProfile({
    email: input.email,
    externalReference: input.externalReference,
    phone: input.phone
  });

  if (reusableProfile) {
    return {
      profile: reusableProfile,
      reused: true
    };
  }

  return {
    profile: await repository.createParticipantProfile({
      createdByUserId: actorId,
      email: input.email,
      externalReference: input.externalReference,
      name: input.name,
      phone: input.phone
    }),
    reused: false
  };
}

async function loadAttemptContext({
  actor,
  attemptId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  repository: FieldRepository;
}): Promise<
  FieldServiceResult<{
    answers: ScreenerAnswers;
    attempt: FieldScreeningAttemptRecord;
    definition: ScreenerDefinition;
  }>
> {
  if (!isFieldActor(actor)) {
    return unauthorizedResult();
  }

  const attempt = await repository.getAttempt(attemptId);

  if (!attempt || !canReadAttempt(actor, attempt)) {
    return {
      code: "ATTEMPT_NOT_FOUND",
      message: "El intento de filtro no existe o no está disponible.",
      ok: false
    };
  }

  if (
    attempt.questionnaireVersion.status !== "ACTIVE" ||
    attempt.questionnaireVersion.study.status !== "ACTIVE"
  ) {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El estudio o screener publicado ya no está disponible para campo.",
      ok: false
    };
  }

  const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  const answerRecords = await repository.listAnswers(attemptId);

  return {
    data: {
      answers: recordsToAnswers(answerRecords),
      attempt,
      definition
    },
    ok: true
  };
}

function buildAttemptScreen(
  attempt: FieldScreeningAttemptRecord,
  definition: ScreenerDefinition,
  answers: ScreenerAnswers,
  requestedQuestionId?: string
): FieldAttemptScreen {
  const visibleQuestions = getVisibleQuestions(definition, answers);
  const result = evaluateScreener(definition, answers);
  const currentQuestion =
    visibleQuestions.find((question) => question.id === requestedQuestionId) ??
    visibleQuestions.find((question) => !hasAnswer(answers[question.id])) ??
    visibleQuestions[0] ??
    null;
  const currentIndex = currentQuestion
    ? visibleQuestions.findIndex((question) => question.id === currentQuestion.id) + 1
    : 0;

  return {
    answers,
    attempt,
    currentQuestion: isClosedStatus(attempt.status) ? null : currentQuestion,
    definition,
    progress: {
      answeredVisibleQuestions: visibleQuestions.filter((question) => hasAnswer(answers[question.id])).length,
      currentIndex,
      totalVisibleQuestions: visibleQuestions.length
    },
    result,
    visibleQuestions
  };
}

function recordsToAnswers(answerRecords: FieldScreeningAnswerRecord[]): ScreenerAnswers {
  return Object.fromEntries(answerRecords.map((answer) => [answer.questionId, answer.answerJson as ScreenerAnswer]));
}

function normalizeAnswerForQuestion(question: ScreenerQuestion, input: FieldAnswerInput): ScreenerAnswer {
  if (question.type === "INTEGER") {
    const rawValue = Array.isArray(input.value) ? input.value[0] : input.value;
    const value = Number(rawValue);

    if (!Number.isInteger(value)) {
      throw new Error("Ingresa un número entero válido.");
    }

    if (question.validation.min !== undefined && value < question.validation.min) {
      throw new Error(`El valor mínimo permitido es ${question.validation.min}.`);
    }

    if (question.validation.max !== undefined && value > question.validation.max) {
      throw new Error(`El valor máximo permitido es ${question.validation.max}.`);
    }

    return value;
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    const rawValue = Array.isArray(input.value) ? input.value[0] : input.value;
    const value = String(rawValue ?? "").trim();

    if (question.required && value.length === 0) {
      throw new Error("Esta respuesta es obligatoria.");
    }

    if (question.validation.minLength !== undefined && value.length < question.validation.minLength) {
      throw new Error(`Ingresa al menos ${question.validation.minLength} caracteres.`);
    }

    if (question.validation.maxLength !== undefined && value.length > question.validation.maxLength) {
      throw new Error(`Ingresa máximo ${question.validation.maxLength} caracteres.`);
    }

    return value;
  }

  if (!("options" in question)) {
    throw new Error("La pregunta no admite este tipo de respuesta.");
  }

  const selectedValues = Array.isArray(input.value) ? input.value : input.value ? [input.value] : [];
  const optionValues = new Set(question.options.map((option) => option.value));

  if (question.required && selectedValues.length === 0) {
    throw new Error("Selecciona una respuesta.");
  }

  for (const value of selectedValues) {
    if (!optionValues.has(value)) {
      throw new Error("La opción seleccionada no pertenece al screener publicado.");
    }
  }

  if ((question.type === "SINGLE_CHOICE" || question.type === "CONSENT_YES_NO") && selectedValues.length > 1) {
    throw new Error("Selecciona solo una opción.");
  }

  const selectedOther = question.options.find(
    (option) => selectedValues.includes(option.value) && option.isOther
  );
  const otherText = input.otherText?.trim() ?? "";

  if (selectedOther?.otherTextRequired && otherText.length === 0) {
    throw new Error("Especifica la respuesta en Otro.");
  }

  if (selectedOther && otherText.length > 0) {
    return question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST"
      ? { otherText, values: selectedValues }
      : { otherText, value: selectedValues[0] };
  }

  return question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST"
    ? selectedValues
    : selectedValues[0] ?? "";
}

function findImmediateTermination(
  definition: ScreenerDefinition,
  answers: ScreenerAnswers
): ScreenerEvaluationReason | null {
  const visibleQuestionIds = new Set(getVisibleQuestions(definition, answers).map((question) => question.id));

  for (const question of definition.questions) {
    if (!visibleQuestionIds.has(question.id) || !("options" in question) || !hasAnswer(answers[question.id])) {
      continue;
    }

    const selectedValues = selectedAnswerValues(answers[question.id]);

    for (const option of question.options) {
      if (!selectedValues.includes(option.value)) {
        continue;
      }

      const termination = option.actions.find((action) => action.type === "TERMINATE");

      if (termination?.type === "TERMINATE") {
        return {
          code: termination.code,
          questionId: question.id,
          reason: termination.reason
        };
      }
    }
  }

  for (const rule of definition.rules) {
    if (!conditionMatches(rule.condition, answers) || rule.outcome.type !== "TERMINATE") {
      continue;
    }

    return {
      code: rule.outcome.code,
      reason: rule.outcome.reason
    };
  }

  return null;
}

function buildImmediateTerminationEvaluation(
  definition: ScreenerDefinition,
  answers: ScreenerAnswers,
  termination: ScreenerEvaluationReason
): ScreenerEvaluationResult {
  const base = evaluateScreener(definition, answers);

  return {
    evaluationJson: {
      flags: base.flags,
      missingQuestionIds: [],
      nse: base.nse,
      reasons: [termination],
      result: "NOT_ELIGIBLE",
      safeExplanation: termination.reason,
      schemaVersion: "screening-evaluation.v1",
      status: "TERMINATED"
    },
    flags: base.flags,
    missingQuestionIds: [],
    nse: base.nse,
    result: "NOT_ELIGIBLE",
    status: "TERMINATED",
    termination
  };
}

async function closeAttempt({
  attempt,
  evaluation,
  repository
}: {
  attempt: FieldScreeningAttemptRecord;
  evaluation: ScreenerEvaluationResult;
  repository: FieldRepository;
}) {
  await repository.updateAttemptEvaluation({
    attemptId: attempt.id,
    completedAt: new Date(),
    evaluationJson: evaluation.evaluationJson,
    nseClass: evaluation.nse?.classCode ?? null,
    nseScore: evaluation.nse?.score ?? null,
    operationalStatus: operationalStatusFromScreeningStatus(evaluation.status),
    screeningStatus: evaluation.status,
    status: evaluation.status,
    studyParticipantId: attempt.studyParticipantId,
    terminationCode: evaluation.termination?.code ?? null,
    terminationReason: evaluation.termination?.reason ?? null
  });
}

function getNextPendingQuestionId(
  definition: ScreenerDefinition,
  answers: ScreenerAnswers,
  currentQuestionId: string
): string | null {
  const visibleQuestions = getVisibleQuestions(definition, answers);
  const currentIndex = visibleQuestions.findIndex((question) => question.id === currentQuestionId);
  const nextAfterCurrent = visibleQuestions
    .slice(currentIndex + 1)
    .find((question) => !hasAnswer(answers[question.id]));

  return nextAfterCurrent?.id ?? visibleQuestions.find((question) => !hasAnswer(answers[question.id]))?.id ?? null;
}

function operationalStatusFromScreeningStatus(status: FieldScreeningStatus): FieldOperationalStatus {
  if (status === "PASSED") {
    return "SCREENING_PASSED";
  }

  if (status === "TERMINATED") {
    return "SCREENING_TERMINATED";
  }

  return "SCREENING_STARTED";
}

function selectedAnswerValues(answer: ScreenerAnswer | undefined): string[] {
  if (answer === undefined) {
    return [];
  }

  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  if (typeof answer === "object") {
    if (answer.values) {
      return answer.values.map(String);
    }

    if (answer.value !== undefined) {
      return [String(answer.value)];
    }

    return [];
  }

  return [String(answer)];
}

function hasAnswer(answer: ScreenerAnswer | undefined): boolean {
  if (answer === undefined || answer === null) {
    return false;
  }

  if (typeof answer === "string") {
    return answer.trim().length > 0;
  }

  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  if (typeof answer === "object") {
    return selectedAnswerValues(answer).length > 0;
  }

  return true;
}

function isClosedStatus(status: FieldScreeningStatus): boolean {
  return status === "PASSED" || status === "TERMINATED" || status === "PENDING_REVIEW";
}
