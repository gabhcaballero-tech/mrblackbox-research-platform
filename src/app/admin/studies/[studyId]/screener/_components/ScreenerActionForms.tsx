"use client";

import { useActionState } from "react";
import {
  publishScreenerAction,
  saveScreenerMetadataAction
} from "@/modules/screener/actions";
import {
  initialScreenerDraftActionState,
  type ScreenerDraftActionState
} from "@/modules/screener/action-state";
import type { ScreenerDefinition } from "@/modules/screener";
import { UI_LABELS } from "@/shared/ui/labels";
import { SubmitButton } from "@/app/admin/_components/SubmitButton";

type ScreenerMetadataFormProps = {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
  action?: (
    state: ScreenerDraftActionState,
    formData: FormData
  ) => Promise<ScreenerDraftActionState>;
};

type PublishVersionFormProps = {
  canPublish: boolean;
  definition: ScreenerDefinition;
  isPreparingNewVersion: boolean;
  readOnly: boolean;
  studyId: string;
  action?: (
    state: ScreenerDraftActionState,
    formData: FormData
  ) => Promise<ScreenerDraftActionState>;
};

export function ScreenerMetadataForm({
  action,
  definition,
  readOnly,
  studyId
}: ScreenerMetadataFormProps) {
  const [state, formAction] = useActionState(
    action ?? saveScreenerMetadataAction.bind(null, studyId),
    initialScreenerDraftActionState
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <label className={labelClass}>
        {UI_LABELS.screener.title}
        <input className={inputClass} defaultValue={definition.title} disabled={readOnly} name="title" />
        {state.fieldErrors?.title?.length ? (
          <span className="text-xs font-medium text-red-700">{state.fieldErrors.title[0]}</span>
        ) : null}
      </label>
      <label className={labelClass}>
        {UI_LABELS.screener.optionalDescription}
        <input
          className={inputClass}
          defaultValue={definition.description ?? ""}
          disabled={readOnly}
          name="description"
        />
        {state.fieldErrors?.description?.length ? (
          <span className="text-xs font-medium text-red-700">{state.fieldErrors.description[0]}</span>
        ) : null}
      </label>
      <div className="md:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ScreenerFormMessage message={state.message} status={state.status} />
          <SubmitButton disabled={readOnly} pendingLabel={UI_LABELS.common.saving}>
            {UI_LABELS.actions.saveDraft}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function PublishVersionForm({
  action,
  canPublish,
  definition,
  isPreparingNewVersion,
  readOnly,
  studyId
}: PublishVersionFormProps) {
  const [state, formAction] = useActionState(
    action ?? publishScreenerAction.bind(null, studyId),
    initialScreenerDraftActionState
  );
  const hasNoQuestions = definition.questions.length === 0;
  const optionQuestionsWithoutOptions = definition.questions.filter(
    (question) => "options" in question && question.options.length === 0
  );

  return (
    <form action={formAction} className="space-y-4">
      {hasNoQuestions ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          No puedes publicar una versión sin preguntas.
        </p>
      ) : null}
      {!hasNoQuestions && optionQuestionsWithoutOptions.length > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          Antes de publicar, agrega al menos una opción a cada pregunta de selección.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ScreenerFormMessage message={state.message} status={state.status} />
        <SubmitButton disabled={readOnly || !canPublish} pendingLabel={UI_LABELS.common.publishing}>
          {isPreparingNewVersion ? "Publicar nueva versión" : UI_LABELS.actions.publishVersion}
        </SubmitButton>
      </div>
    </form>
  );
}

function ScreenerFormMessage({
  message,
  status
}: {
  message?: string;
  status: "idle" | "success" | "error";
}) {
  if (!message || status === "idle") {
    return <div aria-hidden="true" className="min-h-5" />;
  }

  const tone =
    status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${tone}`} role={status === "success" ? "status" : "alert"}>
      {message}
    </p>
  );
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
