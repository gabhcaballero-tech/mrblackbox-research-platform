"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addScreenerRuleAction,
  deleteScreenerRuleAction,
  updateScreenerRuleAction,
  type ScreenerRuleActionState
} from "@/modules/screener/actions";
import type {
  ScreenerCondition,
  ScreenerDefinition,
  ScreenerOption,
  ScreenerQuestion,
  ScreenerRule
} from "@/modules/screener";
import {
  RULE_CONDITION_LABELS,
  RULE_OUTCOME_LABELS,
  UI_LABELS
} from "@/shared/ui/labels";

type ScreenerComparableValue = string | number | boolean;

type RuleGuidedFormProps = {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
};

type RuleConditionType = Extract<
  ScreenerCondition["type"],
  "ALL_SELECTED" | "ANSWER_EQUALS" | "ANY_SELECTED" | "NUMBER_RANGE"
>;

type RuleOutcomeType = ScreenerRule["outcome"]["type"];

type RuleFormValues = {
  conditionType: RuleConditionType;
  max: string;
  min: string;
  outcomeCode: string;
  outcomeReason: string;
  outcomeRequiresReview: boolean;
  outcomeType: RuleOutcomeType;
  questionId: string;
  ruleId: string;
  selectedValues: string[];
  value: string;
};

const emptyValues: RuleFormValues = {
  conditionType: "ANSWER_EQUALS",
  max: "",
  min: "",
  outcomeCode: "",
  outcomeReason: "",
  outcomeRequiresReview: false,
  outcomeType: "TERMINATE",
  questionId: "",
  ruleId: "",
  selectedValues: [],
  value: ""
};

const ruleConditionTypes = [
  "ANSWER_EQUALS",
  "ANY_SELECTED",
  "ALL_SELECTED",
  "NUMBER_RANGE"
] satisfies RuleConditionType[];

const ruleOutcomeTypes = [
  "TERMINATE",
  "PENDING_REVIEW",
  "FLAG"
] satisfies RuleOutcomeType[];

