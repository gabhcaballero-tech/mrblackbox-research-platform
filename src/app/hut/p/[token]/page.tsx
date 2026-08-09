import { notFound } from "next/navigation";
import {
  buildHutPhotoTimeline,
  createHutRepository,
  formatHutPhotoTimelineSlotTitle,
  resolveHutOperationalStatusLabel,
  type HutPhotoTimelineSlot,
  type HutPortalView
} from "@/modules/hut";
import { validateHutPhaseCodeAction } from "@/modules/hut/actions";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { HutVideoUploadForm } from "./HutVideoUploadForm";

export const dynamic = "force-dynamic";

type HutParticipantPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<{
    hutError?: string;
    hutMessage?: string;
  }>;
};

export default async function HutParticipantPage({ params, searchParams }: HutParticipantPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const repository = createHutRepository();
  const result = await repository.getPortalView(token);

  if (!result.ok) {
    notFound();
  }

  const view = result.data;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
          <span className="text-sm font-semibold uppercase tracking-wide text-teal-700">MR Black Box</span>
          <p className="mt-1 text-lg font-semibold text-zinc-950">Actividad HUT</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          {view.testMode ? (
            <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
              Modo prueba activo: se omiten esperas entre días.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{view.studyName}</p>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{view.name}</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{portalIntroMessage(view)}</p>
            </div>
            <StatusBadge status={view.status === "DISQUALIFIED" ? "blocked" : "ready"}>
              {hutParticipantStatusLabel(view)}
            </StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm sm:grid-cols-2">
            <ParticipantFact label="Folio HUT" value={view.folio ?? "No asignado"} />
            <ParticipantFact label="Proxima actividad" value={currentHutPhaseLabel(view)} />
            <ParticipantFact label="EVA1" value={view.rotation.firstFragranceLeftArm ?? "No asignada"} />
            <ParticipantFact label="EVA2" value={view.rotation.secondFragranceRightArm ?? "No asignada"} />
          </div>
          <ProgressSummary view={view} />
        </section>

        {query?.hutMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.hutMessage}
          </p>
        ) : null}
        {query?.hutError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {query.hutError}
          </p>
        ) : null}

        {view.status === "COMPLETED" ? <CompletionMessage /> : null}

        {view.status !== "COMPLETED" && view.phaseGate?.required ? (
          <HutPhaseCodeForm token={view.token} view={view} />
        ) : null}

        {view.protocolVersion === "APPLICATION_PHOTO" && view.status !== "COMPLETED" && !view.phaseGate?.required ? (
          <ApplicationPhotoInstructions />
        ) : null}

        {view.protocolVersion === "LEGACY_VIDEO" && view.status !== "COMPLETED" && !view.phaseGate?.required && view.availability.reason === "AVAILABLE_FOR_SELFIE" ? (
          <HutVideoUploadForm
            blockNumber={view.availability.blockNumber ?? view.availableUpload?.blockNumber ?? 1}
            mode="selfie"
            sequenceNumber={view.availability.expectedVideoSequence ?? view.availableUpload?.sequenceNumber ?? 1}
            token={view.token}
          />
        ) : null}

        {view.protocolVersion === "LEGACY_VIDEO" && view.status !== "COMPLETED" && !view.phaseGate?.required && view.availableUpload ? (
          <HutVideoUploadForm
            blockNumber={view.availableUpload.blockNumber}
            mode="video"
            sequenceNumber={view.availableUpload.sequenceNumber}
            token={view.token}
          />
        ) : null}

        {view.protocolVersion !== "APPLICATION_PHOTO" && view.status !== "COMPLETED" && !view.phaseGate?.required && !view.availableApplicationPhoto && !view.availableUpload && view.availability.reason !== "AVAILABLE_FOR_SELFIE" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Actividad no disponible</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{availabilityMessage(view.availability.reason, view.availability.nextAvailableAt)}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ApplicationPhotoInstructions() {
  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50 p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Seguimiento fotografico</p>
      <h2 className="mt-2 text-xl font-semibold text-teal-950">Registra la foto indicada por el equipo</h2>
      <p className="mt-3 text-sm leading-6 text-teal-900">
        Este portal es exclusivo para cargar evidencias fotograficas del producto. Las evaluaciones y preguntas del estudio
        las captura el encuestador autorizado.
      </p>
    </section>
  );
}

