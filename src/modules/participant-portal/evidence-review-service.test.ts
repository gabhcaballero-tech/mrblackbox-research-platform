import { describe, expect, it, vi } from "vitest";
import type { EvidenceReviewRepository, EvidenceReviewAttemptRecord } from "./evidence-review-repository";
import {
  approveParticipantEvidenceReview,
  buildWhatsAppUrl,
  canReviewParticipantEvidence,
  confirmParticipantEvidenceReplacement,
  getParticipantEvidenceReviewDetail,
  rejectParticipantEvidenceReview,
  requestParticipantEvidenceReplacementUpload
} from "./evidence-review-service";

const admin = { id: "admin-1", role: "ADMIN" as const, status: "ACTIVE" as const };
const interviewer = { id: "interviewer-1", role: "INTERVIEWER" as const, status: "ACTIVE" as const };

function attempt(overrides: Partial<EvidenceReviewAttemptRecord> = {}): EvidenceReviewAttemptRecord {
  return {
    answers: [{ answerJson: "Navigo y otra fragancia", questionId: "F6_MARCAS_UTILIZA" }],
    id: "attempt-1",
    participantConfirmation: null,
    participantEvidence: [
      {
        extension: "jpg",
        id: "evidence-1",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        privateStorageKey: "private/selfie.jpg",
        relatedQuestionId: null,
        reviewStatus: "PENDING",
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
      status: "PENDING"
    },
    questionnaireVersion: {
      study: {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Fragancia Masculina",
        participantPortalConfig: {
          folioMaxSequence: 999,
          folioPrefix: "NAV",
          maxImageBytes: 1000,
          maxPerfumePhotos: 5,
          minPerfumePhotos: 1,
          nextFolioSequence: 1
        }
      }
    },
    source: "PARTICIPANT_PORTAL",
    status: "PENDING_REVIEW",
    studyParticipant: {
      id: "study-participant-1",
      participantProfile: {
        email: "persona@example.com",
        id: "profile-1",
        name: "Gabriela",
        phone: "+52 55 1234 5678"
      }
    },
    studyParticipantId: "study-participant-1",
    ...overrides
  };
}

function repository(currentAttempt = attempt()) {
  const repo: EvidenceReviewRepository = {
    approveEvidence: vi.fn(async () => ({
      confirmation: {
        folio: "NAV-001",
        folioSequence: 1,
        manualMessageMarkedSentAt: null,
        manualMessageStatus: "NOT_SENT" as const,
        referenceCodes: [
          { code: "ABC12345", slot: 1 as const },
          { code: "DEF12345", slot: 2 as const },
          { code: "GHI12345", slot: 3 as const }
        ]
      },
      created: true,
      ok: true as const
    })),
    getAttemptReview: vi.fn(async () => currentAttempt),
    markManualMessageSent: vi.fn(async () => undefined),
    rejectEvidence: vi.fn(async () => undefined),
    replaceEvidence: vi.fn(async () => ({ ok: true as const }))
  };

  return repo;
}

describe("participant evidence review service", () => {
  it("allows ADMIN/SUPERVISOR but not INTERVIEWER to review", () => {
    expect(canReviewParticipantEvidence(admin)).toBe(true);
    expect(canReviewParticipantEvidence({ id: "super-1", role: "SUPERVISOR", status: "ACTIVE" })).toBe(true);
    expect(canReviewParticipantEvidence(interviewer)).toBe(false);
  });

  it("loads evidence with temporary signed URLs and declared F6 brands", async () => {
    const storage = {
      createSignedReadUrl: vi.fn(async () => "https://signed.example/evidence"),
      createSignedUploadUrl: vi.fn()
    };
    const result = await getParticipantEvidenceReviewDetail({
      actor: admin,
      attemptId: "attempt-1",
      repository: repository(),
      storage
    });

    expect(result.ok ? result.data.evidence[0]?.signedUrl : null).toBe("https://signed.example/evidence");
    expect(result.ok ? result.data.f6DeclaredBrands : "").toBe("Navigo y otra fragancia");
  });

  it("rejects review actions for INTERVIEWER", async () => {
    const result = await approveParticipantEvidenceReview({
      actor: interviewer,
      attemptId: "attempt-1",
      repository: repository()
    });

    expect(result.ok).toBe(false);
  });

  it("approves evidence through repository and rejects with required internal reason", async () => {
    const repo = repository();
    const approved = await approveParticipantEvidenceReview({
      actor: admin,
      attemptId: "attempt-1",
      repository: repo
    });
    const rejectedWithoutReason = await rejectParticipantEvidenceReview({
      actor: admin,
      attemptId: "attempt-1",
      rejectionReason: "",
      repository: repo
    });
    const rejected = await rejectParticipantEvidenceReview({
      actor: admin,
      attemptId: "attempt-1",
      rejectionReason: "Selfie borrosa",
      repository: repo
    });

    expect(approved.ok).toBe(true);
    expect(rejectedWithoutReason.ok).toBe(false);
    expect(rejected.ok).toBe(true);
    expect(repo.rejectEvidence).toHaveBeenCalledWith(expect.objectContaining({ rejectionReason: "Selfie borrosa" }));
  });

  it("builds WhatsApp URL with normalized phone", () => {
    const url = buildWhatsAppUrl({
      message: "Hola mundo",
      phone: "+52 55 1234 5678"
    });

    expect(url).toBe("https://wa.me/525512345678?text=Hola%20mundo");
  });

  it("lets ADMIN prepare replacement upload without exposing a signed URL", async () => {
    const storage = {
      createSignedReadUrl: vi.fn(),
      createSignedUploadUrl: vi.fn(async () => ({
        signedUrl: "https://signed.example/upload",
        token: "token-1"
      }))
    };
    const result = await requestParticipantEvidenceReplacementUpload({
      actor: admin,
      attemptId: "attempt-1",
      evidenceId: "evidence-1",
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        sizeBytes: 100
      },
      repository: repository(),
      storage
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.token : null).toBe("token-1");
    expect(result.ok ? "signedUrl" in result.data : true).toBe(false);
  });

  it("requires review permission and internal reason for replacement", async () => {
    const repo = repository();
    const denied = await requestParticipantEvidenceReplacementUpload({
      actor: interviewer,
      attemptId: "attempt-1",
      evidenceId: "evidence-1",
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        sizeBytes: 100
      },
      repository: repo,
      storage: {
        createSignedReadUrl: vi.fn(),
        createSignedUploadUrl: vi.fn()
      }
    });
    const withoutReason = await confirmParticipantEvidenceReplacement({
      actor: admin,
      attemptId: "attempt-1",
      input: {
        evidenceId: "evidence-1",
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie_identification/key.jpg",
        replacementReason: "",
        sizeBytes: 100,
        storageBucket: "participant-evidence"
      },
      repository: repo
    });

    expect(denied.ok).toBe(false);
    expect(withoutReason.ok).toBe(false);
    expect(repo.replaceEvidence).not.toHaveBeenCalled();
  });

  it("confirms replacement through repository with private bucket/key metadata", async () => {
    const repo = repository();
    const result = await confirmParticipantEvidenceReplacement({
      actor: admin,
      attemptId: "attempt-1",
      input: {
        evidenceId: "evidence-1",
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie_identification/key.jpg",
        replacementReason: "Foto borrosa",
        sizeBytes: 100,
        storageBucket: "participant-evidence"
      },
      repository: repo
    });

    expect(result.ok).toBe(true);
    expect(repo.replaceEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: "evidence-1",
        evidenceType: "SELFIE_IDENTIFICATION",
        replacementReason: "Foto borrosa",
        reviewedByUserId: "admin-1",
        storageBucket: "participant-evidence"
      })
    );
  });
});
