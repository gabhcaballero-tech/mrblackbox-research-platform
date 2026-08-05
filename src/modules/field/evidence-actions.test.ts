import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeFieldEvidenceSubmission: vi.fn(),
  getFieldScreeningReviewReadiness: vi.fn(),
  repository: {
    getAttempt: vi.fn()
  },
  sendNavigoConfirmationWhatsAppBestEffort: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/modules/participant-portal/navigo-confirmation-whatsapp", () => ({
  sendNavigoConfirmationWhatsAppBestEffort: mocks.sendNavigoConfirmationWhatsAppBestEffort
}));

vi.mock("./auth", () => ({
  getFieldActorForRequest: vi.fn(async () => ({
    id: "PUBLIC_FIELD",
    role: "INTERVIEWER",
    status: "ACTIVE"
  }))
}));

vi.mock("./repository", () => ({
  createFieldRepository: vi.fn(() => mocks.repository)
}));

vi.mock("./service", () => ({
  completeFieldEvidenceSubmission: mocks.completeFieldEvidenceSubmission,
  getFieldScreeningReviewReadiness: mocks.getFieldScreeningReviewReadiness,
  requestFieldEvidenceUpload: vi.fn(),
  confirmFieldEvidenceUpload: vi.fn()
}));

describe("field evidence actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends Navigo WhatsApp after selfie/evidence completion for an eligible public field attempt", async () => {
    const { completeFieldEvidenceSubmissionAction } = await import("./evidence-actions");

    mocks.completeFieldEvidenceSubmission.mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        counts: { perfumePhotos: 2, selfie: 1 },
        selfieComplete: true,
        study: { code: "FMASCULINA-NAVIGO-2026", id: "study-1", name: "Navigo" }
      },
      ok: true
    });
    mocks.repository.getAttempt.mockResolvedValueOnce({
      id: "attempt-1",
      participantConfirmation: {
        folio: "NAV-001",
        referenceCodes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ]
      },
      questionnaireVersion: {
        study: { id: "study-1" }
      },
      status: "PENDING_REVIEW",
      studyParticipant: {
        participantProfile: {
          name: "Persona publica",
          phone: "5551112222"
        }
      },
      studyParticipantId: "study-participant-1"
    });
    mocks.getFieldScreeningReviewReadiness.mockResolvedValueOnce({
      attemptExists: true,
      fieldUserId: null,
      hasConfirmation: true,
      hasPendingReview: true,
      hasRequiredPerfumePhotos: true,
      hasStudyParticipant: true,
      isPublicFieldAttempt: true,
      nextStep: "PENDING_REVIEW",
      perfumePhotoCount: 2,
      perfumePhotoRelatedQuestionIds: ["F6_MARCAS_UTILIZA"],
      reviewStatus: "PENDING",
      selfieCount: 1,
      source: "FIELD",
      status: "PENDING_REVIEW",
      studyParticipantId: "study-participant-1"
    });

    const result = await completeFieldEvidenceSubmissionAction("attempt-1");

    expect(result).toMatchObject({
      data: { redirectTo: "/field/screening/attempt-1/result" },
      ok: true
    });
    expect(mocks.sendNavigoConfirmationWhatsAppBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-1",
        confirmation: expect.objectContaining({ folio: "NAV-001" }),
        participant: { name: "Persona publica", phone: "5551112222" },
        studyId: "study-1",
        studyParticipantId: "study-participant-1"
      })
    );
  });
});
