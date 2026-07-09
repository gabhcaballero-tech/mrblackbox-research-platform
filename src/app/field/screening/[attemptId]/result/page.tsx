import { notFound } from "next/navigation";
import Link from "next/link";
import { getFieldActorForRequest } from "@/modules/field/auth";
import {
  fieldAttemptHasFinalSelfie,
  fieldAttemptHasRequiredPerfumePhotos,
  fieldAttemptRequiresFinalSelfie,
  isPublicFieldActor
} from "@/modules/field/service";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldScreeningAttemptScreen } from "@/modules/field/service";
import { fieldAttemptStatusLabel, ScreeningResultCard } from "../../../_components/FieldComponents";

export const dynamic = "force-dynamic";

type ScreeningResultPageProps = {
  params: Promise<{
    attemptId: string;
  }>;
};

export default async function ScreeningResultPage({ params }: ScreeningResultPageProps) {
  const { attemptId } = await params;
  const actor = await getFieldActorForRequest();
  const result = await getFieldScreeningAttemptScreen({
    actor,
    attemptId,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    if (result.code === "ATTEMPT_NOT_FOUND") {
      notFound();
    }

    const fallback = <FieldResultMessage title={result.message} />;

    if (isPublicFieldActor(actor)) {
      return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{fallback}</main>;
    }

    return <AppShell>{fallback}</AppShell>;
  }

  const screen = result.data;
  const needsSelfie = fieldAttemptRequiresFinalSelfie(screen.attempt) && !fieldAttemptHasFinalSelfie(screen.attempt);
  const needsPerfumePhotos =
    fieldAttemptRequiresFinalSelfie(screen.attempt) &&
    fieldAttemptHasFinalSelfie(screen.attempt) &&
    !fieldAttemptHasRequiredPerfumePhotos(screen.attempt);
  const pendingReview = screen.attempt.participantScreeningReview?.status === "PENDING";

  const content = (
    <>
      <PageHeader
        actions={<StatusBadge status="ready">{fieldAttemptStatusLabel(screen.attempt.status)}</StatusBadge>}
        description={`Participante: ${screen.attempt.studyParticipant.participantProfile.name}`}
        eyebrow="Campo"
        title={screen.attempt.questionnaireVersion.study.name}
      />

      {needsSelfie ? (
        <FieldPendingSelfieCard attemptId={attemptId} />
      ) : needsPerfumePhotos ? (
        <FieldPendingPerfumePhotosCard attemptId={attemptId} />
      ) : pendingReview ? (
        <FieldPendingReviewCard />
      ) : (
        <ScreeningResultCard screen={screen} />
      )}
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{content}</main>;
  }

  return <AppShell>{content}</AppShell>;
}

function FieldResultMessage({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Resultado no disponible</p>
      <h1 className="mt-2 text-xl font-semibold text-zinc-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        Si ya completaste la selfie, espera unos segundos y vuelve a intentar abrir el resultado.
      </p>
    </section>
  );
}

function FieldPendingSelfieCard({ attemptId }: { attemptId: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Selfie pendiente</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Completa la selfie para enviar a revisión</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        El filtro ya fue registrado y la confirmación fue generada. Falta capturar la selfie final antes de cerrar este paso.
      </p>
      <Link className={primaryButtonClass} href={`/field/screening/${attemptId}/selfie`}>
        Completar selfie
      </Link>
    </section>
  );
}

function FieldPendingPerfumePhotosCard({ attemptId }: { attemptId: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Fotos pendientes</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Agrega fotos de marcas de perfumes</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        Ya registraste la selfie final. Falta agregar al menos una foto de las marcas de perfumes antes de enviar el perfil a revisión.
      </p>
      <Link className={primaryButtonClass} href={`/field/screening/${attemptId}/evidences`}>
        Agregar fotos de marcas de perfumes
      </Link>
    </section>
  );
}

function FieldPendingReviewCard() {
  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Registro recibido</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Tu perfil está en revisión.</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        Te enviaremos la confirmación después de la revisión.
      </p>
    </section>
  );
}

const primaryButtonClass =
  "mt-5 inline-flex w-fit justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
