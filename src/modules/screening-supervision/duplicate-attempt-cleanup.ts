import { createPrismaClient } from "@/shared/db/client";
import type { InternalUserRole, InternalUserStatus } from "@/shared/auth/permissions";

type Delegate = {
  count?: (args: unknown) => Promise<number>;
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<{ count: number }>;
  findFirst?: (args: unknown) => Promise<unknown | null>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown | null>;
  update?: (args: unknown) => Promise<unknown>;
};

type DuplicateAttemptCleanupPrisma = {
  $transaction: <T>(callback: (tx: DuplicateAttemptCleanupPrisma) => Promise<T>) => Promise<T>;
  auditLog: Delegate;
  ctlSession: Delegate;
  hutParticipant: Delegate;
  participantAccessToken: Delegate;
  participantActivity: Delegate;
  participantConfirmation: Delegate;
  participantEvidence: Delegate;
  participantReferenceCode: Delegate;
  participantScreeningReview: Delegate;
  screeningAnswer: Delegate;
  screeningAttempt: Delegate;
  studyParticipant: Delegate;
};

export type DuplicateScreeningAttemptCleanupActor = {
  id: string;
  role: InternalUserRole;
  status: InternalUserStatus;
};

type DuplicateCleanupAttemptRecord = {
  completedAt: Date | null;
  id: string;
  participantConfirmation: {
    folio: string;
    id: string;
    referenceCodes: Array<{ id: string; slot: number }>;
  } | null;
  participantEvidence: Array<{
    id: string;
    reviewStatus: string;
    type: string;
    uploadedAt: Date;
  }>;
  participantScreeningReview: {
    id: string;
    status: string;
  } | null;
  questionnaireVersion: {
    study: {
      code: string;
      id: string;
      name: string;
    };
  };
  answers: Array<{ id: string; questionId: string }>;
  source: string;
  startedAt: Date;
  status: string;
  studyParticipant: {
    id: string;
    operationalStatus: string;
    participantConfirmation: { folio: string; id: string; screeningAttemptId: string } | null;
    participantProfile: {
      email: string | null;
      id: string;
      name: string;
      phone: string | null;
    };
    screeningStatus: string;
    studyId: string;
  };
  studyParticipantId: string;
};

export type DuplicateScreeningAttemptCleanupPreview = {
  attempt: {
    completedAt: Date | null;
    id: string;
    source: string;
    startedAt: Date;
    status: string;
  };
  blockers: string[];
  canDelete: boolean;
  confirmation: {
    folio: string;
    id: string;
    referenceCodeCount: number;
    referenceCodeSlots: number[];
  } | null;
  counts: {
    answers: number;
    ctlSessionsForAttempt: number;
    ctlSessionsForParticipant: number;
    evidence: number;
    hutParticipantsForParticipant: number;
    navigoActivitiesForParticipant: number;
    navigoTokensForParticipant: number;
    referenceCodes: number;
    review: number;
  };
  evidence: Array<{
    id: string;
    reviewStatus: string;
    type: string;
    uploadedAt: Date;
  }>;
  participant: {
    email: string | null;
    id: string;
    name: string;
    phone: string | null;
    studyParticipantId: string;
  };
  participantOperationalContext: {
    activeConfirmationFolio: string | null;
    operationalStatus: string;
    screeningStatus: string;
  };
  projectedParticipantOperationalContext: {
    activeConfirmationFolio: string | null;
    operationalStatus: string;
    screeningStatus: string;
  };
  requiresFolioReleaseConfirmation: boolean;
  review: {
    id: string;
    status: string;
  } | null;
  study: {
    code: string;
    id: string;
    name: string;
  };
};

export type DuplicateScreeningAttemptCleanupReport = {
  attemptId: string;
  deletedAt: Date;
  deletedByUserId: string;
  deletedCounts: {
    answers: number;
    confirmation: number;
    evidence: number;
    referenceCodes: number;
    review: number;
    screeningAttempt: number;
  };
  folioReleased: string | null;
  participantProfileId: string;
  reason: string;
  statusChange: {
    after: {
      operationalStatus: string;
      screeningStatus: string;
    };
    before: {
      operationalStatus: string;
      screeningStatus: string;
    };
  };
  studyId: string;
  studyParticipantId: string;
};

