import { describe, expect, it, vi } from "vitest";
import {
  createDuplicateScreeningAttemptCleanupRepository,
  deleteDuplicateScreeningAttempt,
  getDuplicateScreeningAttemptCleanupPreview,
  type DuplicateScreeningAttemptCleanupActor
} from "./duplicate-attempt-cleanup";

const admin: DuplicateScreeningAttemptCleanupActor = {
  id: "admin-1",
  role: "ADMIN",
  status: "ACTIVE"
};

describe("duplicate screening attempt cleanup", () => {
  it("builds a preview and blocks attempts with CTL sessions linked to the attempt", async () => {
    const prisma = prismaStub({ counts: { ctlSession: 1 } });
    const repository = createDuplicateScreeningAttemptCleanupRepository(prisma as never);

    const result = await getDuplicateScreeningAttemptCleanupPreview({
      actor: admin,
      attemptId: "attempt-1",
      repository
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.canDelete : false).toBe(false);
    expect(result.ok ? result.data.blockers : []).toContain(
      "No se puede eliminar porque este intento ya tiene sesión CTL asociada."
    );
  });

  it("deletes only direct duplicate attempt relations and writes audit log", async () => {
    const prisma = prismaStub();
    const repository = createDuplicateScreeningAttemptCleanupRepository(prisma as never);

    const result = await deleteDuplicateScreeningAttempt({
      actor: admin,
      attemptId: "attempt-1",
      confirmationText: "ELIMINAR INTENTO DUPLICADO",
      reason: "Intento repetido por perdida de conexion",
      repository
    });

    expect(result.ok).toBe(true);
    expect(prisma.participantEvidence.deleteMany).toHaveBeenCalledWith({
      where: { screeningAttemptId: "attempt-1" }
    });
    expect(prisma.participantScreeningReview.deleteMany).toHaveBeenCalledWith({
      where: { screeningAttemptId: "attempt-1" }
    });
    expect(prisma.screeningAnswer.deleteMany).toHaveBeenCalledWith({
      where: { screeningAttemptId: "attempt-1" }
    });
    expect(prisma.screeningAttempt.delete).toHaveBeenCalledWith({
      where: { id: "attempt-1" }
    });
    expect((prisma as Record<string, unknown>).studyParticipant).toBeUndefined();
    expect((prisma as Record<string, unknown>).participantProfile).toBeUndefined();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PARTICIPANT_MODIFIED",
          actorUserId: "admin-1",
          entityId: "attempt-1",
          entityType: "ScreeningAttempt",
          reason: "Intento repetido por perdida de conexion"
        })
      })
    );
  });

  it("requires explicit folio release confirmation before deleting an attempt with confirmation", async () => {
    const prisma = prismaStub({ withConfirmation: true });
    const repository = createDuplicateScreeningAttemptCleanupRepository(prisma as never);

    const blocked = await deleteDuplicateScreeningAttempt({
      actor: admin,
      attemptId: "attempt-1",
      confirmationText: "ELIMINAR INTENTO DUPLICADO",
      reason: "Folio duplicado fallido",
      repository
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toContain("Confirma LIBERAR FOLIO DUPLICADO");

    const deleted = await deleteDuplicateScreeningAttempt({
      actor: admin,
      attemptId: "attempt-1",
      confirmationText: "ELIMINAR INTENTO DUPLICADO",
      reason: "Folio duplicado fallido",
      releaseFolioConfirmation: "LIBERAR FOLIO DUPLICADO",
      repository
    });

    expect(deleted.ok).toBe(true);
    expect(prisma.participantReferenceCode.deleteMany).toHaveBeenCalledWith({
      where: { confirmationId: "confirmation-1" }
    });
    expect(prisma.participantConfirmation.delete).toHaveBeenCalledWith({
      where: { id: "confirmation-1" }
    });
    expect(deleted.ok ? deleted.data.folioReleased : null).toBe("NAV-041");
  });

  it("blocks confirmed attempts that already have Navigo or HUT downstream", async () => {
    const prisma = prismaStub({
      counts: {
        hutParticipant: 1,
        participantAccessToken: 1,
        participantActivity: 1
      },
      withConfirmation: true
    });
    const repository = createDuplicateScreeningAttemptCleanupRepository(prisma as never);

    const result = await deleteDuplicateScreeningAttempt({
      actor: admin,
      attemptId: "attempt-1",
      confirmationText: "ELIMINAR INTENTO DUPLICADO",
      reason: "No debe borrar downstream",
      releaseFolioConfirmation: "LIBERAR FOLIO DUPLICADO",
      repository
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("token Navigo");
    expect(prisma.screeningAttempt.delete).not.toHaveBeenCalled();
  });
});

function prismaStub({
  counts = {},
  withConfirmation = false
}: {
  counts?: Partial<Record<"ctlSession" | "hutParticipant" | "participantAccessToken" | "participantActivity", number>>;
  withConfirmation?: boolean;
} = {}) {
  const attempt = {
    answers: [
      {
        id: "answer-1",
        questionId: "F1"
      }
    ],
    completedAt: null,
    id: "attempt-1",
    participantConfirmation: withConfirmation
      ? {
          folio: "NAV-041",
          id: "confirmation-1",
          referenceCodes: [
            { id: "code-1", slot: 1 },
            { id: "code-2", slot: 2 },
            { id: "code-3", slot: 3 }
          ]
        }
      : null,
    participantEvidence: [
      {
        id: "evidence-1",
        reviewStatus: "PENDING",
        type: "PERFUME_PHOTO",
        uploadedAt: new Date("2026-08-08T06:00:00Z")
      }
    ],
    participantScreeningReview: {
      id: "review-1",
      status: "PENDING"
    },
    questionnaireVersion: {
      study: {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Navigo"
      }
    },
    source: "FIELD",
    startedAt: new Date("2026-08-08T05:00:00Z"),
    status: withConfirmation ? "PASSED" : "INCOMPLETE",
    studyParticipant: {
      id: "study-participant-1",
      operationalStatus: "SCREENING_STARTED",
      participantConfirmation: withConfirmation
        ? {
            folio: "NAV-041",
            id: "confirmation-1",
            screeningAttemptId: "attempt-1"
          }
        : null,
      participantProfile: {
        email: "participante@example.com",
        id: "profile-1",
        name: "Participante Uno",
        phone: "5550000000"
      },
      screeningStatus: "INCOMPLETE",
      studyId: "study-1"
    },
    studyParticipantId: "study-participant-1"
  };

  const delegate = (countValue = 0) => ({
    count: vi.fn(async () => countValue),
    create: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async () => null)
  });

  const prisma = {
    $transaction: vi.fn(async (callback) => callback(prisma)),
    auditLog: delegate(),
    ctlSession: delegate(counts.ctlSession ?? 0),
    hutParticipant: delegate(counts.hutParticipant ?? 0),
    participantAccessToken: delegate(counts.participantAccessToken ?? 0),
    participantActivity: delegate(counts.participantActivity ?? 0),
    participantConfirmation: delegate(),
    participantEvidence: delegate(),
    participantReferenceCode: delegate(),
    participantScreeningReview: delegate(),
    screeningAnswer: delegate(),
    screeningAttempt: {
      ...delegate(),
      findUnique: vi.fn(async () => attempt)
    }
  };

  return prisma;
}
