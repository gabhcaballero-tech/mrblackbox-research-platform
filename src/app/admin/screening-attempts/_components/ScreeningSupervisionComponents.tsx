import Link from "next/link";
import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import type {
  ScreeningAttemptDetail,
  ScreeningAttemptListData,
  ScreeningAttemptListItem
} from "@/modules/screening-supervision";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDate(value: Date | null): string {
  return value ? dateFormatter.format(value) : "Sin cierre";
}

function formatInputDate(value: Date | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function badgeTone(status: ScreeningAttemptListItem["status"]) {
  if (status === "PASSED") {
    return "ready";
  }

  if (status === "TERMINATED") {
    return "blocked";
  }

  return "planned";
}

function compactNse(attempt: ScreeningAttemptListItem): string {
  if (attempt.nseScore === null) {
    return "No calculado";
  }

  return attempt.nseClassLabel ? `${attempt.nseScore} · ${attempt.nseClassLabel}` : String(attempt.nseScore);
}

function interviewerLabel(attempt: ScreeningAttemptListItem): string {
  return attempt.fieldUser.name.trim() || attempt.fieldUser.email;
}

function referenceLabel(reference: string | null): string {
  return reference?.trim() || "—";
}

function compactVersion(version: number): string {
  return `v${version}`;
}

export function ScreeningAttemptFilters({ data }: { data: ScreeningAttemptListData }) {
  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" method="get">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <label className={labelClass}>
          Participante o referencia
          <input
            className={inputClass}
            defaultValue={data.filters.participantQuery ?? ""}
            name="participantQuery"
            placeholder="Ej. Gabriela, teléfono o referencia"
          />
        </label>
        <label className={labelClass}>
          Estado
          <select className={inputClass} defaultValue={data.filters.status ?? ""} name="status">
            <option value="">Todos</option>
            <option value="STARTED">Iniciado</option>
            <option value="INCOMPLETE">Incompleto</option>
            <option value="PASSED">Elegible</option>
            <option value="TERMINATED">No elegible</option>
            <option value="PENDING_REVIEW">Pendiente de revisión</option>
          </select>
        </label>
        <label className={labelClass}>
          Entrevistador
          <select className={inputClass} defaultValue={data.filters.fieldUserId ?? ""} name="fieldUserId">
            <option value="">Todos</option>
            {data.fieldUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Fecha desde
          <input className={inputClass} defaultValue={formatInputDate(data.filters.dateFrom)} name="dateFrom" type="date" />
        </label>
        <label className={labelClass}>
          Fecha hasta
          <input className={inputClass} defaultValue={formatInputDate(data.filters.dateTo)} name="dateTo" type="date" />
        </label>
        <label className={labelClass}>
          Código o resultado
          <input className={inputClass} defaultValue={data.filters.code ?? ""} name="code" placeholder="Ej. GENERO o PASSED" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={primaryButtonClass} type="submit">
          Filtrar intentos
        </button>
        <Link className={secondaryButtonClass} href={`/admin/studies/${data.study.id}/screening-attempts`}>
          Limpiar filtros
        </Link>
      </div>
    </form>
  );
}

export function ScreeningAttemptTable({ attempts, studyId }: { attempts: ScreeningAttemptListItem[]; studyId: string }) {
  if (attempts.length === 0) {
    return (
      <EmptyState
        title="Sin intentos"
        description="No hay intentos de screener para este estudio con los filtros actuales."
      />
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm" aria-label="Intentos de screener">
      <div className="overflow-x-auto">
        <table className="min-w-[920px] divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className={`${thClass} w-[220px]`}>Participante</th>
              <th className={`${thClass} w-[92px]`}>Referencia</th>
              <th className={`${thClass} w-[140px]`}>Entrevistador</th>
              <th className={`${thClass} w-[110px]`}>Estado</th>
              <th className={`${thClass} w-[120px]`}>Código</th>
              <th className={`${thClass} min-w-[260px]`}>Motivo</th>
              <th className={`${thClass} w-[130px]`}>NSE</th>
              <th className={`${thClass} w-[150px]`}>Inicio</th>
              <th className={`${thClass} w-[150px]`}>Cierre</th>
              <th className={`${thClass} w-[76px]`}>Versión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {attempts.map((attempt) => (
              <tr key={attempt.id} className="align-top">
                <td className={`${tdClass} min-w-[220px]`}>
                  <div className="space-y-1.5">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-950" title={attempt.participant.name}>
                      {attempt.participant.name}
                    </p>
                    <Link
                      className="inline-flex w-fit rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
                      href={`/admin/screening-attempts/${attempt.id}`}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>{referenceLabel(attempt.participant.externalReference)}</td>
                <td className={`${tdClass} max-w-[140px]`}>
                  <span className="block truncate" title={interviewerLabel(attempt)}>
                    {interviewerLabel(attempt)}
                  </span>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>
                  <StatusBadge status={badgeTone(attempt.status)}>{attempt.statusLabel}</StatusBadge>
                </td>
                <td className={`${tdClass} max-w-[120px] font-mono text-xs`}>
                  <span className="block truncate" title={attempt.terminationCode ?? "No aplica"}>
                    {attempt.terminationCode ?? "—"}
                  </span>
                </td>
                <td className={`${tdClass} min-w-[260px]`}>
                  <span className="block line-clamp-2 leading-5" title={attempt.terminationReason ?? "No aplica"}>
                    {attempt.terminationReason ?? "—"}
                  </span>
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>{compactNse(attempt)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{formatDate(attempt.startedAt)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{formatDate(attempt.closedAt)}</td>
                <td className={`${tdClass} whitespace-nowrap`}>{compactVersion(attempt.screenerVersionNumber)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-100 px-4 py-3">
        <Link className="text-sm font-semibold text-zinc-700 hover:text-zinc-950" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
      </div>
    </section>
  );
}

export function ScreeningAttemptDetailView({ detail }: { detail: ScreeningAttemptDetail }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Resultado del filtro</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{detail.resultLabel}</h2>
            <p className="mt-2 text-sm text-zinc-600">{detail.terminationReason ?? "Sin motivo registrado."}</p>
          </div>
          <StatusBadge status={badgeTone(detail.status)}>{detail.statusLabel}</StatusBadge>
        </div>
        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-3">
          <SummaryItem label="Estudio" value={`${detail.study.name} · ${detail.study.code}`} />
          <SummaryItem label="Participante" value={detail.participant.name} />
          <SummaryItem label="Referencia externa" value={detail.participant.externalReference ?? "Sin referencia"} />
          <SummaryItem label="Teléfono" value={detail.participant.phone ?? "Sin teléfono"} />
          <SummaryItem label="Correo" value={detail.participant.email ?? "Sin correo"} />
          <SummaryItem label="Entrevistador" value={detail.fieldUser.name} />
          <SummaryItem label="Código" value={detail.terminationCode ?? "No aplica"} />
          <SummaryItem label="Inicio" value={formatDate(detail.startedAt)} />
          <SummaryItem label="Cierre" value={formatDate(detail.closedAt)} />
          <SummaryItem label="Versión del screener" value={`v${detail.screenerVersionNumber}`} />
          <SummaryItem label="Hash de definición" value={detail.definitionHash} mono />
          <SummaryItem label="Puntaje NSE" value={String(detail.nseScore ?? "No calculado")} />
          <SummaryItem label="Clasificación NSE" value={detail.nseClassLabel ?? "Sin clasificación"} />
          <SummaryItem label="Código NSE" value={detail.nseClassCode ?? "No aplica"} mono />
        </dl>
      </section>

      <ReviewSignals detail={detail} />
      <AnswerList detail={detail} />
    </div>
  );
}

function ReviewSignals({ detail }: { detail: ScreeningAttemptDetail }) {
  if (
    detail.evaluation.reasons.length === 0 &&
    detail.evaluation.flags.length === 0 &&
    detail.evaluation.missingQuestionIds.length === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Razones, banderas y faltantes</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SignalList
          empty="Sin razones registradas."
          items={detail.evaluation.reasons.map((reason) => `${reason.code}: ${reason.reason}`)}
          title="Razones"
        />
        <SignalList
          empty="Sin banderas registradas."
          items={detail.evaluation.flags.map((flag) => `${flag.code}${flag.label ? `: ${flag.label}` : ""}`)}
          title="Banderas"
        />
        <SignalList empty="Sin faltantes registrados." items={detail.evaluation.missingQuestionIds} title="Faltantes" />
      </div>
    </section>
  );
}

function SignalList({ empty, items, title }: { empty: string; items: string[]; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-zinc-600">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">{empty}</p>
      )}
    </div>
  );
}

function AnswerList({ detail }: { detail: ScreeningAttemptDetail }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Respuestas capturadas</h2>
      {detail.answers.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No hay respuestas capturadas para este intento.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {detail.answers.map((answer) => (
            <article className="rounded-md border border-zinc-200 p-4" key={answer.questionId}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {answer.order}. {answer.questionType} · ID técnico: {answer.questionId}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-950">{answer.questionText}</h3>
                </div>
                {answer.missing ? <StatusBadge status="planned">Faltante</StatusBadge> : null}
              </div>
              <p className="mt-3 text-sm text-zinc-700">{answer.answerText}</p>
              {answer.currentlyHidden ? (
                <p className="mt-2 text-xs text-amber-700">
                  Respuesta capturada; actualmente no visible por condiciones.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryItem({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className={`mt-1 break-words text-zinc-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
const thClass = "px-3 py-3";
const tdClass = "px-3 py-4 text-zinc-700";
