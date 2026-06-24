import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { PortalEvidenceRecord } from "./evidence-repository";
import type { ParticipantReferenceCodeDraft } from "./review";

export type EvidenceReviewAttemptStatus =
  | "INCOMPLETE"
  | "NOT_STARTED"
  | "PASSED"
  | "PENDING_REVIEW"
  | "STARTED"
  | "TERMINATED";

export type EvidenceReviewRecord = {
  id: string;
  internalNote: string | null;
  rejectionReason: string | null;
  status: "APPROVED" | "PENDING" | "REJECTED";
};

export type EvidenceReviewConfirmationRecord = {
  folio: string;
  folioSequence: number;
  manualMessageMarkedSentAt: Date | null;
  manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
  referenceCodes: ParticipantReferenceCodeDraft[];
};

export type EvidenceReviewAttemptRecord = {
  answers: Array<{ answerJson: unknown; questionId: string }>;
  id: string;
  participantConfirmation: EvidenceReviewConfirmationRecord | null;
  participantEvidence: PortalEvidenceRecord[];
  participantScreeningReview: EvidenceReviewRecord | null;
  questionnaireVersion: {
    study: {
      code: string;
      id: string;
      name: string;
      participantPortalConfig: {
        folioMaxSequence: number;
        folioPrefix: string;
        maxImageBytes: number;
        maxPerfumePhotos: number;
        minPerfumePhotos: number;
        nextFolioSequence: number;
      } | null;
    };
  };
  source: "FIELD" | "PARTICIPANT_PORTAL";
  status: EvidenceReviewAttemptStatus;
  studyParticipant: {
    id: string;
    participantProfile: {
      email: string | null;
      id: string;
      name: string;
      phone: string | null;
    };
  };
  studyParticipantId: string;
};

export type EvidenceReviewRepository = {
  approveEvidence: (input: {
    approvedByUserId: string;
    attemptId: string;
    codeGenerator: () => string;
    now?: Date;
  }) => Promise<EvidenceReviewApprovalResult>;
  getAttemptReview: (attemptId: string) => Promise<EvidenceReviewAttemptRecord | null>;
  markManualMessageSent: (input: {
    attemptId: string;
    markedByUserId: string;
    now?: Date;
  }) => Promise<void>;
  rejectEvidence: (input: {
    attemptId: string;
    internalNote?: string | null;
    rejectionReason: string;
    reviewedByUserId: string;
    now?: Date;
  }) => Promise<void>;
  replaceEvidence: (input: ReplaceParticipantEvidenceInput) => Promise<EvidenceReviewReplacementResult>;
};

