import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNED_EVIDENCE_LINK_VERSION = 1;
const DEFAULT_SIGNED_EVIDENCE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SIGNED_EVIDENCE_LINK_TTL_SECONDS = 60;
const MAX_SIGNED_EVIDENCE_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

type SignedEvidencePayload = {
  evidenceId: string;
  exp: number;
  v: typeof SIGNED_EVIDENCE_LINK_VERSION;
};

export type SignedEvidenceTokenResult =
  | { evidenceId: string; ok: true }
  | { code: "EXPIRED" | "INVALID" | "MISSING_SECRET"; ok: false };

export function createSignedEvidenceToken({
  evidenceId,
  now = new Date(),
  secret,
  ttlSeconds = DEFAULT_SIGNED_EVIDENCE_LINK_TTL_SECONDS
}: {
  evidenceId: string;
  now?: Date;
  secret: string | undefined;
  ttlSeconds?: number;
}): string | null {
  if (!secret) {
    return null;
  }

  const payload: SignedEvidencePayload = {
    evidenceId,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    v: SIGNED_EVIDENCE_LINK_VERSION
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifySignedEvidenceToken({
  now = new Date(),
  secret,
  token
}: {
  now?: Date;
  secret: string | undefined;
  token: string;
}): SignedEvidenceTokenResult {
  if (!secret) {
    return { code: "MISSING_SECRET", ok: false };
  }

  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra || !safeEquals(signature, signPayload(encodedPayload, secret))) {
    return { code: "INVALID", ok: false };
  }

  const payload = parsePayload(encodedPayload);

  if (!payload) {
    return { code: "INVALID", ok: false };
  }

  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    return { code: "EXPIRED", ok: false };
  }

  return {
    evidenceId: payload.evidenceId,
    ok: true
  };
}

export function resolveSignedEvidenceLinkTtlSeconds(env: NodeJS.ProcessEnv): number {
  const raw = env.SCREENING_EVIDENCE_SIGNED_LINK_TTL_SECONDS?.trim();
  const parsed = raw ? Number(raw) : NaN;

  if (
    Number.isInteger(parsed) &&
    parsed >= MIN_SIGNED_EVIDENCE_LINK_TTL_SECONDS &&
    parsed <= MAX_SIGNED_EVIDENCE_LINK_TTL_SECONDS
  ) {
    return parsed;
  }

  return DEFAULT_SIGNED_EVIDENCE_LINK_TTL_SECONDS;
}

export function resolveSignedEvidenceLinkSecret(env: NodeJS.ProcessEnv): string | undefined {
  return env.PARTICIPANT_PORTAL_HASH_SECRET?.trim() || undefined;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePayload(encodedPayload: string): SignedEvidencePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SignedEvidencePayload>;

    if (
      parsed.v !== SIGNED_EVIDENCE_LINK_VERSION ||
      typeof parsed.exp !== "number" ||
      typeof parsed.evidenceId !== "string" ||
      parsed.evidenceId.trim().length === 0
    ) {
      return null;
    }

    return parsed as SignedEvidencePayload;
  } catch {
    return null;
  }
}
