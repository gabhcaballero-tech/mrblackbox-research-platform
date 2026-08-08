import Link from "next/link";
import { headers } from "next/headers";
import { createFieldOperationsRepository } from "@/modules/field-operations";
import { sendFieldNavigoEvaluationReminderNowAction } from "@/modules/field-operations/actions";
import { formatOperationsDateTime } from "@/modules/clt-operations";
import type { CltOperationsDetail } from "@/modules/clt-operations";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type FieldOperationsPageProps = {
  searchParams?: Promise<{
    fieldOpsError?: string;
    fieldOpsMessage?: string;
    sessionId?: string;
    studyId?: string;
  }>;
};

export default async function FieldOperationsPage({ searchParams }: FieldOperationsPageProps) {
  const actor = await requireCapability("field:access");
  const query = await searchParams;
  const requestOrigin = resolveRequestOrigin(await headers());
  const dashboard = await createFieldOperationsRepository().getDashboard({
    actorName: actor.name,
    detailSessionId: query?.sessionId,
    interviewerUserId: actor.id,
    studyId: query?.studyId
  });
  const selectedStudy = dashboard.studies.find((study) => study.id === dashboard.selectedStudyId) ?? null;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Encuestador</StatusBadge>}
        description="Seguimiento de tus participantes CLT, Navigo y HUT."
        eyebrow="Field Operations"
        title="Seguimiento de participantes"
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href="/field">
          Volver a Campo
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href="/field/hut">
          Captura HUT
        </Link>
      </div>

      {query?.fieldOpsMessage ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {query.fieldOpsMessage}
        </p>
      ) : null}
      {query?.fieldOpsError ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {query.fieldOpsError}
        </p>
      ) : null}

      {dashboard.studies.length === 0 ? (
        <EmptyState
          title="Aun no tienes participantes asignados."
          description="Cuando completes o reclames entrevistas CLT con tu usuario, apareceran aqui para seguimiento."
        />
      ) : (
        <div className="space-y-6">
          <StudySelector selectedStudyId={dashboard.selectedStudyId} studies={dashboard.studies} />
          <OperationsList
            participants={dashboard.participants}
            selectedSessionId={query?.sessionId ?? null}
            selectedStudyId={dashboard.selectedStudyId}
            timeZoneIana={selectedStudy?.timeZoneIana ?? "America/Mexico_City"}
          />
          {dashboard.detail ? (
            <OperationsDetail
              detail={dashboard.detail}
              requestOrigin={requestOrigin}
              returnTo={returnPath({
                sessionId: dashboard.detail.id,
                studyId: dashboard.selectedStudyId
              })}
              studyId={dashboard.selectedStudyId ?? ""}
              timeZoneIana={selectedStudy?.timeZoneIana ?? "America/Mexico_City"}
            />
          ) : (
            <EmptyState
              title="Selecciona un participante"
              description="El detalle incluye CLT, actividades Navigo, WhatsApp, HUT, evidencias y respuestas."
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

function StudySelector({
  selectedStudyId,
  studies
}: {
  selectedStudyId: string | null;
  studies: Array<{ code: string; id: string; name: string }>;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-zinc-950">Estudio</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {studies.map((study) => (
          <Link
            className={`rounded-md border px-3 py-2 text-sm font-semibold ${
              study.id === selectedStudyId
                ? "border-teal-700 bg-teal-50 text-teal-800"
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
            href={`/field/dashboard?studyId=${study.id}`}
            key={study.id}
          >
            {study.code}
          </Link>
        ))}
      </div>
    </section>
  );
}

function OperationsList({
  participants,
  selectedSessionId,
  selectedStudyId,
  timeZoneIana
}: {
  participants: CltOperationsDetail[];
  selectedSessionId: string | null;
  selectedStudyId: string | null;
  timeZoneIana: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-zinc-950">Mis participantes</h2>
        <p className="mt-1 text-sm text-zinc-600">Una fila por entrevista CLT asignada a tu usuario.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Folio NAV</th>
              <th className="px-4 py-3">Folio HUT</th>
              <th className="px-4 py-3">Participante</th>
              <th className="px-4 py-3">CLT</th>
              <th className="px-4 py-3">T0</th>
              <th className="px-4 py-3">Navigo</th>
              <th className="px-4 py-3">HUT</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {participants.map((participant) => (
              <tr className={selectedSessionId === participant.id ? "bg-teal-50" : ""} key={participant.id}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.folio}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.hut.folio ?? "-"}</td>
                <td className="px-4 py-3 font-semibold text-zinc-950">{participant.participantName}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {participant.cltStatus} · {participant.cltProgressLabel}
                </td>
                <td className="px-4 py-3 text-zinc-700">{formatOperationsDateTime(participant.t0, timeZoneIana) || "-"}</td>
                <td className="px-4 py-3 text-zinc-700">{navigoSummary(participant)}</td>
                <td className="px-4 py-3 text-zinc-700">{hutSummary(participant)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link className={linkClass} href={returnPath({ sessionId: participant.id, studyId: selectedStudyId })}>
                      Detalle
                    </Link>
                    {participant.hut.folio ? (
                      <Link className={linkClass} href={`/field/hut?folio=${encodeURIComponent(participant.hut.folio)}`}>
                        HUT
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OperationsDetail({
  detail,
  requestOrigin,
  returnTo,
  studyId,
  timeZoneIana
}: {
  detail: CltOperationsDetail;
  requestOrigin: string;
  returnTo: string;
  studyId: string;
  timeZoneIana: string;
}) {
  const navigoLink = detail.navigoLinkToken
    ? new URL(`/p/${encodeURIComponent(detail.navigoLinkToken)}/activities`, requestOrigin).toString()
    : null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Detalle participante</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950">
            {detail.folio} · {detail.participantName}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            CLT {detail.cltStatus}; encuestador {detail.interviewer ?? "sin asignar"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {navigoLink ? (
            <a className={buttonClass} href={navigoLink} rel="noreferrer" target="_blank">
              Abrir Navigo
            </a>
          ) : null}
          {detail.hut.folio ? (
            <Link className={buttonClass} href={`/field/hut?folio=${encodeURIComponent(detail.hut.folio)}`}>
              Abrir captura HUT
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
        <Fact label="Estado CLT" value={detail.cltStatus} />
        <Fact label="Fecha CLT" value={formatOperationsDateTime(detail.cltCompletedAt ?? detail.cltStartedAt, timeZoneIana) || "-"} />
        <Fact label="T0" value={formatOperationsDateTime(detail.t0, timeZoneIana) || "-"} />
        <Fact label="WhatsApp" value={detail.whatsapp.messageCount > 0 ? detail.whatsapp.lastStatus ?? "Registrado" : "Sin envio"} />
      </div>

      <Section title="Navigo">
        <div className="grid gap-3">
          {detail.navigoActivities.map((activity) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={activity.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-950">{activity.code} · {activity.status}</p>
                  <p className="mt-1 text-zinc-600">Disponible: {formatOperationsDateTime(activity.availableFrom, timeZoneIana)}</p>
                  <p className="text-zinc-600">Recordatorio: {reminderLabel(detail, activity.code)}</p>
                </div>
                {activity.status !== "COMPLETED" ? (
                  <form action={sendFieldNavigoEvaluationReminderNowAction.bind(null, activity.id, requestOrigin, returnTo, studyId)}>
                    <button className={buttonClass} type="submit">
                      Enviar recordatorio ahora
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
          {detail.navigoActivities.length === 0 ? <p className="text-sm text-zinc-600">Sin actividades Navigo.</p> : null}
        </div>
      </Section>

      <Section title="HUT">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <Fact label="Folio HUT" value={detail.hut.folio ?? "Sin HUT"} />
          <Fact label="Fotos" value={String(detail.hut.applicationPhotoCount)} />
          <Fact label="Fase/evaluacion" value={detail.hut.currentSection ?? detail.hut.status ?? "-"} />
          <Fact label="Cuestionario" value={detail.hut.questionnaireStatus ?? "Sin intento"} />
        </div>
      </Section>

      <Section title="Respuestas CTL">
        <div className="space-y-3">
          {detail.answerGroups.map((group) => (
            <div className="rounded-md border border-zinc-200" key={group.sectionId}>
              <p className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-950">
                {group.sectionTitle}
              </p>
              <dl className="divide-y divide-zinc-100">
                {group.answers.slice(0, 8).map((answer) => (
                  <div className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[180px_minmax(0,1fr)]" key={answer.code}>
                    <dt className="font-mono text-xs text-zinc-500">{answer.code}</dt>
                    <dd className="text-zinc-800">{answer.value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Section>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mt-6 border-t border-zinc-200 pt-5">
      <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function navigoSummary(participant: CltOperationsDetail): string {
  const completed = participant.navigoActivities.filter((activity) => activity.status === "COMPLETED").length;
  const linkSent = participant.whatsapp.templateNames.includes("navigo_acceso_evaluaciones") ? "link enviado" : "sin link";

  return `${linkSent}; ${completed}/${participant.navigoActivities.length} evaluaciones`;
}

function hutSummary(participant: CltOperationsDetail): string {
  if (!participant.hut.id) {
    return "Sin HUT";
  }

  return `${participant.hut.applicationPhotoCount} fotos; ${participant.hut.questionnaireStatus ?? participant.hut.status ?? "pendiente"}`;
}

function reminderLabel(detail: CltOperationsDetail, activityCode: string): string {
  const reminders = detail.reminders.filter((reminder) => reminder.activityCode === activityCode);
  const latest = reminders.sort((left, right) => {
    const leftTime = left.sentAt?.getTime() ?? 0;
    const rightTime = right.sentAt?.getTime() ?? 0;
    return rightTime - leftTime;
  })[0];

  return latest ? `${latest.status}${latest.sentAt ? ` · ${latest.sentAt.toLocaleString("es-MX")}` : ""}` : "sin recordatorio";
}

function returnPath(input: { sessionId?: string | null; studyId?: string | null }): string {
  const params = new URLSearchParams();
  if (input.studyId) {
    params.set("studyId", input.studyId);
  }
  if (input.sessionId) {
    params.set("sessionId", input.sessionId);
  }

  const suffix = params.toString();
  return suffix ? `/field/dashboard?${suffix}` : "/field/dashboard";
}

const buttonClass =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
const linkClass = "font-semibold text-teal-700 hover:text-teal-800";