function HutPhaseCodeForm({ token, view }: { token: string; view: HutPortalView }) {
  if (!view.phaseGate) {
    return null;
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Codigo requerido</p>
      <h2 className="mt-2 text-xl font-semibold text-amber-950">{photoSlotTitleForPhase(view.phaseGate.phase)}</h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        Captura el codigo de esta fase para continuar con la actividad HUT.
      </p>
      <form action={validateHutPhaseCodeAction.bind(null, token, view.phaseGate.phase)} className="mt-4 space-y-3">
        <label className="flex flex-col gap-2 text-sm font-semibold text-amber-950">
          Codigo
          <input
            autoComplete="one-time-code"
            className="min-h-12 rounded-md border border-amber-300 bg-white px-4 py-3 text-lg font-semibold uppercase tracking-wide text-zinc-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            inputMode="text"
            name="phaseCode"
            required
          />
        </label>
        <button className="min-h-12 rounded-md bg-amber-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-800" type="submit">
          Validar codigo
        </button>
      </form>
    </section>
  );
}

function ParticipantFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function currentHutPhaseLabel(view: HutPortalView): string {
  if (view.phaseGate) {
    return photoSlotTitleForPhase(view.phaseGate.phase);
  }

  if (view.availableApplicationPhoto) {
    return formatHutPhotoTimelineSlotTitle({
      dayLabel: "",
      id: view.availableApplicationPhoto.slotId,
      title: ""
    });
  }

  return view.status === "COMPLETED" ? "Completado" : "Sin fase pendiente";
}

function CompletionMessage() {
  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-emerald-950">Gracias por tu participación.</h2>
      <p className="mt-3 text-sm leading-6 text-emerald-900">
        Tu participación ha sido registrada correctamente. Toma captura de la finalización de tu prueba y envíasela a tu reclutador.
      </p>
      <p className="mt-2 text-sm font-semibold text-emerald-950">Ahora puedes cerrar esta ventana.</p>
    </section>
  );
}

