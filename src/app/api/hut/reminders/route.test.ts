import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { auditLogCreateMock, processRemindersMock } = vi.hoisted(() => ({
  auditLogCreateMock: vi.fn(),
  processRemindersMock: vi.fn()
}));

vi.mock("@/modules/hut", () => ({
  createHutRepository: () => ({
    processPhotoWhatsAppReminders: processRemindersMock
  })
}));

vi.mock("@/shared/db/client", () => ({
  createPrismaClient: async () => ({
    auditLog: {
      create: auditLogCreateMock
    }
  })
}));

describe("HUT photo reminder cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HUT_REMINDER_CRON_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.WHATSAPP_AUTOMATION_ENABLED;
    delete process.env.WHATSAPP_HUT_AUTO_SEND_ENABLED;
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
    auditLogCreateMock.mockResolvedValue({});
  });

  it("does not register the V1 HUT reminders cron in Vercel", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({
      path: "/api/hut/reminders"
    }));
  });

  it("processes due HUT photo reminders with the dedicated cron secret", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?studyId=study-1&now=2026-08-09T21:30:00.000Z", {
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
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(processRemindersMock).toHaveBeenCalledWith({
      now: new Date("2026-08-09T21:30:00.000Z"),
      requestOrigin: "https://mrblackbox-research-platform.vercel.app",
      studyId: "study-1"
    });
  });

  it("does not process HUT reminders when V1 operational communications are disabled", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.WHATSAPP_AUTOMATION_ENABLED = "false";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
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
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("does not process HUT reminders when HUT automatic sends are disabled", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.WHATSAPP_HUT_AUTO_SEND_ENABLED = "false";

    const response = await POST(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
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
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("uses the configured production origin even when Vercel cron hits a preview deployment", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform-2dozm0xm7-oneui.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(processRemindersMock).toHaveBeenCalledWith({
      now: new Date("2026-08-09T21:30:00.000Z"),
      requestOrigin: "https://mrblackbox-research-platform.vercel.app",
      studyId: undefined
    });
  });

  it("also accepts the standard Vercel CRON_SECRET header", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.CRON_SECRET = "vercel-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer vercel-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(processRemindersMock).toHaveBeenCalledWith({
      now: new Date("2026-08-09T21:30:00.000Z"),
      requestOrigin: "https://mrblackbox-research-platform.vercel.app",
      studyId: undefined
    });
  });

  it("does not process HUT reminders outside the afternoon operating window", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-10T10:00:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
        }
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      data: {
        reason: "OUTSIDE_OPERATIONAL_WINDOW"
      },
      ok: true
    });
    expect(response.status).toBe(200);
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PARTICIPANT_MODIFIED",
        entityId: "/api/hut/reminders",
        entityType: "System",
        reason: "HUT_REMINDER_BLOCKED",
        afterJson: expect.objectContaining({
          endpoint: "/api/hut/reminders",
          reason: "OUTSIDE_OPERATIONAL_WINDOW"
        })
      })
    });
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("rejects production cron execution from non-production Vercel deployments", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform.vercel.app";
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "preview";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform-2dozm0xm7-oneui.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
        }
      })
    );

    expect(response.status).toBe(403);
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "/api/hut/reminders",
        entityType: "System",
        reason: "HUT_REMINDER_BLOCKED",
        afterJson: expect.objectContaining({
          deploymentEnvironment: "preview",
          reason: "WRONG_ENVIRONMENT"
        })
      })
    });
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("rejects HUT reminder cron when the public production origin is not configured", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
        }
      })
    );

    expect(response.status).toBe(500);
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "/api/hut/reminders",
        entityType: "System",
        reason: "HUT_REMINDER_BLOCKED",
        afterJson: expect.objectContaining({
          publicOrigin: null,
          reason: "INVALID_ORIGIN"
        })
      })
    });
    expect(processRemindersMock).not.toHaveBeenCalled();
  });

  it("blocks configured preview origins before processing HUT reminders", async () => {
    process.env.HUT_REMINDER_CRON_SECRET = "hut-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://mrblackbox-research-platform-2dozm0xm7-oneui.vercel.app";

    const response = await GET(
      new NextRequest("https://mrblackbox-research-platform.vercel.app/api/hut/reminders?now=2026-08-09T21:30:00.000Z", {
        headers: {
          authorization: "Bearer hut-secret"
        }
      })
    );

    expect(response.status).toBe(500);
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: "HUT_REMINDER_BLOCKED",
        afterJson: expect.objectContaining({
          publicOrigin: "https://mrblackbox-research-platform-2dozm0xm7-oneui.vercel.app",
          reason: "INVALID_ORIGIN"
        })
      })
    });
    expect(processRemindersMock).not.toHaveBeenCalled();
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
