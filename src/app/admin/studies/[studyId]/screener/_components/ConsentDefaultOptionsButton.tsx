"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addConsentDefaultOptionsAction,
  type ScreenerOptionActionState
} from "@/modules/screener/actions";

type ConsentDefaultOptionsButtonProps = {
  action?: (
    studyId: string,
    questionId: string,
    formData: FormData
  ) => Promise<ScreenerOptionActionState>;
  questionId: string;
  readOnly: boolean;
  studyId: string;
};

export function ConsentDefaultOptionsButton({
  action = addConsentDefaultOptionsAction,
  questionId,
  readOnly,
  studyId
}: ConsentDefaultOptionsButtonProps) {
  const router = useRouter();
  const [result, setResult] = useState<ScreenerOptionActionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const nextResult = await action(studyId, questionId, new FormData(event.currentTarget));
      setResult(nextResult);

      if (nextResult.ok) {
        router.refresh();
      }
    } catch {
      setResult({
        message: "No se pudieron agregar las opciones de consentimiento. Intenta nuevamente.",
        ok: false
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-3 space-y-2" onSubmit={handleSubmit}>
      {result ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      ) : null}
      <button
        className="inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
        disabled={readOnly || isSubmitting}
        type="submit"
      >
        {isSubmitting
          ? "Agregando opciones..."
          : "Agregar opciones predeterminadas de consentimiento"}
      </button>
    </form>
  );
}
