import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  assignHutParticipantRotationAction,
  completeHutCallEvaluationAction,
  createHutParticipantAction,
  createHutRegistrationSlotAction,
  deleteHutParticipantAction,
  markHutMissedDayAction,
  reactivateHutParticipantAction,
  reviewHutVisualVerificationAction,
  resetHutCallEvaluationAction,
  resetHutReferenceSelfieAction,
  resetHutVideoSubmissionAction,
  setHutVisualOverrideAction,
  setHutTestModeAction,
  startHutBlockAction
} from "@/modules/hut/actions";
import { createHutRepository, type HutAdminParticipant, type HutRegistrationSlotAdmin } from "@/modules/hut";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { HutParticipantImportPanel } from "./_components/HutParticipantImportPanel";
import { HutRegistrationSlotImportPanel } from "./_components/HutRegistrationSlotImportPanel";
import { HutReferenceSelfieUpload } from "./_components/HutReferenceSelfieUpload";

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
        <CreateHutParticipantForm
          availableSlots={dashboard.registrationSlots.filter((slot) => slot.status === "AVAILABLE")}
          requestOrigin={requestOrigin}
          studyId={studyId}
        />
        <HutParticipantImportPanel requestOrigin={requestOrigin} studyId={studyId} />
      </div>

      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <CreateHutRegistrationSlotForm requestOrigin={requestOrigin} studyId={studyId} />
          <HutRegistrationSlotImportPanel requestOrigin={requestOrigin} studyId={studyId} />
        </div>
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-950">Folios y rotacion</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Estos links se usan en campo para registrar al participante, capturar datos y guardar la selfie base.
          </p>
          <HutRegistrationSlotTable slots={dashboard.registrationSlots} />
        </div>
      </section>

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
              <HutParticipantCard
                availableSlots={dashboard.registrationSlots.filter((slot) => slot.status === "AVAILABLE")}
                key={participant.id}
                participant={participant}
                studyId={studyId}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CreateHutRegistrationSlotForm({ requestOrigin, studyId }: { requestOrigin: string; studyId: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-950">Crear folio HUT</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Prepara el folio y su rotacion antes de capturar datos del participante.
      </p>
      <form action={createHutRegistrationSlotAction.bind(null, studyId)} className="mt-4 grid gap-3">
        <input name="requestOrigin" type="hidden" value={requestOrigin} />
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Folio
          <input className={inputClass} name="folio" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Primera fragancia / brazo izquierdo
          <input className={inputClass} name="firstFragranceLeftArm" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Segunda fragancia / brazo derecho
          <input className={inputClass} name="secondFragranceRightArm" required />
        </label>
        <SubmitButton pendingLabel="Creando folio...">Crear folio HUT</SubmitButton>
      </form>
    </section>
  );
}