export type EvidenceReviewApprovalResult =
  | {
      confirmation: EvidenceReviewConfirmationRecord;
      created: boolean;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type ReplaceParticipantEvidenceInput = {
  attemptId: string;
  evidenceId?: string | null;
  evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  extension: "jpeg" | "jpg" | "png" | "webp";
  mimeType: string;
  originalFilename: string;
  privateStorageKey: string;
  replacementReason: string;
  reviewedByUserId: string;
  sizeBytes: number;
  storageBucket: string;
  now?: Date;
};

export type EvidenceReviewReplacementResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

type EvidenceReviewPrismaClient = PrismaClientLike & {
  $transaction: <T>(callback: (tx: EvidenceReviewTransactionClient) => Promise<T>) => Promise<T>;
  screeningAttempt: {
    findUnique: (args: unknown) => Promise<EvidenceReviewAttemptRecord | null>;
  };
};

type EvidenceReviewTransactionClient = {
  participantConfirmation: {
    create: (args: unknown) => Promise<EvidenceReviewConfirmationRecord>;
    findUnique: (args: unknown) => Promise<EvidenceReviewConfirmationRecord | null>;
    update: (args: unknown) => Promise<EvidenceReviewConfirmationRecord>;
  };
  participantEvidence: {
    create: (args: unknown) => Promise<PortalEvidenceRecord>;
    update: (args: unknown) => Promise<PortalEvidenceRecord>;
    updateMany: (args: unknown) => Promise<unknown>;
  };
  participantPortalStudyConfig: {
    update: (args: unknown) => Promise<unknown>;
  };
  participantReferenceCode: {
    findMany: (args: unknown) => Promise<Array<{ code: string }>>;
  };
  participantScreeningReview: {
    upsert: (args: unknown) => Promise<EvidenceReviewRecord>;
    update: (args: unknown) => Promise<EvidenceReviewRecord>;
  };
  screeningAttempt: {
    findUnique: (args: unknown) => Promise<EvidenceReviewAttemptRecord | null>;
  };
};

const evidenceSelect = {
  extension: true,
  id: true,
  mimeType: true,
  originalFilename: true,
  privateStorageKey: true,
  relatedQuestionId: true,
  reviewStatus: true,
  sizeBytes: true,
  storageBucket: true,
  type: true,
  uploadedAt: true
} as const;

const confirmationSelect = {
  folio: true,
  folioSequence: true,
  manualMessageMarkedSentAt: true,
  manualMessageStatus: true,
  referenceCodes: {
    orderBy: { slot: "asc" },
    select: {
      code: true,
      slot: true
    }
  }
} as const;

const attemptReviewSelect = {
  answers: {
    select: {
      answerJson: true,
      questionId: true
    }
  },
  id: true,
  participantConfirmation: {
    select: confirmationSelect
  },
  participantEvidence: {
    orderBy: { uploadedAt: "asc" },
    select: evidenceSelect
  },
  participantScreeningReview: {
    select: {
      id: true,
      internalNote: true,
      rejectionReason: true,
      status: true
    }
  },
  questionnaireVersion: {
    select: {
      study: {
        select: {
          code: true,
          id: true,
          name: true,
          participantPortalConfig: {
            select: {
              folioMaxSequence: true,
              folioPrefix: true,
              maxImageBytes: true,
              maxPerfumePhotos: true,
              minPerfumePhotos: true,
              nextFolioSequence: true
            }
          }
        }
      }
    }
  },
  source: true,
  status: true,
  studyParticipant: {
    select: {
      id: true,
      participantProfile: {
        select: {
          email: true,
          id: true,
          name: true,
          phone: true
        }
      }
    }
  },
  studyParticipantId: true
} as const;

export function createEvidenceReviewRepository(
  prismaClient?: EvidenceReviewPrismaClient
): EvidenceReviewRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as EvidenceReviewPrismaClient);
  }

  return {
    async approveEvidence(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

        if (!attempt) {
          return { message: "El intento no existe.", ok: false };
        }

        if (attempt.participantConfirmation) {
          return {
            confirmation: attempt.participantConfirmation,
            created: false,
            ok: true
          };
        }

        if (
          attempt.source !== "PARTICIPANT_PORTAL" ||
          attempt.status !== "PENDING_REVIEW" ||
          attempt.participantScreeningReview?.status !== "PENDING"
        ) {
          return { message: "La revisión no está pendiente de aprobación.", ok: false };
        }

        const config = attempt.questionnaireVersion.study.participantPortalConfig;

        if (!config) {
          return { message: "El portal no está configurado para este estudio.", ok: false };
        }

        const evidenceValidation = validateEvidenceForApproval({
          evidence: attempt.participantEvidence,
          maxPerfumePhotos: config.maxPerfumePhotos,
          minPerfumePhotos: config.minPerfumePhotos
        });

        if (!evidenceValidation.ok) {
          return evidenceValidation;
        }

        if (config.nextFolioSequence > config.folioMaxSequence) {
          return {
            message: "Se agotó la secuencia de folios configurada para este estudio.",
            ok: false
          };
        }

        const codes = await generateUniqueCodes(tx, input.codeGenerator);
        const folioSequence = config.nextFolioSequence;
        const folio = `${config.folioPrefix}-${String(folioSequence).padStart(3, "0")}`;
        const now = input.now ?? new Date();

        await tx.participantPortalStudyConfig.update({
          data: {
            nextFolioSequence: folioSequence + 1
          },
          where: {
            studyId: attempt.questionnaireVersion.study.id
          }
        });
        await tx.participantScreeningReview.update({
          data: {
            internalNote: null,
            rejectionReason: null,
            reviewedAt: now,
            reviewedByUserId: input.approvedByUserId,
            status: "APPROVED"
          },
          where: {
            screeningAttemptId: attempt.id
          }
        });
        await tx.participantEvidence.updateMany({
          data: {
            reviewStatus: "APPROVED",
            reviewedAt: now,
            reviewedByUserId: input.approvedByUserId
          },
          where: {
            screeningAttemptId: attempt.id
          }
        });

        const confirmation = await tx.participantConfirmation.create({
          data: {
            approvedAt: now,
            approvedByUserId: input.approvedByUserId,
            folio,
            folioSequence,
            referenceCodes: {
              create: codes
            },
            screeningAttemptId: attempt.id,
            studyId: attempt.questionnaireVersion.study.id,
            studyParticipantId: attempt.studyParticipantId
          },
          select: confirmationSelect
        });

        return {
          confirmation,
          created: true,
          ok: true
        };
      });
    },
    async getAttemptReview(attemptId) {
      const prisma = await getPrisma();

      return prisma.screeningAttempt.findUnique({
        select: attemptReviewSelect,
        where: { id: attemptId }
      });
    },
    async markManualMessageSent(input) {
      const prisma = await getPrisma();

      await prisma.$transaction(async (tx) => {
        await tx.participantConfirmation.update({
          data: {
            manualMessageMarkedSentAt: input.now ?? new Date(),
            manualMessageMarkedSentByUserId: input.markedByUserId,
            manualMessageStatus: "MARKED_SENT"
          },
          where: {
            screeningAttemptId: input.attemptId
          }
        });
      });
    },
    async rejectEvidence(input) {
      const prisma = await getPrisma();

      await prisma.$transaction(async (tx) => {
        const now = input.now ?? new Date();
        await tx.participantScreeningReview.update({
          data: {
            internalNote: input.internalNote ?? null,
            rejectionReason: input.rejectionReason,
            reviewedAt: now,
            reviewedByUserId: input.reviewedByUserId,
            status: "REJECTED"
          },
          where: {
            screeningAttemptId: input.attemptId
          }
        });
        await tx.participantEvidence.updateMany({
          data: {
            rejectionReason: input.rejectionReason,
            reviewStatus: "REJECTED",
            reviewedAt: now,
            reviewedByUserId: input.reviewedByUserId
          },
          where: {
            screeningAttemptId: input.attemptId
          }
        });
      });
    },
    async replaceEvidence(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

        if (!attempt) {
          return { message: "El intento no existe.", ok: false };
        }

        const reason = input.replacementReason.trim();
        if (!reason) {
          return { message: "Captura el motivo interno de reemplazo.", ok: false };
        }

        const target = input.evidenceId
          ? attempt.participantEvidence.find((item) => item.id === input.evidenceId)
          : input.evidenceType === "SELFIE_IDENTIFICATION"
            ? attempt.participantEvidence.find((item) => item.type === "SELFIE_IDENTIFICATION")
            : null;

        if (input.evidenceId && !target) {
          return { message: "La evidencia seleccionada no existe en este intento.", ok: false };
        }

        if (target && target.type !== input.evidenceType) {
          return { message: "La evidencia seleccionada no coincide con el tipo indicado.", ok: false };
        }

        if (input.evidenceType === "PERFUME_PHOTO" && !target) {
          const maxPerfumePhotos = attempt.questionnaireVersion.study.participantPortalConfig?.maxPerfumePhotos ?? 5;
          const perfumeCount = attempt.participantEvidence.filter((item) => item.type === "PERFUME_PHOTO").length;

          if (perfumeCount >= maxPerfumePhotos) {
            return { message: `Puedes registrar máximo ${maxPerfumePhotos} fotos de perfumes.`, ok: false };
          }
        }

        const now = input.now ?? new Date();
        const reviewAlreadyApproved = attempt.participantScreeningReview?.status === "APPROVED";
        const correctionNote = buildEvidenceReplacementNote({
          evidenceType: input.evidenceType,
          reason,
          reviewedByUserId: input.reviewedByUserId
        });
        const evidenceData = {
          extension: input.extension,
          internalNote: correctionNote,
          mimeType: input.mimeType,
          originalFilename: input.originalFilename,
          privateStorageKey: input.privateStorageKey,
          rejectionReason: null,
          reviewStatus: reviewAlreadyApproved ? "APPROVED" : "PENDING",
          reviewedAt: reviewAlreadyApproved ? now : null,
          reviewedByUserId: reviewAlreadyApproved ? input.reviewedByUserId : null,
          sizeBytes: input.sizeBytes,
          storageBucket: input.storageBucket
        };

        if (target) {
          await tx.participantEvidence.update({
            data: evidenceData,
            select: evidenceSelect,
            where: {
              id: target.id
            }
          });
        } else {
          await tx.participantEvidence.create({
            data: {
              ...evidenceData,
              relatedQuestionId: input.evidenceType === "PERFUME_PHOTO" ? "F6_MARCAS_UTILIZA" : null,
              screeningAttemptId: attempt.id,
              studyParticipantId: attempt.studyParticipantId,
              type: input.evidenceType
            },
            select: evidenceSelect
          });
        }

        await tx.participantScreeningReview.upsert({
          create: {
            internalNote: correctionNote,
            screeningAttemptId: attempt.id,
            status: "PENDING",
            studyParticipantId: attempt.studyParticipantId
          },
          update: reviewAlreadyApproved
            ? {
                internalNote: appendInternalNote(attempt.participantScreeningReview?.internalNote, correctionNote)
              }
            : {
                internalNote: appendInternalNote(attempt.participantScreeningReview?.internalNote, correctionNote),
                rejectionReason: null,
                reviewedAt: null,
                reviewedByUserId: null,
                status: "PENDING"
              },
          where: {
            screeningAttemptId: attempt.id
          }
        });

        return { ok: true };
      });
    }
  };
}

