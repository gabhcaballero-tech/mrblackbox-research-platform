import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CAPTCHA_ERROR_MESSAGE,
  OTP_COOLDOWN_MESSAGE,
  OTP_GENERIC_SENT_MESSAGE,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_FORMAT_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_SPAM_HINT_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE
} from "@/shared/auth/passwordless";
import LoginPage from "./page";

vi.mock("./actions", () => ({
  requestOtpLoginAction: vi.fn(),
  signInWithPasswordAction: vi.fn(),
  verifyOtpLoginAction: vi.fn()
}));

vi.mock("@/shared/ui/TurnstileSubmitControl", () => ({
  TurnstileSubmitControl: ({ buttonLabel }: { buttonLabel: string }) => (
    <div>
      <div aria-label="Verificación de seguridad">Turnstile</div>
      <p>Completa la verificación de seguridad.</p>
      <button disabled type="submit">
        {buttonLabel}
      </button>
    </div>
  )
}));

describe("LoginPage", () => {
  it("shows Turnstile on password login and keeps submit disabled without captcha token", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByLabelText("Verificación de seguridad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
  });

  it("shows password errors without removing the password form", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "credentials" }) }));

    expect(screen.getByText("No se pudo iniciar sesión con esas credenciales.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("shows captcha error on password login", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "captcha" }) }));

    expect(screen.getByText(CAPTCHA_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it("shows the request-code form with Turnstile and disabled OTP button", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ mode: "otp", next: "/field" }) }));

    expect(screen.getByRole("link", { name: "Entrar con código" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Verificación de seguridad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    expect(screen.getByText(OTP_SPAM_HINT_MESSAGE)).toBeInTheDocument();
  });

  it("shows generic sent message on verify step without mentioning six digits", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          email: "entrevistador@example.com",
          mode: "otp",
          next: "/field",
          sent: "1",
          step: "verify"
        })
      })
    );

    expect(screen.getByText(OTP_GENERIC_SENT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("entrevistador@example.com");
    expect(screen.getByLabelText("Código de acceso")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Código de acceso")).toBeInTheDocument();
    expect(screen.queryByText(/6 dígitos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solicitar nuevo código" })).toBeDisabled();
  });

  it("shows invalid email, captcha, cooldown, invalid code, format and unauthorized messages", async () => {
    const invalidEmail = await LoginPage({
      searchParams: Promise.resolve({ mode: "otp", otpError: "email" })
    });
    const { rerender } = render(invalidEmail);
    expect(screen.getByText(OTP_INVALID_EMAIL_MESSAGE)).toBeInTheDocument();

    rerender(await LoginPage({ searchParams: Promise.resolve({ mode: "otp", otpError: "captcha" }) }));
    expect(screen.getByText(CAPTCHA_ERROR_MESSAGE)).toBeInTheDocument();

    rerender(await LoginPage({ searchParams: Promise.resolve({ mode: "otp", otpError: "cooldown" }) }));
    expect(screen.getByText(OTP_COOLDOWN_MESSAGE)).toBeInTheDocument();

    rerender(
      await LoginPage({
        searchParams: Promise.resolve({ mode: "otp", otpError: "invalid", step: "verify" })
      })
    );
    expect(screen.getByText(OTP_INVALID_MESSAGE)).toBeInTheDocument();

    rerender(
      await LoginPage({
        searchParams: Promise.resolve({ mode: "otp", otpError: "format", step: "verify" })
      })
    );
    expect(screen.getByText(OTP_INVALID_FORMAT_MESSAGE)).toBeInTheDocument();

    rerender(
      await LoginPage({
        searchParams: Promise.resolve({ mode: "otp", otpError: "unauthorized", step: "verify" })
      })
    );
    expect(screen.getByText(OTP_UNAUTHORIZED_MESSAGE)).toBeInTheDocument();
  });
});
