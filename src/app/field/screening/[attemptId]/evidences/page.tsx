import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFieldActorForRequest } from "@/modules/field/auth";
import { createFieldRepository } from "@/modules/field/repository";
import { getFieldEvidenceScreen, isPublicFieldActor } from "@/modules/field/service";
import { AppShell } from "@/shared/ui/AppShell";
import { PageHeader } from "@/shared/ui/PageHeader";
import { FieldPerfumeEvidenceStep } from "./FieldPerfumeEvidenceStep";

export const dynamic = "force-dynamic";

type FieldEvidencePageProps = {
  params: Promise<{
    attemptId: string;
  }>;
};

export default async function FieldEvidencePage({ params }: FieldEvidencePageProps) {
  const { attemptId } = await params;
  const actor = await getFieldActorForRequest();
  const result = await getFieldEvidenceScreen({
    actor,
    attemptId,
    repository: createFieldRepository()
  });

  if (!result.ok) {
    if (result.code === "ATTEMPT_NOT_FOUND") {
      notFound();
    }

    if (result.code === "EVIDENCE_NOT_REQUIRED") {
      redirect(`/field/screening/${attemptId}/result`);
    }

    const fallback = <FieldEvidenceMessage attemptId={attemptId} title={result.message} />;
    if (isPublicFieldActor(actor)) {
      return <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">{fallback}</main>;
    }

    return <AppShell>{fallback}</AppShell>;
  }

  if (result.data.counts.selfie < 1) {
    redirect(`/field/screening/${attemptId}/selfie`);
  }

  const content = (
    <>
      <PageHeader
        description="Agrega fotos de las marcas de perfumes que usas para completar la evidencia del filtro."
        eyebrow="Campo"
        title={result.data.study.name}
      />

      <FieldPerfumeEvidenceStep screen={result.data} />
    </>
  );

  if (isPublicFieldActor(actor)) {
    return <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">{content}</main>;
  }

  return <AppShell>{content}</AppShell>;
}

function FieldEvidenceMessage({ attemptId, title }: { attemptId: string; title: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Campo</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        <Link className={primaryButtonClass} href={`/field/screening/${attemptId}/result`}>
          Ver resultado
        </Link>
      </section>
    </main>
  );
}

const primaryButtonClass =
  "mt-5 inline-flex w-fit justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800";
