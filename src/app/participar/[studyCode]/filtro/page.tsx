import type { ReactNode } from "react";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { createParticipantPortalScreenerRepository } from "@/modules/participant-portal/screener-repository";
import {
  PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE,
  getParticipantPortalScreenerScreen
} from "@/modules/participant-portal/screener-service";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { ParticipantScreenerForm } from "./ParticipantScreenerForm";

type ParticipantPortalFilterPageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantPortalFilterPage({
  params,
  searchParams
}: ParticipantPortalFilterPageProps) {
  const { studyCode: rawStudyCode } = await params;
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!parsedStudyCode.success) {
    return <PortalMessage title="El portal de participación no está disponible en este momento." />;
  }

  const studyCode = parsedStudyCode.data;
  const portalRepository = createParticipantPortalRepository();
  const auth = await getParticipantPortalAuth({ repository: portalRepository, studyCode });

  if (auth.status === "no_session") {
    return <PortalMessage title="Inicia sesión con el código enviado a tu correo para continuar." />;
  }

  if (auth.status === "internal_user_blocked") {
    return <PortalMessage title={auth.message} />;
  }

  const search = (await searchParams) ?? {};
  const result = await getParticipantPortalScreenerScreen({
    identity: auth.identity,
    questionId: firstParam(search.question),
    repository: createParticipantPortalScreenerRepository(),
    studyCode
  });

  if (!result.ok) {
    return (
      <PortalMessage
        action={
          result.code === "REGISTRATION_REQUIRED" || result.code === "CONSENT_REQUIRED" ? (
            <a className={primaryButtonClass} href={`/participar/${studyCode}/inicio`}>
              Completar registro
            </a>
          ) : null
        }
        title={result.message || PARTICIPANT_PORTAL_REGISTRATION_REQUIRED_MESSAGE}
      />
    );
  }

  const screen = result.data;
  const progressPercent =
    screen.progress.totalVisibleQuestions > 0
      ? Math.round((screen.progress.answeredVisibleQuestions / screen.progress.totalVisibleQuestions) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
      <section className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{screen.study.name}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Responde el filtro con información verídica. Tus respuestas serán revisadas de forma segura.
          </p>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-100" aria-label="Progreso del filtro">
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${progressPercent}%` }} />
        </div>

        <ParticipantScreenerForm error={firstParam(search.error)} screen={screen} />
      </section>
    </main>
  );
}

function PortalMessage({
  action,
  title
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participación</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        {action ? <div className="mt-5">{action}</div> : null}
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const primaryButtonClass =
  "inline-flex w-fit justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
