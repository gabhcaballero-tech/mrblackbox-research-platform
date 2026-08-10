import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { processRemindersMock } = vi.hoisted(() => ({
  processRemindersMock: vi.fn()
}));

vi.mock("@/modules/hut", () => ({
  createHutRepository: () => ({
    processPhotoWhatsAppReminders: processRemindersMock
  })
}));

describe("HUT photo reminder cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HUT_REMINDER_CRON_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    vi.stubEnv("NODE_ENV", "test");
    processRemindersMock.mockResolvedValue({
      data: {
        failed: [],
        processed: 1,
        sent: 1,
        skipped: 0
      },
      ok: true
    });
  });

  it("registers the Vercel cron every hour for the HUT reminders endpoint", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/hut/reminders",
      schedule: "0 * * * *"
    });
  });

  it("processes due HUT photo reminders with the dedicated cron secret", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?studyId=study-1", {
        headers: {
          authorization: "Bearer hut-secret"
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
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.CRON_SECRET = "vercel-secret";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders", {
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
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders", {
        headers: {
          authorization: "Bearer wrong"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(processRemindersMock).not.toHaveBeenCalled();
  });
});
