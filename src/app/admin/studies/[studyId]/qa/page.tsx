import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import {
  cleanupLegacyQaParticipantAction,
  cleanupOrphanParticipantProfilesAction,
  cleanupQaParticipantRunAction,
  createQaParticipantScenarioAction
} from "@/modules/qa-participants/actions";
import { createQaParticipantsRepository } from "@/modules/qa-participants";
import { validateQaE2eRun, type QaE2eValidationReport } from "@/modules/qa-e2e-validator";
import type {
  LegacyQaCleanupPreview,
  QaParticipantExecutionMode,
  QaParticipantRunSummary,
  QaParticipantScenario,
  QaParticipantScenarioReport
} from "@/modules/qa-participants";

export const dynamic = "force-dynamic";

const QA_SCENARIOS: Array<{ label: string; value: QaParticipantScenario }> = [
  { label: "CLT solamente", value: "CLT_ONLY" },
  { label: "CLT + Navigo", value: "CLT_NAVIGO" },
  { label: "CLT + Navigo + HUT", value: "CLT_NAVIGO_HUT" },
  { label: "HUT directo", value: "HUT_DIRECTO" }
];

const QA_EXECUTION_MODES: Array<{ label: string; value: QaParticipantExecutionMode }> = [
  { label: "Fast forward", value: "FAST_FORWARD" },
  { label: "Realista", value: "REALISTIC" }
];

type QaAdminPageProps = {
  params: Promise<{ studyId: string }>;
  searchParams?: Promise<{
    diagnosticRunId?: string;
    legacyFolios?: string | string[];
    legacyPreview?: string;
    orphanProfilesPreview?: string;
    qaError?: string;
    qaMessage?: string;
  }>;
};

const LEGACY_QA_CLEANUP_FOLIOS = ["NAV-104", "NAV-106", "NAV-110", "NAV-115", "NAV-117"] as const;

