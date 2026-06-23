import Link from "next/link";
import {
  insertLibraryRevisionIntoScreenerAction,
  saveScreenerBlockToLibraryAction,
  saveScreenerQuestionToLibraryAction
} from "@/modules/question-library/actions";
import type { LibraryItemProjection } from "@/modules/question-library/service";
import type { ScreenerQuestion } from "@/modules/screener";
import { UI_LABELS } from "@/shared/ui/labels";

type LibrarySaveFieldsProps = {
  defaultName: string;
  readOnly: boolean;
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
  return (
    <details className="mt-4 rounded-md border border-teal-100 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        {UI_LABELS.actions.saveQuestionToLibrary}
      </summary>
      <form
        action={saveScreenerQuestionToLibraryAction.bind(null, studyId, question.id)}
        className="mt-3 grid gap-3 md:grid-cols-2"
      >
        <LibrarySaveFields defaultName={question.text} readOnly={readOnly} />
        <div className="md:col-span-2">
          <button className={secondaryButtonClass} disabled={readOnly} type="submit">
            {UI_LABELS.actions.saveQuestionToLibrary}
          </button>
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
  if (questions.length === 0) {
    return null;
  }

  return (
    <details className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
        {UI_LABELS.actions.saveBlockToLibrary}
      </summary>
      <form action={saveScreenerBlockToLibraryAction.bind(null, studyId)} className="mt-4 space-y-4">
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
        <button className={secondaryButtonClass} disabled={readOnly} type="submit">
          {UI_LABELS.actions.saveBlockToLibrary}
        </button>
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
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
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
          <input className={inputClass} name="query" placeholder="Nombre o descripción" />
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
          <input className={inputClass} name="category" />
        </label>
        <label className={labelClass}>
          {UI_LABELS.library.tags}
          <input className={inputClass} name="tag" />
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
    </section>
  );
}

function LibrarySaveFields({ defaultName, readOnly }: LibrarySaveFieldsProps) {
  return (
    <>
      <label className={labelClass}>
        {UI_LABELS.library.itemName}
        <input className={inputClass} defaultValue={defaultName} disabled={readOnly} name="name" required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.category}
        <input className={inputClass} disabled={readOnly} name="category" />
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.library.description}
        <input className={inputClass} disabled={readOnly} name="description" />
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.tags}
        <input className={inputClass} disabled={readOnly} name="tags" placeholder="perfil, nse" />
        <span className="text-xs font-normal text-zinc-500">{UI_LABELS.library.tagsHelp}</span>
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.scope}
        <select className={inputClass} defaultValue="STUDY_SPECIFIC" disabled={readOnly} name="scope">
          <option value="STUDY_SPECIFIC">{UI_LABELS.library.specific}</option>
          <option value="GENERIC">{UI_LABELS.library.generic}</option>
        </select>
      </label>
      <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
        <input disabled={readOnly} name="confirmGeneric" type="checkbox" />
        <span>{UI_LABELS.library.confirmGeneric}</span>
      </label>
    </>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
