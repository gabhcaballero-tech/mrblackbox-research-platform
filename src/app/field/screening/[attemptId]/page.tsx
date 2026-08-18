import { getFieldActorForRequest } from "@/modules/field/auth";
import { isPublicFieldActor } from "@/modules/field/service";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { V1ScreeningBlockedNotice } from "../../_components/V1ScreeningBlockedNotice";

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
  await params;
  await searchParams;
  const actor = await getFieldActorForRequest();

  const content = (
    <>
      <PageHeader
        actions={<StatusBadge status="planned">Cerrado en V1</StatusBadge>}
        description="Este filtro ya no admite captura desde V1."
        eyebrow="Aplicación de screener"
        title="Filtro migrado a V2"
      />

      <V1ScreeningBlockedNotice showFieldLinks={!isPublicFieldActor(actor)} />
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{content}</main>;
  }

  return <AppShell>{content}</AppShell>;
}
