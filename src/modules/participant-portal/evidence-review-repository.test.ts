import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceReviewRepository,
  type EvidenceReviewAttemptRecord
} from "./evidence-review-repository";

function buildAttempt(overrides: Partial<EvidenceReviewAttemptRecord> = {}): EvidenceReviewAttemptRecord {
  return {
    answers: [],
    id: "attempt-1",
    participantConfirmation: {
      id: "confirmation-1",
      folio: "NAV-001",
      folioSequence: 1,
      manualMessageMarkedSentAt: new Date("2026-06-24T10:00:00Z"),
      manualMessageStatus: "MARKED_SENT",
      referenceCodes: [
        { code: "4821", slot: 1 },
        { code: "7710", slot: 2 },
        { code: "9034", slot: 3 }
      ]
    },
    participantEvidence: [
      {
        extension: "jpg",
        id: "evidence-1",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        privateStorageKey:
          "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie_identification/selfie.jpg",
        relatedQuestionId: null,
        reviewStatus: "APPROVED",
        sizeBytes: 100,
        storageBucket: "participant-evidence",
        type: "SELFIE_IDENTIFICATION",
        uploadedAt: new Date("2026-06-24T10:00:00Z")
      }
    ],
    participantScreeningReview: {
      id: "review-1",
      internalNote: null,
      rejectionReason: null,
      status: "APPROVED"
    },
    questionnaireVersion: {
      study: {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Fragancia Masculina",
        participantPortalConfig: {
          folioMaxSequence: 999,
          folioPrefix: "NAV",
          maxImageBytes: 8388608,
          maxPerfumePhotos: 5,
          minPerfumePhotos: 1,
          nextFolioSequence: 2
        }
      }
    },
    source: "PARTICIPANT_PORTAL",
    status: "PASSED",
    studyParticipant: {
      id: "study-participant-1",
      participantProfile: {
        email: "persona@example.com",
        externalReference: "REF-1",
        id: "profile-1",
        name: "Gabriela",
        participantAuthUserId: "auth-user-1",
        phone: "+525512345678"
      }
    },
    studyParticipantId: "study-participant-1",
    ...overrides
  };
}

function createDeleteContext(options?: {
  applicationTimeEvents?: Array<{ id: string }>;
  attempts?: Array<{ id: string }>;
  evidence?: Array<{ id: string }>;
  folioSequences?: Array<{ folioSequence: number }>;
  internalUser?: { id: string } | null;
  participantArmAssignments?: Array<{ id: string }>;
  participantAttributeOrders?: Array<{ id: string }>;
  participantRotationAssignments?: Array<{ id: string }>;
  participantActivities?: Array<{ id: string }>;
  profileParticipations?: Array<{ id: string }>;
  quotaEvaluations?: Array<{ id: string }>;
}) {
  const ctx = {
    applicationTimeEvent: {
      findMany: vi.fn(async () => options?.applicationTimeEvents ?? [])
    },
    internalUser: {
      findFirst: vi.fn(async () => options?.internalUser ?? null)
    },
    participantAccessToken: {
      deleteMany: vi.fn(async () => ({ count: 1 }))
    },
    participantActivity: {
      findMany: vi.fn(async () => options?.participantActivities ?? [])
    },
    participantArmAssignment: {
      findMany: vi.fn(async () => options?.participantArmAssignments ?? [])
    },
    participantAttributeOrder: {
      findMany: vi.fn(async () => options?.participantAttributeOrders ?? [])
    },
    participantConfirmation: {
      create: vi.fn(),
      delete: vi.fn(async () => ({})),
      findMany: vi.fn(async () => options?.folioSequences ?? []),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    participantConsent: {
      deleteMany: vi.fn(async () => ({ count: 1 }))
    },
    participantEvidence: {
      create: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => options?.evidence ?? []),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    participantPortalStudyConfig: {
      update: vi.fn(async () => ({}))
    },
    participantProfile: {
      delete: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({
        id: "profile-1",
        participantAuthUserId: "auth-user-1",
        participations: options?.profileParticipations ?? []
      })),
      update: vi.fn()
    },
    participantReferenceCode: {
      deleteMany: vi.fn(async () => ({ count: 3 })),
      findMany: vi.fn(async () => [])
    },
    participantRotationAssignment: {
      findMany: vi.fn(async () => options?.participantRotationAssignments ?? [])
    },
    participantScreeningReview: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(),
      upsert: vi.fn()
    },
    quotaEvaluation: {
      findMany: vi.fn(async () => options?.quotaEvaluations ?? [])
    },
    screeningAnswer: {
      deleteMany: vi.fn(async () => ({ count: 1 }))
    },
    screeningAttempt: {
      delete: vi.fn(async () => ({})),
      findMany: vi.fn(async () => options?.attempts ?? []),
      findUnique: vi.fn(async () => buildAttempt()),
      update: vi.fn()
    },
    studyParticipant: {
      delete: vi.fn(async () => ({})),
      update: vi.fn()
    }
  };

  return ctx;
}

