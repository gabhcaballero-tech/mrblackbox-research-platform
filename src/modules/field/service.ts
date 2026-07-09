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
import { getStudyBehavior } from "@/modules/study-templates/study-behavior";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  createSignedEvidenceUpload,
  validateEvidenceUploadMetadata,
  type EvidenceStorageClient,
  type EvidenceUploadMetadata,
  type ParticipantEvidenceKind,
  type SignedEvidenceUpload
} from "@/modules/participant-portal/evidence-storage";
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

export const PUBLIC_FIELD_ACTOR_ID = "PUBLIC_FIELD";
export const PUBLIC_FIELD_ACTOR: FieldActor = {
  id: PUBLIC_FIELD_ACTOR_ID,
  role: "INTERVIEWER",
  status: "ACTIVE"
};

export type FieldServiceErrorCode =
  | "ATTEMPT_CLOSED"
  | "ATTEMPT_NOT_FOUND"
  | "EVIDENCE_INCOMPLETE"
  | "EVIDENCE_NOT_REQUIRED"
  | "OPEN_ATTEMPT_EXISTS"
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
  kind: "started";
  attemptId: string;
  participantProfileId: string;
  reusedParticipantProfile: boolean;
  studyParticipantId: string;
};

export type FieldDuplicateIdentifier = {
  label: string;
  value: string;
};

export type FieldDuplicateAttemptSummary = {
  canOpenDetail: boolean;
  code: string | null;
  detailHref: string | null;
  id: string;
  nseClass: string | null;
  nseScore: number | null;
  reason: string | null;
  startedAt: Date;
  status: FieldScreeningStatus;
};

export type FieldDuplicateParticipantMatch = {
  canCreateNewAttempt: boolean;
  canForceNewAttempt: boolean;
  canReviewAttempts: boolean;
  continueAttemptHref: string | null;
  hasClosedAttemptInStudy: boolean;
  hasOpenAttemptInStudy: boolean;
  matchedIdentifiers: FieldDuplicateIdentifier[];
  participantProfileId: string;
  profileName: string;
  studyParticipantExists: boolean;
  studyAttempts: FieldDuplicateAttemptSummary[];
};

export type FieldDuplicateDetectionResult = {
  input: FieldParticipantInput;
  kind: "duplicate_found";
  matches: FieldDuplicateParticipantMatch[];
  message: string;
};

export type FieldStartFlowResult = FieldAttemptStartResult | FieldDuplicateDetectionResult;

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

export type FieldEvidenceCounts = {
  perfumePhotos: number;
  selfie: number;
};

export type FieldSelfieScreen = {
  attemptId: string;
  counts: FieldEvidenceCounts;
  selfieComplete: boolean;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type FieldEvidenceUploadConfirmation = {
  counts: FieldEvidenceCounts;
};

type FieldStartConfirmation = {
  allowOpenAttemptOverride?: boolean;
  participantProfileId?: string;
};

function isFieldActor(actor: FieldActor | null): actor is FieldActor {
  return Boolean(actor && actor.status === "ACTIVE" && hasCapability(actor.role, "screening:apply"));
}

function canReadAttempt(actor: FieldActor, attempt: FieldScreeningAttemptRecord): boolean {
  if (isPublicFieldActor(actor)) {
    return attempt.source === "FIELD" && attempt.fieldUserId === null;
  }

  if (actor.role === "ADMIN" || actor.role === "SUPERVISOR") {
    return true;
  }

  return attempt.fieldUserId === actor.id;
}

export function isPublicFieldActor(actor: FieldActor): boolean {
  return actor.id === PUBLIC_FIELD_ACTOR_ID;
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

  try {
    parseScreenerDefinition(study.activeScreenerVersion.definitionJson);
  } catch {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El cuestionario no está disponible.",
      ok: false
    };
  }

  return {
    data: study,
    ok: true
  };
}

