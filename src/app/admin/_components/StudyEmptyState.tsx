import { EmptyState } from "@/shared/ui/EmptyState";

export function StudyEmptyState() {
  return (
    <EmptyState
      action={
        <a
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          href="#create-study"
        >
          Crear estudio
        </a>
      }
      description="Todavia no hay estudios registrados. Crea el primer borrador para iniciar la configuracion general."
      title="No hay estudios"
    />
  );
}
