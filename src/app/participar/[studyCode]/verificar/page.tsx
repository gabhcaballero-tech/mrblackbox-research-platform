import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  PARTICIPANT_PORTAL_INTERNAL_USER_MESSAGE,
  PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE,
  PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE,
  PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE,
  PARTICIPANT_PORTAL_OTP_SENT_MESSAGE,
  PARTICIPANT_PORTAL_REQUEST_NEW_CODE_MESSAGE,
  PARTICIPANT_PORTAL_SPAM_HINT_MESSAGE
} from "@/modules/participant-portal/access";
import { verifyParticipantPortalOtpAction } from "@/modules/participant-portal/actions";
import { otpEmailCookieName } from "@/modules/participant-portal/cookies";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { PendingSubmitButton } from "../_components/PendingSubmitButton";

type ParticipantPortalVerifyPageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantPortalVerifyPage({
  params,
  searchParams
}: ParticipantPortalVerifyPageProps) {
  const { studyCode: rawStudyCode } = await params;
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!parsedStudyCode.success) {
    redirect("/");
  }

  const studyCode = parsedStudyCode.data;
  const cookieStore = await cookies();
  const email = cookieStore.get(otpEmailCookieName(studyCode))?.value;

  if (!email) {
    redirect(`/participar/${encodeURIComponent(studyCode)}`);
  }

  const search = (await searchParams) ?? {};
  const error = firstParam(search.error);
  const sent = firstParam(search.sent) === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Verificación de correo</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Ingresa tu código de acceso</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Te enviaremos y verificaremos códigos únicamente por medio de Supabase Auth.
        </p>

        {sent ? <Message tone="success">{PARTICIPANT_PORTAL_OTP_SENT_MESSAGE}</Message> : null}
        {error === "invalid" ? (
          <Message tone="error">
            {PARTICIPANT_PORTAL_INVALID_CODE_MESSAGE} {PARTICIPANT_PORTAL_REQUEST_NEW_CODE_MESSAGE}
          </Message>
        ) : null}
        {error === "format" ? <Message tone="error">{PARTICIPANT_PORTAL_INVALID_FORMAT_MESSAGE}</Message> : null}
        {error === "max" ? <Message tone="error">{PARTICIPANT_PORTAL_MAX_ATTEMPTS_MESSAGE}</Message> : null}
        {error === "internal" ? <Message tone="error">{PARTICIPANT_PORTAL_INTERNAL_USER_MESSAGE}</Message> : null}

        <form action={verifyParticipantPortalOtpAction} className="mt-6 space-y-4">
          <input name="studyCode" type="hidden" value={studyCode} />
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Código de acceso</span>
            <input
              autoComplete="one-time-code"
              className={inputClass}
              inputMode="numeric"
              name="token"
              placeholder="Código de acceso"
              required
            />
          </label>
          <PendingSubmitButton className={primaryButtonClass} label="Entrar" pendingLabel="Verificando..." />
        </form>

        <p className="mt-3 text-sm text-zinc-600">{PARTICIPANT_PORTAL_SPAM_HINT_MESSAGE}</p>

        <div className="mt-3">
          <Link className={secondaryButtonClass} href={`/participar/${encodeURIComponent(studyCode)}`}>
            Solicitar un código nuevo
          </Link>
        </div>
      </section>
    </main>
  );
}

function Message({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  const className =
    tone === "error"
      ? "mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      : "mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";

  return <div className={className}>{children}</div>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const inputClass =
  "mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2";
const secondaryButtonClass =
  "block w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
