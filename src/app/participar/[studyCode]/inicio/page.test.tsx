import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE } from "@/modules/participant-portal/registration-service";
import ParticipantPortalHomePage from "./page";

vi.mock("@/modules/participant-portal/access", () => ({
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE: "Portal no disponible.",
  getParticipantPortalAvailability: vi.fn(async () => ({
    ok: true,
    study: {
      activeScreenerVersionId: "version-1",
      code: "FMASCULINA-NAVIGO-2026",
      id: "study-1",
      name: "Fragancia Masculina",
      portalConfig: {
        enabled: true,
        privacyNoticeText: "Aviso de privacidad."
      },
      status: "ACTIVE"
    }
  }))
}));

vi.mock("@/shared/auth/participant-portal", () => ({
  getParticipantPortalAuth: vi.fn(async () => ({
    identity: { email: "persona@example.com", id: "auth-user-1" },
    status: "allowed"
  }))
}));

vi.mock("@/modules/participant-portal/repository", () => ({
  createParticipantPortalRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/screener-repository", () => ({
  createParticipantPortalScreenerRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/screener-service", () => ({
  PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE: "Completa tu registro y consentimiento para continuar.",
  getParticipantPortalPublicResult: vi.fn()
}));

vi.mock("./ParticipantRegistrationForm", () => ({
  ParticipantRegistrationForm: ({ studyCode }: { studyCode: string }) => (
    <div data-testid="registration-form">Formulario {studyCode}</div>
  )
}));

describe("ParticipantPortalHomePage", () => {
  it("shows direct public registration without asking for OTP when there is no session", async () => {
    const { getParticipantPortalAuth } = await import("@/shared/auth/participant-portal");
    vi.mocked(getParticipantPortalAuth).mockResolvedValueOnce({ status: "no_session" });

    render(
      await ParticipantPortalHomePage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("Para iniciar tu registro, captura tus datos de contacto.")).toBeInTheDocument();
    expect(screen.getByTestId("registration-form")).toBeInTheDocument();
    expect(screen.queryByText(/código enviado/i)).not.toBeInTheDocument();
  });

  it("shows continue-to-filter after a successful 303 redirect instead of returning to an empty form", async () => {
    const { getParticipantPortalPublicResult } = await import("@/modules/participant-portal/screener-service");
    vi.mocked(getParticipantPortalPublicResult).mockResolvedValueOnce({
      data: {
        kind: "IN_PROGRESS",
        message: "Continúa el filtro para completar tus respuestas.",
        showEvidencePlaceholder: false,
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina"
        }
      },
      ok: true
    });

    render(
      await ParticipantPortalHomePage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({ registered: "1" })
      })
    );

    expect(screen.queryByTestId("registration-form")).not.toBeInTheDocument();
    expect(screen.getByText(PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar al filtro" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/filtro"
    );
  });

  it("does not use registered=1 as the source of truth when there is no real registration data", async () => {
    const { getParticipantPortalPublicResult } = await import("@/modules/participant-portal/screener-service");
    vi.mocked(getParticipantPortalPublicResult).mockResolvedValueOnce({
      code: "REGISTRATION_REQUIRED",
      message: "Registro requerido.",
      ok: false
    });

    render(
      await ParticipantPortalHomePage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({ registered: "1" })
      })
    );

    expect(screen.getByTestId("registration-form")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continuar al filtro" })).not.toBeInTheDocument();
  });

  it("shows the current state when the participant already has an existing result", async () => {
    const { getParticipantPortalPublicResult } = await import("@/modules/participant-portal/screener-service");
    vi.mocked(getParticipantPortalPublicResult).mockResolvedValueOnce({
      data: {
        kind: "PENDING_REVIEW",
        message: "Gracias. Tus respuestas están registradas.",
        showEvidencePlaceholder: true,
        study: {
          code: "FMASCULINA-NAVIGO-2026",
          id: "study-1",
          name: "Fragancia Masculina"
        }
      },
      ok: true
    });

    render(
      await ParticipantPortalHomePage({
        params: Promise.resolve({ studyCode: "FMASCULINA-NAVIGO-2026" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("Registro listo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver estado de participación" })).toHaveAttribute(
      "href",
      "/participar/FMASCULINA-NAVIGO-2026/resultado"
    );
  });
});
