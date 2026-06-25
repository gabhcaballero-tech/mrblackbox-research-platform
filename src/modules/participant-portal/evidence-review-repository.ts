import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type { PortalEvidenceRecord } from "./evidence-repository";
import {
  isParticipantReferenceCode,
  normalizeParticipantReferenceCode,
  type ParticipantReferenceCodeDraft
} from "./review";

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
  id?: string;
  folio: string;
  folioSequence: number;
  manualMessageMarkedSentAt: Date | null;
  manualMessageStatus: "MARKED_SENT" | "NOT_SENT";
  referenceCodes: ParticipantReferenceCodeDraft[];
};

export type EvidenceReviewCleanupAttemptRecord = {
  id: string;
  participantConfirmation: EvidenceReviewConfirmationRecord | null;
  participantEvidence: PortalEvidenceRecord[];
  source: "FIELD" | "PARTICIPANT_PORTAL";
  status: EvidenceReviewAttemptStatus;
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
      externalReference: string | null;
      id: string;
      name: string;
      participantAuthUserId: string | null;
      phone: string | null;
    };
    screeningAttempts?: EvidenceReviewCleanupAttemptRecord[];
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
  deleteTestRecord: (input: {
    attemptId: string;
    deletedByUserId: string;
    reason: string;
  }) => Promise<EvidenceReviewDeleteResult>;
  deleteStudyParticipantTestRecords: (input: {
    attemptId: string;
    deletedByUserId: string;
    reason: string;
  }) => Promise<EvidenceReviewDeleteResult>;
  rejectEvidence: (input: {
    attemptId: string;
    internalNote?: string | null;
    rejectionReason: string;
    reviewedByUserId: string;
    now?: Date;
  }) => Promise<void>;
  regenerateReferenceCodes: (input: {
    attemptId: string;
    codeGenerator: () => string;
    regeneratedByUserId: string;
  }) => Promise<EvidenceReviewRegenerateCodesResult>;
  replaceEvidence: (input: ReplaceParticipantEvidenceInput) => Promise<EvidenceReviewReplacementResult>;
  updateParticipantProfile: (input: {
    attemptId: string;
    email: string | null;
    externalReference: string | null;
    name: string;
    phone: string | null;
    updatedByUserId: string;
  }) => Promise<EvidenceReviewUpdateParticipantResult>;
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

