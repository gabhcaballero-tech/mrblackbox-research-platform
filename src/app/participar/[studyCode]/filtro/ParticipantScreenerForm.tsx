"use client";

import Link from "next/link";
import { useState } from "react";
import type { ScreenerAnswer, ScreenerQuestion } from "@/modules/screener";
import type {
  ParticipantPortalAttemptScreen,
  ParticipantPortalPublicResult
} from "@/modules/participant-portal/screener-service";
import { saveParticipantPortalScreenerAnswerAction } from "@/modules/participant-portal/screener-actions";
import {
  NormalizedParticipantTextArea,
  NormalizedParticipantTextInput
} from "../_components/NormalizedParticipantTextField";
import { PendingSubmitButton } from "../_components/PendingSubmitButton";
import { PortalEvidenceCapture } from "../_components/PortalEvidenceCapture";

type ParticipantScreenerFormProps = {
  error?: string;
  screen: ParticipantPortalAttemptScreen;
};

export function ParticipantScreenerForm({ error, screen }: ParticipantScreenerFormProps) {
  const question = screen.currentQuestion;
  const [perfumePhotoCount, setPerfumePhotoCount] = useState(screen.evidence.perfumePhotos);

  if (!question) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Ya registramos tus respuestas.</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Consulta el estado de tu participacion.</p>
        <Link className={`${primaryButtonClass} mt-5`} href={`/participar/${screen.study.code}/resultado`}>
          Ver resultado
        </Link>
      </section>
    );
  }

  const answer = screen.answers[question.id];
  const isPerfumeQuestion = Boolean(screen.photoNotice);
  const hasMinimumPerfumePhotos = perfumePhotoCount >= screen.evidence.minPerfumePhotos;
  const canSubmit = !isPerfumeQuestion || hasMinimumPerfumePhotos;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-medium text-teal-700">
          Pregunta {screen.progress.currentIndex} de {screen.progress.totalVisibleQuestions}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">{question.text}</h2>
        {question.helpText ? <p className="mt-2 text-sm leading-6 text-zinc-600">{question.helpText}</p> : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <form
        action={saveParticipantPortalScreenerAnswerAction.bind(
          null,
          screen.study.code,
          screen.attempt.id,
          question.id
        )}
        className="space-y-5"
      >
        <QuestionControl answer={answer} question={question} />
        {screen.photoNotice ? (
          <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-900">
            {screen.photoNotice}
          </p>
        ) : null}
        {isPerfumeQuestion ? (
          <PortalEvidenceCapture
            buttonLabel="Tomar foto del perfume"
            captureFacingMode="environment"
            currentCount={perfumePhotoCount}
            description="Despues de indicar las marcas que utilizas, toma de una a cinco fotos de tus perfumes. Debe verse la marca o el envase cuando sea posible."
            emptyState="Todavia no hay fotos de perfumes registradas."
            evidenceType="PERFUME_PHOTO"
            maxCount={screen.evidence.maxPerfumePhotos}
            minRequired={screen.evidence.minPerfumePhotos}
            onCountChange={setPerfumePhotoCount}
            studyCode={screen.study.code}
            title="Fotos de perfumes"
          />
        ) : null}
        {!canSubmit ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Debes registrar al menos {screen.evidence.minPerfumePhotos} foto de perfume antes de continuar.
          </p>
        ) : null}
        <PendingSubmitButton
          className={primaryButtonClass}
          disabled={!canSubmit}
          label="Guardar y continuar"
          pendingLabel="Guardando..."
        />
      </form>
    </section>
  );
}

export function ParticipantPortalResultCard({ result }: { result: ParticipantPortalPublicResult }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Estado de participacion</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{result.study.name}</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-700">{result.message}</p>

      {result.kind === "IN_PROGRESS" ? (
        <Link className={`${primaryButtonClass} mt-6`} href={`/participar/${result.study.code}/filtro`}>
          Continuar filtro
        </Link>
      ) : null}

      {result.showEvidencePlaceholder ? (
        <Link className={`${primaryButtonClass} mt-6`} href={`/participar/${result.study.code}/selfie`}>
          Continuar con selfie
        </Link>
      ) : null}
    </section>
  );
}

function QuestionControl({ answer, question }: { answer: ScreenerAnswer | undefined; question: ScreenerQuestion }) {
  if (question.type === "INTEGER") {
    return (
      <label className={labelClass}>
        Respuesta numerica
        <input
          className={inputClass}
          defaultValue={typeof answer === "number" ? answer : ""}
          inputMode="numeric"
          max={question.validation.max}
          min={question.validation.min}
          name="value"
          required={question.required}
          type="number"
        />
      </label>
    );
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    if (question.type === "LONG_TEXT") {
      return (
        <label className={labelClass}>
          Respuesta
          <NormalizedParticipantTextArea
            className={inputClass}
            defaultValue={typeof answer === "string" ? answer : ""}
            maxLength={question.validation.maxLength}
            minLength={question.validation.minLength}
            name="value"
            required={question.required}
            rows={4}
          />
        </label>
      );
    }

    return (
      <label className={labelClass}>
        Respuesta
          <NormalizedParticipantTextInput
            className={inputClass}
            defaultValue={typeof answer === "string" ? answer : ""}
          maxLength={question.validation.maxLength}
          minLength={question.validation.minLength}
          name="value"
          required={question.required}
        />
      </label>
    );
  }

  if (!("options" in question)) {
    return null;
  }

  const selectedValues = selectedAnswerValues(answer);
  const selectedOtherText = selectedOtherTextFromAnswer(answer);
  const hasOther = question.options.some((option) => option.isOther);

  if (question.type === "MULTIPLE_CHOICE" || question.type === "INTERVIEWER_CHECKLIST") {
    return (
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-700">Selecciona las opciones aplicables</legend>
        {question.options.map((option) => (
          <label
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-800"
            key={option.value}
          >
            <input defaultChecked={selectedValues.includes(option.value)} name="value" type="checkbox" value={option.value} />
            {option.label}
          </label>
        ))}
        {hasOther ? <OtherTextInput defaultValue={selectedOtherText} /> : null}
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-700">Selecciona una respuesta</legend>
      {question.options.map((option) => (
        <label
          className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-800"
          key={option.value}
        >
          <input
            defaultChecked={selectedValues.includes(option.value)}
            name="value"
            required={question.required}
            type="radio"
            value={option.value}
          />
          {option.label}
        </label>
      ))}
      {hasOther ? <OtherTextInput defaultValue={selectedOtherText} /> : null}
    </fieldset>
  );
}

function OtherTextInput({ defaultValue }: { defaultValue: string }) {
  return (
    <label className={labelClass}>
      Especifica
      <NormalizedParticipantTextInput className={inputClass} defaultValue={defaultValue} name="otherText" />
    </label>
  );
}

function selectedAnswerValues(answer: ScreenerAnswer | undefined): string[] {
  if (answer === undefined) {
    return [];
  }

  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  if (typeof answer === "object") {
    if (answer.values) {
      return answer.values.map(String);
    }

    if (answer.value !== undefined) {
      return [String(answer.value)];
    }

    return [];
  }

  return [String(answer)];
}

function selectedOtherTextFromAnswer(answer: ScreenerAnswer | undefined): string {
  return answer && typeof answer === "object" && !Array.isArray(answer) ? answer.otherText ?? "" : "";
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-12 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100";
const primaryButtonClass =
  "inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300";
