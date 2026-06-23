import {
  addScreenerQuestionAction,
  createScreenerDraftAction,
  deleteScreenerQuestionAction,
  moveScreenerQuestionAction,
  publishScreenerAction,
  retireScreenerVersionAction,
  saveScreenerMetadataAction,
  updateScreenerQuestionAction
} from "@/modules/screener/actions";
import type {
  ParticipantProfileBinding,
  ScreenerDataDestination,
  ScreenerDefinition,
  ScreenerOption,
  ScreenerQuestion,
  ScreenerQuestionType
} from "@/modules/screener";
import type {
  ScreenerDraftRecord,
  ScreenerStudySummary,
  ScreenerVersionRecord
} from "@/modules/screener/repository";
import type { LibraryItemProjection } from "@/modules/question-library/service";
import {
  DATA_DESTINATION_LABELS,
  PROFILE_BINDING_LABELS,
  QUESTION_TYPE_LABELS,
  QUESTIONNAIRE_VERSION_STATUS_LABELS,
  STUDY_STATUS_LABELS,
  UI_LABELS
} from "@/shared/ui/labels";
import { ConsentDefaultOptionsButton } from "./ConsentDefaultOptionsButton";
import {
  InsertFromLibraryPanel,
  SaveBlockToLibraryForm,
  SaveQuestionToLibraryForm
} from "./LibraryScreenerForms";
import { NseGuidedEditor } from "./NseGuidedEditor";
import { OptionAddForm } from "./OptionAddForm";
import { OptionEditForm } from "./OptionEditForm";
import { RuleGuidedForm } from "./RuleGuidedForm";

type ScreenerBuilderProps = {
  definition: ScreenerDefinition | null;
  draft: ScreenerDraftRecord | null;
  libraryItems: LibraryItemProjection[];
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
] satisfies ParticipantProfileBinding[];

const dataDestinations = [
  "SCREENING",
  "PARTICIPANT_PROFILE",
  "OPERATIONAL_INTERNAL"
] satisfies ScreenerDataDestination[];

