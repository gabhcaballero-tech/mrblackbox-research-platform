import Link from "next/link";
import type { ScreenerAnswer, ScreenerQuestion } from "@/modules/screener";
import type { FieldStudySummary } from "@/modules/field/repository";
import type { FieldAttemptScreen } from "@/modules/field/service";
import { saveFieldScreeningAnswerAction } from "@/modules/field/actions";
import { StatusBadge } from "@/shared/ui/StatusBadge";

type ScreeningQuestionFormProps = {
  error?: string;
  screen: FieldAttemptScreen;
};

type ScreeningResultCardProps = {
  screen: FieldAttemptScreen;
};

export function FieldStudyCard({ study }: { study: FieldStudySummary }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">{study.name}</h2>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500">{study.code}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-medium text-zinc-500">Estado</dt>
              <dd className="mt-1 text-zinc-900">Activo</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Screener</dt>
              <dd className="mt-1 text-zinc-900">Versión {study.activeScreenerVersion.versionNumber}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Zona horaria</dt>
              <dd className="mt-1 text-zinc-900">{study.timeZoneIana}</dd>
            </div>
          </dl>
        </div>
        <Link className={primaryButtonClass} href={`/field/studies/${study.id}`}>
          Aplicar filtro
        </Link>
      </div>
    </article>
  );
}

export function ScreeningQuestionForm({ error, screen }: ScreeningQuestionFormProps) {
  const question = screen.currentQuestion;

  if (!question) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Intento cerrado</h2>
        <p className="mt-2 text-sm text-zinc-600">Este intento ya tiene resultado y no admite edición.</p>
        <Link className={`${primaryButtonClass} mt-4`} href={`/field/screening/${screen.attempt.id}/result`}>
          Ver resultado
        </Link>
      </section>
    );
  }

  const previousQuestion = getPreviousVisibleQuestion(screen.visibleQuestions, question.id);
  const answer = screen.answers[question.id];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">
            Pregunta {screen.progress.currentIndex} de {screen.progress.totalVisibleQuestions}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">{question.text}</h2>
          {question.helpText ? <p className="mt-2 text-sm leading-6 text-zinc-600">{question.helpText}</p> : null}
        </div>
        <StatusBadge status="ready">{question.required ? "Obligatoria" : "Opcional"}</StatusBadge>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <form action={saveFieldScreeningAnswerAction.bind(null, screen.attempt.id, question.id)} className="space-y-5">
        <QuestionControl answer={answer} question={question} />
        <div className="flex flex-wrap gap-3">
          {previousQuestion ? (
            <Link
              className={secondaryButtonClass}
              href={`/field/screening/${screen.attempt.id}?question=${previousQuestion.id}`}
            >
              Volver
            </Link>
          ) : null}
          <button className={primaryButtonClass} type="submit">
            Guardar y continuar
          </button>
        </div>
      </form>
    </section>
  );
}

