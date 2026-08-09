import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  createHutOperationsRepository,
  formatHutOperationsDateTime
} from "@/modules/hut-operations";
import {
  formatHutPhotoTimelineSlotTitle,
  resolveHutPhaseCodeSlotTimelineLabel,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel
} from "@/modules/hut";
import type { HutOperationsDetail, HutOperationsListItem } from "@/modules/hut-operations";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type HutOperationsPageProps = {
  params: Promise<{ studyId: string }>;
  searchParams?: Promise<{ participantId?: string }>;
};

export default async function HutOperationsPage({ params, searchParams }: HutOperationsPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  await requireCapability("screening:review");
  const requestOrigin = resolveRequestOrigin(await headers());
  const dashboard = await createHutOperationsRepository().getDashboard({
    detailParticipantId: query?.participantId,
    studyId
  });

  if (!dashboard) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Read-only</StatusBadge>}
        description="Seguimiento operativo de participantes HUT, fases, cuestionario v5, fotos y relacion Navigo."
        eyebrow="Operaciones HUT"
        title={`HUT Operations - ${dashboard.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut`}>
          Admin HUT
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/navigo-app`}>
          App Navigo
        </Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Exportes HUT</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Descargas TSV compatibles con Excel. No modifican fases, respuestas, fotos ni participantes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={secondaryButtonClass} href={`/admin/studies/${studyId}/hut-ops/export`}>
                Exportar operativo HUT
              </Link>
              <Link className={secondaryButtonClass} href={`/admin/studies/${studyId}/hut-ops/answers-export`}>
                Exportar respuestas HUT
              </Link>
            </div>
          </div>
        </section>

        <OperationsList
          participants={dashboard.participants}
          selectedParticipantId={query?.participantId ?? null}
          studyId={studyId}
          timeZoneIana={dashboard.study.timeZoneIana}
        />

        {dashboard.detail ? (
          <OperationsDetail detail={dashboard.detail} requestOrigin={requestOrigin} timeZoneIana={dashboard.study.timeZoneIana} />
        ) : (
          <EmptyState
            title="Selecciona un participante HUT"
            description="El detalle muestra fases, codigos por fase, respuestas agrupadas, fotos, rotacion y timeline."
          />
        )}
      </div>
    </AppShell>
  );
}

function OperationsList({
  participants,
  selectedParticipantId,
  studyId,
  timeZoneIana
}: {
  participants: HutOperationsListItem[];
  selectedParticipantId: string | null;
  studyId: string;
  timeZoneIana: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-zinc-950">Listado HUT</h2>
        <p className="mt-1 text-sm text-zinc-600">Una fila por participante HUT, cruzada con NAV y avance del cuestionario.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Folio HUT</th>
              <th className="px-4 py-3">Folio NAV</th>
              <th className="px-4 py-3">Participante</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Protocolo</th>
              <th className="px-4 py-3">Fase actual</th>
              <th className="px-4 py-3">Cuestionario</th>
              <th className="px-4 py-3">Fotos</th>
              <th className="px-4 py-3">Ultima actividad</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {participants.map((participant) => (
              <tr className={selectedParticipantId === participant.id ? "bg-teal-50" : ""} key={participant.id}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.hutFolio}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-900">{participant.navFolio ?? "-"}</td>
                <td className="px-4 py-3 font-semibold text-zinc-950">{participant.participant.name}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.origin}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.protocolVersion}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.currentPhase}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.questionnaireProgressLabel}</td>
                <td className="px-4 py-3 text-zinc-700">{participant.photoCount}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatHutOperationsDateTime(participant.lastActivityAt, timeZoneIana) || "-"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-semibold text-teal-700 hover:text-teal-800"
                    href={`/admin/studies/${studyId}/hut-ops?participantId=${participant.id}`}
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
  detail: HutOperationsDetail;
  requestOrigin: string;
  timeZoneIana: string;
}) {
  const navigoLink = detail.navigo.activeTokenId
    ? new URL(`/p/${encodeURIComponent(detail.navigo.activeTokenId)}/activities`, requestOrigin).toString()
    : null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Detalle HUT</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950">{detail.hutFolio} - {detail.participant.name}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {detail.origin} / {detail.protocolVersion} / {detail.questionnaireStatus ?? "sin cuestionario"}
          </p>
        </div>
        {navigoLink ? (
          <a className={secondaryButtonClass} href={navigoLink} rel="noreferrer" target="_blank">
            Abrir link Navigo
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
        <DetailField label="Folio NAV" value={detail.navFolio ?? "Sin vinculo NAV"} />
        <DetailField label="Telefono" value={detail.participant.phone ?? "-"} />
        <DetailField label="Correo" value={detail.participant.email ?? "-"} />
        <DetailField label="Ultima actividad" value={formatHutOperationsDateTime(detail.lastActivityAt, timeZoneIana) || "-"} />
      </div>

      <DetailSection title="Rotacion">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <DetailField label="HUT EVA1" value={detail.rotation.hutEva1 ?? "No asignado"} />
          <DetailField label="HUT EVA2" value={detail.rotation.hutEva2 ?? "No asignado"} />
          <DetailField label="Rotacion Navigo" value={detail.rotation.navigoRotationCode ?? "Sin rotacion Navigo"} />
        </div>
      </DetailSection>

      <DetailSection title="Cronograma HUT">
        <div className="grid gap-2">
          {detail.photoTimeline.map((slot) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={slot.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{slot.dayLabel}</p>
                  <p className="font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="text-zinc-600">
                    Participante: {slot.participantTask ?? "Sin captura fotografica"}{slot.interviewerTask ? ` / Encuestador: ${slot.interviewerTask}` : ""}
                  </p>
                  <p className="text-zinc-600">Producto: {slot.productCode ?? "No asignado"}</p>
                  {slot.evidence ? (
                    <p className="text-zinc-600">Foto: {formatHutOperationsDateTime(slot.evidence.capturedAt, timeZoneIana)}</p>
                  ) : (
                    <p className="text-zinc-600">{slot.isCapturableWithCurrentModel ? "Pendiente" : "Proxima actividad programada"}</p>
                  )}
                </div>
                <StatusBadge status={slot.status === "COMPLETED" ? "ready" : slot.status === "AVAILABLE" ? "planned" : "blocked"}>
                  {slot.status === "COMPLETED" ? "Completado" : slot.status === "AVAILABLE" ? "Disponible" : slot.isCapturableWithCurrentModel ? "Pendiente" : "Programado"}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Fases y codigos HUT">
        <div className="grid gap-2">
          {detail.phaseCodes.map((code) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={`${code.phase}-${code.slot}`}>
              <p className="font-semibold text-zinc-950">{resolveHutPhaseCodeSlotTimelineLabel(code.slot)} / slot {code.slot} / {code.status}</p>
              <p className="text-zinc-600">
                Enviado: {formatHutOperationsDateTime(code.sentAt, timeZoneIana) || "-"} / Validado:{" "}
                {formatHutOperationsDateTime(code.validatedAt, timeZoneIana) || "-"} / Usado:{" "}
                {formatHutOperationsDateTime(code.usedAt, timeZoneIana) || "-"}
              </p>
            </div>
          ))}
          {detail.phaseCodes.length === 0 ? <p className="text-sm text-zinc-600">Sin codigos por fase.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="Progreso cuestionario">
        <div className="grid gap-2">
          {detail.visits.map((visit) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={visit.section}>
              <p className="font-semibold text-zinc-950">{visit.section} - {visit.status}</p>
              <p className="text-zinc-600">
                Inicio: {formatHutOperationsDateTime(visit.startedAt, timeZoneIana) || "-"} / Cierre:{" "}
                {formatHutOperationsDateTime(visit.completedAt, timeZoneIana) || "-"}
              </p>
            </div>
          ))}
          {detail.visits.length === 0 ? <p className="text-sm text-zinc-600">Sin visitas del cuestionario.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="Fotos recibidas">
        <div className="grid gap-2 sm:grid-cols-2">
          {detail.photos.map((photo) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={`${photo.source}-${photo.phase ?? photo.capturedLocalDate}-${photo.useDayNumber}-${photo.capturedAt.toISOString()}`}>
              <p className="font-semibold text-zinc-950">
                {photo.source === "PHASE_EVIDENCE"
                  ? resolveHutPhotoTimelinePhaseLabel(photo.phase)
                  : resolveHutPhotoTimelineUseDayLabel(photo.useDayNumber)} / {photo.productCode ?? "sin producto"}
              </p>
              <p className="text-zinc-600">
                {photo.capturedLocalDate || "Evidencia de fase"} / {formatHutOperationsDateTime(photo.capturedAt, timeZoneIana)}
              </p>
            </div>
          ))}
          {detail.photos.length === 0 ? <p className="text-sm text-zinc-600">Sin fotos de aplicacion.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="Respuestas HUT">
        <div className="space-y-4">
          {detail.answerGroups.map((group) => (
            <div className="rounded-md border border-zinc-200" key={group.sectionId}>
              <h4 className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-950">
                {group.sectionTitle}
              </h4>
              <dl className="divide-y divide-zinc-100">
                {group.answers.map((answer) => (
                  <div className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[220px_minmax(0,1fr)]" key={answer.code}>
                    <dt className="font-mono text-xs text-zinc-500">{answer.code}</dt>
                    <dd className="text-zinc-800">{answer.value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {detail.answerGroups.length === 0 ? <p className="text-sm text-zinc-600">Sin respuestas HUT capturadas.</p> : null}
        </div>
      </DetailSection>

      <DetailSection title="Timeline operativo">
        <ol className="space-y-2">
          {detail.timeline.map((event, index) => (
            <li className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={`${event.label}-${event.at.toISOString()}-${index}`}>
              <p className="font-semibold text-zinc-950">{event.label}</p>
              <p className="text-zinc-600">{formatHutOperationsDateTime(event.at, timeZoneIana)}</p>
            </li>
          ))}
        </ol>
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
