import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createFieldRepository } from "@/modules/field/repository";
import { listFieldStudies } from "@/modules/field/service";
import { FieldStudyCard } from "./_components/FieldComponents";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const actor = await requireCapability("field:access");
  const result = await listFieldStudies({
    actor,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">Screeners publicados</StatusBadge>}
        description="Selecciona un estudio activo para aplicar su cuestionario de filtro publicado."
        eyebrow="Campo"
        title="Aplicación de filtros"
      />

      {result.data.length === 0 ? (
        <EmptyState
          title="No hay estudios activos con screener publicado disponibles para campo."
          description="Activa un estudio con screener publicado desde Administración para habilitarlo aquí."
        />
      ) : (
        <div className="space-y-4">
          {result.data.map((study) => (
            <FieldStudyCard key={study.id} study={study} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
