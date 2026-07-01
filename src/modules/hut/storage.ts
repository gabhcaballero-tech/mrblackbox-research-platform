import { randomUUID } from "node:crypto";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  createSupabaseEvidenceStorageClient,
  type EvidenceStorageClient
} from "@/modules/participant-portal/evidence-storage";

export const HUT_VIDEO_BUCKET = PARTICIPANT_EVIDENCE_BUCKET;
export const HUT_MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const HUT_MAX_SELFIE_BYTES = 8 * 1024 * 1024;

export type HutVideoUploadMetadata = {
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
};

export type HutValidatedVideoUploadMetadata = HutVideoUploadMetadata & {
  extension: "mov" | "mp4" | "webm";
};

export type HutSignedVideoUpload = {
  privateStorageKey: string;
  storageBucket: string;
  token: string;
  metadata: HutValidatedVideoUploadMetadata;
};

export type HutSelfieUploadMetadata = {
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
};

export type HutValidatedSelfieUploadMetadata = HutSelfieUploadMetadata & {
  extension: "jpeg" | "jpg" | "png" | "webp";
};

export type HutSignedSelfieUpload = {
  privateStorageKey: string;
  storageBucket: string;
  token: string;
  metadata: HutValidatedSelfieUploadMetadata;
};

export type HutStorageClient = EvidenceStorageClient;

const allowedVideoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const allowedVideoExtensions = new Set(["mp4", "mov", "webm"]);
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export function validateHutVideoUploadMetadata(metadata: HutVideoUploadMetadata): HutValidatedVideoUploadMetadata {
  const extension = extractExtension(metadata.originalFilename);

  if (!allowedVideoMimeTypes.has(metadata.mimeType)) {
    throw new Error("Formato no permitido. Sube un video MP4, MOV o WebM.");
  }

  if (!allowedVideoExtensions.has(extension)) {
    throw new Error("Extension no permitida. Usa mp4, mov o webm.");
  }

  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
    throw new Error("El archivo de video no es valido.");
  }

  if (metadata.sizeBytes > HUT_MAX_VIDEO_BYTES) {
    throw new Error("El video excede el tamano maximo permitido.");
  }

  return {
    ...metadata,
    extension: extension as HutValidatedVideoUploadMetadata["extension"]
  };
}

export async function createHutSignedVideoUpload({
  blockNumber,
  metadata,
  participantId,
  sequenceNumber,
  storage = createSupabaseEvidenceStorageClient(),
  studyId
}: {
  blockNumber: number;
  metadata: HutVideoUploadMetadata;
  participantId: string;
  sequenceNumber: number;
  storage?: HutStorageClient;
  studyId: string;
}): Promise<HutSignedVideoUpload> {
  const validated = validateHutVideoUploadMetadata(metadata);
  const privateStorageKey = buildHutVideoStorageKey({
    blockNumber,
    extension: validated.extension,
    participantId,
    sequenceNumber,
    studyId
  });
  const signed = await storage.createSignedUploadUrl({
    bucket: HUT_VIDEO_BUCKET,
    contentType: validated.mimeType,
    privateStorageKey
  });

  if (!signed.token) {
    throw new Error("No fue posible preparar la carga del video.");
  }

  return {
    metadata: validated,
    privateStorageKey,
    storageBucket: HUT_VIDEO_BUCKET,
    token: signed.token
  };
}

export function validateHutSelfieUploadMetadata(metadata: HutSelfieUploadMetadata): HutValidatedSelfieUploadMetadata {
  const extension = extractExtension(metadata.originalFilename);

  if (!allowedImageMimeTypes.has(metadata.mimeType)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  }

  if (!allowedImageExtensions.has(extension)) {
    throw new Error("Extension no permitida. Usa jpg, jpeg, png o webp.");
  }

  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
    throw new Error("El archivo de selfie no es valido.");
  }

  if (metadata.sizeBytes > HUT_MAX_SELFIE_BYTES) {
    throw new Error("La selfie excede el tamano maximo permitido.");
  }

  return {
    ...metadata,
    extension: extension as HutValidatedSelfieUploadMetadata["extension"]
  };
}

