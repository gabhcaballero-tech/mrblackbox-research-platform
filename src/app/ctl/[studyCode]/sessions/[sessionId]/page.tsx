import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import { createCtlRepository, ctlStatusLabel } from "@/modules/ctl/repository";
import { formatCtlDate, formatCtlTime } from "@/modules/ctl/service";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { CtlMobileCapture } from "./CtlMobileCapture";
import { CtlNavigoPreparedPanel } from "./CtlNavigoPreparedPanel";

export const dynamic = "force-dynamic";

type CtlPublicCapturePageProps = {
  params: Promise<{ sessionId: string; studyCode: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string }>;
};

export default async function CtlPublicCapturePage({ params, searchParams }: CtlPublicCapturePageProps) {
  const { sessionId, studyCode } = await params;
  const query = await searchParams;
  const actor = await getPublicCtlInterviewerActor({ studyCode });
  const requestOrigin = resolveRequestOrigin(await headers());

  if (!actor) {
    redirect(
      `/ctl/${encodeURIComponent(studyCode)}?ctlError=${encodeURIComponent(
        "Ingresa tu codigo de encuestador para continuar."
      )}`
    );
  }

  const session = await createCtlRepository().getSession({ actor, sessionId });

  if (!session) {
    notFound();
  }

  const readOnly = session.status === "COMPLETED" || session.status === "CANCELLED";
  const completedAtLabel = formatCtlTimestamp(session.completedAt);
  const startedAtLabel = formatCtlTimestamp(session.startedAt);
  const participantUrl = session.participant.participantLinkToken
    ? new URL(`/p/${encodeURIComponent(session.participant.participantLinkToken)}/activities`, requestOrigin).toString()
    : null;
  const showLegacyNavigoCompletionPanel = false;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CTL publico</p>
          <h1 className="mt-2 text-2xl font-bold">Captura CTL - {session.participant.folio}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Captura presencial aplicada por encuestador IKA. Esta pantalla no da acceso a administracion.
          </p>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href={`/ctl/${studyCode}`}>
              Buscar otro folio
            </Link>
          </div>
        </header>

        <Messages error={query?.ctlError} message={query?.ctlMessage} />

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Participante validado</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Nombre" value={session.participant.name} />
            <Detail label="Folio" value={session.participant.folio} />
            <Detail label="NSE" value={session.participant.nse} />
            <Detail label="Encuestador" value={session.interviewerName} />
            <Detail
              label="Primera muestra"
              value={session.participant.rotation.firstSampleKey ?? "Rotacion pendiente"}
            />
            <Detail
              label="Segunda muestra"
              value={session.participant.rotation.secondSampleKey ?? "Rotacion pendiente"}
            />
            <Detail label="Estado CTL" value={ctlStatusLabel(session.status)} />
          </dl>
        </section>

        {session.status === "COMPLETED" ? (
          <CtlNavigoPreparedPanel
            activities={session.participant.navigo.activities
              .filter((activity) => ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"].includes(activity.code))
              .map((activity) => ({
                availableFromLabel: formatCtlDateTime(activity.availableFrom),
                code: activity.code
              }))}
            evaluationUrl={participantUrl}
            firstSampleKey={session.participant.rotation.firstSampleKey}
            folio={session.participant.folio}
            requestOrigin={requestOrigin}
            secondSampleKey={session.participant.rotation.secondSampleKey}
            sessionId={session.id}
            studyCode={studyCode}
            t0Label={formatCtlDateTime(session.participant.navigo.applicationStartedAt)}
          />
        ) : null}

        {showLegacyNavigoCompletionPanel && session.status === "COMPLETED" ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Siguiente paso</p>
            <h2 className="mt-2 text-xl font-bold text-emerald-950">
              Evaluación sensorial concluida.
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              Continúe en Navigo con las evaluaciones posteriores.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Detail label="Participante" value={session.participant.name} />
              <Detail label="Folio" value={session.participant.folio} />
              <Detail label="Hora inicio" value={startedAtLabel ?? "Sin registro"} />
              <Detail label="Hora termino" value={completedAtLabel ?? "Sin registro"} />
              <Detail label="Estado CTL" value={ctlStatusLabel(session.status)} />
            </dl>
            {session.participant.participantLinkToken ? (
              <Link
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
                href={`/p/${encodeURIComponent(session.participant.participantLinkToken)}/activities`}
              >
                Continuar en Navigo
              </Link>
            ) : (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                El enlace de Navigo aun no esta disponible. Revisa la liberacion desde Administracion.
              </p>
            )}
          </section>
        ) : null}

        <CtlMobileCapture
          answers={session.answers}
          completedAtLabel={completedAtLabel}
          definition={session.definition}
          participant={{
            firstSampleKey: session.participant.rotation.firstSampleKey,
            folio: session.participant.folio,
            name: session.participant.name,
            secondSampleKey: session.participant.rotation.secondSampleKey,
            triangularRotation: session.participant.triangularRotation
              ? {
                  triangular1: {
                    pr1: session.participant.triangularRotation.triangular1.pr1,
                    pr2: session.participant.triangularRotation.triangular1.pr2,
                    pr3: session.participant.triangularRotation.triangular1.pr3
                  },
                  triangular2: {
                    pr1: session.participant.triangularRotation.triangular2.pr1,
                    pr2: session.participant.triangularRotation.triangular2.pr2,
                    pr3: session.participant.triangularRotation.triangular2.pr3
                  }
                }
              : null
          }}
          phaseProgress={session.phaseProgress}
          readOnly={readOnly}
          sessionId={session.id}
          startedAtLabel={startedAtLabel}
          studyCode={studyCode}
          todayLabel={formatCtlDate(new Date())}
        />
      </div>
    </main>
  );
}

function Messages({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function formatCtlTimestamp(value: Date | null): string | null {
  return value ? formatCtlTime(value) : null;
}

function formatCtlDateTime(value: Date | null): string {
  return value ? `${formatCtlDate(value)} ${formatCtlTime(value)}` : "Sin registro";
}
