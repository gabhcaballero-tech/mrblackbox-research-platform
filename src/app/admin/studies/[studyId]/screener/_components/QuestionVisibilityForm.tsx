"use client";

import { type FormEvent, useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  updateScreenerQuestionVisibilityAction,
  type ScreenerVisibilityActionState
} from "@/modules/screener/actions";
import type {
  ScreenerComparableValue,
  ScreenerCondition,
  ScreenerQuestion
} from "@/modules/screener";
import { RULE_CONDITION_LABELS, UI_LABELS } from "@/shared/ui/labels";

type QuestionVisibilityFormProps = {
  question: ScreenerQuestion;
  questions: ScreenerQuestion[];
  readOnly: boolean;
  studyId: string;
};

type ConditionType = Extract<
  ScreenerCondition["type"],
  "ALL_SELECTED" | "ANSWER_EQUALS" | "ANY_SELECTED" | "NONE_SELECTED" | "NUMBER_RANGE"
>;

type VisibilityMode = "ALWAYS" | "CONDITIONAL";

type VisibilityFormValues = {
  conditionType: ConditionType;
  max: string;
  min: string;
  mode: VisibilityMode;
  questionId: string;
  selectedValues: string[];
  value: string;
};

const conditionTypes = [
  "ANSWER_EQUALS",
  "ANY_SELECTED",
  "ALL_SELECTED",
  "NONE_SELECTED",
  "NUMBER_RANGE"
] satisfies ConditionType[];

const initialActionState: ScreenerVisibilityActionState = {
  message: "",
  ok: false
};

