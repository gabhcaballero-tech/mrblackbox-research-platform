import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createCltOperationsRepository, formatOperationsDateTime } from "@/modules/clt-operations";
import type { CltOperationsDetail, CltOperationsListItem } from "@/modules/clt-operations";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type CltOperationsPageProps = {
  params: Promise<{ studyId: string }>;
  searchParams?: Promise<{ sessionId?: string }>;
};

export default async function CltOperationsPage({ params, searchParams }: CltOperationsPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  await requireCapability("screening:review");
  const requestOrigin = resolveRequestOrigin(await headers());
  const dashboard = await createCltOperationsRepository().getDashboard({
    detailSessionId: query?.sessionId,
    studyId
  });

  if (!dashboard) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Read-only</StatusBadge>}
        description="Seguimiento transversal de entrevistas CLT, actividades Navigo, WhatsApp y HUT."
        eyebrow="Operaciones CLT"
        title={`CLT Operations - ${dashboard.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/ctl`}>
          CTL presencial
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/navigo-app`}>
          App Navigo
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut`}>
          HUT
        </Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Exportes operativos</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Descargas TSV compatibles con Excel. No modifican estados ni generan enlaces.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={secondaryButtonClass} href={`/admin/studies/${studyId}/clt-ops/export`}>
                Exportar operativo
              </Link>
              <Link className={secondaryButtonClass} href={`/admin/studies/${studyId}/clt-ops/answers-export`}>
                Exportar respuestas CTL
              </Link>
            </div>
          </div>
        </section>

        <OperationsList
          participants={dashboard.participants}
          selectedSessionId={query?.sessionId ?? null}
          studyId={studyId}
          timeZoneIana={dashboard.study.timeZoneIana}
        />

        {dashboard.detail ? (
          <OperationsDetail detail={dashboard.detail} requestOrigin={requestOrigin} timeZoneIana={dashboard.study.timeZoneIana} />
        ) : (
          <EmptyState
            title="Selecciona una entrevista"
            description="El detalle muestra respuestas CTL agrupadas, rotaciones, enlace Navigo, actividades, WhatsApp y HUT."
          />
        )}
      </div>
    </AppShell>
  );
}

