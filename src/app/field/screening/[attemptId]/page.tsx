import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldScreeningAttemptScreen } from "@/modules/field/service";
import { ScreeningQuestionForm } from "../../_components/FieldComponents";

export const dynamic = "force-dynamic";

type ScreeningAttemptPageProps = {
  params: Promise<{
    attemptId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    question?: string;
  }>;
};

export default async function ScreeningAttemptPage({ params, searchParams }: ScreeningAttemptPageProps) {
  const { attemptId } = await params;
  const resolvedSearchParams = await searchParams;
  const actor = await requireCapability("screening:apply");
  const result = await getFieldScreeningAttemptScreen({
    actor,
    attemptId,
    questionId: resolvedSearchParams?.question,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    if (result.code === "ATTEMPT_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  const screen = result.data;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status="ready">{`Versión ${screen.attempt.questionnaireVersion.versionNumber}`}</StatusBadge>}
        description={`Participante: ${screen.attempt.studyParticipant.participantProfile.name}`}
        eyebrow="Aplicación de screener"
        title={screen.attempt.questionnaireVersion.study.name}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link className="text-sm font-semibold text-teal-700 transition hover:text-teal-800" href="/field">
          Volver a Campo
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950"
          href={`/field/screening/${attemptId}/result`}
        >
          Ver resultado
        </Link>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-100" aria-label="Progreso del filtro">
        <div
          className="h-full rounded-full bg-teal-600"
          style={{
            width:
              screen.progress.totalVisibleQuestions > 0
                ? `${Math.round((screen.progress.answeredVisibleQuestions / screen.progress.totalVisibleQuestions) * 100)}%`
                : "0%"
          }}
        />
      </div>

      <ScreeningQuestionForm error={resolvedSearchParams?.error} screen={screen} />
    </AppShell>
  );
}