export async function startFieldScreeningAttempt({
  actor,
  confirmation,
  formInput,
  repository,
  studyId
}: {
  actor: FieldActor | null;
  confirmation?: FieldStartConfirmation;
  formInput: unknown;
  repository: FieldRepository;
  studyId: string;
}): Promise<FieldServiceResult<FieldStartFlowResult>> {
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

  try {
    parseScreenerDefinition(study.activeScreenerVersion.definitionJson);
  } catch {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El cuestionario no está disponible.",
      ok: false
    };
  }

  if (confirmation?.participantProfileId) {
    const profile = await repository.findParticipantProfileById(confirmation.participantProfileId);

    if (!profile || !profileMatchesParticipantInput(profile, parsed.data)) {
      return {
        code: "VALIDATION_ERROR",
        message: "No se pudo confirmar el panelista registrado con los datos capturados.",
        ok: false
      };
    }

    const attempts = await repository.listScreeningAttemptsForProfileInStudy({
      participantProfileId: profile.id,
      studyId
    });
    const hasOpenAttempt = attempts.some((attempt) => isOpenStatus(attempt.status));

    if (hasOpenAttempt && !confirmation.allowOpenAttemptOverride) {
      return {
        code: "OPEN_ATTEMPT_EXISTS",
        message: "Ya existe un intento abierto para este panelista.",
        ok: false
      };
    }

    if (hasOpenAttempt && confirmation.allowOpenAttemptOverride && !canForceNewAttempt(actor)) {
      return {
        code: "OPEN_ATTEMPT_EXISTS",
        message: "Solo ADMIN o SUPERVISOR pueden crear otro intento cuando ya existe uno abierto.",
        ok: false
      };
    }

    return createAttemptForProfile({
      createdByUserId: isPublicFieldActor(actor) ? study.createdByUserId : actor.id,
      fieldUserId: isPublicFieldActor(actor) ? null : actor.id,
      profile,
      repository,
      reusedParticipantProfile: true,
      screenerVersionId: study.activeScreenerVersion.id,
      studyId
    });
  }

  const matchingProfiles = await repository.findParticipantProfileMatches({
    email: parsed.data.email,
    externalReference: parsed.data.externalReference,
    phone: parsed.data.phone
  });

  if (matchingProfiles.length > 0) {
    return {
      data: {
        input: parsed.data,
        kind: "duplicate_found",
        matches: await buildDuplicateMatches({
          actor,
          input: parsed.data,
          profiles: matchingProfiles,
          repository,
          studyId
        }),
        message: "Este panelista ya estaba registrado."
      },
      ok: true
    };
  }

  const profile = await repository.createParticipantProfile({
    createdByUserId: isPublicFieldActor(actor) ? study.createdByUserId : actor.id,
    email: parsed.data.email,
    externalReference: parsed.data.externalReference,
    name: parsed.data.name,
    phone: parsed.data.phone
  });

  return createAttemptForProfile({
    createdByUserId: isPublicFieldActor(actor) ? study.createdByUserId : actor.id,
    fieldUserId: isPublicFieldActor(actor) ? null : actor.id,
    profile,
    repository,
    reusedParticipantProfile: false,
    screenerVersionId: study.activeScreenerVersion.id,
    studyId
  });
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