export function QuestionVisibilityForm({
  question,
  questions,
  readOnly,
  studyId
}: QuestionVisibilityFormProps) {
  const router = useRouter();
  const [actionState, formAction] = useActionState(
    updateScreenerQuestionVisibilityAction.bind(null, studyId, question.id),
    initialActionState
  );
  const [values, setValues] = useState<VisibilityFormValues>(() =>
    createValuesFromCondition(question.visibilityCondition)
  );
  const sourceQuestions = useMemo(
    () =>
      questions
        .filter((candidate) => candidate.order < question.order)
        .filter((candidate) => isQuestionCompatibleWithCondition(candidate, values.conditionType)),
    [question.order, questions, values.conditionType]
  );
  const selectedQuestion = sourceQuestions.find((candidate) => candidate.id === values.questionId);
  const optionQuestion = selectedQuestion && "options" in selectedQuestion ? selectedQuestion : null;
  const validationMessages = validateVisibilityForm(values, sourceQuestions, question);

  useEffect(() => {
    if (actionState.ok) {
      router.refresh();
    }
  }, [actionState.ok, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (values.mode === "CONDITIONAL" && validationMessages.length > 0) {
      event.preventDefault();
    }
  }

  return (
    <details className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-teal-700">
        Visibilidad condicional
      </summary>
      <form action={formAction} className="mt-4 space-y-4" onSubmit={handleSubmit}>
        {actionState.message ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              actionState.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            role={actionState.ok ? "status" : "alert"}
          >
            {actionState.message}
          </div>
        ) : null}

        {values.mode === "CONDITIONAL" && validationMessages.length > 0 ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            <p className="font-medium">Revisa la visibilidad antes de guardarla.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">Estado</legend>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              checked={values.mode === "ALWAYS"}
              disabled={readOnly}
              name="mode"
              onChange={() => setValues((current) => ({ ...current, mode: "ALWAYS" }))}
              type="radio"
              value="ALWAYS"
            />
            Visible siempre
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              checked={values.mode === "CONDITIONAL"}
              disabled={readOnly}
              name="mode"
              onChange={() => setValues((current) => ({ ...current, mode: "CONDITIONAL" }))}
              type="radio"
              value="CONDITIONAL"
            />
            Mostrar solo si otra pregunta cumple una condicion
          </label>
        </fieldset>

        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {values.mode === "ALWAYS"
            ? "Esta pregunta se mostrara siempre."
            : "Esta pregunta se mostrara solo si se cumple la condicion."}
        </p>

        {values.mode === "CONDITIONAL" ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <label className={labelClass}>
                {UI_LABELS.screener.condition}
                <select
                  className={inputClass}
                  disabled={readOnly}
                  name="conditionType"
                  onChange={(event) => {
                    const conditionType = event.target.value as ConditionType;
                    setValues((current) => ({
                      ...current,
                      conditionType,
                      max: "",
                      min: "",
                      questionId: "",
                      selectedValues: [],
                      value: ""
                    }));
                  }}
                  value={values.conditionType}
                >
                  {conditionTypes.map((type) => (
                    <option key={type} value={type}>
                      {RULE_CONDITION_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${labelClass} md:col-span-2`}>
                Pregunta origen
                <select
                  className={inputClass}
                  disabled={readOnly || sourceQuestions.length === 0}
                  name="questionId"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      max: "",
                      min: "",
                      questionId: event.target.value,
                      selectedValues: [],
                      value: ""
                    }))
                  }
                  value={values.questionId}
                >
                  <option value="">
                    {sourceQuestions.length === 0
                      ? "No hay preguntas anteriores compatibles"
                      : "Selecciona una pregunta anterior"}
                  </option>
                  {sourceQuestions.map((sourceQuestion) => (
                    <option key={sourceQuestion.id} value={sourceQuestion.id}>
                      {sourceQuestion.text} · ID tecnico: {sourceQuestion.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ConditionFields
              conditionType={values.conditionType}
              max={values.max}
              min={values.min}
              optionQuestion={optionQuestion}
              readOnly={readOnly}
              selectedValues={values.selectedValues}
              setValues={setValues}
              value={values.value}
            />
          </>
        ) : null}

        <div>
          <SubmitButton disabled={readOnly || (values.mode === "CONDITIONAL" && validationMessages.length > 0)}>
            Guardar visibilidad
          </SubmitButton>
        </div>
      </form>
    </details>
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
  conditionType: ConditionType;
  max: string;
  min: string;
  optionQuestion: (ScreenerQuestion & { options: Array<{ label: string; value: string }> }) | null;
  readOnly: boolean;
  selectedValues: string[];
  setValues: (updater: (current: VisibilityFormValues) => VisibilityFormValues) => void;
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
            onChange={(event) => setValues((current) => ({ ...current, min: event.target.value }))}
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
            onChange={(event) => setValues((current) => ({ ...current, max: event.target.value }))}
            type="number"
            value={max}
          />
        </label>
      </div>
    );
  }

  if (
    conditionType === "ANY_SELECTED" ||
    conditionType === "ALL_SELECTED" ||
    conditionType === "NONE_SELECTED"
  ) {
    return (
      <fieldset className="rounded-md border border-zinc-200 bg-white p-3">
        <legend className="text-sm font-medium text-zinc-700">{UI_LABELS.screener.values}</legend>
        <input name="values" readOnly type="hidden" value={selectedValues.join(",")} />
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
            onChange={(event) => setValues((current) => ({ ...current, value: event.target.value }))}
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
            onChange={(event) => setValues((current) => ({ ...current, value: event.target.value }))}
            value={value}
          />
        )}
      </label>
    </div>
  );
}

function createValuesFromCondition(condition: ScreenerCondition | undefined): VisibilityFormValues {
  if (!condition || condition.type === "ANY" || condition.type === "ALL") {
    return {
      conditionType: "ANSWER_EQUALS",
      max: "",
      min: "",
      mode: "ALWAYS",
      questionId: "",
      selectedValues: [],
      value: ""
    };
  }

  const base = {
    conditionType: condition.type,
    max: "",
    min: "",
    mode: "CONDITIONAL" as const,
    questionId: condition.questionId,
    selectedValues: [],
    value: ""
  };

  if (condition.type === "ANSWER_EQUALS") {
    return { ...base, value: stringifyComparableValue(condition.value) };
  }

  if (
    condition.type === "ANY_SELECTED" ||
    condition.type === "ALL_SELECTED" ||
    condition.type === "NONE_SELECTED"
  ) {
    return { ...base, selectedValues: condition.values.map(stringifyComparableValue) };
  }

  return {
    ...base,
    max: condition.max?.toString() ?? "",
    min: condition.min?.toString() ?? ""
  };
}

function validateVisibilityForm(
  values: VisibilityFormValues,
  sourceQuestions: ScreenerQuestion[],
  targetQuestion: ScreenerQuestion
): string[] {
  const messages: string[] = [];

  if (values.mode === "ALWAYS") {
    return messages;
  }

  if (values.questionId === targetQuestion.id) {
    messages.push("Una pregunta no puede depender de si misma.");
  }

  if (!values.questionId) {
    messages.push("Selecciona una pregunta origen anterior.");
  }

  if (values.questionId && !sourceQuestions.some((question) => question.id === values.questionId)) {
    messages.push("La pregunta origen debe existir, ser compatible y estar antes de esta pregunta.");
  }

  if (values.conditionType === "ANSWER_EQUALS" && !values.value.trim()) {
    messages.push("Selecciona o ingresa el valor esperado.");
  }

  if (
    (
      values.conditionType === "ANY_SELECTED" ||
      values.conditionType === "ALL_SELECTED" ||
      values.conditionType === "NONE_SELECTED"
    ) &&
    values.selectedValues.length === 0
  ) {
    messages.push("Selecciona al menos una opcion para la condicion.");
  }

  if (values.conditionType === "NUMBER_RANGE") {
    const hasMin = values.min.trim().length > 0;
    const hasMax = values.max.trim().length > 0;
    const minValue = Number(values.min);
    const maxValue = Number(values.max);

    if (!hasMin && !hasMax) {
      messages.push("Ingresa al menos un minimo o un maximo para el rango.");
    }

    if ((hasMin && !Number.isFinite(minValue)) || (hasMax && !Number.isFinite(maxValue))) {
      messages.push("El minimo y el maximo deben ser numeros validos.");
    }

    if (hasMin && hasMax && Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue > maxValue) {
      messages.push("El minimo no puede ser mayor que el maximo.");
    }
  }

  return messages;
}

function isQuestionCompatibleWithCondition(
  question: ScreenerQuestion,
  conditionType: ConditionType
): boolean {
  switch (conditionType) {
    case "ANSWER_EQUALS":
      return hasOptions(question) || question.type === "SHORT_TEXT" || question.type === "LONG_TEXT";
    case "ANY_SELECTED":
    case "ALL_SELECTED":
    case "NONE_SELECTED":
      return question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST";
    case "NUMBER_RANGE":
      return question.type === "INTEGER";
  }
}

function hasOptions(question: ScreenerQuestion): question is ScreenerQuestion & { options: Array<{ label: string; value: string }> } {
  return "options" in question && question.type !== "CONSENT_YES_NO";
}

function stringifyComparableValue(value: ScreenerComparableValue): string {
  return String(value);
}

function SubmitButton({ children, disabled }: { children: string; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={secondaryButtonClass} disabled={disabled || pending} type="submit">
      {pending ? UI_LABELS.common.saving : children}
    </button>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