function HutRegistrationSlotTable({ slots }: { slots: HutRegistrationSlotAdmin[] }) {
  if (slots.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          title="Sin folios HUT"
          description="Crea o importa folios con rotacion para generar links de registro en campo."
        />
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">Folio</th>
            <th className="px-3 py-2">Link de registro</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Participante</th>
            <th className="px-3 py-2">Celular</th>
            <th className="px-3 py-2">Primera fragancia / brazo izquierdo</th>
            <th className="px-3 py-2">Segunda fragancia / brazo derecho</th>
            <th className="px-3 py-2">Selfie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {slots.map((slot) => (
            <tr key={slot.id}>
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-950">{slot.folio}</td>
              <td className="max-w-64 px-3 py-2">
                <a className="block truncate font-semibold text-teal-700" href={slot.link} rel="noreferrer" target="_blank" title={slot.link}>
                  {slot.link}
                </a>
              </td>
              <td className="whitespace-nowrap px-3 py-2">{hutRegistrationSlotStatusLabel(slot.status)}</td>
              <td className="px-3 py-2">
                {slot.participantLink ? (
                  <a className="font-semibold text-teal-700" href={slot.participantLink} rel="noreferrer" target="_blank">
                    {slot.participantName ?? "Abrir portal"}
                  </a>
                ) : (
                  slot.participantName ?? "-"
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{slot.phone ?? "-"}</td>
              <td className="px-3 py-2">{slot.firstFragranceLeftArm}</td>
              <td className="px-3 py-2">{slot.secondFragranceRightArm}</td>
              <td className="whitespace-nowrap px-3 py-2">{slot.referenceSelfieStatus === "COMPLETE" ? "Completa" : "Faltante"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateHutParticipantForm({
  availableSlots,
  requestOrigin,
  studyId
}: {
  availableSlots: HutRegistrationSlotAdmin[];
  requestOrigin: string;
  studyId: string;
}) {
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
          Folio/rotacion disponible
          <select className={inputClass} name="slotId">
            <option value="">Sin slot disponible</option>
            {availableSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.folio} - {slot.firstFragranceLeftArm} / {slot.secondFragranceRightArm}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Asignacion manual opcional</p>
          <div className="mt-3 grid gap-3">
            <input className={inputClass} name="folio" placeholder="Folio manual" />
            <input className={inputClass} name="firstFragranceLeftArm" placeholder="Primera fragancia / brazo izquierdo" />
            <input className={inputClass} name="secondFragranceRightArm" placeholder="Segunda fragancia / brazo derecho" />
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Fecha de inicio de bloque 1
          <input className={inputClass} name="startDate" type="date" />
        </label>
        <SubmitButton pendingLabel="Creando participante...">Crear participante HUT</SubmitButton>
      </form>
    </section>
  );
}

function HutParticipantCard({
  availableSlots,
  participant,
  studyId
}: {
  availableSlots: HutRegistrationSlotAdmin[];
  participant: HutAdminParticipant;
  studyId: string;
}) {
  const disabled = participant.status === "DISQUALIFIED" || participant.status === "COMPLETED";
  const referenceSelfieDisabledReason = disabled
    ? "No se puede modificar porque la participacion ya esta cerrada."
    : null;

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
          <Field label="Folio" value={participant.folio ?? "No asignado"} />
          <Field label="Primera fragancia / brazo izquierdo" value={participant.firstFragranceLeftArm ?? "No asignada"} />
          <Field label="Segunda fragancia / brazo derecho" value={participant.secondFragranceRightArm ?? "No asignada"} />
          <Field label="Origen folio" value={participant.registrationSlot ? `Slot ${participant.registrationSlot.folio}` : participant.folio ? "Manual" : "No asignado"} />
          <Field label="Estado" value={hutParticipantStatusLabel(participant.status)} />
          <Field label="Modo prueba" value={participant.testMode ? "Activo" : "Inactivo"} />
          <Field label="Selfie de registro" value={participant.referenceSelfie.status === "COMPLETE" ? "Completa" : "Faltante"} />
          <Field label="Bloque actual" value={String(participant.currentBlockNumber)} />
          <Field label="Video esperado" value={String(participant.currentVideoSequence)} />
          <Field label="Siguiente disponibilidad" value={participant.availability.nextAvailableAt ? participant.availability.nextAvailableAt.toLocaleString("es-MX") : "No disponible"} />
        </dl>
        <section className="rounded-md border border-sky-200 bg-sky-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-sky-950">{`Modo prueba: ${participant.testMode ? "Activo" : "Inactivo"}`}</p>
              {participant.testMode ? (
                <p className="mt-1 text-xs leading-5 text-sky-900">
                  Este participante puede avanzar sin esperar 5:00 a.m. ni dias reales.
                </p>
              ) : null}
            </div>
            <form action={setHutTestModeAction.bind(null, studyId, participant.id)}>
              {participant.testMode ? null : <input name="enabled" type="hidden" value="true" />}
              <SubmitButton pendingLabel="Guardando modo prueba...">
                {participant.testMode ? "Desactivar modo prueba" : "Activar modo prueba"}
              </SubmitButton>
            </form>
          </div>
        </section>
        {participant.referenceSelfie.status === "MISSING" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Falta selfie de registro.
          </p>
        ) : null}
        {participant.usedToleranceInCurrentBlock ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Ya usó su día de tolerancia del bloque.
          </p>
        ) : null}
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link participante</p>
          <a className="mt-2 block break-all text-sm font-semibold text-teal-700" href={participant.link} rel="noreferrer" target="_blank">
            {participant.link}
          </a>
        </div>
        <section className="rounded-md border border-zinc-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-zinc-950">Selfie de registro</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Captura la selfie base antes de iniciar videos. Se usará para comparar las selfies diarias.
          </p>
          <div className="mt-3">
            <HutReferenceSelfieUpload
              disabled={Boolean(referenceSelfieDisabledReason)}
              disabledReason={referenceSelfieDisabledReason}
              participantId={participant.id}
              studyId={studyId}
            />
          </div>
        </section>
        <IdentityReviewCard participant={participant} studyId={studyId} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BlockCard block={participant.block1} label="Bloque 1" participantId={participant.id} studyId={studyId} />
        <BlockCard block={participant.block2} label="Bloque 2" participantId={participant.id} studyId={studyId} />
        <CallCard call={participant.call1} label="Evaluación 1" />
        <CallCard call={participant.call2} label="Evaluación 2" />
      </div>

      <div className="space-y-3">
        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-950">Acciones operativas</h3>
          <div className="mt-3 space-y-3">
            <details className="rounded-md border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-950">Asignar folio/rotacion</summary>
              <form action={assignHutParticipantRotationAction.bind(null, studyId, participant.id)} className="mt-3 space-y-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
                  Slot disponible
                  <select className={inputClass} name="slotId">
                    <option value="">Asignacion manual</option>
                    {availableSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.folio} - {slot.firstFragranceLeftArm} / {slot.secondFragranceRightArm}
                      </option>
                    ))}
                  </select>
                </label>
                <input className={inputClass} name="folio" placeholder="Folio manual" />
                <input className={inputClass} name="firstFragranceLeftArm" placeholder="Primera fragancia / brazo izquierdo" />
                <input className={inputClass} name="secondFragranceRightArm" placeholder="Segunda fragancia / brazo derecho" />
                <SubmitButton pendingLabel="Asignando folio...">Guardar folio/rotacion</SubmitButton>
              </form>
            </details>
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
          <form action={setHutVisualOverrideAction.bind(null, studyId, participant.id)} className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-amber-950">Override de verificación visual</p>
            <label className="flex items-center gap-2 text-xs text-amber-950">
              <input defaultChecked={participant.visualOverrideEnabled} name="enabled" type="checkbox" />
              Permitir continuar sin selfie coincidente
            </label>
            <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio si se habilita" rows={2} />
            <SubmitButton pendingLabel="Guardando override...">Guardar override visual</SubmitButton>
          </form>
        </details>
        <details className="rounded-md border border-rose-200 bg-rose-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-rose-950">Zona peligrosa</summary>
          <p className="mt-2 text-xs leading-5 text-rose-900">
            Eliminar este participante borrara sus bloques, videos, selfies, verificaciones, evaluaciones y avance HUT. Esta accion no se puede deshacer.
          </p>
          <form action={resetHutReferenceSelfieAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
            <input className={inputClass} name="confirmation" placeholder="ELIMINAR SELFIE DE REGISTRO" required />
            <SubmitButton pendingLabel="Eliminando selfie...">Eliminar selfie de registro</SubmitButton>
          </form>
          <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 1)} className="mt-4 space-y-2">
            <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACION 1" required />
            <SubmitButton pendingLabel="Restableciendo evaluacion...">Restablecer evaluacion 1</SubmitButton>
          </form>
          <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 2)} className="mt-4 space-y-2">
            <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACION 2" required />
            <SubmitButton pendingLabel="Restableciendo evaluacion...">Restablecer evaluacion 2</SubmitButton>
          </form>
          <form action={deleteHutParticipantAction.bind(null, studyId, participant.id)} className="mt-4 space-y-2">
            <input className={inputClass} name="confirmation" placeholder="ELIMINAR PARTICIPANTE HUT" required />
            <SubmitButton pendingLabel="Eliminando participante...">Eliminar participante HUT</SubmitButton>
          </form>
        </details>
      </div>
    </article>
  );
}

