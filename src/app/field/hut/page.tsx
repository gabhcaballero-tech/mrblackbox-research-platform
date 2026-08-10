import {
  buildHutQuestionnaireProgress,
  buildHutPhotoTimeline,
  createHutRepository,
  formatHutPhotoTimelineSlotTitle,
  getHutQuestions,
  getHutV5Definition,
  progressQuestionsForSection,
  progressSectionTitle,
  isHutOperationalPanelSection,
  resolveHutPhaseCodeSlotTimelineLabel,
  resolveHutPhotoTimelinePhotoLabel,
  resolveHutOperationalStatusLabel,
  type HutFieldQuestionnaireWorkspace,
  type HutPhotoTimelineSlot,
  type HutQuestionDefinition
} from "@/modules/hut";
import {
  completeHutQuestionnaireSectionForFieldAction,
  saveHutQuestionnaireAnswerForFieldAction
} from "@/modules/hut/actions";
import { createFieldOperationsRepository } from "@/modules/field-operations";
import type { FieldOperationsDashboard } from "@/modules/field-operations/types";
import type { CltOperationsDetail } from "@/modules/clt-operations/types";
import { requireCapability } from "@/shared/auth/session";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDateMexicoCity, formatDateTimeMexicoCity } from "@/shared/utils/date-format";
import { HutFieldSubmitButton } from "./HutFieldSubmitButton";

export const dynamic = "force-dynamic";

type FieldHutPageProps = {
  searchParams?: Promise<{
    folio?: string;
    accessType?: string;
    hutError?: string;
    hutMessage?: string;
    interviewerCode?: string;
    mode?: string;
    questionCode?: string;
    studyId?: string;
  }>;
};

export default async function FieldHutPage({ searchParams }: FieldHutPageProps) {
  const query = await searchParams;
  const folio = String(query?.folio ?? "").trim().toUpperCase();
  const isAdminMode = query?.mode === "admin";
  const dashboard = await resolveFieldHutDashboard({
    accessType: query?.accessType,
    interviewerCode: query?.interviewerCode,
    isAdminMode,
    studyId: query?.studyId
  });
  const access = dashboard.viewer.mode === "INTERVIEWER_CODE"
    ? {
        interviewerCode: dashboard.viewer.code,
        label: dashboard.viewer.label,
        mode: "INTERVIEWER_CODE" as const
      }
    : dashboard.viewer.mode === "SUPERVISOR_CODE"
      ? {
          interviewerCode: dashboard.viewer.code,
          label: dashboard.viewer.label,
          mode: "SUPERVISOR_CODE" as const
        }
    : dashboard.viewer.mode === "ADMIN"
      ? {
          mode: "ADMIN" as const,
          studyId: dashboard.selectedStudyId
        }
      : null;
  const assignedParticipants = dashboard.viewer.mode === "CODE_REQUIRED"
    ? []
    : dashboard.participants.filter((participant) => participant.hut.id || participant.hut.folio);
  const folioAllowed = !folio || isAdminMode || dashboard.viewer.mode === "SUPERVISOR_CODE" || isAssignedFieldHutFolio(folio, dashboard.participants);
  const workspaceResult = folio && folioAllowed
    ? await createHutRepository().getFieldQuestionnaireWorkspace({ folio })
    : folio && !folioAllowed
      ? { message: "Este participante no esta asignado a este encuestador.", ok: false as const }
      : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Campo HUT</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Captura de evaluación HUT</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Busca un participante por folio NAV o HUT para revisar evidencias y continuar el cuestionario.
          </p>
        </header>

        {dashboard.viewer.mode === "CODE_REQUIRED" ? (
          <InterviewerCodeGate accessType={query?.accessType} error={dashboard.viewer.error} folio={folio} />
        ) : null}

        {dashboard.viewer.mode !== "CODE_REQUIRED" && access ? (
          <FieldHutViewerCard access={access} />
        ) : null}

        {dashboard.viewer.mode !== "CODE_REQUIRED" && access ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <FieldHutAccessHiddenInputs access={access} />
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800">
              Folio NAV/HUT
              <input
                className="min-h-12 rounded-md border border-zinc-300 px-4 py-3 text-base uppercase"
                defaultValue={folio}
                name="folio"
                placeholder="NAV-121 o HUT-121"
                required
              />
            </label>
            <button className="self-end rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white" type="submit">
              Buscar
            </button>
          </form>
        </section>
        ) : null}

        {dashboard.viewer.mode !== "CODE_REQUIRED" && access && !folio ? (
          <AssignedHutParticipantsList access={access} participants={assignedParticipants} />
        ) : null}

        {query?.hutMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {query.hutMessage}
          </p>
        ) : null}
        {query?.hutError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {query.hutError}
          </p>
        ) : null}

        {workspaceResult && !workspaceResult.ok ? (
          <section className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-rose-950">No fue posible abrir HUT</h2>
            <p className="mt-2 text-sm text-rose-800">{workspaceResult.message}</p>
          </section>
        ) : null}

        {workspaceResult?.ok ? (
          <FieldHutWorkspace
            access={access}
            selectedQuestionCode={String(query?.questionCode ?? "").trim()}
            workspace={workspaceResult.data}
            searchedFolio={folio}
          />
        ) : null}
      </div>
    </main>
  );
}

