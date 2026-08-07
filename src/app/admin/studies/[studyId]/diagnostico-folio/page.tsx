import Link from "next/link";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import {
  diagnoseNavigoFolio,
  type DiagnosticBlock,
  type DiagnosticItem,
  type DiagnosticStatus,
  type E2EDiagnosticStatus,
  type FolioDiagnosticReport,
  type FolioTechnicalDetails
} from "@/modules/navigo-diagnostics/folio-diagnostic";

export const dynamic = "force-dynamic";

type FolioDiagnosticPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    ctlInterviewerCodeId?: string;
    detalleTecnico?: string;
    folio?: string;
    studyCode?: string;
  }>;
};

export default async function FolioDiagnosticPage({ params, searchParams }: FolioDiagnosticPageProps) {
  const { studyId } = await params;
  const query = (await searchParams) ?? {};
  const actor = await requireCapability("screening:review");

  const studyCode = query.studyCode?.trim() || NAVIGO_STUDY_CODE;
  const folio = query.folio?.trim() ?? "";
  const ctlInterviewerCodeId = query.ctlInterviewerCodeId?.trim() || null;
  const canViewTechnicalDetail = actor.role === "ADMIN";
  const includeTechnicalDetail = canViewTechnicalDetail && query.detalleTecnico === "1";
  const report = folio
    ? await diagnoseNavigoFolio({
        ctlInterviewerCodeId,
        folio,
        includeTechnicalDetail,
        studyCode
      })
    : null;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="planned">Solo lectura</StatusBadge>}
        description="Valida las conexiones operativas de screening, rotaciones, CTL, Navigo y HUT sin crear ni modificar datos."
        eyebrow="Diagnostico interno"
        title="Diagnostico por folio"
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/navigo-app`}>
          App Navigo
        </Link>
        <Link className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/ctl`}>
          CTL presencial
        </Link>
        <Link className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/hut`}>
          HUT
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Buscar folio</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Study code
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
              defaultValue={studyCode}
              name="studyCode"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Folio
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
              defaultValue={folio}
              name="folio"
              placeholder="NAV-106"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            ctlInterviewerCodeId opcional
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950"
              defaultValue={ctlInterviewerCodeId ?? ""}
              name="ctlInterviewerCodeId"
              placeholder="ID de codigo IKA"
            />
          </label>
          <div className="flex items-end">
            <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800" type="submit">
              Diagnosticar
            </button>
          </div>
          {canViewTechnicalDetail ? (
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 md:col-span-4">
              <input
                className="h-4 w-4 rounded border-zinc-300"
                defaultChecked={includeTechnicalDetail}
                name="detalleTecnico"
                type="checkbox"
                value="1"
              />
              Detalle tecnico
            </label>
          ) : null}
        </form>
      </section>

      {report ? <DiagnosticReport report={report} /> : null}
    </AppShell>
  );
}

function DiagnosticReport({ report }: { report: FolioDiagnosticReport }) {
  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Resumen</p>
            <h2 className="mt-1 text-2xl font-semibold text-zinc-950">{report.folio}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {report.participantName ?? "Participante no identificado"} · {report.study?.code ?? "Estudio no encontrado"}
            </p>
          </div>
          <E2EBadge status={report.e2eStatus} />
        </div>
      </section>

      <div className="grid gap-5">
        {report.blocks.map((block) => (
          <DiagnosticBlockCard block={block} key={block.id} />
        ))}
      </div>

      {report.technicalDetails ? <TechnicalDetails details={report.technicalDetails} /> : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Acciones sugeridas</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          {report.suggestions.map((suggestion) => (
            <li className="rounded-md bg-zinc-50 px-3 py-2" key={suggestion}>
              {suggestion}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TechnicalDetails({ details }: { details: FolioTechnicalDetails }) {
  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Detalle tecnico ADMIN</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-950">Valores reales de rotacion</h2>
      <p className="mt-1 text-sm text-zinc-700">
        Vista de auditoria de solo lectura. No incluye tokens, codigos WhatsApp completos ni secretos.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <TechnicalDetailCard
          items={[
            ["Fuente", details.navigo.source],
            ["Primera fragancia", details.navigo.firstFragrance],
            ["Brazo primera aplicacion", details.navigo.firstFragranceArm],
            ["applicationOrder primera", formatNullableNumber(details.navigo.firstFragranceApplicationOrder)],
            ["Segunda fragancia", details.navigo.secondFragrance],
            ["Brazo segunda aplicacion", details.navigo.secondFragranceArm],
            ["applicationOrder segunda", formatNullableNumber(details.navigo.secondFragranceApplicationOrder)]
          ]}
          missingLabel="No asignado"
          title="ROTACION NAVIGO"
        />
        <TechnicalDetailCard
          items={[
            ["Fuente", details.ctlTriangular.source],
            ["Triangular 1 PR1", details.ctlTriangular.triangular1.pr1],
            ["Triangular 1 PR2", details.ctlTriangular.triangular1.pr2],
            ["Triangular 1 PR3", details.ctlTriangular.triangular1.pr3],
            ["Triangular 1 VERI_1", details.ctlTriangular.triangular1.veri1],
            ["Triangular 2 PR4", details.ctlTriangular.triangular2.pr4],
            ["Triangular 2 PR5", details.ctlTriangular.triangular2.pr5],
            ["Triangular 2 PR6", details.ctlTriangular.triangular2.pr6],
            ["Triangular 2 VERI_2", details.ctlTriangular.triangular2.veri2]
          ]}
          missingLabel={details.ctlTriangular.source === "Sin snapshot" ? "Sin snapshot" : "No importado"}
          title="ROTACION CTL TRIANGULAR"
        />
        <TechnicalDetailCard
          items={[
            ["Fuente", details.hut.source],
            ["EVA1", details.hut.eva1],
            ["EVA2", details.hut.eva2]
          ]}
          missingLabel="No importado"
          title="ROTACION HUT"
        />
      </div>
    </section>
  );
}

function TechnicalDetailCard({
  items,
  missingLabel,
  title
}: {
  items: Array<[string, string | null]>;
  missingLabel: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {items.map(([label, value]) => (
          <div className="flex justify-between gap-3 border-b border-zinc-100 pb-2 last:border-0 last:pb-0" key={label}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-semibold text-zinc-950">{value ?? missingLabel}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatNullableNumber(value: number | null): string | null {
  return value === null ? null : String(value);
}

function DiagnosticBlockCard({ block }: { block: DiagnosticBlock }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">{block.title}</h2>
        <DiagnosticBadge status={block.status} />
      </div>
      <dl className="mt-4 grid gap-2 md:grid-cols-2">
        {block.items.map((item) => (
          <DiagnosticRow item={item} key={`${item.label}-${item.value}`} />
        ))}
      </dl>
    </section>
  );
}

function DiagnosticRow({ item }: { item: DiagnosticItem }) {
  return (
    <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
      <dt className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span>{item.label}</span>
        <DiagnosticBadge status={item.status} />
      </dt>
      <dd className="mt-1 break-words text-sm text-zinc-900">{item.value}</dd>
    </div>
  );
}

function DiagnosticBadge({ status }: { status: DiagnosticStatus }) {
  const label = status === "OK" ? "🟢 OK" : status === "PENDING" ? "🟡 PENDIENTE" : "🔴 BLOQUEADO";
  const tone =
    status === "OK"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "PENDING"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function E2EBadge({ status }: { status: E2EDiagnosticStatus }) {
  const label = status === "LISTO" ? "✅ LISTO" : status === "PENDIENTE" ? "⚠️ PENDIENTE" : "❌ BLOQUEADO";
  const tone =
    status === "LISTO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "PENDIENTE"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  return <span className={`inline-flex rounded-md border px-3 py-2 text-sm font-semibold ${tone}`}>{label}</span>;
}
