import { PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE } from "./access";
import { PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE } from "./registration-service";
import {
  PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE,
  PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE
} from "./screener-service";
import {
  F6_PERFUME_EVIDENCE_QUESTION_ID,
  PARTICIPANT_EVIDENCE_BUCKET,
  assertEvidenceStorageKeyBelongsToAttempt,
  createSignedEvidenceUpload,
  validateEvidenceUploadMetadata,
  type EvidenceStorageClient,
  type EvidenceUploadMetadata,
  type ParticipantEvidenceKind,
  type SignedEvidenceUpload
} from "./evidence-storage";
import type {
  ParticipantPortalEvidenceRepository,
  PortalEvidenceAttemptRecord,
  PortalEvidenceConfigRecord,
  PortalEvidenceParticipantProfileRecord,
  PortalEvidenceRecord,
  PortalEvidenceStudyRecord,
  PortalEvidenceStudyParticipantRecord
} from "./evidence-repository";
import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";

export const PARTICIPANT_PORTAL_EVIDENCE_REVIEW_MESSAGE =
  "Gracias. Tus respuestas y evidencias están en revisión. Recibirás seguimiento de tu reclutador.";
export const PARTICIPANT_PORTAL_EVIDENCE_REQUIRED_MESSAGE =
  "Completa tus evidencias para continuar con la revisión.";

export type ParticipantEvidenceCounts = {
  perfumePhotos: number;
  selfie: number;
};

