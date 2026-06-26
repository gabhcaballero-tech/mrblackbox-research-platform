import Link from "next/link";
import { notFound } from "next/navigation";
import { createNavigoAppRepository, navigoActivityLabel } from "@/modules/navigo-app";
import { appendNavigoTestModeParams, isValidNavigoTestMode, type NavigoTestModeParams } from "@/modules/navigo-app/test-mode";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PublicParticipantShell } from "@/shared/ui/PublicParticipantShell";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { participantTokenSchema } from "@/shared/validation/participant";

export const dynamic = "force-dynamic";

type NavigoActivitiesPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    navigoTestMode?: string;
    navigoTestSignature?: string;
  }>;
};

export default async function NavigoActivitiesPage({ params, searchParams }: NavigoActivitiesPageProps) {
  const { token } = await params;
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
  const result = await createNavigoAppRepository().getParticipantActivitiesView({
    testMode,
    token: parsedToken.data
  });

  if (!result.ok) {
    return (
      <PublicParticipantShell>
        <PageHeader eyebrow="App Navigo" title="Evaluaciones de fragancia" />
        <EmptyState title="No disponible" description={result.message} />
      </PublicParticipantShell>
    );
  }

  const { data } = result;

  return (
    <PublicParticipantShell>
      <PageHeader
        actions={<StatusBadge status="ready">{data.folio}</StatusBadge>}
        description="Aquí verás tus evaluaciones de fragancia a 0, 2, 4 y 8 horas. Realiza cada toma lo más cerca posible del horario recomendado."
        eyebrow="App Navigo"
        title="Evaluaciones de fragancia"
      />

      <div className="space-y-6">
        {query?.message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.message}
          </p>
        ) : null}
        {data.testMode ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            MODO PRUEBA: las ventanas de tiempo están desactivadas.
          </p>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Tu participación</h2>
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

        {data.timeline.length === 0 ? (
          <EmptyState
            title="Tu evaluación aún no está lista"
            description="Cuando el equipo prepare tu enlace, aquí aparecerá la evaluación 0 en salón."
          />
        ) : (
          <section className="grid gap-4 md:grid-cols-4">
            {data.timeline.map((activity) => (
              <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={activity.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-950">
                      {activity.code === "T0_SALON" ? t0ParticipantLabel(activity) : navigoActivityLabel(activity.code)}
                    </h2>
                    {activity.code !== "T0_SALON" ? (
                      <p className="mt-1 text-sm font-semibold text-teal-700">{measurementParticipantLabel(activity)}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-zinc-600">
                      {activity.code === "T0_SALON" && activity.availability.canCapture
                        ? "Esta evaluación debe completarse en el salón con apoyo del encuestador."
                        : availabilityMessage(activity.availability.reason)}
                    </p>
                  </div>
                  <StatusBadge status={activity.availability.canCapture ? "ready" : "planned"}>
                    {activity.availability.label}
                  </StatusBadge>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="font-medium text-zinc-500">Horario ideal</dt>
                    <dd className="mt-1 text-zinc-950">{formatDate(activity.scheduledAt, data.timeZoneIana)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Disponible desde</dt>
                    <dd className="mt-1 text-zinc-950">{formatDate(activity.availableFrom, data.timeZoneIana)}</dd>
                  </div>
                </dl>
                <p className="mt-4 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                  Realiza esta evaluación lo más cerca posible del horario recomendado.
                </p>
                {activity.code === "T0_SALON" && activity.availability.canCapture ? (
                  <Link
                    className="mt-5 inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                    href={activityHref(parsedToken.data, activity.id ?? "", data.testMode ? testModeParams : null)}
                  >
                    Iniciar evaluación 0 en salón
                  </Link>
                ) : null}
                {activity.code !== "T0_SALON" && activity.availability.canCapture ? (
                  <Link
                    className="mt-5 inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                    href={activityHref(parsedToken.data, activity.id ?? "", data.testMode ? testModeParams : null)}
                  >
                    Realizar evaluación
                  </Link>
                ) : null}
              </article>
            ))}
          </section>
        )}
      </div>
    </PublicParticipantShell>
  );
}

function activityHref(token: string, activityId: string, params: NavigoTestModeParams | null): string {
  return appendNavigoTestModeParams(`/p/${encodeURIComponent(token)}/activities/${activityId}`, params);
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

function availabilityMessage(reason: string): string {
  switch (reason) {
    case "AVAILABLE":
    case "DUE_SOON":
      return "Ya puedes realizar esta evaluación. Hazla lo antes posible.";
    case "BEFORE_WINDOW":
      return "Aún no es momento de realizar esta evaluación.";
    case "AFTER_WINDOW":
      return "Esta evaluación ya no está disponible. Contacta a tu reclutador.";
    case "ALREADY_COMPLETED":
      return "Evaluación registrada correctamente.";
    case "IDENTITY_REVIEW_REQUIRED":
      return "Tu participación requiere revisión de identidad. Contacta a tu reclutador.";
    case "PREVIOUS_REQUIRED":
      return "La evaluación 0 en salón aún no está completa.";
    default:
      return "Completa primero la evaluación anterior.";
  }
}

function t0ParticipantLabel(activity: { identityStatus?: string; responseCount?: number; status: string }): string {
  if (activity.status === "COMPLETED" && activity.identityStatus === "CONFIRMED" && (activity.responseCount ?? 0) >= 7) {
    return "Evaluación 0 / T0 en salón completada";
  }

  return "Evaluación 0 / T0 en salón";
}

function measurementParticipantLabel(activity: { identityReviewStatus?: string; responseCount?: number; selfieCount?: number; status: string }): string {
  if ((activity.selfieCount ?? 0) === 0) {
    return "Selfie pendiente";
  }

  if (activity.identityReviewStatus === "REJECTED") {
    return "Identidad no coincide";
  }

  if (activity.identityReviewStatus !== "APPROVED") {
    return "Revisión de identidad pendiente";
  }

  if ((activity.responseCount ?? 0) < 7 || activity.status !== "COMPLETED") {
    return "Selfie registrada / respuestas pendientes";
  }

  return "Completada";
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}
