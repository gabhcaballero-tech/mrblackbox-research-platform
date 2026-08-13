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
  moveHutInitialEvidenceToDeliveryAction,
  reactivateHutParticipantAction,
  reconcileReservedHutNavParticipantsAction,
  releaseHutApplicationPhotoSlotAction,
  releaseHutSecondProductAction,
  requestHutApplicationPhotoSlotRepeatAction,
  reviewHutVisualVerificationAction,
  resetHutApplicationPhotoEvidenceAction,
  resetHutCallEvaluationAction,
  resetHutQuestionnaireAttemptAction,
  resetHutReferenceSelfieAction,
  resetHutVideoSubmissionAction,
  revokeHutPhaseCodeAction,
  sendHutPhotoReminderWhatsAppAction,
  sendHutRegistrationWhatsAppAction,
  setHutTestModeAction,
  setHutVisualOverrideAction,
  startHutBlockAction,
  syncHutParticipantProfileFromNavAction
} from "@/modules/hut/actions";
import {
  buildHutPhotoTimeline,
  createHutRepository,
  formatHutPhotoTimelineSlotTitle,
  type HutAdminParticipant,
  type HutRegistrationSlotAdmin,
  type HutReservedNavReconciliationPreview
} from "@/modules/hut";
import { normalizeWhatsAppRecipient } from "@/modules/oneui-whatsapp";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { HutParticipantImportPanel } from "./_components/HutParticipantImportPanel";
import { HutDeliveryRecoveryUpload } from "./_components/HutDeliveryRecoveryUpload";
import { HutPhaseCodeControls } from "./_components/HutPhaseCodeControls";
import { HutRegistrationSlotImportPanel } from "./_components/HutRegistrationSlotImportPanel";
import { HutReferenceSelfieUpload } from "./_components/HutReferenceSelfieUpload";
import { HutWhatsAppManualBlock } from "./_components/HutWhatsAppManualBlock";

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
  const actor = await requireCapability("screening:review");
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
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut-ops`}>
          Operacion HUT
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

      <HutReservedNavReconciliationPanel preview={dashboard.reservedNavReconciliation} studyId={studyId} />

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
                requestOrigin={requestOrigin}
                showAdminResetTools={actor.role === "ADMIN"}
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

function HutReservedNavReconciliationPanel({
  preview,
  studyId
}: {
  preview: HutReservedNavReconciliationPreview;
  studyId: string;
}) {
  if (preview.summary.total === 0) {
    return null;
  }

  return (
    <section className="mt-8 rounded-lg border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-sky-950">Reconciliar HUT con NAV</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-900">
            Herramienta segura para HUT-001 a HUT-156 que nacieron como HUT directo y ahora ya tienen NAV equivalente. El preview no cambia datos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white px-2.5 py-1 text-sky-900">Total: {preview.summary.total}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">Aplicables: {preview.summary.applicable}</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-sky-900">Ya vinculados: {preview.summary.alreadyLinked}</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">Pendiente NAV: {preview.summary.missingNav}</span>
          </div>
        </div>
        <form action={reconcileReservedHutNavParticipantsAction.bind(null, studyId)} className="min-w-72 rounded-md border border-sky-200 bg-white p-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Confirmacion
            <input className={inputClass} name="confirmation" placeholder="RECONCILIAR HUT" />
          </label>
          <div className="mt-3">
            <SubmitButton disabled={preview.summary.applicable === 0} pendingLabel="Reconciliando...">
              Reconciliar HUT con NAV
            </SubmitButton>
          </div>
        </form>
      </div>
      <div className="mt-4 overflow-x-auto rounded-md border border-sky-100 bg-white">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
          <thead className="bg-zinc-50 uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">HUT</th>
              <th className="px-3 py-2">NAV equivalente</th>
              <th className="px-3 py-2">Origen actual</th>
              <th className="px-3 py-2">Origen nuevo</th>
              <th className="px-3 py-2">Nombre actual</th>
              <th className="px-3 py-2">Nombre NAV</th>
              <th className="px-3 py-2">EVA1/EVA2</th>
              <th className="px-3 py-2">Fases</th>
              <th className="px-3 py-2">Fotos</th>
              <th className="px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {preview.rows.map((row) => (
              <tr key={row.hutParticipantId}>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-950">{row.hutFolio}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.navFolio}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.currentOrigin}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.nextOrigin}</td>
                <td className="px-3 py-2">{row.currentName ?? "-"}</td>
                <td className="px-3 py-2">{row.navName ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.eva1 ?? "-"} / {row.eva2 ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.existingPhaseCount}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.existingPhotoCount}</td>
                <td className={row.canApply ? "px-3 py-2 font-semibold text-emerald-700" : "px-3 py-2 text-zinc-600"}>
                  {row.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  requestOrigin,
  showAdminResetTools,
  studyId,
  studyTimeZone
}: {
  availableSlots: HutRegistrationSlotAdmin[];
  participant: HutAdminParticipant;
  requestOrigin: string;
  showAdminResetTools: boolean;
  studyId: string;
  studyTimeZone: string;
}) {
  const disabled = participant.status === "DISQUALIFIED" || participant.status === "COMPLETED";
  const referenceSelfieDisabledReason = disabled
    ? "No se puede modificar porque la participación ya está cerrada."
    : null;
  const summarySelfieLabel = participant.referenceSelfie.status === "COMPLETE" ? "Completa" : "Faltante";
  const nextAvailability = formatAvailability(participant.availability.nextAvailableAt, studyTimeZone);
  const hutWhatsAppManualMessage = buildHutRegistrationWhatsAppMessage(participant);
  const protocolVersion = participant.protocolVersion ?? "LEGACY_VIDEO";
  const origin = participant.origin ?? "HUT_DIRECTO";
  const isApplicationPhoto = protocolVersion === "APPLICATION_PHOTO";
  const whatsappRequiresSelfie = protocolVersion === "LEGACY_VIDEO" && participant.referenceSelfie.status === "MISSING";
  const hutWhatsAppUrl = buildHutWhatsAppUrl({
    message: hutWhatsAppManualMessage,
    phone: participant.phone
  });

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
          <SummaryBadge label="Origen HUT" tone={origin === "CLT_HUT" ? "sky" : "slate"} value={origin === "CLT_HUT" ? "CLT + HUT" : "HUT directo"} />
          <SummaryBadge label="Protocolo" tone={isApplicationPhoto ? "emerald" : "slate"} value={isApplicationPhoto ? "Fotos de aplicacion" : "Legacy videos"} />
          {isApplicationPhoto ? (
            <SummaryBadge label="Fase actual" tone="emerald" value={applicationPhotoCurrentPhaseLabel(participant)} />
          ) : (
            <>
              <SummaryBadge label="Bloque actual" tone="slate" value={`Bloque ${participant.currentBlockNumber}`} />
              <SummaryBadge label="Video esperado" tone="slate" value={`Video ${participant.currentVideoSequence}`} />
              <SummaryBadge label="Siguiente disponibilidad" tone="slate" value={nextAvailability} />
            </>
          )}
          {protocolVersion === "LEGACY_VIDEO" ? (
            <>
              <SummaryBadge label="Selfie de registro" tone={participant.referenceSelfie.status === "COMPLETE" ? "emerald" : "amber"} value={summarySelfieLabel} />
              <SummaryBadge label="Identidad diaria" tone={identitySummaryTone(participant.identityReview.summaryLabel)} value={identitySummaryLabel(participant.identityReview.summaryLabel)} />
            </>
          ) : null}
          <SummaryBadge label="Modo prueba" tone={participant.testMode ? "sky" : "slate"} value={participant.testMode ? "Activo" : "Inactivo"} />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {protocolVersion === "LEGACY_VIDEO" && participant.referenceSelfie.status === "MISSING" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Guarda la selfie de registro para habilitar el inicio del HUT.
          </p>
        ) : null}
        {protocolVersion === "LEGACY_VIDEO" && participant.usedToleranceInCurrentBlock ? (
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
              <Field label="Origen HUT" value={origin === "CLT_HUT" ? "CLT + HUT" : "HUT directo"} />
              <Field label="Protocolo HUT" value={protocolVersion === "APPLICATION_PHOTO" ? "Fotos de aplicacion" : "Legacy videos"} />
              <Field label="WhatsApp registro" value={whatsappAutomationLabel(participant.whatsappRegistration.status)} />
              <Field label="WhatsApp Meta ID" value={participant.whatsappRegistration.metaMessageId ?? "Sin ID"} />
              <Field
                label="WhatsApp enviado"
                value={participant.whatsappRegistration.sentAt ? formatDateTime(participant.whatsappRegistration.sentAt, studyTimeZone) : "Sin envío"}
              />
              <Field
                label="Origen del folio"
                value={participant.registrationSlot ? `Slot ${participant.registrationSlot.folio}` : participant.folio ? "Manual" : "No asignado"}
              />
              <Field label="Modo prueba" value={participant.testMode ? "Activo" : "Inactivo"} />
            </div>
            {participant.whatsappRegistration.error ? (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                Error WhatsApp: {participant.whatsappRegistration.error}
              </p>
            ) : null}
            <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-950">Sincronizar datos desde NAV</p>
                  <p className="mt-1 text-xs leading-5 text-sky-900">
                    Herramienta temporal: copia nombre, celular y correo del participante NAV vinculado. Conserva folio HUT, EVA1/EVA2, fases, respuestas y fotos.
                  </p>
                </div>
                <form action={syncHutParticipantProfileFromNavAction.bind(null, studyId, participant.id)}>
                  <SubmitButton disabled={!participant.studyParticipantId} pendingLabel="Sincronizando...">
                    Sincronizar datos HUT desde participante NAV
                  </SubmitButton>
                </form>
              </div>
              {!participant.studyParticipantId ? (
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Este HUT no tiene participante NAV vinculado.
                </p>
              ) : null}
            </div>
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Confirmación por WhatsApp</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-900">
                    {whatsappRequiresSelfie
                      ? "WhatsApp pendiente: se enviará después de guardar la selfie de registro."
                      : `Envío automático: ${whatsappAutomationLabel(participant.whatsappRegistration.status)}. El enlace manual sigue disponible como respaldo.`}
                  </p>
                </div>
                <form action={sendHutRegistrationWhatsAppAction.bind(null, studyId, participant.id)}>
                  <input name="requestOrigin" type="hidden" value={requestOrigin} />
                  <SubmitButton disabled={whatsappRequiresSelfie} pendingLabel="Enviando WhatsApp...">
                    {participant.whatsappRegistration.status === "NO_ENVIADO" ? "Enviar WhatsApp" : "Reenviar WhatsApp"}
                  </SubmitButton>
                </form>
              </div>
            </div>
            {protocolVersion === "APPLICATION_PHOTO" ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-950">Recordatorio fotografico HUT</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      Usa la plantilla hut_photo_reminder para avisar al participante que tiene una fotografia HUT disponible.
                    </p>
                  </div>
                  <form action={sendHutPhotoReminderWhatsAppAction.bind(null, studyId, participant.id)}>
                    <input name="requestOrigin" type="hidden" value={requestOrigin} />
                    <SubmitButton pendingLabel="Enviando recordatorio HUT...">
                      Enviar recordatorio HUT
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}
            <HutWhatsAppManualBlock message={hutWhatsAppManualMessage} whatsappUrl={hutWhatsAppUrl} />
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

          {protocolVersion === "LEGACY_VIDEO" ? (
            <>
              <SelfieRegistrationCard
                disabledReason={referenceSelfieDisabledReason}
                participant={participant}
                requestOrigin={requestOrigin}
                studyId={studyId}
              />

              <IdentityReviewCard participant={participant} studyId={studyId} studyTimeZone={studyTimeZone} />
            </>
          ) : (
            <ApplicationPhotoProtocolCard
              participant={participant}
              showAdminResetTools={showAdminResetTools}
              studyId={studyId}
              studyTimeZone={studyTimeZone}
            />
          )}

          <HutPhaseCodesCard participant={participant} studyId={studyId} studyTimeZone={studyTimeZone} />
        </div>

        {protocolVersion === "LEGACY_VIDEO" ? (
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
        ) : (
          <ApplicationPhotoQuestionnaireCard
            participant={participant}
            showAdminResetTools={showAdminResetTools}
            studyId={studyId}
            studyTimeZone={studyTimeZone}
          />
        )}

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

            {protocolVersion === "LEGACY_VIDEO" ? (
            <>
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
            </>
            ) : null}
          </section>

          {protocolVersion === "LEGACY_VIDEO" ? (
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
          ) : null}

          <details className="rounded-md border border-rose-200 bg-rose-50 p-4" data-testid={`hut-danger-zone-${participant.id}`}>
            <summary className="cursor-pointer text-sm font-semibold text-rose-950">Zona peligrosa</summary>
            <p className="mt-2 text-xs leading-5 text-rose-900">
              {protocolVersion === "LEGACY_VIDEO"
                ? "Eliminar este participante borrara sus bloques, videos, selfies, verificaciones, evaluaciones y avance HUT. Esta accion no se puede deshacer."
                : "Eliminar este participante borrara su avance HUT, codigos, cuestionario y fotos de aplicacion. Esta accion no se puede deshacer."}
            </p>
            {protocolVersion === "LEGACY_VIDEO" ? (
            <>
            <form action={resetHutReferenceSelfieAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
              <input className={inputClass} name="confirmation" placeholder="ELIMINAR SELFIE DE REGISTRO" required />
              <SubmitButton pendingLabel="Eliminando selfie...">Eliminar selfie de registro</SubmitButton>
            </form>
            <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 1)} className="mt-4 space-y-2">
              <p className="text-xs leading-5 text-rose-900">
                Esto eliminará los videos, selfies diarias y verificaciones del Bloque 1 para que pueda repetirse desde cero. No se eliminará la selfie base ni el folio.
              </p>
              <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACIÓN 1" required />
              <SubmitButton pendingLabel="Restableciendo evaluación...">Restablecer evaluación 1</SubmitButton>
            </form>
            <form action={resetHutCallEvaluationAction.bind(null, studyId, participant.id, 2)} className="mt-4 space-y-2">
              <p className="text-xs leading-5 text-rose-900">
                Esto eliminará los videos, selfies diarias y verificaciones del Bloque 2 para que pueda repetirse desde cero. No se eliminará la selfie base ni el folio.
              </p>
              <input className={inputClass} name="confirmation" placeholder="RESTABLECER EVALUACIÓN 2" required />
              <SubmitButton pendingLabel="Restableciendo evaluación...">Restablecer evaluación 2</SubmitButton>
            </form>
            </>
            ) : null}
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

function HutPhaseCodesCard({
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
      <div>
        <h4 className="text-sm font-semibold text-zinc-950">Códigos por fase HUT</h4>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          ParticipantReferenceCode es la fuente operativa para HUT nuevo. Los phase codes HUT se conservan como historico y auditoria.
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {participant.phaseCodes.map((phaseCode) => (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={phaseCode.phase}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{phaseCode.label}</p>
                <p className="mt-1 text-xs text-zinc-600">{hutOperationalCodeSourceLabel(phaseCode)}</p>
                <p className="mt-1 text-xs text-zinc-600">{`Slot ${phaseCode.slot} · Estado: ${hutPhaseCodeStatusLabel(phaseCode.status)}`}</p>
              </div>
              <StatusBadge status={hutPhaseCodeStatusBadge(phaseCode.status)}>{hutPhaseCodeStatusLabel(phaseCode.status)}</StatusBadge>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <Field label="Última actualización" value={phaseCode.updatedAt ? formatDateTime(phaseCode.updatedAt, studyTimeZone) : "Sin registro"} />
              <Field label="Enviado" value={phaseCode.sentAt ? formatDateTime(phaseCode.sentAt, studyTimeZone) : "Sin envío"} />
              <Field label="Validado" value={phaseCode.validatedAt ? formatDateTime(phaseCode.validatedAt, studyTimeZone) : "Sin validación"} />
              <Field label="Usado" value={phaseCode.usedAt ? formatDateTime(phaseCode.usedAt, studyTimeZone) : "Sin uso"} />
              <Field label="Expira" value={phaseCode.expiresAt ? formatDateTime(phaseCode.expiresAt, studyTimeZone) : "Sin expiración"} />
            </div>
            <div className="mt-3 space-y-2">
              <HutPhaseCodeControls
                allowRegenerate={phaseCode.operationalSource === "HISTORICAL_PHASE_CODE" || participant.protocolVersion === "LEGACY_VIDEO"}
                disabled={phaseCode.status === "MISSING"}
                participantId={participant.id}
                phase={phaseCode.phase}
                studyId={studyId}
              />
              <form action={revokeHutPhaseCodeAction.bind(null, studyId, participant.id, phaseCode.phase)}>
                <SubmitButton disabled={phaseCode.status === "MISSING" || phaseCode.status === "REVOKED"} pendingLabel="Revocando código...">
                  Revocar código
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApplicationPhotoProtocolCard({
  participant,
  showAdminResetTools,
  studyId,
  studyTimeZone
}: {
  participant: HutAdminParticipant;
  showAdminResetTools: boolean;
  studyId: string;
  studyTimeZone: string;
}) {
  const applicationEvidence = participant.applicationEvidence ?? [];
  const hutTimeline = buildHutPhotoTimeline({
    applicationEvidence: applicationEvidence.map((evidence) => ({
      capturedAt: evidence.capturedAt,
      phase: evidence.phase,
      privateStorageKey: evidence.privateStorageKey,
      productCode: evidence.productCode
    })),
    dailyEntries: participant.applicationPhotoEntries.map((entry) => ({
      capturedAt: entry.capturedAt,
      capturedLocalDate: entry.capturedLocalDate,
      privateStorageKey: entry.privateStorageKey,
      productCode: entry.productCode,
      useDayNumber: entry.useDayNumber
    })),
    legacyMirroredPlacementPhoto: participant.legacyMirroredPlacementPhoto,
    manualOverrides: participant.photoSlotOverrides,
    product2GateOpen: participant.product2GateOpen,
    rotation: {
      eva1: participant.firstFragranceLeftArm,
      eva2: participant.secondFragranceRightArm
    },
    testMode: participant.testMode
  });
  const photoSlots = hutTimeline.filter((slot) => slot.participantTask);
  const evaluationSlots = hutTimeline.filter((slot) => slot.interviewerTask);
  const phaseLabel = applicationPhotoCurrentPhaseLabel(participant);
  const deliverySlot = photoSlots.find((slot) => slot.id === "DELIVERY") ?? null;
  const hasColocacionEvidence = applicationEvidence.some((evidence) => evidence.phase === "COLOCACION");
  const photoSlotOverrides = participant.photoSlotOverrides ?? [];
  const firstEvaluationVisit = participant.questionnaire?.visits.find((visit) => visit.section === "EVALUACION_PRIMER_PERFUME") ?? null;
  const firstEvaluationCompleted = firstEvaluationVisit?.status === "COMPLETED";
  const legacyRegreso1Release = participant.phaseCodes.some(
    (code) => code.phase === "REGRESO_1" && (code.status === "USED" || code.status === "VALIDATED")
  );
  const secondProductReleased = Boolean(participant.secondProductRelease || legacyRegreso1Release);

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-emerald-950">HUT v5 · Fotos de aplicacion</h4>
        <p className="mt-1 text-xs leading-5 text-emerald-900">
          Protocolo nuevo: no solicita selfie, validacion facial, video diario ni bloques legacy. Las fotos se registran como evidencia de aplicacion.
        </p>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <Field label="Origen" value={participant.origin === "CLT_HUT" ? "CLT + HUT" : "HUT directo"} />
        <Field label="Protocolo" value="APPLICATION_PHOTO" />
        <Field label="Fase actual" value={phaseLabel} />
        <Field label="EVA1 / primera fragancia" value={participant.firstFragranceLeftArm ?? "No asignada"} />
        <Field label="EVA2 / segunda fragancia" value={participant.secondFragranceRightArm ?? "No asignada"} />
      </div>
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-emerald-950">Evidencia fotografica</h5>
        <div className="mt-3 space-y-3">
          {photoSlots.map((slot) => (
            <div className="rounded-md border border-emerald-200 bg-white p-3" key={slot.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="mt-1 text-xs text-zinc-600">Producto: {slot.productCode ?? "No asignado"}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {slot.evidence ? `Capturada: ${formatDateTime(slot.evidence.capturedAt, studyTimeZone)}` : "Foto pendiente"}
                  </p>
                  {slot.manualOverride ? (
                    <p className="mt-1 text-xs font-semibold text-sky-700">
                      Excepcion manual activa: {slot.manualOverride.type === "REPEAT" ? "repetir captura" : "slot liberado"}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={slot.manualOverride ? "ready" : slot.evidence ? "ready" : "planned"}>
                  {slot.manualOverride ? "Excepcion" : slot.evidence ? "Registrada" : "Pendiente"}
                </StatusBadge>
              </div>
              {slot.evidence?.source === "PHASE_EVIDENCE" ? (
                <AdminPhaseEvidenceLink evidence={applicationEvidence.find((item) => item.phase === slot.evidence?.phase) ?? null} />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-emerald-950">Evaluaciones</h5>
        <div className="mt-3 space-y-3">
          {evaluationSlots.map((slot) => (
            <div className="rounded-md border border-emerald-200 bg-white p-3" key={slot.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="mt-1 text-xs text-zinc-600">Encuestador: {slot.interviewerTask}</p>
                  <p className="mt-1 text-xs text-zinc-600">Producto: {slot.productCode ?? "No asignado"}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {slot.evidence ? `Registro historico: ${formatDateTime(slot.evidence.capturedAt, studyTimeZone)}` : "Visita pendiente"}
                  </p>
                </div>
                <StatusBadge status={slot.evidence ? "ready" : "planned"}>{slot.evidence ? "Registrada" : "Pendiente"}</StatusBadge>
              </div>
              {slot.evidence?.source === "PHASE_EVIDENCE" ? (
                <AdminPhaseEvidenceLink evidence={applicationEvidence.find((item) => item.phase === slot.evidence?.phase) ?? null} />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-md border border-indigo-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h5 className="text-sm font-semibold text-indigo-950">Liberacion de segundo producto</h5>
            <p className="mt-1 text-xs leading-5 text-indigo-900">
              Producto 2 se habilita cuando la evaluacion del primer perfume esta completada y el segundo producto fue liberado por operacion.
            </p>
          </div>
          <StatusBadge status={secondProductReleased ? "ready" : firstEvaluationCompleted ? "planned" : "blocked"}>
            {secondProductReleased ? "Liberado" : firstEvaluationCompleted ? "Pendiente de liberar" : "Esperando evaluacion 1"}
          </StatusBadge>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Field label="Evaluacion primer perfume" value={firstEvaluationCompleted ? "Completada" : "Pendiente"} />
          <Field
            label="Liberacion"
            value={
              participant.secondProductRelease
                ? `Evento operativo: ${formatDateTime(participant.secondProductRelease.releasedAt, studyTimeZone)}`
                : legacyRegreso1Release
                  ? "Legacy REGRESO_1 validado/usado"
                  : "Sin liberar"
            }
          />
          <Field label="Motivo" value={participant.secondProductRelease?.reasonDetail ?? "Sin registro"} />
        </div>
        {showAdminResetTools ? (
          <form action={releaseHutSecondProductAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
            <textarea
              className={inputClass}
              disabled={!firstEvaluationCompleted || secondProductReleased}
              name="reason"
              placeholder="Motivo obligatorio para liberar Producto 2"
              required
              rows={2}
            />
            <SubmitButton disabled={!firstEvaluationCompleted || secondProductReleased} pendingLabel="Liberando Producto 2...">
              Liberar segundo producto
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {showAdminResetTools ? (
        <div className="mt-4 space-y-3">
          <details className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-amber-950">Regularizar entrega por falla de enlace</summary>
            <div className="mt-3 space-y-3">
              <HutDeliveryRecoveryUpload disabled={Boolean(deliverySlot?.evidence)} participantId={participant.id} studyId={studyId} />
              <form action={moveHutInitialEvidenceToDeliveryAction.bind(null, studyId, participant.id)} className="space-y-2 rounded-md border border-amber-200 bg-white p-3">
                <h5 className="text-sm font-semibold text-amber-950">Mover evidencia inicial a Entrega</h5>
                <p className="text-xs leading-5 text-amber-900">
                  Usa esta accion cuando la foto COLOCACION historica realmente corresponde a la entrega fisica del producto.
                  Se conserva el archivo original y se registra auditoria.
                </p>
                <textarea className={inputClass} name="reason" placeholder="Detalle operativo opcional" rows={2} />
                <input className={inputClass} name="confirmation" placeholder="MOVER ENTREGA HUT" required />
                <SubmitButton disabled={Boolean(deliverySlot?.evidence) || !hasColocacionEvidence} pendingLabel="Regularizando entrega...">
                  Mover evidencia a Entrega
                </SubmitButton>
              </form>
            </div>
          </details>
          <details className="rounded-md border border-sky-200 bg-sky-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-sky-950">Control manual de slots HUT</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-5 text-sky-900">
                Usa estas acciones solo para excepciones operativas: adelantar una captura, permitir dos fotos el mismo dia o pedir repetir una foto
                sin borrar la evidencia historica.
              </p>
              {photoSlotOverrides.length > 0 ? (
                <div className="rounded-md border border-sky-200 bg-white p-3 text-xs text-sky-950">
                  <p className="font-semibold">Excepciones activas</p>
                  <ul className="mt-2 space-y-1">
                    {photoSlotOverrides.map((override) => (
                      <li key={`${override.slotId}-${override.type}`}>
                        {override.type === "REPEAT" ? "Repeticion" : "Liberacion"}: {formatHutPhotoTimelineSlotTitle({
                          dayLabel: "",
                          id: override.slotId,
                          title: ""
                        })} {override.reason ? `- ${override.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <form action={releaseHutApplicationPhotoSlotAction.bind(null, studyId, participant.id)} className="space-y-2 rounded-md border border-sky-200 bg-white p-3">
                <h5 className="text-sm font-semibold text-sky-950">Liberar siguiente slot fotografico manualmente</h5>
                <label className="flex flex-col gap-1 text-xs font-semibold text-sky-950">
                  Slot
                  <select className={inputClass} name="slotId" required>
                    {photoSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {formatHutPhotoTimelineSlotTitle(slot)} - {slot.status === "COMPLETED" ? "completado" : slot.status.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
                <SubmitButton pendingLabel="Liberando slot...">Liberar slot</SubmitButton>
              </form>
              <form action={requestHutApplicationPhotoSlotRepeatAction.bind(null, studyId, participant.id)} className="space-y-2 rounded-md border border-sky-200 bg-white p-3">
                <h5 className="text-sm font-semibold text-sky-950">Solicitar repeticion de un slot completado</h5>
                <label className="flex flex-col gap-1 text-xs font-semibold text-sky-950">
                  Slot
                  <select className={inputClass} name="slotId" required>
                    {photoSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {formatHutPhotoTimelineSlotTitle(slot)} - {slot.evidence ? "con evidencia" : "sin evidencia"}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
                <SubmitButton pendingLabel="Solicitando repeticion...">Solicitar repeticion</SubmitButton>
              </form>
            </div>
          </details>
          <details className="rounded-md border border-rose-200 bg-rose-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-rose-950">Resetear evidencia fotografica</summary>
            <p className="mt-2 text-xs leading-5 text-rose-900">
              Esta accion libera una fase para recaptura. Conserva folio, rotacion, vinculo NAV, codigos y fases; la auditoria queda registrada.
            </p>
            <form action={resetHutApplicationPhotoEvidenceAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-rose-950">
                Fase
                <select className={inputClass} name="phase" required>
                  <option value="COLOCACION">Producto 1 - Dia 1 (Colocacion)</option>
                  <option value="REGRESO_1">Evaluacion 1 - registro historico</option>
                  <option value="REGRESO_2">Evaluacion 2 - registro historico</option>
                </select>
              </label>
              <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
              <input className={inputClass} name="confirmation" placeholder="RESET EVIDENCIA HUT" required />
              <SubmitButton pendingLabel="Reseteando evidencia...">Resetear evidencia fotografica</SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function AdminPhaseEvidenceLink({
  evidence
}: {
  evidence: HutAdminParticipant["applicationEvidence"][number] | null;
}) {
  if (!evidence?.signedUrl) {
    return null;
  }

  return (
    <a className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800" href={evidence.signedUrl} rel="noreferrer" target="_blank">
      Ver registro
    </a>
  );
}

function ApplicationPhotoQuestionnaireCard({
  participant,
  showAdminResetTools,
  studyId,
  studyTimeZone
}: {
  participant: HutAdminParticipant;
  showAdminResetTools: boolean;
  studyId: string;
  studyTimeZone: string;
}) {
  const questionnaire = participant.questionnaire;
  const answersBySection = groupHutQuestionnaireAnswersBySection(questionnaire?.answers ?? []);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-emerald-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-zinc-950">Cuestionario HUT v5</h4>
        {questionnaire ? (
          <>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <Field label="Estado" value={hutQuestionnaireStatusLabel(questionnaire.attempt.status)} />
              <Field label="Progreso requerido" value={`${questionnaire.answeredRequired}/${questionnaire.totalRequired}`} />
              <Field
                label="Inicio"
                value={questionnaire.attempt.startedAt ? formatDateTime(questionnaire.attempt.startedAt, studyTimeZone) : "Sin inicio"}
              />
              <Field
                label="Termino"
                value={questionnaire.attempt.completedAt ? formatDateTime(questionnaire.attempt.completedAt, studyTimeZone) : "Sin termino"}
              />
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Progreso por visita/seccion</p>
              {questionnaire.visits.length > 0 ? (
                questionnaire.visits.map((visit) => (
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={visit.section}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-950">{hutQuestionnaireSectionLabel(visit.section)}</p>
                      <StatusBadge status={visit.status === "COMPLETED" ? "ready" : visit.status === "IN_PROGRESS" ? "planned" : "blocked"}>
                        {hutVisitStatusLabel(visit.status)}
                      </StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">Sin secciones iniciadas.</p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            Sin cuestionario HUT v5 iniciado.
          </p>
        )}
        {showAdminResetTools ? (
          <details className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-rose-950">Resetear evaluacion HUT</summary>
            <p className="mt-2 text-xs leading-5 text-rose-900">
              Reinicia el intento y elimina respuestas HUT v5. No modifica participante, rotacion, fotos, codigos ni fases.
            </p>
            <form action={resetHutQuestionnaireAttemptAction.bind(null, studyId, participant.id)} className="mt-3 space-y-2">
              <textarea className={inputClass} name="reason" placeholder="Motivo obligatorio" required rows={2} />
              <input className={inputClass} name="confirmation" placeholder="RESET ENCUESTA HUT" required />
              <SubmitButton disabled={!questionnaire} pendingLabel="Reseteando encuesta...">Resetear evaluacion HUT</SubmitButton>
            </form>
          </details>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-zinc-950">Respuestas por visita/seccion</h4>
        {answersBySection.length > 0 ? (
          <div className="mt-3 space-y-3">
            {answersBySection.map((section) => (
              <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={section.sectionLabel} open>
                <summary className="cursor-pointer text-sm font-semibold text-zinc-950">{section.sectionLabel}</summary>
                <div className="mt-3 space-y-2">
                  {section.answers.map((answer) => (
                    <div className="rounded-md border border-zinc-200 bg-white p-3" key={answer.questionCode}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{answer.questionCode}</p>
                      <p className="mt-1 text-sm font-medium text-zinc-950">{answer.label}</p>
                      <p className="mt-1 break-words text-sm text-zinc-700">{formatHutAnswerValue(answer.answerValue)}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">Sin respuestas registradas.</p>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-zinc-950">Fotos diarias de aplicacion</h4>
        {participant.applicationPhotoEntries.length > 0 ? (
          <div className="mt-3 space-y-3">
            {participant.applicationPhotoEntries.map((entry) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={`${entry.capturedLocalDate}-${entry.useDayNumber}`}>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <Field label="Dia de uso" value={String(entry.useDayNumber)} />
                  <Field label="Producto" value={entry.productCode ?? "No capturado"} />
                  <Field label="Fecha local" value={entry.capturedLocalDate} />
                  <Field label="Capturada" value={formatDateTime(entry.capturedAt, studyTimeZone)} />
                </div>
                {entry.signedUrl ? (
                  <a className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800" href={entry.signedUrl} rel="noreferrer" target="_blank">
                    Ver foto diaria
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">Sin fotos diarias registradas.</p>
        )}
      </section>
    </div>
  );
}

function applicationPhotoCurrentPhaseLabel(participant: HutAdminParticipant): string {
  const currentPhase = applicationPhotoCurrentPhase(participant);
  return currentPhase === "COMPLETED" ? "Completado" : hutPhaseLabel(currentPhase);
}

function applicationPhotoCurrentPhase(participant: HutAdminParticipant): "COLOCACION" | "COMPLETED" | "REGRESO_1" | "REGRESO_2" {
  for (const phase of ["COLOCACION", "REGRESO_1", "REGRESO_2"] as const) {
    const code = participant.phaseCodes.find((item) => item.phase === phase);
    if (!code || (code.status !== "USED" && code.status !== "VALIDATED")) {
      return phase;
    }
  }
  return "COMPLETED";
}

function hutPhaseLabel(phase: "COLOCACION" | "REGRESO_1" | "REGRESO_2") {
  const labels = {
    COLOCACION: "Producto 1 - Dia 1 (Colocacion)",
    REGRESO_1: "Evaluacion 1",
    REGRESO_2: "Evaluacion 2"
  } as const;
  return labels[phase];
}

function hutQuestionnaireSectionLabel(section: NonNullable<HutAdminParticipant["questionnaire"]>["visits"][number]["section"]): string {
  const labels: Record<NonNullable<HutAdminParticipant["questionnaire"]>["visits"][number]["section"], string> = {
    COMPARATIVA: "Comparativa",
    DATOS_GENERALES: "Datos generales",
    EVALUACION_PRIMER_PERFUME: "Evaluacion primer perfume",
    EVALUACION_SEGUNDO_PERFUME: "Evaluacion segundo perfume",
    FILTROS: "Filtros",
    PRIMERA_VISITA: "Primera visita",
    SEGUNDA_VISITA: "Segunda visita"
  };

  return labels[section];
}

function hutQuestionnaireStatusLabel(status: NonNullable<HutAdminParticipant["questionnaire"]>["attempt"]["status"]): string {
  const labels: Record<NonNullable<HutAdminParticipant["questionnaire"]>["attempt"]["status"], string> = {
    COMPLETED: "Completado",
    IN_PROGRESS: "En progreso",
    PENDING: "Pendiente",
    TERMINATED: "Terminado"
  };

  return labels[status];
}

function hutVisitStatusLabel(status: NonNullable<HutAdminParticipant["questionnaire"]>["visits"][number]["status"]): string {
  const labels: Record<NonNullable<HutAdminParticipant["questionnaire"]>["visits"][number]["status"], string> = {
    COMPLETED: "Completada",
    IN_PROGRESS: "En progreso",
    PENDING: "Pendiente"
  };

  return labels[status];
}

function groupHutQuestionnaireAnswersBySection(answers: NonNullable<HutAdminParticipant["questionnaire"]>["answers"]) {
  const groups = new Map<string, { answers: typeof answers; sectionLabel: string }>();
  for (const answer of answers) {
    const sectionLabel = answer.section ? hutQuestionnaireSectionLabel(answer.section) : "Sin seccion";
    const existing = groups.get(sectionLabel);
    if (existing) {
      existing.answers.push(answer);
      continue;
    }
    groups.set(sectionLabel, { answers: [answer], sectionLabel });
  }

  return Array.from(groups.values());
}

function formatHutAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Sin respuesta";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Respuesta no disponible";
  }
}

function whatsappAutomationLabel(status: "ERROR" | "NO_ENVIADO" | "ENVIADO"): string {
  switch (status) {
    case "ENVIADO":
      return "Enviado";
    case "ERROR":
      return "Error";
    default:
      return "No enviado";
  }
}

function hutPhaseCodeStatusLabel(status: HutAdminParticipant["phaseCodes"][number]["status"]): string {
  const labels: Record<HutAdminParticipant["phaseCodes"][number]["status"], string> = {
    EXPIRED: "Expirado",
    GENERATED: "Generado",
    MISSING: "Faltante",
    REVOKED: "Revocado",
    SENT: "Enviado",
    USED: "Usado",
    VALIDATED: "Validado"
  };

  return labels[status];
}

function hutOperationalCodeSourceLabel(phaseCode: HutAdminParticipant["phaseCodes"][number]): string {
  if (phaseCode.operationalSource === "MASTER_REFERENCE_CODE") {
    return `Fuente operativa: codigo maestro slot ${phaseCode.operationalSlot}.`;
  }
  if (phaseCode.operationalSource === "HISTORICAL_PHASE_CODE") {
    return `Fuente operativa: phase code historico slot ${phaseCode.legacySlot ?? phaseCode.slot}.`;
  }
  return "Sin codigo operativo nuevo.";
}

function hutPhaseCodeStatusBadge(status: HutAdminParticipant["phaseCodes"][number]["status"]): "blocked" | "planned" | "ready" {
  if (status === "USED" || status === "VALIDATED") {
    return "ready";
  }
  if (status === "EXPIRED" || status === "MISSING" || status === "REVOKED") {
    return "blocked";
  }
  return "planned";
}

function buildHutRegistrationWhatsAppMessage(participant: HutAdminParticipant): string {
  return [
    `Hola, ${participant.name}. ONEUI Research confirma tu registro para el estudio HUT.`,
    "",
    `Folio de participación: ${participant.folio ?? "Pendiente"}`,
    "",
    "Rotación asignada:",
    `Brazo izquierdo: ${participant.firstFragranceLeftArm ?? "Pendiente"}`,
    `Brazo derecho: ${participant.secondFragranceRightArm ?? "Pendiente"}`,
    "",
    "Link de participante:",
    participant.link,
    "",
    "Conserva este mensaje. Usarás este enlace para subir tus videos durante el estudio."
  ].join("\n");
}

function buildHutWhatsAppUrl({ message, phone }: { message: string; phone: string | null }): string | null {
  if (!phone) {
    return null;
  }

  const normalizedPhone = normalizeWhatsAppRecipient(phone);
  if (!normalizedPhone) {
    return null;
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function SelfieRegistrationCard({
  disabledReason,
  participant,
  requestOrigin,
  studyId
}: {
  disabledReason: string | null;
  participant: HutAdminParticipant;
  requestOrigin: string;
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
            requestOrigin={requestOrigin}
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
        <Field label="Capturó" value={call?.evaluatorName ?? "No capturado"} />
        <Field label="Notas" value={call?.notes ?? "Sin notas"} />
      </div>
      {!call || call.status !== "COMPLETED" ? (
        <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
          Esta evaluación todavía no tiene datos completados.
        </p>
      ) : null}
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

  void timeZone;
  return formatDateTimeMexicoCity(value);
}

function formatAvailability(value: Date | null | undefined, timeZone: string) {
  if (!value) {
    return "No disponible";
  }

  return formatDateTime(value, timeZone);
}