export default async function QaAdminPage({ params, searchParams }: QaAdminPageProps) {
  const { studyId } = await params;
  const query = (await searchParams) ?? {};
  await requireCapability("admin:access");
  const runs = await createQaParticipantsRepository().listRuns({
    includeCleaned: true,
    studyId
  });
  const legacySelectedFolios = query.legacyPreview === "1" ? normalizeLegacyFolioSelection(query.legacyFolios) : [];
  const legacyPreview = legacySelectedFolios.length > 0
    ? await createQaParticipantsRepository().previewLegacyCleanup({
        folios: legacySelectedFolios,
        studyId
      })
    : null;
  const orphanProfilesPreview = query.orphanProfilesPreview === "1"
    ? await createQaParticipantsRepository().previewOrphanParticipantProfiles()
    : null;
  const diagnosticReport = query.diagnosticRunId
    ? await validateQaE2eRun({
        runId: query.diagnosticRunId,
        studyId
      })
    : null;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="planned">Solo ADMIN</StatusBadge>}
        description="Genera participantes ficticios para validar CLT, Navigo y HUT sin mezclar datos QA con la operacion normal."
        eyebrow="QA interno"
        title="Participantes QA"
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/ctl`}>
          CTL
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/navigo-app`}>
          App Navigo
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut`}>
          HUT
        </Link>
      </div>

      <div className="space-y-6">
        {query.qaMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.qaMessage}
          </p>
        ) : null}
        {query.qaError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {query.qaError}
          </p>
        ) : null}

        <CreateQaParticipantSection studyId={studyId} />
        <LegacyQaCleanupSection preview={legacyPreview} selectedFolios={legacySelectedFolios} studyId={studyId} />
        <OrphanParticipantProfilesCleanupSection preview={orphanProfilesPreview} studyId={studyId} />
        <QaRunsSection diagnosticReport={diagnosticReport} runs={runs} studyId={studyId} />
      </div>
    </AppShell>
  );
}

function OrphanParticipantProfilesCleanupSection({
  preview,
  studyId
}: {
  preview: Awaited<ReturnType<ReturnType<typeof createQaParticipantsRepository>["previewOrphanParticipantProfiles"]>> | null;
  studyId: string;
}) {
  return (
    <section className="rounded-lg border border-orange-200 bg-orange-50 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-orange-950">Limpieza temporal de ParticipantProfile huerfanos</h2>
        <p className="mt-1 text-sm leading-6 text-orange-900">
          Herramienta de solo ADMIN para detectar perfiles sin StudyParticipant ni relaciones historicas. Exige vista previa antes de borrar.
        </p>
      </div>

      <form className="mt-5" method="get">
        <input name="orphanProfilesPreview" type="hidden" value="1" />
        <button className="rounded-md bg-orange-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-800" type="submit">
          Ver perfiles huerfanos candidatos
        </button>
      </form>

      {preview ? (
        <div className="mt-5 rounded-lg border border-orange-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">Preview de perfiles huerfanos</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Evaluados: {preview.evaluatedCount} / Limite: {preview.limit} / Candidatos: {preview.candidateCount}
              </p>
            </div>
            <span className={preview.candidateCount > 0 ? "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800" : "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"}>
              {preview.candidateCount > 0 ? "Requiere confirmacion" : "Sin candidatos"}
            </span>
          </div>

          {preview.candidates.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {preview.candidates.map((profile) => (
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={profile.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-950">{profile.name}</p>
                      <p className="font-mono text-xs text-zinc-600">{profile.id}</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">Candidato</span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2 lg:grid-cols-3">
                    <ProfilePreviewField label="Telefono" value={profile.phone} />
                    <ProfilePreviewField label="Correo" value={profile.email} />
                    <ProfilePreviewField label="Estado" value={profile.status} />
                    <ProfilePreviewField label="Creado" value={formatDateTime(profile.createdAt)} />
                    <ProfilePreviewField label="Actualizado" value={formatDateTime(profile.updatedAt)} />
                    <ProfilePreviewField label="Motivo" value={profile.reason} />
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              No hay ParticipantProfile huerfanos candidatos para eliminar.
            </p>
          )}

          {preview.conserved.length > 0 ? (
            <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <h4 className="text-sm font-semibold text-zinc-950">Perfiles conservados por seguridad</h4>
              <div className="mt-3 grid gap-2">
                {preview.conserved.map((profile) => (
                  <article className="rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-700" key={profile.id}>
                    <p className="font-semibold text-zinc-950">{profile.name}</p>
                    <p className="font-mono text-zinc-600">{profile.id}</p>
                    <p className="mt-2 text-rose-800">{profile.conservationReason}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {preview.candidateCount > 0 ? (
            <form action={cleanupOrphanProfilesFormAction.bind(null, studyId)} className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-semibold text-rose-900">Confirmar limpieza de perfiles huerfanos</p>
              <p className="mt-1 text-xs leading-5 text-rose-800">
                Escribe ELIMINAR PERFILES HUERFANOS para borrar solo perfiles que sigan sin StudyParticipant ni relaciones al revalidar.
              </p>
              <input
                className="mt-2 w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-zinc-950"
                name="confirmation"
                placeholder="ELIMINAR PERFILES HUERFANOS"
              />
              <button className="mt-2 rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800" type="submit">
                Eliminar perfiles huerfanos
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProfilePreviewField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="font-semibold text-zinc-500">{label}</dt>
      <dd>{value ?? "-"}</dd>
    </div>
  );
}

function LegacyQaCleanupSection({
  preview,
  selectedFolios,
  studyId
}: {
  preview: Awaited<ReturnType<ReturnType<typeof createQaParticipantsRepository>["previewLegacyCleanup"]>> | null;
  selectedFolios: string[];
  studyId: string;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-amber-950">Limpieza temporal de participantes antiguos</h2>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          Herramienta temporal para folios de prueba creados antes de QaParticipantRun. Solo acepta la lista autorizada y exige vista previa antes de limpiar.
        </p>
      </div>

      <form className="mt-5 grid gap-3" method="get">
        <input name="legacyPreview" type="hidden" value="1" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {LEGACY_QA_CLEANUP_FOLIOS.map((folio) => (
            <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900" key={folio}>
              <input
                defaultChecked={selectedFolios.includes(folio)}
                name="legacyFolios"
                type="checkbox"
                value={folio}
              />
              {folio}
            </label>
          ))}
        </div>
        <div>
          <button className="rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800" type="submit">
            Ver resumen de relaciones
          </button>
        </div>
      </form>

      {preview ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-950">Resumen previo</h3>
          {preview.blockedFolios.length > 0 ? (
            <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              Folios bloqueados por no estar autorizados: {preview.blockedFolios.join(", ")}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {preview.folios.map((item) => (
              <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={item.folio}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-zinc-950">{item.folio}</p>
                    <p className="text-sm text-zinc-600">{item.participantName ?? "Sin nombre encontrado"}</p>
                  </div>
                  <span className={item.found ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700"}>
                    {item.found ? "Encontrado" : "No encontrado"}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-zinc-500">StudyParticipant</dt>
                    <dd className="font-mono">{item.studyParticipantId ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-500">HutParticipant</dt>
                    <dd className="font-mono">{item.hutParticipantId ?? "-"}</dd>
                  </div>
                </dl>
                <ParticipantProfilePreview profile={item.participantProfile} />
                <RelationCounts counts={item.relationCounts} />
              </article>
            ))}
          </div>
          {preview.rotationPlans.length > 0 ? (
            <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <h4 className="text-sm font-semibold text-zinc-950">Rotaciones de prueba asociadas</h4>
              <div className="mt-3 grid gap-2">
                {preview.rotationPlans.map((plan) => (
                  <article className="rounded-md border border-zinc-200 bg-white p-3" key={plan.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-bold text-zinc-950">{plan.rotationCode}</p>
                        <p className="text-xs text-zinc-600">
                          {plan.arms.map((arm) => arm.sampleKey).join(" -> ") || "Sin brazos configurados"}
                        </p>
                      </div>
                      <span className={plan.willDelete ? "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800" : "rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700"}>
                        {plan.willDelete ? "Se eliminara" : "Bloqueada/protegida"}
                      </span>
                    </div>
                    {plan.blockReasons.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-xs text-rose-800">
                        {plan.blockReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-600">
                      Participantes: {plan.assignedParticipants.map((participant) => participant.folio ?? participant.studyParticipantId).join(", ") || "sin participantes"}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <form action={cleanupLegacyQaFoliosFormAction.bind(null, studyId)} className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-900">Confirmar limpieza transaccional</p>
            <p className="mt-1 text-xs leading-5 text-rose-800">
              Escribe LIMPIAR FOLIOS ANTIGUOS para borrar solo los folios seleccionados. Se guardara reporte en QaParticipantRun.
            </p>
            {preview.authorizedFolios.map((folio) => (
              <input key={folio} name="legacyFolios" type="hidden" value={folio} />
            ))}
            <input
              className="mt-2 w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-zinc-950"
              name="confirmation"
              placeholder="LIMPIAR FOLIOS ANTIGUOS"
            />
            <button className="mt-2 rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800" type="submit">
              Limpiar folios seleccionados
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function ParticipantProfilePreview({ profile }: { profile: LegacyQaCleanupPreview["folios"][number]["participantProfile"] }) {
  if (!profile) {
    return (
      <div className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
        ParticipantProfile: no encontrado para este folio.
      </div>
    );
  }
  const actionLabel =
    profile.action === "DELETE_AFTER_CLEANUP"
      ? "Accion propuesta: eliminar si queda huerfano despues de limpiar relaciones."
      : profile.action === "PRESERVE_HAS_PARTICIPATIONS"
        ? "Accion propuesta: preservar porque conserva otras participaciones."
        : profile.action === "DELETED_ORPHAN"
          ? "Perfil huerfano eliminado."
          : "Sin accion de borrado propuesta.";

  return (
    <div className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
      <p className="font-semibold text-zinc-900">ParticipantProfile encontrado</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-zinc-500">ID</dt>
          <dd className="font-mono">{profile.id ?? "-"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">Estado</dt>
          <dd>{profile.status ?? "-"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">Telefono</dt>
          <dd>{profile.phone ?? "-"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">Correo</dt>
          <dd>{profile.email ?? "-"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-500">Participaciones restantes</dt>
          <dd className="font-mono">{profile.remainingParticipations ?? "-"}</dd>
        </div>
      </dl>
      <p className="mt-2 font-semibold text-amber-800">{actionLabel}</p>
    </div>
  );
}

function RelationCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <p className="mt-3 text-xs text-zinc-500">Sin conteos disponibles.</p>;
  }
  return (
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([label, value]) => (
        <div className="rounded-md bg-white px-2 py-1" key={label}>
          <dt className="font-semibold text-zinc-500">{label}</dt>
          <dd className="font-mono text-zinc-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreateQaParticipantSection({ studyId }: { studyId: string }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">Crear participante QA</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Los registros creados quedan asociados a un run QA y se excluyen de CTL publico, dashboards operativos, exports y WhatsApp automatico.
        </p>
      </div>

      <form action={createQaParticipantFormAction.bind(null, studyId)} className="mt-5 grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,220px)_auto]">
        <label className={labelClass}>
          Escenario
          <select className={inputClass} name="scenario" required>
            {QA_SCENARIOS.map((scenario) => (
              <option key={scenario.value} value={scenario.value}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Modo
          <select className={inputClass} defaultValue="FAST_FORWARD" name="executionMode" required>
            {QA_EXECUTION_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className={primaryButtonClass} type="submit">
            Crear QA
          </button>
        </div>
      </form>
    </section>
  );
}

function QaRunsSection({
  diagnosticReport,
  runs,
  studyId
}: {
  diagnosticReport: QaE2eValidationReport | null;
  runs: QaParticipantRunSummary[];
  studyId: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-zinc-950">Runs QA</h2>
        <p className="mt-1 text-sm text-zinc-600">Cada run tiene su reporte y su limpieza segura por ID.</p>
      </div>
      {runs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-600">Aun no hay participantes QA para este estudio.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {runs.map((run) => (
            <QaRunCard
              diagnosticReport={diagnosticReport?.runId === run.id ? diagnosticReport : null}
              key={run.id}
              run={run}
              studyId={studyId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QaRunCard({
  diagnosticReport,
  run,
  studyId
}: {
  diagnosticReport: QaE2eValidationReport | null;
  run: QaParticipantRunSummary;
  studyId: string;
}) {
  const report = parseScenarioReport(run.reportJson);
  const links = report?.links ?? {};

  return (
    <article className="p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-zinc-950">{run.folio ?? "Sin folio"}</h3>
            <span className={statusBadgeClass(run.status)}>{run.status}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">{run.scenario}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">{run.executionMode}</span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Creado</dt>
              <dd>{formatDateTime(run.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Creador</dt>
              <dd>{run.createdByUserName ?? run.createdByEmail ?? run.createdByUserId}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">StudyParticipant</dt>
              <dd className="font-mono text-xs">{run.studyParticipantId ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HutParticipant</dt>
              <dd className="font-mono text-xs">{run.hutParticipantId ?? "-"}</dd>
            </div>
          </dl>
        </div>
        <CleanupQaRunForm run={run} studyId={studyId} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-indigo-700 hover:text-indigo-800" href={`/admin/studies/${studyId}/qa?diagnosticRunId=${run.id}`}>
          Ejecutar diagnostico
        </Link>
        {links.ctlPublic ? (
          <Link className="text-teal-700 hover:text-teal-800" href={links.ctlPublic}>
            Abrir CTL publico
          </Link>
        ) : null}
        {links.navigoParticipant ? (
          <Link className="text-teal-700 hover:text-teal-800" href={links.navigoParticipant}>
            Abrir Navigo
          </Link>
        ) : null}
        {links.hutParticipant ? (
          <Link className="text-teal-700 hover:text-teal-800" href={links.hutParticipant}>
            Abrir HUT
          </Link>
        ) : null}
        {report?.objects.ctlSessionId ? (
          <Link className="text-teal-700 hover:text-teal-800" href={`/admin/studies/${studyId}/ctl/${report.objects.ctlSessionId}`}>
            Abrir CTL
          </Link>
        ) : null}
      </div>

      {diagnosticReport ? <QaDiagnosticReport report={diagnosticReport} /> : null}

      <details className="mt-4 rounded-md border border-zinc-200 bg-zinc-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-800">Detalle del reporte</summary>
        <div className="border-t border-zinc-200 p-3">
          {report ? <ReportSummary report={report} /> : null}
          <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-50">
            {JSON.stringify(run.reportJson ?? {}, null, 2)}
          </pre>
        </div>
      </details>
    </article>
  );
}

function QaDiagnosticReport({ report }: { report: QaE2eValidationReport }) {
  return (
    <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-indigo-950">Diagnostico E2E QA</h4>
          <p className="mt-1 text-xs text-indigo-800">
            Generado {formatDateTime(report.generatedAt)} · Resultado {report.status}
          </p>
        </div>
        <span className={report.status === "PASS" ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800"}>
          {report.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {report.blocks.map((block) => (
          <div className="rounded-md border border-white bg-white p-3" key={block.title}>
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-zinc-950">{block.title}</h5>
              <span className={block.status === "PASS" ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-rose-700"}>
                {block.status}
              </span>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {block.checks.map((check) => (
                <li className="rounded-md bg-zinc-50 px-3 py-2" key={`${block.title}-${check.label}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium text-zinc-800">{check.label}</span>
                    <span className={check.status === "PASS" ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-rose-700"}>
                      {check.status}
                    </span>
                  </div>
                  {check.id ? <p className="mt-1 font-mono text-xs text-zinc-500">{check.id}</p> : null}
                  {check.cause ? <p className="mt-1 text-xs text-rose-700">{check.cause}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        {report.links.ctlPublic ? <Link className="text-indigo-700 hover:text-indigo-800" href={report.links.ctlPublic}>CTL publico</Link> : null}
        {report.links.adminCtl ? <Link className="text-indigo-700 hover:text-indigo-800" href={report.links.adminCtl}>CTL admin</Link> : null}
        {report.links.navigoParticipant ? <Link className="text-indigo-700 hover:text-indigo-800" href={report.links.navigoParticipant}>Navigo</Link> : null}
        {report.links.hutParticipant ? <Link className="text-indigo-700 hover:text-indigo-800" href={report.links.hutParticipant}>HUT</Link> : null}
      </div>
    </section>
  );
}

