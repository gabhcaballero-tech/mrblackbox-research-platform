import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PARTICIPANT_EVIDENCE_BUCKET = "participant-evidence";
export const F6_PERFUME_EVIDENCE_QUESTION_ID = "F6_MARCAS_UTILIZA";

export type ParticipantEvidenceKind = "PERFUME_PHOTO" | "SELFIE_IDENTIFICATION";

export type EvidenceUploadMetadata = {
  evidenceType: ParticipantEvidenceKind;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
};

export type ValidatedEvidenceUploadMetadata = EvidenceUploadMetadata & {
  extension: "jpeg" | "jpg" | "png" | "webp";
};

export type SignedEvidenceUpload = {
  privateStorageKey: string;
  signedUrl: string;
  storageBucket: string;
  token?: string;
};

export type EvidenceStorageClient = {
  createSignedReadUrl: (input: {
    bucket: string;
    expiresInSeconds: number;
    privateStorageKey: string;
  }) => Promise<string>;
  createSignedUploadUrl: (input: {
    bucket: string;
    contentType: string;
    privateStorageKey: string;
  }) => Promise<{ signedUrl: string; token?: string }>;
};

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export function validateEvidenceUploadMetadata({
  maxImageBytes,
  metadata
}: {
  maxImageBytes: number;
  metadata: EvidenceUploadMetadata;
}): ValidatedEvidenceUploadMetadata {
  const extension = extractExtension(metadata.originalFilename);

  if (!allowedMimeTypes.has(metadata.mimeType)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  }

  if (!allowedExtensions.has(extension)) {
    throw new Error("Extensión no permitida. Usa jpg, jpeg, png o webp.");
  }

  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
    throw new Error("El archivo no es válido.");
  }

  if (metadata.sizeBytes > maxImageBytes) {
    throw new Error("El archivo excede el tamaño máximo permitido.");
  }

  return {
    ...metadata,
    extension: extension as ValidatedEvidenceUploadMetadata["extension"]
  };
}

export async function createSignedEvidenceUpload({
  attemptId,
  maxImageBytes,
  metadata,
  participantProfileId,
  storage,
  studyId
}: {
  attemptId: string;
  maxImageBytes: number;
  metadata: EvidenceUploadMetadata;
  participantProfileId: string;
  storage: EvidenceStorageClient;
  studyId: string;
}): Promise<SignedEvidenceUpload & { metadata: ValidatedEvidenceUploadMetadata }> {
  const validated = validateEvidenceUploadMetadata({ maxImageBytes, metadata });
  const privateStorageKey = buildEvidenceStorageKey({
    attemptId,
    evidenceType: validated.evidenceType,
    extension: validated.extension,
    participantProfileId,
    studyId
  });
  const signed = await storage.createSignedUploadUrl({
    bucket: PARTICIPANT_EVIDENCE_BUCKET,
    contentType: validated.mimeType,
    privateStorageKey
  });

  return {
    metadata: validated,
    privateStorageKey,
    signedUrl: signed.signedUrl,
    storageBucket: PARTICIPANT_EVIDENCE_BUCKET,
    token: signed.token
  };
}

export function buildEvidenceStorageKey({
  attemptId,
  evidenceType,
  extension,
  participantProfileId,
  studyId
}: {
  attemptId: string;
  evidenceType: ParticipantEvidenceKind;
  extension: string;
  participantProfileId: string;
  studyId: string;
}): string {
  const safeExtension = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();

  return [
    "studies",
    studyId,
    "participants",
    participantProfileId,
    "screening-attempts",
    attemptId,
    evidenceType.toLowerCase(),
    `${randomUUID()}.${safeExtension}`
  ].join("/");
}

export function assertEvidenceStorageKeyBelongsToAttempt({
  attemptId,
  participantProfileId,
  privateStorageKey,
  studyId
}: {
  attemptId: string;
  participantProfileId: string;
  privateStorageKey: string;
  studyId: string;
}): void {
  const expectedPrefix = [
    "studies",
    studyId,
    "participants",
    participantProfileId,
    "screening-attempts",
    attemptId,
    ""
  ].join("/");

  if (!privateStorageKey.startsWith(expectedPrefix)) {
    throw new Error("No fue posible validar la evidencia cargada.");
  }
}

export function createSupabaseEvidenceStorageClient(): EvidenceStorageClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_URL are required for evidence storage.");
  }

  const client = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return {
    async createSignedReadUrl(input) {
      const { data, error } = await client.storage
        .from(input.bucket)
        .createSignedUrl(input.privateStorageKey, input.expiresInSeconds);

      if (error || !data?.signedUrl) {
        throw new Error("No fue posible generar la URL temporal de lectura.");
      }

      return data.signedUrl;
    },
    async createSignedUploadUrl(input) {
      const { data, error } = await client.storage
        .from(input.bucket)
        .createSignedUploadUrl(input.privateStorageKey, {
          upsert: false
        });

      if (error || !data?.signedUrl) {
        throw new Error("No fue posible preparar la carga de evidencia.");
      }

      return {
        signedUrl: data.signedUrl,
        token: "token" in data && typeof data.token === "string" ? data.token : undefined
      };
    }
  };
}

function extractExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const extension = normalized.split(".").pop();

  return extension ?? "";
}
