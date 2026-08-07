import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createCtlRepository, ctlStatusLabel } from "@/modules/ctl/repository";
import { startCtlSessionAction } from "@/modules/ctl/actions";
import { CtlInterviewerCodesSection } from "./_components/CtlInterviewerCodesSection";

export const dynamic = "force-dynamic";

type CtlPageProps = {
  params: Promise<{ studyId: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string }>;
};

export default async function CtlPage({ params, searchParams }: CtlPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  const actor = await requireCapability("field:access");
  const repository = createCtlRepository();
  const result = await repository.listParticipants({ actor, studyId });
  const interviewerCodesResult = actor.role === "ADMIN"
    ? await repository.listInterviewerCodes({ actor, studyId })
    : null;

  if (!result.ok) {
    if (result.message === "No encontramos el estudio.") {
      notFound();
    }
    throw new Error(result.message);
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Presencial</StatusBadge>}
        description="Toma folios con rotacion lista para capturar el CTL con encuestador."
        eyebrow="CTL"
        title={`Cuestionario presencial - ${result.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/navigo-app`}>
          App Navigo
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

        {interviewerCodesResult?.ok ? (
          <CtlInterviewerCodesSection codes={interviewerCodesResult.codes} studyId={studyId} />
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Herramienta de soporte: iniciar CTL por folio</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Uso opcional para supervision. En operacion normal, el encuestador IKA inicia CTL desde el listado publico de folios disponibles.
            Los codigos de acceso por fase pertenecen al flujo HUT y no bloquean el inicio CTL.
          </p>
          <form action={startCtlSessionAction.bind(null, studyId)} className="mt-5 grid gap-4 md:grid-cols-[minmax(0,240px)_auto]">
            <label className={labelClass}>
              Folio
              <input className={inputClass} name="folio" placeholder="NAV-001" required />
            </label>
            <div className="flex items-end">
              <button className={primaryButtonClass} type="submit">
                Iniciar CTL
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-zinc-950">Participantes con folio</h2>
            <p className="mt-1 text-sm text-zinc-600">
              El NSE viene del screening. La rotacion se muestra solo como referencia operativa para las muestras fisicas.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Folio</th>
                  <th className="px-4 py-3">Participante</th>
                  <th className="px-4 py-3">NSE</th>
                  <th className="px-4 py-3">Rotacion</th>
                  <th className="px-4 py-3">CTL</th>
                  <th className="px-4 py-3">Encuestador</th>
                  <th className="px-4 py-3">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.participants.map((participant) => (
                  <tr key={participant.id}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.folio}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-950">{participant.name}</td>
                    <td className="px-4 py-3 text-zinc-700">{participant.nse}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-800">
                      {participant.rotation.firstSampleKey && participant.rotation.secondSampleKey
                        ? `${participant.rotation.firstSampleKey} -> ${participant.rotation.secondSampleKey}`
                        : "Pendiente"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{ctlStatusLabel(participant.ctlStatus)}</td>
                    <td className="px-4 py-3 text-zinc-700">{participant.interviewerName ?? "-"}</td>
                    <td className="px-4 py-3">
                      {participant.sessionId ? (
                        <Link className="font-semibold text-teal-700 hover:text-teal-800" href={`/admin/studies/${studyId}/ctl/${participant.sessionId}`}>
                          {participant.ctlStatus === "COMPLETED" ? "Ver CTL" : "Continuar CTL"}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">Iniciar con folio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass =
  "inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
