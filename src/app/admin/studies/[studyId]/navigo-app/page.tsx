import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  cleanupNavigoTestRotationsAction,
  configureNavigoStudyRotationAction,
  clearNavigoParticipantRotationAction,
  deleteNavigoParticipantAction,
  deleteNavigoParticipantStagesAction,
  generateNavigoParticipantLinksForStudyAction,
  generateNavigoParticipantLinkAction,
  registerNavigoDirectParticipantAction,
  releaseNavigoAfterCtlAction,
  resetNavigoParticipantAppAction,
  reviewNavigoActivityIdentityAction,
  sendNavigoEvaluationLinkWhatsAppAction,
  updateNavigoVisualVerificationModeAction
} from "@/modules/navigo-app/actions";
import {
  previewNavigoTestRotationCleanup,
  type NavigoRotationCleanupPreview
} from "@/modules/navigo-app/rotation-cleanup";
import {
  createNavigoAppRepository,
  formatNavigoDateTimeLocal,
  isInitialNavigoEvaluation,
  navigoActivityLabel,
  resolveNavigoTimelineSequence,
  type NavigoActivityListItem,
  type NavigoParticipantListItem,
  type NavigoStudyRotationConfiguration
} from "@/modules/navigo-app";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import { appendNavigoTestModeParams, createNavigoTestModeParams } from "@/modules/navigo-app/test-mode";
import { ensureNavigoAppFoundation } from "@/modules/navigo-app/loader";
import {
  faceVerificationResultLabel,
  parseNavigoFaceVerificationNote
} from "@/modules/navigo-app/face-verification-contract";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";
import { requireCapability } from "@/shared/auth/session";
import { AppShell } from "@/shared/ui/AppShell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";
import { ParticipantLinkPanel } from "./_components/ParticipantLinkPanel";
import { NavigoEvaluationLinkResultPanel } from "./_components/NavigoEvaluationLinkResultPanel";
import { NavigoRotationImportPanel } from "./_components/NavigoRotationImportPanel";
import { NavigoRotationWorkbookImportPanel } from "./_components/NavigoRotationWorkbookImportPanel";
import { NavigoParticipantOperationsPanel } from "./_components/NavigoParticipantOperationsPanel";
import { NavigoManualRotationForm } from "./_components/NavigoManualRotationForm";

export const dynamic = "force-dynamic";

type NavigoAppAdminPageProps = {
  params: Promise<{
    studyId: string;
  }>;
  searchParams?: Promise<{
    navigoError?: string;
    navigoMessage?: string;
    evaluationLink?: string;
    evaluationLinkGeneratedAt?: string;
    evaluationLinkPhone?: string;
    evaluationLinkStatus?: string;
    evaluationLinkWhatsappError?: string;
    evaluationLinkWhatsappMessageId?: string;
    participant?: string;
    token?: string;
  }>;
};

type NavigoEvaluationLinkResult = {
  generatedAt: Date;
  phone: string;
  url: string;
  whatsappError?: string | null;
  whatsappMessageId?: string | null;
  whatsappStatus: "ENVIADO" | "ERROR";
};

