import { getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import { createCtlRepository, ctlStatusLabel, type CtlParticipantSummary } from "@/modules/ctl/repository";
import {
  claimPublicCtlFolioAction,
  loginPublicCtlInterviewerAction,
  logoutPublicCtlInterviewerAction
} from "@/modules/ctl/public-actions";

export const dynamic = "force-dynamic";

type CtlPublicPageProps = {
  params: Promise<{ studyCode: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string; folio?: string }>;
};

export default async function CtlPublicPage({ params, searchParams }: CtlPublicPageProps) {
  const { studyCode } = await params;
  const query = await searchParams;
  const actor = await getPublicCtlInterviewerActor({ studyCode });
  const folio = String(query?.folio ?? "").trim();
  const preview = actor && folio
    ? await createCtlRepository().previewFolioForInterviewerCode({
        ctlInterviewerCodeId: actor.id,
        folio
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

              <form className="mt-5 flex flex-col gap-3 sm:flex-row" method="get">
                <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
                  Folio
                  <input className={inputClass} defaultValue={folio} name="folio" placeholder="NAV-104" required />
                </label>
                <div className="flex items-end">
                  <button className={secondaryButtonClass} type="submit">
                    Buscar folio
                  </button>
                </div>
              </form>
            </section>

            {preview?.ok ? (
              <ParticipantPreview participant={preview.participant} studyCode={studyCode} />
            ) : preview ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {preview.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function ParticipantPreview({ participant, studyCode }: { participant: CtlParticipantSummary; studyCode: string }) {
  return (
    <section className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Participante encontrado</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="Nombre" value={participant.name} />
        <Detail label="Folio" value={participant.folio} />
        <Detail label="NSE" value={participant.nse} />
        <Detail label="Estado CTL" value={ctlStatusLabel(participant.ctlStatus)} />
        <Detail
          label="Rotacion"
          value={
            participant.rotation.firstSampleKey && participant.rotation.secondSampleKey
              ? `${participant.rotation.firstSampleKey} -> ${participant.rotation.secondSampleKey}`
              : "Rotacion pendiente"
          }
        />
        <Detail
          label="Codigos de validacion"
          value={participant.referenceCodes.map((code) => `${code.slot}: ${code.code}`).join(" / ") || "Sin codigos"}
        />
      </dl>

      <form action={claimPublicCtlFolioAction.bind(null, studyCode)} className="mt-5">
        <input name="folio" type="hidden" value={participant.folio} />
        <button className={primaryButtonClass} type="submit">
          Iniciar CTL
        </button>
      </form>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass =
  "inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
