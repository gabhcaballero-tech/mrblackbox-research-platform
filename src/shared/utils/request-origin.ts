const LOCAL_ORIGIN = "http://localhost:3000";
export const DEFAULT_PUBLIC_APP_ORIGIN = "https://mrblackbox-research-platform.vercel.app";

export function resolveRequestOrigin(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (host) {
    return `${forwardedProto || inferProtocol(host)}://${host}`;
  }

  const configured =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.NEXT_PUBLIC_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/g, "");
  }

  if (env.VERCEL_URL?.trim()) {
    return `https://${env.VERCEL_URL.trim().replace(/\/+$/g, "")}`;
  }

  return LOCAL_ORIGIN;
}

export function resolvePublicRequestOrigin(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): string {
  return resolveConfiguredPublicOrigin(env) ?? resolveRequestOrigin(headers, env);
}

export function resolvePublicLinkOrigin(fallbackOrigin: string, env: Partial<NodeJS.ProcessEnv> = process.env): string {
  return resolveConfiguredPublicOrigin(env) ?? normalizeOrigin(fallbackOrigin) ?? LOCAL_ORIGIN;
}

export function resolveConfiguredPublicOrigin(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  return (
    normalizeOrigin(env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(env.APP_URL) ??
    normalizeOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(env.NEXT_PUBLIC_BASE_URL)
  );
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/g, "");

  return trimmed || null;
}

function inferProtocol(host: string): "http" | "https" {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
}
