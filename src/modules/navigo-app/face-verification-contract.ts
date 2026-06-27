export const NAVIGO_FACE_VERIFICATION_METHOD = "@vladmandic/human:faceres+blazeface:v1";
export const FACE_SIMILARITY_APPROVE_THRESHOLD = 0.6;
export const FACE_SIMILARITY_REJECT_THRESHOLD = 0.35;

export type NavigoFaceVerificationOutcome = "ERROR" | "MATCH" | "NO_MATCH" | "UNCERTAIN";

export type NavigoFaceVerificationReviewStatus = "APPROVED" | "PENDING" | "REJECTED";

export type NavigoFaceVerificationClientResult = {
  evaluatedAt: string;
  method: string;
  reason?: string;
  score: number | null;
  status: NavigoFaceVerificationOutcome;
};

export type NavigoFaceVerificationStorageResult = {
  internalNote: string;
  rejectionReason: string | null;
  reviewStatus: NavigoFaceVerificationReviewStatus;
};

export function classifyNavigoFaceSimilarity(score: number | null): NavigoFaceVerificationOutcome {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return "ERROR";
  }

  if (score >= FACE_SIMILARITY_APPROVE_THRESHOLD) {
    return "MATCH";
  }

  if (score <= FACE_SIMILARITY_REJECT_THRESHOLD) {
    return "NO_MATCH";
  }

  return "UNCERTAIN";
}

export function normalizeNavigoFaceVerificationForStorage(
  result: NavigoFaceVerificationClientResult | null | undefined
): NavigoFaceVerificationStorageResult {
  if (!result || result.method !== NAVIGO_FACE_VERIFICATION_METHOD) {
    return {
      internalNote: "Verificacion automatica de identidad no configurada. Requiere revision manual.",
      rejectionReason: null,
      reviewStatus: "PENDING"
    };
  }

  const score = sanitizeFaceScore(result.score);
  const status = score === null && result.status === "MATCH" ? "ERROR" : result.status;
  const safeStatus = status === classifyNavigoFaceSimilarity(score) ? status : classifyNavigoFaceSimilarity(score);
  const evaluatedAt = sanitizeFaceVerificationText(result.evaluatedAt || new Date().toISOString(), 48);
  const reason = sanitizeFaceVerificationText(result.reason ?? "", 140);
  const scoreLabel = score === null ? "sin score" : score.toFixed(3);
  const note =
    `Verificacion facial automatica: ${safeStatus}. ` +
    `Metodo: ${NAVIGO_FACE_VERIFICATION_METHOD}. ` +
    `Similitud: ${scoreLabel}. ` +
    `Umbrales: MATCH >= ${FACE_SIMILARITY_APPROVE_THRESHOLD}, NO_MATCH <= ${FACE_SIMILARITY_REJECT_THRESHOLD}. ` +
    `Evaluado: ${evaluatedAt}.` +
    (reason ? ` Motivo tecnico: ${reason}.` : "");

  if (safeStatus === "MATCH") {
    return {
      internalNote: note,
      rejectionReason: null,
      reviewStatus: "APPROVED"
    };
  }

  if (safeStatus === "NO_MATCH") {
    return {
      internalNote: note,
      rejectionReason: "La verificacion automatica indica que la selfie no coincide con la foto registrada.",
      reviewStatus: "REJECTED"
    };
  }

  return {
    internalNote: safeStatus === "ERROR" ? `${note} Requiere revision manual por error del motor.` : `${note} Requiere revision manual.`,
    rejectionReason: null,
    reviewStatus: "PENDING"
  };
}

export function faceVerificationResultLabel(status: NavigoFaceVerificationOutcome | null | undefined): string {
  if (status === "MATCH") {
    return "MATCH";
  }
  if (status === "NO_MATCH") {
    return "NO_MATCH";
  }
  if (status === "UNCERTAIN") {
    return "UNCERTAIN";
  }
  if (status === "ERROR") {
    return "ERROR";
  }

  return "No configurado";
}

export function parseNavigoFaceVerificationNote(note: string | null | undefined): {
  evaluatedAt: string | null;
  method: string | null;
  score: string | null;
  status: NavigoFaceVerificationOutcome | null;
} {
  if (!note) {
    return {
      evaluatedAt: null,
      method: null,
      score: null,
      status: null
    };
  }

  return {
    evaluatedAt: note.match(/Evaluado: ([^.]+)\./)?.[1] ?? null,
    method: note.match(/Metodo: ([^.]+)\./)?.[1] ?? null,
    score: note.match(/Similitud: ([^.]+)\./)?.[1] ?? null,
    status: readOutcome(note)
  };
}

function readOutcome(note: string): NavigoFaceVerificationOutcome | null {
  if (note.includes("Verificacion facial automatica: MATCH")) {
    return "MATCH";
  }
  if (note.includes("Verificacion facial automatica: NO_MATCH")) {
    return "NO_MATCH";
  }
  if (note.includes("Verificacion facial automatica: UNCERTAIN")) {
    return "UNCERTAIN";
  }
  if (note.includes("Verificacion facial automatica: ERROR")) {
    return "ERROR";
  }

  return null;
}

function sanitizeFaceScore(score: number | null): number | null {
  if (typeof score !== "number" || Number.isNaN(score) || !Number.isFinite(score)) {
    return null;
  }

  return Math.max(0, Math.min(1, score));
}

function sanitizeFaceVerificationText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
