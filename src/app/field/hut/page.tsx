import {
  buildHutPhotoTimeline,
  createHutRepository,
  formatHutPhotoTimelineSlotTitle,
  getHutQuestions,
  getHutV5Definition,
  resolveHutPhaseCodeSlotTimelineLabel,
  resolveHutPhotoTimelinePhaseLabel,
  resolveHutPhotoTimelineUseDayLabel,
  resolveHutOperationalStatusLabel,
  type HutFieldQuestionnaireWorkspace,
  type HutPhotoTimelineSlot,
  type HutQuestionDefinition,
  type HutQuestionnaireSectionId
} from "@/modules/hut";
import {
  completeHutQuestionnaireSectionForFieldAction,
  saveHutQuestionnaireAnswerForFieldAction
} from "@/modules/hut/actions";
import { requireCapability } from "@/shared/auth/session";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { HutFieldSubmitButton } from "./HutFieldSubmitButton";

export const dynamic = "force-dynamic";

type FieldHutPageProps = {
  searchParams?: Promise<{
    folio?: string;
    hutError?: string;
    hutMessage?: string;
    questionCode?: string;
  }>;
};

export default async function FieldHutPage({ searchParams }: FieldHutPageProps) {
  await requireCapability("field:access");
  const query = await searchParams;
  const folio = String(query?.folio ?? "").trim().toUpperCase();
  const workspaceResult = folio
    ? await createHutRepository().getFieldQuestionnaireWorkspace({ folio })
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

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
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
            selectedQuestionCode={String(query?.questionCode ?? "").trim()}
            workspace={workspaceResult.data}
            searchedFolio={folio}
          />
        ) : null}
      </div>
    </main>
  );
}

