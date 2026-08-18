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
    delete process.env.WHATSAPP_AUTOMATION_ENABLED;
    delete process.env.WHATSAPP_NAVIGO_AUTO_SEND_ENABLED;
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

  it("does not register the V1 Navigo reminders cron in Vercel", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({
      path: "/api/navigo/reminders"
    }));
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

  it("does not process Navigo reminders when V1 operational communications are disabled", async () => {
    process.env.NAVIGO_REMINDER_CRON_SECRET = "navigo-secret";
    process.env.WHATSAPP_AUTOMATION_ENABLED = "false";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/navigo/reminders", {
        headers: {
          authorization: "Bearer navigo-secret"
        },
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      code: "AUTOMATION_DISABLED",
      message: "Comunicación operativa deshabilitada en V1. Utilice V2.",
      ok: false
    });
    expect(response.status).toBe(200);
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("does not process Navigo reminders when Navigo automatic sends are disabled", async () => {
    process.env.NAVIGO_REMINDER_CRON_SECRET = "navigo-secret";
    process.env.WHATSAPP_NAVIGO_AUTO_SEND_ENABLED = "false";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/navigo/reminders", {
        headers: {
          authorization: "Bearer navigo-secret"
        },
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      code: "AUTOMATION_DISABLED",
      message: "Comunicación operativa deshabilitada en V1. Utilice V2.",
      ok: false
    });
    expect(response.status).toBe(200);
    expect(processRemindersMock).not.toHaveBeenCalled();
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
