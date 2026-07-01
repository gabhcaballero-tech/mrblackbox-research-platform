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
  setHutTestModeAction,
  setHutVisualOverrideAction,
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
          <h2 className="text-lg font-semibold text-zinc-950">Folios y rotación</h2>
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
                studyTimeZone={dashboard.study.timeZoneIana || "America/Mexico_City"}
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
        Prepara el folio y su rotación antes de capturar datos del participante.
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
          description="Crea o importa folios con rotación para generar links de registro en campo."
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
          Folio/rotación disponible
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
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Asignación manual opcional</p>
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
  studyId,
  studyTimeZone
}: {
  availableSlots: HutRegistrationSlotAdmin[];
  participant: HutAdminParticipant;
  studyId: string;
  studyTimeZone: string;
}) {
  const disabled = participant.status === "DISQUALIFIED" || participant.status === "COMPLETED";
  const referenceSelfieDisabledReason = disabled
    ? "No se puede modificar porque la participación ya está cerrada."
    : null;
  const summarySelfieLabel = participant.referenceSelfie.status === "COMPLETE" ? "Completa" : "Faltante";
  const nextAvailability = formatAvailability(participant.availability.nextAvailableAt, studyTimeZone);

  return (
    <article className="p-4 lg:p-5">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-zinc-950">{participant.name}</h3>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
              <span>{participant.folio ? `Folio ${participant.folio}` : "Folio no asignado"}</span>
              <span>{participant.phone ?? "Celular no capturado"}</span>
              <span>{participant.email ?? "Correo no capturado"}</span>
            </div>
          </div>
          <p className="font-mono text-[11px] text-zinc-400">{participant.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryBadge label="Estado general" tone="slate" value={hutParticipantStatusLabel(participant.status)} />
          <SummaryBadge label="Bloque actual" tone="slate" value={`Bloque ${participant.currentBlockNumber}`} />
          <SummaryBadge label="Video esperado" tone="slate" value={`Video ${participant.currentVideoSequence}`} />
          <SummaryBadge label="Siguiente disponibilidad" tone="slate" value={nextAvailability} />
          <SummaryBadge label="Selfie de registro" tone={participant.referenceSelfie.status === "COMPLETE" ? "emerald" : "amber"} value={summarySelfieLabel} />
          <SummaryBadge label="Identidad diaria" tone={identitySummaryTone(participant.identityReview.summaryLabel)} value={identitySummaryLabel(participant.identityReview.summaryLabel)} />
          <SummaryBadge label="Modo prueba" tone={participant.testMode ? "sky" : "slate"} value={participant.testMode ? "Activo" : "Inactivo"} />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {participant.referenceSelfie.status === "MISSING" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Falta selfie de registro.
          </p>
        ) : null}
        {participant.usedToleranceInCurrentBlock ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Ya usó su día de tolerancia del bloque actual.
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)_minmax(300px,0.9fr)]">
        <div className="space-y-4">
          <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold text-zinc-950">Resumen</h4>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <Field label="Celular" value={participant.phone ?? "No capturado"} />
              <Field label="Correo" value={participant.email ?? "No capturado"} />
              <Field label="Reclutador" value={participant.recruiter ?? "No capturado"} />
              <Field label="Folio" value={participant.folio ?? "No asignado"} />
              <Field label="Primera fragancia / brazo izquierdo" value={participant.firstFragranceLeftArm ?? "No asignada"} />
              <Field label="Segunda fragancia / brazo derecho" value={participant.secondFragranceRightArm ?? "No asignada"} />
              <Field
                label="Origen del folio"
                value={participant.registrationSlot ? `Slot ${participant.registrationSlot.folio}` : participant.folio ? "Manual" : "No asignado"}
              />
              <Field label="Modo prueba" value={participant.testMode ? "Activo" : "Inactivo"} />
            </div>
            <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link participante</p>
              <a className="mt-2 block break-all text-sm font-semibold text-teal-700" href={participant.link} rel="noreferrer" target="_blank">
                {participant.link}
              </a>
            </div>
            <section className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-950">{`Modo prueba: ${participant.testMode ? "Activo" : "Inactivo"}`}</p>
                  {participant.testMode ? (
                    <p className="mt-1 text-xs leading-5 text-sky-900">
                      Este participante puede avanzar sin esperar 5:00 a.m. ni días reales.
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
          </section>

          <SelfieRegistrationCard
            disabledReason={referenceSelfieDisabledReason}
            participant={participant}
            studyId={studyId}
          />

          <IdentityReviewCard participant={participant} studyId={studyId} studyTimeZone={studyTimeZone} />
        </div>

        <div className="space-y-4">
          <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-950">Bloques y videos</h4>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  Revisión operativa compacta por bloque, con acceso rápido a video, fecha y restablecimiento.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <BlockCard block={participant.block1} label="Bloque 1" participantId={participant.id} studyId={studyId} studyTimeZone={studyTimeZone} />
              <BlockCard block={participant.block2} label="Bloque 2" participantId={participant.id} studyId={studyId} studyTimeZone={studyTimeZone} />
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-zinc-950">Evaluaciones</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CallCard call={participant.call1} label="Evaluación 1" studyTimeZone={studyTimeZone} />
              <CallCard call={participant.call2} label="Evaluación 2" studyTimeZone={studyTimeZone} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold text-zinc-950">Herramientas</h4>

            <details className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-950">Asignar folio/rotación</summary>
              <form action={assignHutParticipantRotationAction.bind(null, studyId, participant.id)} className="mt-3 space-y-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
                  Slot disponible
                  <select className={inputClass} name="slotId">
                    <option value="">Asignación manual</option>
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
                <SubmitButton pendingLabel="Asignando folio...">Guardar folio/rotación</SubmitButton>
              </form>
            </details>

            <section className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Operación</h5>
              <div className="mt-3 space-y-3">
                <form action={startHutBlockAction.bind(null, studyId, participant.id, 1)}>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
                    Inicio bloque 1
                    <input className={inputClass} name="startDate" type="date" />
                  </label>
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
                  <SubmitButton disabled={disabled} pendingLabel="Registrando día omitido...">
                    Registrar día omitido
                  </SubmitButton>
                </form>
              </div>
            </section>

            <section className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evaluación 1</h5>
              <form action={completeHutCallEvaluationAction.bind(null, studyId, participant.id, 1)} className="mt-3 space-y-2">
                <input className={inputClass} name="evaluatorName" placeholder="Evaluador" />
                <textarea className={inputClass} name="notes" placeholder="Notas de evaluación 1" rows={2} />
                <SubmitButton disabled={participant.block1?.status !== "CALL_PENDING"} pendingLabel="Guardando evaluación 1...">
                  Completar evaluación 1
                </SubmitButton>
              </form>
            </section>

            <section className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evaluación 2</h5>
              <form action={startHutBlockAction.bind(null, studyId, participant.id, 2)} className="space-y-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
                  Inicio bloque 2
                  <input className={inputClass} name="startDate" type="date" />
                </label>
                <SubmitButton
                  disabled={disabled || participant.call1?.status !== "COMPLETED" || participant.block2?.status !== "NOT_STARTED"}
                  pendingLabel="Iniciando bloque 2..."
                >
                  Iniciar bloque 2
                </SubmitButton>
              </form>
              <form action={completeHutCallEvaluationAction.bind(null, studyId, participant.id, 2)} className="mt-3 space-y-2">
                <input className={inputClass} name="evaluatorName" placeholder="Evaluador" />
                <textarea className={inputClass} name="notes" placeholder="Notas de evaluación 2" rows={2} />
                <SubmitButton disabled={participant.block2?.status !== "CALL_PENDING"} pendingLabel="Guardando evaluación 2...">
                  Completar evaluación 2
                </SubmitButton>
              </form>
            </section>
          </section>

          <details className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-950">Override manual</summary>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              Usa esta sección solo si el supervisor decide reactivar a una persona marcada como no apta o permitir continuidad por override visual.
            </p>
            <form action={reactivateHutParticipantAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
              <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
              <SubmitButton disabled={participant.status !== "DISQUALIFIED"} pendingLabel="Reactivando...">
                Reactivar participante
              </SubmitButton>
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

          <details className="rounded-md border border-rose-200 bg-rose-50 p-4" data-testid={`hut-danger-zone-${participant.id}`}>
            <summary className="cursor-pointer text-sm font-semibold text-rose-950">Zona peligrosa</summary>
            <p className="mt-2 text-xs leading-5 text-rose-900">
              Eliminar este participante borrará sus bloques, videos, selfies, verificaciones, evaluaciones y avance HUT. Esta acción no se puede deshacer.
            </p>
            <form action={resetHutReferenceSelfieAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
              <input className={inputClass} name="confirmation" placeholder="ELIMINAR SELFIE DE REGISTRO" required />
              <SubmitButton pendingLabel="Eliminando selfie...">Eliminar selfie de registro</SubmitButton>
            </form>
            <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 1)} className="mt-4 space-y-2">
              <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACIÓN 1" required />
              <SubmitButton pendingLabel="Restableciendo evaluación...">Restablecer evaluación 1</SubmitButton>
            </form>
            <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 2)} className="mt-4 space-y-2">
              <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACIÓN 2" required />
              <SubmitButton pendingLabel="Restableciendo evaluación...">Restablecer evaluación 2</SubmitButton>
            </form>
            <form action={deleteHutParticipantAction.bind(null, studyId, participant.id)} className="mt-4 space-y-2">
              <input className={inputClass} name="confirmation" placeholder="ELIMINAR PARTICIPANTE HUT" required />
              <SubmitButton pendingLabel="Eliminando participante...">Eliminar participante HUT</SubmitButton>
            </form>
          </details>
        </div>
      </div>
    </article>
  );
}

