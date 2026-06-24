import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE,
  PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
  PARTICIPANT_PORTAL_SPAM_HINT_MESSAGE
} from "@/modules/participant-portal/access";
import ParticipantPortalVerifyPage from "./page";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "persona@example.com" }))
  }))
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("@/modules/participant-portal/actions", () => ({
  verifyParticipantPortalOtpAction: vi.fn()
}));

describe("ParticipantPortalVerifyPage", () => {
  it("shows generic OTP copy without mentioning six digits", async () => {
    render(
      await ParticipantPortalVerifyPage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({ sent: "1" })
      })
    );

    expect(screen.getByText(PARTICIPANT_PORTAL_OTP_SENT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText("Código de acceso")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Código de acceso")).toBeInTheDocument();
    expect(screen.queryByText(/6 dígitos/i)).not.toBeInTheDocument();
    expect(screen.getByText(PARTICIPANT_PORTAL_SPAM_HINT_MESSAGE)).toBeInTheDocument();
  });

  it("shows format validation message in Spanish", async () => {
    render(
      await ParticipantPortalVerifyPage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({ error: "format" })
      })
    );

    expect(screen.getByText(PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE)).toBeInTheDocument();
  });
});
