import { EmptyState } from "@/shared/ui/EmptyState";
import { UI_LABELS } from "@/shared/ui/labels";

export function StudyEmptyState() {
  return (
    <EmptyState
      action={
        <a
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          href="#create-study"
        >
          {UI_LABELS.actions.createStudy}
        </a>
      }
      description="Todavía no hay estudios registrados. Crea el primer borrador para iniciar la configuración general."
      title={UI_LABELS.studies.noStudies}
    />
  );
}
