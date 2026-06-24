import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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
    const renderMock = vi.fn(() => "widget-1");
    window.turnstile = {
      render: renderMock,
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
  });

  it("resets the token and widget when resetKey changes after success or error", async () => {
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
});
