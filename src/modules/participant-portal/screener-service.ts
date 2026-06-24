import { PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE } from "./access";
import { PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE } from "./registration-service";
import type {
  ParticipantPortalScreenerRepository,
  PortalOperationalStatus,
  PortalParticipantConsentRecord,
  PortalParticipantProfileRecord,
  PortalScreeningAnswerRecord,
  PortalScreeningAttemptRecord,
  PortalScreeningStatus,
  PortalScreenerStudyRecord,
  PortalStudyParticipantRecord
} from "./screener-repository";
import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
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

export const PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE =
  "Completa tu registro y consentimiento para continuar.";
export const PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE =
  "Gracias por participar. En este momento no es posible continuar con el estudio. Por favor, comunícate con tu reclutador.";
export const PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE =
  "Gracias. Tus respuestas están registradas. En el siguiente paso se revisará tu evidencia para confirmar tu participación.";
export const PARTICIPANT_PORTAL_PUBLIC_APPROVED_PLACEHOLDER_MESSAGE =
  "Tu participación fue aprobada. En una etapa posterior se mostrarán tus folios y códigos.";
export const PARTICIPANT_PORTAL_PUBLIC_REJECTED_MESSAGE =
  "Por favor, comunícate con tu reclutador para revisar el estado de tu participación.";
export const PARTICIPANT_PORTAL_F6_PHOTOS_NOTE =
  "Más adelante se te solicitarán fotografías de los perfumes que utilizas para validar tu participación.";

export type ParticipantPortalAnswerInput = {
  otherText?: string;
  value?: string | string[];
};

export type ParticipantPortalScreenProgress = {
  answeredVisibleQuestions: number;
  currentIndex: number;
  totalVisibleQuestions: number;
};

export type ParticipantPortalAttemptScreen = {
  answers: ScreenerAnswers;
  attempt: PortalScreeningAttemptRecord;
  currentQuestion: ScreenerQuestion | null;
  definition: ScreenerDefinition;
  evidence: {
    maxPerfumePhotos: number;
    minPerfumePhotos: number;
    perfumePhotos: number;
    selfieComplete: boolean;
  };
  photoNotice: string | null;
  progress: ParticipantPortalScreenProgress;
  result: ScreenerEvaluationResult;
  study: {
    code: string;
    id: string;
    name: string;
  };
  visibleQuestions: ScreenerQuestion[];
};

export type ParticipantPortalAnswerSaveResult = {
  attemptId: string;
  closed: boolean;
  nextQuestionId: string | null;
  status: PortalScreeningStatus;
};

export type ParticipantPortalPublicResultKind =
  | "APPROVED_PLACEHOLDER"
  | "BLOCKED_CLOSED_ATTEMPT"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "TERMINATED";

export type ParticipantPortalPublicResult = {
  attemptId?: string;
  kind: ParticipantPortalPublicResultKind;
  message: string;
  showEvidencePlaceholder: boolean;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type ParticipantPortalScreenerErrorCode =
  | "ATTEMPT_CLOSED"
  | "ATTEMPT_NOT_FOUND"
  | "CLOSED_ATTEMPT_EXISTS"
  | "CONSENT_REQUIRED"
  | "PORTAL_UNAVAILABLE"
  | "QUESTION_HIDDEN"
  | "QUESTION_NOT_FOUND"
  | "REGISTRATION_REQUIRED"
  | "SELFIE_REQUIRED"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export type ParticipantPortalScreenerResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: ParticipantPortalScreenerErrorCode;
      message: string;
      ok: false;
    };

type PortalContext = {
  consent: PortalParticipantConsentRecord;
  participantProfile: PortalParticipantProfileRecord;
  study: PortalScreenerStudyRecord & {
    activeScreenerVersion: NonNullable<PortalScreenerStudyRecord["activeScreenerVersion"]>;
    portalConfig: NonNullable<PortalScreenerStudyRecord["portalConfig"]>;
  };
  studyParticipant: PortalStudyParticipantRecord;
};

const closedStatuses = new Set<PortalScreeningStatus>(["PASSED", "PENDING_REVIEW", "TERMINATED"]);
const editableStatuses = new Set<PortalScreeningStatus>(["INCOMPLETE", "STARTED"]);

