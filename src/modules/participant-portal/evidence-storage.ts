import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PARTICIPANT_EVIDENCE_BUCKET = "participant-evidence";
export const F6_PERFUME_EVIDENCE_QUESTION_ID = "F6_MARCAS_UTILIZA";

export type EvidenceStorageErrorCode =
  | "BUCKET_UNAVAILABLE"
  | "INVALID_SERVER_KEY"
  | "INVALID_FILE"
  | "MISSING_SUPABASE_URL"
  | "SIGNED_UPLOAD_UNAVAILABLE"
  | "STORAGE_NOT_CONFIGURED";

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

export class EvidenceStorageError extends Error {
  code: EvidenceStorageErrorCode;

  constructor(code: EvidenceStorageErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "EvidenceStorageError";
  }
}

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export type EvidenceStorageConfig = {
  secretKey: string;
  supabaseUrl: string;
};

export function validateEvidenceUploadMetadata({
  maxImageBytes,
  metadata
}: {
  maxImageBytes: number;
  metadata: EvidenceUploadMetadata;
}): ValidatedEvidenceUploadMetadata {
  const extension = extractExtension(metadata.originalFilename);

  if (!allowedMimeTypes.has(metadata.mimeType)) {
    throw new EvidenceStorageError("INVALID_FILE", "Formato no permitido. Usa JPG, PNG o WebP.");
  }

  if (!allowedExtensions.has(extension)) {
    throw new EvidenceStorageError("INVALID_FILE", "Extension no permitida. Usa jpg, jpeg, png o webp.");
  }

  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
    throw new EvidenceStorageError("INVALID_FILE", "El archivo no es valido.");
  }

  if (metadata.sizeBytes > maxImageBytes) {
    throw new EvidenceStorageError("INVALID_FILE", "El archivo excede el tamano maximo permitido.");
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
    throw new EvidenceStorageError("INVALID_FILE", "No fue posible validar la evidencia cargada.");
  }
}

export function createSupabaseEvidenceStorageClient(): EvidenceStorageClient {
  const { secretKey, supabaseUrl } = resolveEvidenceStorageConfig(process.env);

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
        throw new EvidenceStorageError(
          classifyStorageErrorCode(error),
          storageErrorMessage(error, "No fue posible generar la URL temporal de lectura.")
        );
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
        throw new EvidenceStorageError(
          classifyStorageErrorCode(error),
          storageErrorMessage(error, "No fue posible preparar la carga. Intenta de nuevo.")
        );
      }

      return {
        signedUrl: data.signedUrl,
        token: "token" in data && typeof data.token === "string" ? data.token : undefined
      };
    }
  };
}

export function resolveEvidenceStorageConfig(
  env: NodeJS.ProcessEnv
): EvidenceStorageConfig {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl) {
    throw new EvidenceStorageError(
      "MISSING_SUPABASE_URL",
      "La carga de evidencias no esta configurada. Contacta al administrador."
    );
  }

  if (!secretKey) {
    throw new EvidenceStorageError(
      "STORAGE_NOT_CONFIGURED",
      "La carga de evidencias no esta configurada. Contacta al administrador."
    );
  }

  if (!isServerSideSupabaseKey(secretKey)) {
    throw new EvidenceStorageError(
      "INVALID_SERVER_KEY",
      "La carga de evidencias no esta configurada. Contacta al administrador."
    );
  }

  return {
    secretKey,
    supabaseUrl
  };
}

function extractExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const extension = normalized.split(".").pop();

  return extension ?? "";
}

function classifyStorageErrorCode(error: unknown): EvidenceStorageErrorCode {
  const message = readStorageErrorMessage(error).toLowerCase();

  if (
    message.includes("bucket") &&
    (message.includes("not found") || message.includes("does not exist") || message.includes("missing"))
  ) {
    return "BUCKET_UNAVAILABLE";
  }

  return "SIGNED_UPLOAD_UNAVAILABLE";
}

function storageErrorMessage(error: unknown, fallback: string): string {
  if (classifyStorageErrorCode(error) === "BUCKET_UNAVAILABLE") {
    return "La carga de evidencias no esta disponible. Contacta al administrador.";
  }

  return fallback;
}

function isServerSideSupabaseKey(secretKey: string): boolean {
  if (secretKey.startsWith("sb_secret_")) {
    return true;
  }

  if (secretKey.startsWith("sb_publishable_")) {
    return false;
  }

  const jwtPayload = readJwtPayload(secretKey);

  if (!jwtPayload) {
    return false;
  }

  return jwtPayload.role === "service_role";
}

function readStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    return typeof message === "string" ? message : "";
  }

  return "";
}

function readJwtPayload(token: string): { role?: string } | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const decoded = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { role?: unknown };

    return {
      role: typeof parsed.role === "string" ? parsed.role : undefined
    };
  } catch {
    return null;
  }
}