export type DuplicateScreeningAttemptCleanupResult<T> =
  | { data: T; ok: true }
  | { message: string; ok: false };

export type DuplicateScreeningAttemptCleanupRepository = {
  deleteDuplicateAttempt: (input: {
    actorUserId: string;
    attemptId: string;
    reason: string;
    releaseFolio: boolean;
  }) => Promise<DuplicateScreeningAttemptCleanupResult<DuplicateScreeningAttemptCleanupReport>>;
  getPreview: (attemptId: string) => Promise<DuplicateScreeningAttemptCleanupPreview | null>;
};

export function createDuplicateScreeningAttemptCleanupRepository(
  prismaClient?: DuplicateAttemptCleanupPrisma
): DuplicateScreeningAttemptCleanupRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as unknown as DuplicateAttemptCleanupPrisma);
  }

  return {
    async getPreview(attemptId) {
      const prisma = await getPrisma();
      return buildDuplicateAttemptCleanupPreview(prisma, attemptId);
    },
    async deleteDuplicateAttempt(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const preview = await buildDuplicateAttemptCleanupPreview(tx, input.attemptId);

        if (!preview) {
          return { message: "El intento de screening no existe.", ok: false };
        }

        if (preview.blockers.length > 0) {
          return { message: preview.blockers[0] ?? "El intento tiene relaciones operativas.", ok: false };
        }

        if (preview.requiresFolioReleaseConfirmation && !input.releaseFolio) {
          return {
            message: "Este intento tiene folio. Confirma LIBERAR FOLIO DUPLICADO para liberar sus códigos.",
            ok: false
          };
        }

        const deletedCounts = {
          answers: 0,
          confirmation: 0,
          evidence: 0,
          referenceCodes: 0,
          review: 0,
          screeningAttempt: 0
        };

        if (preview.confirmation) {
          deletedCounts.referenceCodes = (await tx.participantReferenceCode.deleteMany?.({
            where: { confirmationId: preview.confirmation.id }
          }))?.count ?? 0;
          await tx.participantConfirmation.delete?.({
            where: { id: preview.confirmation.id }
          });
          deletedCounts.confirmation = 1;
        }

        deletedCounts.evidence = (await tx.participantEvidence.deleteMany?.({
          where: { screeningAttemptId: input.attemptId }
        }))?.count ?? 0;
        deletedCounts.review = (await tx.participantScreeningReview.deleteMany?.({
          where: { screeningAttemptId: input.attemptId }
        }))?.count ?? 0;
        deletedCounts.answers = (await tx.screeningAnswer.deleteMany?.({
          where: { screeningAttemptId: input.attemptId }
        }))?.count ?? 0;
        await tx.screeningAttempt.delete?.({
          where: { id: input.attemptId }
        });
        deletedCounts.screeningAttempt = 1;

        const recalculatedStatus = await recalculateParticipantScreeningStatus(tx, preview.participant.studyParticipantId);
        const statusChange = {
          after: {
            operationalStatus: recalculatedStatus.operationalStatus,
            screeningStatus: recalculatedStatus.screeningStatus
          },
          before: {
            operationalStatus: preview.participantOperationalContext.operationalStatus,
            screeningStatus: preview.participantOperationalContext.screeningStatus
          }
        };

        await tx.studyParticipant.update?.({
          data: statusChange.after,
          where: { id: preview.participant.studyParticipantId }
        });

        const report: DuplicateScreeningAttemptCleanupReport = {
          attemptId: input.attemptId,
          deletedAt: new Date(),
          deletedByUserId: input.actorUserId,
          deletedCounts,
          folioReleased: preview.confirmation?.folio ?? null,
          participantProfileId: preview.participant.id,
          reason: input.reason,
          statusChange,
          studyId: preview.study.id,
          studyParticipantId: preview.participant.studyParticipantId
        };

        await tx.auditLog.create?.({
          data: {
            action: "PARTICIPANT_MODIFIED",
            actorUserId: input.actorUserId,
            afterJson: toAuditJson({
              deletionType: "DUPLICATE_SCREENING_ATTEMPT",
              report,
              statusChange
            }),
            beforeJson: toAuditJson(preview),
            entityId: input.attemptId,
            entityType: "ScreeningAttempt",
            reason: input.reason
          }
        });

        return { data: report, ok: true };
      });
    }
  };
}

