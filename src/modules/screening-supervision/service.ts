import { hasCapability, type InternalUserRole, type InternalUserStatus } from "@/shared/auth/permissions";
import {
  getVisibleQuestions,
  parseScreenerDefinition,
  type ScreenerAnswer,
  type ScreenerAnswers,
  type ScreenerDefinition,
  type ScreenerQuestion
} from "@/modules/screener";
import type {
  ScreeningSupervisionRepository,
  SupervisionAnswerRecord,
  SupervisionAttemptDetailRecord,
  SupervisionAttemptRecord,
  SupervisionFieldUserRecord,
  SupervisionStudyRecord
} from "./repository";
import {
  parseScreeningAttemptFilters,
  type SupervisionAttemptStatus
} from "./validation";

export type ScreeningSupervisionActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

export type ScreeningSupervisionErrorCode =
  | "ATTEMPT_NOT_FOUND"
  | "STUDY_NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export type ScreeningSupervisionResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: ScreeningSupervisionErrorCode;
      message: string;
      ok: false;
    };

export type SupervisionStatusLabel = {
  label: string;
  resultLabel: string;
};

export type ScreeningAttemptListItem = {
  closedAt: Date | null;
  confirmation: {
    folio: string;
    manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
    referenceCodes: Array<{ code: string; slot: number }>;
  } | null;
  evidenceReviewStatus: "APPROVED" | "PENDING" | "REJECTED" | null;
  fieldUser: SupervisionFieldUserRecord | null;
  id: string;
  nseClassCode: string | null;
  nseClassLabel: string | null;
  nseScore: number | null;
  participant: {
    externalReference: string | null;
    id: string;
    name: string;
  };
  resultLabel: string;
  screenerVersionNumber: number;
  startedAt: Date;
  status: SupervisionAttemptStatus;
  statusLabel: string;
  study: SupervisionStudyRecord;
  terminationCode: string | null;
  terminationReason: string | null;
};

export type ScreeningAttemptListData = {
  attempts: ScreeningAttemptListItem[];
  fieldUsers: SupervisionFieldUserRecord[];
  filters: ReturnType<typeof parseScreeningAttemptFilters>;
  study: SupervisionStudyRecord;
};

export type ScreeningAttemptAnswerView = {
  answerText: string;
  currentlyHidden: boolean;
  missing: boolean;
  order: number;
  questionId: string;
  questionText: string;
  questionType: string;
};

export type ScreeningAttemptDetail = {
  answers: ScreeningAttemptAnswerView[];
  closedAt: Date | null;
  confirmation: {
    folio: string;
    manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
    referenceCodes: Array<{ code: string; slot: number }>;
  } | null;
  definitionHash: string;
  evidenceReviewStatus: "APPROVED" | "PENDING" | "REJECTED" | null;
  evaluation: {
    flags: Array<{ code: string; label?: string; requiresReview?: boolean }>;
    missingQuestionIds: string[];
    reasons: Array<{ code: string; questionId?: string; reason: string }>;
  };
  fieldUser: SupervisionFieldUserRecord | null;
  id: string;
  nseClassCode: string | null;
  nseClassLabel: string | null;
  nseScore: number | null;
  participant: {
    email: string | null;
    externalReference: string | null;
    id: string;
    name: string;
    phone: string | null;
  };
  resultLabel: string;
  screenerVersionNumber: number;
  startedAt: Date;
  status: SupervisionAttemptStatus;
  statusLabel: string;
  study: SupervisionStudyRecord;
  studyId: string;
  terminationCode: string | null;
  terminationReason: string | null;
};

export function canReviewScreeningAttempts(actor: ScreeningSupervisionActor | null): actor is ScreeningSupervisionActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "screening:review"));
}

