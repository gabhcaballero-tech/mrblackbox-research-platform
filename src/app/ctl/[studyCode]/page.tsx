import { getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import {
  createCtlRepository,
  ctlStatusLabel,
  type CtlAvailableParticipantSummary,
  type CtlOpenInterviewerSessionSummary
} from "@/modules/ctl/repository";
import {
  claimPublicCtlFolioAction,
  loginPublicCtlInterviewerAction,
  logoutPublicCtlInterviewerAction
} from "@/modules/ctl/public-actions";

export const dynamic = "force-dynamic";

type CtlPublicPageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string; qa?: string }>;
};

export default async function CtlPublicPage({ params, searchParams }: CtlPublicPageProps) {
  const { studyCode } = await params;
  const query = await searchParams;
  const includeQa = query?.qa === "1";
  const actor = await getPublicCtlInterviewerActor({ studyCode });
  const availableParticipants = actor
    ? await createCtlRepository().listAvailableParticipantsForInterviewerCode({
        ctlInterviewerCodeId: actor.id,
        includeQa
      })
    : null;
  const openSessions = actor
    ? await createCtlRepository().listOpenSessionsForInterviewerCode({
        ctlInterviewerCodeId: actor.id,
        includeQa,
        studyCode
      })
    : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CTL publico</p>
          <h1 className="mt-2 text-2xl font-bold">Capturar entrevista</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Acceso para encuestadores IKA. Ingresa tu codigo y captura un folio disponible del estudio.
          </p>
        </header>

        <Messages error={query?.ctlError} message={query?.ctlMessage} />

        {!actor ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Ingresar codigo IKA</h2>
            <form action={loginPublicCtlInterviewerAction.bind(null, studyCode)} className="mt-4 space-y-4">
              {includeQa ? <input name="qa" type="hidden" value="1" /> : null}
              <label className={labelClass}>
                Codigo de encuestador
                <input
                  autoComplete="one-time-code"
                  className={inputClass}
                  name="interviewerCode"
                  placeholder="IKA-1234"
                  required
                />
              </label>
              <button className={primaryButtonClass} type="submit">
                Entrar
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Capturar entrevista</h2>
                  <p className="mt-1 text-sm text-zinc-600">Encuestador: {actor.label}</p>
                </div>
                <form action={logoutPublicCtlInterviewerAction.bind(null, studyCode)}>
                  <button className="text-sm font-semibold text-zinc-600 hover:text-zinc-950" type="submit">
                    Cambiar codigo
                  </button>
                </form>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-600">
                Selecciona un folio disponible. Al iniciar CTL, el folio queda tomado por tu codigo de encuestador.
              </p>
            </section>

            {openSessions?.ok ? (
              <OpenSessionsTable includeQa={includeQa} sessions={openSessions.sessions} studyCode={studyCode} />
            ) : openSessions ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {openSessions.message}
              </p>
            ) : null}

            {availableParticipants?.ok ? (
              <AvailableParticipantsTable includeQa={includeQa} participants={availableParticipants.participants} studyCode={studyCode} />
            ) : availableParticipants ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {availableParticipants.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function OpenSessionsTable({
  includeQa,
  sessions,
  studyCode
}: {
  includeQa: boolean;
  sessions: CtlOpenInterviewerSessionSummary[];
  studyCode: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Mis entrevistas en curso</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Estas entrevistas ya fueron tomadas con tu codigo IKA y puedes continuarlas.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado CTL</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sessions.length > 0 ? sessions.map((session) => (
              <tr key={session.sessionId}>
                <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-950">{session.folio}</td>
                <td className="px-4 py-3 font-semibold text-zinc-950">{session.name}</td>
                <td className="px-4 py-3 text-zinc-700">{ctlStatusLabel(session.status)}</td>
                <td className="px-4 py-3">
                  <a className={primaryButtonClass} href={`/ctl/${encodeURIComponent(studyCode)}/sessions/${encodeURIComponent(session.sessionId)}${includeQa ? "?qa=1" : ""}`}>
                    Continuar CTL
                  </a>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={4}>
                  No tienes entrevistas CTL en curso.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AvailableParticipantsTable({
  includeQa,
  participants,
  studyCode
}: {
  includeQa: boolean;
  participants: CtlAvailableParticipantSummary[];
  studyCode: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Folios disponibles</h2>
        <p className="mt-1 text-sm text-zinc-600">Solo se muestran participantes listos para entrevista CTL.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado CTL</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {participants.length > 0 ? participants.map((participant) => (
              <tr key={participant.id}>
                <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-950">{participant.folio}</td>
                <td className="px-4 py-3 font-semibold text-zinc-950">{participant.name}</td>
                <td className="px-4 py-3 text-zinc-700">{ctlStatusLabel(participant.ctlStatus)}</td>
                <td className="px-4 py-3">
                  <form action={claimPublicCtlFolioAction.bind(null, studyCode)}>
                    <input name="folio" type="hidden" value={participant.folio} />
                    {includeQa ? <input name="qa" type="hidden" value="1" /> : null}
                    <button className={primaryButtonClass} type="submit">
                      Iniciar CTL
                    </button>
                  </form>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={4}>
                  No hay folios disponibles para entrevista CTL en este momento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Messages({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass =
  "inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