async function getAttemptReviewWithClient(
  tx: EvidenceReviewTransactionClient,
  attemptId: string
): Promise<EvidenceReviewAttemptRecord | null> {
  return tx.screeningAttempt.findUnique({
    select: attemptReviewSelect,
    where: { id: attemptId }
  });
}

async function generateUniqueCodes(
  tx: EvidenceReviewTransactionClient,
  codeGenerator: () => string
): Promise<ParticipantReferenceCodeDraft[]> {
  const codes: ParticipantReferenceCodeDraft[] = [];
  const generated = new Set<string>();
  let attempts = 0;

  while (codes.length < 3) {
    attempts += 1;

    if (attempts > 50) {
      throw new Error("No fue posible generar tres códigos de referencia únicos.");
    }

    const code = codeGenerator().trim().toUpperCase();

    if (!code || generated.has(code)) {
      continue;
    }

    const existing = await tx.participantReferenceCode.findMany({
      select: { code: true },
      where: { code: { in: [code] } }
    });

    if (existing.length > 0) {
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

function validateEvidenceForApproval({
  evidence,
  maxPerfumePhotos,
  minPerfumePhotos
}: {
  evidence: PortalEvidenceRecord[];
  maxPerfumePhotos: number;
  minPerfumePhotos: number;
}):
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  const selfieCount = evidence.filter((item) => item.type === "SELFIE_IDENTIFICATION").length;
  const perfumeCount = evidence.filter((item) => item.type === "PERFUME_PHOTO").length;

  if (selfieCount !== 1) {
    return { message: "Debe existir exactamente una selfie.", ok: false };
  }

  if (perfumeCount < minPerfumePhotos || perfumeCount > maxPerfumePhotos) {
    return { message: "Las fotos de perfumes no cumplen con el rango configurado.", ok: false };
  }

  return { ok: true };
}

function buildEvidenceReplacementNote({
  evidenceType,
  reason,
  reviewedByUserId
}: {
  evidenceType: "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";
  reason: string;
  reviewedByUserId: string;
}): string {
  const label = evidenceType === "SELFIE_IDENTIFICATION" ? "selfie" : "foto de perfume";

  return `Corrección manual de ${label} por ${reviewedByUserId}: ${reason}`;
}

function appendInternalNote(current: string | null | undefined, next: string): string {
  return [current?.trim(), next].filter(Boolean).join("\n");
}
