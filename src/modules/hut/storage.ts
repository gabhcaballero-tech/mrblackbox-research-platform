import { randomUUID } from "node:crypto";
import {
  PARTICIPANT_EVIDENCE_BUCKET,
  createSupabaseEvidenceStorageClient,
  type EvidenceStorageClient
} from "@/modules/participant-portal/evidence-storage";

export const HUT_VIDEO_BUCKET = PARTICIPANT_EVIDENCE_BUCKET;
export const HUT_MAX_VIDEO_BYTES = 250 * 1024 * 1024;

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

export type HutStorageClient = EvidenceStorageClient;

const allowedVideoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const allowedVideoExtensions = new Set(["mp4", "mov", "webm"]);

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

function extractExtension(filename: string): string {
  return filename.trim().toLowerCase().split(".").pop() ?? "";
}
