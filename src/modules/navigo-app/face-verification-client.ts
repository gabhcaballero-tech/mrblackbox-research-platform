"use client";

import {
  classifyNavigoFaceSimilarity,
  NAVIGO_FACE_VERIFICATION_METHOD,
  type NavigoFaceVerificationClientResult
} from "./face-verification-contract";

type HumanModule = typeof import("@vladmandic/human");
type HumanInstance = InstanceType<HumanModule["Human"]>;

const HUMAN_FACE_CONFIG = {
  async: true,
  backend: "webgl",
  body: { enabled: false },
  debug: false,
  face: {
    antispoof: { enabled: false },
    attention: { enabled: false },
    description: { enabled: true, minConfidence: 0.45, modelPath: "faceres.json" },
    detector: {
      enabled: true,
      maxDetected: 2,
      minConfidence: 0.45,
      minSize: 48,
      modelPath: "blazeface.json",
      rotation: true
    },
    emotion: { enabled: false },
    enabled: true,
    gear: { enabled: false },
    iris: { enabled: false },
    liveness: { enabled: false },
    mesh: { enabled: false }
  },
  filter: { enabled: true, equalization: true },
  gesture: { enabled: false },
  hand: { enabled: false },
  modelBasePath: "/models/human/",
  object: { enabled: false },
  segmentation: { enabled: false },
  warmup: "none"
} as const;

let humanPromise: Promise<HumanInstance> | null = null;

export async function verifyNavigoFaceIdentity(input: {
  capturedSelfie: File;
  registeredSelfieUrl: string | null;
}): Promise<NavigoFaceVerificationClientResult> {
  if (!input.registeredSelfieUrl) {
    return faceVerificationResult("ERROR", null, "BASE_SELFIE_MISSING");
  }

  let capturedImageUrl: string | null = null;
  let registeredImageUrl: string | null = null;

  try {
    const human = await getHuman();
    capturedImageUrl = URL.createObjectURL(input.capturedSelfie);
    registeredImageUrl = await createObjectUrlFromSignedImage(input.registeredSelfieUrl);

    const [baseFace, capturedFace] = await Promise.all([
      detectSingleFaceEmbedding(human, registeredImageUrl, "BASE"),
      detectSingleFaceEmbedding(human, capturedImageUrl, "CAPTURED")
    ]);

    if (!baseFace.ok) {
      return faceVerificationResult("UNCERTAIN", null, baseFace.reason);
    }
    if (!capturedFace.ok) {
      return faceVerificationResult("UNCERTAIN", null, capturedFace.reason);
    }

    const score = human.match.similarity(baseFace.embedding, capturedFace.embedding, { order: 2 });

    return faceVerificationResult(classifyNavigoFaceSimilarity(score), score, null);
  } catch {
    return faceVerificationResult("ERROR", null, "MODEL_ERROR");
  } finally {
    if (capturedImageUrl) {
      URL.revokeObjectURL(capturedImageUrl);
    }
    if (registeredImageUrl) {
      URL.revokeObjectURL(registeredImageUrl);
    }
  }
}

async function getHuman(): Promise<HumanInstance> {
  if (!humanPromise) {
    const browserBundleUrl = "/vendor/human/human.esm.js";
    humanPromise = import(/* webpackIgnore: true */ browserBundleUrl).then(async (humanModule) => {
      const { Human } = humanModule as HumanModule;
      const human = new Human(HUMAN_FACE_CONFIG);
      await human.load(HUMAN_FACE_CONFIG);
      return human;
    });
  }

  return humanPromise;
}

async function detectSingleFaceEmbedding(
  human: HumanInstance,
  imageUrl: string,
  source: "BASE" | "CAPTURED"
): Promise<{ embedding: number[]; ok: true } | { ok: false; reason: string }> {
  const image = await loadImage(imageUrl);
  const result = await human.detect(image, HUMAN_FACE_CONFIG);
  const faces = result.face ?? [];

  if (faces.length === 0) {
    return { ok: false, reason: `${source}_NO_FACE` };
  }

  if (faces.length > 1) {
    return { ok: false, reason: `${source}_MULTIPLE_FACES` };
  }

  const embedding = faces[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    return { ok: false, reason: `${source}_NO_DESCRIPTOR` };
  }

  return { embedding, ok: true };
}

async function createObjectUrlFromSignedImage(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error("Could not load signed identity image.");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode identity image."));
    image.src = url;
  });
}

function faceVerificationResult(
  status: NavigoFaceVerificationClientResult["status"],
  score: number | null,
  reason: string | null
): NavigoFaceVerificationClientResult {
  return {
    evaluatedAt: new Date().toISOString(),
    method: NAVIGO_FACE_VERIFICATION_METHOD,
    reason: reason ?? undefined,
    score,
    status
  };
}