type FieldHutAccessContext =
  | {
      interviewerCode: string;
      label: string;
      mode: "INTERVIEWER_CODE";
    }
  | {
      interviewerCode: string;
      label: string;
      mode: "SUPERVISOR_CODE";
    }
  | {
      mode: "ADMIN";
      studyId: string | null;
    };

async function resolveFieldHutDashboard(input: {
  accessType?: string | null;
  interviewerCode?: string | null;
  isAdminMode: boolean;
  studyId?: string | null;
}): Promise<FieldOperationsDashboard> {
  if (input.isAdminMode) {
    const actor = await requireCapability("admin:access");
    return createFieldOperationsRepository().getDashboard({
      actorName: actor.name,
      actorRole: "ADMIN",
      interviewerUserId: actor.id,
      mode: "ADMIN",
      studyId: input.studyId
    });
  }

  const accessType = String(input.accessType ?? "INTERVIEWER").toUpperCase() === "SUPERVISOR"
    ? "SUPERVISOR"
    : "INTERVIEWER";
  return createFieldOperationsRepository().getDashboard({
    actorName: "Campo HUT",
    actorRole: "INTERVIEWER",
    interviewerCode: input.interviewerCode,
    interviewerUserId: "field-hut-code",
    mode: accessType === "SUPERVISOR" ? "SUPERVISOR_CODE" : "INTERVIEWER_CODE",
    studyId: input.studyId
  });
}

function InterviewerCodeGate({
  accessType,
  error,
  folio
}: {
  accessType?: string | null;
  error: string | null;
  folio: string;
}) {
  const selectedAccessType = String(accessType ?? "INTERVIEWER").toUpperCase() === "SUPERVISOR" ? "SUPERVISOR" : "INTERVIEWER";
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">Selecciona tipo de acceso</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Ingresa tu codigo personal para ver participantes y aplicar HUT.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        {folio ? <input name="folio" type="hidden" value={folio} /> : null}
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold text-zinc-800">Tipo de acceso</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800">
              <input defaultChecked={selectedAccessType === "INTERVIEWER"} name="accessType" type="radio" value="INTERVIEWER" />
              Encuestador
            </label>
            <label className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800">
              <input defaultChecked={selectedAccessType === "SUPERVISOR"} name="accessType" type="radio" value="SUPERVISOR" />
              Supervisor
            </label>
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-800">
          Codigo
          <input
            autoComplete="off"
            className="min-h-12 rounded-md border border-zinc-300 px-4 py-3 text-base uppercase"
            name="interviewerCode"
            placeholder="JES26"
            required
          />
        </label>
        <button className="self-end rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white" type="submit">
          Ingresar
        </button>
      </form>
    </section>
  );
}

function FieldHutViewerCard({ access }: { access: FieldHutAccessContext }) {
  if (access.mode === "ADMIN") {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-zinc-950">Modo administrador HUT</p>
        <p className="mt-1 text-sm text-zinc-600">Acceso protegido para supervision interna.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-950">
            {access.mode === "SUPERVISOR_CODE" ? "Supervisor" : "Encuestador"}: {access.label}
          </p>
          <p className="mt-1 text-sm text-teal-900">
            Modo: {access.mode === "SUPERVISOR_CODE" ? "Supervisor" : "Encuestador"}
          </p>
          <p className="mt-1 text-sm text-teal-900">Codigo: {access.interviewerCode}</p>
        </div>
        <a className="text-sm font-semibold text-teal-800 hover:text-teal-950" href="/field/hut">
          Cambiar encuestador
        </a>
      </div>
    </section>
  );
}

