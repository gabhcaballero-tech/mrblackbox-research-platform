import Link from "next/link";
import { notFound } from "next/navigation";
import { NavigoActivityCapture } from "@/app/p/[token]/activities/_components/NavigoActivityCapture";
import { createNavigoAppRepository, navigoActivityLabel } from "@/modules/navigo-app";
import { appendNavigoTestModeParams, isValidNavigoTestMode, type NavigoTestModeParams } from "@/modules/navigo-app/test-mode";
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
    navigoTestMode?: string;
    navigoTestSignature?: string;
  }>;
};

export default async function NavigoActivityPage({ params, searchParams }: NavigoActivityPageProps) {
  const { activityId, token } = await params;
  const query = await searchParams;
  const parsedToken = participantTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    notFound();
  }

  const testModeParams = readTestModeParams(query);
  const testMode = isValidNavigoTestMode({
    mode: testModeParams?.navigoTestMode,
    secret: process.env.PARTICIPANT_PORTAL_HASH_SECRET,
    signature: testModeParams?.navigoTestSignature,
    token: parsedToken.data
  });
  const result = await createNavigoAppRepository().getActivityCaptureView({
    activityId,
    testMode,
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
        description={`Horario ideal: ${formatDate(data.activity.scheduledAt, data.timeZoneIana)}. No verás nombres reales de productos; usa las etiquetas de primera y segunda fragancia.`}
        eyebrow="App Navigo"
        title={navigoActivityLabel(data.activity.code)}
      />

      <div className="mb-6">
        {data.testMode ? (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            MODO PRUEBA: las ventanas de tiempo están desactivadas.
          </p>
        ) : null}
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={appendNavigoTestModeParams(`/p/${encodeURIComponent(parsedToken.data)}/activities`, data.testMode ? testModeParams : null)}>
          Volver a mis evaluaciones
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Datos de participación</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-500">Participante</dt>
            <dd className="mt-1 text-zinc-950">{data.participantName}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Folio</dt>
            <dd className="mt-1 font-mono text-zinc-950">{data.folio}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Primera fragancia / brazo izquierdo</dt>
            <dd className="mt-1 font-mono text-zinc-950">{data.blindLabels.left}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Segunda fragancia / brazo derecho</dt>
            <dd className="mt-1 font-mono text-zinc-950">{data.blindLabels.right}</dd>
          </div>
        </dl>
      </section>

      <NavigoActivityCapture
        activityId={activityId}
        error={query?.error}
        existingResponses={data.existingResponses}
        fragranceCodes={data.blindLabels}
        questions={data.questions}
        registeredSelfie={data.registeredSelfie}
        requiresSelfie={data.activity.code !== "T0_SALON"}
        selfieCount={data.selfieCount}
        selfieReviewStatus={data.selfieReviewStatus}
        testModeParams={data.testMode ? testModeParams : null}
        token={parsedToken.data}
      />
    </PublicParticipantShell>
  );
}

function readTestModeParams(query: { navigoTestMode?: string; navigoTestSignature?: string } | undefined): NavigoTestModeParams | null {
  if (!query?.navigoTestMode || !query.navigoTestSignature) {
    return null;
  }

  return {
    navigoTestMode: query.navigoTestMode,
    navigoTestSignature: query.navigoTestSignature
  };
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}
