const PUBLIC_FILE_PATTERN =
  /\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|txt|webmanifest|webp|woff2?)$/i;

const INTERNAL_ENTRY_PATHS = ["/admin", "/field", "/exports"] as const;
const PUBLIC_CTL_PATTERN = /^\/ctl\/[^/]+(?:\/sessions\/[^/]+)?\/?$/;
const PUBLIC_FIELD_SCREENING_NEW_PATTERN = /^\/field\/studies\/[^/]+\/screening\/new$/;
const PUBLIC_FIELD_SCREENING_ATTEMPT_PATTERN = /^\/field\/screening\/[^/]+(?:\/result|\/selfie|\/evidences)?$/;
const PUBLIC_HUT_PARTICIPANT_PATTERN = /^\/hut\/p\/[^/]+(?:\/photo\/[^/]+)?\/?$/;
const PUBLIC_HUT_REGISTRATION_PATTERN = /^\/hut\/register\/[^/]+\/?$/;

export type InternalRouteDecision =
  | { action: "allow" }
  | { action: "redirect"; destination: string };

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/unauthorized" ||
    pathname === "/api/health" ||
    isPublicCtlPath(pathname) ||
    isPublicHutParticipantPath(pathname) ||
    isPublicHutRegistrationPath(pathname) ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/participar/") ||
    PUBLIC_FIELD_SCREENING_NEW_PATTERN.test(pathname) ||
    PUBLIC_FIELD_SCREENING_ATTEMPT_PATTERN.test(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export function isPublicCtlPath(pathname: string): boolean {
  return PUBLIC_CTL_PATTERN.test(pathname);
}

export function isPublicHutParticipantPath(pathname: string): boolean {
  return PUBLIC_HUT_PARTICIPANT_PATTERN.test(pathname);
}

export function isPublicHutRegistrationPath(pathname: string): boolean {
  return PUBLIC_HUT_REGISTRATION_PATTERN.test(pathname);
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