export type EvidenceReviewRegenerateCodesResult =
  | {
      confirmation: EvidenceReviewConfirmationRecord;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type EvidenceReviewUpdateParticipantResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type EvidenceReviewDeleteResult =
  | {
      evidenceToDelete: Array<{ bucket: string; privateStorageKey: string }>;
      preservedInternalProfile: boolean;
      ok: true;
      studyId: string;
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
  participantAccessToken: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  participantConfirmation: {
    create: (args: unknown) => Promise<EvidenceReviewConfirmationRecord>;
    delete: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<{ folioSequence: number }>>;
    findUnique: (args: unknown) => Promise<EvidenceReviewConfirmationRecord | null>;
    update: (args: unknown) => Promise<EvidenceReviewConfirmationRecord>;
  };
  participantEvidence: {
    create: (args: unknown) => Promise<PortalEvidenceRecord>;
    deleteMany: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    update: (args: unknown) => Promise<PortalEvidenceRecord>;
    updateMany: (args: unknown) => Promise<unknown>;
  };
  participantActivityEvidence: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  participantConsent: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  participantProfile: {
    delete: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<{
      id: string;
      participantAuthUserId: string | null;
      participations: Array<{ id: string }>;
    } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  internalUser: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  };
  participantPortalStudyConfig: {
    update: (args: unknown) => Promise<unknown>;
  };
  participantReferenceCode: {
    deleteMany: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<{ code: string }>>;
  };
  participantScreeningReview: {
    deleteMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<EvidenceReviewRecord>;
    update: (args: unknown) => Promise<EvidenceReviewRecord>;
  };
  screeningAnswer: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  screeningAttempt: {
    delete: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<EvidenceReviewAttemptRecord | null>;
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    update: (args: unknown) => Promise<unknown>;
  };
  studyParticipant: {
    delete: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  applicationTimeEvent: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  participantActivity: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  participantArmAssignment: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  participantAttributeOrder: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  participantRotationAssignment: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  quotaEvaluation: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
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
  id: true,
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
          externalReference: true,
          id: true,
          name: true,
          participantAuthUserId: true,
          phone: true
        }
      },
      screeningAttempts: {
        orderBy: {
          startedAt: "asc"
        },
        select: {
          id: true,
          participantConfirmation: {
            select: confirmationSelect
          },
          participantEvidence: {
            orderBy: { uploadedAt: "asc" },
            select: evidenceSelect
          },
          source: true,
          status: true
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
          const now = input.now ?? new Date();

          await tx.participantScreeningReview.upsert({
            create: {
              reviewedAt: now,
              reviewedByUserId: input.approvedByUserId,
              screeningAttemptId: attempt.id,
              status: "APPROVED",
              studyParticipantId: attempt.studyParticipantId
            },
            update: {
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
          await tx.screeningAttempt.update({
            data: {
              completedAt: now,
              status: "PASSED"
            },
            where: {
              id: attempt.id
            }
          });
          await tx.studyParticipant.update({
            data: {
              operationalStatus: "SCREENING_PASSED",
              screeningStatus: "PASSED"
            },
            where: {
              id: attempt.studyParticipantId
            }
          });

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

        const usedFolioSequences = await listUsedFolioSequences(tx, attempt.questionnaireVersion.study.id);
        const folioSequence = findFirstAvailableFolioSequence(usedFolioSequences, config.folioMaxSequence);

        if (folioSequence > config.folioMaxSequence) {
          return {
            message: "Se agotó la secuencia de folios configurada para este estudio.",
            ok: false
          };
        }

        const codes = await generateUniqueCodes(tx, input.codeGenerator);
        const folio = `${config.folioPrefix}-${String(folioSequence).padStart(3, "0")}`;
        const nextFolioSequence = findFirstAvailableFolioSequence(
          [...usedFolioSequences, folioSequence],
          config.folioMaxSequence
        );
        const now = input.now ?? new Date();

        await tx.participantPortalStudyConfig.update({
          data: {
            nextFolioSequence
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
        await tx.screeningAttempt.update({
          data: {
            completedAt: now,
            status: "PASSED"
          },
          where: {
            id: attempt.id
          }
        });
        await tx.studyParticipant.update({
          data: {
            operationalStatus: "SCREENING_PASSED",
            screeningStatus: "PASSED"
          },
          where: {
            id: attempt.studyParticipantId
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
    async deleteTestRecord(input) {
      const prisma = await getPrisma();

      try {
        return await prisma.$transaction(async (tx) => {
          const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

          if (!attempt) {
            return { message: "El intento no existe.", ok: false };
          }

          const participantProfileId = attempt.studyParticipant.participantProfile.id;
          const studyParticipantId = attempt.studyParticipantId;
          const studyId = attempt.questionnaireVersion.study.id;
          const blockers = await diagnoseDeleteTestRecordBlockers(tx, {
            attemptId: attempt.id,
            participantProfileId,
            studyParticipantId
          });

          if (blockers.length > 0) {
            logDeleteTestRecordIssue("blocked", input.attemptId, blockers[0]);
            return {
              message: blockers[0],
              ok: false
            };
          }

          const evidenceToDelete = attempt.participantEvidence
            .filter((item) =>
              storageKeyBelongsToAttempt({
                attemptId: attempt.id,
                participantProfileId,
                privateStorageKey: item.privateStorageKey,
                studyId
              })
            )
            .map((item) => ({
              bucket: item.storageBucket,
              privateStorageKey: item.privateStorageKey
            }));

          if (attempt.participantConfirmation?.id) {
            await tx.participantReferenceCode.deleteMany({
              where: {
                confirmationId: attempt.participantConfirmation.id
              }
            });
            await tx.participantConfirmation.delete({
              where: {
                screeningAttemptId: attempt.id
              }
            });
          }

          await tx.participantEvidence.deleteMany({
            where: {
              screeningAttemptId: attempt.id
            }
          });
          await tx.participantScreeningReview.deleteMany({
            where: {
              screeningAttemptId: attempt.id
            }
          });
          await tx.screeningAnswer.deleteMany({
            where: {
              screeningAttemptId: attempt.id
            }
          });
          await tx.screeningAttempt.delete({
            where: {
              id: attempt.id
            }
          });
          await tx.participantConsent.deleteMany({
            where: {
              studyParticipantId
            }
          });
          await tx.participantAccessToken.deleteMany({
            where: {
              studyParticipantId
            }
          });
          await tx.studyParticipant.delete({
            where: {
              id: studyParticipantId
            }
          });

          const profile = await tx.participantProfile.findUnique({
            select: {
              id: true,
              participantAuthUserId: true,
              participations: {
                select: {
                  id: true
                }
              }
            },
            where: {
              id: participantProfileId
            }
          });

          const preservedInternalProfile = Boolean(profile?.participantAuthUserId);

          if (profile && !profile.participantAuthUserId && profile.participations.length === 0) {
            await tx.participantProfile.delete({
              where: {
                id: participantProfileId
              }
            });
          }

          const config = attempt.questionnaireVersion.study.participantPortalConfig;

          if (config) {
            const usedFolioSequences = await listUsedFolioSequences(tx, studyId);
            await tx.participantPortalStudyConfig.update({
              data: {
                nextFolioSequence: findFirstAvailableFolioSequence(usedFolioSequences, config.folioMaxSequence)
              },
              where: {
                studyId
              }
            });
          }

          void input.deletedByUserId;
          void input.reason;

          return {
            evidenceToDelete,
            preservedInternalProfile,
            ok: true,
            studyId
          };
        });
      } catch (error) {
        logDeleteTestRecordIssue("failed", input.attemptId, buildDeleteTestRecordFailureMessage(error), error);
        return {
          message: buildDeleteTestRecordFailureMessage(error),
          ok: false
        };
      }
    },
    async deleteStudyParticipantTestRecords(input) {
      const prisma = await getPrisma();

      try {
        return await prisma.$transaction(async (tx) => {
          const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

          if (!attempt) {
            return { message: "El intento no existe.", ok: false };
          }

          const participantProfileId = attempt.studyParticipant.participantProfile.id;
          const studyParticipantId = attempt.studyParticipantId;
          const studyId = attempt.questionnaireVersion.study.id;
          const attempts = getStudyParticipantCleanupAttempts(attempt);
          const attemptIds = attempts.map((item) => item.id);
          const blockers = await diagnoseDeleteStudyParticipantTestRecordBlockers(tx, {
            attemptIds,
            studyParticipantId
          });

          if (blockers.length > 0) {
            logDeleteTestRecordIssue("blocked", input.attemptId, blockers[0]);
            return {
              message: blockers[0],
              ok: false
            };
          }

          const evidenceToDelete = attempts.flatMap((cleanupAttempt) =>
            cleanupAttempt.participantEvidence
              .filter((item) =>
                storageKeyBelongsToAttempt({
                  attemptId: cleanupAttempt.id,
                  participantProfileId,
                  privateStorageKey: item.privateStorageKey,
                  studyId
                })
              )
              .map((item) => ({
                bucket: item.storageBucket,
                privateStorageKey: item.privateStorageKey
              }))
          );
          const confirmationIds = attempts
            .map((cleanupAttempt) => cleanupAttempt.participantConfirmation?.id)
            .filter((id): id is string => Boolean(id));

          if (confirmationIds.length > 0) {
            await tx.participantReferenceCode.deleteMany({
              where: {
                confirmationId: {
                  in: confirmationIds
                }
              }
            });
            await tx.participantConfirmation.deleteMany({
              where: {
                id: {
                  in: confirmationIds
                }
              }
            });
          }

          await tx.participantEvidence.deleteMany({
            where: {
              screeningAttemptId: {
                in: attemptIds
              }
            }
          });
          await tx.participantScreeningReview.deleteMany({
            where: {
              screeningAttemptId: {
                in: attemptIds
              }
            }
          });
          await tx.screeningAnswer.deleteMany({
            where: {
              screeningAttemptId: {
                in: attemptIds
              }
            }
          });
          await tx.screeningAttempt.deleteMany({
            where: {
              id: {
                in: attemptIds
              }
            }
          });
          await tx.participantConsent.deleteMany({
            where: {
              studyParticipantId
            }
          });
          await tx.participantAccessToken.deleteMany({
            where: {
              studyParticipantId
            }
          });
          await tx.studyParticipant.delete({
            where: {
              id: studyParticipantId
            }
          });

          const profile = await tx.participantProfile.findUnique({
            select: {
              id: true,
              participantAuthUserId: true,
              participations: {
                select: {
                  id: true
                }
              }
            },
            where: {
              id: participantProfileId
            }
          });

          const preservedInternalProfile = Boolean(profile?.participantAuthUserId);

          if (profile && !profile.participantAuthUserId && profile.participations.length === 0) {
            await tx.participantProfile.delete({
              where: {
                id: participantProfileId
              }
            });
          }

          const config = attempt.questionnaireVersion.study.participantPortalConfig;

          if (config) {
            const usedFolioSequences = await listUsedFolioSequences(tx, studyId);
            await tx.participantPortalStudyConfig.update({
              data: {
                nextFolioSequence: findFirstAvailableFolioSequence(usedFolioSequences, config.folioMaxSequence)
              },
              where: {
                studyId
              }
            });
          }

          void input.deletedByUserId;
          void input.reason;

          return {
            evidenceToDelete,
            preservedInternalProfile,
            ok: true,
            studyId
          };
        });
      } catch (error) {
        logDeleteTestRecordIssue("failed", input.attemptId, buildDeleteTestRecordFailureMessage(error), error);
        return {
          message: buildDeleteTestRecordFailureMessage(error),
          ok: false
        };
      }
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
    async regenerateReferenceCodes(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

        if (!attempt) {
          return { message: "El intento no existe.", ok: false };
        }

        if (!attempt.participantConfirmation) {
          return { message: "No existe una confirmaciÃ³n para regenerar cÃ³digos.", ok: false };
        }

        if (!attempt.participantConfirmation.id) {
          return { message: "La confirmaciÃ³n no tiene identificador para regenerar cÃ³digos.", ok: false };
        }

        if (attempt.participantConfirmation.manualMessageStatus === "MARKED_SENT") {
          return {
            message: "No se pueden regenerar cÃ³digos porque el mensaje ya fue marcado como enviado.",
            ok: false
          };
        }

        const codes = await generateUniqueCodes(tx, input.codeGenerator);
        await tx.participantReferenceCode.deleteMany({
          where: {
            confirmationId: attempt.participantConfirmation.id
          }
        });
        const confirmation = await tx.participantConfirmation.update({
          data: {
            referenceCodes: {
              create: codes
            }
          },
          select: confirmationSelect,
          where: {
            screeningAttemptId: attempt.id
          }
        });

        void input.regeneratedByUserId;

        return {
          confirmation,
          ok: true
        };
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
    },
    async updateParticipantProfile(input) {
      const prisma = await getPrisma();

      return prisma.$transaction(async (tx) => {
        const attempt = await getAttemptReviewWithClient(tx, input.attemptId);

        if (!attempt) {
          return { message: "El intento no existe.", ok: false };
        }

        await tx.participantProfile.update({
          data: {
            email: input.email,
            externalReference: input.externalReference,
            name: input.name,
            phone: input.phone
          },
          where: {
            id: attempt.studyParticipant.participantProfile.id
          }
        });

        void input.updatedByUserId;

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

async function listUsedFolioSequences(
  tx: EvidenceReviewTransactionClient,
  studyId: string
): Promise<number[]> {
  const confirmations = await tx.participantConfirmation.findMany({
    select: {
      folioSequence: true
    },
    where: {
      studyId
    }
  });

  return confirmations.map((item) => item.folioSequence);
}

async function diagnoseDeleteTestRecordBlockers(
  tx: EvidenceReviewTransactionClient,
  input: {
    attemptId: string;
    participantProfileId: string;
    studyParticipantId: string;
  }
): Promise<string[]> {
  const blockers: string[] = [];

  const unsupportedRelations = await findUnsupportedDeleteRelations(tx, input);

  if (unsupportedRelations.length > 0) {
    blockers.push(
      `No se puede eliminar porque existen relaciones no soportadas: ${unsupportedRelations.join(", ")}.`
    );
  }

  return blockers;
}

async function diagnoseDeleteStudyParticipantTestRecordBlockers(
  tx: EvidenceReviewTransactionClient,
  input: {
    attemptIds: string[];
    studyParticipantId: string;
  }
): Promise<string[]> {
  const blockers: string[] = [];
  const unsupportedRelations = await findUnsupportedDeleteRelations(tx, {
    attemptIds: input.attemptIds,
    blockAdditionalAttempts: false,
    studyParticipantId: input.studyParticipantId
  });

  if (unsupportedRelations.length > 0) {
    blockers.push(
      `No se puede eliminar porque existen relaciones no soportadas: ${unsupportedRelations.join(", ")}.`
    );
  }

  return blockers;
}

async function findUnsupportedDeleteRelations(
  tx: EvidenceReviewTransactionClient,
  input: {
    attemptId?: string;
    attemptIds?: string[];
    blockAdditionalAttempts?: boolean;
    studyParticipantId: string;
  }
): Promise<string[]> {
  const attemptIds = input.attemptIds ?? (input.attemptId ? [input.attemptId] : []);
  const attemptFilter =
    attemptIds.length > 0
      ? {
          notIn: attemptIds
        }
      : undefined;
  const additionalAttempts = await tx.screeningAttempt.findMany({
    select: {
      id: true
    },
    where: {
      ...(attemptFilter ? { id: attemptFilter } : {}),
      studyParticipantId: input.studyParticipantId
    }
  });
  const additionalEvidence = await tx.participantEvidence.findMany({
    select: {
      id: true
    },
    where: {
      ...(attemptFilter ? { screeningAttemptId: attemptFilter } : {}),
      studyParticipantId: input.studyParticipantId
    }
  });
  const applicationTimeEvents = await tx.applicationTimeEvent.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const quotaEvaluations = await tx.quotaEvaluation.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const rotationAssignments = await tx.participantRotationAssignment.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const armAssignments = await tx.participantArmAssignment.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const activities = await tx.participantActivity.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const activityEvidence = await tx.participantActivityEvidence.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });
  const attributeOrders = await tx.participantAttributeOrder.findMany({
    select: {
      id: true
    },
    where: {
      studyParticipantId: input.studyParticipantId
    }
  });

  const relations: string[] = [];

  if (input.blockAdditionalAttempts !== false && additionalAttempts.length > 0) {
    relations.push("otros intentos del mismo participante en este estudio");
  }

  if (additionalEvidence.length > 0) {
    relations.push("participant_evidence adicional");
  }

  if (applicationTimeEvents.length > 0) {
    relations.push("application_time_events");
  }

  if (quotaEvaluations.length > 0) {
    relations.push("quota_evaluations");
  }

  if (rotationAssignments.length > 0) {
    relations.push("participant_rotation_assignments");
  }

  if (armAssignments.length > 0) {
    relations.push("participant_arm_assignments");
  }

  if (activities.length > 0) {
    relations.push("participant_activities");
  }

  if (activityEvidence.length > 0) {
    relations.push("participant_activity_evidence");
  }

  if (attributeOrders.length > 0) {
    relations.push("participant_attribute_orders");
  }

  return relations;
}

export function findFirstAvailableFolioSequence(usedSequences: number[], folioMaxSequence: number): number {
  const used = new Set(usedSequences.filter((value) => Number.isInteger(value) && value >= 1));

  for (let sequence = 1; sequence <= folioMaxSequence; sequence += 1) {
    if (!used.has(sequence)) {
      return sequence;
    }
  }

  return folioMaxSequence + 1;
}

function getStudyParticipantCleanupAttempts(
  attempt: EvidenceReviewAttemptRecord
): EvidenceReviewCleanupAttemptRecord[] {
  const relatedAttempts = attempt.studyParticipant.screeningAttempts ?? [];

  if (relatedAttempts.length > 0) {
    return relatedAttempts;
  }

  return [
    {
      id: attempt.id,
      participantConfirmation: attempt.participantConfirmation,
      participantEvidence: attempt.participantEvidence,
      source: attempt.source,
      status: attempt.status
    }
  ];
}

function storageKeyBelongsToAttempt({
  attemptId,
  participantProfileId,
  privateStorageKey,
  studyId
}: {
  attemptId: string;
  participantProfileId: string;
  privateStorageKey: string;
  studyId: string;
}): boolean {
  const expectedPrefix = [
    "studies",
    studyId,
    "participants",
    participantProfileId,
    "screening-attempts",
    attemptId,
    ""
  ].join("/");

  return privateStorageKey.startsWith(expectedPrefix);
}

function buildDeleteTestRecordFailureMessage(error: unknown): string {
  const fieldName = readSafeMetaFieldName(error);

  if (fieldName) {
    return `No se puede eliminar porque existen relaciones no soportadas: ${fieldName}.`;
  }

  return "No se puede eliminar porque existen relaciones no soportadas que impiden limpiar este registro de prueba.";
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

    const code = normalizeParticipantReferenceCode(codeGenerator());

    if (!isParticipantReferenceCode(code) || generated.has(code)) {
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

function readSafeMetaFieldName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return null;
  }

  const meta = (error as { meta?: unknown }).meta;

  if (typeof meta !== "object" || meta === null || !("field_name" in meta)) {
    return null;
  }

  const fieldName = (meta as { field_name?: unknown }).field_name;
  return typeof fieldName === "string" && fieldName.trim().length > 0 ? fieldName.trim() : null;
}

function logDeleteTestRecordIssue(
  step: "blocked" | "failed",
  attemptId: string,
  message: string,
  error?: unknown
): void {
  console.warn("[participant-test-record-delete]", {
    attemptId,
    code: readSafeErrorCode(error),
    message,
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

  return "none";
}
