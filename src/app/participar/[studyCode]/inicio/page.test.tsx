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

vi.mock("@/modules/participant-portal/evidence-repository", () => ({
  createParticipantPortalEvidenceRepository: vi.fn(() => ({}))
}));

vi.mock("@/modules/participant-portal/evidence-service", () => ({
  getParticipantPortalSelfieScreen: vi.fn()
}));

vi.mock("./ParticipantRegistrationForm", () => ({
  ParticipantRegistrationForm: ({ studyCode }: { studyCode: string }) => (
    <div data-testid="registration-form">Formulario {studyCode}</div>
  )
}));

vi.mock("./ParticipantSelfieStep", () => ({
  ParticipantSelfieStep: ({
    screen,
    showRegistrationSuccess
  }: {
    screen: { selfieComplete: boolean; study: { code: string } };
    showRegistrationSuccess: boolean;
  }) => (
    <div data-testid="selfie-step">
      selfie:{String(screen.selfieComplete)} success:{String(showRegistrationSuccess)} study:{screen.study.code}
    </div>
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

  it("shows the selfie step after a successful 303 redirect instead of returning to an empty form", async () => {
    const { getParticipantPortalSelfieScreen } = await import("@/modules/participant-portal/evidence-service");
    vi.mocked(getParticipantPortalSelfieScreen).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        counts: { perfumePhotos: 0, selfie: 0 },
        selfieComplete: false,
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
    expect(screen.getByTestId("selfie-step")).toHaveTextContent("selfie:false success:true");
  });

  it("does not use registered=1 as the source of truth when there is no real registration data", async () => {
    const { getParticipantPortalSelfieScreen } = await import("@/modules/participant-portal/evidence-service");
    vi.mocked(getParticipantPortalSelfieScreen).mockResolvedValueOnce({
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
    expect(screen.queryByTestId("selfie-step")).not.toBeInTheDocument();
  });

  it("shows the continue state when the participant already has a registered selfie", async () => {
    const { getParticipantPortalSelfieScreen } = await import("@/modules/participant-portal/evidence-service");
    vi.mocked(getParticipantPortalSelfieScreen).mockResolvedValueOnce({
      data: {
        attemptId: "attempt-1",
        counts: { perfumePhotos: 0, selfie: 1 },
        selfieComplete: true,
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

    expect(screen.getByText("Registro completo")).toBeInTheDocument();
    expect(screen.getByTestId("selfie-step")).toHaveTextContent("selfie:true success:false");
  });
});
