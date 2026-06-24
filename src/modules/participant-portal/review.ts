export type ParticipantScreeningReviewDraft = {
  createdAt: Date;
  id?: string;
  screeningAttemptId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  studyParticipantId: string;
  updatedAt: Date;
};

export type ParticipantReferenceCodeDraft = {
  code: string;
  slot: 1 | 2 | 3;
};

export const PARTICIPANT_REFERENCE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ2346789";
export const PARTICIPANT_REFERENCE_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2346789]{4}$/;

export type ParticipantConfirmationDraft = {
  approvedAt: Date;
  approvedByUserId: string;
  folio: string;
  folioSequence: number;
  manualMessageStatus: "NOT_SENT" | "MARKED_SENT";
  referenceCodes: ParticipantReferenceCodeDraft[];
  screeningAttemptId: string;
  studyId: string;
  studyParticipantId: string;
};

export type ParticipantPortalApprovalInput = {
  approvedByUserId: string;
  codeGenerator: () => string;
  existingConfirmation?: ParticipantConfirmationDraft | null;
  existingReferenceCodes?: string[];
  folioMaxSequence: number;
  folioPrefix: string;
  nextFolioSequence: number;
  now?: Date;
  screeningAttemptId: string;
  studyId: string;
  studyParticipantId: string;
};

export type ParticipantPortalApprovalResult =
  | {
      confirmation: ParticipantConfirmationDraft;
      created: boolean;
      nextFolioSequence: number;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export function createPendingParticipantReview({
  now = new Date(),
  screeningAttemptId,
  studyParticipantId
}: {
  now?: Date;
  screeningAttemptId: string;
  studyParticipantId: string;
}): ParticipantScreeningReviewDraft {
  return {
    createdAt: now,
    screeningAttemptId,
    status: "PENDING",
    studyParticipantId,
    updatedAt: now
  };
}

export function rejectParticipantReview({
  rejectionReason
}: {
  rejectionReason: string;
}): {
  canCreateConfirmation: false;
  rejectionReason: string;
  status: "REJECTED";
} {
  return {
    canCreateConfirmation: false,
    rejectionReason,
    status: "REJECTED"
  };
}

export function approveParticipantReview(input: ParticipantPortalApprovalInput): ParticipantPortalApprovalResult {
  if (input.existingConfirmation) {
    return {
      confirmation: input.existingConfirmation,
      created: false,
      nextFolioSequence: input.nextFolioSequence,
      ok: true
    };
  }

  if (input.nextFolioSequence > input.folioMaxSequence) {
    return {
      message: "Se agotó la secuencia de folios configurada para este estudio.",
      ok: false
    };
  }

  const folioSequence = input.nextFolioSequence;
  const confirmation: ParticipantConfirmationDraft = {
    approvedAt: input.now ?? new Date(),
    approvedByUserId: input.approvedByUserId,
    folio: buildFolio(input.folioPrefix, folioSequence),
    folioSequence,
    manualMessageStatus: "NOT_SENT",
    referenceCodes: generateReferenceCodes({
      codeGenerator: input.codeGenerator,
      existingReferenceCodes: input.existingReferenceCodes ?? []
    }),
    screeningAttemptId: input.screeningAttemptId,
    studyId: input.studyId,
    studyParticipantId: input.studyParticipantId
  };

  return {
    confirmation,
    created: true,
    nextFolioSequence: input.nextFolioSequence + 1,
    ok: true
  };
}

export function buildFolio(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function generateReferenceCodes({
  codeGenerator,
  existingReferenceCodes
}: {
  codeGenerator: () => string;
  existingReferenceCodes: string[];
}): ParticipantReferenceCodeDraft[] {
  const existing = new Set(existingReferenceCodes.map(normalizeParticipantReferenceCode));
  const codes: ParticipantReferenceCodeDraft[] = [];
  const generated = new Set<string>();
  let attempts = 0;

  while (codes.length < 3) {
    attempts += 1;

    if (attempts > 50) {
      throw new Error("No fue posible generar tres códigos de referencia únicos.");
    }

    const code = normalizeParticipantReferenceCode(codeGenerator());

    if (!isParticipantReferenceCode(code) || existing.has(code) || generated.has(code)) {
      continue;
    }

    generated.add(code);
    codes.push({
      code,
      slot: (codes.length + 1) as 1 | 2 | 3
    });
  }

  return codes;
}

export function normalizeParticipantReferenceCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isParticipantReferenceCode(value: string): boolean {
  return PARTICIPANT_REFERENCE_CODE_PATTERN.test(normalizeParticipantReferenceCode(value));
}

export function buildManualWhatsAppMessage({
  codes,
  folio,
  participantName,
  studyName: _studyName
}: {
  codes: ParticipantReferenceCodeDraft[];
  folio: string;
  participantName: string;
  studyName: string;
}): string {
  void _studyName;
  const orderedCodes = [...codes].sort((a, b) => a.slot - b.slot);

  return [
    `Hola, ${participantName}. Tu participación ha sido confirmada para continuar en el estudio.`,
    "",
    `Folio: ${folio}.`,
    ...orderedCodes.map((item) => `Código ${item.slot}: ${item.code}`),
    "",
    "Conserva este mensaje y tus códigos, ya que te serán solicitados durante tu evaluación."
  ].join("\n");
}
