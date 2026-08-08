import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { processRemindersMock } = vi.hoisted(() => ({
  processRemindersMock: vi.fn()
}));

vi.mock("@/modules/navigo-app/repository", () => ({
  createNavigoAppRepository: () => ({
    processEvaluationWhatsAppReminders: processRemindersMock
  })
}));

describe("Navigo reminder cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NAVIGO_REMINDER_CRON_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    vi.stubEnv("NODE_ENV", "test");
    processRemindersMock.mockResolvedValue({
      data: {
        failed: 0,
        results: [],
        scanned: 1,
        sent: 1,
        skipped: 0
      },
      ok: true
    });
  });

  it("registers the Vercel cron every five minutes for the reminders endpoint", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/navigo/reminders",
      schedule: "*/5 * * * *"
    });
  });

  it("processes due Navigo reminders with the dedicated cron secret", async () => {
    process.env.NAVIGO_REMINDER_CRON_SECRET = "navigo-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/navigo/reminders?studyId=study-1", {
        headers: {
          authorization: "Bearer navigo-secret"
        },
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      data: {
        sent: 1
      },
      ok: true
    });
    expect(response.status).toBe(200);
    expect(processRemindersMock).toHaveBeenCalledWith({
      requestOrigin: "https://mrblackbox-research-platform.vercel.app",
      studyId: "study-1"
    });
  });

  it("also accepts the standard Vercel CRON_SECRET header", async () => {
    process.env.NAVIGO_REMINDER_CRON_SECRET = "navigo-secret";
    process.env.CRON_SECRET = "vercel-secret";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/navigo/reminders", {
        headers: {
          authorization: "Bearer vercel-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(processRemindersMock).toHaveBeenCalledWith({
      requestOrigin: "https://mrblackbox-research-platform.vercel.app",
      studyId: undefined
    });
  });

  it("rejects unauthorized cron requests when a secret is configured", async () => {
    process.env.NAVIGO_REMINDER_CRON_SECRET = "navigo-secret";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/navigo/reminders", {
        headers: {
          authorization: "Bearer wrong"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(processRemindersMock).not.toHaveBeenCalled();
  });
});
