import {
  addScreenerOptionAction,
  addScreenerQuestionAction,
  addScreenerRuleAction,
  clearScreenerNseAction,
  createScreenerDraftAction,
  deleteScreenerOptionAction,
  deleteScreenerQuestionAction,
  deleteScreenerRuleAction,
  moveScreenerOptionAction,
  moveScreenerQuestionAction,
  publishScreenerAction,
  retireScreenerVersionAction,
  saveScreenerMetadataAction,
  saveScreenerNseAction,
  updateScreenerOptionAction,
  updateScreenerQuestionAction
} from "@/modules/screener/actions";
import type {
  ScreenerDefinition,
  ScreenerOption,
  ScreenerQuestion,
  ScreenerQuestionType,
  ScreenerRule
} from "@/modules/screener";
import type {
  ScreenerDraftRecord,
  ScreenerStudySummary,
  ScreenerVersionRecord
} from "@/modules/screener/repository";

type ScreenerBuilderProps = {
  definition: ScreenerDefinition | null;
  draft: ScreenerDraftRecord | null;
  readOnly: boolean;
  study: ScreenerStudySummary;
  versions: ScreenerVersionRecord[];
};

const questionTypes: ScreenerQuestionType[] = [
  "CONSENT_YES_NO",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "INTEGER",
  "SHORT_TEXT",
  "LONG_TEXT",
  "INTERVIEWER_CHECKLIST"
];

const profileBindings = [
  "NAME",
  "PHONE",
  "EMAIL",
  "ADDRESS",
  "CITY",
  "AGE",
  "GENDER",
  "EXTERNAL_REFERENCE"
] as const;

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function ScreenerBuilder({
  definition,
  draft,
  readOnly,
  study,
  versions
}: ScreenerBuilderProps) {
  return (
    <div className="space-y-6">
      <StudySummary study={study} />

      {!draft || !definition ? (
        <CreateDraftPanel readOnly={readOnly} studyId={study.id} />
      ) : (
        <>
          <DraftStatusPanel draft={draft} definition={definition} />
          <MetadataPanel definition={definition} readOnly={readOnly} studyId={study.id} />
          <QuestionPanel definition={definition} readOnly={readOnly} studyId={study.id} />
          <RulePanel definition={definition} readOnly={readOnly} studyId={study.id} />
          <NsePanel definition={definition} readOnly={readOnly} studyId={study.id} />
          <PublishPanel definition={definition} readOnly={readOnly} studyId={study.id} />
        </>
      )}

      <VersionHistory readOnly={readOnly} studyId={study.id} versions={versions} />
    </div>
  );
}