function createRepositoryWithContext(context: ReturnType<typeof createDeleteContext>) {
  const prisma = {
    $transaction: async <T>(callback: (tx: typeof context) => Promise<T>) => callback(context),
    screeningAttempt: {
      findUnique: vi.fn()
    }
  };

  return createEvidenceReviewRepository(prisma as never);
}

describe("participant evidence review repository cleanup", () => {
  it("deletes an approved test record with folio, codes and WhatsApp marked sent", async () => {
    const context = createDeleteContext({
      folioSequences: []
    });
    const repository = createRepositoryWithContext(context);

    const result = await repository.deleteTestRecord({
      attemptId: "attempt-1",
      deletedByUserId: "admin-1",
      reason: "PRUEBA"
    });

    expect(result).toMatchObject({
      ok: true,
      studyId: "study-1"
    });
    expect(context.participantReferenceCode.deleteMany).toHaveBeenCalled();
    expect(context.participantConfirmation.delete).toHaveBeenCalled();
    expect(context.participantPortalStudyConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextFolioSequence: 1
        })
      })
    );
  });

  it("deletes a rejected test record too", async () => {
    const context = createDeleteContext();
    context.screeningAttempt.findUnique = vi.fn(async () =>
      buildAttempt({
        participantScreeningReview: {
          id: "review-1",
          internalNote: null,
          rejectionReason: "No coincide",
          status: "REJECTED"
        },
        status: "TERMINATED"
      })
    );
    const repository = createRepositoryWithContext(context);

    const result = await repository.deleteTestRecord({
      attemptId: "attempt-1",
      deletedByUserId: "admin-1",
      reason: "PRUEBA"
    });

    expect(result.ok).toBe(true);
    expect(context.participantScreeningReview.deleteMany).toHaveBeenCalled();
  });

  it("blocks deletion when the participant belongs to another study", async () => {
    const context = createDeleteContext({
      profileParticipations: [{ id: "study-participant-1" }, { id: "study-participant-2" }]
    });
    const repository = createRepositoryWithContext(context);

    const result = await repository.deleteTestRecord({
      attemptId: "attempt-1",
      deletedByUserId: "admin-1",
      reason: "PRUEBA"
    });

    expect(result).toEqual({
      message: "No se puede eliminar porque el participante está asociado a otro estudio.",
      ok: false
    });
  });

  it("deletes the test attempt and preserves the profile when it is linked to an internal user", async () => {
    const context = createDeleteContext({
      internalUser: { id: "internal-1" }
    });
    const repository = createRepositoryWithContext(context);

    const result = await repository.deleteTestRecord({
      attemptId: "attempt-1",
      deletedByUserId: "admin-1",
      reason: "PRUEBA"
    });

    expect(result).toMatchObject({
      ok: true,
      preservedInternalProfile: true
    });
    expect(context.participantProfile.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion with a specific unsupported relation name", async () => {
    const context = createDeleteContext({
      applicationTimeEvents: [{ id: "event-1" }]
    });
    const repository = createRepositoryWithContext(context);

    const result = await repository.deleteTestRecord({
      attemptId: "attempt-1",
      deletedByUserId: "admin-1",
      reason: "PRUEBA"
    });

    expect(result).toEqual({
      message:
        "No se puede eliminar porque existen relaciones no soportadas: application_time_events.",
      ok: false
    });
  });
});