function AssignedHutParticipantsList({
  access,
  participants
}: {
  access: FieldHutAccessContext;
  participants: CltOperationsDetail[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Participantes asignados</h2>
      {participants.length ? (
        <div className="mt-4 grid gap-3">
          {participants.map((participant) => {
            const hutFolio = participant.hut.folio ?? null;
            const navFolio = participant.folio !== "Sin folio" ? participant.folio : null;
            const targetFolio = hutFolio ?? navFolio;
            return (
              <a
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm transition hover:border-teal-300 hover:bg-teal-50"
                href={targetFolio ? fieldHutHref({ access, folio: targetFolio }) : "#"}
                key={participant.id}
              >
                <span className="font-semibold text-zinc-950">{participant.participantName}</span>
                <span className="mt-1 block text-zinc-600">
                  NAV: {navFolio ?? "Sin NAV"} / HUT: {hutFolio ?? "Sin HUT"}
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">No hay participantes HUT asignados a este encuestador.</p>
      )}
    </section>
  );
}

function FieldHutWorkspace({
  access,
  searchedFolio,
  selectedQuestionCode,
  workspace
}: {
  access: FieldHutAccessContext | null;
  searchedFolio: string;
  selectedQuestionCode: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const questions = applicableQuestions(workspace);
  const operationalQuestions = workspace.participant.origin === "CLT_HUT"
    ? questions.filter((question) => question.section !== "FILTROS")
    : questions;
  const requiredQuestions = questions.filter((question) => question.required);
  const operationalRequiredQuestions = operationalQuestions.filter((question) => question.required);
  const questionnaireProgress = buildHutQuestionnaireProgress({
    applicableQuestionCodes: workspace.questionnaire.applicableQuestionCodes,
    answers: workspace.questionnaire.answers,
    participantOrigin: workspace.participant.origin
  });
  const selectedQuestion = questions.find((question) => question.code === selectedQuestionCode) ?? null;
  const questionnaireClosed = workspace.questionnaire.attempt.status === "COMPLETED" || workspace.questionnaire.attempt.status === "TERMINATED";
  const selectedQuestionBlockedByDirectFilter = workspace.participant.origin === "HUT_DIRECTO"
    && workspace.questionnaire.filterStatus !== "COMPLETED"
    && selectedQuestion?.section !== "FILTROS";
  const nextQuestion = questionnaireClosed
    ? null
    : selectedQuestionBlockedByDirectFilter
      ? requiredQuestions.find((question) => question.section === "FILTROS" && !(question.code in workspace.questionnaire.answers))
      ?? questions.find((question) => question.section === "FILTROS" && !(question.code in workspace.questionnaire.answers))
      ?? null
      : selectedQuestion
      ?? operationalRequiredQuestions.find((question) => !(question.code in workspace.questionnaire.answers))
      ?? operationalQuestions.find((question) => !(question.code in workspace.questionnaire.answers))
      ?? null;
  const captureQuestion = !questionnaireClosed && selectedQuestionCode && !selectedQuestionBlockedByDirectFilter ? selectedQuestion : null;
  const hutTimeline = buildFieldPhotoTimeline(workspace);
  const photoTimelineSlots = hutTimeline.filter((slot) => slot.participantTask);
  const evaluationTimelineSlots = hutTimeline.filter((slot) => slot.interviewerTask);
  const currentEvaluationQuestion = captureQuestion ?? nextQuestion;

  return (
    <div className="space-y-6">
      <section
        className="sticky top-0 z-10 rounded-md border border-zinc-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
        data-testid="field-hut-compact-header"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-950">
          <span>{workspace.participant.hutFolio ?? "HUT sin folio"}</span>
          <span className="text-zinc-300">|</span>
          <span>{workspace.participant.navFolio ?? "Sin NAV"}</span>
          <span className="text-zinc-300">|</span>
          <span>EVA1 {workspace.rotation.eva1 ?? "No asignada"}</span>
          <span className="text-zinc-300">|</span>
          <span>EVA2 {workspace.rotation.eva2 ?? "No asignada"}</span>
        </div>
      </section>

      {captureQuestion ? (
        <QuestionnaireForm access={access} question={captureQuestion} searchedFolio={searchedFolio} workspace={workspace} />
      ) : (
        <>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="field-hut-secondary-details">
        {workspace.participant.testMode ? (
          <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
            Modo prueba activo: este HUT puede avanzar sin esperar días reales.
          </p>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {workspace.participant.hutFolio ?? "Folio HUT no asignado"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{workspace.participant.name}</h2>
            <p className="mt-2 text-sm text-zinc-600">
              NAV: {workspace.participant.navFolio ?? "Sin NAV vinculado"} · Origen: {originLabel(workspace.participant.origin)}
            </p>
          </div>
          <StatusBadge status={workspace.questionnaire.attempt.status === "COMPLETED" ? "ready" : "planned"}>
            {statusLabel(workspace.questionnaire.attempt.status)}
          </StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm sm:grid-cols-3">
          <Fact label="Teléfono" value={workspace.participant.phone ?? "No disponible"} />
          <Fact label="Correo" value={workspace.participant.email ?? "No disponible"} />
          <Fact label="Estado HUT" value={resolveHutOperationalStatusLabel(workspace.participant.status)} />
          <Fact label="Filtro" value={filterStatusLabel(workspace.questionnaire.filterStatus)} />
          <Fact label="Modo prueba" value={workspace.participant.testMode ? "Activo" : "Inactivo"} />
          <Fact
            label="Evaluacion actual"
            value={currentEvaluationQuestion ? progressSectionTitle(currentEvaluationQuestion.section) : "Evaluacion completada"}
          />
          <Fact label="Producto" value={currentEvaluationQuestion ? productLabelForQuestion(currentEvaluationQuestion, workspace) : "Sin pendiente"} />
        </div>
        {workspace.questionnaire.filterStatus === "PENDING" ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Filtro pendiente de captura.
          </p>
        ) : null}
        {workspace.questionnaire.filterStatus === "REJECTED" ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
            Filtro rechazado. Revisa el motivo antes de continuar.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Evidencia fotografica</h3>
        <div className="mt-4 grid gap-3">
          {photoTimelineSlots.map((slot) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={slot.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{slot.dayLabel}</p>
                  <p className="mt-1 font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="mt-1 text-zinc-600">
                    Participante: {slot.participantTask ?? "Sin captura fotografica"}{slot.interviewerTask ? ` / Encuestador: ${slot.interviewerTask}` : ""}
                  </p>
                  <p className="mt-1 text-zinc-600">Producto: {slot.productCode ?? "No asignado"}</p>
                  {slot.evidence?.capturedAt ? <p className="mt-1 text-zinc-600">Foto: {formatDateTimeMexicoCity(slot.evidence.capturedAt)}</p> : null}
                  {!slot.isCapturableWithCurrentModel && !slot.evidence ? <p className="mt-1 text-zinc-600">Proxima actividad programada</p> : null}
                </div>
                <StatusBadge status={slot.status === "COMPLETED" ? "ready" : slot.status === "AVAILABLE" ? "planned" : "blocked"}>
                  {fieldTimelineStatusLabel(slot)}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Evaluaciones</h3>
        <div className="mt-4 grid gap-3">
          {evaluationTimelineSlots.map((slot) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={slot.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{slot.dayLabel}</p>
                  <p className="mt-1 font-semibold text-zinc-950">{formatHutPhotoTimelineSlotTitle(slot)}</p>
                  <p className="mt-1 text-zinc-600">Encuestador: {slot.interviewerTask}</p>
                  <p className="mt-1 text-zinc-600">Producto: {slot.productCode ?? "No asignado"}</p>
                  {slot.evidence?.capturedAt ? (
                    <p className="mt-1 text-zinc-600">Registro historico: {formatDateTimeMexicoCity(slot.evidence.capturedAt)}</p>
                  ) : (
                    <p className="mt-1 text-zinc-600">Visita pendiente</p>
                  )}
                </div>
                <StatusBadge status={slot.status === "COMPLETED" ? "ready" : "planned"}>
                  {slot.status === "COMPLETED" ? "Registrada" : "Pendiente"}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Fotos recibidas</h3>
        {workspace.photos.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {workspace.photos.map((photo, index) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={`${photo.source}-${photo.capturedAt.toISOString()}-${index}`}>
                <p className="font-semibold text-zinc-950">
                  {resolveHutPhotoTimelinePhotoLabel(photo, hutTimeline)}
                </p>
                <p className="mt-1 text-zinc-600">Producto: {photo.productCode ?? "No asignado"}</p>
                <p className="text-zinc-600">Fecha: {formatDateTimeMexicoCity(photo.capturedAt)}</p>
                {photo.signedUrl ? (
                  <a className="mt-2 inline-block font-semibold text-teal-700" href={photo.signedUrl} rel="noreferrer" target="_blank">
                    Ver foto
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Todavía no hay fotos registradas.</p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Fases y códigos HUT</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {workspace.phaseCodes.map((phaseCode) => (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={phaseCode.phase}>
              <p className="font-semibold text-zinc-950">{resolveHutPhaseCodeSlotTimelineLabel(phaseCode.slot)}</p>
              <p className="mt-1 text-zinc-600">Estado: {statusLabel(phaseCode.status)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm text-zinc-600">
          <span>Preguntas contestadas</span>
          <span>
            {questionnaireProgress.answered}/{questionnaireProgress.total}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-100">
          <div className="h-2 rounded-full bg-teal-600" style={{ width: `${questionnaireProgress.percentage}%` }} />
        </div>
        {workspace.questionnaire.attempt.status === "TERMINATED" ? (
          <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-4">
            <p className="text-lg font-semibold text-rose-950">Entrevista terminada</p>
            <p className="mt-1 text-sm text-rose-900">
              Motivo: {workspace.questionnaire.attempt.terminationReason ?? "No cumple criterios operativos para continuar."}
            </p>
          </div>
        ) : nextQuestion ? (
          <div className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-4">
            <p className="text-sm font-semibold text-teal-950">Siguiente evaluacion</p>
            <p className="mt-1 text-lg font-semibold text-zinc-950">{progressSectionTitle(nextQuestion.section)}</p>
            <p className="mt-1 text-sm text-zinc-700">Producto: {productLabelForQuestion(nextQuestion, workspace)}</p>
            <a
              className="mt-4 inline-flex min-h-12 items-center justify-center rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
              href={fieldHutHref({ access, folio: searchedFolio, questionCode: nextQuestion.code })}
            >
              Iniciar evaluacion
            </a>
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-lg font-semibold text-emerald-950">Evaluacion completada</p>
            <p className="mt-1 text-sm text-emerald-900">No hay preguntas pendientes para este participante.</p>
          </div>
        )}
        <SectionProgressControls access={access} searchedFolio={searchedFolio} workspace={workspace} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Respuestas existentes</h3>
        {Object.entries(workspace.questionnaire.answers).length ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(workspace.questionnaire.answers).map(([code, answer]) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={code}>
                <dt className="font-semibold text-zinc-950">
                  <a className="text-teal-700 hover:text-teal-800" href={fieldHutHref({ access, folio: searchedFolio, questionCode: code })}>
                    {answerLabel(code, workspace)}
                  </a>
                </dt>
                <dd className="mt-1 text-zinc-700">{formatAnswer(answer)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Todavía no hay respuestas guardadas.</p>
        )}
      </section>
        </>
      )}
    </div>
  );
}

function SectionProgressControls({
  access,
  searchedFolio,
  workspace
}: {
  access: FieldHutAccessContext | null;
  searchedFolio: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const progress = buildHutQuestionnaireProgress({
    applicableQuestionCodes: workspace.questionnaire.applicableQuestionCodes,
    answers: workspace.questionnaire.answers,
    participantOrigin: workspace.participant.origin
  });
  const visitsBySection = new Map(workspace.questionnaire.visits.map((visit) => [visit.section, visit]));
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {progress.sections.map((sectionProgress) => {
        const visit = visitsBySection.get(sectionProgress.section);
        const pendingQuestionCode = sectionProgress.pendingQuestionCodes[0];
        const canComplete = workspace.questionnaire.attempt.status !== "TERMINATED" && sectionProgress.pendingQuestionCodes.length === 0 && visit?.status !== "COMPLETED";
        return (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={sectionProgress.section}>
            <p className="font-semibold text-zinc-950">{sectionProgress.title}</p>
            <p className="mt-1 text-zinc-600">
              {sectionProgress.answered}/{sectionProgress.total} · {statusLabel(visit?.status ?? "PENDING")}
            </p>
            {pendingQuestionCode ? (
              <a
                className="mt-3 inline-flex rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
                href={fieldHutHref({ access, folio: searchedFolio, questionCode: pendingQuestionCode })}
              >
                Capturar pendiente
              </a>
            ) : null}
            {canComplete ? (
              <form
                action={completeHutQuestionnaireSectionForFieldAction.bind(
                  null,
                  searchedFolio,
                  workspace.participant.id,
                  workspace.participant.studyId,
                  sectionProgress.section
                )}
                className="mt-3"
              >
                <FieldHutAccessHiddenInputs access={access} />
                <button className="rounded-md border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800" type="submit">
                  Confirmar y cerrar sección
                </button>
              </form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function QuestionnaireForm({
  access,
  question,
  searchedFolio,
  workspace
}: {
  access: FieldHutAccessContext | null;
  question: HutQuestionDefinition;
  searchedFolio: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const savedAnswer = workspace.questionnaire.answers[question.code];
  const questions = applicableQuestions(workspace);
  const sectionQuestions = progressQuestionsForSection({
    answers: workspace.questionnaire.answers,
    applicableQuestions: questions,
    participantOrigin: workspace.participant.origin,
    section: question.section
  });
  const progressQuestions = sectionQuestions.length > 0
    ? sectionQuestions
    : questions.filter((candidate) => candidate.section === question.section);
  const questionIndex = progressQuestions.findIndex((candidate) => candidate.code === question.code);
  const nextQuestion = nextQuestionAfterCurrent({
    answers: workspace.questionnaire.answers,
    currentCode: question.code,
    questions
  });
  const progress = progressQuestions.length > 0 ? Math.round(((questionIndex >= 0 ? questionIndex + 1 : 1) / progressQuestions.length) * 100) : 100;

  return (
    <section className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm">
      {workspace.participant.testMode ? (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
          Modo prueba activo: este HUT puede avanzar sin esperar dias reales.
        </p>
      ) : null}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {progressSectionTitle(question.section)}
        </p>
        <p className="text-sm font-semibold text-zinc-600">
          Pregunta {questionIndex >= 0 ? questionIndex + 1 : "-"} de {progressQuestions.length}
        </p>
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-700">Producto: {productLabelForQuestion(question, workspace)}</p>
      <div className="mt-3 h-2 rounded-full bg-zinc-100" aria-label="Progreso de evaluacion">
        <div className="h-2 rounded-full bg-teal-600" style={{ width: `${progress}%` }} />
      </div>
      <SectionInstructions question={question} workspace={workspace} />
      <h3 className="mt-3 text-xl font-semibold text-zinc-950">{resolveHutQuestionText(question.label, workspace)}</h3>
      {question.displayTemplate ? (
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">
          {resolveHutQuestionText(question.displayTemplate, workspace)}
        </p>
      ) : null}
      {question.references?.length ? (
        <div className="mt-3 rounded-md border border-teal-100 bg-teal-50 p-3 text-sm text-teal-950">
          {question.references.map((reference) => (
            <p key={`${question.code}-${reference.source}`}>
              <span className="font-semibold">{resolveHutQuestionText(reference.label, workspace)}:</span>{" "}
              {resolveHutReference(reference.source, workspace)}
            </p>
          ))}
        </div>
      ) : null}
      <form
        action={saveHutQuestionnaireAnswerForFieldAction.bind(
          null,
          searchedFolio,
          workspace.participant.id,
          workspace.participant.studyId,
          question.code
        )}
        className="mt-5 space-y-4"
      >
        <FieldHutAccessHiddenInputs access={access} />
        <input name="returnQuestionCode" type="hidden" value={nextQuestion?.code ?? "__HUT_SUMMARY__"} />
        <HutQuestionInput answer={savedAnswer} question={question} workspace={workspace} />
        <HutFieldSubmitButton />
      </form>
      <p className="mt-4 text-sm text-zinc-600">
        {nextQuestion ? "Al guardar avanzaras automaticamente a la siguiente pregunta." : "Al guardar volveras al resumen de HUT."}
      </p>
    </section>
  );
}

function FieldHutAccessHiddenInputs({ access }: { access: FieldHutAccessContext | null }) {
  if (!access) {
    return null;
  }
  if (access.mode === "ADMIN") {
    return (
      <>
        <input name="mode" type="hidden" value="admin" />
        {access.studyId ? <input name="studyId" type="hidden" value={access.studyId} /> : null}
      </>
    );
  }

  return (
    <>
      <input name="accessType" type="hidden" value={access.mode === "SUPERVISOR_CODE" ? "SUPERVISOR" : "INTERVIEWER"} />
      <input name="interviewerCode" type="hidden" value={access.interviewerCode} />
    </>
  );
}

function fieldHutHref({
  access,
  folio,
  questionCode
}: {
  access: FieldHutAccessContext | null;
  folio: string;
  questionCode?: string | null;
}) {
  const params = new URLSearchParams({ folio });
  if (access?.mode === "INTERVIEWER_CODE") {
    params.set("interviewerCode", access.interviewerCode);
    params.set("accessType", "INTERVIEWER");
  }
  if (access?.mode === "SUPERVISOR_CODE") {
    params.set("interviewerCode", access.interviewerCode);
    params.set("accessType", "SUPERVISOR");
  }
  if (access?.mode === "ADMIN") {
    params.set("mode", "admin");
    if (access.studyId) {
      params.set("studyId", access.studyId);
    }
  }
  if (questionCode) {
    params.set("questionCode", questionCode);
  }

  return `/field/hut?${params.toString()}`;
}

function isAssignedFieldHutFolio(folio: string, participants: CltOperationsDetail[]): boolean {
  const normalizedFolio = folio.trim().toUpperCase();
  return participants.some((participant) => {
    const navFolio = participant.folio.trim().toUpperCase();
    const hutFolio = participant.hut.folio?.trim().toUpperCase() ?? "";
    return navFolio === normalizedFolio || hutFolio === normalizedFolio;
  });
}

function SectionInstructions({
  question,
  workspace
}: {
  question: HutQuestionDefinition;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const section = getHutV5Definition().sections.find((candidate) => candidate.id === question.section);
  const instructions = [
    ...(section?.instructions ?? []),
    ...(question.instructions ?? [])
  ];

  if (instructions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {instructions.map((instruction, index) => (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" key={`${question.code}-instruction-${index}`}>
          {instruction.title ? <p className="font-semibold">{resolveHutQuestionText(instruction.title, workspace)}</p> : null}
          <p>{resolveHutQuestionText(instruction.text, workspace)}</p>
        </div>
      ))}
    </div>
  );
}

function HutQuestionInput({
  answer,
  question,
  workspace
}: {
  answer: unknown;
  question: HutQuestionDefinition;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  if (question.type === "SHORT_TEXT") {
    return (
      <input
        className="min-h-12 w-full rounded-md border border-zinc-300 px-4 py-3 text-base"
        defaultValue={typeof answer === "string" || typeof answer === "number" ? String(answer) : ""}
        name={question.code}
        required={question.required}
      />
    );
  }
  if (question.type === "LONG_TEXT") {
    return (
      <textarea
        className="min-h-32 w-full rounded-md border border-zinc-300 px-4 py-3 text-base"
        defaultValue={typeof answer === "string" || typeof answer === "number" ? String(answer) : ""}
        name={question.code}
        required={question.required}
      />
    );
  }
  if (question.type === "SELECT") {
    const selectedValues = Array.isArray(answer) ? answer.map(String) : answer == null ? [] : [String(answer)];
    return (
      <div className="space-y-3">
        {question.options.map((option) => (
          <label className="block" key={option.value}>
            <input
              className="peer sr-only"
              defaultChecked={selectedValues.includes(option.value)}
              name={question.code}
              required={question.required}
              type={question.multiple ? "checkbox" : "radio"}
              value={option.value}
            />
            <span className={optionCardClass}>
              <span>{resolveHutQuestionText(option.label, workspace)}</span>
              {option.followUpPrompt ? <span className="text-xs font-medium text-zinc-500">{option.followUpPrompt}</span> : null}
            </span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "SCALE") {
    const selectedValue = answer == null ? "" : String(answer);
    return (
      <div className="space-y-3">
        {Array.from({ length: question.max - question.min + 1 }, (_, index) => question.min + index).map((value) => (
          <label className="block" key={value}>
            <input
              className="peer sr-only"
              defaultChecked={selectedValue === String(value)}
              name={question.code}
              required={question.required}
              type="radio"
              value={value}
            />
            <span className={optionCardClass}>
              <span>{scaleLabel(question, value)}</span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 peer-checked:bg-teal-100">
                {value}
              </span>
            </span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type !== "MATRIX") {
    if (question.type !== "RANKING") {
      return null;
    }

    const rankingAnswer = answer && typeof answer === "object" ? answer as Record<string, unknown> : {};
    return (
      <div className="space-y-3">
        {Array.from({ length: question.maxRank }, (_, index) => String(index + 1)).map((rank) => (
          <label className="block" key={`${question.code}-${rank}`}>
            <span className="text-sm font-semibold text-zinc-900">Lugar {rank}</span>
            <select
              className="mt-2 min-h-12 w-full rounded-md border border-zinc-300 px-4 py-3 text-base"
              defaultValue={rankingAnswer[rank] == null ? "" : String(rankingAnswer[rank])}
              name={`${question.code}.${rank}`}
              required={question.required}
            >
              <option value="">Selecciona una opcion</option>
              {question.options.map((option) => (
                <option key={`${rank}-${option.value}`} value={option.value}>
                  {option.value} - {resolveHutQuestionText(option.label, workspace)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  const rows = orderedMatrixRows(question, workspace);
  return (
    <div className="space-y-4">
      {question.randomizeRows ? <input name={`${question.code}.__rowOrder`} type="hidden" value={rows.map((row) => row.code).join("|")} /> : null}
      {rows.map((row) => (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={row.code}>
          <p className="text-sm font-semibold text-zinc-900">{resolveHutQuestionText(row.label, workspace)}</p>
          <div className="mt-3 space-y-2">
            {question.columns.map((column) => (
              <label className="block" key={`${row.code}-${column.value}`}>
                <input
                  className="peer sr-only"
                  defaultChecked={matrixAnswerValue(answer, row.code) === String(column.value)}
                  name={`${question.code}.${row.code}`}
                  required={question.required}
                  type="radio"
                  value={column.value}
                />
                <span className={optionCardClass}>
                  <span>{resolveHutQuestionText(column.label || String(column.value), workspace)}</span>
                  <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700">
                    {column.value}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function nextQuestionAfterCurrent({
  answers,
  currentCode,
  questions
}: {
  answers: Record<string, unknown>;
  currentCode: string;
  questions: HutQuestionDefinition[];
}) {
  const currentIndex = questions.findIndex((question) => question.code === currentCode);
  const currentSection = currentIndex >= 0 ? questions[currentIndex]?.section : null;
  const sectionQuestions = currentSection ? questions.filter((question) => question.section === currentSection) : questions;
  const sectionIndex = sectionQuestions.findIndex((question) => question.code === currentCode);
  const remainingQuestions = sectionIndex >= 0 ? sectionQuestions.slice(sectionIndex + 1) : sectionQuestions;
  return remainingQuestions.find((question) => question.required && !(question.code in answers))
    ?? remainingQuestions.find((question) => !(question.code in answers))
    ?? null;
}

function applicableQuestions(workspace: HutFieldQuestionnaireWorkspace) {
  const applicableCodes = new Set(workspace.questionnaire.applicableQuestionCodes);
  return getHutQuestions().filter((question) => applicableCodes.has(question.code) && isHutOperationalPanelSection(question.section));
}

function productLabelForQuestion(question: HutQuestionDefinition, workspace: HutFieldQuestionnaireWorkspace): string {
  if (question.section === "EVALUACION_PRIMER_PERFUME" || question.section === "PRIMERA_VISITA") {
    return workspace.rotation.eva1 ?? "EVA1 no asignado";
  }
  if (question.section === "EVALUACION_SEGUNDO_PERFUME" || question.section === "SEGUNDA_VISITA") {
    return workspace.rotation.eva2 ?? "EVA2 no asignado";
  }
  if (question.section === "COMPARATIVA") {
    return `EVA1 ${workspace.rotation.eva1 ?? "No asignada"} / EVA2 ${workspace.rotation.eva2 ?? "No asignada"}`;
  }

  return "No aplica";
}

function answerLabel(code: string, workspace: HutFieldQuestionnaireWorkspace): string {
  const question = getHutQuestions().find((candidate) => candidate.code === code);
  return question ? resolveHutQuestionText(question.label, workspace) : code;
}

function resolveHutQuestionText(text: string, workspace: HutFieldQuestionnaireWorkspace): string {
  const replacements: Record<string, string> = {
    FOLIO: workspace.participant.hutFolio ?? workspace.participant.navFolio ?? "",
    HUT_EVA1: workspace.rotation.eva1 ?? "No asignado",
    HUT_EVA2: workspace.rotation.eva2 ?? "No asignado",
    PARTICIPANT_NAME: workspace.participant.name,
    TODAY: formatDateMexicoCity(new Date())
  };

  return Object.entries(replacements).reduce((current, [token, value]) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return current
      .replace(new RegExp(`{{\\s*${escaped}\\s*}}`, "g"), value)
      .replace(new RegExp(`\\b${escaped}\\b`, "g"), value);
  }, text);
}

function resolveHutReference(source: string, workspace: HutFieldQuestionnaireWorkspace): string {
  return resolveHutQuestionText(source, workspace);
}

function buildFieldPhotoTimeline(workspace: HutFieldQuestionnaireWorkspace): HutPhotoTimelineSlot[] {
  return buildHutPhotoTimeline({
    applicationEvidence: workspace.photos
      .filter((photo) => photo.source === "PHASE_EVIDENCE" && photo.phase)
      .map((photo) => ({
        capturedAt: photo.capturedAt,
        phase: photo.phase!,
        productCode: photo.productCode
      })),
    dailyEntries: workspace.photos
      .filter((photo) => photo.source === "DAILY_ENTRY")
      .map((photo) => ({
        capturedAt: photo.capturedAt,
        capturedLocalDate: photo.capturedLocalDate,
        productCode: photo.productCode,
        useDayNumber: photo.useDayNumber
      })),
    legacyMirroredPlacementPhoto: workspace.legacyMirroredPlacementPhoto,
    rotation: {
      eva1: workspace.rotation.eva1,
      eva2: workspace.rotation.eva2
    },
    photoCaptureBlocked: workspace.participant.origin === "HUT_DIRECTO" && workspace.questionnaire.filterStatus !== "COMPLETED",
    testMode: workspace.participant.testMode
  });
}

function fieldTimelineStatusLabel(slot: HutPhotoTimelineSlot): string {
  if (slot.status === "COMPLETED") {
    return "Completado";
  }
  if (slot.status === "AVAILABLE") {
    return "Disponible";
  }
  return slot.isCapturableWithCurrentModel ? "Pendiente" : "Programado";
}

function scaleLabel(question: Extract<HutQuestionDefinition, { type: "SCALE" }>, value: number): string {
  return question.labels?.[value] ?? `Punto ${value}`;
}

function orderedMatrixRows(question: Extract<HutQuestionDefinition, { type: "MATRIX" }>, workspace: HutFieldQuestionnaireWorkspace) {
  if (!question.randomizeRows) {
    return question.rows;
  }

  const seed = `${workspace.participant.id}:${question.code}`;
  return [...question.rows].sort((left, right) => stableHash(`${seed}:${left.code}`) - stableHash(`${seed}:${right.code}`));
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function matrixAnswerValue(answer: unknown, rowCode: string): string {
  if (!answer || typeof answer !== "object") {
    return "";
  }

  const value = (answer as Record<string, unknown>)[rowCode];
  return value == null ? "" : String(value);
}

function originLabel(value: string): string {
  const labels: Record<string, string> = {
    CLT_HUT: "CLT + HUT",
    HUT_DIRECTO: "HUT directo"
  };

  return labels[value] ?? value;
}

function filterStatusLabel(value: HutFieldQuestionnaireWorkspace["questionnaire"]["filterStatus"]): string {
  const labels: Record<HutFieldQuestionnaireWorkspace["questionnaire"]["filterStatus"], string> = {
    COMPLETED: "Completado",
    PENDING: "Pendiente",
    REJECTED: "Rechazado"
  };

  return labels[value];
}

function statusLabel(value: string): string {
  if (value === "COMPLETED" || value === "USED" || value === "VALIDATED") {
    return "Completado";
  }
  if (value === "IN_PROGRESS" || value.includes("IN_PROGRESS")) {
    return "En progreso";
  }
  if (value === "PENDING" || value.includes("PENDING") || value === "GENERATED") {
    return "Pendiente";
  }
  if (value === "NOT_STARTED") {
    return "No iniciado";
  }

  return value;
}

function formatAnswer(answer: unknown): string {
  if (answer == null) {
    return "";
  }
  if (typeof answer === "object") {
    return JSON.stringify(answer);
  }

  return String(answer);
}

const optionCardClass =
  "flex min-h-12 items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:text-teal-950 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-200";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-zinc-950">{value}</p>
    </div>
  );
}