const optionActionTypes = [
  "CONTINUE",
  "TERMINATE",
  "FLAG",
  "PENDING_REVIEW"
] satisfies Array<ScreenerOption["actions"][number]["type"]>;

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function ScreenerBuilder({
  definition,
  draft,
  libraryItems,
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
          <InsertFromLibraryPanel items={libraryItems} readOnly={readOnly} studyId={study.id} />
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
          <dt className="font-medium text-zinc-500">{UI_LABELS.studies.code}</dt>
          <dd className="mt-1 break-all font-mono text-zinc-900">{study.code}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.common.status}</dt>
          <dd className="mt-1 text-zinc-900">{STUDY_STATUS_LABELS[study.status]}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.studies.timeZone}</dt>
          <dd className="mt-1 text-zinc-900">{study.timeZoneIana}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.common.editing}</dt>
          <dd className="mt-1 text-zinc-900">
            {study.status === "DRAFT" ? UI_LABELS.common.available : UI_LABELS.common.readOnly}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function CreateDraftPanel({ readOnly, studyId }: { readOnly: boolean; studyId: string }) {
  return (
    <section className="rounded-lg border border-dashed border-teal-300 bg-teal-50 p-5">
      <h2 className="text-lg font-semibold text-zinc-950">{UI_LABELS.screener.screenerDraft}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">
        Crea un borrador reutilizable para este estudio. La versión publicada se generará después.
      </p>
      <form action={createScreenerDraftAction.bind(null, studyId)} className="mt-4">
        <button className={primaryButtonClass} disabled={readOnly} type="submit">
          {UI_LABELS.actions.createDraft}
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
      <h2 className="text-lg font-semibold text-zinc-950">{UI_LABELS.screener.draftStatus}</h2>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.screener.title}</dt>
          <dd className="mt-1 text-zinc-900">{definition.title}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.screener.questions}</dt>
          <dd className="mt-1 text-zinc-900">{definition.questions.length}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.screener.rules}</dt>
          <dd className="mt-1 text-zinc-900">{definition.rules.length}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">{UI_LABELS.common.updated}</dt>
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
        title={UI_LABELS.screener.questionnaireSummary}
      />
      <form action={saveScreenerMetadataAction.bind(null, studyId)} className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          {UI_LABELS.screener.title}
          <input className={inputClass} defaultValue={definition.title} disabled={readOnly} name="title" />
        </label>
        <label className={labelClass}>
          {UI_LABELS.screener.optionalDescription}
          <input
            className={inputClass}
            defaultValue={definition.description ?? ""}
            disabled={readOnly}
            name="description"
          />
        </label>
        <div className="md:col-span-2">
          <button className={primaryButtonClass} disabled={readOnly} type="submit">
            {UI_LABELS.actions.saveDraft}
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
        description={UI_LABELS.screener.addQuestionHelp}
        title={UI_LABELS.screener.structuredQuestionEditor}
      />
      <div className="space-y-4">
        {questions.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            {UI_LABELS.screener.noDraftQuestions}
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
      <SaveBlockToLibraryForm questions={questions} readOnly={readOnly} studyId={studyId} />
      <div className="mt-6 rounded-md border border-teal-100 bg-teal-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-800">
          {UI_LABELS.actions.addQuestion}
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
            {QUESTION_TYPE_LABELS[question.type]} · {DATA_DESTINATION_LABELS[question.dataDestination]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TinyForm action={moveScreenerQuestionAction.bind(null, studyId, question.id, "up")} disabled={readOnly}>
            {UI_LABELS.actions.moveUp}
          </TinyForm>
          <TinyForm action={moveScreenerQuestionAction.bind(null, studyId, question.id, "down")} disabled={readOnly}>
            {UI_LABELS.actions.moveDown}
          </TinyForm>
          <TinyForm action={deleteScreenerQuestionAction.bind(null, studyId, question.id)} disabled={readOnly}>
            {UI_LABELS.actions.delete}
          </TinyForm>
        </div>
      </div>

      <QuestionForm
        action={updateScreenerQuestionAction.bind(null, studyId, question.id)}
        question={question}
        readOnly={readOnly}
      />
      <SaveQuestionToLibraryForm question={question} readOnly={readOnly} studyId={studyId} />

      {"options" in question ? (
        <OptionPanel
          options={question.options}
          questionId={question.id}
          questionType={question.type}
          readOnly={readOnly}
          studyId={studyId}
        />
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
        {UI_LABELS.screener.technicalId}
        <input
          className={inputClass}
          defaultValue={question?.id ?? ""}
          name="id"
          readOnly={Boolean(question)}
          required
        />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.questionType}
        <select className={inputClass} defaultValue={question?.type ?? "SINGLE_CHOICE"} disabled={readOnly} name="type">
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.dataDestination}
        <select
          className={inputClass}
          defaultValue={question?.dataDestination ?? "SCREENING"}
          disabled={readOnly}
          name="dataDestination"
        >
          {dataDestinations.map((destination) => (
            <option key={destination} value={destination}>
              {DATA_DESTINATION_LABELS[destination]}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.screener.questionText}
        <input className={inputClass} defaultValue={question?.text ?? ""} disabled={readOnly} name="text" required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.profileBinding}
        <select
          className={inputClass}
          defaultValue={question?.profileBinding ?? ""}
          disabled={readOnly}
          name="profileBinding"
        >
          <option value="">{UI_LABELS.common.doesNotApply}</option>
          {profileBindings.map((binding) => (
            <option key={binding} value={binding}>
              {PROFILE_BINDING_LABELS[binding]}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.screener.helpText}
        <input className={inputClass} defaultValue={question?.helpText ?? ""} disabled={readOnly} name="helpText" />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={question?.required ?? false} disabled={readOnly} name="required" type="checkbox" />
        {UI_LABELS.common.required}
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.minimumNumber}
        <input className={inputClass} defaultValue={question?.validation.min ?? ""} disabled={readOnly} name="validationMin" />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.maximumNumber}
        <input className={inputClass} defaultValue={question?.validation.max ?? ""} disabled={readOnly} name="validationMax" />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.maximumCharacters}
        <input
          className={inputClass}
          defaultValue={question?.validation.maxLength ?? ""}
          disabled={readOnly}
          name="validationMaxLength"
        />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.minimumSelections}
        <input
          className={inputClass}
          defaultValue={question?.validation.minSelections ?? ""}
          disabled={readOnly}
          name="validationMinSelections"
        />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.maximumSelections}
        <input
          className={inputClass}
          defaultValue={question?.validation.maxSelections ?? ""}
          disabled={readOnly}
          name="validationMaxSelections"
        />
      </label>
      <div className="md:col-span-3">
        <button className={secondaryButtonClass} disabled={readOnly} type="submit">
          {question ? UI_LABELS.actions.saveQuestion : UI_LABELS.actions.addQuestion}
        </button>
      </div>
    </form>
  );
}