function FieldHutWorkspace({
  searchedFolio,
  selectedQuestionCode,
  workspace
}: {
  searchedFolio: string;
  selectedQuestionCode: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const questions = applicableQuestions(workspace);
  const requiredQuestions = questions.filter((question) => question.required);
  const selectedQuestion = questions.find((question) => question.code === selectedQuestionCode) ?? null;
  const nextQuestion = selectedQuestion
    ?? requiredQuestions.find((question) => !(question.code in workspace.questionnaire.answers))
    ?? questions.find((question) => !(question.code in workspace.questionnaire.answers))
    ?? null;
  const answeredRequired = requiredQuestions.filter((question) => question.code in workspace.questionnaire.answers).length;
  const progress = requiredQuestions.length > 0 ? Math.round((answeredRequired / requiredQuestions.length) * 100) : 100;
  const hutTimeline = buildFieldPhotoTimeline(workspace);
  const photoTimelineSlots = hutTimeline.filter((slot) => slot.participantTask);
  const evaluationTimelineSlots = hutTimeline.filter((slot) => slot.interviewerTask);

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
          <Fact label="Modo prueba" value={workspace.participant.testMode ? "Activo" : "Inactivo"} />
        </div>
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
                  {slot.evidence?.capturedAt ? <p className="mt-1 text-zinc-600">Foto: {slot.evidence.capturedAt.toLocaleString("es-MX")}</p> : null}
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
                    <p className="mt-1 text-zinc-600">Registro historico: {slot.evidence.capturedAt.toLocaleString("es-MX")}</p>
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
                  {photo.source === "PHASE_EVIDENCE"
                    ? resolveHutPhotoTimelinePhaseLabel(photo.phase)
                    : resolveHutPhotoTimelineUseDayLabel(photo.useDayNumber)}
                </p>
                <p className="mt-1 text-zinc-600">Producto: {photo.productCode ?? "No asignado"}</p>
                <p className="text-zinc-600">Fecha: {photo.capturedAt.toLocaleString("es-MX")}</p>
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
            {answeredRequired}/{requiredQuestions.length}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-100">
          <div className="h-2 rounded-full bg-teal-600" style={{ width: `${progress}%` }} />
        </div>
        <SectionProgressControls searchedFolio={searchedFolio} workspace={workspace} />
      </section>

      {nextQuestion ? (
        <QuestionnaireForm question={nextQuestion} searchedFolio={searchedFolio} workspace={workspace} />
      ) : (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-emerald-950">Cuestionario sin preguntas pendientes</h3>
          <p className="mt-2 text-sm text-emerald-900">Revisa las secciones pendientes de cerrar antes de dar por terminada la evaluación.</p>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">Respuestas existentes</h3>
        {Object.entries(workspace.questionnaire.answers).length ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(workspace.questionnaire.answers).map(([code, answer]) => (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={code}>
                <dt className="font-semibold text-zinc-950">
                  <a className="text-teal-700 hover:text-teal-800" href={`/field/hut?folio=${encodeURIComponent(searchedFolio)}&questionCode=${encodeURIComponent(code)}`}>
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
    </div>
  );
}

function SectionProgressControls({
  searchedFolio,
  workspace
}: {
  searchedFolio: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const questions = applicableQuestions(workspace);
  const visitsBySection = new Map(workspace.questionnaire.visits.map((visit) => [visit.section, visit]));
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {getHutV5Definition().sections.map((section) => {
        const sectionQuestions = questions.filter((question) => question.section === section.id);
        if (!sectionQuestions.length) {
          return null;
        }
        const required = sectionQuestions.filter((question) => question.required);
        const pending = required.filter((question) => !(question.code in workspace.questionnaire.answers));
        const visit = visitsBySection.get(section.id);
        const canComplete = pending.length === 0 && visit?.status !== "COMPLETED";
        return (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm" key={section.id}>
            <p className="font-semibold text-zinc-950">{section.title}</p>
            <p className="mt-1 text-zinc-600">
              {required.length - pending.length}/{required.length} obligatorias · {statusLabel(visit?.status ?? "PENDING")}
            </p>
            {canComplete ? (
              <form
                action={completeHutQuestionnaireSectionForFieldAction.bind(
                  null,
                  searchedFolio,
                  workspace.participant.id,
                  workspace.participant.studyId,
                  section.id
                )}
                className="mt-3"
              >
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
  question,
  searchedFolio,
  workspace
}: {
  question: HutQuestionDefinition;
  searchedFolio: string;
  workspace: HutFieldQuestionnaireWorkspace;
}) {
  const savedAnswer = workspace.questionnaire.answers[question.code];
  const questions = applicableQuestions(workspace);
  const questionIndex = questions.findIndex((candidate) => candidate.code === question.code);
  const nextQuestion = nextQuestionAfterCurrent({
    answers: workspace.questionnaire.answers,
    currentCode: question.code,
    questions
  });

  return (
    <section className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {sectionTitle(question.section)}
        </p>
        <p className="text-sm font-semibold text-zinc-600">
          Pregunta {questionIndex >= 0 ? questionIndex + 1 : "-"} de {questions.length}
        </p>
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
        <input name="returnQuestionCode" type="hidden" value={question.code} />
        <HutQuestionInput answer={savedAnswer} question={question} workspace={workspace} />
        <HutFieldSubmitButton />
      </form>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {savedAnswer == null ? (
          <p className="text-sm text-zinc-600">Guarda la respuesta para habilitar Continuar.</p>
        ) : nextQuestion ? (
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-teal-700 px-4 py-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
            href={`/field/hut?folio=${encodeURIComponent(searchedFolio)}&questionCode=${encodeURIComponent(nextQuestion.code)}`}
          >
            Continuar
          </a>
        ) : (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
            No hay preguntas pendientes. Revisa y cierra las secciones completadas.
          </p>
        )}
      </div>
    </section>
  );
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
    const selectedValue = answer == null ? "" : String(answer);
    return (
      <div className="space-y-3">
        {question.options.map((option) => (
          <label className="block" key={option.value}>
            <input
              className="peer sr-only"
              defaultChecked={selectedValue === option.value}
              name={question.code}
              required={question.required}
              type="radio"
              value={option.value}
            />
            <span className={optionCardClass}>
              {resolveHutQuestionText(option.label, workspace)}
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
    return null;
  }

  return (
    <div className="space-y-4">
      {question.rows.map((row) => (
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
  const remainingQuestions = currentIndex >= 0 ? questions.slice(currentIndex + 1) : questions;
  return remainingQuestions.find((question) => question.required && !(question.code in answers))
    ?? remainingQuestions.find((question) => !(question.code in answers))
    ?? questions.find((question) => question.required && !(question.code in answers))
    ?? questions.find((question) => !(question.code in answers))
    ?? null;
}

function applicableQuestions(workspace: HutFieldQuestionnaireWorkspace) {
  const applicableCodes = new Set(workspace.questionnaire.applicableQuestionCodes);
  return getHutQuestions().filter((question) => applicableCodes.has(question.code));
}

function sectionTitle(section: HutQuestionnaireSectionId) {
  return getHutV5Definition().sections.find((candidate) => candidate.id === section)?.title ?? section;
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
    TODAY: new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Mexico_City",
      year: "numeric"
    }).format(new Date())
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
    rotation: {
      eva1: workspace.rotation.eva1,
      eva2: workspace.rotation.eva2
    }
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
