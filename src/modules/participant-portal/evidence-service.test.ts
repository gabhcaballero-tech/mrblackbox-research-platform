import { describe, expect, it, vi } from "vitest";
import type { ParticipantPortalIdentity } from "@/shared/auth/participant-portal";
import type {
  ParticipantPortalEvidenceRepository,
  PortalEvidenceAttemptRecord,
  PortalEvidenceRecord
} from "./evidence-repository";
import {
  PARTICIPANT_PORTAL_EVIDENCE_REVIEW_MESSAGE,
  completeParticipantEvidenceSubmission,
  confirmParticipantEvidenceUpload,
  getParticipantPortalEvidenceResult,
  getParticipantPortalEvidenceScreen,
  requestParticipantEvidenceUpload
} from "./evidence-service";

const identity: ParticipantPortalIdentity = {
  email: "persona@example.com",
  id: "11111111-1111-4111-8111-111111111111"
};

function evidence(overrides: Partial<PortalEvidenceRecord> = {}): PortalEvidenceRecord {
  return {
    extension: "jpg",
    id: `evidence-${Math.random()}`,
    mimeType: "image/jpeg",
    originalFilename: "foto.jpg",
    privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/perfume_photo/key.jpg",
    relatedQuestionId: "F6_MARCAS_UTILIZA",
    reviewStatus: "PENDING",
    sizeBytes: 100,
    storageBucket: "participant-evidence",
    type: "PERFUME_PHOTO",
    uploadedAt: new Date("2026-06-24T10:00:00Z"),
    ...overrides
  };
}

function attempt(overrides: Partial<PortalEvidenceAttemptRecord> = {}): PortalEvidenceAttemptRecord {
  return {
    completedAt: new Date("2026-06-24T10:00:00Z"),
    fieldUserId: null,
    id: "attempt-1",
    participantConfirmation: null,
    participantEvidence: [],
    participantScreeningReview: { rejectionReason: null, status: "PENDING" },
    source: "PARTICIPANT_PORTAL",
    status: "PENDING_REVIEW",
    studyParticipant: {
      id: "study-participant-1",
      participantProfile: {
        email: "persona@example.com",
        id: "profile-1",
        name: "Persona",
        participantAuthUserId: identity.id,
        phone: "+525512345678"
      },
      participantProfileId: "profile-1",
      screeningStatus: "PENDING_REVIEW",
      studyId: "study-1"
    },
    studyParticipantId: "study-participant-1",
    ...overrides
  };
}

function createRepository(currentAttempt: PortalEvidenceAttemptRecord | null = attempt()) {
  const evidences = currentAttempt?.participantEvidence ?? [];
  const pendingReviews: Array<{ screeningAttemptId: string; studyParticipantId: string }> = [];
  const repository: ParticipantPortalEvidenceRepository = {
    createEvidence: vi.fn(async (input) => {
      const record = evidence({
        extension: input.extension,
        mimeType: input.mimeType,
        originalFilename: input.originalFilename,
        privateStorageKey: input.privateStorageKey,
        relatedQuestionId: input.relatedQuestionId,
        sizeBytes: input.sizeBytes,
        storageBucket: input.storageBucket,
        type: input.type
      });
      evidences.push(record);
      return record;
    }),
    findCurrentParticipantConsent: vi.fn(async () => ({
      id: "consent-1",
      noticeVersion: "v1",
      participantAuthUserId: identity.id,
      studyParticipantId: "study-participant-1"
    })),
    findParticipantProfileByAuthUserId: vi.fn(async () => ({
      email: "persona@example.com",
      id: "profile-1",
      name: "Persona",
      participantAuthUserId: identity.id,
      phone: "+525512345678"
    })),
    findStudyParticipant: vi.fn(async () => ({
      id: "study-participant-1",
      participantProfileId: "profile-1",
      screeningStatus: "PENDING_REVIEW" as const,
      studyId: "study-1"
    })),
    getAttempt: vi.fn(async () => currentAttempt),
    getStudyByCode: vi.fn(async () => ({
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina",
      portalConfig: {
        enabled: true,
        folioMaxSequence: 999,
        folioPrefix: "NAV",
        maxImageBytes: 1000,
        maxPerfumePhotos: 5,
        minPerfumePhotos: 1,
        nextFolioSequence: 1,
        privacyNoticeVersion: "v1"
      },
      status: "ACTIVE" as const
    })),
    listPortalAttemptsForStudyParticipant: vi.fn(async () => (currentAttempt ? [currentAttempt] : [])),
    upsertPendingReview: vi.fn(async (input) => {
      pendingReviews.push(input);
    })
  };

  return { evidences, pendingReviews, repository };
}

