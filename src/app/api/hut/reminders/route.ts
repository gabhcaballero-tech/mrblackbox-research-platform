import { NextResponse, type NextRequest } from "next/server";
import { createHutRepository } from "@/modules/hut";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return processHutRemindersRequest(request);
}

export async function GET(request: NextRequest) {
  return processHutRemindersRequest(request);
}

async function processHutRemindersRequest(request: NextRequest) {
  const secrets = [
    process.env.HUT_REMINDER_CRON_SECRET,
    process.env.CRON_SECRET
  ].filter((value): value is string => Boolean(value));

  if (secrets.length > 0) {
    const authorization = request.headers.get("authorization");

    if (!secrets.some((secret) => authorization === `Bearer ${secret}`)) {
      return NextResponse.json({ message: "Unauthorized", ok: false }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Cron secret not configured", ok: false }, { status: 500 });
  }

  const requestOrigin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    request.nextUrl.origin;
  const studyId = request.nextUrl.searchParams.get("studyId") ?? undefined;
  const result = await createHutRepository().processPhotoWhatsAppReminders({
    requestOrigin,
    studyId
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
