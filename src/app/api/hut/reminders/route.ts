import { NextResponse, type NextRequest } from "next/server";
import { createHutRepository } from "@/modules/hut";
import {
  V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
  areV1HutAutomaticCommunicationsDisabled
} from "@/modules/oneui-whatsapp";
import { MEXICO_CITY_TIME_ZONE } from "@/shared/utils/date-format";
import { createPrismaClient } from "@/shared/db/client";
import { DEFAULT_PUBLIC_APP_ORIGIN, resolveConfiguredPublicOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type HutReminderBlockedReason = "INVALID_ORIGIN" | "OUTSIDE_OPERATIONAL_WINDOW" | "WRONG_ENVIRONMENT";

type HutReminderAuditPrisma = {
  auditLog: {
    create: (input: {
      data: {
        action: "PARTICIPANT_MODIFIED";
        actorUserId: null;
        afterJson: Record<string, unknown>;
        beforeJson: null;
        createdAt: Date;
        entityId: string;
        entityType: string;
        reason: string;
      };
    }) => Promise<unknown>;
  };
};

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

  if (areV1HutAutomaticCommunicationsDisabled()) {
    return NextResponse.json({
      code: "AUTOMATION_DISABLED",
      message: V1_OPERATIONAL_COMMUNICATIONS_DISABLED_MESSAGE,
      ok: false
    });
  }

  const now = resolveCronNow(request);

  if (!isProductionCronEnvironment()) {
    await auditHutReminderBlocked({
      now,
      publicOrigin: resolveConfiguredPublicOrigin(),
      reason: "WRONG_ENVIRONMENT",
      request
    });
    return NextResponse.json({ message: "HUT reminders only run in production deployments.", ok: false }, { status: 403 });
  }

  const requestOrigin = resolveConfiguredPublicOrigin();
  if (!isAllowedPublicOrigin(requestOrigin)) {
    await auditHutReminderBlocked({
      now,
      publicOrigin: requestOrigin,
      reason: "INVALID_ORIGIN",
      request
    });
    return NextResponse.json({ message: "Public production origin is not configured.", ok: false }, { status: 500 });
  }

  if (!isWithinHutPhotoReminderOperationalWindow(now)) {
    await auditHutReminderBlocked({
      now,
      publicOrigin: requestOrigin,
      reason: "OUTSIDE_OPERATIONAL_WINDOW",
      request
    });
    return NextResponse.json({
      data: {
        reason: "OUTSIDE_OPERATIONAL_WINDOW"
      },
      message: "HUT reminders run only from 15:00 to 18:00 hrs CDMX.",
      ok: true
    });
  }

  const studyId = request.nextUrl.searchParams.get("studyId") ?? undefined;
  const result = await createHutRepository().processPhotoWhatsAppReminders({
    now,
    requestOrigin,
    studyId
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

function resolveCronNow(request: NextRequest): Date {
  const testNow = process.env.NODE_ENV !== "production" ? request.nextUrl.searchParams.get("now") : null;
  const parsed = testNow ? new Date(testNow) : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function isProductionCronEnvironment(): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  return process.env.VERCEL_ENV === "production";
}

function isAllowedPublicOrigin(publicOrigin: string | null): publicOrigin is string {
  const allowedOrigin = (process.env.HUT_WHATSAPP_ALLOWED_PUBLIC_ORIGIN ?? DEFAULT_PUBLIC_APP_ORIGIN).replace(/\/+$/g, "");

  return Boolean(publicOrigin && publicOrigin === allowedOrigin);
}

function isWithinHutPhotoReminderOperationalWindow(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: MEXICO_CITY_TIME_ZONE
  }).format(now));

  return hour >= 15 && hour < 18;
}

async function auditHutReminderBlocked({
  now,
  publicOrigin,
  reason,
  request
}: {
  now: Date;
  publicOrigin: string | null;
  reason: HutReminderBlockedReason;
  request: NextRequest;
}) {
  try {
    const prisma = await createPrismaClient() as unknown as HutReminderAuditPrisma;
    await prisma.auditLog.create({
      data: {
        action: "PARTICIPANT_MODIFIED",
        actorUserId: null,
        afterJson: {
          deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
          deploymentUrl: process.env.VERCEL_URL ?? null,
          endpoint: "/api/hut/reminders",
          publicOrigin,
          reason,
          requestHost: request.headers.get("host"),
          requestOrigin: request.nextUrl.origin,
          triggeredAtMexicoCity: new Intl.DateTimeFormat("es-MX", {
            day: "2-digit",
            hour: "2-digit",
            hourCycle: "h23",
            minute: "2-digit",
            month: "2-digit",
            timeZone: MEXICO_CITY_TIME_ZONE,
            year: "numeric"
          }).format(now)
        },
        beforeJson: null,
        createdAt: now,
        entityId: "/api/hut/reminders",
        entityType: "System",
        reason: "HUT_REMINDER_BLOCKED"
      }
    });
  } catch (error) {
    console.error("hut reminder blocked audit failed", {
      error,
      reason
    });
  }
}
