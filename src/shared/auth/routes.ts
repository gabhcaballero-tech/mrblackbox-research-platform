const PUBLIC_FILE_PATTERN =
  /\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|txt|webmanifest|webp|woff2?)$/i;

const INTERNAL_ENTRY_PATHS = ["/admin", "/field", "/exports"] as const;

export type InternalRouteDecision =
  | { action: "allow" }
  | { action: "redirect"; destination: string };

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/unauthorized" ||
    pathname === "/api/health" ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/participar/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export function isInternalPath(pathname: string): boolean {
  return INTERNAL_ENTRY_PATHS.some(
    (entryPath) => pathname === entryPath || pathname.startsWith(`${entryPath}/`)
  );
}

export function sanitizeInternalNextPath(value: unknown, fallback = "/admin"): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate !== "string") {
    return fallback;
  }

  const trimmed = candidate.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return fallback;
  }

  if (!isInternalPath(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export function getLoginRedirectPath(pathname: string): string {
  const nextPath = sanitizeInternalNextPath(pathname);
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function getInternalRouteDecision(pathname: string, hasSession: boolean): InternalRouteDecision {
  if (isPublicPath(pathname) || !isInternalPath(pathname)) {
    return { action: "allow" };
  }

  if (!hasSession) {
    return { action: "redirect", destination: getLoginRedirectPath(pathname) };
  }

  return { action: "allow" };
}