export default async function NavigoAppAdminPage({ params, searchParams }: NavigoAppAdminPageProps) {
  const { studyId } = await params;
  const query = await searchParams;
  const requestOrigin = resolveRequestOrigin(await headers());
  const actor = await requireCapability("screening:review");
  await ensureNavigoAppFoundation({ actorUserId: actor.id });
  const result = await createNavigoAppRepository().getAdminDashboard(studyId);
  const rotationCleanupPreview = await previewNavigoTestRotationCleanup(studyId);

  if (!result) {
    notFound();
  }

  const isNavigo = result.study.code === NAVIGO_STUDY_CODE;

  return (
    <AppShell>
      <PageHeader
        actions={<StatusBadge status={isNavigo ? "ready" : "planned"}>{isNavigo ? "Operable" : "No aplica"}</StatusBadge>}
        description="Registro de aplicacion inicial y seguimiento de evaluaciones a 3, 4.5 y 6 horas."
        eyebrow="App Navigo"
        title={`Mediciones de fragancia · ${result.study.name}`}
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-teal-700 transition hover:text-teal-800" href={`/admin/studies/${studyId}`}>
          Volver al estudio
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/screening-attempts`}>
          Supervisar filtro
        </Link>
        <Link className="text-zinc-700 transition hover:text-zinc-950" href={`/admin/studies/${studyId}/ctl`}>
          CTL presencial
        </Link>
      </div>

      {!isNavigo ? (
        <EmptyState
          title="App Navigo no aplica para este estudio"
          description="Esta seccion solo prepara mediciones para FMASCULINA-NAVIGO-2026. No afecta detergentes ni otros estudios."
        />
      ) : (
        <div className="space-y-6">
          {query?.navigoMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {query.navigoMessage}
            </p>
          ) : null}
          {query?.navigoError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {query.navigoError}
            </p>
          ) : null}
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Antes de usar verificación facial automática en producción, confirma que el aviso de privacidad y consentimiento cubren verificación biométrica automatizada.
          </p>
          <NavigoParticipantOperationsPanel studyId={studyId} />
          <StudyRotationConfigurationPanel rotationConfig={result.rotationConfig} studyId={studyId} />
          <NavigoRotationCleanupPanel preview={rotationCleanupPreview} studyId={studyId} />
          <DirectParticipantRegistration studyId={studyId} />
          <BulkLinkGeneration studyId={studyId} />
          <NavigoRotationWorkbookImportPanel studyId={studyId} />
          <NavigoRotationImportPanel studyId={studyId} />

          {result.participants.length === 0 ? (
            <EmptyState
              title="Sin participantes confirmados"
              description="Cuando un participante aprobado tenga folio y rotacion asignada, aparecera aqui para registrar la aplicacion inicial."
            />
          ) : (
            <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-zinc-950">Participantes confirmados</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Las horas se muestran en {result.timeZoneIana}. El enlace solo expone etiquetas ciegas.
                </p>
              </div>
              <div className="divide-y divide-zinc-200">
                {result.participants.map((participant) => (
                  <ParticipantRow
                    key={participant.id}
                    canUseTestMode={actor.role === "ADMIN"}
                    evaluationLinkResult={query?.participant === participant.id ? parseEvaluationLinkResult(query) : null}
                    navigoError={query?.participant === participant.id ? query?.navigoError : undefined}
                    navigoMessage={query?.participant === participant.id ? query?.navigoMessage : undefined}
                    participant={participant}
                    requestOrigin={requestOrigin}
                    studyId={studyId}
                    timeZoneIana={result.timeZoneIana}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function parseEvaluationLinkResult(
  query: Awaited<NonNullable<NavigoAppAdminPageProps["searchParams"]>>
): NavigoEvaluationLinkResult | null {
  if (!query.evaluationLink || !query.evaluationLinkGeneratedAt || !query.evaluationLinkPhone) {
    return null;
  }

  if (query.evaluationLinkStatus !== "ENVIADO" && query.evaluationLinkStatus !== "ERROR") {
    return null;
  }

  const generatedAt = new Date(query.evaluationLinkGeneratedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return null;
  }

  return {
    generatedAt,
    phone: query.evaluationLinkPhone,
    url: query.evaluationLink,
    whatsappError: query.evaluationLinkWhatsappError ?? null,
    whatsappMessageId: query.evaluationLinkWhatsappMessageId ?? null,
    whatsappStatus: query.evaluationLinkStatus
  };
}

function StudyRotationConfigurationPanel({
  rotationConfig,
  studyId
}: {
  rotationConfig: NavigoStudyRotationConfiguration;
  studyId: string;
}) {
  const firstSample = rotationConfig.samples[0];
  const secondSample = rotationConfig.samples[1];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Configuracion real de muestras</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Estas claves identifican las muestras reales del estudio. No se generan automaticamente y no son los codigos de WhatsApp.
          </p>
        </div>
        <StatusBadge status={rotationConfig.rotations.length >= 2 ? "ready" : "planned"}>
          {rotationConfig.rotations.length >= 2 ? "Configurada" : "Pendiente"}
        </StatusBadge>
      </div>

      <form action={configureNavigoStudyRotationAction.bind(null, studyId)} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Nombre interno fragancia A
          <input className={inputClass} defaultValue={firstSample?.internalName ?? "Fragancia A"} name="firstInternalName" required />
        </label>
        <label className={labelClass}>
          Clave real fragancia A
          <input className={inputClass} defaultValue={firstSample?.sampleKey ?? ""} name="firstSampleKey" placeholder="247" required />
        </label>
        <label className={labelClass}>
          Nombre interno fragancia B
          <input className={inputClass} defaultValue={secondSample?.internalName ?? "Fragancia B"} name="secondInternalName" required />
        </label>
        <label className={labelClass}>
          Clave real fragancia B
          <input className={inputClass} defaultValue={secondSample?.sampleKey ?? ""} name="secondSampleKey" placeholder="583" required />
        </label>
        <div className="md:col-span-2">
          <SubmitButton pendingLabel="Guardando configuracion...">Guardar claves y rotaciones</SubmitButton>
        </div>
      </form>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-900">Fragancias</h3>
          <p className="mt-2 font-mono text-sm text-zinc-700">
            {rotationConfig.samples.length > 0 ? rotationConfig.samples.map((sample) => sample.sampleKey).join(" / ") : "Sin claves reales"}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-900">Rotaciones configuradas</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {rotationConfig.rotations.length > 0 ? (
              rotationConfig.rotations.map((rotation) => (
                <li key={rotation.rotationCode}>
                  <span className="font-semibold">{rotation.name}:</span>{" "}
                  <span className="font-mono">
                    {rotation.arms.map((arm) => arm.sampleKey).join(" -> ")}
                  </span>
                </li>
              ))
            ) : (
              <li>Sin rotaciones configuradas.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function NavigoRotationCleanupPanel({
  preview,
  studyId
}: {
  preview: NavigoRotationCleanupPreview;
  studyId: string;
}) {
  const suspectPlans = preview.plans.filter((plan) => plan.isSuspectTestConfig || plan.isOfficialRotation);
  const blockedPlans = suspectPlans.filter((plan) => plan.isSuspectTestConfig && plan.blockReasons.some((reason) => !reason.includes("oficial")));
  const canClean = preview.deleteablePlanIds.length > 0 && blockedPlans.length === 0;

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold text-amber-950">Limpieza temporal de rotaciones de prueba</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-amber-900">
          Conserva las rotaciones oficiales 247 -&gt; 583 y 583 -&gt; 247. Solo limpia configuraciones de prueba detectadas por los folios/codigos autorizados.
        </p>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <InfoTile label="Planes sospechosos" value={String(suspectPlans.filter((plan) => plan.isSuspectTestConfig).length)} />
          <InfoTile label="Planes eliminables" value={String(preview.deleteablePlanIds.length)} />
          <InfoTile label="Planes oficiales protegidos" value={String(preview.officialPlanIds.length)} />
          <InfoTile label="QA heredados detectados" value={String(preview.legacyQaParticipants.length)} />
          <InfoTile label="Participantes reales bloqueados" value={String(preview.blockedRealParticipants.length)} />
        </div>

        {preview.legacyQaParticipants.length > 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">Participantes QA heredados que se limpiaran primero</p>
            <ul className="mt-2 space-y-1">
              {preview.legacyQaParticipants.map((participant) => (
                <li key={`${participant.rotationCode}-${participant.studyParticipantId}`}>
                  <span className="font-mono">{participant.folio}</span>{" "}
                  {participant.name ? <span>{participant.name}</span> : null}{" "}
                  <span className="font-mono text-emerald-700">({participant.rotationCode})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview.blockedRealParticipants.length > 0 ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <p className="font-semibold">Participantes reales bloqueando limpieza</p>
            <ul className="mt-2 space-y-1">
              {preview.blockedRealParticipants.map((participant) => (
                <li key={`${participant.rotationCode}-${participant.studyParticipantId}`}>
                  <span className="font-mono">{participant.folio ?? participant.studyParticipantId}</span>{" "}
                  {participant.name ? <span>{participant.name}</span> : null}{" "}
                  <span className="font-mono text-rose-700">({participant.rotationCode})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {suspectPlans.length === 0 ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            No se encontraron configuraciones de prueba de rotacion.
          </p>
        ) : (
          <div className="grid gap-3">
            {suspectPlans.map((plan) => (
              <article className="rounded-md border border-amber-200 bg-white p-3" key={plan.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zinc-950">{plan.rotationCode}</p>
                    <p className="text-sm text-zinc-600">{plan.name}</p>
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {plan.arms.map((arm) => `${arm.applicationOrder}: ${arm.sampleKey}`).join(" / ") || "Sin brazos"}
                    </p>
                  </div>
                  <span className={plan.isOfficialRotation ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : preview.deleteablePlanIds.includes(plan.id) ? "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800" : "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800"}>
                    {plan.isOfficialRotation ? "Oficial real protegido" : preview.deleteablePlanIds.includes(plan.id) ? "Historico eliminable" : "Bloqueado"}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <InfoTile label="RotationPlanArm" value={String(plan.relationCounts.rotationPlanArms)} />
                  <InfoTile label="ParticipantRotationAssignment" value={String(plan.relationCounts.participantRotationAssignments)} />
                  <InfoTile label="ParticipantArmAssignment estimado" value={String(plan.relationCounts.participantArmAssignments)} />
                </dl>
                {plan.assignedParticipants.length > 0 ? (
                  <div className="mt-3 rounded-md bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-700">Participantes asociados</p>
                    <ul className="mt-2 space-y-1">
                      {plan.assignedParticipants.map((participant) => (
                        <li key={participant.studyParticipantId}>
                          <span className="font-mono">{participant.folio ?? participant.studyParticipantId}</span>{" "}
                          {participant.name ? <span>{participant.name}</span> : null}{" "}
                          <span className={participant.isAuthorizedTestFolio || participant.isQaRun ? "text-emerald-700" : "text-rose-700"}>
                            {participant.isQaRun ? "QA formal" : participant.isAuthorizedTestFolio ? "folio autorizado" : "posible real"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {plan.blockReasons.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-rose-800">
                    {plan.blockReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <form action={cleanupNavigoTestRotationsAction.bind(null, studyId)} className="rounded-md border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-semibold text-rose-900">Confirmacion requerida</p>
          <p className="mt-1 text-xs leading-5 text-rose-800">
            Escribe LIMPIAR ROTACIONES DE PRUEBA. Si existe participante real asociado, la accion se bloquea antes de borrar.
          </p>
          <input
            className="mt-2 w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100"
            disabled={!canClean}
            name="confirmation"
            placeholder="LIMPIAR ROTACIONES DE PRUEBA"
          />
          <button
            className="mt-2 rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            disabled={!canClean}
            type="submit"
          >
            Limpiar rotaciones de prueba
          </button>
        </form>
      </div>
    </details>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-zinc-950">{value}</dd>
    </div>
  );
}

function DirectParticipantRegistration({ studyId }: { studyId: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold text-zinc-950">Registrar participante</summary>
      <form action={registerNavigoDirectParticipantAction.bind(null, studyId)} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>
          Folio
          <input className={inputClass} name="folio" placeholder="NAV-001" required />
        </label>
        <label className={labelClass}>
          Nombre
          <input className={inputClass} name="nombre" required />
        </label>
        <label className={labelClass}>
          Celular
          <input className={inputClass} name="celular" required />
        </label>
        <label className={labelClass}>
          Correo opcional
          <input className={inputClass} name="correo" type="email" />
        </label>
        <label className={labelClass}>
          Reclutador
          <input className={inputClass} name="reclutador" />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Observaciones
          <textarea className={inputClass} name="observaciones" rows={2} />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input defaultChecked name="generateLink" type="checkbox" />
          Generar link al registrar
        </label>
        <div className="flex items-end">
          <SubmitButton pendingLabel="Registrando participante...">Registrar participante</SubmitButton>
        </div>
      </form>
    </details>
  );
}

function BulkLinkGeneration({ studyId }: { studyId: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold text-zinc-950">Generar enlaces</summary>
      <form action={generateNavigoParticipantLinksForStudyAction.bind(null, studyId)} className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-zinc-600">
          Genera enlaces para todos los participantes confirmados. Si ya existe un enlace activo se reutiliza.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="forceRegenerate" type="checkbox" />
          Regenerar enlaces existentes
        </label>
        <SubmitButton pendingLabel="Generando enlaces...">Generar enlaces para todos</SubmitButton>
      </form>
    </details>
  );
}

function ParticipantRow({
  canUseTestMode,
  evaluationLinkResult,
  navigoError,
  navigoMessage,
  participant,
  requestOrigin,
  studyId,
  timeZoneIana
}: {
  canUseTestMode: boolean;
  evaluationLinkResult?: NavigoEvaluationLinkResult | null;
  navigoError?: string;
  navigoMessage?: string;
  participant: NavigoParticipantListItem;
  requestOrigin: string;
  studyId: string;
  timeZoneIana: string;
}) {
  const canStart = participant.status === "APPROVED" && participant.confirmation && participant.ctl.completed && participant.rotationReady;
  const pendingMessage = !participant.ctl.completed
    ? "Pendiente para iniciar T0: completar CTL presencial."
    : participant.rotation.startPendingMessage;
  const activityCodes = resolveNavigoTimelineSequence(participant.activities.map((activity) => activity.code));
  const t0Activity = participant.activities.find((activity) => isInitialNavigoEvaluation(activity.code));
  const participantUrl = participant.participantLinkToken
    ? new URL(`/p/${encodeURIComponent(participant.participantLinkToken)}/activities`, requestOrigin).toString()
    : null;
  const participantTestModeParams =
    canUseTestMode && participant.participantLinkToken
      ? createNavigoTestModeParams({
          secret: process.env.PARTICIPANT_PORTAL_HASH_SECRET,
          token: participant.participantLinkToken
        })
      : null;
  const participantTestUrl = participantUrl && participantTestModeParams
    ? appendNavigoTestModeParams(participantUrl, participantTestModeParams)
    : null;

  return (
    <article className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(300px,0.95fr)]">
      <div>
        <p className="text-sm font-semibold text-zinc-950">{participant.participant.name}</p>
        <p className="mt-1 font-mono text-xs text-zinc-500">{participant.confirmation?.folio ?? "Sin folio"}</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="inline font-medium text-zinc-500">Celular: </dt>
            <dd className="inline text-zinc-900">{participant.participant.phone ?? "No capturado"}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Estado: </dt>
            <dd className="inline text-zinc-900">{participant.status === "APPROVED" ? "Confirmado" : participant.status}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">CTL: </dt>
            <dd className="inline text-zinc-900">{ctlStatusLabel(participant.ctl.status)}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Identificación visual: </dt>
            <dd className="inline font-semibold text-zinc-900">
              {participant.visualVerificationMode === "disabled" ? "No requerida" : "Requerida"}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-500">Alerta: </dt>
            <dd className="inline text-zinc-900">{participant.alert}</dd>
          </div>
        </dl>
        <VisualVerificationModeForm participant={participant} studyId={studyId} />
      </div>

      <div className="space-y-4">
        {navigoMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {navigoMessage}
          </p>
        ) : null}
        {navigoError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {navigoError}
          </p>
        ) : null}
        <CtlPreparation participant={participant} studyId={studyId} timeZoneIana={timeZoneIana} />
        <RotationPreparation participant={participant} studyId={studyId} />
        <div className="grid gap-3 md:grid-cols-4">
          {activityCodes.map((code) => (
            <ActivitySummary
              activity={participant.activities.find((item) => item.code === code)}
              code={code as NavigoActivityListItem["code"]}
              key={code}
              timeZoneIana={timeZoneIana}
            />
          ))}
        </div>
        <div className="space-y-3">
          {activityCodes.map((code) => (
            <ActivityDetail
              activity={participant.activities.find((item) => item.code === code)}
              code={code as NavigoActivityListItem["code"]}
              key={code}
              registeredSelfie={participant.registeredSelfie}
              studyId={studyId}
              timeZoneIana={timeZoneIana}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-950">Aplicacion y T0</h3>
          <dl className="mt-3 space-y-1 text-xs text-zinc-700">
            <div>
              <dt className="inline font-medium text-zinc-500">Estado: </dt>
              <dd className="inline">{t0StatusLabel(t0Activity)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-zinc-500">Respuestas: </dt>
              <dd className="inline">{t0Activity?.responseCount ?? 0}/7</dd>
            </div>
            <div>
              <dt className="inline font-medium text-zinc-500">Identidad: </dt>
              <dd className="inline">{identityStatusLabel(t0Activity?.identityStatus)}</dd>
            </div>
          </dl>
          {t0Activity?.identityStatus === "REJECTED" ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              Incidencia de identidad en T0. Revisar posteriormente con supervisor.
            </p>
          ) : null}
          {participantUrl ? (
            <Link
              className="mt-3 inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
              href={participantUrl}
              rel="noreferrer"
              target="_blank"
            >
              Abrir link participante
            </Link>
          ) : null}
        </section>
        <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-zinc-950">Aplicacion inicial registrada en CTL</h3>
          {participant.applicationStartedAt ? (
            <dl className="space-y-1 text-xs text-zinc-700">
              <div>
                <dt className="inline font-medium text-zinc-500">Fecha/hora T0: </dt>
                <dd className="inline font-semibold text-zinc-950">
                  {formatNavigoDateTimeLocal(participant.applicationStartedAt, timeZoneIana)}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-zinc-500">Primera fragancia: </dt>
                <dd className="inline font-mono text-zinc-950">{participant.rotation.leftCode ?? "Sin asignar"} - brazo izquierdo</dd>
              </div>
              <div>
                <dt className="inline font-medium text-zinc-500">Segunda fragancia: </dt>
                <dd className="inline font-mono text-zinc-950">{participant.rotation.rightCode ?? "Sin asignar"} - brazo derecho</dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              T0 se registrara automaticamente cuando la captura CTL entre a la comparativa de 15 minutos.
            </p>
          )}
        </section>
        {!canStart ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {pendingMessage ?? "Pendiente para iniciar T0: configuracion de rotacion."}
          </p>
        ) : null}
        {participantUrl ? <ParticipantLinkPanel testUrl={participantTestUrl} url={participantUrl} /> : null}
        {evaluationLinkResult ? (
          <NavigoEvaluationLinkResultPanel
            folio={participant.confirmation?.folio ?? "Sin folio"}
            generatedAtLabel={formatNavigoDateTimeLocal(evaluationLinkResult.generatedAt, timeZoneIana)}
            phone={evaluationLinkResult.phone}
            url={evaluationLinkResult.url}
            whatsappError={evaluationLinkResult.whatsappError}
            whatsappMessageId={evaluationLinkResult.whatsappMessageId}
            whatsappStatus={evaluationLinkResult.whatsappStatus}
          />
        ) : null}
        <form action={sendNavigoEvaluationLinkWhatsAppAction.bind(null, studyId, participant.id)} className="space-y-2">
          <input name="requestOrigin" type="hidden" value={requestOrigin} />
          <SubmitButton disabled={!canStart || !participant.participant.phone} pendingLabel="Enviando WhatsApp...">
            Enviar enlace de evaluacion al panelista
          </SubmitButton>
          {!participant.participant.phone ? (
            <p className="text-xs text-amber-700">Captura telefono para enviar WhatsApp.</p>
          ) : null}
        </form>
        <form action={generateNavigoParticipantLinkAction.bind(null, studyId, participant.id, Boolean(participantUrl))}>
          <SubmitButton disabled={!canStart} pendingLabel="Generando link...">
            {participantUrl ? "Regenerar link participante" : "Generar link participante"}
          </SubmitButton>
        </form>
        <CorrectionActions participant={participant} studyId={studyId} />
      </div>
    </article>
  );
}

function CorrectionActions({
  participant,
  studyId
}: {
  participant: NavigoParticipantListItem;
  studyId: string;
}) {
  const activityCodes = resolveNavigoTimelineSequence(participant.activities.map((activity) => activity.code));

  return (
    <details className="rounded-md border border-rose-200 bg-rose-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-rose-800">Acciones de correccion</summary>
      <p className="mt-2 text-xs leading-5 text-rose-900">
        Usa estas acciones solo ante errores de operacion o pruebas. Reiniciar conserva participante, folio, screening y rotacion.
      </p>

      <form action={resetNavigoParticipantAppAction.bind(null, studyId, participant.id)} className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-rose-950">Reiniciar App Navigo del participante</p>
        <input
          className={inputClass}
          name="confirmation"
          placeholder="REINICIAR APP"
          required
        />
        <textarea
          className={inputClass}
          name="reason"
          placeholder="Motivo obligatorio"
          required
          rows={2}
        />
        <SubmitButton pendingLabel="Reiniciando App...">Reiniciar App</SubmitButton>
      </form>

      <form action={deleteNavigoParticipantStagesAction.bind(null, studyId, participant.id)} className="mt-5 space-y-2">
        <p className="text-sm font-semibold text-rose-950">Eliminar etapa y posteriores</p>
        <select className={inputClass} name="fromCode" required>
          {activityCodes.map((code, index) => (
            <option key={code} value={code}>
              {index === activityCodes.length - 1 ? `${navigoActivityLabel(code)} solamente` : `${navigoActivityLabel(code)} y posteriores`}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          name="confirmation"
          placeholder="ELIMINAR ETAPAS"
          required
        />
        <textarea
          className={inputClass}
          name="reason"
          placeholder="Motivo obligatorio"
          required
          rows={2}
        />
        <SubmitButton pendingLabel="Eliminando etapas...">Eliminar etapas</SubmitButton>
      </form>

      <form action={deleteNavigoParticipantAction.bind(null, studyId, participant.id)} className="mt-5 space-y-2 border-t border-rose-200 pt-4">
        <p className="text-sm font-semibold text-rose-950">Eliminar participante Navigo</p>
        <p className="text-xs leading-5 text-rose-900">
          Eliminar este participante borrará sus actividades, evidencias, selfies, verificaciones, asignaciones,
          respuestas y estados de App Navigo. Esta acción no se puede deshacer.
        </p>
        <p className="text-xs leading-5 text-rose-900">
          Si el participante viene de un filtro real, no se borrará el screening automáticamente; se bloqueará con una causa específica.
        </p>
        <input
          className={inputClass}
          name="confirmation"
          placeholder="ELIMINAR PARTICIPANTE"
          required
        />
        <textarea
          className={inputClass}
          name="reason"
          placeholder="Motivo obligatorio"
          required
          rows={2}
        />
        <SubmitButton pendingLabel="Eliminando participante...">Eliminar participante</SubmitButton>
      </form>
    </details>
  );
}

function VisualVerificationModeForm({
  participant,
  studyId
}: {
  participant: NavigoParticipantListItem;
  studyId: string;
}) {
  const disabled = !participant.canChangeVisualVerificationMode;
  const modeLabel = participant.visualVerificationMode === "disabled" ? "No requerida" : "Requerida";

  return (
    <section className="mt-4 rounded-md border border-teal-300 bg-teal-50 p-3 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-zinc-950">Identificación visual</h3>
        <p className="text-xs leading-5 text-zinc-600">
          Estado actual: <span className="font-semibold text-zinc-900">{modeLabel}</span>. Esta decisión se configura por participante y no puede cambiarse desde el link público.
        </p>
        {disabled ? (
          <p className="text-xs leading-5 text-amber-800">
            La identificación visual solo puede modificarse antes de iniciar T0.
          </p>
        ) : null}
      </div>
      <form action={updateNavigoVisualVerificationModeAction.bind(null, studyId, participant.id)} className="mt-3 space-y-3">
        <select
          className={inputClass}
          defaultValue={participant.visualVerificationMode}
          disabled={disabled}
          name="visualVerificationMode"
        >
          <option value="required">Requerida</option>
          <option value="disabled">No requerida</option>
        </select>
        <SubmitButton disabled={disabled} pendingLabel="Guardando identificación visual...">
          Guardar identificación visual
        </SubmitButton>
      </form>
    </section>
  );
}

function CtlPreparation({
  participant,
  studyId,
  timeZoneIana
}: {
  participant: NavigoParticipantListItem;
  studyId: string;
  timeZoneIana: string;
}) {
  const navigoActive = Boolean(participant.ctl.completed && participant.rotationReady && participant.participantLinkToken);

  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Liberacion Navigo</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Navigo se habilita solo despues de CTL completado. Al liberar, la rotacion queda fija y se prepara el acceso participante.
          </p>
        </div>
        <StatusBadge status={navigoActive ? "ready" : participant.ctl.completed ? "planned" : "blocked"}>
          {navigoActive ? "Navigo activo" : participant.ctl.completed ? "Listo para liberar" : "Bloqueado"}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="CTL" value={ctlStatusLabel(participant.ctl.status)} />
        <DetailItem
          label="Completado"
          value={participant.ctl.completedAt ? formatDate(participant.ctl.completedAt, timeZoneIana) : "Pendiente"}
        />
        <DetailItem label="Encuestador CTL" value={participant.ctl.interviewerName ?? "Sin asignar"} />
        <DetailItem label="Navigo" value={navigoActive ? "Activo" : "Pendiente"} />
      </dl>
      {!participant.ctl.completed ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Pendiente para iniciar T0: completar CTL presencial.
        </p>
      ) : !navigoActive ? (
        <form action={releaseNavigoAfterCtlAction.bind(null, studyId, participant.id)} className="mt-3">
          <SubmitButton pendingLabel="Liberando Navigo...">Liberar Navigo</SubmitButton>
        </form>
      ) : null}
    </section>
  );
}

function RotationPreparation({
  participant,
  studyId
}: {
  participant: NavigoParticipantListItem;
  studyId: string;
}) {
  const codes = participant.confirmation?.referenceCodes ?? [];

  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Preparacion de rotacion</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Los codigos de fragancia son internos. El participante solo vera Primera fragancia y Segunda fragancia.
          </p>
        </div>
        <StatusBadge status={participant.rotation.ready ? "ready" : "planned"}>
          {participant.rotation.ready ? "Completa" : "Pendiente"}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <ChecklistItem label="Folio" status={participant.rotation.checklist.folio} />
        <ChecklistItem label="Aprobacion" status={participant.rotation.checklist.approval} />
        <ChecklistItem label="Brazo izquierdo / primera fragancia" status={participant.rotation.checklist.leftArm} value={participant.rotation.leftCode} />
        <ChecklistItem label="Brazo derecho / segunda fragancia" status={participant.rotation.checklist.rightArm} value={participant.rotation.rightCode} />
      </dl>

      {!participant.rotation.ready ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {participant.rotation.startPendingMessage}
        </p>
      ) : null}

      {codes.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Codigos de confirmacion disponibles como referencia manual: {codes.map((code) => code.code).join(", ")}. No se usan automaticamente como codigos de fragancia.
        </p>
      ) : null}

      <NavigoManualRotationForm
        initialLeftFragranceCode={participant.rotation.leftCode ?? ""}
        initialRightFragranceCode={participant.rotation.rightCode ?? ""}
        participantRotationReady={participant.rotation.ready}
        studyId={studyId}
        studyParticipantId={participant.id}
      />
      {participant.rotation.ready ? (
        <form action={clearNavigoParticipantRotationAction.bind(null, studyId, participant.id)} className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs leading-5 text-amber-900">
            Limpia solo la rotacion provisional del participante. Conserva folio, codigos de WhatsApp, evidencias y respuestas.
          </p>
          <label className={`${labelClass} mt-3`}>
            Confirmacion
            <input className={inputClass} name="confirmation" placeholder="LIMPIAR ROTACION" />
          </label>
          <div className="mt-3">
            <SubmitButton pendingLabel="Limpiando rotacion...">Limpiar rotacion provisional</SubmitButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ChecklistItem({
  label,
  status,
  value
}: {
  label: string;
  status: "complete" | "pending";
  value?: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className={status === "complete" ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-amber-700"}>
        {status === "complete" ? "Completo" : "Pendiente"}
      </dd>
      {value ? <p className="mt-1 break-all font-mono text-xs text-zinc-700">{value}</p> : null}
    </div>
  );
}

function ActivityDetail({
  activity,
  code,
  registeredSelfie,
  studyId,
  timeZoneIana
}: {
  activity?: NavigoActivityListItem;
  code: NavigoActivityListItem["code"];
  registeredSelfie: NavigoParticipantListItem["registeredSelfie"];
  studyId: string;
  timeZoneIana: string;
}) {
  const isT0 = isInitialNavigoEvaluation(code);

  return (
    <details className="rounded-md border border-zinc-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        Ver detalle · {navigoActivityLabel(code)}
      </summary>
      <div className="mt-4 space-y-4">
        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Estado" value={activity ? navigoOperationalStatusLabel(activity) : "Pendiente"} />
          <DetailItem label="Hora esperada" value={activity ? formatDate(activity.scheduledAt, timeZoneIana) : "Pendiente"} />
          <DetailItem
            label="Hora real"
            value={
              activity?.actualCompletedAt
                ? formatDate(activity.actualCompletedAt, timeZoneIana)
                : activity?.actualStartedAt
                  ? formatDate(activity.actualStartedAt, timeZoneIana)
                  : "Sin captura"
            }
          />
          <DetailItem label="Respuestas" value={`${activity?.responseCount ?? 0}/7`} />
        </dl>

        {isT0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Identidad en salón: {identityStatusLabel(activity?.identityStatus)}</p>
            {activity?.identityStatus === "REJECTED" ? (
              <p className="mt-2 font-semibold text-rose-800">
                Incidencia de identidad: revisar posteriormente con supervisor.
              </p>
            ) : null}
          </div>
        ) : null}

        <ActivityResponses activity={activity} />

        <ActivityIdentityReview
          activity={activity}
          isT0={isT0}
          registeredSelfie={registeredSelfie}
          studyId={studyId}
          timeZoneIana={timeZoneIana}
        />
      </div>
    </details>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-900">{value}</dd>
    </div>
  );
}

function ActivityResponses({ activity }: { activity?: NavigoActivityListItem }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-zinc-950">Respuestas AP1 a AP7</h4>
      {!activity || activity.readableResponses.every((response) => response.value === "") ? (
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Sin respuestas capturadas.
        </p>
      ) : (
        <dl className="mt-3 grid gap-2">
          {activity.readableResponses.map((response, index) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={response.questionId}>
              <dt className="font-semibold text-zinc-950">AP{index + 1}: {response.text}</dt>
              <dd className="mt-1 text-zinc-800">{response.label}</dd>
              {response.value ? <p className="mt-1 text-xs text-zinc-500">Valor interno conservado: {response.value}</p> : null}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function ActivityIdentityReview({
  activity,
  isT0,
  registeredSelfie,
  studyId,
  timeZoneIana
}: {
  activity?: NavigoActivityListItem;
  isT0: boolean;
  registeredSelfie: NavigoParticipantListItem["registeredSelfie"];
  studyId: string;
  timeZoneIana: string;
}) {
  const activitySelfie = activity?.activitySelfie ?? null;
  const automaticFaceReview = parseNavigoFaceVerificationNote(activitySelfie?.internalNote);

  return (
    <section>
      <h4 className="text-sm font-semibold text-zinc-950">Revisión visual de identidad</h4>
      <p className="mt-1 text-xs text-zinc-500">T0 mantiene confirmacion visual humana. Las evaluaciones posteriores usan verificacion facial automatica y permiten revision manual.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SelfiePreview title="Selfie registrada del filtro" url={registeredSelfie?.signedUrl ?? null} />
        {isT0 ? (
          <SelfiePreview title="Selfie de esta toma" url={null} emptyText="T0 no requiere selfie nueva." />
        ) : (
          <SelfiePreview
            title="Selfie de esta toma"
            url={activitySelfie?.signedUrl ?? null}
            emptyText="Selfie pendiente"
            uploadedAt={activitySelfie?.uploadedAt ? formatDate(activitySelfie.uploadedAt, timeZoneIana) : null}
          />
        )}
      </div>

      {!isT0 && activitySelfie ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-semibold text-zinc-950">Estado: {identityReviewStatusLabel(activitySelfie)}</p>
          <dl className="mt-3 grid gap-2 rounded-md border border-zinc-200 bg-white p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verificación automática</dt>
              <dd className="mt-1 text-zinc-900">{faceVerificationResultLabel(automaticFaceReview.status)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Score/similitud</dt>
              <dd className="mt-1 text-zinc-900">{automaticFaceReview.score ?? "No disponible"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Método/modelo</dt>
              <dd className="mt-1 break-words text-zinc-900">{automaticFaceReview.method ?? "No configurado"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evaluado</dt>
              <dd className="mt-1 text-zinc-900">{automaticFaceReview.evaluatedAt ?? "No disponible"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">Umbrales: MATCH &gt;= 0.60, NO_MATCH &lt;= 0.35</p>
          {activitySelfie.reviewStatus === "REJECTED" ? (
            <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
              Incidencia de identidad: revisar posteriormente. No bloquea el avance del panelista.
            </p>
          ) : null}
          {activitySelfie.rejectionReason ? <p className="mt-2 text-sm text-zinc-700">Motivo: {activitySelfie.rejectionReason}</p> : null}
          {activitySelfie.internalNote ? <p className="mt-1 text-sm text-zinc-700">Nota: {activitySelfie.internalNote}</p> : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <form action={reviewNavigoActivityIdentityAction.bind(null, studyId, activitySelfie.id, "APPROVED")}>
              <SubmitButton pendingLabel="Guardando...">Marcar como coincide</SubmitButton>
            </form>
            <form action={reviewNavigoActivityIdentityAction.bind(null, studyId, activitySelfie.id, "PENDING")}>
              <input name="internalNote" type="hidden" value="Requiere revisión manual de identidad." />
              <SubmitButton pendingLabel="Guardando...">Marcar como requiere revisión</SubmitButton>
            </form>
            <form action={reviewNavigoActivityIdentityAction.bind(null, studyId, activitySelfie.id, "REJECTED")} className="space-y-2">
              <textarea
                className={inputClass}
                name="rejectionReason"
                placeholder="Motivo obligatorio si no coincide"
                required
                rows={2}
              />
              <SubmitButton pendingLabel="Guardando...">Marcar como no coincide</SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SelfiePreview({
  emptyText = "Sin imagen disponible",
  title,
  uploadedAt,
  url
}: {
  emptyText?: string;
  title: string;
  uploadedAt?: string | null;
  url: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      {uploadedAt ? <p className="mt-1 text-xs text-zinc-500">Capturada: {uploadedAt}</p> : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={title} className="mt-3 max-h-80 w-full rounded-md object-contain" src={url} />
      ) : (
        <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">{emptyText}</p>
      )}
    </div>
  );
}

function identityReviewStatusLabel(activitySelfie: NonNullable<NavigoActivityListItem["activitySelfie"]>): string {
  if (activitySelfie.reviewStatus === "APPROVED") {
    return "Coincide";
  }
  if (activitySelfie.reviewStatus === "REJECTED") {
    return "No coincide";
  }
  if (activitySelfie.internalNote?.toLowerCase().includes("requiere revisión")) {
    return "Requiere revisión";
  }

  return "Pendiente";
}

function ActivitySummary({
  activity,
  code,
  timeZoneIana
}: {
  activity?: NavigoActivityListItem;
  code: NavigoActivityListItem["code"];
  timeZoneIana: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-semibold text-zinc-950">{navigoActivityLabel(code)}</p>
      <p className="mt-1 text-zinc-600">{activity ? statusLabel(activity.status) : "No iniciado"}</p>
      <p className="mt-2 text-xs text-zinc-500">Ideal: {activity ? formatDate(activity.scheduledAt, timeZoneIana) : "Pendiente"}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Real: {activity?.actualCompletedAt ? formatDate(activity.actualCompletedAt, timeZoneIana) : "Sin captura"}
      </p>
      {isInitialNavigoEvaluation(code) ? (
        <p className="mt-2 text-xs text-zinc-500">T0 · Respuestas {activity?.responseCount ?? 0}/7</p>
      ) : null}
      {!isInitialNavigoEvaluation(code) ? (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="block font-semibold text-zinc-700">{navigoMeasurementProgressLabel(activity)}</span>
          Selfies {activity?.evidenceCount ?? 0} · Respuestas {activity?.responseCount ?? 0}/7
        </p>
      ) : null}
    </div>
  );
}

function navigoMeasurementProgressLabel(activity?: NavigoActivityListItem): string {
  if (!activity || (activity.selfieCount ?? 0) === 0) {
    return "Selfie pendiente";
  }

  if (activity.identityReviewStatus === "REJECTED") {
    return "Identidad no coincide";
  }

  if (activity.identityReviewStatus !== "APPROVED") {
    return "Requiere revisión de identidad";
  }

  if ((activity.responseCount ?? 0) < 7 || activity.status !== "COMPLETED") {
    return "Selfie registrada / respuestas pendientes";
  }

  return "Completada";
}

function navigoOperationalStatusLabel(activity: NavigoActivityListItem): string {
  if (!isInitialNavigoEvaluation(activity.code)) {
    if (activity.availability?.reason === "AFTER_WINDOW" && activity.status !== "COMPLETED") {
      return "Requiere llamada";
    }
    if ((activity.selfieCount ?? 0) === 0) {
      return "Selfie pendiente";
    }
    if (activity.activitySelfie?.reviewStatus === "REJECTED") {
      return "Identidad no coincide";
    }
    if (activity.activitySelfie?.internalNote?.toLowerCase().includes("requiere revisión")) {
      return "Requiere revisión de identidad";
    }
    if ((activity.responseCount ?? 0) < 7 || activity.status !== "COMPLETED") {
      return "Respuestas pendientes";
    }
    return "Completada";
  }

  if (activity.availability?.reason === "BEFORE_WINDOW") {
    return "Aún no disponible";
  }
  if (activity.availability?.reason === "AFTER_WINDOW") {
    return "Fuera de ventana";
  }
  if (activity.availability?.canCapture) {
    return "Disponible";
  }

  return statusLabel(activity.status);
}

function statusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "Completado";
    case "AVAILABLE":
      return "Disponible";
    case "EXPIRED":
      return "Fuera de ventana";
    case "STARTED":
    case "INCOMPLETE":
      return "En captura";
    default:
      return "Pendiente";
  }
}

function ctlStatusLabel(status: NavigoParticipantListItem["ctl"]["status"]) {
  switch (status) {
    case "COMPLETED":
      return "Completado";
    case "IN_PROGRESS":
      return "En captura";
    case "PENDING":
      return "Pendiente";
    case "CANCELLED":
      return "Cancelado";
    default:
      return "Sin CTL";
  }
}

function t0StatusLabel(activity?: NavigoActivityListItem) {
  if (!activity) {
    return "No iniciado";
  }
  if (activity.status === "COMPLETED" && activity.identityStatus === "CONFIRMED" && activity.responseCount >= 7) {
    return "Completado en salón";
  }
  if (activity.actualStartedAt || activity.status === "STARTED" || activity.status === "INCOMPLETE") {
    return "Iniciado en salón";
  }

  return "No iniciado";
}

function identityStatusLabel(status?: "CONFIRMED" | "PENDING" | "REJECTED") {
  switch (status) {
    case "CONFIRMED":
      return "Confirmada";
    case "REJECTED":
      return "Rechazada";
    default:
      return "Pendiente";
  }
}

function formatDate(value: Date, timeZoneIana: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZoneIana
  }).format(value);
}


const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
