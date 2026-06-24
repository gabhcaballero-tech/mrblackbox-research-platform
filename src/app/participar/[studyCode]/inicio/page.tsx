import Link from "next/link";
import type { ReactNode } from "react";
import {
  getParticipantPortalAvailability,
  PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE
} from "@/modules/participant-portal/access";
import { allowsDirectParticipantAccess } from "@/modules/participant-portal/access-mode";
import { createParticipantPortalEvidenceRepository } from "@/modules/participant-portal/evidence-repository";
import { getParticipantPortalSelfieScreen } from "@/modules/participant-portal/evidence-service";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE } from "@/modules/participant-portal/registration-service";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { ParticipantRegistrationForm } from "./ParticipantRegistrationForm";
import { ParticipantSelfieStep } from "./ParticipantSelfieStep";

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
  const selfie = await getParticipantPortalSelfieScreen({
    identity: auth.identity,
    repository: createParticipantPortalEvidenceRepository(),
    studyCode
  });

  if (selfie.ok) {
    const showContinue = selfie.data.selfieComplete;

    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
        <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participacion</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            {showContinue
              ? "Registro completo"
              : registered
                ? PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE
                : "Verifica tu selfie"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {showContinue
              ? "Tu registro ya fue validado. Si tu selfie ya aparece registrada, puedes continuar al filtro."
              : "Toma una selfie clara de identificacion. Se usara unicamente para validar que la misma persona continue durante el estudio."}
          </p>
          <div className="mt-6">
            <ParticipantSelfieStep screen={selfie.data} showRegistrationSuccess={registered} />
          </div>
        </section>
      </main>
    );
  }

  if (selfie.code !== "REGISTRATION_REQUIRED" && selfie.code !== "CONSENT_REQUIRED") {
    return (
      <PortalMessage
        action={
          selfie.code === "ATTEMPT_NOT_READY" ? (
            <Link className={primaryButtonClass} href={`/participar/${studyCode}/resultado`}>
              Ver resultado
            </Link>
          ) : undefined
        }
        title={selfie.message}
      />
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
      <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Completa tu registro</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Captura tus datos de contacto, acepta el aviso y luego toma tu selfie para continuar.
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
