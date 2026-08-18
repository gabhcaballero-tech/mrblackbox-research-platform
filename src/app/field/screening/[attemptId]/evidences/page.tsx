import { getFieldActorForRequest } from "@/modules/field/auth";
import { isPublicFieldActor } from "@/modules/field/service";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { V1ScreeningBlockedNotice } from "../../../_components/V1ScreeningBlockedNotice";

export const dynamic = "force-dynamic";

type FieldEvidencePageProps = {
  params: Promise<{
    attemptId: string;
  }>;
};

export default async function FieldEvidencePage({ params }: FieldEvidencePageProps) {
  await params;
  const actor = await getFieldActorForRequest();

  const content = (
    <>
      <PageHeader
        actions={<StatusBadge status="planned">Cerrado en V1</StatusBadge>}
        description="La captura de evidencias del filtro ya no está disponible en V1."
        eyebrow="Campo"
        title="Filtro migrado a V2"
      />

      <V1ScreeningBlockedNotice showFieldLinks={!isPublicFieldActor(actor)} />
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">{content}</main>;
  }

  return <AppShell>{content}</AppShell>;
}
