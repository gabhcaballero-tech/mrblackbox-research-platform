"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { activateStudyAction } from "@/modules/studies/actions";
import { initialStudyActionState } from "@/modules/studies/action-state";
import { UI_LABELS } from "@/shared/ui/labels";

type ActivateStudyPanelProps = {
  canActivate: boolean;
  studyId: string;
};

export function ActivateStudyPanel({ canActivate, studyId }: ActivateStudyPanelProps) {
  const [state, formAction] = useActionState(
    activateStudyAction.bind(null, studyId),
    initialStudyActionState
  );

  if (!canActivate) {
    return null;
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Activar estudio</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-700">
            Activa el estudio para que Campo pueda aplicar el screener publicado activo.
          </p>
          {state.message ? (
            <p
              className={`mt-3 text-sm font-medium ${
                state.status === "success" ? "text-emerald-800" : "text-rose-700"
              }`}
              role={state.status === "success" ? "status" : "alert"}
            >
              {state.message}
            </p>
          ) : null}
        </div>
        <form action={formAction}>
          <SubmitButton />
        </form>
      </div>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex w-fit rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
      disabled={pending}
      type="submit"
    >
      {pending ? UI_LABELS.common.saving : "Activar estudio"}
    </button>
  );
}
