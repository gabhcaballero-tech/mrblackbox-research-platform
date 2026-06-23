"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  insertLibraryRevisionIntoScreenerAction,
  saveScreenerBlockToLibraryFeedbackAction,
  saveScreenerQuestionToLibraryFeedbackAction,
  type QuestionLibraryActionState
} from "@/modules/question-library/actions";
import type { LibraryItemProjection } from "@/modules/question-library/service";
import type { ScreenerQuestion } from "@/modules/screener";
import { UI_LABELS } from "@/shared/ui/labels";
import { LibrarySaveFields } from "./LibrarySaveFields";

const initialActionState: QuestionLibraryActionState = {
  message: "",
  ok: false
};

export function SaveQuestionToLibraryForm({
  question,
  readOnly,
  studyId
}: {
  question: ScreenerQuestion;
  readOnly: boolean;
  studyId: string;
}) {
  const [state, formAction] = useActionState(
    saveScreenerQuestionToLibraryFeedbackAction.bind(null, studyId, question.id),
    initialActionState
  );

  return (
    <details className="mt-4 rounded-md border border-teal-100 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        {UI_LABELS.actions.saveQuestionToLibrary}
      </summary>
      <form
        action={formAction}
        className="mt-3 grid gap-3 md:grid-cols-2"
      >
        <LibraryActionMessage state={state} />
        <LibrarySaveFields defaultName={question.text} readOnly={readOnly} />
        <div className="md:col-span-2">
          <SubmitButton disabled={readOnly}>
            {UI_LABELS.actions.saveQuestionToLibrary}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

export function SaveBlockToLibraryForm({
  questions,
  readOnly,
  studyId
}: {
  questions: ScreenerQuestion[];
  readOnly: boolean;
  studyId: string;
}) {
  const [state, formAction] = useActionState(
    saveScreenerBlockToLibraryFeedbackAction.bind(null, studyId),
    initialActionState
  );

  if (questions.length === 0) {
    return null;
  }

  return (
    <details className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
        {UI_LABELS.actions.saveBlockToLibrary}
      </summary>
      <form action={formAction} className="mt-4 space-y-4">
        <LibraryActionMessage state={state} />
        <fieldset className="grid gap-2 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">
            Selecciona preguntas del bloque
          </legend>
          {questions.map((question) => (
            <label
              className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              key={question.id}
            >
              <input disabled={readOnly} name="questionIds" type="checkbox" value={question.id} />
              <span>
                {question.text}
                <span className="block font-mono text-xs text-zinc-500">ID técnico: {question.id}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 md:grid-cols-2">
          <LibrarySaveFields defaultName="Bloque de filtro" readOnly={readOnly} />
        </div>
        <SubmitButton disabled={readOnly}>
          {UI_LABELS.actions.saveBlockToLibrary}
        </SubmitButton>
      </form>
    </details>
  );
}

export function InsertFromLibraryPanel({
  items,
  readOnly,
  studyId
}: {
  items: LibraryItemProjection[];
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            {UI_LABELS.actions.insertFromLibrary}
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{UI_LABELS.library.insertHelp}</p>
          <p className="mt-1 text-xs text-zinc-500">{UI_LABELS.library.insertedWarning}</p>
        </div>
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href="/admin/library">
          {UI_LABELS.actions.viewLibrary}
        </Link>
      </div>

      <form className="mb-4 grid gap-3 md:grid-cols-5">
        <label className={labelClass}>
          {UI_LABELS.library.search}
          <input className={inputClass} name="query" placeholder={UI_LABELS.library.searchPlaceholder} />
        </label>
        <label className={labelClass}>
          {UI_LABELS.library.type}
          <select className={inputClass} name="type">
            <option value="">Todos</option>
            <option value="QUESTION">{UI_LABELS.library.question}</option>
            <option value="BLOCK_TEMPLATE">{UI_LABELS.library.block}</option>
          </select>
        </label>
        <label className={labelClass}>
          {UI_LABELS.library.category}
          <input className={inputClass} name="category" placeholder={UI_LABELS.library.categorySearchPlaceholder} />
        </label>
        <label className={labelClass}>
          {UI_LABELS.library.tags}
          <input className={inputClass} name="tag" placeholder={UI_LABELS.library.tagsSearchPlaceholder} />
        </label>
        <div className="flex items-end">
          <button className={secondaryButtonClass} type="submit">
            {UI_LABELS.library.search}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          {UI_LABELS.library.noItems}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-4" key={item.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    {item.type === "QUESTION" ? UI_LABELS.library.question : UI_LABELS.library.block}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-950">{item.name}</h3>
                  <p className="mt-1 text-sm text-zinc-600">{item.contentSummary}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.scope === "GENERIC" ? UI_LABELS.library.generic : UI_LABELS.library.studySpecific}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                  {item.tags.length > 0 ? (
                    <p className="mt-1 text-xs text-zinc-500">{item.tags.join(", ")}</p>
                  ) : null}
                  {item.warning ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {item.warning}
                    </p>
                  ) : null}
                </div>
                {item.activeRevision ? (
                  <form
                    action={insertLibraryRevisionIntoScreenerAction.bind(
                      null,
                      studyId,
                      item.activeRevision.id
                    )}
                  >
                    <button className={secondaryButtonClass} disabled={readOnly} type="submit">
                      {UI_LABELS.actions.insertFromLibrary}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryActionMessage({ state }: { state: QuestionLibraryActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm md:col-span-2 ${
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
      role={state.ok ? "status" : "alert"}
    >
      <p className="font-medium">{state.message}</p>
      {state.ok && state.itemId ? (
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            className="font-semibold text-emerald-900 underline"
            href={`/admin/library/${state.itemId}?saved=library`}
          >
            Abrir elemento en biblioteca
          </Link>
          <a className="font-semibold text-emerald-900 underline" href="#create-question-panel">
            Seguir editando screener
          </a>
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton({ children, disabled }: { children: string; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={secondaryButtonClass} disabled={disabled || pending} type="submit">
      {pending ? UI_LABELS.common.saving : children}
    </button>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