export async function getDuplicateScreeningAttemptCleanupPreview({
  actor,
  attemptId,
  repository
}: {
  actor: DuplicateScreeningAttemptCleanupActor | null;
  attemptId: string;
  repository: DuplicateScreeningAttemptCleanupRepository;
}): Promise<DuplicateScreeningAttemptCleanupResult<DuplicateScreeningAttemptCleanupPreview>> {
  if (!canManageDuplicateScreeningAttemptCleanup(actor)) {
    return { message: "Solo ADMIN puede revisar la limpieza de intentos duplicados.", ok: false };
  }

  const preview = await repository.getPreview(attemptId);

  if (!preview) {
    return { message: "El intento de screening no existe.", ok: false };
  }

  return { data: preview, ok: true };
}

export async function deleteDuplicateScreeningAttempt({
  actor,
  attemptId,
  confirmationText,
  reason,
  releaseFolioConfirmation,
  repository
}: {
  actor: DuplicateScreeningAttemptCleanupActor | null;
  attemptId: string;
  confirmationText: string;
  reason: string;
  releaseFolioConfirmation?: string;
  repository: DuplicateScreeningAttemptCleanupRepository;
}): Promise<DuplicateScreeningAttemptCleanupResult<DuplicateScreeningAttemptCleanupReport>> {
  if (!canManageDuplicateScreeningAttemptCleanup(actor)) {
    return { message: "Solo ADMIN puede eliminar intentos duplicados.", ok: false };
  }

  if (confirmationText.trim() !== "ELIMINAR INTENTO DUPLICADO") {
    return {
      message: "Escribe ELIMINAR INTENTO DUPLICADO para confirmar esta acción.",
      ok: false
    };
  }

  const normalizedReason = reason.trim().replace(/\s+/g, " ");

  if (!normalizedReason) {
    return { message: "Captura el motivo de eliminación.", ok: false };
  }

  return repository.deleteDuplicateAttempt({
    actorUserId: actor.id,
    attemptId,
    reason: normalizedReason,
    releaseFolio: releaseFolioConfirmation?.trim() === "LIBERAR FOLIO DUPLICADO"
  });
}

function canManageDuplicateScreeningAttemptCleanup(
  actor: DuplicateScreeningAttemptCleanupActor | null
): actor is DuplicateScreeningAttemptCleanupActor {
  return Boolean(actor && actor.role === "ADMIN" && actor.status === "ACTIVE");
}