function IdentityReviewCard({ participant, studyId }: { participant: HutAdminParticipant; studyId: string }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Revision de identidad</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Compara la selfie base con las selfies diarias y registra la decision manual cuando haga falta.
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold text-zinc-950">{`Identidad diaria: ${identitySummaryLabel(participant.identityReview.summaryLabel)}`}</p>
          <p className="mt-1 text-zinc-500">
            {participant.identityReview.lastReviewedAt
              ? `Ultima revision: ${participant.identityReview.lastReviewedAt.toLocaleString("es-MX")}`
              : "Ultima revision: Sin revision manual"}
          </p>
          {participant.identityReview.lastStatus ? (
            <p className="mt-1 text-zinc-500">{participant.identityReview.lastStatus}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-zinc-700">
        <Field label="Selfie de registro" value={participant.referenceSelfie.status === "COMPLETE" ? "Completa" : "Faltante"} />
      </div>

      {!participant.identityReview.referenceSignedUrl ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Falta selfie de registro.
        </p>
      ) : (
        <div className="mt-3">
          <a
            className="text-xs font-semibold text-teal-700"
            href={participant.identityReview.referenceSignedUrl}
            rel="noreferrer"
            target="_blank"
          >
            Ver selfie de registro
          </a>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {participant.identityReview.items.map((item) => (
          <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={`${participant.id}-${item.blockNumber}-${item.sequenceNumber}`}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{`B${item.blockNumber} Video ${item.sequenceNumber}`}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.verificationDate ? item.verificationDate.toLocaleString("es-MX") : "Sin selfie diaria registrada"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${identityStatusClass(item.status)}`}>{item.reviewLabel}</p>
                  {item.similarityPercentage != null ? <p className="mt-1 text-xs text-zinc-500">{`Similitud: ${item.similarityPercentage}%`}</p> : null}
                </div>
              </div>
            </summary>

            {item.status === "NOT_MATCHED" || item.status === "UNCERTAIN" || item.status === "PENDING_REVIEW" ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Esta verificacion requiere revision manual.
              </p>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <MediaPanel
                emptyLabel="Selfie base no disponible"
                title="Selfie de registro/base"
                url={participant.identityReview.referenceSignedUrl}
              />
              <MediaPanel
                emptyLabel="Selfie diaria pendiente"
                title={`Selfie diaria B${item.blockNumber} Video ${item.sequenceNumber}`}
                url={item.attemptSignedUrl}
              />
            </div>

            <div className="mt-3 grid gap-1 text-xs text-zinc-700">
              <Field label="Estado de verificacion" value={item.reviewLabel} />
              <Field label="Fecha/hora" value={item.verificationDate ? item.verificationDate.toLocaleString("es-MX") : "Pendiente"} />
              {item.reviewedAt ? <Field label="Revision manual" value={item.reviewedAt.toLocaleString("es-MX")} /> : null}
              {item.reviewNotes ? <Field label="Nota" value={item.reviewNotes} /> : null}
            </div>

            {item.verificationId ? (
              <form action={reviewHutVisualVerificationAction.bind(null, studyId, participant.id, item.verificationId)} className="mt-3 space-y-2">
                <textarea className={inputClass} name="reason" placeholder="Motivo o nota obligatoria" required rows={2} />
                <div className="flex flex-wrap gap-2">
                  <button className={primaryButtonClass} name="decision" type="submit" value="approve">
                    Aprobar manualmente
                  </button>
                  <button className={dangerButtonClass} name="decision" type="submit" value="reject">
                    Marcar como no coincide
                  </button>
                  <button className={secondaryActionButtonClass} name="decision" type="submit" value="pending">
                    Mantener en revision
                  </button>
                </div>
              </form>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}

function MediaPanel({ emptyLabel, title, url }: { emptyLabel: string; title: string; url: string | null }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={title} className="mt-3 aspect-[3/4] w-full rounded-md bg-zinc-100 object-cover" src={url} />
          <a className="mt-2 inline-block text-xs font-semibold text-teal-700" href={url} rel="noreferrer" target="_blank">
            Ver imagen completa
          </a>
        </>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">{emptyLabel}</p>
      )}
    </div>
  );
}

function BlockCard({
  block,
  label,
  participantId,
  studyId
}: {
  block: HutAdminParticipant["block1"];
  label: string;
  participantId: string;
  studyId: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <h3 className="text-sm font-semibold text-zinc-950">{label}</h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-700">
        <Field label="Estado" value={block ? hutBlockStatusLabel(block.status) : "Sin bloque"} />
        <Field label="Videos" value={`${block?.submittedVideosCount ?? 0}/3`} />
        <Field label="Días omitidos" value={`${block?.missedDaysCount ?? 0}/1`} />
        {block?.disqualificationReason ? <Field label="Motivo" value={block.disqualificationReason} /> : null}
      </dl>
      {block ? (
        <div className="mt-3 space-y-2">
          {block.videos.map((video) => (
            <div className="rounded-md border border-zinc-200 bg-white p-2" key={`${block.blockNumber}-${video.sequenceNumber}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-zinc-950">Video {video.sequenceNumber}</span>
                {video.signedUrl ? (
                  <a className="font-semibold text-teal-700" href={video.signedUrl} rel="noreferrer" target="_blank">
                    Ver video
                  </a>
                ) : (
                  <span className="text-zinc-500">Pendiente</span>
                )}
              </div>
              {video.submittedAt ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {video.status} - {video.submittedAt.toLocaleString("es-MX")}
                </p>
              ) : null}
              {video.signedUrl ? (
                <form
                  action={resetHutVideoSubmissionAction.bind(null, studyId, participantId, block.blockNumber as 1 | 2, video.sequenceNumber)}
                  className="mt-2 space-y-1"
                >
                  <input className={inputClass} name="confirmation" placeholder={`RESTABLECER VIDEO ${video.sequenceNumber}`} />
                  <SubmitButton pendingLabel="Restableciendo video...">{`Restablecer video ${video.sequenceNumber}`}</SubmitButton>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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

function hutRegistrationSlotStatusLabel(status: string) {
  const labels: Record<string, string> = {
    AVAILABLE: "Disponible",
    CANCELLED: "Cancelado",
    REGISTERED: "Registrado"
  };
  return labels[status] ?? status;
}

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass = "rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800";
const dangerButtonClass = "rounded-md bg-rose-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800";
const secondaryActionButtonClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100";

function identitySummaryLabel(status: HutAdminParticipant["identityReview"]["summaryLabel"]) {
  const labels: Record<HutAdminParticipant["identityReview"]["summaryLabel"], string> = {
    FALLIDA: "Fallida",
    OK: "OK",
    PENDIENTE: "Pendiente",
    REVISION_REQUERIDA: "Revision requerida",
    SIN_SELFIE_BASE: "Falta selfie base"
  };
  return labels[status];
}

function identityStatusClass(status: HutAdminParticipant["identityReview"]["items"][number]["status"]) {
  if (status === "MATCHED" || status === "NOT_REQUIRED_BY_OVERRIDE") {
    return "text-emerald-700";
  }
  if (status === "NOT_MATCHED") {
    return "text-rose-700";
  }
  if (status === "UNCERTAIN" || status === "PENDING_REVIEW") {
    return "text-amber-700";
  }
  return "text-zinc-600";
}
