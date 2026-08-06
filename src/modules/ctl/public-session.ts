import { createHmac, timingSafeEqual } from "node:crypto";

const CTL_PUBLIC_SESSION_COOKIE_PREFIX = "ctl_public_session_";
const CTL_PUBLIC_SESSION_TTL_SECONDS = 12 * 60 * 60;
const CTL_PUBLIC_SESSION_VERSION = 1;

type CtlPublicSessionPayload = {
  ctlInterviewerCodeId: string;
  exp: number;
  studyCode: string;
  v: typeof CTL_PUBLIC_SESSION_VERSION;
};

export type CtlPublicSession = {
  ctlInterviewerCodeId: string;
  maxAgeSeconds: number;
  studyCode: string;
};

export function ctlPublicSessionCookieName(studyCode: string): string {
  return `${CTL_PUBLIC_SESSION_COOKIE_PREFIX}${studyCode.toUpperCase()}`;
}

export function ctlPublicSessionMaxAgeSeconds(): number {
  return CTL_PUBLIC_SESSION_TTL_SECONDS;
}

export function createCtlPublicSessionToken({
  ctlInterviewerCodeId,
  now = new Date(),
  secret,
  studyCode
}: {
  ctlInterviewerCodeId: string;
  now?: Date;
  secret: string;
  studyCode: string;
}): string {
  const payload: CtlPublicSessionPayload = {
    ctlInterviewerCodeId,
    exp: Math.floor(now.getTime() / 1000) + CTL_PUBLIC_SESSION_TTL_SECONDS,
    studyCode: studyCode.toUpperCase(),
    v: CTL_PUBLIC_SESSION_VERSION
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function readCtlPublicSessionToken({
  now = new Date(),
  secret,
  studyCode,
  token
}: {
  now?: Date;
  secret: string;
  studyCode: string;
  token: string | undefined;
}): CtlPublicSession | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEquals(signature, signPayload(encodedPayload, secret))) {
    return null;
  }

  const payload = parsePayload(encodedPayload);

  if (!payload || payload.v !== CTL_PUBLIC_SESSION_VERSION || payload.studyCode !== studyCode.toUpperCase()) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (payload.exp <= nowSeconds) {
    return null;
  }

  return {
    ctlInterviewerCodeId: payload.ctlInterviewerCodeId,
    maxAgeSeconds: Math.min(CTL_PUBLIC_SESSION_TTL_SECONDS, payload.exp - nowSeconds),
    studyCode: payload.studyCode
  };
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

function parsePayload(encodedPayload: string): CtlPublicSessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<CtlPublicSessionPayload>;

    if (
      parsed.v !== CTL_PUBLIC_SESSION_VERSION ||
      typeof parsed.ctlInterviewerCodeId !== "string" ||
      typeof parsed.studyCode !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed as CtlPublicSessionPayload;
  } catch {
    return null;
  }
}
