import { notFound } from "next/navigation";
import { createHutRepository, type HutPortalView } from "@/modules/hut";
import { validateHutPhaseCodeAction } from "@/modules/hut/actions";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { HutApplicationPhotoUploadForm } from "./HutApplicationPhotoUploadForm";
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
  const result = await createHutRepository().getPortalView(token);

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
              <p className="mt-3 text-sm leading-6 text-zinc-600">{view.message}</p>
            </div>
            <StatusBadge status={view.status === "DISQUALIFIED" ? "blocked" : "ready"}>
              {hutParticipantStatusLabel(view.status)}
            </StatusBadge>
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

        {view.status !== "COMPLETED" && !view.phaseGate?.required && view.availableApplicationPhoto ? (
          <HutApplicationPhotoUploadForm
            phase={view.availableApplicationPhoto.phase}
            productCode={view.availableApplicationPhoto.productCode}
            token={view.token}
          />
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

        {view.status !== "COMPLETED" && !view.phaseGate?.required && !view.availableApplicationPhoto && !view.availableUpload && view.availability.reason !== "AVAILABLE_FOR_SELFIE" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Actividad no disponible</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{availabilityMessage(view.availability.reason, view.availability.nextAvailableAt)}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function HutPhaseCodeForm({ token, view }: { token: string; view: HutPortalView }) {
  if (!view.phaseGate) {
    return null;
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Codigo requerido</p>
      <h2 className="mt-2 text-xl font-semibold text-amber-950">{view.phaseGate.label}</h2>
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
    return (
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {(["COLOCACION", "REGRESO_1", "REGRESO_2"] as const).map((phase) => {
          const evidence = view.applicationEvidence.find((item) => item.phase === phase);
          return (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={phase}>
              <p className="font-semibold text-zinc-950">{phaseLabel(phase)}</p>
              <p className="mt-1 text-zinc-600">{evidence ? "Foto registrada" : "Pendiente"}</p>
              {evidence?.productCode ? <p className="text-zinc-600">Producto: {evidence.productCode}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <BlockSummary label="Bloque 1" missed={view.block1?.missedDaysCount ?? 0} videos={view.block1?.submittedVideosCount ?? 0} />
      <BlockSummary label="Bloque 2" missed={view.block2?.missedDaysCount ?? 0} videos={view.block2?.submittedVideosCount ?? 0} />
    </div>
  );
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    COLOCACION: "Colocacion",
    REGRESO_1: "Regreso 1",
    REGRESO_2: "Regreso 2"
  };
  return labels[phase] ?? phase;
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

function hutParticipantStatusLabel(status: string) {
  const labels: Record<string, string> = {
    BLOCK_1_CALL_PENDING: "Llamada pendiente",
    BLOCK_1_IN_PROGRESS: "Bloque 1",
    BLOCK_2_CALL_PENDING: "Llamada final pendiente",
    BLOCK_2_IN_PROGRESS: "Bloque 2",
    COMPLETED: "Completado",
    DISQUALIFIED: "No apto",
    NOT_STARTED: "No iniciado"
  };
  return labels[status] ?? status;
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