export async function listScreeningAttemptsForStudy({
  actor,
  filters,
  repository,
  studyId
}: {
  actor: ScreeningSupervisionActor | null;
  filters: unknown;
  repository: ScreeningSupervisionRepository;
  studyId: string;
}): Promise<ScreeningSupervisionResult<ScreeningAttemptListData>> {
  if (!canReviewScreeningAttempts(actor)) {
    return unauthorizedResult();
  }

  let parsedFilters: ReturnType<typeof parseScreeningAttemptFilters>;

  try {
    parsedFilters = parseScreeningAttemptFilters(filters);
  } catch {
    return {
      code: "VALIDATION_ERROR",
      message: "Revisa los filtros de búsqueda.",
      ok: false
    };
  }

  const study = await repository.getStudy(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  const [attempts, fieldUsers] = await Promise.all([
    repository.listStudyAttempts({ filters: parsedFilters, studyId }),
    repository.listAttemptFieldUsers(studyId)
  ]);

  return {
    data: {
      attempts: attempts.map(toListItem),
      fieldUsers,
      filters: parsedFilters,
      study
    },
    ok: true
  };
}

export async function getScreeningAttemptSupervisionDetail({
  actor,
  attemptId,
  repository
}: {
  actor: ScreeningSupervisionActor | null;
  attemptId: string;
  repository: ScreeningSupervisionRepository;
}): Promise<ScreeningSupervisionResult<ScreeningAttemptDetail>> {
  if (!canReviewScreeningAttempts(actor)) {
    return unauthorizedResult();
  }

  const attempt = await repository.getAttemptDetail(attemptId);

  if (!attempt) {
    return {
      code: "ATTEMPT_NOT_FOUND",
      message: "El intento de screener no existe.",
      ok: false
    };
  }

  return {
    data: toDetail(attempt),
    ok: true
  };
}

export function screeningAttemptStatusLabel(status: SupervisionAttemptStatus): string {
  return statusLabels(status).label;
}

export function screeningAttemptResultLabel(status: SupervisionAttemptStatus): string {
  return statusLabels(status).resultLabel;
}

function unauthorizedResult<T>(): ScreeningSupervisionResult<T> {
  return {
    code: "UNAUTHORIZED",
    message: "No tienes permiso para revisar intentos de screener.",
    ok: false
  };
}

function toListItem(attempt: SupervisionAttemptRecord): ScreeningAttemptListItem {
  const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  const labels = statusLabelsForAttempt(attempt);
  const nseClassLabel = resolveNseClassLabel(definition, attempt.nseClass);

  return {
    closedAt: attempt.completedAt,
    confirmation: attempt.participantConfirmation,
    evidenceReviewStatus: attempt.participantScreeningReview?.status ?? null,
    fieldUser: attempt.fieldUser,
    id: attempt.id,
    nseClassCode: attempt.nseClass,
    nseClassLabel,
    nseScore: attempt.nseScore,
    participant: {
      externalReference: attempt.studyParticipant.participantProfile.externalReference,
      id: attempt.studyParticipant.participantProfile.id,
      name: attempt.studyParticipant.participantProfile.name
    },
    resultLabel: labels.resultLabel,
    screenerVersionNumber: attempt.questionnaireVersion.versionNumber,
    startedAt: attempt.startedAt,
    status: attempt.status,
    statusLabel: labels.label,
    study: attempt.questionnaireVersion.study,
    terminationCode: attempt.terminationCode,
    terminationReason: attempt.terminationReason
  };
}

function toDetail(attempt: SupervisionAttemptDetailRecord): ScreeningAttemptDetail {
  const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  const labels = statusLabelsForAttempt(attempt);
  const evaluation = parseEvaluation(attempt.evaluationJson);

  return {
    answers: buildAnswerViews(definition, attempt.answers, evaluation.missingQuestionIds),
    closedAt: attempt.completedAt,
    confirmation: attempt.participantConfirmation,
    definitionHash: attempt.questionnaireVersion.definitionHash,
    evidenceReviewStatus: attempt.participantScreeningReview?.status ?? null,
    evaluation,
    fieldUser: attempt.fieldUser,
    id: attempt.id,
    nseClassCode: attempt.nseClass,
    nseClassLabel: resolveNseClassLabel(definition, attempt.nseClass),
    nseScore: attempt.nseScore,
    participant: {
      email: attempt.studyParticipant.participantProfile.email,
      externalReference: attempt.studyParticipant.participantProfile.externalReference,
      id: attempt.studyParticipant.participantProfile.id,
      name: attempt.studyParticipant.participantProfile.name,
      phone: attempt.studyParticipant.participantProfile.phone
    },
    resultLabel: labels.resultLabel,
    screenerVersionNumber: attempt.questionnaireVersion.versionNumber,
    startedAt: attempt.startedAt,
    status: attempt.status,
    statusLabel: labels.label,
    study: attempt.questionnaireVersion.study,
    studyId: attempt.studyParticipant.studyId,
    terminationCode: attempt.terminationCode,
    terminationReason: attempt.terminationReason
  };
}

function statusLabels(status: SupervisionAttemptStatus): SupervisionStatusLabel {
  switch (status) {
    case "STARTED":
      return { label: "Iniciado", resultLabel: "Iniciado" };
    case "INCOMPLETE":
      return { label: "Incompleto", resultLabel: "Incompleto" };
    case "PASSED":
      return { label: "Elegible", resultLabel: "Elegible" };
    case "TERMINATED":
      return { label: "No elegible", resultLabel: "No elegible" };
    case "PENDING_REVIEW":
      return { label: "Pendiente de revisión", resultLabel: "Pendiente de revisión" };
  }
}

function statusLabelsForAttempt(
  attempt: Pick<SupervisionAttemptRecord, "participantConfirmation" | "participantScreeningReview" | "status">
): SupervisionStatusLabel {
  if (attempt.participantConfirmation || attempt.participantScreeningReview?.status === "APPROVED") {
    return { label: "Elegible confirmado", resultLabel: "Elegible confirmado" };
  }

  if (attempt.participantScreeningReview?.status === "REJECTED") {
    return { label: "Evidencia rechazada", resultLabel: "Evidencia rechazada" };
  }

  return statusLabels(attempt.status);
}

function resolveNseClassLabel(definition: ScreenerDefinition, classCode: string | null): string | null {
  if (!classCode) {
    return null;
  }

  return definition.nse?.ranges.find((range) => range.code === classCode)?.label ?? classCode;
}

function buildAnswerViews(
  definition: ScreenerDefinition,
  answerRecords: SupervisionAnswerRecord[],
  missingQuestionIds: string[]
): ScreeningAttemptAnswerView[] {
  const answers = recordsToAnswers(answerRecords);
  const visibleQuestionIds = new Set(getVisibleQuestions(definition, answers).map((question) => question.id));
  const answeredQuestionIds = new Set(Object.keys(answers));
  const missingIds = new Set(missingQuestionIds);

  return [...definition.questions]
    .sort((left, right) => left.order - right.order)
    .filter((question) => visibleQuestionIds.has(question.id) || answeredQuestionIds.has(question.id) || missingIds.has(question.id))
    .map((question) => {
      const answer = answers[question.id];
      const currentlyHidden = answeredQuestionIds.has(question.id) && !visibleQuestionIds.has(question.id);
      const missing = missingIds.has(question.id) && answer === undefined;

      return {
        answerText: answer === undefined ? "Sin respuesta" : formatAnswer(question, answer),
        currentlyHidden,
        missing,
        order: question.order,
        questionId: question.id,
        questionText: question.text,
        questionType: question.type
      };
    });
}

function recordsToAnswers(answerRecords: SupervisionAnswerRecord[]): ScreenerAnswers {
  return Object.fromEntries(answerRecords.map((answer) => [answer.questionId, answer.answerJson as ScreenerAnswer]));
}

function formatAnswer(question: ScreenerQuestion, answer: ScreenerAnswer): string {
  if (question.type === "INTEGER") {
    return String(answer);
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    return String(answer);
  }

  if (!("options" in question)) {
    return String(answer);
  }

  const values = selectedValues(answer);
  const labels = values.map((value) => optionLabel(question, value));
  const otherText = otherTextFromAnswer(answer);
  const base = labels.length > 0 ? labels.join(", ") : "Sin respuesta";

  return otherText ? `${base}. Especificación: ${otherText}` : base;
}

function optionLabel(question: Extract<ScreenerQuestion, { options: unknown[] }>, value: string): string {
  return question.options.find((option) => option.value === value)?.label ?? `Valor registrado: ${value}`;
}

function selectedValues(answer: ScreenerAnswer): string[] {
  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  if (typeof answer === "object" && answer !== null) {
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

function otherTextFromAnswer(answer: ScreenerAnswer): string {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer)
    ? answer.otherText?.trim() ?? ""
    : "";
}

function parseEvaluation(input: unknown): ScreeningAttemptDetail["evaluation"] {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};

  return {
    flags: Array.isArray(value.flags) ? value.flags.filter(isFlag) : [],
    missingQuestionIds: Array.isArray(value.missingQuestionIds)
      ? value.missingQuestionIds.filter((item): item is string => typeof item === "string")
      : [],
    reasons: Array.isArray(value.reasons) ? value.reasons.filter(isReason) : []
  };
}

function isFlag(value: unknown): value is { code: string; label?: string; requiresReview?: boolean } {
  return Boolean(value && typeof value === "object" && typeof (value as { code?: unknown }).code === "string");
}

function isReason(value: unknown): value is { code: string; questionId?: string; reason: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { code?: unknown }).code === "string" &&
      typeof (value as { reason?: unknown }).reason === "string"
  );
}