function OperationsList({
  participants,
  selectedSessionId,
  studyId,
  timeZoneIana
}: {
  participants: CltOperationsListItem[];
  selectedSessionId: string | null;
  studyId: string;
  timeZoneIana: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-zinc-950">Listado operativo</h2>
        <p className="mt-1 text-sm text-zinc-600">Una fila por sesion CTL, cruzada con datos Navigo y HUT.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Participante</th>
              <th className="px-4 py-3">Encuestador</th>
              <th className="px-4 py-3">Estado CTL</th>
              <th className="px-4 py-3">Progreso</th>
              <th className="px-4 py-3">T0</th>
              <th className="px-4 py-3">Navigo</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">HUT</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {participants.map((participant) => (
              <tr className={selectedSessionId === participant.id ? "bg-teal-50" : ""} key={participant.id}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.folio}</td>
                <td className="px-4 py-3 font-semibold text-zinc-950">{participant.participantName}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.interviewer ?? "-"}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.cltStatus}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.cltProgressLabel}</td>
                <td className="px-4 py-3 text-zinc-700">{formatOperationsDateTime(participant.t0, timeZoneIana) || "-"}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {participant.navigoActivities.filter((activity) => activity.status === "COMPLETED").length}/
                  {participant.navigoActivities.length}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {participant.whatsapp.messageCount > 0 ? participant.whatsapp.lastStatus ?? "Registrado" : "Sin WhatsApp"}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {participant.hut.id ? participant.hut.questionnaireStatus ?? participant.hut.status ?? "HUT" : "Sin HUT"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-semibold text-teal-700 hover:text-teal-800"
                    href={`/admin/studies/${studyId}/clt-ops?sessionId=${participant.id}`}
                  >
                    Ver detalle
                  </Link>
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
  timeZoneIana
}: {
  detail: CltOperationsDetail;
  requestOrigin: string;
  timeZoneIana: string;
}) {
  const navigoLink = detail.navigoLinkToken
    ? new URL(`/p/${encodeURIComponent(detail.navigoLinkToken)}/activities`, requestOrigin).toString()
    : null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Detalle operativo</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950">{detail.folio} - {detail.participantName}</h2>
          <p className="mt-1 text-sm text-zinc-600">Sesion CTL {detail.cltStatus}; encuestador {detail.interviewer ?? "sin asignar"}.</p>
        </div>
        {navigoLink ? (
          <a className={secondaryButtonClass} href={navigoLink} rel="noreferrer" target="_blank">
            Abrir link Navigo
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
        <DetailField label="T0" value={formatOperationsDateTime(detail.t0, timeZoneIana) || "Sin registro"} />
        <DetailField label="Rotacion" value={detail.rotation.rotationCode ?? "Sin rotacion"} />
        <DetailField label="HUT" value={detail.hut.id ? `${detail.hut.origin} / ${detail.hut.protocolVersion}` : "Sin HUT"} />
      </div>

      <DetailSection title="Rotaciones">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {detail.rotation.arms.map((arm) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={`${arm.armCode}-${arm.order}`}>
              <p className="font-semibold text-zinc-950">Orden {arm.order}: {arm.productCode}</p>
              <p className="text-zinc-600">{arm.armLabel} / {arm.productLabel}</p>
            </div>
          ))}
          {detail.rotation.arms.length === 0 ? <p className="text-sm text-zinc-600">Sin rotacion asignada.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="Actividades Navigo">
        <div className="grid gap-2">
          {detail.navigoActivities.map((activity) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={activity.id}>
              <p className="font-semibold text-zinc-950">{activity.code} - {activity.status}</p>
              <p className="text-zinc-600">Disponible: {formatOperationsDateTime(activity.availableFrom, timeZoneIana)}</p>
              <p className="text-zinc-600">Evidencias: {activity.evidenceCount}</p>
            </div>
          ))}
          {detail.navigoActivities.length === 0 ? <p className="text-sm text-zinc-600">Sin actividades Navigo.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="WhatsApp">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <DetailField label="Mensajes" value={String(detail.whatsapp.messageCount)} />
          <DetailField label="Ultimo estado" value={detail.whatsapp.lastStatus ?? "Sin registro"} />
          <DetailField label="Ultimo mensaje" value={formatOperationsDateTime(detail.whatsapp.lastMessageAt, timeZoneIana) || "Sin registro"} />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Templates: {detail.whatsapp.templateNames.length > 0 ? detail.whatsapp.templateNames.join(", ") : "sin template registrado"}
        </p>
      </DetailSection>

      <DetailSection title="HUT">
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <DetailField label="Origen" value={detail.hut.origin ?? "Sin HUT"} />
          <DetailField label="Protocolo" value={detail.hut.protocolVersion ?? "Sin HUT"} />
          <DetailField label="Cuestionario" value={detail.hut.questionnaireStatus ?? "Sin intento"} />
          <DetailField label="Fotos aplicacion" value={String(detail.hut.applicationPhotoCount)} />
        </div>
      </DetailSection>

      <DetailSection title="Respuestas CTL">
        <div className="space-y-4">
          {detail.answerGroups.map((group) => (
            <div className="rounded-md border border-zinc-200" key={group.sectionId}>
              <h4 className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-950">
                {group.sectionTitle}
              </h4>
              <dl className="divide-y divide-zinc-100">
                {group.answers.map((answer) => (
                  <div className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[180px_minmax(0,1fr)]" key={answer.code}>
                    <dt className="font-mono text-xs text-zinc-500">{answer.code}</dt>
                    <dd className="text-zinc-800">{answer.value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {detail.answerGroups.length === 0 ? <p className="text-sm text-zinc-600">Sin respuestas CTL capturadas.</p> : null}
        </div>
      </DetailSection>
    </section>
  );
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="mt-6 border-t border-zinc-200 pt-5">
      <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