export function ScreeningResultCard({ screen }: ScreeningResultCardProps) {
  const statusLabel = fieldResultTitle(screen.attempt.status);
  const reason = screen.attempt.terminationReason ?? screen.result.evaluationJson.safeExplanation;
  const nseCode = screen.attempt.nseClass ?? screen.result.nse?.classCode ?? null;
  const nseLabel = resolveNseLabel(screen, nseCode);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Resultado del filtro</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{statusLabel}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-700">{reason}</p>
        </div>
        <StatusBadge status={screen.attempt.status === "PASSED" ? "ready" : "planned"}>
          {fieldAttemptStatusLabel(screen.attempt.status)}
        </StatusBadge>
      </div>
      <dl className="mt-6 grid gap-4 text-sm md:grid-cols-3">
        <div>
          <dt className="font-medium text-zinc-500">Código</dt>
          <dd className="mt-1 text-zinc-900">{screen.attempt.terminationCode ?? "No aplica"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Puntaje NSE</dt>
          <dd className="mt-1 text-zinc-900">{screen.attempt.nseScore ?? screen.result.nse?.score ?? "No calculado"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Clasificación NSE</dt>
          <dd className="mt-1 text-zinc-900">{nseLabel ?? "No calculada"}</dd>
          {nseCode ? <p className="mt-1 text-xs text-zinc-500">Código NSE: {nseCode}</p> : null}
        </div>
      </dl>
      <div className="mt-6">
        <Link className={primaryButtonClass} href="/field">
          Volver a Campo
        </Link>
      </div>
    </section>
  );
}

function QuestionControl({ answer, question }: { answer: ScreenerAnswer | undefined; question: ScreenerQuestion }) {
  if (question.type === "INTEGER") {
    return (
      <label className={labelClass}>
        Respuesta numérica
        <input
          className={inputClass}
          defaultValue={typeof answer === "number" ? answer : ""}
          max={question.validation.max}
          min={question.validation.min}
          name="value"
          required={question.required}
          type="number"
        />
      </label>
    );
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    if (question.type === "LONG_TEXT") {
      return (
        <label className={labelClass}>
          Respuesta
          <textarea
            className={inputClass}
            defaultValue={typeof answer === "string" ? answer : ""}
            maxLength={question.validation.maxLength}
            minLength={question.validation.minLength}
            name="value"
            required={question.required}
            rows={4}
          />
        </label>
      );
    }

    return (
      <label className={labelClass}>
        Respuesta
        <input
          className={inputClass}
          defaultValue={typeof answer === "string" ? answer : ""}
          maxLength={question.validation.maxLength}
          minLength={question.validation.minLength}
          name="value"
          required={question.required}
        />
      </label>
    );
  }

  if (!("options" in question)) {
    return null;
  }

  const selectedValues = selectedAnswerValues(answer);
  const selectedOtherText = selectedOtherTextFromAnswer(answer);
  const hasOther = question.options.some((option) => option.isOther);

  if (question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST") {
    return (
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-700">Selecciona las opciones aplicables</legend>
        {question.options.map((option) => (
          <label
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
            key={option.value}
          >
            <input defaultChecked={selectedValues.includes(option.value)} name="value" type="checkbox" value={option.value} />
            {option.label}
          </label>
        ))}
        {hasOther ? <OtherTextInput defaultValue={selectedOtherText} /> : null}
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-700">Selecciona una respuesta</legend>
      {question.options.map((option) => (
        <label
          className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
          key={option.value}
        >
          <input
            defaultChecked={selectedValues.includes(option.value)}
            name="value"
            required={question.required}
            type="radio"
            value={option.value}
          />
          {option.label}
        </label>
      ))}
      {hasOther ? <OtherTextInput defaultValue={selectedOtherText} /> : null}
    </fieldset>
  );
}

function OtherTextInput({ defaultValue }: { defaultValue: string }) {
  return (
    <label className={labelClass}>
      Especifica
      <input className={inputClass} defaultValue={defaultValue} name="otherText" />
    </label>
  );
}

function getPreviousVisibleQuestion(questions: ScreenerQuestion[], questionId: string) {
  const index = questions.findIndex((question) => question.id === questionId);
  return index > 0 ? questions[index - 1] : null;
}

function selectedAnswerValues(answer: ScreenerAnswer | undefined): string[] {
  if (answer === undefined) {
    return [];
  }

  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  if (typeof answer === "object") {
    if (answer.values) {
      return answer.values.map(String);
    }

    if (answer.value !== undefined) {
      return [String(answer.value)];
    }

    return [];
  }

  return [String(answer)];
}

function selectedOtherTextFromAnswer(answer: ScreenerAnswer | undefined): string {
  return answer && typeof answer === "object" && !Array.isArray(answer) ? answer.otherText ?? "" : "";
}

export function fieldResultTitle(status: string): string {
  switch (status) {
    case "PASSED":
      return "Elegible / pasó filtro";
    case "TERMINATED":
      return "No elegible";
    case "PENDING_REVIEW":
      return "Pendiente de revisión";
    case "INCOMPLETE":
      return "Incompleto";
    default:
      return "En curso";
  }
}

export function fieldAttemptStatusLabel(status: string): string {
  switch (status) {
    case "PASSED":
      return "Intento elegible";
    case "TERMINATED":
      return "Intento terminado";
    case "PENDING_REVIEW":
      return "Intento pendiente de revisión";
    case "INCOMPLETE":
      return "Intento incompleto";
    case "STARTED":
      return "Intento iniciado";
    default:
      return `Intento ${status}`;
  }
}

function resolveNseLabel(screen: FieldAttemptScreen, nseCode: string | null): string | null {
  if (!nseCode) {
    return screen.result.nse?.classLabel ?? null;
  }

  const matchingRange = screen.definition.nse?.ranges.find((range) => range.code === nseCode);
  return matchingRange?.label ?? screen.result.nse?.classLabel ?? nseCode;
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50";
