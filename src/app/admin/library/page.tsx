import Link from "next/link";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { ROLE_LABELS, UI_LABELS } from "@/shared/ui/labels";
import { createQuestionLibraryRepository } from "@/modules/question-library/repository";
import { listLibraryItemsForAdmin, type LibraryItemProjection } from "@/modules/question-library/service";

export const dynamic = "force-dynamic";

type LibraryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const admin = await requireCapability("admin:access");
  const filters = (await searchParams) ?? {};
  const result = await listLibraryItemsForAdmin({
    actor: admin,
    filters,
    repository: createQuestionLibraryRepository()
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">{`Solo ${ROLE_LABELS.ADMIN}`}</StatusBadge>}
        description={UI_LABELS.library.libraryHelp}
        eyebrow="Administración"
        title={UI_LABELS.library.library}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href="/admin">
          {UI_LABELS.actions.backToStudies}
        </Link>
      </div>

      <LibraryFilters filters={filters} />
      <LibraryList items={result.data} />
    </AppShell>
  );
}

function LibraryFilters({ filters }: { filters: Record<string, string | string[] | undefined> }) {
  const valueOf = (key: string) => {
    const value = filters[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };

  return (
    <form className="mb-6 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-5">
      <label className={labelClass}>
        {UI_LABELS.library.search}
        <input className={inputClass} defaultValue={valueOf("query")} name="query" />
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.type}
        <select className={inputClass} defaultValue={valueOf("type")} name="type">
          <option value="">Todos</option>
          <option value="QUESTION">{UI_LABELS.library.question}</option>
          <option value="BLOCK_TEMPLATE">{UI_LABELS.library.block}</option>
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.scope}
        <select className={inputClass} defaultValue={valueOf("scope")} name="scope">
          <option value="">Todos</option>
          <option value="GENERIC">{UI_LABELS.library.generic}</option>
          <option value="STUDY_SPECIFIC">{UI_LABELS.library.studySpecific}</option>
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.category}
        <input className={inputClass} defaultValue={valueOf("category")} name="category" />
      </label>
      <label className={labelClass}>
        {UI_LABELS.library.tags}
        <input className={inputClass} defaultValue={valueOf("tag")} name="tag" />
      </label>
      <div className="md:col-span-5">
        <button className={secondaryButtonClass} type="submit">
          {UI_LABELS.library.search}
        </button>
      </div>
    </form>
  );
}

function LibraryList({ items }: { items: LibraryItemProjection[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        {UI_LABELS.library.noItems}
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={item.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {item.type === "QUESTION" ? UI_LABELS.library.question : UI_LABELS.library.block}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">{item.name}</h2>
          <p className="mt-2 text-sm text-zinc-600">{item.contentSummary}</p>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="font-medium text-zinc-500">{UI_LABELS.library.scope}</dt>
              <dd className="mt-1 text-zinc-900">
                {item.scope === "GENERIC" ? UI_LABELS.library.generic : UI_LABELS.library.studySpecific}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">{UI_LABELS.library.category}</dt>
              <dd className="mt-1 text-zinc-900">{item.category ?? UI_LABELS.common.doesNotApply}</dd>
            </div>
          </dl>
          {item.tags.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-500">{item.tags.join(", ")}</p>
          ) : null}
          <Link
            className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
            href={`/admin/library/${item.id}`}
          >
            Ver historial
          </Link>
        </article>
      ))}
    </div>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50";
