import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  completeHutCallEvaluationAction,
  createHutParticipantAction,
  markHutMissedDayAction,
  reactivateHutParticipantAction,
  startHutBlockAction
} from "@/modules/hut/actions";
import { createHutRepository, type HutAdminParticipant } from "@/modules/hut";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { HutParticipantImportPanel } from "./_components/HutParticipantImportPanel";

export const dynamic = "force-dynamic";

type HutAdminPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    hutError?: string;
    hutMessage?: string;
    participant?: string;
  }>;
};

export default async function HutAdminPage({ params, searchParams }: HutAdminPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  await requireCapability("screening:review");
  const requestOrigin = resolveRequestOrigin(await headers());
  const dashboard = await createHutRepository().getAdminDashboard({
    requestOrigin,
    studyId
  });

  if (!dashboard) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Módulo independiente</StatusBadge>}
        description="Gestiona participantes HUT, videos por bloque, tolerancia total por bloque, llamadas de evaluación y exportación de avance."
        eyebrow="HUT"
        title={`Home Use Test · ${dashboard.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut/export`}>
          Exportar avance HUT (TSV)
        </Link>
      </div>

      {query?.hutMessage ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {query.hutMessage}
        </p>
      ) : null}
      {query?.hutError ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {query.hutError}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <CreateHutParticipantForm requestOrigin={requestOrigin} studyId={studyId} />
        <HutParticipantImportPanel requestOrigin={requestOrigin} studyId={studyId} />
      </div>

      <section className="mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-zinc-950">Participantes HUT</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Cada bloque exige 3 videos y permite máximo 1 día omitido dentro de 4 días calendario.
          </p>
        </div>
        {dashboard.participants.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Sin participantes HUT"
              description="Crea o importa participantes HUT para generar links independientes del flujo Navigo."
            />
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {dashboard.participants.map((participant) => (
              <HutParticipantCard key={participant.id} participant={participant} studyId={studyId} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CreateHutParticipantForm({ requestOrigin, studyId }: { requestOrigin: string; studyId: string }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Crear participante HUT</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Este participante es independiente de Navigo App. El link generado solo abre el portal HUT.
      </p>
      <form action={createHutParticipantAction.bind(null, studyId)} className="mt-4 grid gap-3">
        <input name="requestOrigin" type="hidden" value={requestOrigin} />
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Nombre
          <input className={inputClass} name="name" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Celular
          <input className={inputClass} name="phone" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Correo
          <input className={inputClass} name="email" type="email" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Reclutador
          <input className={inputClass} name="recruiter" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Fecha de inicio de bloque 1
          <input className={inputClass} name="startDate" type="date" />
        </label>
        <SubmitButton pendingLabel="Creando participante...">Crear participante HUT</SubmitButton>
      </form>
    </section>
  );
}

function HutParticipantCard({ participant, studyId }: { participant: HutAdminParticipant; studyId: string }) {
  const disabled = participant.status === "DISQUALIFIED" || participant.status === "COMPLETED";

  return (
    <article className="grid gap-5 p-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)_minmax(280px,0.85fr)]">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">{participant.name}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{participant.id}</p>
        </div>
        <dl className="space-y-1 text-sm">
          <Field label="Celular" value={participant.phone ?? "No capturado"} />
          <Field label="Correo" value={participant.email ?? "No capturado"} />
          <Field label="Reclutador" value={participant.recruiter ?? "No capturado"} />
          <Field label="Estado" value={hutParticipantStatusLabel(participant.status)} />
          <Field label="Bloque actual" value={String(participant.currentBlockNumber)} />
          <Field label="Video esperado" value={String(participant.currentVideoSequence)} />
        </dl>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link participante</p>
          <a className="mt-2 block break-all text-sm font-semibold text-teal-700" href={participant.link} rel="noreferrer" target="_blank">
            {participant.link}
          </a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BlockCard block={participant.block1} label="Bloque 1" />
        <BlockCard block={participant.block2} label="Bloque 2" />
        <CallCard call={participant.call1} label="Evaluación 1" />
        <CallCard call={participant.call2} label="Evaluación 2" />
      </div>

      <div className="space-y-3">
        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-950">Acciones operativas</h3>
          <div className="mt-3 space-y-3">
            <form action={startHutBlockAction.bind(null, studyId, participant.id, 1)}>
              <input className={inputClass} name="startDate" type="date" />
              <div className="mt-2">
                <SubmitButton disabled={disabled || participant.block1?.status !== "NOT_STARTED"} pendingLabel="Iniciando bloque 1...">
                  Iniciar bloque 1
                </SubmitButton>
              </div>
            </form>
            <form action={markHutMissedDayAction.bind(null, studyId, participant.id)} className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input name="reminderSent" type="checkbox" /> Recordatorio enviado manualmente
              </label>
              <SubmitButton disabled={disabled} pendingLabel="Registrando omisión...">Registrar día omitido</SubmitButton>
            </form>
            <form action={completeHutCallEvaluationAction.bind(null, studyId, participant.id, 1)} className="space-y-2">
              <input className={inputClass} name="evaluatorName" placeholder="Evaluador" />
              <textarea className={inputClass} name="notes" placeholder="Notas de evaluación 1" rows={2} />
              <SubmitButton disabled={participant.block1?.status !== "CALL_PENDING"} pendingLabel="Guardando evaluación 1...">
                Completar evaluación 1
              </SubmitButton>
            </form>
            <form action={startHutBlockAction.bind(null, studyId, participant.id, 2)}>
              <input className={inputClass} name="startDate" type="date" />
              <div className="mt-2">
                <SubmitButton disabled={disabled || participant.call1?.status !== "COMPLETED" || participant.block2?.status !== "NOT_STARTED"} pendingLabel="Iniciando bloque 2...">
                  Iniciar bloque 2
                </SubmitButton>
              </div>
            </form>
            <form action={completeHutCallEvaluationAction.bind(null, studyId, participant.id, 2)} className="space-y-2">
              <input className={inputClass} name="evaluatorName" placeholder="Evaluador" />
              <textarea className={inputClass} name="notes" placeholder="Notas de evaluación 2" rows={2} />
              <SubmitButton disabled={participant.block2?.status !== "CALL_PENDING"} pendingLabel="Guardando evaluación 2...">
                Completar evaluación 2
              </SubmitButton>
            </form>
          </div>
        </section>
        <details className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-amber-950">Override manual</summary>
          <p className="mt-2 text-xs leading-5 text-amber-900">
            Usa esta acción solo si el supervisor decide reactivar a una persona marcada como no apta.
          </p>
          <form action={reactivateHutParticipantAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
            <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
            <SubmitButton disabled={participant.status !== "DISQUALIFIED"} pendingLabel="Reactivando...">Reactivar participante</SubmitButton>
          </form>
        </details>
      </div>
    </article>
  );
}

function BlockCard({ block, label }: { block: HutAdminParticipant["block1"]; label: string }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <h3 className="text-sm font-semibold text-zinc-950">{label}</h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-700">
        <Field label="Estado" value={block ? hutBlockStatusLabel(block.status) : "Sin bloque"} />
        <Field label="Videos" value={`${block?.submittedVideosCount ?? 0}/3`} />
        <Field label="Días omitidos" value={`${block?.missedDaysCount ?? 0}/1`} />
        {block?.disqualificationReason ? <Field label="Motivo" value={block.disqualificationReason} /> : null}
      </dl>
    </section>
  );
}

function CallCard({ call, label }: { call: HutAdminParticipant["call1"]; label: string }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-zinc-950">{label}</h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-700">
        <Field label="Estado" value={call ? hutCallStatusLabel(call.status) : "Pendiente"} />
        <Field label="Completada" value={call?.completedAt ? call.completedAt.toLocaleString("es-MX") : "No"} />
      </dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-medium text-zinc-500">{label}: </dt>
      <dd className="inline text-zinc-900">{value}</dd>
    </div>
  );
}

function hutParticipantStatusLabel(status: string) {
  const labels: Record<string, string> = {
    BLOCK_1_CALL_PENDING: "Bloque 1 listo para llamada",
    BLOCK_1_IN_PROGRESS: "Bloque 1 en curso",
    BLOCK_2_CALL_PENDING: "Bloque 2 listo para llamada",
    BLOCK_2_IN_PROGRESS: "Bloque 2 en curso",
    COMPLETED: "Completado",
    DISQUALIFIED: "No apto",
    NOT_STARTED: "No iniciado"
  };
  return labels[status] ?? status;
}

function hutBlockStatusLabel(status: string) {
  const labels: Record<string, string> = {
    CALL_PENDING: "Llamada pendiente",
    COMPLETED: "Completado",
    DISQUALIFIED: "No apto",
    IN_PROGRESS: "En curso",
    NOT_STARTED: "No iniciado"
  };
  return labels[status] ?? status;
}

function hutCallStatusLabel(status: string) {
  const labels: Record<string, string> = {
    COMPLETED: "Completada",
    NO_ANSWER: "No contestó",
    PENDING: "Pendiente",
    RESCHEDULE_NEEDED: "Reagendar",
    SCHEDULED: "Programada"
  };
  return labels[status] ?? status;
}

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950";
