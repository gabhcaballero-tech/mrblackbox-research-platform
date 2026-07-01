import { notFound } from "next/navigation";
import { createHutRepository, type HutPortalView } from "@/modules/hut";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { HutVideoUploadForm } from "./HutVideoUploadForm";

export const dynamic = "force-dynamic";

type HutParticipantPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function HutParticipantPage({ params }: HutParticipantPageProps) {
  const { token } = await params;
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

        {view.availability.reason === "AVAILABLE_FOR_SELFIE" ? (
          <HutVideoUploadForm
            blockNumber={view.availability.blockNumber ?? view.availableUpload?.blockNumber ?? 1}
            mode="selfie"
            sequenceNumber={view.availability.expectedVideoSequence ?? view.availableUpload?.sequenceNumber ?? 1}
            token={view.token}
          />
        ) : null}

        {view.availableUpload ? (
          <HutVideoUploadForm
            blockNumber={view.availableUpload.blockNumber}
            mode="video"
            sequenceNumber={view.availableUpload.sequenceNumber}
            token={view.token}
          />
        ) : null}

        {!view.availableUpload && view.availability.reason !== "AVAILABLE_FOR_SELFIE" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Actividad no disponible</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{availabilityMessage(view.availability.reason, view.availability.nextAvailableAt)}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ProgressSummary({ view }: { view: HutPortalView }) {
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
  if (reason === "WAIT_UNTIL_5_AM") {
    return `Tu siguiente video estará disponible a partir de las 5:00 a.m.${nextAvailableAt ? ` (${nextAvailableAt.toLocaleString("es-MX")})` : ""}.`;
  }
  if (reason === "MISSING_REFERENCE_SELFIE") {
    return "Tu registro aún no está completo. Contacta al encuestador.";
  }
  if (reason === "VISUAL_VERIFICATION_FAILED" || reason === "VISUAL_VERIFICATION_PENDING") {
    return "No pudimos confirmar tu identidad. Contacta al supervisor antes de continuar.";
  }

  return "Aún no tienes una actividad disponible. Espera indicaciones del equipo.";
}
