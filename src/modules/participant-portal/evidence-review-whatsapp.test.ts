import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvidenceReviewRepository } from "./evidence-review-repository";

const mocks = vi.hoisted(() => ({
  findLatestOutboundTemplateMessage: vi.fn(),
  applyStoredNavigoRotationForParticipantBestEffort: vi.fn(),
  sendNavigoConfirmationWhatsApp: vi.fn()
}));

vi.mock("@/modules/oneui-whatsapp", () => ({
  createOneuiWhatsAppRepository: vi.fn(() => ({
    findLatestOutboundTemplateMessage: mocks.findLatestOutboundTemplateMessage
  })),
  sendNavigoConfirmationWhatsApp: mocks.sendNavigoConfirmationWhatsApp
}));

vi.mock("@/modules/navigo-app/rotation-folio-application", () => ({
  applyStoredNavigoRotationForParticipantBestEffort: mocks.applyStoredNavigoRotationForParticipantBestEffort
}));

const admin = { id: "admin-1", role: "ADMIN" as const, status: "ACTIVE" as const };

function repository(): EvidenceReviewRepository {
  return {
    approveEvidence: vi.fn(async () => ({
      actorUserId: "admin-1",
      confirmation: {
        folio: "NAV-001",
        folioSequence: 1,
        manualMessageMarkedSentAt: null,
        manualMessageStatus: "NOT_SENT",
        referenceCodes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ]
      },
      created: false,
      ok: true,
      studyParticipantId: "study-participant-1"
    })),
    getAttemptReview: vi.fn(async () => ({
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
        study: {
          id: "study-1"
        }
      },
      studyParticipant: {
        participantProfile: {
          name: "Persona Participante",
          phone: "+525512345678"
        }
      },
      studyParticipantId: "study-participant-1"
    })),
    deleteSelectedTestRecords: vi.fn(),
    deleteStudyParticipantTestRecords: vi.fn(),
    deleteTestRecord: vi.fn(),
    getAttemptReviewList: vi.fn(),
    getStudyAttemptList: vi.fn(),
    markManualMessageSent: vi.fn(),
    regenerateReferenceCodes: vi.fn(),
    rejectEvidence: vi.fn(),
    reopenEvidenceReview: vi.fn(),
    replaceEvidence: vi.fn(),
    updateParticipant: vi.fn()
  } as unknown as EvidenceReviewRepository;
}

describe("participant evidence review WhatsApp behavior", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not send WhatsApp automatically when evidence review is approved", async () => {
    const { approveParticipantEvidenceReview } = await import("./evidence-review-service");

    const result = await approveParticipantEvidenceReview({
      actor: admin,
      attemptId: "attempt-1",
      repository: repository()
    });

    expect(result.ok).toBe(true);
    expect(mocks.sendNavigoConfirmationWhatsApp).not.toHaveBeenCalled();
  });

  it("keeps the manual admin WhatsApp send available", async () => {
    const { sendParticipantConfirmationWhatsApp } = await import("./evidence-review-service");

    mocks.findLatestOutboundTemplateMessage.mockResolvedValueOnce(null);
    mocks.sendNavigoConfirmationWhatsApp.mockResolvedValueOnce({
      metaMessageId: "wamid.123",
      ok: true,
      status: "accepted"
    });

    const result = await sendParticipantConfirmationWhatsApp({
      actor: admin,
      attemptId: "attempt-1",
      repository: repository()
    });

    expect(result.ok).toBe(true);
    expect(mocks.sendNavigoConfirmationWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        codes: [
          { code: "A7K4", slot: 1 },
          { code: "M3P9", slot: 2 },
          { code: "T8R2", slot: 3 }
        ],
        folio: "NAV-001",
        force: true,
        participantId: "study-participant-1",
        participantName: "Persona Participante",
        phone: "+525512345678",
        studyId: "study-1"
      })
    );
  });
});
