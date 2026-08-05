import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeParticipantEvidenceSubmission: vi.fn(),
  repository: {
    getAttempt: vi.fn()
  },
  sendNavigoConfirmationWhatsAppBestEffort: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: null, id: "public-identity-1", source: "PUBLIC_SESSION" },
    status: "allowed"
  }))
}));

vi.mock("./access-mode", () => ({
  allowsDirectParticipantAccess: vi.fn(() => true)
}));

vi.mock("./repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("./evidence-repository", () => ({
  createParticipantPortalEvidenceRepository: vi.fn(() => mocks.repository)
}));

vi.mock("./evidence-service", () => ({
  completeParticipantEvidenceSubmission: mocks.completeParticipantEvidenceSubmission,
  confirmParticipantEvidenceUpload: vi.fn(),
  requestParticipantEvidenceUpload: vi.fn()
}));

vi.mock("./evidence-storage", () => ({
  PARTICIPANT_EVIDENCE_BUCKET: "participant-evidence",
  createSupabaseEvidenceStorageClient: vi.fn(),
  validateEvidenceUploadMetadata: vi.fn()
}));

vi.mock("./navigo-confirmation-whatsapp", () => ({
  sendNavigoConfirmationWhatsAppBestEffort: mocks.sendNavigoConfirmationWhatsAppBestEffort
}));

describe("participant portal evidence actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends Navigo WhatsApp after the final selfie/evidence submission", async () => {
    const { completeParticipantEvidenceSubmissionAction } = await import("./evidence-actions");

    mocks.completeParticipantEvidenceSubmission.mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        counts: { perfumePhotos: 2, selfie: 1 },
        evidenceComplete: true,
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
      status: "PASSED",
      studyParticipant: {
        participantProfile: {
          name: "Persona Participante",
          phone: "+525512345678"
        }
      },
      studyParticipantId: "study-participant-1"
    });

    const result = await completeParticipantEvidenceSubmissionAction("FMASCULINA-NAVIGO-2026");

    expect(result).toMatchObject({
      data: { redirectTo: "/participar/FMASCULINA-NAVIGO-2026/resultado" },
      ok: true
    });
    expect(mocks.sendNavigoConfirmationWhatsAppBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-1",
        confirmation: expect.objectContaining({ folio: "NAV-001" }),
        participant: { name: "Persona Participante", phone: "+525512345678" },
        studyId: "study-1",
        studyParticipantId: "study-participant-1"
      })
    );
  });
});
