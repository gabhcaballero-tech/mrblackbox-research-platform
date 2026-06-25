import Link from "next/link";
import { notFound } from "next/navigation";
import { configureNavigoRotationAction, startNavigoT0Action } from "@/modules/navigo-app/actions";
import {
  createNavigoAppRepository,
  navigoActivityLabel,
  type NavigoActivityListItem,
  type NavigoParticipantListItem
} from "@/modules/navigo-app";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export const dynamic = "force-dynamic";

type NavigoAppAdminPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    navigoError?: string;
    navigoMessage?: string;
    participant?: string;
    token?: string;
  }>;
};

export default async function NavigoAppAdminPage({ params, searchParams }: NavigoAppAdminPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  await requireCapability("screening:review");
  const result = await createNavigoAppRepository().getAdminDashboard(studyId);

  if (!result) {
    notFound();
  }

  const isNavigo = result.study.code === NAVIGO_STUDY_CODE;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status={isNavigo ? "ready" : "planned"}>{isNavigo ? "Operable" : "No aplica"}</StatusBadge>}
        description="Inicio de T0 en salon y seguimiento de las mediciones de participante a 2, 4 y 8 horas."
        eyebrow="App Navigo"
        title={`Mediciones de fragancia · ${result.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/screening-attempts`}>
          Supervisar filtro
        </Link>
      </div>

      {!isNavigo ? (
        <EmptyState
          title="App Navigo no aplica para este estudio"
          description="Esta seccion solo prepara mediciones para FMASCULINA-NAVIGO-2026. No afecta detergentes ni otros estudios."
        />
      ) : (
        <div className="space-y-6">
          {query?.navigoMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {query.navigoMessage}
            </p>
          ) : null}
          {query?.navigoError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {query.navigoError}
            </p>
          ) : null}
          {query?.token ? <ParticipantLinkPanel token={query.token} participantId={query.participant} /> : null}

          {result.participants.length === 0 ? (
            <EmptyState
              title="Sin participantes confirmados"
              description="Cuando un participante aprobado tenga folio y rotacion asignada, aparecera aqui para iniciar T0."
            />
          ) : (
            <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-zinc-950">Participantes confirmados</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Las horas se muestran en {result.timeZoneIana}. El enlace solo expone etiquetas ciegas.
                </p>
              </div>
              <div className="divide-y divide-zinc-200">
                {result.participants.map((participant) => (
                  <ParticipantRow
                    key={participant.id}
                    participant={participant}
                    selectedToken={query?.participant === participant.id ? query.token : undefined}
                    studyId={studyId}
                    timeZoneIana={result.timeZoneIana}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function ParticipantLinkPanel({ participantId, token }: { participantId?: string; token: string }) {
  const path = `/p/${encodeURIComponent(token)}/activities`;
  const message = `Hola, gracias por participar en el estudio Navigo Homme. Para realizar tus evaluaciones de fragancia a las 2, 4 y 8 horas, entra a este enlace: ${path}. Por favor conserva este mensaje y realiza cada evaluacion cuando corresponda.`;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">Link participante listo</p>
      <p className="mt-2 break-all font-mono text-sm text-emerald-950">{path}</p>
      <p className="mt-3 text-sm leading-6 text-emerald-900">{message}</p>
      {participantId ? <p className="mt-2 text-xs text-emerald-800">Participante actualizado: {participantId}</p> : null}
    </section>
  );
}

function ParticipantRow({
  participant,
  selectedToken,
  studyId,
  timeZoneIana
}: {
  participant: NavigoParticipantListItem;
  selectedToken?: string;
  studyId: string;
  timeZoneIana: string;
}) {
  const canStart = participant.status === "APPROVED" && participant.confirmation && participant.rotationReady;
  const pendingMessage = participant.rotation.startPendingMessage;

  return (
    <article className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(300px,0.95fr)]">
      <div>
        <p className="text-sm font-semibold text-zinc-950">{participant.participant.name}</p>
        <p className="mt-1 font-mono text-xs text-zinc-500">{participant.confirmation?.folio ?? "Sin folio"}</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="inline font-medium text-zinc-500">Celular: </dt>
            <dd className="inline text-zinc-900">{participant.participant.phone ?? "No capturado"}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Estado: </dt>
            <dd className="inline text-zinc-900">{participant.status === "APPROVED" ? "Confirmado" : participant.status}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Alerta: </dt>
            <dd className="inline text-zinc-900">{participant.alert}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        <RotationPreparation participant={participant} studyId={studyId} />
        <div className="grid gap-3 md:grid-cols-4">
          {["T0_SALON", "T2_HORAS", "T4_HORAS", "T8_HORAS"].map((code) => (
            <ActivitySummary
              activity={participant.activities.find((item) => item.code === code)}
              code={code as NavigoActivityListItem["code"]}
              key={code}
              timeZoneIana={timeZoneIana}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <form action={startNavigoT0Action.bind(null, studyId, participant.id)} className="space-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Hora base T0
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
              defaultValue={formatDateTimeLocal(participant.applicationStartedAt ?? new Date(), timeZoneIana)}
              name="applicationStartedAt"
              type="datetime-local"
            />
          </label>
          <button
            className="inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={!canStart}
            type="submit"
          >
            {participant.applicationStartedAt ? "Actualizar T0 / generar link" : "Iniciar T0"}
          </button>
        </form>
        {!canStart ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {pendingMessage ?? "Pendiente para iniciar T0: configuracion de rotacion."}
          </p>
        ) : null}
        {selectedToken ? (
          <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/p/${selectedToken}/activities`}>
            Abrir link participante
          </Link>
        ) : participant.hasRecoverableToken ? (
          <p className="text-xs text-zinc-500">El participante ya tiene link activo. Puedes regenerarlo con T0.</p>
        ) : null}
      </div>
    </article>
  );
}

function RotationPreparation({
  participant,
  studyId
}: {
  participant: NavigoParticipantListItem;
  studyId: string;
}) {
  const codes = participant.confirmation?.referenceCodes ?? [];

  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Preparacion de rotacion</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Los codigos de fragancia son internos. El participante solo vera Primera fragancia y Segunda fragancia.
          </p>
        </div>
        <StatusBadge status={participant.rotation.ready ? "ready" : "planned"}>
          {participant.rotation.ready ? "Completa" : "Pendiente"}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <ChecklistItem label="Folio" status={participant.rotation.checklist.folio} />
        <ChecklistItem label="Aprobacion" status={participant.rotation.checklist.approval} />
        <ChecklistItem label="Brazo izquierdo" status={participant.rotation.checklist.leftArm} value={participant.rotation.leftCode} />
        <ChecklistItem label="Brazo derecho" status={participant.rotation.checklist.rightArm} value={participant.rotation.rightCode} />
        <ChecklistItem label="Codigo aplicacion/kit" status={participant.rotation.checklist.applicationKit} value={participant.rotation.applicationKitCode} />
      </dl>

      {!participant.rotation.ready ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {participant.rotation.startPendingMessage}
        </p>
      ) : null}

      {codes.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Codigos de confirmacion disponibles como referencia manual: {codes.map((code) => code.code).join(", ")}. No se usan automaticamente como codigos de fragancia.
        </p>
      ) : null}

      <details className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-teal-700">
          {participant.rotation.ready ? "Actualizar rotacion" : "Configurar rotacion"}
        </summary>
        <form action={configureNavigoRotationAction.bind(null, studyId, participant.id)} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            Codigo primera fragancia / brazo izquierdo
            <input
              className={inputClass}
              defaultValue={participant.rotation.leftCode ?? ""}
              name="leftFragranceCode"
              required
            />
            <span className="text-xs font-normal leading-5 text-zinc-500">
              Este codigo se usara para identificar la fragancia aplicada en el antebrazo izquierdo.
            </span>
          </label>
          <label className={labelClass}>
            Codigo segunda fragancia / brazo derecho
            <input
              className={inputClass}
              defaultValue={participant.rotation.rightCode ?? ""}
              name="rightFragranceCode"
              required
            />
            <span className="text-xs font-normal leading-5 text-zinc-500">
              Este codigo se usara para identificar la fragancia aplicada en el antebrazo derecho.
            </span>
          </label>
          <label className={labelClass}>
            Codigo aplicacion / kit ambos brazos
            <input
              className={inputClass}
              defaultValue={participant.rotation.applicationKitCode ?? ""}
              name="applicationKitCode"
              required
            />
            <span className="text-xs font-normal leading-5 text-zinc-500">
              Codigo de control del kit o aplicacion comparativa en ambos brazos.
            </span>
          </label>
          <label className={labelClass}>
            Codigo triangular 1
            <input className={inputClass} name="triangularCode1" />
            <span className="text-xs font-normal leading-5 text-zinc-500">Opcional. No bloquea T0 en esta fase.</span>
          </label>
          <label className={labelClass}>
            Codigo triangular 2
            <input className={inputClass} name="triangularCode2" />
            <span className="text-xs font-normal leading-5 text-zinc-500">Opcional. No bloquea T0 en esta fase.</span>
          </label>
          <div className="flex items-end">
            <button className="inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800" type="submit">
              Guardar rotacion
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

function ChecklistItem({
  label,
  status,
  value
}: {
  label: string;
  status: "complete" | "pending";
  value?: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className={status === "complete" ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-amber-700"}>
        {status === "complete" ? "Completo" : "Pendiente"}
      </dd>
      {value ? <p className="mt-1 break-all font-mono text-xs text-zinc-700">{value}</p> : null}
    </div>
  );
}

function ActivitySummary({
  activity,
  code,
  timeZoneIana
}: {
  activity?: NavigoActivityListItem;
  code: NavigoActivityListItem["code"];
  timeZoneIana: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-semibold text-zinc-950">{navigoActivityLabel(code)}</p>
      <p className="mt-1 text-zinc-600">{activity ? statusLabel(activity.status) : "No iniciado"}</p>
      <p className="mt-2 text-xs text-zinc-500">Ideal: {activity ? formatDate(activity.scheduledAt, timeZoneIana) : "Pendiente"}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Real: {activity?.actualCompletedAt ? formatDate(activity.actualCompletedAt, timeZoneIana) : "Sin captura"}
      </p>
      {code !== "T0_SALON" ? (
        <p className="mt-2 text-xs text-zinc-500">
          Selfies {activity?.evidenceCount ?? 0} · Respuestas {activity?.responseCount ?? 0}/7
        </p>
      ) : null}
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "Completado";
    case "AVAILABLE":
      return "Disponible";
    case "EXPIRED":
      return "Fuera de ventana";
    case "STARTED":
    case "INCOMPLETE":
      return "En captura";
    default:
      return "Pendiente";
  }
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}

function formatDateTimeLocal(value: Date, timeZoneIana: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timeZoneIana,
    year: "numeric"
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
