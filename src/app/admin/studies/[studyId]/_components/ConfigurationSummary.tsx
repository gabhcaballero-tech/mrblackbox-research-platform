import type { ComparativeStudyConfig } from "@/modules/comparative-rotation/admin-repository";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { STUDY_STATUS_LABELS, UI_LABELS } from "@/shared/ui/labels";

type ConfigurationSummaryProps = {
  config: ComparativeStudyConfig;
  readOnly: boolean;
};

export function ConfigurationSummary({ config, readOnly }: ConfigurationSummaryProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            Resumen del estudio
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold text-zinc-950">
            {config.study.name}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <dt className="font-medium text-zinc-500">{UI_LABELS.studies.code}</dt>
              <dd className="mt-1 break-all font-mono font-semibold text-zinc-900">
                {config.study.code}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">{UI_LABELS.common.status}</dt>
              <dd className="mt-1 text-zinc-900">{STUDY_STATUS_LABELS[config.study.status]}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">{UI_LABELS.studies.timeZone}</dt>
              <dd className="mt-1 break-words text-zinc-900">{config.study.timeZoneIana}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">{UI_LABELS.common.mode}</dt>
              <dd className="mt-1 text-zinc-900">
                {readOnly ? UI_LABELS.common.readOnly : UI_LABELS.common.editable}
              </dd>
            </div>
          </dl>
        </div>
        <StatusBadge status={readOnly ? "planned" : "ready"}>
          {readOnly ? UI_LABELS.common.readOnly : `${STUDY_STATUS_LABELS.DRAFT} ${UI_LABELS.common.editable}`}
        </StatusBadge>
      </div>
    </section>
  );
}