export async function getFieldSelfieScreen({
  actor,
  attemptId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldSelfieScreen>> {
  const context = await loadEvidenceAttemptContext({ actor, attemptId, repository });

  if (!context.ok) {
    return context;
  }

  if (!getStudyBehavior(context.data.questionnaireVersion.study.code).requiresFinalSelfie) {
    return {
      code: "EVIDENCE_NOT_REQUIRED",
      message: "Este estudio no requiere selfie.",
      ok: false
    };
  }

  return {
    data: toFieldSelfieScreen(context.data),
    ok: true
  };
}

export async function requestFieldEvidenceUpload({
  actor,
  attemptId,
  metadata,
  repository,
  storage
}: {
  actor: FieldActor | null;
  attemptId: string;
  metadata: EvidenceUploadMetadata;
  repository: FieldRepository;
  storage: EvidenceStorageClient;
}): Promise<FieldServiceResult<SignedEvidenceUpload & { metadata: EvidenceUploadMetadata }>> {
  const context = await loadEvidenceAttemptContext({ actor, attemptId, repository });

  if (!context.ok) {
    return context;
  }

  const validation = validateCanAddFieldSelfie(context.data, metadata.evidenceType);

  if (!validation.ok) {
    return validation;
  }

  try {
    const config = context.data.questionnaireVersion.study.participantPortalConfig!;
    const signed = await createSignedEvidenceUpload({
      attemptId: context.data.id,
      maxImageBytes: config.maxImageBytes,
      metadata,
      participantProfileId: context.data.studyParticipant.participantProfile.id,
      storage,
      studyId: context.data.questionnaireVersion.study.id
    });

    return {
      data: signed,
      ok: true
    };
  } catch (error) {
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "No fue posible preparar la evidencia.",
      ok: false
    };
  }
}

export async function confirmFieldEvidenceUpload({
  actor,
  attemptId,
  input,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  input: EvidenceUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  };
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldEvidenceUploadConfirmation>> {
  const context = await loadEvidenceAttemptContext({ actor, attemptId, repository });

  if (!context.ok) {
    return context;
  }

  const validation = validateCanAddFieldSelfie(context.data, input.evidenceType);

  if (!validation.ok) {
    return validation;
  }

  try {
    const config = context.data.questionnaireVersion.study.participantPortalConfig!;
    const metadata = validateEvidenceUploadMetadata({
      maxImageBytes: config.maxImageBytes,
      metadata: input
    });

    if (input.storageBucket !== PARTICIPANT_EVIDENCE_BUCKET) {
      throw new Error("No fue posible validar la evidencia cargada.");
    }

    assertEvidenceStorageKeyBelongsToAttempt({
      attemptId: context.data.id,
      participantProfileId: context.data.studyParticipant.participantProfile.id,
      privateStorageKey: input.privateStorageKey,
      studyId: context.data.questionnaireVersion.study.id
    });

    const evidence = await repository.createEvidence({
      extension: metadata.extension,
      mimeType: metadata.mimeType,
      originalFilename: metadata.originalFilename,
      privateStorageKey: input.privateStorageKey,
      relatedQuestionId: null,
      screeningAttemptId: context.data.id,
      sizeBytes: metadata.sizeBytes,
      storageBucket: input.storageBucket,
      studyParticipantId: context.data.studyParticipantId,
      type: metadata.evidenceType
    });

    return {
      data: {
        counts: countFieldEvidence(withNewFieldEvidence(context.data.participantEvidence, evidence))
      },
      ok: true
    };
  } catch (error) {
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "No fue posible registrar la evidencia.",
      ok: false
    };
  }
}

export async function completeFieldEvidenceSubmission({
  actor,
  attemptId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldSelfieScreen>> {
  const context = await loadEvidenceAttemptContext({ actor, attemptId, repository });

  if (!context.ok) {
    return context;
  }

  if (!getStudyBehavior(context.data.questionnaireVersion.study.code).requiresFinalSelfie) {
    return {
      code: "EVIDENCE_NOT_REQUIRED",
      message: "Este estudio no requiere selfie.",
      ok: false
    };
  }

  if (countFieldEvidence(context.data.participantEvidence).selfie !== 1) {
    return {
      code: "EVIDENCE_INCOMPLETE",
      message: "Antes de enviar a revisión necesitamos exactamente una selfie.",
      ok: false
    };
  }

  await repository.upsertPendingReview({
    screeningAttemptId: context.data.id,
    studyParticipantId: context.data.studyParticipantId
  });

  return {
    data: toFieldSelfieScreen(context.data),
    ok: true
  };
}

async function createAttemptForProfile({
  createdByUserId,
  fieldUserId,
  profile,
  repository,
  reusedParticipantProfile,
  screenerVersionId,
  studyId
}: {
  createdByUserId: string;
  fieldUserId: string | null;
  profile: { id: string };
  repository: FieldRepository;
  reusedParticipantProfile: boolean;
  screenerVersionId: string;
  studyId: string;
}): Promise<FieldServiceResult<FieldAttemptStartResult>> {
  const studyParticipant =
    (await repository.findStudyParticipant({
      participantProfileId: profile.id,
      studyId
    })) ??
    (await repository.createStudyParticipant({
      createdByUserId,
      participantProfileId: profile.id,
      screeningStatus: "STARTED",
      studyId
    }));

  await repository.updateStudyParticipantScreening({
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "STARTED",
    studyParticipantId: studyParticipant.id
  });

  const attempt = await repository.createScreeningAttempt({
    fieldUserId,
    questionnaireVersionId: screenerVersionId,
    studyParticipantId: studyParticipant.id
  });

  return {
    data: {
      attemptId: attempt.id,
      kind: "started",
      participantProfileId: profile.id,
      reusedParticipantProfile,
      studyParticipantId: studyParticipant.id
    },
    ok: true
  };
}

async function buildDuplicateMatches({
  actor,
  input,
  profiles,
  repository,
  studyId
}: {
  actor: FieldActor;
  input: FieldParticipantInput;
  profiles: Array<{
    email: string | null;
    externalReference: string | null;
    id: string;
    name: string;
    phone: string | null;
  }>;
  repository: FieldRepository;
  studyId: string;
}): Promise<FieldDuplicateParticipantMatch[]> {
  return Promise.all(
    profiles.map(async (profile) => {
      const studyParticipant = await repository.findStudyParticipant({
        participantProfileId: profile.id,
        studyId
      });
      const attempts = await repository.listScreeningAttemptsForProfileInStudy({
        participantProfileId: profile.id,
        studyId
      });
      const openAttempt = attempts.find((attempt) => isOpenStatus(attempt.status));
      const canOpenCurrentAttempt = openAttempt ? canReadAttempt(actor, openAttempt) : false;
      const canReviewAttempts = hasCapability(actor.role, "screening:review");
      const hasOpenAttemptInStudy = Boolean(openAttempt);

      return {
        canCreateNewAttempt: !hasOpenAttemptInStudy,
        canForceNewAttempt: hasOpenAttemptInStudy && canForceNewAttempt(actor),
        canReviewAttempts,
        continueAttemptHref: openAttempt && canOpenCurrentAttempt ? `/field/screening/${openAttempt.id}` : null,
        hasClosedAttemptInStudy: attempts.some((attempt) => isClosedStatus(attempt.status)),
        hasOpenAttemptInStudy,
        matchedIdentifiers: visibleDuplicateIdentifiers(profile, input, actor),
        participantProfileId: profile.id,
        profileName: profile.name,
        studyAttempts: attempts.map((attempt) => ({
          canOpenDetail: canReviewAttempts,
          code: attempt.terminationCode,
          detailHref: canReviewAttempts ? `/admin/screening-attempts/${attempt.id}` : null,
          id: attempt.id,
          nseClass: attempt.nseClass,
          nseScore: attempt.nseScore,
          reason: attempt.terminationReason,
          startedAt: attempt.startedAt,
          status: attempt.status
        })),
        studyParticipantExists: Boolean(studyParticipant)
      };
    })
  );
}

function visibleDuplicateIdentifiers(
  profile: {
    email: string | null;
    externalReference: string | null;
    phone: string | null;
  },
  input: FieldParticipantInput,
  actor: FieldActor
): FieldDuplicateIdentifier[] {
  const canReadPii = hasCapability(actor.role, "participants:pii:read");
  const identifiers: FieldDuplicateIdentifier[] = [];

  if (profile.phone && (canReadPii || input.phone === profile.phone)) {
    identifiers.push({ label: "Teléfono", value: profile.phone });
  }

  if (profile.email && (canReadPii || input.email === profile.email)) {
    identifiers.push({ label: "Correo", value: profile.email });
  }

  if (profile.externalReference && (canReadPii || input.externalReference === profile.externalReference)) {
    identifiers.push({ label: "Referencia externa", value: profile.externalReference });
  }

  return identifiers;
}

function profileMatchesParticipantInput(
  profile: {
    email: string | null;
    externalReference: string | null;
    phone: string | null;
  },
  input: FieldParticipantInput
): boolean {
  return Boolean(
    (input.phone && profile.phone === input.phone) ||
      (input.email && profile.email === input.email) ||
      (input.externalReference && profile.externalReference === input.externalReference)
  );
}

function canForceNewAttempt(actor: FieldActor): boolean {
  return actor.role === "ADMIN" || actor.role === "SUPERVISOR";
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

  let definition: ScreenerDefinition;

  try {
    definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
  } catch {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "El cuestionario no está disponible.",
      ok: false
    };
  }
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

async function loadEvidenceAttemptContext({
  actor,
  attemptId,
  repository
}: {
  actor: FieldActor | null;
  attemptId: string;
  repository: FieldRepository;
}): Promise<FieldServiceResult<FieldScreeningAttemptRecord>> {
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

  if (attempt.status !== "PASSED" && attempt.status !== "PENDING_REVIEW") {
    return {
      code: "ATTEMPT_CLOSED",
      message: "Completa el filtro antes de capturar evidencia.",
      ok: false
    };
  }

  if (!attempt.questionnaireVersion.study.participantPortalConfig) {
    return {
      code: "STUDY_NOT_AVAILABLE",
      message: "La captura de evidencias no está configurada para este estudio.",
      ok: false
    };
  }

  return {
    data: attempt,
    ok: true
  };
}

function toFieldSelfieScreen(attempt: FieldScreeningAttemptRecord): FieldSelfieScreen {
  return {
    attemptId: attempt.id,
    counts: countFieldEvidence(attempt.participantEvidence),
    selfieComplete: countFieldEvidence(attempt.participantEvidence).selfie === 1,
    study: {
      code: attempt.questionnaireVersion.study.code,
      id: attempt.questionnaireVersion.study.id,
      name: attempt.questionnaireVersion.study.name
    }
  };
}

function validateCanAddFieldSelfie(
  attempt: FieldScreeningAttemptRecord,
  evidenceType: ParticipantEvidenceKind
): FieldServiceResult<true> {
  if (!getStudyBehavior(attempt.questionnaireVersion.study.code).requiresFinalSelfie) {
    return {
      code: "EVIDENCE_NOT_REQUIRED",
      message: "Este estudio no requiere selfie.",
      ok: false
    };
  }

  if (evidenceType !== "SELFIE_IDENTIFICATION") {
    return {
      code: "VALIDATION_ERROR",
      message: "Este paso solo permite registrar la selfie final.",
      ok: false
    };
  }

  if (countFieldEvidence(attempt.participantEvidence).selfie >= 1) {
    return {
      code: "VALIDATION_ERROR",
      message: "Ya existe una selfie registrada para este intento.",
      ok: false
    };
  }

  return {
    data: true,
    ok: true
  };
}

export function fieldAttemptRequiresFinalSelfie(attempt: FieldScreeningAttemptRecord): boolean {
  return attempt.status === "PASSED" && getStudyBehavior(attempt.questionnaireVersion.study.code).requiresFinalSelfie;
}

export function fieldAttemptHasFinalSelfie(attempt: FieldScreeningAttemptRecord): boolean {
  return countFieldEvidence(attempt.participantEvidence).selfie === 1;
}

export function countFieldEvidence(evidence: FieldScreeningAttemptRecord["participantEvidence"]): FieldEvidenceCounts {
  return {
    perfumePhotos: evidence.filter((item) => item.type === "PERFUME_PHOTO").length,
    selfie: evidence.filter((item) => item.type === "SELFIE_IDENTIFICATION").length
  };
}

function withNewFieldEvidence(
  evidence: FieldScreeningAttemptRecord["participantEvidence"],
  newEvidence: FieldScreeningAttemptRecord["participantEvidence"][number]
): FieldScreeningAttemptRecord["participantEvidence"] {
  return evidence.some((item) => item.id === newEvidence.id) ? evidence : [...evidence, newEvidence];
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

function isOpenStatus(status: FieldScreeningStatus): boolean {
  return status === "STARTED" || status === "INCOMPLETE";
}
