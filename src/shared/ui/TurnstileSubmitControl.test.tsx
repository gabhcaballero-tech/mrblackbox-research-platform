import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TurnstileSubmitControl } from "./TurnstileSubmitControl";

vi.mock("next/script", () => ({
  default: ({ onReady }: { onReady?: () => void }) => {
    onReady?.();
    return null;
  }
}));

describe("TurnstileSubmitControl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  });

  it("starts disabled until captcha token exists", async () => {
    window.turnstile = {
      render: vi.fn(() => "widget-1"),
      reset: vi.fn()
    };

    render(
      <form>
        <TurnstileSubmitControl buttonLabel="Enviar código" />
      </form>
    );

    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    expect(screen.getByText("Completa la verificación de seguridad.")).toBeInTheDocument();
  });

  it("enables the button once Turnstile provides a token", async () => {
    let callback: ((token: string) => void) | undefined;
    window.turnstile = {
      render: vi.fn((_, options) => {
        callback = options.callback;
        return "widget-1";
      }),
      reset: vi.fn()
    };

    render(
      <form>
        <TurnstileSubmitControl buttonLabel="Enviar código" />
      </form>
    );

    callback?.("token-1");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Enviar código" })).toBeEnabled();
    });
    expect(screen.getByText("Verificación de seguridad completada.")).toBeInTheDocument();
  });

  it("resets the token and widget when resetKey changes after a server error", async () => {
    let callback: ((token: string) => void) | undefined;
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn((_, options) => {
        callback = options.callback;
        return "widget-1";
      }),
      reset
    };

    const { rerender } = render(
      <form>
        <TurnstileSubmitControl buttonLabel="Iniciar sesión" resetKey="first" />
      </form>
    );

    callback?.("token-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled());

    rerender(
      <form>
        <TurnstileSubmitControl buttonLabel="Iniciar sesión" resetKey="second" />
      </form>
    );

    await waitFor(() => {
      expect(reset).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
    });
    expect(screen.getByText("Completa la verificación de seguridad.")).toBeInTheDocument();
  });

  it("shows a visible captcha error and resets when the widget fails", async () => {
    let errorCallback: (() => void) | undefined;
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn((_, options) => {
        errorCallback = options["error-callback"];
        return "widget-1";
      }),
      reset
    };

    render(
      <form>
        <TurnstileSubmitControl buttonLabel="Iniciar sesión" />
      </form>
    );

    errorCallback?.();

    await waitFor(() => {
      expect(screen.getByText("No fue posible validar la verificación de seguridad. Intenta nuevamente.")).toBeInTheDocument();
      expect(reset).toHaveBeenCalled();
    });
  });

  it("shows an expiration message and disables submit when the token expires", async () => {
    let callback: ((token: string) => void) | undefined;
    let expiredCallback: (() => void) | undefined;
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn((_, options) => {
        callback = options.callback;
        expiredCallback = options["expired-callback"];
        return "widget-1";
      }),
      reset
    };

    render(
      <form>
        <TurnstileSubmitControl buttonLabel="Comenzar registro" />
      </form>
    );

    callback?.("token-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Comenzar registro" })).toBeEnabled());

    expiredCallback?.();

    await waitFor(() => {
      expect(screen.getByText("La verificación de seguridad venció. Complétala nuevamente.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Comenzar registro" })).toBeDisabled();
      expect(reset).toHaveBeenCalled();
    });
  });

  it("submits the form when the token is valid without entering a fake pending state first", async () => {
    let callback: ((token: string) => void) | undefined;
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    window.turnstile = {
      render: vi.fn((_, options) => {
        callback = options.callback;
        return "widget-1";
      }),
      reset: vi.fn()
    };

    render(
      <form onSubmit={handleSubmit}>
        <TurnstileSubmitControl buttonLabel="Comenzar registro" pendingLabel="Guardando..." />
      </form>
    );

    callback?.("token-1");
    const button = await screen.findByRole("button", { name: "Comenzar registro" });

    fireEvent.click(button);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Guardando..." })).not.toBeInTheDocument();
  });

  it("does not submit or enter pending when the token is missing", () => {
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    window.turnstile = {
      render: vi.fn(() => "widget-1"),
      reset: vi.fn()
    };

    render(
      <form onSubmit={handleSubmit}>
        <TurnstileSubmitControl buttonLabel="Comenzar registro" pendingLabel="Guardando..." />
      </form>
    );

    const button = screen.getByRole("button", { name: "Comenzar registro" });
    fireEvent.click(button);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardando..." })).not.toBeInTheDocument();
    expect(screen.getByText("Completa la verificación de seguridad.")).toBeInTheDocument();
  });
});
