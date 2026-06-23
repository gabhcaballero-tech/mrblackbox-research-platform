"use client";

import { useActionState } from "react";
import { updateStudyAction } from "@/modules/studies/actions";
import { initialStudyActionState } from "@/modules/studies/action-state";
import type { StudyListItem } from "@/modules/studies/repository";
import { StudyActionMessage } from "./StudyActionMessage";
import { StudyFormFields } from "./StudyFormFields";
import { SubmitButton } from "./SubmitButton";

type StudyEditFormProps = {
  study: StudyListItem;
};

export function StudyEditForm({ study }: StudyEditFormProps) {
  const [state, formAction] = useActionState(updateStudyAction, initialStudyActionState);

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <input name="id" type="hidden" value={study.id} />
      <StudyFormFields
        defaults={{
          code: study.code,
          name: study.name,
          timeZoneIana: study.timeZoneIana
        }}
        state={state}
      />
      {state.fieldErrors?.id?.length ? (
        <p className="text-xs font-medium text-red-700">{state.fieldErrors.id[0]}</p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StudyActionMessage state={state} />
        <SubmitButton pendingLabel="Guardando...">Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}