function OptionPanel({
  options,
  questionId,
  questionType,
  readOnly,
  studyId
}: {
  options: ScreenerOption[];
  questionId: string;
  questionType: ScreenerQuestionType;
  readOnly: boolean;
  studyId: string;
}) {
  const showConsentDefaultsButton =
    questionType === "CONSENT_YES_NO" && hasMissingConsentDefaultOptions(options);

  return (
    <div className="mt-5 rounded-md border border-white bg-white p-4">
      <h4 className="text-sm font-semibold text-zinc-900">{UI_LABELS.screener.options}</h4>
      {showConsentDefaultsButton ? (
        <ConsentDefaultOptionsButton questionId={questionId} readOnly={readOnly} studyId={studyId} />
      ) : null}
      <div className="mt-3 space-y-3">
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">{UI_LABELS.screener.noOptions}</p>
        ) : (
          options
            .sort((left, right) => left.order - right.order)
            .map((option) => (
              <OptionEditForm
                key={option.value}
                option={option}
                optionActionTypes={optionActionTypes}
                questionId={questionId}
                readOnly={readOnly}
                studyId={studyId}
              />
            ))
        )}
      </div>
      <div className="mt-4 rounded-md bg-zinc-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {UI_LABELS.actions.addOption}
        </p>
        <OptionAddForm
          optionActionTypes={optionActionTypes}
          questionId={questionId}
          readOnly={readOnly}
          studyId={studyId}
        />
      </div>
    </div>
  );
}

function hasMissingConsentDefaultOptions(options: ScreenerOption[]): boolean {
  const values = new Set(options.map((option) => option.value));
  return !values.has("SI") || !values.has("NO");
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
        description={UI_LABELS.screener.rulesHelp}
        title={UI_LABELS.screener.rulesAndTerminations}
      />
      <RuleGuidedForm definition={definition} readOnly={readOnly} studyId={studyId} />
    </section>
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
  return <NseGuidedEditor definition={definition} readOnly={readOnly} studyId={studyId} />;
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
        description={UI_LABELS.screener.publishHelp}
        title={UI_LABELS.screener.validationAndPublishing}
      />
      <ul className="mb-4 space-y-2 text-sm text-zinc-700">
        <li>{UI_LABELS.screener.configuredQuestions}: {definition.questions.length}</li>
        <li>{UI_LABELS.screener.optionQuestionsWithoutOptions}: {optionQuestionsWithoutOptions.length}</li>
        <li>{UI_LABELS.screener.configuredRules}: {definition.rules.length}</li>
        <li>
          {UI_LABELS.screener.nseBlock}:{" "}
          {definition.nse ? UI_LABELS.common.configured : UI_LABELS.screener.notConfigured}
        </li>
      </ul>
      <form action={publishScreenerAction.bind(null, studyId)}>
        <button className={primaryButtonClass} disabled={readOnly || !canPublish} type="submit">
          {UI_LABELS.actions.publishVersion}
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
        description={UI_LABELS.screener.versionHistoryHelp}
        title={UI_LABELS.screener.versionHistory}
      />
      {versions.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          {UI_LABELS.screener.noPublishedVersions}
        </p>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => (
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-4" key={version.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    {UI_LABELS.screener.versionNumber} {version.versionNumber}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {QUESTIONNAIRE_VERSION_STATUS_LABELS[version.status]} · {UI_LABELS.screener.publishedOn}{" "}
                    {dateFormatter.format(version.publishedAt)}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-500">
                    {UI_LABELS.screener.definitionHash}: {version.definitionHash}
                  </p>
                </div>
                {version.status === "ACTIVE" ? (
                  <FormButton
                    action={retireScreenerVersionAction.bind(null, studyId, version.id)}
                    disabled={readOnly}
                  >
                    {UI_LABELS.actions.retireVersion}
                  </FormButton>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-zinc-600">{UI_LABELS.screener.readOnlyDefinition}</p>
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

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
const tinyButtonClass =
  "inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
