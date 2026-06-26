import Link from "next/link";
import { notFound } from "next/navigation";
import { NavigoActivityCapture } from "@/app/p/[token]/activities/_components/NavigoActivityCapture";
import { createNavigoAppRepository, navigoActivityLabel } from "@/modules/navigo-app";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PublicParticipantShell } from "@/shared/ui/PublicParticipantShell";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { participantTokenSchema } from "@/shared/validation/participant";

export const dynamic = "force-dynamic";

type NavigoActivityPageProps = {
  params: Promise<{
    activityId: string;
    token: string;
  }>;
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function NavigoActivityPage({ params, searchParams }: NavigoActivityPageProps) {
  const { activityId, token } = await params;
  const query = await searchParams;
  const parsedToken = participantTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    notFound();
  }

  const result = await createNavigoAppRepository().getActivityCaptureView({
    activityId,
    token: parsedToken.data
  });

  if (!result.ok) {
    return (
      <PublicParticipantShell>
        <PageHeader eyebrow="App Navigo" title="Evaluacion no disponible" />
        <EmptyState
          action={
            <Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={`/p/${encodeURIComponent(parsedToken.data)}/activities`}>
              Volver a mis evaluaciones
            </Link>
          }
          title="No disponible"
          description={result.message}
        />
      </PublicParticipantShell>
    );
  }

  const { data } = result;

  return (
    <PublicParticipantShell>
      <PageHeader
        actions={<StatusBadge status="ready">{data.folio}</StatusBadge>}
        description={`Horario ideal: ${formatDate(data.activity.scheduledAt, data.timeZoneIana)}. No veras nombres reales de productos; usa las etiquetas de primera y segunda fragancia.`}
        eyebrow="App Navigo"
        title={navigoActivityLabel(data.activity.code)}
      />

      <div className="mb-6">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/p/${encodeURIComponent(parsedToken.data)}/activities`}>
          Volver a mis evaluaciones
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Etiquetas de fragancias</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-zinc-500">Primera fragancia / brazo izquierdo</dt>
            <dd className="mt-1 text-zinc-950">{data.blindLabels.left}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Segunda fragancia / brazo derecho</dt>
            <dd className="mt-1 text-zinc-950">{data.blindLabels.right}</dd>
          </div>
        </dl>
      </section>

      <NavigoActivityCapture
        activityId={activityId}
        error={query?.error}
        existingResponses={data.existingResponses}
        questions={data.questions}
        selfieCount={data.selfieCount}
        token={parsedToken.data}
      />
    </PublicParticipantShell>
  );
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}
