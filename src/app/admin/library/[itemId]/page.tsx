import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { LIBRARY_REVISION_STATUS_LABELS, ROLE_LABELS, UI_LABELS } from "@/shared/ui/labels";
import { createQuestionLibraryRepository } from "@/modules/question-library/repository";
import {
  getLibraryItemForAdmin,
  type LibraryItemProjection,
  type LibraryRevisionProjection
} from "@/modules/question-library/service";
import { retireLibraryRevisionAction } from "@/modules/question-library/actions";
import {
  CopyHashButton,
  LibraryItemMetadataForm,
  LibraryRevisionEditor
} from "./_components/LibraryItemForms";

export const dynamic = "force-dynamic";

type LibraryItemPageProps = {
  params: Promise<{
    itemId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function LibraryItemPage({ params, searchParams }: LibraryItemPageProps) {
  const { itemId } = await params;
  const query = (await searchParams) ?? {};
  const admin = await requireCapability("admin:access");
  const result = await getLibraryItemForAdmin({
    actor: admin,
    itemId,
    repository: createQuestionLibraryRepository()
  });

  if (!result.ok) {
    if (result.code === "ITEM_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  const item = result.data;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">{`Solo ${ROLE_LABELS.ADMIN}`}</StatusBadge>}
        description={item.description ?? UI_LABELS.library.libraryHelp}
        eyebrow={UI_LABELS.library.library}
        title={item.name}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-800" href="/admin/library">
          Volver a biblioteca
        </Link>
      </div>

      {query.saved === "library" ? (
        <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Elemento guardado correctamente en la biblioteca.
        </div>
      ) : null}

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-500">{UI_LABELS.library.type}</dt>
            <dd className="mt-1 text-zinc-900">
              {item.type === "QUESTION" ? UI_LABELS.library.question : UI_LABELS.library.block}
            </dd>
          </div>
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
          <div>
            <dt className="font-medium text-zinc-500">{UI_LABELS.library.tags}</dt>
            <dd className="mt-1 text-zinc-900">{item.tags.length > 0 ? item.tags.join(", ") : UI_LABELS.common.doesNotApply}</dd>
          </div>
        </dl>
      </section>

      <LibraryItemMetadataForm item={item} />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">{UI_LABELS.library.revisions}</h2>
        <div className="mt-4 space-y-4">
          {item.revisions.map((revision) => (
            <RevisionCard item={item} key={revision.id} revision={revision} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function RevisionCard({
  item,
  revision
}: {
  item: LibraryItemProjection & { revisions: LibraryRevisionProjection[] };
  revision: LibraryRevisionProjection;
}) {
  const isActive = revision.status === "ACTIVE";

  return (
    <article className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold text-zinc-950">
            {UI_LABELS.library.revision} {revision.revisionNumber}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Estado: {LIBRARY_REVISION_STATUS_LABELS[revision.status]} · Creada el{" "}
            {dateFormatter.format(revision.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span>Hash:</span>
            <span className="break-all font-mono text-xs">{revision.contentHash ?? "pendiente"}</span>
            <CopyHashButton hash={revision.contentHash} />
          </div>
          <p className="mt-2 text-sm text-zinc-700">{summarizeRevision(revision)}</p>
        </div>
        {isActive ? (
          <form action={retireLibraryRevisionAction.bind(null, item.id, revision.id)}>
            <button className={secondaryButtonClass} type="submit">
              {UI_LABELS.actions.retireRevision}
            </button>
          </form>
        ) : null}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
          {UI_LABELS.library.preview}
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-50">
          {JSON.stringify(revision.content, null, 2)}
        </pre>
      </details>
      {isActive ? <LibraryRevisionEditor item={item} revision={revision} /> : null}
    </article>
  );
}
function summarizeRevision(revision: LibraryRevisionProjection): string {
  if (revision.content.kind === "QUESTION") {
    return `Pregunta: ${revision.content.question.text}`;
  }

  return `Bloque: ${revision.content.questions.length} preguntas, ${revision.content.rules.length} reglas${
    revision.content.nse ? ", incluye NSE" : ""
  }.`;
}

const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50";