export type ParticipantEvidenceScreen = {
  attemptId: string;
  canFinalizeReview: boolean;
  config: {
    maxImageBytes: number;
    maxPerfumePhotos: number;
    minPerfumePhotos: number;
  };
  counts: ParticipantEvidenceCounts;
  evidenceComplete: boolean;
  status: PortalEvidenceAttemptRecord["status"];
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type ParticipantPortalSelfieScreen = {
  attemptId: string;
  counts: ParticipantEvidenceCounts;
  selfieComplete: boolean;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type ParticipantPortalEvidencePublicResult = {
  confirmation?: {
    codes: Array<{ code: string; slot: number }>;
    folio: string;
    participantName: string;
  };
  kind: "APPROVED" | "IN_PROGRESS" | "PENDING_EVIDENCE" | "PENDING_REVIEW" | "REJECTED" | "TERMINATED";
  message: string;
  showEvidenceLink: boolean;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type ParticipantPortalEvidenceErrorCode =
  | "ATTEMPT_NOT_READY"
  | "CONSENT_REQUIRED"
  | "EVIDENCE_INCOMPLETE"
  | "PORTAL_UNAVAILABLE"
  | "REGISTRATION_REQUIRED"
  | "VALIDATION_ERROR";

export type ParticipantPortalEvidenceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      code: ParticipantPortalEvidenceErrorCode;
      message: string;
      ok: false;
    };

type EvidenceContext = {
  attempt: PortalEvidenceAttemptRecord;
  participantProfile: PortalEvidenceParticipantProfileRecord;
  study: PortalEvidenceStudyRecord & {
    portalConfig: PortalEvidenceConfigRecord;
  };
  studyParticipant: PortalEvidenceStudyParticipantRecord;
};

export async function getParticipantPortalEvidenceScreen({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<ParticipantEvidenceScreen>> {
  const context = await loadCurrentEvidenceContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  if (context.data.attempt.participantConfirmation) {
    return {
      code: "ATTEMPT_NOT_READY",
      message: "Tu participación ya fue confirmada.",
      ok: false
    };
  }

  return {
    data: toEvidenceScreen(context.data),
    ok: true
  };
}

export async function getParticipantPortalSelfieScreen({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<ParticipantPortalSelfieScreen>> {
  const base = await loadBaseContext({ identity, repository, studyCode });

  if (!base.ok) {
    return base;
  }

  const attemptResult = await ensurePortalAttemptForEvidence({
    attempts: base.data.attempts,
    repository,
    study: base.data.study,
    studyParticipant: base.data.studyParticipant
  });

  if (!attemptResult.ok) {
    return attemptResult;
  }

  return {
    data: {
      attemptId: attemptResult.data.id,
      counts: countEvidence(attemptResult.data.participantEvidence),
      selfieComplete: hasExactlyOneSelfie(attemptResult.data.participantEvidence),
      study: publicStudy(base.data.study)
    },
    ok: true
  };
}

export async function requestParticipantEvidenceUpload({
  identity,
  metadata,
  repository,
  storage,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  metadata: EvidenceUploadMetadata;
  repository: ParticipantPortalEvidenceRepository;
  storage: EvidenceStorageClient;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<SignedEvidenceUpload & { metadata: EvidenceUploadMetadata }>> {
  const context = await loadCurrentEvidenceContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  try {
    assertCanAddEvidence(context.data.attempt.participantEvidence, context.data.study.portalConfig, metadata.evidenceType);
    const signed = await createSignedEvidenceUpload({
      attemptId: context.data.attempt.id,
      maxImageBytes: context.data.study.portalConfig.maxImageBytes,
      metadata,
      participantProfileId: context.data.participantProfile.id,
      storage,
      studyId: context.data.study.id
    });

    return {
      data: signed,
      ok: true
    };
  } catch (error) {
    logEvidenceServiceError("prepare-signed-upload", metadata.evidenceType, error);
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "No fue posible preparar la evidencia.",
      ok: false
    };
  }
}

export async function confirmParticipantEvidenceUpload({
  identity,
  input,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  input: EvidenceUploadMetadata & {
    privateStorageKey: string;
    storageBucket: string;
  };
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<PortalEvidenceRecord>> {
  const context = await loadCurrentEvidenceContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  try {
    assertCanAddEvidence(context.data.attempt.participantEvidence, context.data.study.portalConfig, input.evidenceType);
    const metadata = validateEvidenceUploadMetadata({
      maxImageBytes: context.data.study.portalConfig.maxImageBytes,
      metadata: input
    });

    if (input.storageBucket !== PARTICIPANT_EVIDENCE_BUCKET) {
      throw new Error("No fue posible validar la evidencia cargada.");
    }

    assertEvidenceStorageKeyBelongsToAttempt({
      attemptId: context.data.attempt.id,
      participantProfileId: context.data.participantProfile.id,
      privateStorageKey: input.privateStorageKey,
      studyId: context.data.study.id
    });

    const evidence = await repository.createEvidence({
      extension: metadata.extension,
      mimeType: metadata.mimeType,
      originalFilename: metadata.originalFilename,
      privateStorageKey: input.privateStorageKey,
      relatedQuestionId:
        metadata.evidenceType === "PERFUME_PHOTO" ? F6_PERFUME_EVIDENCE_QUESTION_ID : null,
      screeningAttemptId: context.data.attempt.id,
      sizeBytes: metadata.sizeBytes,
      storageBucket: input.storageBucket,
      studyParticipantId: context.data.studyParticipant.id,
      type: metadata.evidenceType
    });

    return {
      data: evidence,
      ok: true
    };
  } catch (error) {
    logEvidenceServiceError("register-evidence", input.evidenceType, error);
    return {
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "No fue posible registrar la evidencia.",
      ok: false
    };
  }
}

export async function completeParticipantEvidenceSubmission({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<ParticipantEvidenceScreen>> {
  const context = await loadEvidenceContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const validation = validateEvidenceCounts({
    config: context.data.study.portalConfig,
    evidence: context.data.attempt.participantEvidence
  });

  if (!validation.ok) {
    return {
      code: "EVIDENCE_INCOMPLETE",
      message: validation.message,
      ok: false
    };
  }

  if (context.data.attempt.status !== "PENDING_REVIEW" && context.data.attempt.status !== "PASSED") {
    return {
      code: "ATTEMPT_NOT_READY",
      message: "Completa el filtro antes de finalizar las evidencias.",
      ok: false
    };
  }

  await repository.upsertPendingReview({
    screeningAttemptId: context.data.attempt.id,
    studyParticipantId: context.data.studyParticipant.id
  });

  return {
    data: toEvidenceScreen(context.data),
    ok: true
  };
}

export async function getParticipantPortalEvidenceResult({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<ParticipantPortalEvidencePublicResult>> {
  const context = await loadResultContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const { attempt, study } = context.data;

  if (attempt.participantConfirmation) {
    return {
      data: {
        confirmation: {
          codes: attempt.participantConfirmation.referenceCodes,
          folio: attempt.participantConfirmation.folio,
          participantName: context.data.participantProfile.name
        },
        kind: "APPROVED",
        message: "Conserva estos códigos. Te serán solicitados durante tu evaluación.",
        showEvidenceLink: false,
        study: publicStudy(study)
      },
      ok: true
    };
  }

  if (attempt.status === "TERMINATED" || attempt.participantScreeningReview?.status === "REJECTED") {
    return {
      data: {
        kind: attempt.status === "TERMINATED" ? "TERMINATED" : "REJECTED",
        message: PARTICIPANT_PORTAL_PUBLIC_TERMINATED_MESSAGE,
        showEvidenceLink: false,
        study: publicStudy(study)
      },
      ok: true
    };
  }

  if (attempt.status === "STARTED" || attempt.status === "INCOMPLETE") {
    return {
      data: {
        kind: "IN_PROGRESS",
        message: "Continúa el filtro para completar tus respuestas.",
        showEvidenceLink: false,
        study: publicStudy(study)
      },
      ok: true
    };
  }

  const evidenceComplete = validateEvidenceCounts({
    config: study.portalConfig,
    evidence: attempt.participantEvidence
  }).ok;

  return {
    data: {
      kind: evidenceComplete ? "PENDING_REVIEW" : "PENDING_EVIDENCE",
      message: evidenceComplete
        ? PARTICIPANT_PORTAL_EVIDENCE_REVIEW_MESSAGE
        : PARTICIPANT_PORTAL_EVIDENCE_REQUIRED_MESSAGE,
      showEvidenceLink: !evidenceComplete,
      study: publicStudy(study)
    },
    ok: true
  };
}

async function loadEvidenceContext({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<EvidenceContext>> {
  const context = await loadBaseContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attempt = context.data.attempts.find(
    (candidate) => candidate.source === "PARTICIPANT_PORTAL" && candidate.status === "PENDING_REVIEW"
  );

  if (!attempt) {
    return {
      code: "ATTEMPT_NOT_READY",
      message: "El filtro aun no esta listo para cargar evidencias.",
      ok: false
    };
  }

  return {
    data: {
      attempt,
      participantProfile: context.data.participantProfile,
      study: context.data.study,
      studyParticipant: context.data.studyParticipant
    },
    ok: true
  };
}

async function loadCurrentEvidenceContext({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<EvidenceContext>> {
  const context = await loadBaseContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attempt = selectCurrentEvidenceAttempt(context.data.attempts);

  if (attempt) {
    return {
      data: {
        attempt,
        participantProfile: context.data.participantProfile,
        study: context.data.study,
        studyParticipant: context.data.studyParticipant
      },
      ok: true
    };
  }

  const created = await ensurePortalAttemptForEvidence({
    attempts: context.data.attempts,
    repository,
    study: context.data.study,
    studyParticipant: context.data.studyParticipant
  });

  if (!created.ok) {
    return created;
  }

  return {
    data: {
      attempt: created.data,
      participantProfile: context.data.participantProfile,
      study: context.data.study,
      studyParticipant: context.data.studyParticipant
    },
    ok: true
  };
}

async function loadResultContext({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<ParticipantPortalEvidenceResult<EvidenceContext>> {
  const context = await loadBaseContext({ identity, repository, studyCode });

  if (!context.ok) {
    return context;
  }

  const attempt = context.data.attempts[0] ?? null;

  if (!attempt) {
    return {
      code: "ATTEMPT_NOT_READY",
      message: "Aun no hay un filtro registrado.",
      ok: false
    };
  }

  return {
    data: {
      attempt,
      participantProfile: context.data.participantProfile,
      study: context.data.study,
      studyParticipant: context.data.studyParticipant
    },
    ok: true
  };
}

async function loadBaseContext({
  identity,
  repository,
  studyCode
}: {
  identity: ParticipantPortalIdentity;
  repository: ParticipantPortalEvidenceRepository;
  studyCode: string;
}): Promise<
  ParticipantPortalEvidenceResult<{
    attempts: PortalEvidenceAttemptRecord[];
    participantProfile: PortalEvidenceParticipantProfileRecord;
    study: PortalEvidenceStudyRecord & { portalConfig: PortalEvidenceConfigRecord };
    studyParticipant: PortalEvidenceStudyParticipantRecord;
  }>
> {
  const study = await repository.getStudyByCode(studyCode);

  if (!study || study.status !== "ACTIVE" || !study.portalConfig?.enabled) {
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
      attempts: await repository.listPortalAttemptsForStudyParticipant(studyParticipant.id),
      participantProfile,
      study: {
        ...study,
        portalConfig: study.portalConfig
      },
      studyParticipant
    },
    ok: true
  };
}

async function ensurePortalAttemptForEvidence({
  attempts,
  repository,
  study,
  studyParticipant
}: {
  attempts: PortalEvidenceAttemptRecord[];
  repository: ParticipantPortalEvidenceRepository;
  study: PortalEvidenceStudyRecord & { portalConfig: PortalEvidenceConfigRecord };
  studyParticipant: PortalEvidenceStudyParticipantRecord;
}): Promise<ParticipantPortalEvidenceResult<PortalEvidenceAttemptRecord>> {
  const current = selectCurrentEvidenceAttempt(attempts);

  if (current) {
    return {
      data: current,
      ok: true
    };
  }

  if (!study.activeScreenerVersionId) {
    return {
      code: "ATTEMPT_NOT_READY",
      message: "El filtro aun no esta listo para capturar evidencias.",
      ok: false
    };
  }

  if (attempts.length > 0) {
    return {
      code: "ATTEMPT_NOT_READY",
      message: PARTICIPANT_PORTAL_DUPLICATE_REGISTRATION_MESSAGE,
      ok: false
    };
  }

  await repository.updateStudyParticipantScreening({
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "STARTED",
    studyParticipantId: studyParticipant.id
  });

  return {
    data: await repository.createPortalScreeningAttempt({
      questionnaireVersionId: study.activeScreenerVersionId,
      studyParticipantId: studyParticipant.id
    }),
    ok: true
  };
}

function toEvidenceScreen(context: EvidenceContext): ParticipantEvidenceScreen {
  const counts = countEvidence(context.attempt.participantEvidence);
  const complete = validateEvidenceCounts({
    config: context.study.portalConfig,
    evidence: context.attempt.participantEvidence
  }).ok;

  return {
    attemptId: context.attempt.id,
    canFinalizeReview: context.attempt.status === "PENDING_REVIEW" || context.attempt.status === "PASSED",
    config: {
      maxImageBytes: context.study.portalConfig.maxImageBytes,
      maxPerfumePhotos: context.study.portalConfig.maxPerfumePhotos,
      minPerfumePhotos: context.study.portalConfig.minPerfumePhotos
    },
    counts,
    evidenceComplete: complete,
    status: context.attempt.status,
    study: publicStudy(context.study)
  };
}

function publicStudy(study: PortalEvidenceStudyRecord) {
  return {
    code: study.code,
    id: study.id,
    name: study.name
  };
}

export function countEvidence(evidence: PortalEvidenceRecord[]): ParticipantEvidenceCounts {
  return {
    perfumePhotos: evidence.filter((item) => item.type === "PERFUME_PHOTO").length,
    selfie: evidence.filter((item) => item.type === "SELFIE_IDENTIFICATION").length
  };
}

export function hasExactlyOneSelfie(evidence: PortalEvidenceRecord[]): boolean {
  return countEvidence(evidence).selfie === 1;
}

export function validateEvidenceCounts({
  config,
  evidence
}: {
  config: Pick<PortalEvidenceConfigRecord, "maxPerfumePhotos" | "minPerfumePhotos">;
  evidence: PortalEvidenceRecord[];
}):
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  const counts = countEvidence(evidence);

  if (counts.selfie !== 1) {
    return {
      message: "Debes subir exactamente una selfie de identificación.",
      ok: false
    };
  }

  if (counts.perfumePhotos < config.minPerfumePhotos) {
    return {
      message: `Debes subir al menos ${config.minPerfumePhotos} foto de perfume.`,
      ok: false
    };
  }

  if (counts.perfumePhotos > config.maxPerfumePhotos) {
    return {
      message: `Puedes subir máximo ${config.maxPerfumePhotos} fotos de perfumes.`,
      ok: false
    };
  }

  return { ok: true };
}

function assertCanAddEvidence(
  evidence: PortalEvidenceRecord[],
  config: PortalEvidenceConfigRecord,
  evidenceType: ParticipantEvidenceKind
) {
  const counts = countEvidence(evidence);

  if (evidenceType === "SELFIE_IDENTIFICATION" && counts.selfie >= 1) {
    throw new Error("Ya existe una selfie registrada para este intento.");
  }

  if (evidenceType === "PERFUME_PHOTO" && counts.perfumePhotos >= config.maxPerfumePhotos) {
    throw new Error(`Puedes subir máximo ${config.maxPerfumePhotos} fotos de perfumes.`);
  }
}

function selectCurrentEvidenceAttempt(
  attempts: PortalEvidenceAttemptRecord[]
): PortalEvidenceAttemptRecord | null {
  return (
    attempts.find(
      (attempt) =>
        attempt.source === "PARTICIPANT_PORTAL" &&
        (attempt.status === "STARTED" || attempt.status === "INCOMPLETE")
    ) ??
    attempts.find(
      (attempt) =>
        attempt.source === "PARTICIPANT_PORTAL" &&
        (attempt.status === "PENDING_REVIEW" || attempt.status === "PASSED")
    ) ?? null
  );
}

function logEvidenceServiceError(step: string, evidenceType: ParticipantEvidenceKind, error: unknown) {
  console.error("[participant-evidence]", {
    code: readSafeErrorCode(error),
    evidenceType,
    step
  });
}

function readSafeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "unknown";
}
