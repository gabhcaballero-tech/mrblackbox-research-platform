import type { ComparativeRotationPlan } from "@/modules/comparative-rotation/admin-repository";
import {
  projectFieldSafeRotationPlan,
  projectParticipantRotationPlan
} from "@/modules/comparative-rotation/admin-service";

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
          Vista segura futura
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Campo</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Previsualiza datos permitidos para campo. No incluye nombre real.
        </p>
        {fieldProjection ? (
          <div className="mt-4 space-y-3">
            <p className="break-all font-mono text-sm font-semibold text-zinc-950">
              {fieldProjection.rotationCode}
            </p>
            {fieldProjection.arms.map((arm) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={arm.armCode}>
                <p className="font-semibold text-zinc-900">{arm.armLabel}</p>
                <p className="mt-1 text-zinc-600">Orden: {arm.applicationOrder}</p>
                <p className="mt-1 break-all font-mono text-zinc-900">{arm.internalCode}</p>
                <p className="mt-1 break-words text-zinc-700">{arm.displayLabel}</p>
                <p className="mt-1 text-zinc-700">{arm.participantVisibleLabel}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
            Crea una rotacion activa para ver la vista segura futura.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Vista minima futura
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">Participante</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          El participante solo debe ver las etiquetas por orden de aplicacion.
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
            Crea una rotacion activa para ver etiquetas de participante.
          </p>
        )}
      </section>
    </div>
  );
}