async function buildDuplicateAttemptCleanupPreview(
  prisma: DuplicateAttemptCleanupPrisma,
  attemptId: string
): Promise<DuplicateScreeningAttemptCleanupPreview | null> {
  const attempt = (await prisma.screeningAttempt.findUnique?.({
    select: {
      completedAt: true,
      id: true,
      participantConfirmation: {
        select: {
          folio: true,
          id: true,
          referenceCodes: {
            orderBy: { slot: "asc" },
            select: { id: true, slot: true }
          }
        }
      },
      participantEvidence: {
        orderBy: { uploadedAt: "asc" },
        select: {
          id: true,
          reviewStatus: true,
          type: true,
          uploadedAt: true
        }
      },
      participantScreeningReview: {
        select: {
          id: true,
          status: true
        }
      },
      questionnaireVersion: {
        select: {
          study: {
            select: {
              code: true,
              id: true,
              name: true
            }
          }
        }
      },
      answers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          questionId: true
        }
      },
      source: true,
      startedAt: true,
      status: true,
      studyParticipant: {
        select: {
          id: true,
          operationalStatus: true,
          participantConfirmation: {
            select: {
              folio: true,
              id: true,
              screeningAttemptId: true
            }
          },
          participantProfile: {
            select: {
              email: true,
              id: true,
              name: true,
              phone: true
            }
          },
          screeningStatus: true,
          studyId: true
        }
      },
      studyParticipantId: true
    },
    where: { id: attemptId }
  })) as DuplicateCleanupAttemptRecord | null;

  if (!attempt) {
    return null;
  }

  const [
    ctlSessionsForAttempt,
    ctlSessionsForParticipant,
    navigoTokensForParticipant,
    navigoActivitiesForParticipant,
    hutParticipantsForParticipant
  ] = await Promise.all([
    count(prisma.ctlSession, { screeningAttemptId: attempt.id }),
    count(prisma.ctlSession, { studyParticipantId: attempt.studyParticipantId }),
    count(prisma.participantAccessToken, { studyParticipantId: attempt.studyParticipantId }),
    count(prisma.participantActivity, { studyParticipantId: attempt.studyParticipantId }),
    count(prisma.hutParticipant, { studyParticipantId: attempt.studyParticipantId })
  ]);

  const confirmation = attempt.participantConfirmation
    ? {
        folio: attempt.participantConfirmation.folio,
        id: attempt.participantConfirmation.id,
        referenceCodeCount: attempt.participantConfirmation.referenceCodes.length,
        referenceCodeSlots: attempt.participantConfirmation.referenceCodes.map((item) => item.slot)
      }
    : null;
  const counts = {
    answers: attempt.answers.length,
    ctlSessionsForAttempt,
    ctlSessionsForParticipant,
    evidence: attempt.participantEvidence.length,
    hutParticipantsForParticipant,
    navigoActivitiesForParticipant,
    navigoTokensForParticipant,
    referenceCodes: confirmation?.referenceCodeCount ?? 0,
    review: attempt.participantScreeningReview ? 1 : 0
  };
  const blockers = buildDuplicateAttemptCleanupBlockers({ confirmation, counts });
  const projectedStatus = await recalculateParticipantScreeningStatus(prisma, attempt.studyParticipantId, attempt.id);

  return {
    attempt: {
      completedAt: attempt.completedAt,
      id: attempt.id,
      source: attempt.source,
      startedAt: attempt.startedAt,
      status: attempt.status
    },
    blockers,
    canDelete: blockers.length === 0,
    confirmation,
    counts,
    evidence: attempt.participantEvidence,
    participant: {
      email: attempt.studyParticipant.participantProfile.email,
      id: attempt.studyParticipant.participantProfile.id,
      name: attempt.studyParticipant.participantProfile.name,
      phone: attempt.studyParticipant.participantProfile.phone,
      studyParticipantId: attempt.studyParticipant.id
    },
    participantOperationalContext: {
      activeConfirmationFolio: attempt.studyParticipant.participantConfirmation?.folio ?? null,
      operationalStatus: attempt.studyParticipant.operationalStatus,
      screeningStatus: attempt.studyParticipant.screeningStatus
    },
    projectedParticipantOperationalContext: {
      activeConfirmationFolio: projectedStatus.activeConfirmationFolio,
      operationalStatus: projectedStatus.operationalStatus,
      screeningStatus: projectedStatus.screeningStatus
    },
    requiresFolioReleaseConfirmation: Boolean(confirmation),
    review: attempt.participantScreeningReview,
    study: attempt.questionnaireVersion.study
  };
}

type ParticipantStatusProjection = {
  activeConfirmationFolio: string | null;
  operationalStatus: string;
  screeningStatus: string;
};

type RecalculateStudyParticipantRecord = {
  applicationStartedAt?: Date | null;
  accessTokens?: Array<{ id: string }>;
  activities?: Array<{ id: string; status: string }>;
  ctlSessions?: Array<{ id: string; status: string }>;
  hutParticipant?: { id: string } | null;
  participantConfirmation: {
    folio: string;
    screeningAttempt: {
      status: string;
    };
    screeningAttemptId: string;
  } | null;
  participantScreeningReviews: Array<{
    screeningAttemptId: string | null;
    status: string;
  }>;
  screeningAttempts: Array<{
    id: string;
    status: string;
  }>;
};

