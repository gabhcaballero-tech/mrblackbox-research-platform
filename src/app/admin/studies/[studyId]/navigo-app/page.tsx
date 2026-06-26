import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  configureNavigoRotationAction,
  generateNavigoParticipantLinkAction,
  startNavigoT0Action
} from "@/modules/navigo-app/actions";
import {
  createNavigoAppRepository,
  createNavigoMeasurementDefinition,
  formatNavigoDateTimeLocal,
  navigoActivityLabel,
  type NavigoActivityListItem,
  type NavigoParticipantListItem
} from "@/modules/navigo-app";
import type { QuestionnaireQuestion } from "@/modules/questionnaire-engine";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { ParticipantLinkPanel } from "./_components/ParticipantLinkPanel";
import { NavigoRotationImportPanel } from "./_components/NavigoRotationImportPanel";

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
  const requestOrigin = resolveRequestOrigin(await headers());
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
          <NavigoRotationImportPanel studyId={studyId} />

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
                    requestOrigin={requestOrigin}
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

function ParticipantRow({
  participant,
  requestOrigin,
  studyId,
  timeZoneIana
}: {
  participant: NavigoParticipantListItem;
  requestOrigin: string;
  studyId: string;
  timeZoneIana: string;
}) {
  const canStart = participant.status === "APPROVED" && participant.confirmation && participant.rotationReady;
  const pendingMessage = participant.rotation.startPendingMessage;
  const t0Completed = participant.activities.some((activity) => activity.code === "T0_SALON" && activity.status === "COMPLETED");
  const measurementQuestions = createNavigoMeasurementDefinition().questions;
  const participantUrl = participant.participantLinkToken
    ? new URL(`/p/${encodeURIComponent(participant.participantLinkToken)}/activities`, requestOrigin).toString()
    : null;

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
            {participant.applicationStartedAt ? "Corregir hora base T0" : "Hora base T0"}
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
              defaultValue={formatNavigoDateTimeLocal(participant.applicationStartedAt ?? new Date(), timeZoneIana)}
              name="applicationStartedAt"
              type="datetime-local"
            />
            <input name="timeZoneIana" type="hidden" value={timeZoneIana} />
          </label>
          <details className="rounded-md border border-zinc-200 bg-white p-3" open={!t0Completed}>
            <summary className="cursor-pointer text-sm font-semibold text-teal-700">
              {t0Completed ? "Editar T0 AP1-AP7" : "Capturar T0 AP1-AP7"}
            </summary>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              T0 se captura en salon por el equipo interno. No requiere selfie de participante.
            </p>
            <div className="mt-4 space-y-4">
              {measurementQuestions.map((question, index) => (
                <AdminT0QuestionControl index={index + 1} key={question.id} question={question} />
              ))}
            </div>
          </details>
          <SubmitButton disabled={!canStart} pendingLabel="Guardando T0...">
            {participant.applicationStartedAt ? "Guardar T0" : "Capturar T0"}
          </SubmitButton>
        </form>
        {!canStart ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {pendingMessage ?? "Pendiente para iniciar T0: configuracion de rotacion."}
          </p>
        ) : null}
        {participantUrl ? <ParticipantLinkPanel url={participantUrl} /> : null}
        <form action={generateNavigoParticipantLinkAction.bind(null, studyId, participant.id, Boolean(participantUrl))}>
          <SubmitButton disabled={!canStart || !participant.applicationStartedAt} pendingLabel="Generando link...">
            {participantUrl ? "Regenerar link participante" : "Generar link participante"}
          </SubmitButton>
        </form>
        {participant.applicationStartedAt ? (
          <p className="text-xs text-zinc-500">Para corregir hora base T0, ajusta el campo de hora y presiona Guardar T0.</p>
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

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <ChecklistItem label="Folio" status={participant.rotation.checklist.folio} />
        <ChecklistItem label="Aprobacion" status={participant.rotation.checklist.approval} />
        <ChecklistItem label="Brazo izquierdo / primera fragancia" status={participant.rotation.checklist.leftArm} value={participant.rotation.leftCode} />
        <ChecklistItem label="Brazo derecho / segunda fragancia" status={participant.rotation.checklist.rightArm} value={participant.rotation.rightCode} />
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
        <p className="mt-2 text-xs leading-5 text-zinc-600">
          Usa esta correccion puntual solo si necesitas ajustar un participante. El flujo recomendado es importar la rotacion masiva por folio.
        </p>
        <form action={configureNavigoRotationAction.bind(null, studyId, participant.id)} className="mt-4 grid gap-4 md:grid-cols-2">
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
      {code === "T0_SALON" ? (
        <p className="mt-2 text-xs text-zinc-500">T0 en salon · Respuestas {activity?.responseCount ?? 0}/7</p>
      ) : null}
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

function AdminT0QuestionControl({ index, question }: { index: number; question: QuestionnaireQuestion }) {
  return (
    <fieldset className="rounded-md border border-zinc-200 p-3">
      <legend className="px-1 text-xs font-semibold text-teal-700">AP{index}</legend>
      <p className="text-sm font-semibold text-zinc-950">{question.text}</p>
      {question.type === "single_choice" ? (
        <div className="mt-3 space-y-2">
          {question.options.map((option) => (
            <label className="flex items-center gap-2 text-sm text-zinc-800" key={option.value}>
              <input name={question.id} required={question.required} type="radio" value={option.value} />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "scale" ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {Array.from({ length: question.max - question.min + 1 }, (_, offset) => question.min + offset).map((value) => (
            <label
              className="flex flex-col items-center gap-1 rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-800"
              key={value}
            >
              <input name={question.id} required={question.required} type="radio" value={value} />
              {value}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
