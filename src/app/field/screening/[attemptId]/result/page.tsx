import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
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
  const actor = await requireCapability("screening:apply");
  const result = await getFieldScreeningAttemptScreen({
    actor,
    attemptId,
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
        actions={<StatusBadge status="ready">{fieldAttemptStatusLabel(screen.attempt.status)}</StatusBadge>}
        description={`Participante: ${screen.attempt.studyParticipant.participantProfile.name}`}
        eyebrow="Campo"
        title={screen.attempt.questionnaireVersion.study.name}
      />

      <ScreeningResultCard screen={screen} />
    </AppShell>
  );
}