function SelfieRegistrationCard({
  disabledReason,
  participant,
  studyId
}: {
  disabledReason: string | null;
  participant: HutAdminParticipant;
  studyId: string;
}) {
  const hasSelfie = participant.referenceSelfie.status === "COMPLETE";
  const toggleLabel = hasSelfie ? "Reemplazar selfie de registro" : "Tomar selfie de registro";

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">{`Selfie de registro: ${hasSelfie ? "Completa" : "Faltante"}`}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            La selfie base se usa para revisar identidad en los videos diarios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {participant.referenceSelfie.signedUrl ? (
            <a
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
              href={participant.referenceSelfie.signedUrl}
              rel="noreferrer"
              target="_blank"
            >
              Ver selfie de registro
            </a>
          ) : null}
        </div>
      </div>

      {disabledReason ? (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{disabledReason}</p>
      ) : null}

      <details className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3" data-testid={`hut-reference-selfie-details-${participant.id}`}>
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">{toggleLabel}</summary>
        <div className="mt-3">
          <HutReferenceSelfieUpload
            disabled={Boolean(disabledReason)}
            disabledReason={disabledReason}
            participantId={participant.id}
            studyId={studyId}
          />
        </div>
      </details>
    </section>
  );
}

function IdentityReviewCard({
  participant,
  studyId,
  studyTimeZone
}: {
  participant: HutAdminParticipant;
  studyId: string;
  studyTimeZone: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">{`Identidad diaria: ${identitySummaryLabel(participant.identityReview.summaryLabel)}`}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {`Selfie de registro: ${participant.referenceSelfie.status === "COMPLETE" ? "Completa" : "Faltante"}`}
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {participant.identityReview.lastReviewedAt ? (
            <p>{`Última revisión: ${formatDateTime(participant.identityReview.lastReviewedAt, studyTimeZone)}`}</p>
          ) : (
            <p>Última revisión: Sin revisión manual</p>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3" data-testid={`hut-identity-review-details-${participant.id}`}>
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">Ver revisión de identidad</summary>
        <div className="mt-4 space-y-3">
          {!participant.identityReview.referenceSignedUrl ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Falta selfie de registro.
            </p>
          ) : (
            <a
              className="text-xs font-semibold text-teal-700"
              href={participant.identityReview.referenceSignedUrl}
              rel="noreferrer"
              target="_blank"
            >
              Ver selfie de registro
            </a>
          )}

          {participant.identityReview.items.map((item) => (
            <details className="rounded-md border border-zinc-200 bg-white p-3" key={`${participant.id}-${item.blockNumber}-${item.sequenceNumber}`}>
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">{`B${item.blockNumber} · Video ${item.sequenceNumber}`}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.verificationDate ? formatDateTime(item.verificationDate, studyTimeZone) : "Sin selfie diaria registrada"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${identityStatusClass(item.status)}`}>{item.reviewLabel}</p>
                    {item.similarityPercentage != null ? (
                      <p className="mt-1 text-xs text-zinc-500">{`Similitud: ${item.similarityPercentage}%`}</p>
                    ) : null}
                  </div>
                </div>
              </summary>

              {(item.status === "NOT_MATCHED" || item.status === "UNCERTAIN" || item.status === "PENDING_REVIEW") && item.verificationId ? (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Esta verificación requiere revisión manual.
                </p>
              ) : null}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <MediaPanel emptyLabel="Selfie base no disponible" title="Selfie de registro/base" url={participant.identityReview.referenceSignedUrl} />
                <MediaPanel
                  emptyLabel="Selfie diaria pendiente"
                  title={`Selfie diaria B${item.blockNumber} Video ${item.sequenceNumber}`}
                  url={item.attemptSignedUrl}
                />
              </div>

              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <Field label="Estado de verificación" value={item.reviewLabel} />
                <Field label="Fecha/hora" value={item.verificationDate ? formatDateTime(item.verificationDate, studyTimeZone) : "Pendiente"} />
                {item.reviewedAt ? <Field label="Revisión manual" value={formatDateTime(item.reviewedAt, studyTimeZone)} /> : null}
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
                      Mantener en revisión
                    </button>
                  </div>
                </form>
              ) : null}
            </details>
          ))}
        </div>
      </details>
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
  studyId,
  studyTimeZone
}: {
  block: HutAdminParticipant["block1"];
  label: string;
  participantId: string;
  studyId: string;
  studyTimeZone: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-zinc-950">{label}</h5>
          <p className="mt-1 text-xs text-zinc-500">
            {`Estado: ${block ? hutBlockStatusLabel(block.status) : "Sin bloque"} | Videos: ${block?.submittedVideosCount ?? 0}/3 | Días omitidos: ${block?.missedDaysCount ?? 0}/1`}
          </p>
        </div>
      </div>

      {block?.disqualificationReason ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
          {block.disqualificationReason}
        </p>
      ) : null}

      {block ? (
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200">
          <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-3 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 md:grid">
            <span>Video</span>
            <span>Estado</span>
            <span>Fecha/hora</span>
            <span>Acciones</span>
          </div>
          <div className="divide-y divide-zinc-200">
            {block.videos.map((video) => (
              <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] md:items-center" key={`${block.blockNumber}-${video.sequenceNumber}`}>
                <div className="text-sm font-semibold text-zinc-950">{`Video ${video.sequenceNumber}`}</div>
                <div className="text-sm text-zinc-700">{hutVideoStatusLabel(video.status, video.signedUrl)}</div>
                <div className="text-sm text-zinc-600">{video.submittedAt ? formatDateTime(video.submittedAt, studyTimeZone) : "—"}</div>
                <div className="flex flex-wrap gap-2">
                  {video.signedUrl ? (
                    <a className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100" href={video.signedUrl} rel="noreferrer" target="_blank">
                      Ver video
                    </a>
                  ) : (
                    <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">Pendiente</span>
                  )}
                  {video.signedUrl ? (
                    <details className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-rose-900">Restablecer video</summary>
                      <form
                        action={resetHutVideoSubmissionAction.bind(null, studyId, participantId, block.blockNumber as 1 | 2, video.sequenceNumber)}
                        className="mt-2 space-y-2"
                      >
                        <input className={inputClass} name="confirmation" placeholder={`RESTABLECER VIDEO ${video.sequenceNumber}`} />
                        <SubmitButton pendingLabel="Restableciendo video...">{`Restablecer video ${video.sequenceNumber}`}</SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CallCard({
  call,
  label,
  studyTimeZone
}: {
  call: HutAdminParticipant["call1"];
  label: string;
  studyTimeZone: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <h5 className="text-sm font-semibold text-zinc-950">{label}</h5>
      <div className="mt-3 grid gap-2 text-sm">
        <Field label="Estado" value={call ? hutCallStatusLabel(call.status) : "Pendiente"} />
        <Field label="Completada" value={call?.completedAt ? formatDateTime(call.completedAt, studyTimeZone) : "No"} />
      </div>
    </section>
  );
}

function SummaryBadge({
  label,
  tone,
  value
}: {
  label: string;
  tone: "amber" | "emerald" | "rose" | "sky" | "slate";
  value: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : tone === "sky"
            ? "border-sky-200 bg-sky-50 text-sky-900"
            : "border-zinc-200 bg-zinc-50 text-zinc-900";

  return (
    <div className={`rounded-full border px-3 py-2 text-xs ${toneClass}`}>
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-zinc-900">{value}</dd>
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

function hutVideoStatusLabel(status: string, signedUrl: string | null) {
  if (!signedUrl) {
    return "Pendiente";
  }

  const labels: Record<string, string> = {
    APPROVED: "Aprobado",
    COMPLETE: "Enviado",
    PENDING: "Pendiente",
    SUBMITTED: "Enviado"
  };
  return labels[status] ?? "Enviado";
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
    REVISION_REQUERIDA: "Revisión requerida",
    SIN_SELFIE_BASE: "Falta selfie base"
  };
  return labels[status];
}

function identitySummaryTone(status: HutAdminParticipant["identityReview"]["summaryLabel"]) {
  if (status === "OK") {
    return "emerald" as const;
  }
  if (status === "FALLIDA") {
    return "rose" as const;
  }
  if (status === "REVISION_REQUERIDA" || status === "SIN_SELFIE_BASE") {
    return "amber" as const;
  }
  return "slate" as const;
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

function formatDateTime(value: Date | null | undefined, timeZone: string) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    year: "numeric"
  }).format(value);
}

function formatAvailability(value: Date | null | undefined, timeZone: string) {
  if (!value) {
    return "No disponible";
  }

  return formatDateTime(value, timeZone);
}
