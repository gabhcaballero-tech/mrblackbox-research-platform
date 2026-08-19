import { NextResponse, type NextRequest } from "next/server";

const V1_PARTICIPANT_ROUTE_PREFIXES = ["/participar/", "/p/", "/ctl/", "/hut/p/", "/hut/register/"];
const V1_PARTICIPANT_ROUTE_EXACT = new Set(["/participar", "/migracion-v1"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isV1ParticipantRoute(pathname) && pathname !== "/migracion-v1") {
    const url = request.nextUrl.clone();
    url.pathname = "/migracion-v1";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

function isV1ParticipantRoute(pathname: string): boolean {
  return V1_PARTICIPANT_ROUTE_EXACT.has(pathname) || V1_PARTICIPANT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const config = {
  matcher: ["/participar/:path*", "/p/:path*", "/ctl/:path*", "/hut/p/:path*", "/hut/register/:path*"]
};