function ReportSummary({ report }: { report: QaParticipantScenarioReport }) {
  const objectEntries = Object.entries(report.objects).filter(([, value]) => Boolean(value));
  return (
    <div className="grid gap-4 text-sm md:grid-cols-2">
      <div>
        <h4 className="font-semibold text-zinc-950">Objetos creados</h4>
        <ul className="mt-2 space-y-1 text-zinc-700">
          {objectEntries.length > 0 ? (
            objectEntries.map(([label, value]) => (
              <li className="font-mono text-xs" key={label}>
                {label}: {String(value)}
              </li>
            ))
          ) : (
            <li>No hay objetos registrados.</li>
          )}
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-zinc-950">Efectos externos omitidos</h4>
        <ul className="mt-2 space-y-1 text-zinc-700">
          {report.skippedExternalEffects.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CleanupQaRunForm({ run, studyId }: { run: QaParticipantRunSummary; studyId: string }) {
  const disabled = run.status === "CLEANED";
  return (
    <form action={cleanupQaParticipantFormAction.bind(null, studyId, run.id)} className="min-w-[260px] rounded-md border border-rose-200 bg-rose-50 p-3">
      <p className="text-sm font-semibold text-rose-900">Zona de limpieza</p>
      <p className="mt-1 text-xs leading-5 text-rose-800">
        Escribe LIMPIAR QA para borrar solo los objetos enlazados a este run.
      </p>
      <input
        className="mt-2 w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100"
        disabled={disabled}
        name="confirmation"
        placeholder="LIMPIAR QA"
      />
      <button
        className="mt-2 w-full rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={disabled}
        type="submit"
      >
        Limpiar run QA
      </button>
    </form>
  );
}

async function createQaParticipantFormAction(studyId: string, formData: FormData) {
  "use server";

  const scenario = formData.get("scenario") as QaParticipantScenario;
  const executionMode = formData.get("executionMode") as QaParticipantExecutionMode;
  const result = await createQaParticipantScenarioAction({
    executionMode,
    scenario,
    studyId
  });

  revalidatePath(`/admin/studies/${studyId}/qa`);
  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent(result.message)}`);
  }
  redirect(`/admin/studies/${studyId}/qa?qaMessage=${encodeURIComponent(`Participante QA creado: ${result.data.folio ?? result.data.id}`)}`);
}

async function cleanupQaParticipantFormAction(studyId: string, runId: string, formData: FormData) {
  "use server";

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "LIMPIAR QA") {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent("Escribe LIMPIAR QA para confirmar la limpieza.")}`);
  }

  const result = await cleanupQaParticipantRunAction(runId);
  revalidatePath(`/admin/studies/${studyId}/qa`);
  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent(result.message)}`);
  }
  redirect(`/admin/studies/${studyId}/qa?qaMessage=${encodeURIComponent("Run QA limpiado correctamente.")}`);
}

async function cleanupLegacyQaFoliosFormAction(studyId: string, formData: FormData) {
  "use server";

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const folios = formData.getAll("legacyFolios").map(String);
  if (confirmation !== "LIMPIAR FOLIOS ANTIGUOS") {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent("Escribe LIMPIAR FOLIOS ANTIGUOS para confirmar la limpieza.")}`);
  }

  const result = await cleanupLegacyQaParticipantAction({
    folios,
    studyId
  });
  revalidatePath(`/admin/studies/${studyId}/qa`);
  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent(result.message)}`);
  }
  const cleaned = result.data.folios.filter((item) => item.cleanupReport).map((item) => item.folio);
  redirect(`/admin/studies/${studyId}/qa?qaMessage=${encodeURIComponent(`Limpieza antigua completada: ${cleaned.join(", ") || "sin registros encontrados"}.`)}`);
}

async function cleanupOrphanProfilesFormAction(studyId: string, formData: FormData) {
  "use server";

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "ELIMINAR PERFILES HUERFANOS") {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent("Escribe ELIMINAR PERFILES HUERFANOS para confirmar la limpieza.")}`);
  }

  const result = await cleanupOrphanParticipantProfilesAction({ studyId });
  revalidatePath(`/admin/studies/${studyId}/qa`);
  if (!result.ok) {
    redirect(`/admin/studies/${studyId}/qa?qaError=${encodeURIComponent(result.message)}`);
  }
  redirect(`/admin/studies/${studyId}/qa?qaMessage=${encodeURIComponent(`Perfiles huerfanos eliminados: ${result.data.deleted.length}. Conservados: ${result.data.preserved.length}.`)}`);
}

function normalizeLegacyFolioSelection(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const allowed = new Set<string>(LEGACY_QA_CLEANUP_FOLIOS);
  return [...new Set(values.map((item) => item.trim().toUpperCase()).filter((item) => allowed.has(item)))];
}

function parseScenarioReport(value: unknown): QaParticipantScenarioReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<QaParticipantScenarioReport>;
  if (candidate.qa !== true || !candidate.objects || !candidate.links) {
    return null;
  }
  return candidate as QaParticipantScenarioReport;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City"
  }).format(value);
}

function statusBadgeClass(status: QaParticipantRunSummary["status"]): string {
  if (status === "CREATED") {
    return "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800";
  }
  if (status === "FAILED") {
    return "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800";
  }
  return "rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700";
}

const labelClass = "grid gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950";
const primaryButtonClass = "rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800";
