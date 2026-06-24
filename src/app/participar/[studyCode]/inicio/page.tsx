import { getParticipantPortalAvailability, PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE } from "@/modules/participant-portal/access";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";

type ParticipantPortalHomePageProps = {
  params: Promise<{ studyCode: string }>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantPortalHomePage({ params }: ParticipantPortalHomePageProps) {
  const { studyCode: rawStudyCode } = await params;
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!parsedStudyCode.success) {
    return <PortalMessage title={PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE} />;
  }

  const repository = createParticipantPortalRepository();
  const availability = await getParticipantPortalAvailability({
    repository,
    studyCode: parsedStudyCode.data
  });

  if (!availability.ok) {
    return <PortalMessage title={PARTICIPANT_PORTAL_UNAVAILABLE_MESSAGE} />;
  }

  const auth = await getParticipantPortalAuth({ repository });

  if (auth.status === "no_session") {
    return <PortalMessage title="Inicia sesión con el código enviado a tu correo para continuar." />;
  }

  if (auth.status === "internal_user_blocked") {
    return <PortalMessage title={auth.message} />;
  }

  return (
    <PortalMessage
      eyebrow="Portal de participación"
      title="Tu correo fue verificado correctamente."
      description="Continuaremos con tu registro en el siguiente paso."
    />
  );
}

function PortalMessage({
  description,
  eyebrow = "Portal de participación",
  title
}: {
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p> : null}
      </section>
    </main>
  );
}
