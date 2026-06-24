import Link from "next/link";
import type { ReactNode } from "react";
import {
  getParticipantPortalAvailability,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE
} from "@/modules/participant-portal/access";
import { allowsDirectParticipantAccess } from "@/modules/participant-portal/access-mode";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE } from "@/modules/participant-portal/registration-service";
import {
  getParticipantPortalPublicResult,
  PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE
} from "@/modules/participant-portal/screener-service";
import { createParticipantPortalScreenerRepository } from "@/modules/participant-portal/screener-repository";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { ParticipantRegistrationForm } from "./ParticipantRegistrationForm";

type ParticipantPortalHomePageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantPortalHomePage({
  params,
  searchParams
}: ParticipantPortalHomePageProps) {
  const { studyCode: rawStudyCode } = await params;
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!parsedStudyCode.success) {
    return <PortalMessage title={PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE} />;
  }

  const studyCode = parsedStudyCode.data;
  const repository = createParticipantPortalRepository();
  const availability = await getParticipantPortalAvailability({
    repository,
    studyCode
  });

  if (!availability.ok) {
    return <PortalMessage title={PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE} />;
  }

  const directMode = allowsDirectParticipantAccess(studyCode);
  const auth = await getParticipantPortalAuth({ repository, studyCode });

  if (auth.status === "no_session") {
    if (!directMode) {
      return <PortalMessage title="Inicia sesión con el código enviado a tu correo para continuar." />;
    }

    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
        <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Comienza tu registro</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Para iniciar tu registro, captura tus datos de contacto.
          </p>
          <div className="mt-6">
            <ParticipantRegistrationForm
              privacyNoticeText={availability.study.portalConfig.privacyNoticeText}
              requireTurnstile
              studyCode={studyCode}
            />
          </div>
        </section>
      </main>
    );
  }

  if (auth.status === "internal_user_blocked") {
    return <PortalMessage title={auth.message} />;
  }

  const search = (await searchParams) ?? {};
  const registered = firstParam(search.registered) === "1";
  const portalResult = await getParticipantPortalPublicResult({
    identity: auth.identity,
    repository: createParticipantPortalScreenerRepository(),
    studyCode
  });

  if (portalResult.ok) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
        <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            {registered ? PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE : "Registro listo"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {portalResult.data.kind === "IN_PROGRESS"
              ? "Tu registro quedó listo. Continúa al filtro para responder el cuestionario."
              : "Ya existe un avance para este estudio. Puedes continuar desde tu estado actual."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {portalResult.data.kind === "IN_PROGRESS" ? (
              <Link className={primaryButtonClass} href={`/participar/${studyCode}/filtro`}>
                Continuar al filtro
              </Link>
            ) : (
              <Link className={primaryButtonClass} href={`/participar/${studyCode}/resultado`}>
                Ver estado de participación
              </Link>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (
    portalResult.code !== "REGISTRATION_REQUIRED" &&
    portalResult.code !== "CONSENT_REQUIRED" &&
    portalResult.message !== PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE
  ) {
    return (
      <PortalMessage
        action={
          <Link className={primaryButtonClass} href={`/participar/${studyCode}/resultado`}>
            Ver estado de participación
          </Link>
        }
        title={portalResult.message}
      />
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
      <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Completa tu registro</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Captura tus datos de contacto y acepta el aviso para continuar al filtro.
        </p>
        <div className="mt-6">
          <ParticipantRegistrationForm
            privacyNoticeText={availability.study.portalConfig.privacyNoticeText}
            studyCode={studyCode}
          />
        </div>
      </section>
    </main>
  );
}

function PortalMessage({
  action,
  description,
  eyebrow = "Portal de participacion",
  title
}: {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800";
