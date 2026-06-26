import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const NAVIGO_TEST_MODE_VERSION = 1;
const NAVIGO_TEST_MODE_TTL_SECONDS = 2 * 60 * 60;

type NavigoTestModePayload = {
  exp: number;
  tokenHash: string;
  v: typeof NAVIGO_TEST_MODE_VERSION;
};

export type NavigoTestModeParams = {
  navigoTestMode: string;
  navigoTestSignature: string;
};

export function createNavigoTestModeParams({
  now = new Date(),
  secret,
  token
}: {
  now?: Date;
  secret: string | undefined;
  token: string;
}): NavigoTestModeParams | null {
  if (!secret) {
    return null;
  }

  const payload: NavigoTestModePayload = {
    exp: Math.floor(now.getTime() / 1000) + NAVIGO_TEST_MODE_TTL_SECONDS,
    tokenHash: hashToken(token),
    v: NAVIGO_TEST_MODE_VERSION
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return {
    navigoTestMode: encodedPayload,
    navigoTestSignature: signPayload(encodedPayload, secret)
  };
}

export function isValidNavigoTestMode({
  mode,
  now = new Date(),
  secret,
  signature,
  token
}: {
  mode?: string | null;
  now?: Date;
  secret: string | undefined;
  signature?: string | null;
  token: string;
}): boolean {
  if (!secret || !mode || !signature || !safeEquals(signature, signPayload(mode, secret))) {
    return false;
  }

  const payload = parsePayload(mode);
  if (!payload || payload.v !== NAVIGO_TEST_MODE_VERSION || payload.tokenHash !== hashToken(token)) {
    return false;
  }

  return payload.exp > Math.floor(now.getTime() / 1000);
}

export function appendNavigoTestModeParams(url: string, params: NavigoTestModeParams | null): string {
  if (!params) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}navigoTestMode=${encodeURIComponent(params.navigoTestMode)}&navigoTestSignature=${encodeURIComponent(params.navigoTestSignature)}`;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePayload(encodedPayload: string): NavigoTestModePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<NavigoTestModePayload>;

    if (
      parsed.v !== NAVIGO_TEST_MODE_VERSION ||
      typeof parsed.exp !== "number" ||
      typeof parsed.tokenHash !== "string"
    ) {
      return null;
    }

    return parsed as NavigoTestModePayload;
  } catch {
    return null;
  }
}
