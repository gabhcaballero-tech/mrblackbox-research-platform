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

const CAPTCHA_PENDING_MESSAGE = "Completa la verificación de seguridad.";
const CAPTCHA_EXPIRED_MESSAGE = "La verificación de seguridad venció. Complétala nuevamente.";
const CAPTCHA_ERROR_MESSAGE = "No fue posible validar la verificación de seguridad. Intenta nuevamente.";
const CAPTCHA_SUCCESS_MESSAGE = "Verificación de seguridad completada.";

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
  const [localMessage, setLocalMessage] = useState(CAPTCHA_PENDING_MESSAGE);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!hasRenderedWidget.current) {
      return;
    }

    resetWidget(CAPTCHA_PENDING_MESSAGE);
  }, [resetKey]);

  function resetWidget(message: string) {
    setToken("");
    setLocalMessage(message);
    window.turnstile?.reset(widgetId.current);
  }

  function renderWidget() {
    if (!siteKey || !window.turnstile || widgetId.current) {
      return;
    }

    widgetId.current = window.turnstile.render(`#${id}`, {
      callback(nextToken) {
        setLocalMessage(CAPTCHA_SUCCESS_MESSAGE);
        setToken(nextToken);
      },
      "error-callback"() {
        resetWidget(CAPTCHA_ERROR_MESSAGE);
      },
      "expired-callback"() {
        resetWidget(CAPTCHA_EXPIRED_MESSAGE);
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
      <p className="text-sm text-zinc-600" role={localMessage !== CAPTCHA_SUCCESS_MESSAGE ? "alert" : undefined}>
        {localMessage}
      </p>
      <TurnstileSubmitButton buttonLabel={buttonLabel} disabled={!token} pendingLabel={pendingLabel} />
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
      className="inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? <LoadingLabel label={pendingLabel ?? buttonLabel} showSpinner /> : buttonLabel}
    </button>
  );
}

function LoadingLabel({
  label,
  showSpinner
}: {
  label: string;
  showSpinner: boolean;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {showSpinner ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
        />
      ) : null}
      {label}
    </span>
  );
}