async function recalculateParticipantScreeningStatus(
  prisma: DuplicateAttemptCleanupPrisma,
  studyParticipantId: string,
  excludedAttemptId?: string
): Promise<ParticipantStatusProjection> {
  const screeningAttemptsSelection = excludedAttemptId
    ? {
        select: {
          id: true,
          status: true
        },
        where: { id: { not: excludedAttemptId } }
      }
    : {
        select: {
          id: true,
          status: true
        }
      };
  const participant = (await prisma.studyParticipant.findUnique?.({
    select: {
      accessTokens: {
        select: {
          id: true
        }
      },
      applicationStartedAt: true,
      activities: {
        select: {
          id: true,
          status: true
        }
      },
      ctlSessions: {
        select: {
          id: true,
          status: true
        }
      },
      hutParticipant: {
        select: {
          id: true
        }
      },
      participantConfirmation: {
        select: {
          folio: true,
          screeningAttempt: {
            select: {
              status: true
            }
          },
          screeningAttemptId: true
        }
      },
      participantScreeningReviews: {
        select: {
          screeningAttemptId: true,
          status: true
        }
      },
      screeningAttempts: screeningAttemptsSelection
    },
    where: { id: studyParticipantId }
  })) as RecalculateStudyParticipantRecord | null;

  if (!participant) {
    return {
      activeConfirmationFolio: null,
      operationalStatus: "SCREENING_STARTED",
      screeningStatus: "INCOMPLETE"
    };
  }

  const confirmation = participant.participantConfirmation;
  if (confirmation?.screeningAttempt.status === "PASSED") {
    const approvedReview = participant.participantScreeningReviews.some(
      (review) => review.screeningAttemptId === confirmation.screeningAttemptId && review.status === "APPROVED"
    );
    const hasDownstreamProgress = Boolean(
      participant.applicationStartedAt ||
        participant.ctlSessions?.length ||
        participant.accessTokens?.length ||
        participant.activities?.length ||
        participant.hutParticipant
    );

    return {
      activeConfirmationFolio: confirmation.folio,
      operationalStatus: hasDownstreamProgress && approvedReview ? "IN_PROGRESS" : "SCREENING_PASSED",
      screeningStatus: "PASSED"
    };
  }

  const statuses = participant.screeningAttempts.map((attempt) => attempt.status);
  if (statuses.includes("PASSED")) {
    return {
      activeConfirmationFolio: confirmation?.folio ?? null,
      operationalStatus: "SCREENING_PASSED",
      screeningStatus: "PASSED"
    };
  }

  if (statuses.includes("PENDING_REVIEW")) {
    return {
      activeConfirmationFolio: confirmation?.folio ?? null,
      operationalStatus: "SCREENING_STARTED",
      screeningStatus: "PENDING_REVIEW"
    };
  }

  if (statuses.includes("STARTED")) {
    return {
      activeConfirmationFolio: confirmation?.folio ?? null,
      operationalStatus: "SCREENING_STARTED",
      screeningStatus: "STARTED"
    };
  }

  if (statuses.includes("INCOMPLETE")) {
    return {
      activeConfirmationFolio: confirmation?.folio ?? null,
      operationalStatus: "SCREENING_STARTED",
      screeningStatus: "INCOMPLETE"
    };
  }

  if (statuses.includes("TERMINATED")) {
    return {
      activeConfirmationFolio: confirmation?.folio ?? null,
      operationalStatus: "SCREENING_TERMINATED",
      screeningStatus: "TERMINATED"
    };
  }

  return {
    activeConfirmationFolio: confirmation?.folio ?? null,
    operationalStatus: "SCREENING_STARTED",
    screeningStatus: "INCOMPLETE"
  };
}

function buildDuplicateAttemptCleanupBlockers({
  confirmation,
  counts
}: {
  confirmation: DuplicateScreeningAttemptCleanupPreview["confirmation"];
  counts: DuplicateScreeningAttemptCleanupPreview["counts"];
}): string[] {
  const blockers: string[] = [];

  if (counts.ctlSessionsForAttempt > 0) {
    blockers.push("No se puede eliminar porque este intento ya tiene sesión CTL asociada.");
  }

  if (confirmation && counts.navigoTokensForParticipant > 0) {
    blockers.push("No se puede eliminar porque el folio ya tiene token Navigo asociado.");
  }

  if (confirmation && counts.navigoActivitiesForParticipant > 0) {
    blockers.push("No se puede eliminar porque el folio ya tiene actividades Navigo asociadas.");
  }

  if (confirmation && counts.hutParticipantsForParticipant > 0) {
    blockers.push("No se puede eliminar porque el folio ya tiene participante HUT asociado.");
  }

  return blockers;
}

async function count(delegate: Delegate, where: Record<string, unknown>): Promise<number> {
  return (await delegate.count?.({ where })) ?? 0;
}

function toAuditJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