export function RuleGuidedForm({
  definition,
  readOnly,
  studyId
}: RuleGuidedFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<RuleFormValues>(emptyValues);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [result, setResult] = useState<ScreenerRuleActionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const compatibleQuestions = useMemo(
    () =>
      definition.questions.filter((question) =>
        isQuestionCompatibleWithCondition(question, values.conditionType)
      ),
    [definition.questions, values.conditionType]
  );
  const resolvedQuestionId = compatibleQuestions.some((question) => question.id === values.questionId)
    ? values.questionId
    : compatibleQuestions[0]?.id ?? "";
  const selectedQuestion = compatibleQuestions.find((question) => question.id === resolvedQuestionId);
  const optionQuestion = selectedQuestion && hasOptions(selectedQuestion) ? selectedQuestion : null;
  const validationMessages = validateRuleForm({
    ...values,
    questionId: resolvedQuestionId
  });
  const disabled = readOnly || isSubmitting;

  function startEditing(rule: ScreenerRule) {
    setEditingRuleId(rule.id);
    setValues(createValuesFromRule(rule));
    setMessages([]);
    setResult(null);
  }

  function cancelEditing() {
    setEditingRuleId(null);
    setValues(emptyValues);
    setMessages([]);
    setResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validationMessages.length > 0) {
      setMessages(validationMessages);
      setResult(null);
      return;
    }

    setMessages([]);
    setResult(null);
    setIsSubmitting(true);

    try {
      const formData = createRuleFormData({
        ...values,
        questionId: resolvedQuestionId
      });
      const nextResult = editingRuleId
        ? await updateScreenerRuleAction(studyId, editingRuleId, formData)
        : await addScreenerRuleAction(studyId, formData);

      setResult(nextResult);

      if (nextResult.ok) {
        if (!editingRuleId) {
          setValues(emptyValues);
        }

        router.refresh();
      }
    } catch {
      setResult({
        message: editingRuleId
          ? "No se pudo actualizar la regla. Intenta nuevamente."
          : "No se pudo guardar la regla. Intenta nuevamente.",
        ok: false
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="space-y-3">
        {definition.rules.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            {UI_LABELS.screener.noAdditionalRules}
          </p>
        ) : (
          definition.rules
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((rule) => (
              <RuleSummary
                definition={definition}
                isEditing={editingRuleId === rule.id}
                key={rule.id}
                onEdit={() => startEditing(rule)}
                readOnly={readOnly}
                rule={rule}
                studyId={studyId}
              />
            ))
        )}
      </div>

      <form className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4" onSubmit={handleSubmit}>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
            {editingRuleId ? "Editar regla" : UI_LABELS.actions.addRule}
          </h3>
          {editingRuleId ? (
            <p className="mt-1 text-xs text-zinc-500">
              El ID de regla se conserva para evitar duplicados.
            </p>
          ) : null}
        </div>

        {result ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            role={result.ok ? "status" : "alert"}
          >
            {result.message}
          </div>
        ) : null}

        {messages.length > 0 ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            <p className="font-medium">Revisa la regla antes de guardarla.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <label className={labelClass}>
            {UI_LABELS.screener.ruleId}
            <input
              className={inputClass}
              disabled={disabled || Boolean(editingRuleId)}
              name="id"
              onChange={(event) =>
                setValues((current) => ({ ...current, ruleId: event.target.value }))
              }
              required
              value={values.ruleId}
            />
          </label>

          <label className={labelClass}>
            {UI_LABELS.screener.condition}
            <select
              className={inputClass}
              disabled={disabled}
              name="conditionType"
              onChange={(event) => {
                const nextConditionType = event.target.value as RuleConditionType;
                setValues((current) => ({
                  ...current,
                  conditionType: nextConditionType,
                  max: "",
                  min: "",
                  questionId: "",
                  selectedValues: [],
                  value: ""
                }));
                setMessages([]);
                setResult(null);
              }}
              value={values.conditionType}
            >
              {ruleConditionTypes.map((type) => (
                <option key={type} value={type}>
                  {RULE_CONDITION_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelClass} md:col-span-2`}>
            {UI_LABELS.screener.question}
            <select
              className={inputClass}
              disabled={disabled || compatibleQuestions.length === 0}
              name="questionId"
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  max: "",
                  min: "",
                  questionId: event.target.value,
                  selectedValues: [],
                  value: ""
                }));
                setMessages([]);
                setResult(null);
              }}
              required
              value={resolvedQuestionId}
            >
              {compatibleQuestions.length === 0 ? (
                <option value="">No hay preguntas compatibles para esta condición</option>
              ) : (
                compatibleQuestions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.text} · ID técnico: {question.id}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {compatibleQuestions.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No hay preguntas compatibles para reglas con la condición seleccionada. Agrega una pregunta adecuada antes de crear la regla.
          </p>
        ) : null}

        <ConditionFields
          conditionType={values.conditionType}
          max={values.max}
          min={values.min}
          optionQuestion={optionQuestion}
          readOnly={disabled}
          selectedValues={values.selectedValues}
          setValues={setValues}
          value={values.value}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <label className={labelClass}>
            {UI_LABELS.screener.result}
            <select
              className={inputClass}
              disabled={disabled}
              name="outcomeType"
              onChange={(event) => {
                const nextOutcomeType = event.target.value as RuleOutcomeType;
                setValues((current) => ({
                  ...current,
                  outcomeReason: nextOutcomeType === "FLAG" ? "" : current.outcomeReason,
                  outcomeRequiresReview: nextOutcomeType === "FLAG" ? current.outcomeRequiresReview : false,
                  outcomeType: nextOutcomeType
                }));
              }}
              value={values.outcomeType}
            >
              {ruleOutcomeTypes.map((type) => (
                <option key={type} value={type}>
                  {RULE_OUTCOME_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            {UI_LABELS.common.code}
            <input
              className={inputClass}
              disabled={disabled}
              name="outcomeCode"
              onChange={(event) =>
                setValues((current) => ({ ...current, outcomeCode: event.target.value }))
              }
              required
              value={values.outcomeCode}
            />
          </label>

          {values.outcomeType === "FLAG" ? (
            <label className="flex items-center gap-2 self-end text-sm font-medium text-zinc-700">
              <input
                checked={values.outcomeRequiresReview}
                disabled={disabled}
                name="outcomeRequiresReview"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    outcomeRequiresReview: event.target.checked
                  }))
                }
                type="checkbox"
              />
              {UI_LABELS.screener.flagRequiresReview}
            </label>
          ) : (
            <label className={`${labelClass} md:col-span-2`}>
              {UI_LABELS.screener.reason}
              <input
                className={inputClass}
                disabled={disabled}
                name="outcomeReason"
                onChange={(event) =>
                  setValues((current) => ({ ...current, outcomeReason: event.target.value }))
                }
                required
                value={values.outcomeReason}
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButtonClass}
            disabled={disabled || compatibleQuestions.length === 0}
            type="submit"
          >
            {isSubmitting
              ? UI_LABELS.common.saving
              : editingRuleId
                ? UI_LABELS.actions.saveChanges
                : UI_LABELS.actions.addRule}
          </button>
          {editingRuleId ? (
            <button
              className={secondaryButtonClass}
              disabled={disabled}
              onClick={cancelEditing}
              type="button"
            >
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function RuleSummary({
  definition,
  isEditing,
  onEdit,
  readOnly,
  rule,
  studyId
}: {
  definition: ScreenerDefinition;
  isEditing: boolean;
  onEdit: () => void;
  readOnly: boolean;
  rule: ScreenerRule;
  studyId: string;
}) {
  const question = getConditionQuestion(definition, rule.condition);
  const outcomeDetail = formatOutcomeDetail(rule.outcome);

  return (
    <article className={`rounded-md border p-4 ${isEditing ? "border-teal-300 bg-teal-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 text-sm text-zinc-700">
          <h3 className="font-mono text-base font-semibold text-zinc-950">{rule.id}</h3>
          <p>
            <span className="font-semibold text-zinc-900">Pregunta:</span>{" "}
            {question?.text ?? "Pregunta no encontrada"} · ID técnico: {getConditionQuestionId(rule.condition) ?? "N/D"}
          </p>
          <p>
            <span className="font-semibold text-zinc-900">Condición:</span>{" "}
            {formatConditionDetail(rule.condition, question)}
          </p>
          <p>
            <span className="font-semibold text-zinc-900">Resultado:</span>{" "}
            {RULE_OUTCOME_LABELS[rule.outcome.type]}
          </p>
          <p>
            <span className="font-semibold text-zinc-900">Código:</span> {outcomeDetail.code}
          </p>
          {outcomeDetail.reason ? (
            <p>
              <span className="font-semibold text-zinc-900">Motivo:</span> {outcomeDetail.reason}
            </p>
          ) : null}
          {outcomeDetail.reviewIndicator ? (
            <p>
              <span className="font-semibold text-zinc-900">Revisión:</span> {outcomeDetail.reviewIndicator}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButtonClass} disabled={readOnly} onClick={onEdit} type="button">
            Editar regla
          </button>
          <form action={deleteScreenerRuleAction.bind(null, studyId, rule.id)}>
            <button className={secondaryButtonClass} disabled={readOnly} type="submit">
              {UI_LABELS.actions.deleteRule}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function ConditionFields({
  conditionType,
  max,
  min,
  optionQuestion,
  readOnly,
  selectedValues,
  setValues,
  value
}: {
  conditionType: RuleConditionType;
  max: string;
  min: string;
  optionQuestion: (ScreenerQuestion & { options: ScreenerOption[] }) | null;
  readOnly: boolean;
  selectedValues: string[];
  setValues: (updater: (current: RuleFormValues) => RuleFormValues) => void;
  value: string;
}) {
  if (conditionType === "NUMBER_RANGE") {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        <label className={labelClass}>
          {UI_LABELS.screener.minimum}
          <input
            className={inputClass}
            disabled={readOnly}
            name="min"
            onChange={(event) =>
              setValues((current) => ({ ...current, min: event.target.value }))
            }
            type="number"
            value={min}
          />
        </label>
        <label className={labelClass}>
          {UI_LABELS.screener.maximum}
          <input
            className={inputClass}
            disabled={readOnly}
            name="max"
            onChange={(event) =>
              setValues((current) => ({ ...current, max: event.target.value }))
            }
            type="number"
            value={max}
          />
        </label>
      </div>
    );
  }

  if (conditionType === "ANY_SELECTED" || conditionType === "ALL_SELECTED") {
    return (
      <fieldset className="rounded-md border border-zinc-200 bg-white p-3">
        <legend className="text-sm font-medium text-zinc-700">{UI_LABELS.screener.values}</legend>
        <input name="values" readOnly type="hidden" value={selectedValues.join(",")} />
        <p className="mt-1 text-xs text-zinc-500">
          Selecciona los valores de opción aplicables.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {optionQuestion?.options.map((option) => (
            <label
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              key={option.value}
            >
              <input
                checked={selectedValues.includes(option.value)}
                disabled={readOnly}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    selectedValues: event.target.checked
                      ? [...current.selectedValues, option.value]
                      : current.selectedValues.filter((item) => item !== option.value)
                  }))
                }
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <label className={`${labelClass} md:col-span-2`}>
        {UI_LABELS.screener.value}
        {optionQuestion ? (
          <select
            className={inputClass}
            disabled={readOnly}
            name="value"
            onChange={(event) =>
              setValues((current) => ({ ...current, value: event.target.value }))
            }
            required
            value={value}
          >
            <option value="">Selecciona una respuesta</option>
            {optionQuestion.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={inputClass}
            disabled={readOnly}
            name="value"
            onChange={(event) =>
              setValues((current) => ({ ...current, value: event.target.value }))
            }
            required
            value={value}
          />
        )}
      </label>
    </div>
  );
}

function createRuleFormData(values: RuleFormValues): FormData {
  const formData = new FormData();
  formData.set("conditionType", values.conditionType);
  formData.set("id", values.ruleId);
  formData.set("outcomeCode", values.outcomeCode);
  formData.set("outcomeType", values.outcomeType);
  formData.set("questionId", values.questionId);

  if (values.conditionType === "ANSWER_EQUALS") {
    formData.set("value", values.value);
  }

  if (values.conditionType === "ANY_SELECTED" || values.conditionType === "ALL_SELECTED") {
    formData.set("values", values.selectedValues.join(","));
  }

  if (values.conditionType === "NUMBER_RANGE") {
    formData.set("min", values.min);
    formData.set("max", values.max);
  }

  if (values.outcomeType === "FLAG") {
    if (values.outcomeRequiresReview) {
      formData.set("outcomeRequiresReview", "on");
    }
  } else {
    formData.set("outcomeReason", values.outcomeReason);
  }

  return formData;
}

function createValuesFromRule(rule: ScreenerRule): RuleFormValues {
  const base = {
    ...emptyValues,
    outcomeCode: formatOutcomeDetail(rule.outcome).code,
    outcomeReason: formatOutcomeDetail(rule.outcome).reason,
    outcomeRequiresReview: rule.outcome.type === "FLAG" ? rule.outcome.requiresReview : false,
    outcomeType: rule.outcome.type,
    ruleId: rule.id
  };

  switch (rule.condition.type) {
    case "ANSWER_EQUALS":
      return {
        ...base,
        conditionType: "ANSWER_EQUALS",
        questionId: rule.condition.questionId,
        value: stringifyComparableValue(rule.condition.value)
      };
    case "ANY_SELECTED":
      return {
        ...base,
        conditionType: "ANY_SELECTED",
        questionId: rule.condition.questionId,
        selectedValues: rule.condition.values.map(stringifyComparableValue)
      };
    case "ALL_SELECTED":
      return {
        ...base,
        conditionType: "ALL_SELECTED",
        questionId: rule.condition.questionId,
        selectedValues: rule.condition.values.map(stringifyComparableValue)
      };
    case "NUMBER_RANGE":
      return {
        ...base,
        conditionType: "NUMBER_RANGE",
        max: rule.condition.max?.toString() ?? "",
        min: rule.condition.min?.toString() ?? "",
        questionId: rule.condition.questionId
      };
    case "ANY":
    case "ALL":
      return base;
  }
}

function isQuestionCompatibleWithCondition(
  question: ScreenerQuestion,
  conditionType: RuleConditionType
): boolean {
  switch (conditionType) {
    case "ANSWER_EQUALS":
      return isSelectionQuestion(question) || question.type === "SHORT_TEXT" || question.type === "LONG_TEXT";
    case "ANY_SELECTED":
    case "ALL_SELECTED":
      return question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST";
    case "NUMBER_RANGE":
      return question.type === "INTEGER";
  }
}

function isSelectionQuestion(question: ScreenerQuestion): question is ScreenerQuestion & { options: ScreenerOption[] } {
  return (
    (question.type === "SINGLE_CHOICE" ||
      question.type === "MULTIPLE_CHOICE" ||
      question.type === "INTERVIEWER_CHECKLIST") &&
    "options" in question
  );
}

function hasOptions(question: ScreenerQuestion): question is ScreenerQuestion & { options: ScreenerOption[] } {
  return "options" in question;
}

function validateRuleForm(values: RuleFormValues): string[] {
  const messages: string[] = [];

  if (!values.ruleId.trim()) {
    messages.push("El ID de regla es obligatorio.");
  }

  if (!values.questionId) {
    messages.push("Selecciona una pregunta compatible del borrador.");
  }

  if (values.conditionType === "ANSWER_EQUALS" && !values.value.trim()) {
    messages.push("Selecciona o ingresa el valor esperado.");
  }

  if (
    (values.conditionType === "ANY_SELECTED" || values.conditionType === "ALL_SELECTED") &&
    values.selectedValues.length === 0
  ) {
    messages.push("Selecciona al menos una opción para la condición.");
  }

  if (values.conditionType === "NUMBER_RANGE") {
    const hasMin = values.min.trim().length > 0;
    const hasMax = values.max.trim().length > 0;
    const minValue = Number(values.min);
    const maxValue = Number(values.max);

    if (!hasMin && !hasMax) {
      messages.push("Ingresa al menos un mínimo o un máximo para el rango.");
    }

    if ((hasMin && !Number.isFinite(minValue)) || (hasMax && !Number.isFinite(maxValue))) {
      messages.push("El mínimo y el máximo deben ser números válidos.");
    }

    if (hasMin && hasMax && Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue > maxValue) {
      messages.push("El mínimo no puede ser mayor que el máximo.");
    }
  }

  if (!values.outcomeCode.trim()) {
    messages.push("El código de resultado es obligatorio.");
  }

  if (
    (values.outcomeType === "TERMINATE" || values.outcomeType === "PENDING_REVIEW") &&
    !values.outcomeReason.trim()
  ) {
    messages.push("El motivo es obligatorio para terminar el filtro o enviar a revisión.");
  }

  return messages;
}

function getConditionQuestion(
  definition: ScreenerDefinition,
  condition: ScreenerRule["condition"]
): ScreenerQuestion | undefined {
  const questionId = getConditionQuestionId(condition);
  return questionId ? definition.questions.find((question) => question.id === questionId) : undefined;
}

function getConditionQuestionId(condition: ScreenerRule["condition"]): string | null {
  if (condition.type === "ANY" || condition.type === "ALL") {
    return null;
  }

  return condition.questionId;
}

function formatConditionDetail(
  condition: ScreenerRule["condition"],
  question: ScreenerQuestion | undefined
): string {
  switch (condition.type) {
    case "ANSWER_EQUALS":
      return `${RULE_CONDITION_LABELS.ANSWER_EQUALS}: ${formatQuestionValue(question, condition.value)}`;
    case "ANY_SELECTED":
      return `${RULE_CONDITION_LABELS.ANY_SELECTED}: ${condition.values
        .map((value) => formatQuestionValue(question, value))
        .join(", ")}`;
    case "ALL_SELECTED":
      return `${RULE_CONDITION_LABELS.ALL_SELECTED}: ${condition.values
        .map((value) => formatQuestionValue(question, value))
        .join(", ")}`;
    case "NUMBER_RANGE":
      return `${RULE_CONDITION_LABELS.NUMBER_RANGE}: ${formatRange(condition.min, condition.max)}`;
    case "ANY":
      return RULE_CONDITION_LABELS.ANY;
    case "ALL":
      return RULE_CONDITION_LABELS.ALL;
  }
}

function formatQuestionValue(
  question: ScreenerQuestion | undefined,
  value: ScreenerComparableValue
): string {
  const normalizedValue = stringifyComparableValue(value);

  if (question && "options" in question) {
    return question.options.find((option) => option.value === normalizedValue)?.label ?? normalizedValue;
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  return normalizedValue;
}

function formatRange(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) {
    return `${min} a ${max}`;
  }

  if (min !== undefined) {
    return `desde ${min}`;
  }

  if (max !== undefined) {
    return `hasta ${max}`;
  }

  return "sin rango definido";
}

function formatOutcomeDetail(outcome: ScreenerRule["outcome"]) {
  if (outcome.type === "FLAG") {
    return {
      code: outcome.code,
      reason: "",
      reviewIndicator: outcome.requiresReview ? "La bandera requiere revisión" : "Bandera informativa"
    };
  }

  return {
    code: outcome.code,
    reason: outcome.reason,
    reviewIndicator: ""
  };
}

function stringifyComparableValue(value: ScreenerComparableValue): string {
  return String(value);
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
