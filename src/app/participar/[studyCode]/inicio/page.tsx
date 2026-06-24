import { getParticipantPortalAvailability, PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE } from "@/modules/participant-portal/access";
import type { ReactNode } from "react";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import {
  PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE
} from "@/modules/participant-portal/registration-service";
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

  const auth = await getParticipantPortalAuth({ repository });

  if (auth.status === "no_session") {
    return <PortalMessage title="Inicia sesión con el código enviado a tu correo para continuar." />;
  }

  if (auth.status === "internal_user_blocked") {
    return <PortalMessage title={auth.message} />;
  }

  const search = (await searchParams) ?? {};
  const registered = firstParam(search.registered) === "1";

  if (registered) {
    return (
      <PortalMessage
        eyebrow="Portal de participación"
        title={PARTICIPANT_PORTAL_REGISTRATION_SUCCESS_MESSAGE}
        description="En el siguiente paso continuarás con el filtro."
        action={<button className={disabledButtonClass} disabled>Continuar al filtro</button>}
      />
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10">
      <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Completa tu registro</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Tu correo fue verificado correctamente. Captura tus datos de contacto y acepta el aviso para continuar.
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
  eyebrow = "Portal de participación",
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

const disabledButtonClass =
  "inline-flex w-full cursor-not-allowed items-center justify-center rounded-md bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-500";