function StudySummary({ study }: { study: ScreenerStudySummary }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">{study.name}</h2>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="font-medium text-zinc-500">Codigo</dt>
          <dd className="mt-1 break-all font-mono text-zinc-900">{study.code}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Estado</dt>
          <dd className="mt-1 text-zinc-900">{study.status}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Zona horaria</dt>
          <dd className="mt-1 text-zinc-900">{study.timeZoneIana}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Edicion</dt>
          <dd className="mt-1 text-zinc-900">
            {study.status === "DRAFT" ? "Disponible" : "Solo lectura"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function CreateDraftPanel({ readOnly, studyId }: { readOnly: boolean; studyId: string }) {
  return (
    <section className="rounded-lg border border-dashed border-teal-300 bg-teal-50 p-5">
      <h2 className="text-lg font-semibold text-zinc-950">Borrador de screener</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        Crea un borrador reutilizable para este estudio. La version publicada se generara despues.
      </p>
      <form action={createScreenerDraftAction.bind(null, studyId)} className="mt-4">
        <button className={primaryButtonClass} disabled={readOnly} type="submit">
          Crear borrador
        </button>
      </form>
    </section>
  );
}

function DraftStatusPanel({
  definition,
  draft
}: {
  definition: ScreenerDefinition;
  draft: ScreenerDraftRecord;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Estado del borrador</h2>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="font-medium text-zinc-500">Titulo</dt>
          <dd className="mt-1 text-zinc-900">{definition.title}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Preguntas</dt>
          <dd className="mt-1 text-zinc-900">{definition.questions.length}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Reglas</dt>
          <dd className="mt-1 text-zinc-900">{definition.rules.length}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Actualizado</dt>
          <dd className="mt-1 text-zinc-900">{dateFormatter.format(draft.updatedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function MetadataPanel({
  definition,
  readOnly,
  studyId
}: {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="Estos datos forman parte del snapshot publicado."
        title="Resumen del cuestionario"
      />
      <form action={saveScreenerMetadataAction.bind(null, studyId)} className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Titulo
          <input className={inputClass} defaultValue={definition.title} disabled={readOnly} name="title" />
        </label>
        <label className={labelClass}>
          Descripcion opcional
          <input
            className={inputClass}
            defaultValue={definition.description ?? ""}
            disabled={readOnly}
            name="description"
          />
        </label>
        <div className="md:col-span-2">
          <button className={primaryButtonClass} disabled={readOnly} type="submit">
            Guardar borrador
          </button>
        </div>
      </form>
    </section>
  );
}

function QuestionPanel({
  definition,
  readOnly,
  studyId
}: {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
}) {
  const questions = [...definition.questions].sort((left, right) => left.order - right.order);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="Agrega, edita, elimina y reordena preguntas. Los IDs tecnicos son estables."
        title="Editor estructurado de preguntas"
      />
      <div className="space-y-4">
        {questions.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            Todavia no hay preguntas en el borrador.
          </p>
        ) : (
          questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              readOnly={readOnly}
              studyId={studyId}
            />
          ))
        )}
      </div>
      <div className="mt-6 rounded-md border border-teal-100 bg-teal-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-800">
          Agregar pregunta
        </h3>
        <QuestionForm action={addScreenerQuestionAction.bind(null, studyId)} readOnly={readOnly} />
      </div>
    </section>
  );
}

function QuestionCard({
  question,
  readOnly,
  studyId
}: {
  question: ScreenerQuestion;
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <article className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold text-teal-700">{question.id}</p>
          <h3 className="text-base font-semibold text-zinc-950">
            {question.order}. {question.text}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {question.type} · {question.dataDestination}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TinyForm action={moveScreenerQuestionAction.bind(null, studyId, question.id, "up")} disabled={readOnly}>
            Subir
          </TinyForm>
          <TinyForm action={moveScreenerQuestionAction.bind(null, studyId, question.id, "down")} disabled={readOnly}>
            Bajar
          </TinyForm>
          <TinyForm action={deleteScreenerQuestionAction.bind(null, studyId, question.id)} disabled={readOnly}>
            Eliminar
          </TinyForm>
        </div>
      </div>

      <QuestionForm
        action={updateScreenerQuestionAction.bind(null, studyId, question.id)}
        question={question}
        readOnly={readOnly}
      />

      {"options" in question ? (
        <OptionPanel options={question.options} questionId={question.id} readOnly={readOnly} studyId={studyId} />
      ) : null}
    </article>
  );
}

function QuestionForm({
  action,
  question,
  readOnly
}: {
  action: (formData: FormData) => Promise<void>;
  question?: ScreenerQuestion;
  readOnly: boolean;
}) {
  return (
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-3">
      <label className={labelClass}>
        ID tecnico
        <input
          className={inputClass}
          defaultValue={question?.id ?? ""}
          name="id"
          readOnly={Boolean(question)}
          required
        />
      </label>
      <label className={labelClass}>
        Tipo
        <select className={inputClass} defaultValue={question?.type ?? "SINGLE_CHOICE"} disabled={readOnly} name="type">
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Destino de datos
        <select
          className={inputClass}
          defaultValue={question?.dataDestination ?? "SCREENING"}
          disabled={readOnly}
          name="dataDestination"
        >
          <option value="SCREENING">SCREENING</option>
          <option value="PARTICIPANT_PROFILE">PARTICIPANT_PROFILE</option>
          <option value="OPERATIONAL_INTERNAL">OPERATIONAL_INTERNAL</option>
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        Texto
        <input className={inputClass} defaultValue={question?.text ?? ""} disabled={readOnly} name="text" required />
      </label>
      <label className={labelClass}>
        Binding de perfil
        <select
          className={inputClass}
          defaultValue={question?.profileBinding ?? ""}
          disabled={readOnly}
          name="profileBinding"
        >
          <option value="">No aplica</option>
          {profileBindings.map((binding) => (
            <option key={binding} value={binding}>
              {binding}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        Ayuda opcional
        <input className={inputClass} defaultValue={question?.helpText ?? ""} disabled={readOnly} name="helpText" />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={question?.required ?? false} disabled={readOnly} name="required" type="checkbox" />
        Obligatoria
      </label>
      <label className={labelClass}>
        Min numero
        <input className={inputClass} defaultValue={question?.validation.min ?? ""} disabled={readOnly} name="validationMin" />
      </label>
      <label className={labelClass}>
        Max numero
        <input className={inputClass} defaultValue={question?.validation.max ?? ""} disabled={readOnly} name="validationMax" />
      </label>
      <label className={labelClass}>
        Max texto
        <input
          className={inputClass}
          defaultValue={question?.validation.maxLength ?? ""}
          disabled={readOnly}
          name="validationMaxLength"
        />
      </label>
      <label className={labelClass}>
        Min selecciones
        <input
          className={inputClass}
          defaultValue={question?.validation.minSelections ?? ""}
          disabled={readOnly}
          name="validationMinSelections"
        />
      </label>
      <label className={labelClass}>
        Max selecciones
        <input
          className={inputClass}
          defaultValue={question?.validation.maxSelections ?? ""}
          disabled={readOnly}
          name="validationMaxSelections"
        />
      </label>
      <div className="md:col-span-3">
        <button className={secondaryButtonClass} disabled={readOnly} type="submit">
          {question ? "Actualizar pregunta" : "Agregar pregunta"}
        </button>
      </div>
    </form>
  );
}

function OptionPanel({
  options,
  questionId,
  readOnly,
  studyId
}: {
  options: ScreenerOption[];
  questionId: string;
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <div className="mt-5 rounded-md border border-white bg-white p-4">
      <h4 className="text-sm font-semibold text-zinc-900">Opciones</h4>
      <div className="mt-3 space-y-3">
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">Esta pregunta todavia no tiene opciones.</p>
        ) : (
          options
            .sort((left, right) => left.order - right.order)
            .map((option) => (
              <OptionForm
                key={option.value}
                option={option}
                questionId={questionId}
                readOnly={readOnly}
                studyId={studyId}
              />
            ))
        )}
      </div>
      <div className="mt-4 rounded-md bg-zinc-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Agregar opcion</p>
        <OptionForm questionId={questionId} readOnly={readOnly} studyId={studyId} />
      </div>
    </div>
  );
}

function OptionForm({
  option,
  questionId,
  readOnly,
  studyId
}: {
  option?: ScreenerOption;
  questionId: string;
  readOnly: boolean;
  studyId: string;
}) {
  const action = option
    ? updateScreenerOptionAction.bind(null, studyId, questionId, option.value)
    : addScreenerOptionAction.bind(null, studyId, questionId);
  const firstAction = option?.actions[0];

  return (
    <form action={action} className="grid gap-3 rounded-md border border-zinc-100 p-3 md:grid-cols-4">
      <label className={labelClass}>
        Valor
        <input
          className={inputClass}
          defaultValue={option?.value ?? ""}
          name="value"
          readOnly={Boolean(option)}
          required
        />
      </label>
      <label className={labelClass}>
        Etiqueta
        <input className={inputClass} defaultValue={option?.label ?? ""} disabled={readOnly} name="label" required />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={option?.isOther ?? false} disabled={readOnly} name="isOther" type="checkbox" />
        Es Otro
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          defaultChecked={option?.otherTextRequired ?? false}
          disabled={readOnly}
          name="otherTextRequired"
          type="checkbox"
        />
        Otro exige texto
      </label>
      <label className={labelClass}>
        Accion
        <select className={inputClass} defaultValue={firstAction?.type ?? "NONE"} disabled={readOnly} name="actionType">
          <option value="NONE">NONE</option>
          <option value="CONTINUE">CONTINUE</option>
          <option value="TERMINATE">TERMINATE</option>
          <option value="FLAG">FLAG</option>
          <option value="PENDING_REVIEW">PENDING_REVIEW</option>
        </select>
      </label>
      <label className={labelClass}>
        Codigo accion
        <input
          className={inputClass}
          defaultValue={getActionCode(firstAction)}
          disabled={readOnly}
          name="actionCode"
        />
      </label>
      <label className={labelClass}>
        Razon
        <input
          className={inputClass}
          defaultValue={getActionReason(firstAction)}
          disabled={readOnly}
          name="actionReason"
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          defaultChecked={getActionRequiresReview(firstAction)}
          disabled={readOnly}
          name="actionRequiresReview"
          type="checkbox"
        />
        Requiere revision
      </label>
      <div className="flex flex-wrap gap-2 md:col-span-4">
        <button className={secondaryButtonClass} disabled={readOnly} type="submit">
          {option ? "Actualizar opcion" : "Agregar opcion"}
        </button>
        {option ? (
          <>
            <button
              className={secondaryButtonClass}
              disabled={readOnly}
              formAction={moveScreenerOptionAction.bind(null, studyId, questionId, option.value, "up")}
              type="submit"
            >
              Subir
            </button>
            <button
              className={secondaryButtonClass}
              disabled={readOnly}
              formAction={moveScreenerOptionAction.bind(null, studyId, questionId, option.value, "down")}
              type="submit"
            >
              Bajar
            </button>
            <button
              className={secondaryButtonClass}
              disabled={readOnly}
              formAction={deleteScreenerOptionAction.bind(null, studyId, questionId, option.value)}
              type="submit"
            >
              Eliminar
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}

function RulePanel({
  definition,
  readOnly,
  studyId
}: {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="Configura reglas sin expresiones arbitrarias. Los valores multiples se separan por coma."
        title="Reglas y terminaciones"
      />
      <div className="space-y-2">
        {definition.rules.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            No hay reglas adicionales.
          </p>
        ) : (
          definition.rules.map((rule) => (
            <RuleItem key={rule.id} readOnly={readOnly} rule={rule} studyId={studyId} />
          ))
        )}
      </div>
      <form action={addScreenerRuleAction.bind(null, studyId)} className="mt-5 grid gap-3 md:grid-cols-4">
        <label className={labelClass}>
          ID regla
          <input className={inputClass} disabled={readOnly} name="id" required />
        </label>
        <label className={labelClass}>
          Pregunta
          <input className={inputClass} disabled={readOnly} name="questionId" required />
        </label>
        <label className={labelClass}>
          Condicion
          <select className={inputClass} disabled={readOnly} name="conditionType">
            <option value="ANSWER_EQUALS">ANSWER_EQUALS</option>
            <option value="ANY_SELECTED">ANY_SELECTED</option>
            <option value="ALL_SELECTED">ALL_SELECTED</option>
            <option value="NUMBER_RANGE">NUMBER_RANGE</option>
          </select>
        </label>
        <label className={labelClass}>
          Resultado
          <select className={inputClass} disabled={readOnly} name="outcomeType">
            <option value="TERMINATE">TERMINATE</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="FLAG">FLAG</option>
          </select>
        </label>
        <label className={labelClass}>
          Valor
          <input className={inputClass} disabled={readOnly} name="value" />
        </label>
        <label className={labelClass}>
          Valores
          <input className={inputClass} disabled={readOnly} name="values" placeholder="a,b,c" />
        </label>
        <label className={labelClass}>
          Min
          <input className={inputClass} disabled={readOnly} name="min" />
        </label>
        <label className={labelClass}>
          Max
          <input className={inputClass} disabled={readOnly} name="max" />
        </label>
        <label className={labelClass}>
          Codigo
          <input className={inputClass} disabled={readOnly} name="outcomeCode" required />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Razon
          <input className={inputClass} disabled={readOnly} name="outcomeReason" />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input disabled={readOnly} name="outcomeRequiresReview" type="checkbox" />
          Bandera requiere revision
        </label>
        <div className="md:col-span-4">
          <button className={secondaryButtonClass} disabled={readOnly} type="submit">
            Agregar regla
          </button>
        </div>
      </form>
    </section>
  );
}

function RuleItem({
  readOnly,
  rule,
  studyId
}: {
  readOnly: boolean;
  rule: ScreenerRule;
  studyId: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-mono text-sm font-semibold text-zinc-900">{rule.id}</p>
        <p className="text-xs text-zinc-600">
          {rule.condition.type} → {rule.outcome.type}
        </p>
      </div>
      <FormButton action={deleteScreenerRuleAction.bind(null, studyId, rule.id)} disabled={readOnly}>
        Eliminar regla
      </FormButton>
    </div>
  );
}

function NsePanel({
  definition,
  readOnly,
  studyId
}: {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="Usa lineas estructuradas; no JSON. Entrada: questionId|valor=puntaje,valor=puntaje|missing=0. Rango: codigo|etiqueta|min|max|true."
        title="Calculo NSE"
      />
      {definition.nse ? (
        <div className="mb-4 rounded-md border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
          NSE activo: {definition.nse.label} con {definition.nse.inputs.length} entradas y{" "}
          {definition.nse.ranges.length} rangos.
        </div>
      ) : (
        <p className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          El borrador no tiene calculo NSE configurado.
        </p>
      )}
      <form action={saveScreenerNseAction.bind(null, studyId)} className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Codigo
          <input className={inputClass} defaultValue={definition.nse?.code ?? "nse"} disabled={readOnly} name="code" />
        </label>
        <label className={labelClass}>
          Etiqueta
          <input className={inputClass} defaultValue={definition.nse?.label ?? "NSE"} disabled={readOnly} name="label" />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Entradas
          <textarea
            className={inputClass}
            defaultValue={formatNseInputs(definition.nse)}
            disabled={readOnly}
            name="inputsText"
            rows={4}
          />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Rangos
          <textarea
            className={inputClass}
            defaultValue={formatNseRanges(definition.nse)}
            disabled={readOnly}
            name="rangesText"
            rows={4}
          />
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className={secondaryButtonClass} disabled={readOnly} type="submit">
            Guardar NSE
          </button>
          <button
            className={secondaryButtonClass}
            disabled={readOnly}
            formAction={clearScreenerNseAction.bind(null, studyId)}
            type="submit"
          >
            Retirar NSE
          </button>
        </div>
      </form>
    </section>
  );
}

function PublishPanel({
  definition,
  readOnly,
  studyId
}: {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
}) {
  const optionQuestionsWithoutOptions = definition.questions.filter(
    (question) => "options" in question && question.options.length === 0
  );
  const canPublish = definition.questions.length > 0 && optionQuestionsWithoutOptions.length === 0;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="La publicacion genera hash SHA-256, version consecutiva y retira la version activa previa."
        title="Validacion y publicacion"
      />
      <ul className="mb-4 space-y-2 text-sm text-zinc-700">
        <li>Preguntas configuradas: {definition.questions.length}</li>
        <li>Preguntas de opcion sin opciones: {optionQuestionsWithoutOptions.length}</li>
        <li>Reglas configuradas: {definition.rules.length}</li>
        <li>Bloque NSE: {definition.nse ? "Configurado" : "No configurado"}</li>
      </ul>
      <form action={publishScreenerAction.bind(null, studyId)}>
        <button className={primaryButtonClass} disabled={readOnly || !canPublish} type="submit">
          Publicar version
        </button>
      </form>
    </section>
  );
}

function VersionHistory({
  readOnly,
  studyId,
  versions
}: {
  readOnly: boolean;
  studyId: string;
  versions: ScreenerVersionRecord[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        description="Las versiones publicadas son de solo lectura. Las retiradas se conservan para trazabilidad."
        title="Historial de versiones"
      />
      {versions.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Todavia no hay versiones publicadas.
        </p>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => (
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-4" key={version.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-950">Version {version.versionNumber}</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {version.status} · publicada {dateFormatter.format(version.publishedAt)}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-500">
                    {version.definitionHash}
                  </p>
                </div>
                {version.status === "ACTIVE" ? (
                  <FormButton
                    action={retireScreenerVersionAction.bind(null, studyId, version.id)}
                    disabled={readOnly}
                  >
                    Retirar version
                  </FormButton>
                ) : null}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-teal-700">
                  Vista tecnica solo lectura
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-50">
                  {JSON.stringify(version.definitionJson, null, 2)}
                </pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function TinyForm({
  action,
  children,
  disabled
}: {
  action: (formData: FormData) => Promise<void>;
  children: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <button className={tinyButtonClass} disabled={disabled} type="submit">
        {children}
      </button>
    </form>
  );
}

function FormButton({
  action,
  children,
  disabled
}: {
  action: (formData: FormData) => Promise<void>;
  children: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <button className={secondaryButtonClass} disabled={disabled} type="submit">
        {children}
      </button>
    </form>
  );
}

function formatNseInputs(nse: ScreenerDefinition["nse"]): string {
  if (!nse) {
    return "";
  }

  return nse.inputs
    .map((input) => {
      const scores = Object.entries(input.scoreByAnswer)
        .map(([value, score]) => `${value}=${score}`)
        .join(",");

      return `${input.questionId}|${scores}|missing=${input.missingScore}`;
    })
    .join("\n");
}

function formatNseRanges(nse: ScreenerDefinition["nse"]): string {
  if (!nse) {
    return "";
  }

  return nse.ranges
    .map((range) => `${range.code}|${range.label}|${range.min}|${range.max}|${range.eligible}`)
    .join("\n");
}

function getActionCode(action: ScreenerOption["actions"][number] | undefined): string {
  return action && "code" in action ? action.code : "";
}

function getActionReason(action: ScreenerOption["actions"][number] | undefined): string {
  return action && "reason" in action ? action.reason : "";
}

function getActionRequiresReview(action: ScreenerOption["actions"][number] | undefined): boolean {
  return action && "requiresReview" in action ? action.requiresReview : false;
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
const tinyButtonClass =
  "inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
