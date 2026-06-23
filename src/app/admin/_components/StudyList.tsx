import Link from "next/link";
import type { StudyListItem } from "@/modules/studies/repository";
import { STUDY_STATUS_LABELS, UI_LABELS } from "@/shared/ui/labels";
import { StudyEmptyState } from "./StudyEmptyState";
import { StudyEditForm } from "./StudyEditForm";

type StudyListProps = {
  studies: StudyListItem[];
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function StudyStatusBadge({ status }: { status: StudyListItem["status"] }) {
  const tone =
    status === "DRAFT"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {STUDY_STATUS_LABELS[status]}
    </span>
  );
}

export function StudyList({ studies }: StudyListProps) {
  if (studies.length === 0) {
    return <StudyEmptyState />;
  }

  return (
    <section className="space-y-4" aria-label="Lista de estudios">
      {studies.map((study) => (
        <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={study.id}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 break-words text-xl font-semibold text-zinc-950">
                  {study.name}
                </h2>
                <StudyStatusBadge status={study.status} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div className="min-w-0">
                  <dt className="font-medium text-zinc-500">{UI_LABELS.studies.code}</dt>
                  <dd className="mt-1 break-all font-mono font-semibold text-zinc-900">
                    {study.code}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-medium text-zinc-500">{UI_LABELS.studies.timeZone}</dt>
                  <dd className="mt-1 break-words text-zinc-900">{study.timeZoneIana}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">{UI_LABELS.common.created}</dt>
                  <dd className="mt-1 text-zinc-900">{formatDate(study.createdAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">{UI_LABELS.common.updated}</dt>
                  <dd className="mt-1 text-zinc-900">{formatDate(study.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">{UI_LABELS.common.editing}</dt>
                  <dd className="mt-1 text-zinc-900">
                    {study.status === "DRAFT" ? UI_LABELS.common.available : UI_LABELS.common.readOnly}
                  </dd>
                </div>
              </dl>
            </div>
            <Link
              className="inline-flex w-fit shrink-0 rounded-md border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              href={`/admin/studies/${study.id}`}
            >
              {UI_LABELS.actions.configure}
            </Link>
          </div>

          {study.status === "DRAFT" ? (
            <StudyEditForm study={study} />
          ) : (
            <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              {UI_LABELS.studies.readOnlyMessage}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
