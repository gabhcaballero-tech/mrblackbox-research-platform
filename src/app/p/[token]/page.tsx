import { notFound } from "next/navigation";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { participantTokenSchema } from "@/shared/validation/participant";

type ParticipantPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ParticipantPage({ params }: ParticipantPageProps) {
  const { token } = await params;
  const parsedToken = participantTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Acceso por enlace"
        title="Participante"
        description="Placeholder para la experiencia futura de participantes. No hay cuestionarios, videos ni autenticacion real en esta etapa."
        actions={<StatusBadge status="planned">Enlace reconocido</StatusBadge>}
      />

      <EmptyState
        title="Sesion de participante pendiente"
        description="El token tiene formato valido para la maqueta, pero aun no activa sesiones ni captura informacion."
      />
    </AppShell>
  );
}
