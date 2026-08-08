import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import {
  cleanupQaParticipantRunAction,
  createQaParticipantScenarioAction
} from "@/modules/qa-participants/actions";
import { createQaParticipantsRepository } from "@/modules/qa-participants";
import { validateQaE2eRun, type QaE2eValidationReport } from "@/modules/qa-e2e-validator";
import type {
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
    qaError?: string;
    qaMessage?: string;
  }>;
};

export default async function QaAdminPage({ params, searchParams }: QaAdminPageProps) {
  const { studyId } = await params;
  const query = (await searchParams) ?? {};
  await requireCapability("admin:access");
  const runs = await createQaParticipantsRepository().listRuns({
    includeCleaned: true,
    studyId
  });
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
        <QaRunsSection diagnosticReport={diagnosticReport} runs={runs} studyId={studyId} />
      </div>
    </AppShell>
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
