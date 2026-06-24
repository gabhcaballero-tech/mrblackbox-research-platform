import Link from "next/link";
import type { ReactNode } from "react";
import { getParticipantPortalAuth } from "@/shared/auth/participant-portal";
import { createParticipantPortalEvidenceRepository } from "@/modules/participant-portal/evidence-repository";
import { getParticipantPortalEvidenceScreen } from "@/modules/participant-portal/evidence-service";
import { createParticipantPortalRepository } from "@/modules/participant-portal/repository";
import { participantPortalStudyCodeSchema } from "@/modules/participant-portal/validation";
import { EvidenceUploadClient } from "./EvidenceUploadClient";

type ParticipantEvidencePageProps = {
  params: Promise<{ studyCode: string }>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantEvidencePage({ params }: ParticipantEvidencePageProps) {
  const { studyCode: rawStudyCode } = await params;
  const parsedStudyCode = participantPortalStudyCodeSchema.safeParse(rawStudyCode);

  if (!parsedStudyCode.success) {
    return <PortalMessage title="El portal de participacion no esta disponible en este momento." />;
  }

  const studyCode = parsedStudyCode.data;
  const auth = await getParticipantPortalAuth({ repository: createParticipantPortalRepository(), studyCode });

  if (auth.status === "no_session") {
    return <PortalMessage title="Inicia sesion con el codigo enviado a tu correo para continuar." />;
  }

  if (auth.status === "internal_user_blocked") {
    return <PortalMessage title={auth.message} />;
  }

  const result = await getParticipantPortalEvidenceScreen({
    identity: auth.identity,
    repository: createParticipantPortalEvidenceRepository(),
    studyCode
  });

  if (!result.ok) {
    return (
      <PortalMessage
        action={
          result.code === "ATTEMPT_NOT_READY" ? (
            <Link className={primaryButtonClass} href={`/participar/${studyCode}/resultado`}>
              Ver resultado
            </Link>
          ) : undefined
        }
        title={result.message}
      />
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-10">
      <section className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participacion</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{result.data.study.name}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Esta pantalla queda como resumen y recuperacion de evidencias. Normalmente la selfie se captura al inicio y las fotos de perfumes durante F6.
          </p>
        </div>

        <EvidenceUploadClient screen={result.data} />
      </section>
    </main>
  );
}

function PortalMessage({
  action,
  title
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Portal de participacion</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        {action ? <div className="mt-5">{action}</div> : null}
      </section>
    </main>
  );
}

const primaryButtonClass =
  "inline-flex w-fit justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
