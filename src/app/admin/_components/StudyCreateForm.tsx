"use client";

import { useActionState, useEffect, useRef } from "react";
import { createStudyAction } from "@/modules/studies/actions";
import { initialStudyActionState } from "@/modules/studies/action-state";
import { StudyActionMessage } from "./StudyActionMessage";
import { StudyFormFields } from "./StudyFormFields";
import { SubmitButton } from "./SubmitButton";

export function StudyCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(createStudyAction, initialStudyActionState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
      id="create-study"
    >
      <div className="mb-5 flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Nuevo borrador
        </p>
        <h2 className="text-xl font-semibold text-zinc-950">Crear estudio</h2>
        <p className="text-sm leading-6 text-zinc-600">
          El estado inicial siempre sera DRAFT. Productos, cuotas y cuestionarios se agregaran
          despues.
        </p>
      </div>

      <form action={formAction} className="space-y-4" ref={formRef}>
        <StudyFormFields state={state} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StudyActionMessage state={state} />
          <SubmitButton pendingLabel="Creando...">Crear estudio</SubmitButton>
        </div>
      </form>
    </section>
  );
}
