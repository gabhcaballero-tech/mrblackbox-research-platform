"use client";

import Script from "next/script";
import { useFormStatus } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
          sitekey: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export function TurnstileSubmitControl({
  buttonLabel,
  pendingLabel,
  resetKey
}: {
  buttonLabel: string;
  pendingLabel?: string;
  resetKey?: string;
}) {
  const id = useId().replace(/:/g, "");
  const widgetId = useRef<string | undefined>(undefined);
  const hasRenderedWidget = useRef(false);
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!hasRenderedWidget.current) {
      return;
    }

    setToken("");
    setLocalError("");
    window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  function renderWidget() {
    if (!siteKey || !window.turnstile || widgetId.current) {
      return;
    }

    widgetId.current = window.turnstile.render(`#${id}`, {
      callback(nextToken) {
        setLocalError("");
        setToken(nextToken);
      },
      "error-callback"() {
        setToken("");
        setLocalError("No fue posible validar la verificación de seguridad. Intenta nuevamente.");
        window.turnstile?.reset(widgetId.current);
      },
      "expired-callback"() {
        setToken("");
        setLocalError("Completa la verificación de seguridad.");
        window.turnstile?.reset(widgetId.current);
      },
      sitekey: siteKey
    });
    hasRenderedWidget.current = true;
  }

  return (
    <div className="space-y-2">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={renderWidget} />
      <input name="captchaToken" type="hidden" value={token} />
      {siteKey ? (
        <div aria-label="Verificación de seguridad" id={id} className="min-h-16" />
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          La verificación de seguridad no está configurada.
        </p>
      )}
      <p className="text-sm text-zinc-600" role={localError ? "alert" : undefined}>
        {localError || (token ? "Verificación de seguridad completada." : "Completa la verificación de seguridad.")}
      </p>
      <TurnstileSubmitButton
        buttonLabel={buttonLabel}
        disabled={!token}
        pendingLabel={pendingLabel}
      />
    </div>
  );
}

function TurnstileSubmitButton({
  buttonLabel,
  disabled,
  pendingLabel
}: {
  buttonLabel: string;
  disabled: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel ?? buttonLabel : buttonLabel}
    </button>
  );
}
