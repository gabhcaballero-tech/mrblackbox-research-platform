import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const PUBLIC_SESSION_COOKIE_PREFIX = "participant_portal_public_session_";
const PUBLIC_SESSION_TTL_SECONDS = 24 * 60 * 60;
const PUBLIC_SESSION_VERSION = 1;

type PublicPortalSessionPayload = {
  exp: number;
  identityId: string;
  studyCode: string;
  v: typeof PUBLIC_SESSION_VERSION;
};

export type PublicPortalSession = {
  identityId: string;
  maxAgeSeconds: number;
  studyCode: string;
};

export function participantPortalPublicSessionCookieName(studyCode: string): string {
  return `${PUBLIC_SESSION_COOKIE_PREFIX}${studyCode.toUpperCase()}`;
}

export function createPublicPortalIdentityId(): string {
  return randomUUID();
}

export function createPublicPortalSessionToken({
  identityId,
  now = new Date(),
  secret,
  studyCode
}: {
  identityId: string;
  now?: Date;
  secret: string;
  studyCode: string;
}): string {
  const payload: PublicPortalSessionPayload = {
    exp: Math.floor(now.getTime() / 1000) + PUBLIC_SESSION_TTL_SECONDS,
    identityId,
    studyCode: studyCode.toUpperCase(),
    v: PUBLIC_SESSION_VERSION
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function readPublicPortalSessionToken({
  now = new Date(),
  secret,
  studyCode,
  token
}: {
  now?: Date;
  secret: string;
  studyCode: string;
  token: string | undefined;
}): PublicPortalSession | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEquals(signature, signPayload(encodedPayload, secret))) {
    return null;
  }

  const payload = parsePayload(encodedPayload);

  if (!payload || payload.v !== PUBLIC_SESSION_VERSION || payload.studyCode !== studyCode.toUpperCase()) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (payload.exp <= nowSeconds) {
    return null;
  }

  return {
    identityId: payload.identityId,
    maxAgeSeconds: Math.min(PUBLIC_SESSION_TTL_SECONDS, payload.exp - nowSeconds),
    studyCode: payload.studyCode
  };
}

export function publicPortalSessionMaxAgeSeconds(): number {
  return PUBLIC_SESSION_TTL_SECONDS;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function parsePayload(encodedPayload: string): PublicPortalSessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<PublicPortalSessionPayload>;

    if (
      parsed.v !== PUBLIC_SESSION_VERSION ||
      typeof parsed.identityId !== "string" ||
      typeof parsed.studyCode !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed as PublicPortalSessionPayload;
  } catch {
    return null;
  }
}
