import Link from "next/link";
import { notFound } from "next/navigation";
import { createNavigoAppRepository, navigoActivityLabel } from "@/modules/navigo-app";
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
  }>;
};

export default async function NavigoActivitiesPage({ params, searchParams }: NavigoActivitiesPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const parsedToken = participantTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    notFound();
  }

  const result = await createNavigoAppRepository().getParticipantActivitiesView({
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
        description="Aquí verás tus evaluaciones de fragancia a 0, 2, 4 y 8 horas. Realiza cada toma cuando esté disponible."
        eyebrow="App Navigo"
        title="Evaluaciones de fragancia"
      />

      <div className="space-y-6">
        {query?.message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.message}
          </p>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Tu participacion</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-medium text-zinc-500">Folio</dt>
              <dd className="mt-1 font-mono text-zinc-950">{data.folio}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Primera fragancia</dt>
              <dd className="mt-1 text-zinc-950">{data.blindLabels.left}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Segunda fragancia</dt>
              <dd className="mt-1 text-zinc-950">{data.blindLabels.right}</dd>
            </div>
          </dl>
        </section>

        {data.timeline.length === 0 ? (
          <EmptyState
            title="Tu evaluacion aun no ha sido iniciada en salon"
            description="Cuando el equipo registre tu T0, aqui apareceran las tomas de 2, 4 y 8 horas."
          />
        ) : (
          <section className="grid gap-4 md:grid-cols-4">
            {data.timeline
              .map((activity) => (
                <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={activity.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-950">
                        {activity.code === "T0_SALON"
                          ? t0ParticipantLabel(activity.responseCount ?? 0)
                          : navigoActivityLabel(activity.code)}
                      </h2>
                      <p className="mt-2 text-sm text-zinc-600">{availabilityMessage(activity.availability.reason)}</p>
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
                    <div>
                      <dt className="font-medium text-zinc-500">Cierre maximo</dt>
                      <dd className="mt-1 text-zinc-950">{formatDate(activity.availableUntil, data.timeZoneIana)}</dd>
                    </div>
                  </dl>
                  {activity.code !== "T0_SALON" && activity.availability.canCapture ? (
                    <Link
                      className="mt-5 inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                      href={`/p/${encodeURIComponent(parsedToken.data)}/activities/${activity.id}`}
                    >
                      Realizar evaluacion
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

function availabilityMessage(reason: string): string {
  switch (reason) {
    case "AVAILABLE":
    case "DUE_SOON":
      return "Ya puedes realizar esta evaluacion.";
    case "BEFORE_WINDOW":
      return "Aun no es momento de realizar esta evaluacion.";
    case "AFTER_WINDOW":
      return "Esta evaluacion esta fuera de la ventana permitida. Contacta a tu reclutador.";
    case "ALREADY_COMPLETED":
      return "Evaluación registrada correctamente.";
    default:
      return "Completa primero la evaluacion anterior.";
  }
}

function t0ParticipantLabel(responseCount: number): string {
  return responseCount >= 7
    ? "Evaluación 0 — Completada en salón"
    : "Evaluación 0 en salón pendiente de completar por el equipo.";
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}