function ProgressSummary({ view }: { view: HutPortalView }) {
  if (view.protocolVersion === "APPLICATION_PHOTO") {
    const slots = buildPortalPhotoTimeline(view).filter((slot) => slot.participantTask);
    return (
      <section className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Seguimiento fotografico</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">Fotos pendientes y completadas</h2>
          </div>
          <p className="text-sm text-zinc-600">{nextPhotoActivityMessage(view)}</p>
        </div>
        <div className="mt-4 grid gap-3">
          {slots.map((slot) => (
            <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm" key={slot.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="mt-1 text-zinc-600">{participantSlotDescription(slot)}</p>
                  {slot.productCode ? <p className="mt-1 text-zinc-600">Producto: {slot.productCode}</p> : null}
                  {slot.evidence?.capturedAt ? <p className="mt-1 text-zinc-600">Fecha: {slot.evidence.capturedAt.toLocaleString("es-MX")}</p> : null}
                  {slot.availableDate ? <p className="mt-1 text-zinc-600">Fecha disponible: {slot.availableDate}</p> : null}
                </div>
                <StatusBadge status={slot.status === "COMPLETED" ? "ready" : slot.status === "AVAILABLE" ? "planned" : "blocked"}>
                  {photoTimelineStatusLabel(slot)}
                </StatusBadge>
              </div>
              {slot.status === "AVAILABLE" ? (
                <a
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
                  href={`/hut/p/${encodeURIComponent(view.token)}/photo/${encodeURIComponent(slot.id)}`}
                >
                  Capturar foto
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <BlockSummary label="Bloque 1" missed={view.block1?.missedDaysCount ?? 0} videos={view.block1?.submittedVideosCount ?? 0} />
      <BlockSummary label="Bloque 2" missed={view.block2?.missedDaysCount ?? 0} videos={view.block2?.submittedVideosCount ?? 0} />
    </div>
  );
}

function BlockSummary({ label, missed, videos }: { label: string; missed: number; videos: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-semibold text-zinc-950">{label}</p>
      <p className="mt-1 text-zinc-600">Videos enviados: {videos}/3</p>
      <p className="text-zinc-600">Días omitidos: {missed}/1</p>
    </div>
  );
}

function buildPortalPhotoTimeline(view: HutPortalView): HutPhotoTimelineSlot[] {
  return buildHutPhotoTimeline({
    applicationEvidence: view.applicationEvidence,
    dailyEntries: view.applicationPhotoEntries,
    availableSlotId: view.availableApplicationPhoto?.slotId ?? null,
    currentPhase: view.phaseGate?.phase ?? null,
    nextAvailableAt: view.availability.nextAvailableAt,
    rotation: {
      eva1: view.rotation.firstFragranceLeftArm,
      eva2: view.rotation.secondFragranceRightArm
    },
    testMode: view.testMode
  });
}

function photoSlotTitleForPhase(phase: string): string {
  const labels: Record<string, string> = {
    COLOCACION: "Entrega del producto",
    REGRESO_1: "Producto 1 - Dia 3 manana",
    REGRESO_2: "Producto 2 - Dia 3 manana"
  };
  return labels[phase] ?? phase;
}

function nextPhotoActivityMessage(view: HutPortalView): string {
  if (view.status === "COMPLETED") {
    return "Todas las fotografias requeridas estan registradas.";
  }
  if (view.availableApplicationPhoto) {
    return "Tienes una fotografia pendiente por registrar.";
  }
  if (view.availability.nextAvailableAt) {
    return `Tu proxima actividad estara disponible el dia ${view.availability.nextAvailableAt.toLocaleDateString("es-MX")}.`;
  }
  return "Cuando llegue el momento recibiras instrucciones.";
}

function participantSlotDescription(slot: HutPhotoTimelineSlot): string {
  if (slot.status === "COMPLETED") {
    return "Actividad completada.";
  }
  if (slot.status === "AVAILABLE") {
    return slot.participantTask ? `${slot.participantTask} requerida.` : "Actividad disponible.";
  }
  return slot.isCapturableWithCurrentModel ? "Proxima actividad programada." : "Cuando llegue el momento recibiras instrucciones.";
}

function photoTimelineStatusLabel(slot: HutPhotoTimelineSlot): string {
  if (slot.status === "COMPLETED") {
    return "Foto registrada";
  }
  if (slot.status === "AVAILABLE") {
    return "Disponible";
  }
  return slot.isCapturableWithCurrentModel ? "Pendiente" : "Programada";
}

function portalIntroMessage(view: HutPortalView): string {
  if (view.protocolVersion !== "APPLICATION_PHOTO") {
    return view.message;
  }
  if (view.status === "COMPLETED") {
    return "Tu seguimiento fotografico HUT esta completo. Gracias por tu participacion.";
  }
  return "Este portal es exclusivo para registrar fotografias. Revisa tus actividades pendientes y sigue las instrucciones del equipo.";
}

function hutParticipantStatusLabel(view: HutPortalView) {
  if (view.protocolVersion === "APPLICATION_PHOTO") {
    return resolveHutOperationalStatusLabel(view.status);
  }
  const labels: Record<string, string> = {
    BLOCK_1_CALL_PENDING: "En seguimiento",
    BLOCK_1_IN_PROGRESS: "Bloque 1",
    BLOCK_2_CALL_PENDING: "En seguimiento",
    BLOCK_2_IN_PROGRESS: "Bloque 2",
    COMPLETED: "Completado",
    DISQUALIFIED: "No apto",
    NOT_STARTED: "No iniciado"
  };
  return labels[view.status] ?? view.status;
}

function availabilityMessage(reason: string, nextAvailableAt: Date | null) {
  if (reason === "WAIT_UNTIL_NEXT_DAY") {
    return "El siguiente video estará disponible mañana a partir de las 5:00 a.m.";
  }
  if (reason === "WAIT_UNTIL_5_AM") {
    return `Tu siguiente video estará disponible a partir de las 5:00 a.m.${nextAvailableAt ? ` (${nextAvailableAt.toLocaleString("es-MX")})` : ""}.`;
  }
  if (reason === "MISSING_REFERENCE_SELFIE") {
    return "Tu registro aún no está completo. Contacta al encuestador.";
  }
  if (reason === "WAITING_FOR_PHASE_CODE") {
    return "Captura el codigo de la fase para registrar la foto de aplicacion.";
  }
  if (reason === "COMPLETE") {
    return "Tu participacion HUT esta completa.";
  }
  if (reason === "VISUAL_VERIFICATION_FAILED" || reason === "VISUAL_VERIFICATION_PENDING") {
    return "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.";
  }

  return "Aún no tienes una actividad disponible. Espera indicaciones del equipo.";
}
