import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  OTP_GENERIC_SENT_MESSAGE,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE
} from "@/shared/auth/passwordless";
import LoginPage from "./page";

vi.mock("./actions", () => ({
  requestOtpLoginAction: vi.fn(),
  signInWithPasswordAction: vi.fn(),
  verifyOtpLoginAction: vi.fn()
}));

describe("LoginPage", () => {
  it("keeps password login visible", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Contraseña" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar con código" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("shows password errors without removing the password form", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "credentials" }) }));

    expect(screen.getByText("No se pudo iniciar sesión con esas credenciales.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("shows the request-code form", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ mode: "otp", next: "/field" }) }));

    expect(screen.getByRole("link", { name: "Entrar con código" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeInTheDocument();
  });

  it("shows generic sent message on verify step", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          email: "entrevistador@example.com",
          mode: "otp",
          next: "/field",
          step: "verify"
        })
      })
    );

    expect(screen.getByText(OTP_GENERIC_SENT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("entrevistador@example.com");
    expect(screen.getByLabelText("Código de 6 dígitos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solicitar nuevo código" })).toBeInTheDocument();
  });

  it("shows invalid email, invalid code and unauthorized messages", async () => {
    const invalidEmail = await LoginPage({
      searchParams: Promise.resolve({ mode: "otp", otpError: "email" })
    });
    const { rerender } = render(invalidEmail);
    expect(screen.getByText(OTP_INVALID_EMAIL_MESSAGE)).toBeInTheDocument();

    rerender(
      await LoginPage({
        searchParams: Promise.resolve({ mode: "otp", otpError: "invalid", step: "verify" })
      })
    );
    expect(screen.getByText(OTP_INVALID_MESSAGE)).toBeInTheDocument();

    rerender(
      await LoginPage({
        searchParams: Promise.resolve({ mode: "otp", otpError: "unauthorized", step: "verify" })
      })
    );
    expect(screen.getByText(OTP_UNAUTHORIZED_MESSAGE)).toBeInTheDocument();
  });
});