export async function createHutSignedReferenceSelfieUpload({
  metadata,
  participantId,
  storage = createSupabaseEvidenceStorageClient(),
  studyId
}: {
  metadata: HutSelfieUploadMetadata;
  participantId: string;
  storage?: HutStorageClient;
  studyId: string;
}): Promise<HutSignedSelfieUpload> {
  const validated = validateHutSelfieUploadMetadata(metadata);
  const privateStorageKey = buildHutSelfieStorageKey({
    extension: validated.extension,
    participantId,
    purpose: "reference",
    studyId
  });

  return createSignedHutSelfie({ metadata: validated, privateStorageKey, storage });
}

export async function createHutSignedDailySelfieUpload({
  blockNumber,
  metadata,
  participantId,
  sequenceNumber,
  storage = createSupabaseEvidenceStorageClient(),
  studyId
}: {
  blockNumber: number;
  metadata: HutSelfieUploadMetadata;
  participantId: string;
  sequenceNumber: number;
  storage?: HutStorageClient;
  studyId: string;
}): Promise<HutSignedSelfieUpload> {
  const validated = validateHutSelfieUploadMetadata(metadata);
  const privateStorageKey = buildHutSelfieStorageKey({
    blockNumber,
    extension: validated.extension,
    participantId,
    purpose: "daily",
    sequenceNumber,
    studyId
  });

  return createSignedHutSelfie({ metadata: validated, privateStorageKey, storage });
}

export function assertHutVideoStorageKey({
  participantId,
  privateStorageKey,
  studyId
}: {
  participantId: string;
  privateStorageKey: string;
  studyId: string;
}) {
  const expectedPrefix = ["studies", studyId, "hut-participants", participantId, ""].join("/");

  if (!privateStorageKey.startsWith(expectedPrefix)) {
    throw new Error("No fue posible validar el video cargado.");
  }
}

export function assertHutSelfieStorageKey({
  participantId,
  privateStorageKey,
  studyId
}: {
  participantId: string;
  privateStorageKey: string;
  studyId: string;
}) {
  const expectedPrefix = ["studies", studyId, "hut-participants", participantId, ""].join("/");

  if (!privateStorageKey.startsWith(expectedPrefix)) {
    throw new Error("No fue posible validar la selfie cargada.");
  }
}

async function createSignedHutSelfie({
  metadata,
  privateStorageKey,
  storage
}: {
  metadata: HutValidatedSelfieUploadMetadata;
  privateStorageKey: string;
  storage: HutStorageClient;
}) {
  const signed = await storage.createSignedUploadUrl({
    bucket: HUT_VIDEO_BUCKET,
    contentType: metadata.mimeType,
    privateStorageKey
  });

  if (!signed.token) {
    throw new Error("No fue posible preparar la carga de la selfie.");
  }

  return {
    metadata,
    privateStorageKey,
    storageBucket: HUT_VIDEO_BUCKET,
    token: signed.token
  };
}

function buildHutVideoStorageKey({
  blockNumber,
  extension,
  participantId,
  sequenceNumber,
  studyId
}: {
  blockNumber: number;
  extension: string;
  participantId: string;
  sequenceNumber: number;
  studyId: string;
}) {
  return [
    "studies",
    studyId,
    "hut-participants",
    participantId,
    `block-${blockNumber}`,
    `video-${sequenceNumber}`,
    `${randomUUID()}.${extension.toLowerCase()}`
  ].join("/");
}

function buildHutSelfieStorageKey({
  blockNumber,
  extension,
  participantId,
  purpose,
  sequenceNumber,
  studyId
}: {
  blockNumber?: number;
  extension: string;
  participantId: string;
  purpose: "daily" | "reference";
  sequenceNumber?: number;
  studyId: string;
}) {
  const safeExtension = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();
  const folder =
    purpose === "reference"
      ? ["reference-selfie"]
      : [`block-${blockNumber ?? 0}`, `video-${sequenceNumber ?? 0}`, "daily-selfie"];

  return [
    "studies",
    studyId,
    "hut-participants",
    participantId,
    ...folder,
    `${randomUUID()}.${safeExtension}`
  ].join("/");
}

function extractExtension(filename: string): string {
  return filename.trim().toLowerCase().split(".").pop() ?? "";
}
