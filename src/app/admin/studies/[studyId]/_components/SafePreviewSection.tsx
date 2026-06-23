import type { ComparativeRotationPlan } from "@/modules/comparative-rotation/admin-repository";
import {
  projectFieldSafeRotationPlan,
  projectParticipantRotationPlan
} from "@/modules/comparative-rotation/admin-service";
import { UI_LABELS } from "@/shared/ui/labels";

type SafePreviewSectionProps = {
  rotationPlans: ComparativeRotationPlan[];
};

export function SafePreviewSection({ rotationPlans }: SafePreviewSectionProps) {
  const activePlan = rotationPlans.find((plan) => plan.status === "ACTIVE") ?? null;
  const fieldProjection = activePlan ? projectFieldSafeRotationPlan(activePlan) : null;
  const participantProjection = activePlan ? projectParticipantRotationPlan(activePlan) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {UI_LABELS.comparative.fieldSafeView}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">{UI_LABELS.areas.field}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {UI_LABELS.comparative.fieldSafeViewHelp}
        </p>
        {fieldProjection ? (
          <div className="mt-4 space-y-3">
            <p className="break-all font-mono text-sm font-semibold text-zinc-950">
              {fieldProjection.rotationCode}
            </p>
            {fieldProjection.arms.map((arm) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={arm.armCode}>
                <p className="font-semibold text-zinc-900">{arm.armLabel}</p>
                <p className="mt-1 text-zinc-600">{UI_LABELS.comparative.order}: {arm.applicationOrder}</p>
                <p className="mt-1 break-all font-mono text-zinc-900">{arm.internalCode}</p>
                <p className="mt-1 break-words text-zinc-700">{arm.displayLabel}</p>
                <p className="mt-1 text-zinc-700">{arm.participantVisibleLabel}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
            {UI_LABELS.comparative.createActiveRotationHelp}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {UI_LABELS.comparative.futureParticipantView}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">{UI_LABELS.areas.participant}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {UI_LABELS.comparative.participantLabelsHelp}
        </p>
        {participantProjection ? (
          <ol className="mt-4 space-y-3">
            {participantProjection.labels.map((label) => (
              <li className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900" key={label}>
                {label}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
            {UI_LABELS.comparative.createParticipantLabelsHelp}
          </p>
        )}
      </section>
    </div>
  );
}
