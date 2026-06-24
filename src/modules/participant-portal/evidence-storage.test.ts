import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  buildEvidenceStorageKey,
  createSignedEvidenceUpload,
  createSupabaseEvidenceStorageClient,
  resolveEvidenceStorageConfig,
  validateEvidenceUploadMetadata
} from "./evidence-storage";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn()
}));

describe("participant evidence storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_example";
  });

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
    expect(result.privateStorageKey).toContain("/selfie_identification/");
    expect(result.token).toBe("signed-token");
    expect(Object.keys(result)).not.toContain("publicUrl");
    expect(result.privateStorageKey).not.toContain("selfie.png");
  });

  it("detects missing NEXT_PUBLIC_SUPABASE_URL", () => {
    expect(() =>
      resolveEvidenceStorageConfig({
        NEXT_PUBLIC_SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: "sb_secret_example"
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow("La carga de evidencias no esta configurada. Contacta al administrador.");
  });

  it("detects missing SUPABASE_SECRET_KEY", () => {
    expect(() =>
      resolveEvidenceStorageConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: ""
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow("La carga de evidencias no esta configurada. Contacta al administrador.");
  });

  it("rejects keys that do not look server-side valid", () => {
    expect(() =>
      resolveEvidenceStorageConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_publishable_not_allowed"
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow("La carga de evidencias no esta configurada. Contacta al administrador.");
  });

  it("accepts a server-side secret key and builds a storage client", async () => {
    const createSignedUploadUrl = vi.fn(async () => ({
      data: {
        signedUrl: "https://signed.example/upload",
        token: "token-1"
      },
      error: null
    }));
    vi.mocked(createClient).mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl,
          createSignedUrl: vi.fn()
        }))
      }
    } as never);

    const client = createSupabaseEvidenceStorageClient();
    const result = await client.createSignedUploadUrl({
      bucket: PARTICIPANT_EVIDENCE_BUCKET,
      contentType: "image/jpeg",
      privateStorageKey: "studies/study-1/path.jpg"
    });

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_secret_example",
      expect.any(Object)
    );
    expect(result).toEqual({
      signedUrl: "https://signed.example/upload",
      token: "token-1"
    });
  });
});
