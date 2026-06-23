"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addScreenerOptionAction,
  type ScreenerOptionActionState
} from "@/modules/screener/actions";
import type { ScreenerOption } from "@/modules/screener";
import { RULE_OUTCOME_LABELS, UI_LABELS } from "@/shared/ui/labels";

type OptionAddFormProps = {
  action?: (
    studyId: string,
    questionId: string,
    formData: FormData
  ) => Promise<ScreenerOptionActionState>;
  optionActionTypes: Array<ScreenerOption["actions"][number]["type"]>;
  questionId: string;
  readOnly: boolean;
  studyId: string;
};

type OptionFormValues = {
  actionCode: string;
  actionReason: string;
  actionRequiresReview: boolean;
  actionType: "CONTINUE" | "FLAG" | "NONE" | "PENDING_REVIEW" | "TERMINATE";
  isOther: boolean;
  label: string;
  otherTextRequired: boolean;
  value: string;
};

const emptyValues: OptionFormValues = {
  actionCode: "",
  actionReason: "",
  actionRequiresReview: false,
  actionType: "NONE",
  isOther: false,
  label: "",
  otherTextRequired: false,
  value: ""
};

export function OptionAddForm({
  action = addScreenerOptionAction,
  optionActionTypes,
  questionId,
  readOnly,
  studyId
}: OptionAddFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<OptionFormValues>(emptyValues);
  const [result, setResult] = useState<ScreenerOptionActionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const formData = new FormData(event.currentTarget);
      const nextResult = await action(studyId, questionId, formData);
      setResult(nextResult);

      if (nextResult.ok) {
        setValues(emptyValues);
        router.refresh();
      }
    } catch {
      setResult({
        message: "No se pudo guardar la opción. Intenta nuevamente.",
        ok: false
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = readOnly || isSubmitting;

  return (
    <form className="grid gap-3 rounded-md border border-zinc-100 p-3 md:grid-cols-4" onSubmit={handleSubmit}>
      {result ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm md:col-span-4 ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </div>
      ) : null}

      <label className={labelClass}>
        {UI_LABELS.screener.optionValue}
        <input
          className={inputClass}
          disabled={disabled}
          name="value"
          onChange={(event) => setValues((current) => ({ ...current, value: event.target.value }))}
          required
          value={values.value}
        />
        {result?.fieldErrors?.value?.[0] ? (
          <span className="text-xs text-rose-700">{result.fieldErrors.value[0]}</span>
        ) : null}
      </label>

      <label className={labelClass}>
        {UI_LABELS.screener.visibleLabel}
        <input
          className={inputClass}
          disabled={disabled}
          name="label"
          onChange={(event) => setValues((current) => ({ ...current, label: event.target.value }))}
          required
          value={values.label}
        />
        {result?.fieldErrors?.label?.[0] ? (
          <span className="text-xs text-rose-700">{result.fieldErrors.label[0]}</span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          checked={values.isOther}
          disabled={disabled}
          name="isOther"
          onChange={(event) => setValues((current) => ({ ...current, isOther: event.target.checked }))}
          type="checkbox"
        />
        {UI_LABELS.screener.other}
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          checked={values.otherTextRequired}
          disabled={disabled}
          name="otherTextRequired"
          onChange={(event) =>
            setValues((current) => ({ ...current, otherTextRequired: event.target.checked }))
          }
          type="checkbox"
        />
        {UI_LABELS.screener.otherRequiresText}
      </label>

      <label className={labelClass}>
        {UI_LABELS.screener.action}
        <select
          className={inputClass}
          disabled={disabled}
          name="actionType"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              actionType: event.target.value as OptionFormValues["actionType"]
            }))
          }
          value={values.actionType}
        >
          <option value="NONE">{UI_LABELS.common.doesNotApply}</option>
          {optionActionTypes.map((type) => (
            <option key={type} value={type}>
              {RULE_OUTCOME_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        {UI_LABELS.screener.actionCode}
        <input
          className={inputClass}
          disabled={disabled}
          name="actionCode"
          onChange={(event) => setValues((current) => ({ ...current, actionCode: event.target.value }))}
          value={values.actionCode}
        />
      </label>

      <label className={labelClass}>
        {UI_LABELS.screener.reason}
        <input
          className={inputClass}
          disabled={disabled}
          name="actionReason"
          onChange={(event) => setValues((current) => ({ ...current, actionReason: event.target.value }))}
          value={values.actionReason}
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          checked={values.actionRequiresReview}
          disabled={disabled}
          name="actionRequiresReview"
          onChange={(event) =>
            setValues((current) => ({ ...current, actionRequiresReview: event.target.checked }))
          }
          type="checkbox"
        />
        {UI_LABELS.screener.requiresReview}
      </label>

      <div className="md:col-span-4">
        <button className={secondaryButtonClass} disabled={disabled} type="submit">
          {isSubmitting ? UI_LABELS.common.saving : UI_LABELS.actions.addOption}
        </button>
      </div>
    </form>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
