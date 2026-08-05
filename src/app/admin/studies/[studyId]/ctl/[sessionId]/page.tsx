import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createCtlRepository, ctlStatusLabel } from "@/modules/ctl/repository";
import { saveCtlAnswersAction } from "@/modules/ctl/actions";

export const dynamic = "force-dynamic";

type CtlCapturePageProps = {
  params: Promise<{ sessionId: string; studyId: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string }>;
};

export default async function CtlCapturePage({ params, searchParams }: CtlCapturePageProps) {
  const { sessionId, studyId } = await params;
  const query = await searchParams;
  const actor = await requireCapability("field:access");
  const session = await createCtlRepository().getSession({ actor, sessionId });

  if (!session) {
    notFound();
  }

  const readOnly = session.status === "COMPLETED" || session.status === "CANCELLED";

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status={session.status === "COMPLETED" ? "ready" : "planned"}>{ctlStatusLabel(session.status)}</StatusBadge>}
        description="Captura presencial aplicada por encuestador. El participante no responde desde su celular."
        eyebrow="CTL"
        title={`CTL · ${session.participant.folio}`}
      />

      <div className="mb-6">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}/ctl`}>
          Volver a CTL
        </Link>
      </div>

      <div className="space-y-6">
        {query?.ctlMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.ctlMessage}
          </p>
        ) : null}
        {query?.ctlError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {query.ctlError}
          </p>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Participante validado</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
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

        <form action={saveCtlAnswersAction.bind(null, studyId, session.id)} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Captura CTL</h2>
          <div className="mt-5 space-y-6">
            {session.definition.questions.map((question) => (
              <label key={question.code} className={labelClass}>
                <span>
                  {question.code} · {question.label}
                  {question.required ? <span className="text-rose-700"> *</span> : null}
                </span>
                {question.type === "SELECT" ? (
                  <select className={inputClass} defaultValue={String(session.answers[question.code] ?? "")} disabled={readOnly} name={question.code} required={question.required}>
                    <option value="">Selecciona</option>
                    {(question.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : question.type === "LONG_TEXT" ? (
                  <textarea className={inputClass} defaultValue={String(session.answers[question.code] ?? "")} disabled={readOnly} name={question.code} rows={3} />
                ) : (
                  <input className={inputClass} defaultValue={String(session.answers[question.code] ?? "")} disabled={readOnly} name={question.code} required={question.required} />
                )}
              </label>
            ))}
          </div>

          {!readOnly ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <button className={secondaryButtonClass} name="complete" type="submit" value="0">
                Guardar avance
              </button>
              <button className={primaryButtonClass} name="complete" type="submit" value="1">
                Finalizar CTL
              </button>
            </div>
          ) : (
            <p className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Esta sesion ya fue cerrada y se conserva solo para consulta.
            </p>
          )}
        </form>
      </div>
    </AppShell>
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
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100";
const primaryButtonClass =
  "inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
