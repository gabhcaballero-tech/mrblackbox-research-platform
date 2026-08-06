import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicCtlInterviewerActor } from "@/shared/auth/ctl-public";
import type { CtlQuestionDefinition } from "@/modules/ctl/definition";
import { createCtlRepository, ctlStatusLabel } from "@/modules/ctl/repository";
import { savePublicCtlAnswersAction } from "@/modules/ctl/public-actions";

export const dynamic = "force-dynamic";

type CtlPublicCapturePageProps = {
  params: Promise<{ sessionId: string; studyCode: string }>;
  searchParams?: Promise<{ ctlError?: string; ctlMessage?: string }>;
};

export default async function CtlPublicCapturePage({ params, searchParams }: CtlPublicCapturePageProps) {
  const { sessionId, studyCode } = await params;
  const query = await searchParams;
  const actor = await getPublicCtlInterviewerActor({ studyCode });

  if (!actor) {
    redirect(`/ctl/${encodeURIComponent(studyCode)}?ctlError=${encodeURIComponent("Ingresa tu codigo de encuestador para continuar.")}`);
  }

  const session = await createCtlRepository().getSession({ actor, sessionId });

  if (!session) {
    notFound();
  }

  const readOnly = session.status === "COMPLETED" || session.status === "CANCELLED";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CTL publico</p>
          <h1 className="mt-2 text-2xl font-bold">Captura CTL · {session.participant.folio}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Captura presencial aplicada por encuestador IKA. Esta pantalla no da acceso a administracion.
          </p>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href={`/ctl/${studyCode}`}>
              Buscar otro folio
            </Link>
          </div>
        </header>

        <Messages error={query?.ctlError} message={query?.ctlMessage} />

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Participante validado</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <Detail label="Nombre" value={session.participant.name} />
            <Detail label="Folio" value={session.participant.folio} />
            <Detail label="NSE" value={session.participant.nse} />
            <Detail label="Encuestador" value={session.interviewerName} />
            <Detail
              label="Primera muestra"
              value={session.participant.rotation.firstSampleKey ?? "Rotacion pendiente"}
            />
            <Detail
              label="Segunda muestra"
              value={session.participant.rotation.secondSampleKey ?? "Rotacion pendiente"}
            />
            <Detail
              label="Codigos"
              value={session.participant.referenceCodes.map((code) => `${code.slot}: ${code.code}`).join(" / ") || "Sin codigos"}
            />
            <Detail label="Estado CTL" value={ctlStatusLabel(session.status)} />
          </dl>
        </section>

        <form
          action={savePublicCtlAnswersAction.bind(null, studyCode, session.id)}
          className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Cuestionario CTL</h2>
          <div className="mt-5 space-y-8">
            {session.definition.sections.map((section) => (
              <section key={section.id} className="space-y-5 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <div>
                  <h3 className="text-base font-semibold">{section.title}</h3>
                  {section.description ? <p className="mt-1 text-sm text-zinc-600">{section.description}</p> : null}
                </div>
                <div className="space-y-6">
                  {section.questions.map((question) => (
                    <CtlQuestionField
                      answer={session.answers[question.code]}
                      key={question.code}
                      question={question}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {!readOnly ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <button className={secondaryButtonClass} name="complete" type="submit" value="0">
                Guardar avance
              </button>
              <button className={primaryButtonClass} name="complete" type="submit" value="1">
                Finalizar CTL
              </button>
            </div>
          ) : (
            <p className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Esta sesion ya fue cerrada y se conserva solo para consulta.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

function CtlQuestionField({
  answer,
  question,
  readOnly
}: {
  answer: unknown;
  question: CtlQuestionDefinition;
  readOnly: boolean;
}) {
  return (
    <div className={labelClass}>
      <span>
        {question.code} · {question.label}
        {question.required ? <span className="text-rose-700"> *</span> : null}
      </span>
      {renderQuestionInput(question, answer, readOnly)}
    </div>
  );
}

function renderQuestionInput(question: CtlQuestionDefinition, answer: unknown, readOnly: boolean) {
  if (question.type === "SELECT") {
    return (
      <select
        className={inputClass}
        defaultValue={String(answer ?? "")}
        disabled={readOnly}
        name={question.code}
        required={question.required}
      >
        <option value="">Selecciona</option>
        {question.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "SCALE") {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: question.max - question.min + 1 }, (_, index) => question.min + index).map((value) => (
          <label key={value} className="flex min-w-24 flex-col gap-1 rounded-md border border-zinc-300 bg-white p-2 text-xs text-zinc-700">
            <span className="font-semibold text-zinc-950">{value}</span>
            {question.labels?.[value] ? <span>{question.labels[value]}</span> : null}
            <input
              defaultChecked={String(answer ?? "") === String(value)}
              disabled={readOnly}
              name={question.code}
              required={question.required}
              type="radio"
              value={value}
            />
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "MATRIX") {
    const matrixAnswer = isRecord(answer) ? answer : {};

    return (
      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2 text-left">Atributo</th>
              {question.columns.map((column) => (
                <th key={String(column.value)} className="px-3 py-2 text-center">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {question.rows.map((row) => (
              <tr key={row.code} className="border-t border-zinc-200">
                <th className="px-3 py-2 text-left font-medium text-zinc-800">{row.label}</th>
                {question.columns.map((column) => (
                  <td key={String(column.value)} className="px-3 py-2 text-center">
                    <input
                      aria-label={`${question.label}: ${row.label} - ${column.label}`}
                      defaultChecked={String(matrixAnswer[row.code] ?? "") === String(column.value)}
                      disabled={readOnly}
                      name={`${question.code}.${row.code}`}
                      required={question.required}
                      type="radio"
                      value={column.value}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (question.type === "LONG_TEXT") {
    return (
      <textarea
        className={inputClass}
        defaultValue={String(answer ?? "")}
        disabled={readOnly}
        name={question.code}
        rows={3}
      />
    );
  }

  return (
    <input
      className={inputClass}
      defaultValue={String(answer ?? "")}
      disabled={readOnly}
      name={question.code}
      required={question.required}
    />
  );
}

function Messages({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100";
const primaryButtonClass =
  "inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50";
