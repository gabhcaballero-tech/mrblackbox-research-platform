import { notFound } from "next/navigation";
import type React from "react";
import { getFieldActorForRequest } from "@/modules/field/auth";
import {
  getFieldScreeningReviewReadiness,
  isPublicFieldActor,
  type FieldAttemptScreen
} from "@/modules/field/service";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldScreeningAttemptScreen } from "@/modules/field/service";
import { fieldAttemptStatusLabel } from "@/modules/field/status-labels";
import { V1_FIELD_SCREENING_BLOCK_MESSAGE } from "@/modules/field/v1-screening-block";
import { ScreeningResultCard } from "../../../_components/FieldComponents";

export const dynamic = "force-dynamic";

type ScreeningResultPageProps = {
  params: Promise<{
    attemptId: string;
  }>;
};

export default async function ScreeningResultPage({ params }: ScreeningResultPageProps) {
  const { attemptId } = await params;
  const actor = await getFieldActorForRequest();
  const repository = createFieldRepository();
  const readiness = await getFieldScreeningReviewReadiness({
    actor,
    attemptId,
    repository
  });

  logFieldResultReadiness(attemptId, readiness);

  if (!readiness.attemptExists || readiness.blockingReason === "attempt_not_available_for_actor") {
    notFound();
  }

  if (readiness.nextStep === "PERFUME_PHOTOS") {
    return renderFieldResultContent({
      actor,
      content: <FieldPendingPerfumePhotosCard />,
      readiness
    });
  }

  if (readiness.nextStep === "SELFIE") {
    return renderFieldResultContent({
      actor,
      content: <FieldPendingSelfieCard />,
      readiness
    });
  }

  if (readiness.nextStep === "PENDING_REVIEW") {
    return renderFieldResultContent({
      actor,
      content: <FieldPendingReviewCard />,
      readiness
    });
  }

  if (readiness.nextStep === "ERROR") {
    return renderFieldResultContent({
      actor,
      content: <FieldResultMessage title="El cuestionario no está disponible." />,
      readiness
    });
  }

  const result = await getFieldScreeningAttemptScreen({
    actor,
    attemptId,
    repository
  });

  if (!result.ok) {
    if (result.code === "ATTEMPT_NOT_FOUND") {
      notFound();
    }

    return renderFieldResultContent({
      actor,
      content: <FieldResultMessage title={result.message} />,
      readiness
    });
  }

  return renderFieldResultContent({
    actor,
    content: <ScreeningResultCard screen={result.data} />,
    readiness,
    screen: result.data
  });
}

function renderFieldResultContent({
  actor,
  content,
  readiness,
  screen
}: {
  actor: Awaited<ReturnType<typeof getFieldActorForRequest>>;
  content: React.ReactNode;
  readiness: Awaited<ReturnType<typeof getFieldScreeningReviewReadiness>>;
  screen?: FieldAttemptScreen;
}) {
  const title = screen?.attempt.questionnaireVersion.study.name ?? "Resultado del filtro";
  const participantName = screen?.attempt.studyParticipant.participantProfile.name;
  const description = participantName ? `Participante: ${participantName}` : "Participante registrado";

  const pageContent = (
    <>
      <PageHeader
        actions={<StatusBadge status="ready">{fieldAttemptStatusLabel(readiness.status ?? "STARTED")}</StatusBadge>}
        description={description}
        eyebrow="Campo"
        title={title}
      />

      {content}
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{pageContent}</main>;
  }

  return <AppShell>{pageContent}</AppShell>;
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

function FieldPendingSelfieCard() {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Campo V1 cerrado</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Registro migrado a V2</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        {V1_FIELD_SCREENING_BLOCK_MESSAGE}
      </p>
    </section>
  );
}

function FieldPendingPerfumePhotosCard() {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Campo V1 cerrado</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">Registro migrado a V2</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        {V1_FIELD_SCREENING_BLOCK_MESSAGE}
      </p>
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

function logFieldResultReadiness(
  attemptId: string,
  readiness: Awaited<ReturnType<typeof getFieldScreeningReviewReadiness>>
) {
  console.info("[FIELD_SELFIE_REVIEW_FLOW]", {
    attemptExists: readiness.attemptExists,
    attemptId,
    blockingReason: readiness.blockingReason,
    fieldUserId: readiness.fieldUserId,
    hasConfirmation: readiness.hasConfirmation,
    hasPendingReview: readiness.hasPendingReview,
    hasRequiredPerfumePhotos: readiness.hasRequiredPerfumePhotos,
    hasStudyParticipant: readiness.hasStudyParticipant,
    isPublicFieldAttempt: readiness.isPublicFieldAttempt,
    nextStep: readiness.nextStep,
    perfumePhotoCount: readiness.perfumePhotoCount,
    perfumePhotoRelatedQuestionIds: readiness.perfumePhotoRelatedQuestionIds,
    redirectTo: `/field/screening/${attemptId}/result`,
    reviewStatus: readiness.reviewStatus,
    selfieCount: readiness.selfieCount,
    source: readiness.source,
    status: readiness.status,
    step: "result_page_readiness",
    studyParticipantId: readiness.studyParticipantId
  });
}
