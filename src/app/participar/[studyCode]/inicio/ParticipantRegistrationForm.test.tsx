import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParticipantRegistrationForm } from "./ParticipantRegistrationForm";

vi.mock("@/modules/participant-portal/registration-actions", () => ({
  registerParticipantPortalAction: vi.fn()
}));

describe("ParticipantRegistrationForm", () => {
  it("uses the neutral initial action state without requiring extra exports from the server action file", () => {
    render(
      <ParticipantRegistrationForm
        privacyNoticeText="Aviso de privacidad del estudio."
        studyCode="FMASCULINA-NAVIGO-2026"
      />
    );

    expect(screen.getByRole("button", { name: "Completar registro" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders required registration and consent fields", () => {
    render(
      <ParticipantRegistrationForm
        privacyNoticeText="Aviso de privacidad del estudio."
        studyCode="FMASCULINA-NAVIGO-2026"
      />
    );

    expect(screen.getByLabelText("Nombre completo")).toBeRequired();
    expect(screen.getByLabelText("Celular")).toBeRequired();
    expect(screen.getByLabelText("Confirmar celular")).toBeRequired();
    expect(screen.getByText("Aviso de privacidad del estudio.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "He le\u00eddo el aviso de privacidad y acepto el tratamiento de mis datos personales para participar en este estudio."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Otorgo mi consentimiento expreso para el tratamiento de la informaci\u00f3n de salud/)
    ).toBeInTheDocument();
  });

  it("normalizes the participant name while typing without losing the separator between words", () => {
    render(
      <ParticipantRegistrationForm
        privacyNoticeText="Aviso de privacidad del estudio."
        studyCode="FMASCULINA-NAVIGO-2026"
      />
    );

    const nameInput = screen.getByLabelText("Nombre completo");
    fireEvent.change(nameInput, { target: { value: "  ni\u00f1a \u00e1mbar \ud83d\ude00 " } });

    expect(nameInput).toHaveValue("NI\u00d1A \u00c1MBAR ");
    fireEvent.blur(nameInput);
    expect(nameInput).toHaveValue("NI\u00d1A \u00c1MBAR");
  });
});
