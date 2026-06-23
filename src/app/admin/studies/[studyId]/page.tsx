import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { STUDY_STATUS_LABELS, UI_LABELS } from "@/shared/ui/labels";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { createComparativeConfigurationRepository } from "@/modules/comparative-rotation/admin-repository";
import {
  buildComparativeChecklist,
  getComparativeConfigurationForAdmin
} from "@/modules/comparative-rotation/admin-service";
import { ArmSection } from "./_components/ArmSection";
import { ConfigurationChecklist } from "./_components/ConfigurationChecklist";
import { ConfigurationSummary } from "./_components/ConfigurationSummary";
import { ProductSection } from "./_components/ProductSection";
import { RotationSection } from "./_components/RotationSection";
import { SafePreviewSection } from "./_components/SafePreviewSection";

export const dynamic = "force-dynamic";

type StudyConfigurationPageProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export default async function StudyConfigurationPage({ params }: StudyConfigurationPageProps) {
  const { studyId } = await params;
  const admin = await requireCapability("admin:access");
  const result = await getComparativeConfigurationForAdmin({
    actor: admin,
    repository: createComparativeConfigurationRepository(),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_FOUND") {
      notFound();
    }

    throw new Error(result.message);
  }

  const config = result.data;
  const checklist = buildComparativeChecklist(config);
  const readOnly = config.study.status !== "DRAFT";

  return (
    <AppShell>
      <PageHeader
        actions={
          <StatusBadge status={readOnly ? "planned" : "ready"}>
            {readOnly ? UI_LABELS.common.readOnly : STUDY_STATUS_LABELS.DRAFT}
          </StatusBadge>
        }
        description="Configura productos, brazos y códigos de rotación manuales. No incluye participantes, filtros, cuotas, cuestionarios ni exportaciones."
        eyebrow="Configuración comparativa"
        title="Productos, brazos y rotaciones"
      />

      <div className="mb-6">
        <div className="flex flex-wrap gap-3">
          <Link
            className="text-sm font-semibold text-teal-700 transition hover:text-teal-800"
            href="/admin"
          >
            {UI_LABELS.actions.backToStudies}
          </Link>
          <Link
            className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950"
            href={`/admin/studies/${studyId}/screener`}
          >
            {UI_LABELS.screener.screener}
          </Link>
        </div>
      </div>

      <div className="space-y-8">
        <ConfigurationSummary config={config} readOnly={readOnly} />
        <ConfigurationChecklist checklist={checklist} />
        <ProductSection products={config.products} readOnly={readOnly} studyId={studyId} />
        <ArmSection arms={config.arms} readOnly={readOnly} studyId={studyId} />
        <RotationSection
          arms={config.arms}
          checklist={checklist}
          products={config.products}
          readOnly={readOnly}
          rotationPlans={config.rotationPlans}
          studyId={studyId}
        />
        <SafePreviewSection rotationPlans={config.rotationPlans} />
      </div>
    </AppShell>
  );
}
