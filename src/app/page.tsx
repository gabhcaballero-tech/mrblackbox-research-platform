import Link from "next/link";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { APP_ROUTES } from "@/shared/types/routes";

const areaCards = [
  {
    title: "Administracion",
    href: APP_ROUTES.admin,
    status: "ready",
    description:
      "Espacio reservado para configurar estudios, revisar actividad y preparar operaciones futuras."
  },
  {
    title: "Campo / encuestadores",
    href: APP_ROUTES.field,
    status: "ready",
    description:
      "Entrada inicial para equipos de campo, seguimiento operativo y trabajo presencial futuro."
  },
  {
    title: "Participante",
    href: APP_ROUTES.participantExample,
    status: "ready",
    description:
      "Vista placeholder para accesos por enlace, sin cuestionarios ni sesiones activas todavia."
  }
] as const;

export default function HomePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Base tecnica"
        title="MR Black Box Research Platform"
        description="Maqueta funcional minima para separar las tres areas principales antes de agregar datos, autenticacion o logica de estudios."
      />

      <section className="grid gap-4 md:grid-cols-3">
        {areaCards.map((area) => (
          <Link
            className="flex min-h-56 flex-col justify-between rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            href={area.href}
            key={area.title}
          >
            <div className="space-y-4">
              <StatusBadge status={area.status}>Preparado</StatusBadge>
              <div>
                <h2 className="text-xl font-semibold text-zinc-950">{area.title}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{area.description}</p>
              </div>
            </div>
            <span className="mt-6 text-sm font-medium text-teal-700">Abrir area</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
