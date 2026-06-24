"use client";

import Script from "next/script";
import { useId, useRef, useState } from "react";

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

export function TurnstileField() {
  const id = useId().replace(/:/g, "");
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  function renderWidget() {
    if (!siteKey || !window.turnstile || widgetId.current) {
      return;
    }

    widgetId.current = window.turnstile.render(`#${id}`, {
      callback(nextToken) {
        setToken(nextToken);
      },
      "error-callback"() {
        setToken("");
        window.turnstile?.reset(widgetId.current);
      },
      "expired-callback"() {
        setToken("");
        window.turnstile?.reset(widgetId.current);
      },
      sitekey: siteKey
    });
  }

  return (
    <div className="space-y-2">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={renderWidget} />
      <input name="captchaToken" type="hidden" value={token} />
      {siteKey ? (
        <div id={id} className="min-h-16" />
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          La verificación de seguridad no está configurada.
        </p>
      )}
      <button
        className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={!token}
        type="submit"
      >
        Enviar código
      </button>
    </div>
  );
}
