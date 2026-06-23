"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createLibraryRevisionFromFormAction,
  updateLibraryItemMetadataAction,
  type QuestionLibraryActionState
} from "@/modules/question-library/actions";
import type { LibraryContent } from "@/modules/question-library";
import type { LibraryItemProjection, LibraryRevisionProjection } from "@/modules/question-library/service";
import type { NseScoreTable, ScreenerCondition, ScreenerOption, ScreenerQuestion, ScreenerRule } from "@/modules/screener";
import {
  DATA_DESTINATION_LABELS,
  PROFILE_BINDING_LABELS,
  QUESTION_TYPE_LABELS,
  RULE_CONDITION_LABELS,
  RULE_OUTCOME_LABELS,
  UI_LABELS
} from "@/shared/ui/labels";
import { LibrarySaveFields } from "@/app/admin/studies/[studyId]/screener/_components/LibrarySaveFields";

type LibraryItemMetadataFormProps = {
  item: LibraryItemProjection;
};

const questionTypes = [
  "CONSENT_YES_NO",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "INTEGER",
  "SHORT_TEXT",
  "LONG_TEXT",
  "INTERVIEWER_CHECKLIST"
] as const;

const dataDestinations = ["SCREENING", "PARTICIPANT_PROFILE", "OPERATIONAL_INTERNAL"] as const;
const profileBindings = ["", "NAME", "PHONE", "EMAIL", "ADDRESS", "CITY", "AGE", "GENDER", "EXTERNAL_REFERENCE"] as const;
const optionActionTypes = ["NONE", "CONTINUE", "TERMINATE", "PENDING_REVIEW", "FLAG"] as const;
const ruleConditionTypes = ["ANSWER_EQUALS", "ANY_SELECTED", "ALL_SELECTED", "NUMBER_RANGE"] as const;
const ruleOutcomeTypes = ["TERMINATE", "PENDING_REVIEW", "FLAG"] as const;
const initialActionState: QuestionLibraryActionState = {
  message: "",
  ok: false
};

export function LibraryItemMetadataForm({ item }: LibraryItemMetadataFormProps) {
  const [state, formAction] = useActionState(
    updateLibraryItemMetadataAction.bind(null, item.id),
    initialActionState
  );

  if (item.status !== "ACTIVE") {
    return null;
  }

  return (
    <details className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        {UI_LABELS.actions.editMetadata}
      </summary>
      <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <ActionMessage state={state} />
        <LibrarySaveFields
          defaultCategory={item.category}
          defaultDescription={item.description}
          defaultName={item.name}
          defaultScope={item.scope}
          defaultTags={item.tags}
          readOnly={false}
        />
        <div className="md:col-span-2">
          <SubmitButton>{UI_LABELS.actions.saveChanges}</SubmitButton>
        </div>
      </form>
    </details>
  );
}

export function LibraryRevisionEditor({
  item,
  revision
}: {
  item: LibraryItemProjection;
  revision: LibraryRevisionProjection;
}) {
  const [state, formAction] = useActionState(
    createLibraryRevisionFromFormAction.bind(null, item.id),
    initialActionState
  );

  if (item.status !== "ACTIVE" || revision.status !== "ACTIVE") {
    return null;
  }

  return (
    <details className="mt-4 rounded-md border border-teal-100 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        {UI_LABELS.actions.createNewRevision}
      </summary>
      <form action={formAction} className="mt-4 space-y-4">
        <ActionMessage state={state} />
        <MetadataHiddenFields content={revision.content} />
        {revision.content.kind === "QUESTION" ? (
          <>
            <input name="kind" type="hidden" value="QUESTION" />
            <QuestionFields prefix="question" question={revision.content.question} />
          </>
        ) : (
          <>
            <input name="kind" type="hidden" value="BLOCK" />
            <BlockFields content={revision.content} />
          </>
        )}
        <SubmitButton>{UI_LABELS.actions.createNewRevision}</SubmitButton>
      </form>
    </details>
  );
}

export function CopyHashButton({ hash }: { hash: string | null }) {
  return (
    <button
      className={tinyButtonClass}
      disabled={!hash}
      onClick={() => {
        if (hash) {
          void navigator.clipboard?.writeText(hash);
        }
      }}
      type="button"
    >
      {UI_LABELS.actions.copyHash}
    </button>
  );
}

