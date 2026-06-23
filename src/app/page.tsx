import Link from "next/link";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { APP_ROUTES } from "@/shared/types/routes";
import { UI_LABELS } from "@/shared/ui/labels";

const areaCards = [
  {
    title: UI_LABELS.areas.admin,
    href: APP_ROUTES.admin,
    status: "ready",
    description:
      "Espacio reservado para configurar estudios, revisar actividad y preparar operaciones futuras."
  },
  {
    title: `${UI_LABELS.areas.field} / encuestadores`,
    href: APP_ROUTES.field,
    status: "ready",
    description:
      "Entrada inicial para equipos de campo, seguimiento operativo y trabajo presencial futuro."
  },
  {
    title: UI_LABELS.areas.participant,
    href: APP_ROUTES.participantExample,
    status: "ready",
    description:
      "Pantalla base para accesos por enlace, sin cuestionarios ni sesiones activas todavía."
  }
] as const;

export default function HomePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Base técnica"
        title="MR Black Box Plataforma de investigación"
        description="Maqueta funcional mínima para separar las tres áreas principales antes de agregar datos, autenticación o lógica de estudios."
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
            <span className="mt-6 text-sm font-medium text-teal-700">Abrir área</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
