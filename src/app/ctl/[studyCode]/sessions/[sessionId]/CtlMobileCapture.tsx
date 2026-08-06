"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  CtlDefinition,
  CtlMatrixQuestionDefinition,
  CtlQuestionDefinition,
  CtlQuestionOption,
  CtlScaleQuestionDefinition
} from "@/modules/ctl/definition";
import {
  finishPublicCtlSessionAction,
  savePublicCtlQuestionAnswerAction
} from "@/modules/ctl/public-actions";

type FlatQuestion = {
  index: number;
  question: CtlQuestionDefinition;
  sectionTitle: string;
};

type CtlMobileCaptureProps = {
  answers: Record<string, unknown>;
  definition: CtlDefinition;
  participant: {
    folio: string;
    name: string;
  };
  readOnly: boolean;
  sessionId: string;
  studyCode: string;
};

type ActionResult =
  | {
      message: string;
      missingQuestionCodes?: string[];
      ok: false;
    }
  | {
      ok: true;
      redirectTo?: string;
    };

export function CtlMobileCapture({
  answers,
  definition,
  participant,
  readOnly,
  sessionId,
  studyCode
}: CtlMobileCaptureProps) {
  const questions = useMemo(() => flattenCtlQuestions(definition), [definition]);
  const [localAnswers, setLocalAnswers] = useState<Record<string, unknown>>(answers);
  const [currentIndex, setCurrentIndex] = useState(() => getInitialCtlQuestionIndex(definition, answers));
  const [isReviewing, setIsReviewing] = useState(readOnly);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = questions[currentIndex];
  const completedCount = questions.filter(({ question }) => isCtlQuestionAnswered(question, localAnswers[question.code])).length;
  const progressPercent = questions.length > 0 ? Math.round((completedCount / questions.length) * 100) : 0;
  const pendingQuestionCodes = getPendingCtlQuestionCodes(definition, localAnswers);
  const canGoBack = !isPending && (isReviewing || currentIndex > 0);

  function setAnswer(questionCode: string, answer: unknown) {
    setLocalAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionCode]: answer
    }));
    setError(null);
    setMessage(null);
  }

  function goBack() {
    if (isPending) {
      return;
    }

    setError(null);
    setMessage(null);

    if (isReviewing) {
      setIsReviewing(false);
      setCurrentIndex(Math.max(0, questions.length - 1));
      return;
    }

    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function saveAndContinue() {
    if (!current || readOnly || isPending) {
      return;
    }

    const validation = validateCtlQuestionForClient(current.question, localAnswers[current.question.code]);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setError(null);
    setMessage("Guardando respuesta...");
    startTransition(async () => {
      const result = await savePublicCtlQuestionAnswerAction(
        studyCode,
        sessionId,
        current.question.code,
        buildQuestionFormData(current.question, localAnswers[current.question.code])
      ) as ActionResult;

      if (!result.ok) {
        setMessage(null);
        setError(result.message);
        return;
      }

      setMessage("Respuesta guardada.");

      if (currentIndex >= questions.length - 1) {
        setIsReviewing(true);
        return;
      }

      setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
    });
  }

  function finishCtl() {
    if (readOnly || isPending) {
      return;
    }

    const pendingCodes = getPendingCtlQuestionCodes(definition, localAnswers);
    if (pendingCodes.length > 0) {
      const pendingIndex = questions.findIndex(({ question }) => pendingCodes.includes(question.code));
      setIsReviewing(false);
      setCurrentIndex(pendingIndex >= 0 ? pendingIndex : 0);
      setMessage(null);
      setError("Aun hay preguntas obligatorias pendientes.");
      return;
    }

    setError(null);
    setMessage("Finalizando CTL...");
    startTransition(async () => {
      const result = await finishPublicCtlSessionAction(
        studyCode,
        sessionId,
        buildAllAnswersFormData(definition, localAnswers)
      ) as ActionResult;

      if (!result.ok) {
        setMessage(null);
        setError(result.message);
        const firstMissing = result.missingQuestionCodes?.[0]?.split(".")[0];
        if (firstMissing) {
          const missingIndex = questions.findIndex(({ question }) => question.code === firstMissing);
          if (missingIndex >= 0) {
            setIsReviewing(false);
            setCurrentIndex(missingIndex);
          }
        }
        return;
      }

      setMessage("CTL completado correctamente.");
      if (result.redirectTo) {
        window.location.assign(result.redirectTo);
      }
    });
  }

  if (questions.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cuestionario CTL</h2>
        <p className="mt-2 text-sm text-zinc-600">No hay preguntas configuradas para esta captura.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CTL Navigo Homme</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950">{participant.folio}</h2>
          <p className="text-sm text-zinc-600">{participant.name}</p>
        </div>
        <div aria-label={`Progreso ${completedCount} de ${questions.length}`} className="space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold text-zinc-700">
            <span>{isReviewing ? "Revision final" : `Pregunta ${currentIndex + 1} de ${questions.length}`}</span>
            <span>{completedCount}/{questions.length}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      <StatusMessages error={error} message={message} />

      {isReviewing ? (
        <ReviewPanel
          pendingCount={pendingQuestionCodes.length}
          pendingQuestionCodes={pendingQuestionCodes}
        />
      ) : current ? (
        <QuestionStep
          answer={localAnswers[current.question.code]}
          flatQuestion={current}
          onAnswer={setAnswer}
          readOnly={readOnly}
        />
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          className={secondaryButtonClass}
          disabled={!canGoBack}
          onClick={goBack}
          type="button"
        >
          Anterior
        </button>
        {isReviewing ? (
          <button
            className={primaryButtonClass}
            disabled={readOnly || isPending}
            onClick={finishCtl}
            type="button"
          >
            {isPending ? "Finalizando CTL..." : "Finalizar CTL"}
          </button>
        ) : (
          <button
            className={primaryButtonClass}
            disabled={readOnly || isPending}
            onClick={saveAndContinue}
            type="button"
          >
            {isPending ? "Guardando..." : currentIndex >= questions.length - 1 ? "Revisar respuestas" : "Siguiente"}
          </button>
        )}
      </div>
    </section>
  );
}

function QuestionStep({
  answer,
  flatQuestion,
  onAnswer,
  readOnly
}: {
  answer: unknown;
  flatQuestion: FlatQuestion;
  onAnswer: (questionCode: string, answer: unknown) => void;
  readOnly: boolean;
}) {
  const { question, sectionTitle } = flatQuestion;

  return (
    <article className="mt-6 space-y-5">
      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-teal-700">{sectionTitle}</p>
        <h3 className="mt-2 text-lg font-bold leading-7 text-zinc-950">
          {question.label}
          {question.required ? <span className="text-rose-700"> *</span> : null}
        </h3>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{question.code}</p>
      </div>
      {renderMobileQuestionInput(question, answer, onAnswer, readOnly)}
    </article>
  );
}

function renderMobileQuestionInput(
  question: CtlQuestionDefinition,
  answer: unknown,
  onAnswer: (questionCode: string, answer: unknown) => void,
  readOnly: boolean
) {
  if (question.type === "SELECT") {
    return (
      <OptionCards
        answer={answer}
        disabled={readOnly}
        onSelect={(value) => onAnswer(question.code, value)}
        options={question.options}
      />
    );
  }

  if (question.type === "SCALE") {
    return <ScaleButtons answer={answer} disabled={readOnly} onSelect={(value) => onAnswer(question.code, value)} question={question} />;
  }

  if (question.type === "MATRIX") {
    return <MatrixBlocks answer={answer} disabled={readOnly} onChange={(value) => onAnswer(question.code, value)} question={question} />;
  }

  if (question.type === "LONG_TEXT") {
    return (
      <textarea
        className={textInputClass}
        disabled={readOnly}
        inputMode="text"
        onChange={(event) => onAnswer(question.code, event.target.value)}
        rows={6}
        value={String(answer ?? "")}
      />
    );
  }

  return (
    <input
      className={textInputClass}
      disabled={readOnly}
      inputMode="text"
      onChange={(event) => onAnswer(question.code, event.target.value)}
      type="text"
      value={String(answer ?? "")}
    />
  );
}

function OptionCards({
  answer,
  disabled,
  onSelect,
  options
}: {
  answer: unknown;
  disabled: boolean;
  onSelect: (value: string) => void;
  options: CtlQuestionOption[];
}) {
  const selected = String(answer ?? "");

  return (
    <div className="grid gap-3">
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            aria-pressed={isSelected}
            className={optionButtonClass(isSelected)}
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span className="text-left">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScaleButtons({
  answer,
  disabled,
  onSelect,
  question
}: {
  answer: unknown;
  disabled: boolean;
  onSelect: (value: number) => void;
  question: CtlScaleQuestionDefinition;
}) {
  const selected = String(answer ?? "");
  const values = Array.from({ length: question.max - question.min + 1 }, (_, index) => question.min + index);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {values.map((value) => {
          const isSelected = selected === String(value);
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-16 rounded-xl border px-4 py-3 text-xl font-bold transition ${
                isSelected
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
              }`}
              disabled={disabled}
              key={value}
              onClick={() => onSelect(value)}
              type="button"
            >
              {value}
            </button>
          );
        })}
      </div>
      {question.labels ? (
        <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {values.map((value) =>
            question.labels?.[value] ? (
              <p key={value}>
                <span className="font-semibold text-zinc-900">{value}</span> {question.labels[value]}
              </p>
            ) : null
          )}
        </div>
      ) : null}
    </div>
  );
}

function MatrixBlocks({
  answer,
  disabled,
  onChange,
  question
}: {
  answer: unknown;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
  question: CtlMatrixQuestionDefinition;
}) {
  const matrixAnswer = isRecord(answer) ? toStringRecord(answer) : {};

  return (
    <div className="space-y-4">
      {question.rows.map((row) => (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={row.code}>
          <p className="text-base font-semibold text-zinc-950">{row.label}</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {question.columns.map((column) => {
              const value = String(column.value);
              const isSelected = matrixAnswer[row.code] === value;
              return (
                <button
                  aria-label={`${row.label}: ${column.label}`}
                  aria-pressed={isSelected}
                  className={`min-h-12 rounded-lg border px-2 py-2 text-sm font-bold transition ${
                    isSelected
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
                  }`}
                  disabled={disabled}
                  key={value}
                  onClick={() => onChange({ ...matrixAnswer, [row.code]: value })}
                  type="button"
                >
                  {column.value}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-500">
            {question.columns.map((column) => (
              <span key={String(column.value)}>
                <span className="font-semibold">{column.value}</span> {column.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewPanel({
  pendingCount,
  pendingQuestionCodes
}: {
  pendingCount: number;
  pendingQuestionCodes: string[];
}) {
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-lg font-bold text-zinc-950">Revisar respuestas</h3>
      {pendingCount > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Aun hay {pendingCount} pregunta(s) obligatoria(s) pendiente(s).</p>
          <p className="mt-1">Pendientes: {pendingQuestionCodes.join(", ")}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Todas las preguntas obligatorias estan completas. Puedes finalizar CTL.
        </p>
      )}
    </div>
  );
}

function StatusMessages({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      {message ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function flattenCtlQuestions(definition: CtlDefinition): FlatQuestion[] {
  return definition.sections.flatMap((section) =>
    section.questions.map((question, index) => ({
      index,
      question,
      sectionTitle: section.title
    }))
  );
}

export function getInitialCtlQuestionIndex(definition: CtlDefinition, answers: Record<string, unknown>): number {
  const questions = flattenCtlQuestions(definition);
  const firstPendingIndex = questions.findIndex(({ question }) => !isCtlQuestionAnswered(question, answers[question.code]));

  return firstPendingIndex >= 0 ? firstPendingIndex : Math.max(0, questions.length - 1);
}

export function getPendingCtlQuestionCodes(definition: CtlDefinition, answers: Record<string, unknown>): string[] {
  return flattenCtlQuestions(definition)
    .filter(({ question }) => question.required && !isCtlQuestionAnswered(question, answers[question.code]))
    .map(({ question }) => question.code);
}

export function isCtlQuestionAnswered(question: CtlQuestionDefinition, answer: unknown): boolean {
  if (!question.required) {
    return true;
  }

  if (question.type === "MATRIX") {
    const matrixAnswer = isRecord(answer) ? answer : {};
    return question.rows.every((row) => String(matrixAnswer[row.code] ?? "").trim().length > 0);
  }

  return String(answer ?? "").trim().length > 0;
}

function validateCtlQuestionForClient(
  question: CtlQuestionDefinition,
  answer: unknown
): { ok: true } | { message: string; ok: false } {
  if (isCtlQuestionAnswered(question, answer)) {
    return { ok: true };
  }

  return {
    message: question.type === "MATRIX"
      ? "Responde cada atributo antes de continuar."
      : "Responde la pregunta obligatoria antes de continuar.",
    ok: false
  };
}

function buildQuestionFormData(question: CtlQuestionDefinition, answer: unknown): FormData {
  const formData = new FormData();

  appendQuestionAnswer(formData, question, answer);

  return formData;
}

function buildAllAnswersFormData(definition: CtlDefinition, answers: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const { question } of flattenCtlQuestions(definition)) {
    appendQuestionAnswer(formData, question, answers[question.code]);
  }

  return formData;
}

function appendQuestionAnswer(formData: FormData, question: CtlQuestionDefinition, answer: unknown): void {
  if (question.type === "MATRIX") {
    const matrixAnswer = isRecord(answer) ? answer : {};
    for (const row of question.rows) {
      const value = matrixAnswer[row.code];
      if (value !== undefined && value !== null) {
        formData.set(`${question.code}.${row.code}`, String(value));
      }
    }
    return;
  }

  if (answer !== undefined && answer !== null) {
    formData.set(question.code, String(answer));
  }
}

function optionButtonClass(isSelected: boolean): string {
  return `flex min-h-16 items-center justify-between rounded-xl border px-4 py-3 text-base font-semibold transition ${
    isSelected
      ? "border-teal-700 bg-teal-700 text-white"
      : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
}

const primaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-base font-bold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
const textInputClass =
  "min-h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
