import type { ComparativeChecklist } from "@/modules/comparative-rotation/admin-service";
import { UI_LABELS } from "@/shared/ui/labels";

type ConfigurationChecklistProps = {
  checklist: ComparativeChecklist;
};

export function ConfigurationChecklist({ checklist }: ConfigurationChecklistProps) {
  if (!checklist.requiresComparativeConfiguration) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Checklist de configuración
        </p>
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Estudio solo filtro</p>
          <p className="mt-2 text-sm text-emerald-800">
            Productos, brazos canónicos, rotaciones manuales y códigos de brazos no aplican para
            este estudio.
          </p>
        </div>
      </section>
    );
  }

  const items = [
    {
      label: UI_LABELS.comparative.productsCreated,
      value: `${checklist.productsCount}/2 o más`,
      ready: checklist.productsCount >= 2
    },
    {
      label: UI_LABELS.comparative.armsConfigured,
      value: `${checklist.armsCount}/2`,
      ready: checklist.armsCount === 2
    },
    {
      label: UI_LABELS.comparative.activeManualRotations,
      value: String(checklist.activeRotationCount),
      ready: checklist.activeRotationCount > 0
    }
  ];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
        Checklist de configuración
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4" key={item.label}>
            <p className="text-sm font-medium text-zinc-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{item.value}</p>
            <p className={item.ready ? "mt-2 text-sm text-emerald-700" : "mt-2 text-sm text-amber-700"}>
              {item.ready ? "Listo" : UI_LABELS.common.pending}
            </p>
          </div>
        ))}
      </div>
      {checklist.rotationBlockReason ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {checklist.rotationBlockReason}
        </p>
      ) : null}
    </section>
  );
}
