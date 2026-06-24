import { describe, expect, it, vi } from "vitest";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  buildEvidenceStorageKey,
  createSignedEvidenceUpload,
  validateEvidenceUploadMetadata
} from "./evidence-storage";

describe("participant evidence storage", () => {
  it("rejects invalid MIME and files larger than maxImageBytes", () => {
    expect(() =>
      validateEvidenceUploadMetadata({
        maxImageBytes: 1000,
        metadata: {
          evidenceType: "SELFIE_IDENTIFICATION",
          mimeType: "application/pdf",
          originalFilename: "selfie.pdf",
          sizeBytes: 100
        }
      })
    ).toThrow("Formato no permitido");

    expect(() =>
      validateEvidenceUploadMetadata({
        maxImageBytes: 1000,
        metadata: {
          evidenceType: "PERFUME_PHOTO",
          mimeType: "image/jpeg",
          originalFilename: "perfume.jpg",
          sizeBytes: 1001
        }
      })
    ).toThrow("tamano maximo");
  });

  it("generates non-guessable private storage keys without using the original filename", () => {
    const first = buildEvidenceStorageKey({
      attemptId: "attempt-1",
      evidenceType: "PERFUME_PHOTO",
      extension: "jpg",
      participantProfileId: "profile-1",
      studyId: "study-1"
    });
    const second = buildEvidenceStorageKey({
      attemptId: "attempt-1",
      evidenceType: "PERFUME_PHOTO",
      extension: "jpg",
      participantProfileId: "profile-1",
      studyId: "study-1"
    });

    expect(first).not.toBe(second);
    expect(first).toContain("studies/study-1/participants/profile-1/screening-attempts/attempt-1/perfume_photo/");
    expect(first).not.toContain("perfume.jpg");
  });

  it("creates a signed upload contract without a public persistent URL", async () => {
    const storage = {
      createSignedReadUrl: vi.fn(),
      createSignedUploadUrl: vi.fn(async () => ({
        signedUrl: "https://storage.example/signed-upload",
        token: "signed-token"
      }))
    };

    const result = await createSignedEvidenceUpload({
      attemptId: "attempt-1",
      maxImageBytes: 1000,
      metadata: {
        evidenceType: "SELFIE_IDENTIFICATION",
        mimeType: "image/png",
        originalFilename: "selfie.png",
        sizeBytes: 100
      },
      participantProfileId: "profile-1",
      storage,
      studyId: "study-1"
    });

    expect(result.storageBucket).toBe(PARTICIPANT_EVIDENCE_BUCKET);
    expect(result.signedUrl).toBe("https://storage.example/signed-upload");
    expect(Object.keys(result)).not.toContain("publicUrl");
    expect(result.privateStorageKey).not.toContain("selfie.png");
  });
});