export async function getParticipantPortalScreenerScreen({
  identity,
  questionId,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  questionId?: string;
  repository: ParticipantPortalScreenerRepository;
  studyCode: string;
}): Promise<ParticipantPortalScreenerResult<ParticipantPortalAttemptScreen>> {
  const context = await loadPortalContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attemptResult = await getOrCreateOpenPortalAttempt({
    context: context.data,
    repository
  });

  if (!attemptResult.ok) {
    return attemptResult;
  }

  if (!hasExactlyOneSelfie(attemptResult.data)) {
    return {
      code: "SELFIE_REQUIRED",
      message: "Debes capturar una selfie antes de continuar con el filtro.",
      ok: false
    };
  }

  const answers = recordsToAnswers(await repository.listAnswers(attemptResult.data.id));

  return {
    data: buildAttemptScreen({
      answers,
      attempt: attemptResult.data,
      questionId,
      study: context.data.study
    }),
    ok: true
  };
}

export async function saveParticipantPortalScreenerAnswer({
  attemptId,
  formInput,
  identity,
  questionId,
  repository,
  studyCode
}: {
  attemptId: string;
  formInput: unknown;
  identity: ParticipantPortalIdentity;
  questionId: string;
  repository: ParticipantPortalScreenerRepository;
  studyCode: string;
}): Promise<ParticipantPortalScreenerResult<ParticipantPortalAnswerSaveResult>> {
  const context = await loadPortalContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attempt = await repository.getAttempt(attemptId);

  if (!attempt) {
    return {
      code: "ATTEMPT_NOT_FOUND",
      message: "No se encontró el intento de filtro.",
      ok: false
    };
  }

  if (
    attempt.source !== "PARTICIPANT_PORTAL" ||
    attempt.studyParticipantId !== context.data.studyParticipant.id ||
    attempt.questionnaireVersion.study.code !== context.data.study.code
  ) {
    return {
      code: "UNAUTHORIZED",
      message: "No fue posible validar este acceso al filtro.",
      ok: false
    };
  }

  if (closedStatuses.has(attempt.status)) {
    return {
      code: "ATTEMPT_CLOSED",
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      ok: false
    };
  }

  const answerInput = parseAnswerInput(formInput);
  const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  const currentAnswers = recordsToAnswers(await repository.listAnswers(attempt.id));
  const visibleQuestions = getVisibleQuestions(definition, currentAnswers);
  const question = visibleQuestions.find((candidate) => candidate.id === questionId);

  if (!question) {
    const exists = definition.questions.some((candidate) => candidate.id === questionId);

    return {
      code: exists ? "QUESTION_HIDDEN" : "QUESTION_NOT_FOUND",
      message: exists
        ? "Esta pregunta no está visible con tus respuestas actuales."
        : "La pregunta no existe en el filtro publicado.",
      ok: false
    };
  }

  let answer: ScreenerAnswer;

  try {
    answer = normalizeAnswerForQuestion(question, answerInput);
  } catch (error) {
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Revisa tu respuesta.",
      ok: false
    };
  }

  await repository.upsertAnswer({
    answerJson: answer,
    questionId,
    screeningAttemptId: attempt.id
  });

  const answers = {
    ...currentAnswers,
    [questionId]: answer
  };
  const immediateTermination = findImmediateTermination(definition, answers);

  if (immediateTermination) {
    await closePortalAttempt({
      attempt,
      evaluation: buildImmediateTerminationEvaluation(definition, answers, immediateTermination),
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

  const evaluation = evaluateScreener(definition, answers);

  if (questionId === "F6_MARCAS_UTILIZA") {
    const perfumePhotoCount = countPerfumePhotos(attempt.participantEvidence);

    if (perfumePhotoCount < context.data.study.portalConfig.minPerfumePhotos) {
      return {
        code: "VALIDATION_ERROR",
        message: `Debes registrar al menos ${context.data.study.portalConfig.minPerfumePhotos} foto de perfume antes de continuar.`,
        ok: false
      };
    }
  }

  if (evaluation.status === "TERMINATED") {
    await closePortalAttempt({ attempt, evaluation, repository });

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

  if (evaluation.status === "PASSED" || evaluation.status === "PENDING_REVIEW") {
    await closePortalAttempt({
      attempt,
      evaluation: evaluation.status === "PASSED" ? toPendingReviewEvaluation(evaluation) : evaluation,
      repository
    });
    await repository.upsertPendingScreeningReview({
      screeningAttemptId: attempt.id,
      studyParticipantId: attempt.studyParticipantId
    });

    return {
      data: {
        attemptId,
        closed: true,
        nextQuestionId: null,
        status: "PENDING_REVIEW"
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
    studyParticipantId: attempt.studyParticipantId,
    terminationCode: null,
    terminationReason: null
  });

  return {
    data: {
      attemptId,
      closed: false,
      nextQuestionId: getNextPendingQuestionId(definition, answers, questionId),
      status: "INCOMPLETE"
    },
    ok: true
  };
}

export async function getParticipantPortalPublicResult({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalScreenerRepository;
  studyCode: string;
}): Promise<ParticipantPortalScreenerResult<ParticipantPortalPublicResult>> {
  const context = await loadPortalContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attempts = await repository.listPortalAttemptsForStudyParticipant(context.data.studyParticipant.id);
  const latest = attempts[0] ?? null;

  if (!latest || editableStatuses.has(latest.status)) {
    return {
      data: {
        attemptId: latest?.id,
        kind: "IN_PROGRESS",
        message: "Continúa el filtro para completar tus respuestas.",
        showEvidencePlaceholder: false,
        study: publicStudy(context.data.study)
      },
      ok: true
    };
  }

  if (latest.participantConfirmation || latest.participantScreeningReview?.status === "APPROVED") {
    return {
      data: {
        attemptId: latest.id,
        kind: "APPROVED_PLACEHOLDER",
        message: PARTICIPANT_PORTAL_PUBLIC_APPROVED_PLACEHOLDER_MESSAGE,
        showEvidencePlaceholder: false,
        study: publicStudy(context.data.study)
      },
      ok: true
    };
  }

  if (latest.participantScreeningReview?.status === "REJECTED") {
    return {
      data: {
        attemptId: latest.id,
        kind: "REJECTED",
        message: PARTICIPANT_PORTAL_PUBLIC_REJECTED_MESSAGE,
        showEvidencePlaceholder: false,
        study: publicStudy(context.data.study)
      },
      ok: true
    };
  }

  if (latest.status === "PENDING_REVIEW" || latest.status === "PASSED") {
    return {
      data: {
        attemptId: latest.id,
        kind: "PENDING_REVIEW",
        message: PARTICIPANT_PORTAL_PUBLIC_PENDING_REVIEW_MESSAGE,
        showEvidencePlaceholder: true,
        study: publicStudy(context.data.study)
      },
      ok: true
    };
  }

  return {
    data: {
      attemptId: latest.id,
      kind: "TERMINATED",
      message: PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE,
      showEvidencePlaceholder: false,
      study: publicStudy(context.data.study)
    },
    ok: true
  };
}

async function loadPortalContext({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalScreenerRepository;
  studyCode: string;
}): Promise<ParticipantPortalScreenerResult<PortalContext>> {
  const study = await repository.getStudyByCode(studyCode);

  if (!study || study.status !== "ACTIVE" || !study.portalConfig?.enabled || !study.activeScreenerVersion) {
    return {
      code: "PORTAL_UNAVAILABLE",
      message: PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE,
      ok: false
    };
  }

  const participantProfile = await repository.findParticipantProfileByAuthUserId(identity.id);

  if (!participantProfile) {
    return {
      code: "REGISTRATION_REQUIRED",
      message: PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE,
      ok: false
    };
  }

  const studyParticipant = await repository.findStudyParticipant({
    participantProfileId: participantProfile.id,
    studyId: study.id
  });

  if (!studyParticipant) {
    return {
      code: "REGISTRATION_REQUIRED",
      message: PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE,
      ok: false
    };
  }

  const consent = await repository.findCurrentParticipantConsent({
    noticeVersion: study.portalConfig.privacyNoticeVersion,
    participantAuthUserId: identity.id,
    studyParticipantId: studyParticipant.id
  });

  if (!consent) {
    return {
      code: "CONSENT_REQUIRED",
      message: PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE,
      ok: false
    };
  }

  return {
    data: {
      consent,
      participantProfile,
      study: {
        ...study,
        activeScreenerVersion: study.activeScreenerVersion,
        portalConfig: study.portalConfig
      },
      studyParticipant
    },
    ok: true
  };
}

async function getOrCreateOpenPortalAttempt({
  context,
  repository
}: {
  context: PortalContext;
  repository: ParticipantPortalScreenerRepository;
}): Promise<ParticipantPortalScreenerResult<PortalScreeningAttemptRecord>> {
  const attempts = await repository.listPortalAttemptsForStudyParticipant(context.studyParticipant.id);
  const openAttempt = attempts.find((attempt) => editableStatuses.has(attempt.status));

  if (openAttempt) {
    return {
      data: openAttempt,
      ok: true
    };
  }

  const closedAttempt = attempts.find((attempt) => closedStatuses.has(attempt.status));

  if (closedAttempt) {
    return {
      code: "CLOSED_ATTEMPT_EXISTS",
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      ok: false
    };
  }

  await repository.updateStudyParticipantScreening({
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "STARTED",
    studyParticipantId: context.studyParticipant.id
  });

  const attempt = await repository.createPortalScreeningAttempt({
    questionnaireVersionId: context.study.activeScreenerVersion.id,
    studyParticipantId: context.studyParticipant.id
  });

  return {
    data: attempt,
    ok: true
  };
}

function buildAttemptScreen({
  answers,
  attempt,
  questionId,
  study
}: {
  answers: ScreenerAnswers;
  attempt: PortalScreeningAttemptRecord;
  questionId?: string;
  study: PortalContext["study"];
}): ParticipantPortalAttemptScreen {
  const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  const visibleQuestions = getVisibleQuestions(definition, answers);
  const currentQuestion =
    visibleQuestions.find((question) => question.id === questionId) ??
    visibleQuestions.find((question) => !hasAnswer(answers[question.id])) ??
    visibleQuestions[0] ??
    null;
  const currentIndex = currentQuestion
    ? visibleQuestions.findIndex((question) => question.id === currentQuestion.id) + 1
    : 0;

  return {
    answers,
    attempt,
    currentQuestion: closedStatuses.has(attempt.status) ? null : currentQuestion,
    definition,
    evidence: {
      maxPerfumePhotos: study.portalConfig.maxPerfumePhotos,
      minPerfumePhotos: study.portalConfig.minPerfumePhotos,
      perfumePhotos: countPerfumePhotos(attempt.participantEvidence),
      selfieComplete: hasExactlyOneSelfie(attempt)
    },
    photoNotice: currentQuestion?.id === "F6_MARCAS_UTILIZA" ? PARTICIPANT_PORTAL_F6_PHOTOS_NOTE : null,
    progress: {
      answeredVisibleQuestions: visibleQuestions.filter((question) => hasAnswer(answers[question.id])).length,
      currentIndex,
      totalVisibleQuestions: visibleQuestions.length
    },
    result: evaluateScreener(definition, answers),
    study: publicStudy(study),
    visibleQuestions
  };
}

function publicStudy(study: PortalContext["study"]) {
  return {
    code: study.code,
    id: study.id,
    name: study.name
  };
}

function parseAnswerInput(input: unknown): ParticipantPortalAnswerInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  const candidate = input as ParticipantPortalAnswerInput;
  return {
    otherText: typeof candidate.otherText === "string" ? candidate.otherText : undefined,
    value:
      typeof candidate.value === "string" || Array.isArray(candidate.value)
        ? candidate.value
        : undefined
  };
}

function normalizeAnswerForQuestion(question: ScreenerQuestion, input: ParticipantPortalAnswerInput): ScreenerAnswer {
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
      throw new Error("La opción seleccionada no pertenece al filtro publicado.");
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

function recordsToAnswers(answerRecords: PortalScreeningAnswerRecord[]): ScreenerAnswers {
  return Object.fromEntries(answerRecords.map((answer) => [answer.questionId, answer.answerJson as ScreenerAnswer]));
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

function toPendingReviewEvaluation(evaluation: ScreenerEvaluationResult): ScreenerEvaluationResult {
  return {
    ...evaluation,
    evaluationJson: {
      ...evaluation.evaluationJson,
      reasons: [],
      result: "PENDING_REVIEW",
      safeExplanation: "El filtro requiere revisión de evidencia.",
      status: "PENDING_REVIEW"
    },
    result: "PENDING_REVIEW",
    status: "PENDING_REVIEW",
    termination: undefined
  };
}

async function closePortalAttempt({
  attempt,
  evaluation,
  repository
}: {
  attempt: PortalScreeningAttemptRecord;
  evaluation: ScreenerEvaluationResult;
  repository: ParticipantPortalScreenerRepository;
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

function operationalStatusFromScreeningStatus(status: PortalScreeningStatus): PortalOperationalStatus {
  if (status === "TERMINATED") {
    return "SCREENING_TERMINATED";
  }

  if (status === "PASSED") {
    return "SCREENING_PASSED";
  }

  return "SCREENING_STARTED";
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

  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  if (typeof answer === "object") {
    return selectedAnswerValues(answer).length > 0;
  }

  return String(answer).trim().length > 0;
}

function hasExactlyOneSelfie(attempt: PortalScreeningAttemptRecord): boolean {
  return attempt.participantEvidence.filter((item) => item.type === "SELFIE_IDENTIFICATION").length === 1;
}

function countPerfumePhotos(evidence: PortalScreeningAttemptRecord["participantEvidence"]): number {
  return evidence.filter((item) => item.type === "PERFUME_PHOTO").length;
}
