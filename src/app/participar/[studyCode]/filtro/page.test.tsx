import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParticipantPortalFilterPage from "./page";

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: null, id: "public-identity-1", source: "PUBLIC_SESSION" },
    status: "allowed"
  }))
}));

vi.mock("@/modules/participant-portal/access-mode", () => ({
  allowsDirectParticipantAccess: vi.fn(() => true)
}));

vi.mock("@/modules/participant-portal/repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/screener-repository", () => ({
  createParticipantPortalScreenerRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/screener-service", () => ({
  PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE: "Completa tu registro y consentimiento para continuar.",
  getParticipantPortalScreenerScreen: vi.fn(async () => ({
    data: {
      progress: {
        answeredVisibleQuestions: 0,
        currentIndex: 1,
        totalVisibleQuestions: 1
      },
      study: {
        code: "FMASCULINA-NAVIGO-2026",
        id: "study-1",
        name: "Fragancia Masculina"
      }
    },
    ok: true
  }))
}));

vi.mock("./ParticipantScreenerForm", () => ({
  ParticipantScreenerForm: ({ screen }: { screen: { study: { name: string } } }) => (
    <div data-testid="participant-screener-form">Filtro {screen.study.name}</div>
  )
}));

describe("ParticipantPortalFilterPage", () => {
  it("renders the public filter for a participant public session without internal login", async () => {
    render(
      await ParticipantPortalFilterPage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByTestId("participant-screener-form")).toHaveTextContent("Filtro Fragancia Masculina");
    expect(screen.queryByText(/Inicia sesi/i)).not.toBeInTheDocument();
  });

  it("sends direct public visitors without a public session to registration, not login", async () => {
    const { getParticipantPortalAuth } = await import("@/shared/auth/participant-portal");
    vi.mocked(getParticipantPortalAuth).mockResolvedValueOnce({ status: "no_session" });

    render(
      await ParticipantPortalFilterPage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("Completa tu registro para continuar al filtro.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completar registro" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/inicio"
    );
    expect(screen.queryByText(/código enviado|codigo enviado/i)).not.toBeInTheDocument();
  });
});