describe("participant portal evidence service", () => {
  it("does not allow evidence without a preliminary attempt", async () => {
    const { repository } = createRepository(null);
    const result = await getParticipantPortalEvidenceScreen({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result).toMatchObject({ code: "ATTEMPT_NOT_READY", ok: false });
  });

  it("requires exactly one selfie and at least one perfume photo", async () => {
    const { repository } = createRepository(attempt());
    const result = await completeParticipantEvidenceSubmission({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result).toMatchObject({
      code: "EVIDENCE_INCOMPLETE",
      ok: false
    });
  });

  it("allows maximum five perfume photos and rejects the sixth", async () => {
    const current = attempt({
      participantEvidence: [
        evidence({ type: "SELFIE_IDENTIFICATION", relatedQuestionId: null }),
        ...Array.from({ length: 5 }, (_, index) => evidence({ id: `perfume-${index}` }))
      ]
    });
    const { repository } = createRepository(current);
    const result = await requestParticipantEvidenceUpload({
      identity,
      metadata: {
        evidenceType: "PERFUME_PHOTO",
        mimeType: "image/jpeg",
        originalFilename: "otra.jpg",
        sizeBytes: 100
      },
      repository,
      storage: {
        createSignedReadUrl: vi.fn(),
        createSignedUploadUrl: vi.fn()
      },
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      ok: false
    });
  });

  it("creates ParticipantEvidence for selfie and perfume with F6 related question", async () => {
    const { evidences, repository } = createRepository(attempt());

    await confirmParticipantEvidenceUpload({
      identity,
      input: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/jpeg",
        originalFilename: "selfie.jpg",
        privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/selfie_identification/key.jpg",
        sizeBytes: 100,
        storageBucket: "participant-evidence"
      },
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });
    await confirmParticipantEvidenceUpload({
      identity,
      input: {
        evidenceType: "PERFUME_PHOTO",
        mimeType: "image/jpeg",
        originalFilename: "perfume.jpg",
        privateStorageKey: "studies/study-1/participants/profile-1/screening-attempts/attempt-1/perfume_photo/key.jpg",
        sizeBytes: 100,
        storageBucket: "participant-evidence"
      },
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(evidences[0]).toMatchObject({ relatedQuestionId: null, type: "SELFIE_IDENTIFICATION" });
    expect(evidences[1]).toMatchObject({ relatedQuestionId: "F6_MARCAS_UTILIZA", type: "PERFUME_PHOTO" });
  });

  it("marks complete evidence as pending review and public result shows review message", async () => {
    const { pendingReviews, repository } = createRepository(
      attempt({
        participantEvidence: [
          evidence({ type: "SELFIE_IDENTIFICATION", relatedQuestionId: null }),
          evidence({ type: "PERFUME_PHOTO" })
        ]
      })
    );

    const complete = await completeParticipantEvidenceSubmission({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });
    const result = await getParticipantPortalEvidenceResult({
      identity,
      repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(complete.ok).toBe(true);
    expect(pendingReviews).toEqual([{ screeningAttemptId: "attempt-1", studyParticipantId: "study-participant-1" }]);
    expect(result.ok ? result.data.message : "").toBe(PARTICIPANT_PORTAL_EVIDENCE_REVIEW_MESSAGE);
    expect(result.ok ? result.data.showEvidenceLink : true).toBe(false);
  });

  it("keeps rejected public result generic and approved result shows folio and codes", async () => {
    const rejected = await getParticipantPortalEvidenceResult({
      identity,
      repository: createRepository(
        attempt({ participantScreeningReview: { rejectionReason: "Imagen borrosa", status: "REJECTED" } })
      ).repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });
    const approved = await getParticipantPortalEvidenceResult({
      identity,
      repository: createRepository(
        attempt({
          participantConfirmation: {
            folio: "NAV-001",
            manualMessageMarkedSentAt: null,
            manualMessageStatus: "NOT_SENT",
            referenceCodes: [
              { code: "ABC12345", slot: 1 },
              { code: "DEF12345", slot: 2 },
              { code: "GHI12345", slot: 3 }
            ]
          }
        })
      ).repository,
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(rejected.ok ? rejected.data.message : "").not.toContain("Imagen borrosa");
    expect(approved.ok ? approved.data.confirmation?.folio : null).toBe("NAV-001");
    expect(approved.ok ? approved.data.confirmation?.codes : []).toHaveLength(3);
  });
});