function BlockFields({ content }: { content: Extract<LibraryContent, { kind: "BLOCK" }> }) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-zinc-900">{UI_LABELS.screener.questions}</h4>
        {content.questions.map((question, index) => (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3" key={question.id}>
            <input name="questionIndex" type="hidden" value={index} />
            <QuestionFields prefix={`questions.${index}`} question={question} />
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-zinc-900">{UI_LABELS.screener.rules}</h4>
        {content.rules.length === 0 ? (
          <p className="text-sm text-zinc-500">{UI_LABELS.screener.noAdditionalRules}</p>
        ) : (
          content.rules.map((rule, index) => (
            <RuleFields index={index} key={rule.id} prefix={`rules.${index}`} rule={rule} />
          ))
        )}
      </section>
      {content.nse ? <NseFields nse={content.nse} /> : null}
    </div>
  );
}

function QuestionFields({ prefix, question }: { prefix: string; question: ScreenerQuestion }) {
  return (
    <fieldset className="grid gap-3 md:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold text-zinc-900">{question.text}</legend>
      <label className={labelClass}>
        {UI_LABELS.screener.technicalId}
        <input className={inputClass} defaultValue={question.id} name={`${prefix}.id`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.questionType}
        <select className={inputClass} defaultValue={question.type} name={`${prefix}.type`}>
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.dataDestination}
        <select className={inputClass} defaultValue={question.dataDestination} name={`${prefix}.dataDestination`}>
          {dataDestinations.map((destination) => (
            <option key={destination} value={destination}>
              {DATA_DESTINATION_LABELS[destination]}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.screener.questionText}
        <input className={inputClass} defaultValue={question.text} name={`${prefix}.text`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.profileBinding}
        <select className={inputClass} defaultValue={question.profileBinding ?? ""} name={`${prefix}.profileBinding`}>
          {profileBindings.map((binding) => (
            <option key={binding || "none"} value={binding}>
              {binding ? PROFILE_BINDING_LABELS[binding] : UI_LABELS.common.doesNotApply}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.screener.helpText}
        <input className={inputClass} defaultValue={question.helpText ?? ""} name={`${prefix}.helpText`} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={question.required} name={`${prefix}.required`} type="checkbox" />
        {UI_LABELS.common.required}
      </label>
      <VisibilityHiddenFields condition={question.visibilityCondition} prefix={prefix} />
      <NumberField defaultValue={question.validation.min} label={UI_LABELS.screener.minimumNumber} name={`${prefix}.validationMin`} />
      <NumberField defaultValue={question.validation.max} label={UI_LABELS.screener.maximumNumber} name={`${prefix}.validationMax`} />
      <NumberField defaultValue={question.validation.maxLength} label={UI_LABELS.screener.maximumCharacters} name={`${prefix}.validationMaxLength`} />
      <NumberField defaultValue={question.validation.minSelections} label={UI_LABELS.screener.minimumSelections} name={`${prefix}.validationMinSelections`} />
      <NumberField defaultValue={question.validation.maxSelections} label={UI_LABELS.screener.maximumSelections} name={`${prefix}.validationMaxSelections`} />
      {"options" in question ? (
        <div className="space-y-3 md:col-span-3">
          <h5 className="text-sm font-semibold text-zinc-900">{UI_LABELS.screener.options}</h5>
          {question.options.map((option, index) => (
            <OptionFields index={index} key={option.value} option={option} prefix={`${prefix}.options.${index}`} questionPrefix={prefix} />
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function VisibilityHiddenFields({
  condition,
  prefix
}: {
  condition: ScreenerCondition | undefined;
  prefix: string;
}) {
  if (!condition || condition.type === "ANY" || condition.type === "ALL") {
    return <input name={`${prefix}.visibilityMode`} type="hidden" value="ALWAYS" />;
  }

  return (
    <>
      <input name={`${prefix}.visibilityMode`} type="hidden" value="CONDITIONAL" />
      <input name={`${prefix}.visibility.conditionType`} type="hidden" value={condition.type} />
      <input name={`${prefix}.visibility.questionId`} type="hidden" value={condition.questionId} />
      <input
        name={`${prefix}.visibility.value`}
        type="hidden"
        value={"value" in condition ? String(condition.value) : ""}
      />
      <input
        name={`${prefix}.visibility.values`}
        type="hidden"
        value={"values" in condition ? condition.values.map(String).join(",") : ""}
      />
      <input
        name={`${prefix}.visibility.min`}
        type="hidden"
        value={"min" in condition ? condition.min?.toString() ?? "" : ""}
      />
      <input
        name={`${prefix}.visibility.max`}
        type="hidden"
        value={"max" in condition ? condition.max?.toString() ?? "" : ""}
      />
    </>
  );
}

function OptionFields({
  index,
  option,
  prefix,
  questionPrefix
}: {
  index: number;
  option: ScreenerOption;
  prefix: string;
  questionPrefix: string;
}) {
  const action = option.actions[0];

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-4">
      <input name={`${questionPrefix}.optionIndex`} type="hidden" value={index} />
      <label className={labelClass}>
        {UI_LABELS.screener.optionValue}
        <input className={inputClass} defaultValue={option.value} name={`${prefix}.value`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.visibleLabel}
        <input className={inputClass} defaultValue={option.label} name={`${prefix}.label`} required />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={option.isOther} name={`${prefix}.isOther`} type="checkbox" />
        {UI_LABELS.screener.other}
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={option.otherTextRequired} name={`${prefix}.otherTextRequired`} type="checkbox" />
        {UI_LABELS.screener.otherRequiresText}
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.action}
        <select className={inputClass} defaultValue={action?.type ?? "NONE"} name={`${prefix}.actionType`}>
          {optionActionTypes.map((type) => (
            <option key={type} value={type}>
              {type === "NONE" ? UI_LABELS.common.doesNotApply : RULE_OUTCOME_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.actionCode}
        <input className={inputClass} defaultValue={getActionCode(action)} name={`${prefix}.actionCode`} />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.reason}
        <input className={inputClass} defaultValue={getActionReason(action)} name={`${prefix}.actionReason`} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={getActionRequiresReview(action)} name={`${prefix}.actionRequiresReview`} type="checkbox" />
        {UI_LABELS.screener.requiresReview}
      </label>
    </div>
  );
}

function RuleFields({ index, prefix, rule }: { index: number; prefix: string; rule: ScreenerRule }) {
  const condition = rule.condition;
  const questionId = "questionId" in condition ? condition.questionId : "";
  const conditionType = "questionId" in condition ? condition.type : "ANSWER_EQUALS";
  const outcome = rule.outcome;

  return (
    <fieldset className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-3">
      <input name="ruleIndex" type="hidden" value={index} />
      <legend className="mb-2 text-sm font-semibold text-zinc-900">{rule.id}</legend>
      <label className={labelClass}>
        {UI_LABELS.screener.ruleId}
        <input className={inputClass} defaultValue={rule.id} name={`${prefix}.id`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.condition}
        <select className={inputClass} defaultValue={conditionType} name={`${prefix}.conditionType`}>
          {ruleConditionTypes.map((type) => (
            <option key={type} value={type}>{RULE_CONDITION_LABELS[type]}</option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.questionId}
        <input className={inputClass} defaultValue={questionId} name={`${prefix}.questionId`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.value}
        <input className={inputClass} defaultValue={"value" in condition ? String(condition.value) : ""} name={`${prefix}.value`} />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.values}
        <input className={inputClass} defaultValue={"values" in condition ? condition.values.join(", ") : ""} name={`${prefix}.values`} />
      </label>
      <NumberField defaultValue={"min" in condition ? condition.min : undefined} label={UI_LABELS.screener.minimum} name={`${prefix}.min`} />
      <NumberField defaultValue={"max" in condition ? condition.max : undefined} label={UI_LABELS.screener.maximum} name={`${prefix}.max`} />
      <label className={labelClass}>
        {UI_LABELS.screener.result}
        <select className={inputClass} defaultValue={outcome.type} name={`${prefix}.outcomeType`}>
          {ruleOutcomeTypes.map((type) => (
            <option key={type} value={type}>{RULE_OUTCOME_LABELS[type]}</option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.actionCode}
        <input className={inputClass} defaultValue={outcome.code} name={`${prefix}.outcomeCode`} required />
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.reason}
        <input className={inputClass} defaultValue={"reason" in outcome ? outcome.reason : ""} name={`${prefix}.outcomeReason`} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input defaultChecked={"requiresReview" in outcome ? outcome.requiresReview : false} name={`${prefix}.outcomeRequiresReview`} type="checkbox" />
        {UI_LABELS.screener.requiresReview}
      </label>
    </fieldset>
  );
}

function NseFields({ nse }: { nse: NseScoreTable }) {
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <input name="hasNse" type="hidden" value="true" />
      <h4 className="text-sm font-semibold text-zinc-900">{UI_LABELS.screener.nseCalculation}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          {UI_LABELS.screener.nseCode}
          <input className={inputClass} defaultValue={nse.code} name="nse.code" required />
        </label>
        <label className={labelClass}>
          {UI_LABELS.screener.nseLabel}
          <input className={inputClass} defaultValue={nse.label} name="nse.label" required />
        </label>
      </div>
      {nse.inputs.map((input, inputIndex) => (
        <div className="rounded-md border border-zinc-200 bg-white p-3" key={input.questionId}>
          <input name="nseInputIndex" type="hidden" value={inputIndex} />
          <label className={labelClass}>
            {UI_LABELS.screener.questionId}
            <input className={inputClass} defaultValue={input.questionId} name={`nse.inputs.${inputIndex}.questionId`} required />
          </label>
          <NumberField defaultValue={input.missingScore} label="Puntaje si falta respuesta" name={`nse.inputs.${inputIndex}.missingScore`} />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(input.scoreByAnswer).map(([answer, score], scoreIndex) => (
              <div className="grid gap-2" key={answer}>
                <input name={`nse.inputs.${inputIndex}.scoreIndex`} type="hidden" value={scoreIndex} />
                <input name={`nse.inputs.${inputIndex}.scores.${scoreIndex}.answer`} type="hidden" value={answer} />
                <NumberField defaultValue={score} label={`Puntaje para ${answer}`} name={`nse.inputs.${inputIndex}.scores.${scoreIndex}.score`} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        {nse.ranges.map((range, index) => (
          <div className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3" key={range.code}>
            <input name="nseRangeIndex" type="hidden" value={index} />
            <label className={labelClass}>
              Código de rango
              <input className={inputClass} defaultValue={range.code} name={`nse.ranges.${index}.code`} required />
            </label>
            <label className={labelClass}>
              Etiqueta
              <input className={inputClass} defaultValue={range.label} name={`nse.ranges.${index}.label`} required />
            </label>
            <NumberField defaultValue={range.min} label={UI_LABELS.screener.minimum} name={`nse.ranges.${index}.min`} />
            <NumberField defaultValue={range.max} label={UI_LABELS.screener.maximum} name={`nse.ranges.${index}.max`} />
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input defaultChecked={range.eligible} name={`nse.ranges.${index}.eligible`} type="checkbox" />
              Elegible
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetadataHiddenFields({ content }: { content: LibraryContent }) {
  return (
    <>
      <input name="metadataCategory" type="hidden" value={content.metadata.category ?? ""} />
      <input name="metadataDescription" type="hidden" value={content.metadata.description ?? ""} />
      <input name="metadataGenericConfirmed" type="hidden" value={String(content.metadata.isGenericContentConfirmed)} />
      <input name="metadataTags" type="hidden" value={content.metadata.tags.join(", ")} />
    </>
  );
}

function getActionCode(action: ScreenerOption["actions"][number] | undefined): string {
  return action && "code" in action ? action.code : "";
}

function getActionReason(action: ScreenerOption["actions"][number] | undefined): string {
  return action && "reason" in action ? action.reason : "";
}

function getActionRequiresReview(action: ScreenerOption["actions"][number] | undefined): boolean {
  return Boolean(action && "requiresReview" in action && action.requiresReview);
}

function ActionMessage({ state }: { state: QuestionLibraryActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
      role={state.ok ? "status" : "alert"}
    >
      {state.message}
    </div>
  );
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();

  return (
    <button className={secondaryButtonClass} disabled={pending} type="submit">
      {pending ? UI_LABELS.common.saving : children}
    </button>
  );
}

function NumberField({
  defaultValue,
  label,
  name
}: {
  defaultValue?: number;
  label: string;
  name: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} defaultValue={defaultValue ?? ""} name={name} type="number" />
    </label>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
const tinyButtonClass =
  "inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
