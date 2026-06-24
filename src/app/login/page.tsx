import Link from "next/link";
import {
  CAPTCHA_ERROR_MESSAGE,
  CAPTCHA_REQUIRED_MESSAGE,
  OTP_COOLDOWN_MESSAGE,
  OTP_GENERIC_SENT_MESSAGE,
  OTP_INVALID_EMAIL_MESSAGE,
  OTP_INVALID_MESSAGE,
  OTP_UNAUTHORIZED_MESSAGE
} from "@/shared/auth/passwordless";
import { sanitizeInternalNextPath } from "@/shared/auth/routes";
import { TurnstileSubmitControl } from "@/shared/ui/TurnstileSubmitControl";
import { UI_LABELS } from "@/shared/ui/labels";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import {
  requestOtpLoginAction,
  signInWithPasswordAction,
  verifyOtpLoginAction
} from "./actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeInternalNextPath(params.next);
  const mode = firstParam(params.mode) === "otp" ? "otp" : "password";
  const step = firstParam(params.step) === "verify" ? "verify" : "request";
  const otpError = firstParam(params.otpError);
  const email = firstParam(params.email) ?? "";
  const passwordError = firstParam(params.error);
  const hasPasswordError = passwordError === "credentials";
  const hasPasswordCaptchaError = passwordError === "captcha";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <StatusBadge status="planned">{UI_LABELS.login.internalAccess}</StatusBadge>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">MR Black Box</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{UI_LABELS.login.signIn}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{UI_LABELS.login.intro}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 text-sm font-semibold">
          <Link className={tabClass(mode === "password")} href={`/login?next=${encodeURIComponent(nextPath)}`}>
            Contraseña
          </Link>
          <Link className={tabClass(mode === "otp")} href={`/login?mode=otp&next=${encodeURIComponent(nextPath)}`}>
            Entrar con código
          </Link>
        </div>

        {mode === "password" ? (
          <PasswordLoginForm
            hasCaptchaError={hasPasswordCaptchaError}
            hasError={hasPasswordError}
            nextPath={nextPath}
            resetKey={passwordError ?? "idle"}
          />
        ) : (
          <OtpLoginForm email={email} error={otpError} nextPath={nextPath} step={step} />
        )}

        <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
          {UI_LABELS.login.noPublicRecovery}{" "}
          <Link className="font-medium text-teal-700 hover:text-teal-800" href="/p/demo-token">
            {UI_LABELS.login.participantPublicRoute}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function PasswordLoginForm({
  hasCaptchaError,
  hasError,
  nextPath,
  resetKey
}: {
  hasCaptchaError: boolean;
  hasError: boolean;
  nextPath: string;
  resetKey: string;
}) {
  return (
    <>
      {hasError ? (
        <Message tone="error">{UI_LABELS.login.signInError}</Message>
      ) : null}
      {hasCaptchaError ? <Message tone="error">{CAPTCHA_ERROR_MESSAGE}</Message> : null}

      <form action={signInWithPasswordAction} className="mt-6 space-y-4">
        <input name="next" type="hidden" value={nextPath} />

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">{UI_LABELS.login.email}</span>
          <input
            autoComplete="email"
            className={inputClass}
            name="email"
            required
            type="email"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">{UI_LABELS.login.password}</span>
          <input
            autoComplete="current-password"
            className={inputClass}
            name="password"
            required
            type="password"
          />
        </label>

        <TurnstileSubmitControl
          buttonLabel={UI_LABELS.login.signIn}
          pendingLabel="Iniciando sesión..."
          resetKey={`password-${resetKey}`}
        />
      </form>
    </>
  );
}

function OtpLoginForm({
  email,
  error,
  nextPath,
  step
}: {
  email: string;
  error: string | undefined;
  nextPath: string;
  step: "request" | "verify";
}) {
  if (step === "verify") {
    return (
      <>
        <Message tone={error === "unauthorized" || error === "invalid" ? "error" : "success"}>
          {error === "unauthorized"
            ? OTP_UNAUTHORIZED_MESSAGE
            : error === "invalid"
              ? OTP_INVALID_MESSAGE
              : OTP_GENERIC_SENT_MESSAGE}
        </Message>

        <form action={verifyOtpLoginAction} className="mt-6 space-y-4">
          <input name="next" type="hidden" value={nextPath} />
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Correo electrónico</span>
            <input autoComplete="email" className={inputClass} defaultValue={email} name="email" required type="email" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Código de 6 dígitos</span>
            <input
              autoComplete="one-time-code"
              className={inputClass}
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="token"
              pattern="[0-9]{6}"
              required
            />
          </label>
          <button className={primaryButtonClass} type="submit">
            Entrar
          </button>
        </form>

        <form action={requestOtpLoginAction} className="mt-3 space-y-4">
          <input name="email" type="hidden" value={email} />
          <input name="next" type="hidden" value={nextPath} />
          <TurnstileSubmitControl
            buttonLabel="Solicitar nuevo código"
            pendingLabel="Solicitando código..."
            resetKey={`otp-resend-${error ?? "idle"}`}
          />
        </form>
      </>
    );
  }

  return (
    <>
      {error === "email" ? <Message tone="error">{OTP_INVALID_EMAIL_MESSAGE}</Message> : null}
      {error === "captcha" ? <Message tone="error">{CAPTCHA_ERROR_MESSAGE}</Message> : null}
      {error === "cooldown" ? <Message tone="error">{OTP_COOLDOWN_MESSAGE}</Message> : null}
      <form action={requestOtpLoginAction} className="mt-6 space-y-4">
        <input name="next" type="hidden" value={nextPath} />
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Correo electrónico</span>
          <input autoComplete="email" className={inputClass} defaultValue={email} name="email" required type="email" />
        </label>
        <TurnstileSubmitControl
          buttonLabel="Enviar código"
          pendingLabel="Enviando código..."
          resetKey={`otp-request-${error ?? "idle"}`}
        />
      </form>
      <p className="mt-3 text-sm text-zinc-600">{CAPTCHA_REQUIRED_MESSAGE}</p>
    </>
  );
}

function Message({ children, tone }: { children: string; tone: "error" | "success" }) {
  const className =
    tone === "error"
      ? "mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      : "mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";

  return <div className={className}>{children}</div>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function tabClass(active: boolean): string {
  return active
    ? "rounded px-3 py-2 text-center text-zinc-950 shadow-sm bg-white"
    : "rounded px-3 py-2 text-center text-zinc-600 hover:text-zinc-950";
}

const inputClass =
  "mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2";
