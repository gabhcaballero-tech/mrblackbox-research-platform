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
import { createParticipantPortalAdminRepository } from "@/modules/participant-portal/admin-repository";
import { getParticipantPortalConfigForAdmin } from "@/modules/participant-portal/admin-service";
import { createScreenerRepository } from "@/modules/screener/repository";
import { getScreenerBuilderForAdmin } from "@/modules/screener/service";
import { createStudiesRepository } from "@/modules/studies/repository";
import { getStudyRiskForAdmin } from "@/modules/studies/service";
import { getStudyBehavior } from "@/modules/study-templates/study-behavior";
import { ActivateStudyPanel } from "./_components/ActivateStudyPanel";
import { ArmSection } from "./_components/ArmSection";
import { ConfigurationChecklist } from "./_components/ConfigurationChecklist";
import { ConfigurationSummary } from "./_components/ConfigurationSummary";
import { ParticipantPortalSection } from "./_components/ParticipantPortalSection";
import { ProductSection } from "./_components/ProductSection";
import { RotationSection } from "./_components/RotationSection";
import { SafePreviewSection } from "./_components/SafePreviewSection";
import { StudyDangerZone } from "./_components/StudyDangerZone";

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
  const screenerResult = await getScreenerBuilderForAdmin({
    actor: admin,
    repository: createScreenerRepository(),
    studyId
  });
  const participantPortalResult = await getParticipantPortalConfigForAdmin({
    actor: admin,
    repository: createParticipantPortalAdminRepository(),
    studyId
  });
  const studyRiskResult = await getStudyRiskForAdmin({
    actor: admin,
    repository: createStudiesRepository(),
    studyId
  });

  if (!participantPortalResult.ok) {
    throw new Error(participantPortalResult.message);
  }
  if (!studyRiskResult.ok) {
    throw new Error(studyRiskResult.message);
  }

  const checklist = buildComparativeChecklist(config);
  const behavior = getStudyBehavior(config.study.code);
  const readOnly = config.study.status !== "DRAFT";
  const hasActiveScreener =
    screenerResult.ok && screenerResult.data.versions.some((version) => version.status === "ACTIVE");

  return (
    <AppShell>
      <PageHeader
        actions={
          <StatusBadge status={readOnly ? "planned" : "ready"}>
            {readOnly ? UI_LABELS.common.readOnly : STUDY_STATUS_LABELS.DRAFT}
          </StatusBadge>
        }
        description={
          behavior.requiresComparativeConfiguration
            ? "Configura productos, brazos y códigos de rotación manuales. No incluye participantes, filtros, cuotas, cuestionarios ni exportaciones."
            : "Administra el filtro autoaplicable del estudio. Productos, brazos y rotaciones no aplican para este flujo."
        }
        eyebrow={
          behavior.requiresComparativeConfiguration
            ? "Configuración comparativa"
            : "Configuración solo filtro"
        }
        title={
          behavior.requiresComparativeConfiguration
            ? "Productos, brazos y rotaciones"
            : "Filtro autoaplicable"
        }
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
          <Link
            className="text-sm font-semibold text-zinc-700 transition hover:text-zinc-950"
            href={`/admin/studies/${studyId}/screening-attempts`}
          >
            Ver intentos de screener
          </Link>
        </div>
      </div>

      <div className="space-y-8">
        <ConfigurationSummary config={config} readOnly={readOnly} />
        <ActivateStudyPanel canActivate={!readOnly && hasActiveScreener} studyId={studyId} />
        <ConfigurationChecklist checklist={checklist} />
        <ParticipantPortalSection data={participantPortalResult.data} studyId={studyId} />
        {behavior.requiresComparativeConfiguration ? (
          <>
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
          </>
        ) : null}
        <StudyDangerZone risk={studyRiskResult.data} />
      </div>
    </AppShell>
  );
}
