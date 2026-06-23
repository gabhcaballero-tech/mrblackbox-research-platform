"use client";

import { type FormEvent, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  clearScreenerNseAction,
  saveScreenerNseAction,
  type ScreenerNseActionState
} from "@/modules/screener/actions";
import type { ScreenerDefinition } from "@/modules/screener";
import {
  createEmptyNseRange,
  createNseEditorState,
  createNseInputFromQuestion,
  getNseCompatibleQuestions,
  serializeNseInputsForCompatibility,
  serializeNseRangesForCompatibility,
  validateNseEditorState,
  type NseEditorQuestion,
  type NseEditorRange,
  type NseEditorState
} from "@/modules/screener/nse-editor";
import { UI_LABELS } from "@/shared/ui/labels";

type NseGuidedEditorProps = {
  definition: ScreenerDefinition;
  readOnly: boolean;
  studyId: string;
};

export function NseGuidedEditor({ definition, readOnly, studyId }: NseGuidedEditorProps) {
  const compatibleQuestions = useMemo(() => getNseCompatibleQuestions(definition), [definition]);
  const [state, setState] = useState<NseEditorState>(() => createNseEditorState(definition));
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(() =>
    definition.nse ? buildNseSignature(createNseEditorState(definition)) : null
  );
  const [actionState, formAction] = useActionState(saveScreenerNseAction.bind(null, studyId), {
    message: "",
    ok: false
  } satisfies ScreenerNseActionState);
  const lastHandledSuccessMessageRef = useRef<string>("");
  const validation = validateNseEditorState(state);
  const availableQuestions = compatibleQuestions.filter(
    (question) => !state.inputs.some((input) => input.questionId === question.id)
  );
  const currentSignature = buildNseSignature(state);
  const isSavedConfiguration = lastSavedSignature !== null && currentSignature === lastSavedSignature;

  useEffect(() => {
    if (actionState.ok && actionState.message && actionState.message !== lastHandledSuccessMessageRef.current) {
      lastHandledSuccessMessageRef.current = actionState.message;
      setLastSavedSignature(buildNseSignature(state));
    }
  }, [actionState, state]);

  function addQuestion() {
    const question = compatibleQuestions.find((candidate) => candidate.id === selectedQuestionId);

    if (!question) {
      return;
    }

    setState((current) => ({
      ...current,
      inputs: [...current.inputs, createNseInputFromQuestion(question)]
    }));
    setSelectedQuestionId("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!validateNseEditorState(state).ready) {
      event.preventDefault();
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-zinc-950">{UI_LABELS.screener.nseCalculation}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Selecciona las preguntas que aportan puntaje. Para cada respuesta asigna un valor.
          Después define los rangos que clasifican el puntaje total.
        </p>
      </div>

      <form action={formAction} className="space-y-6" onSubmit={handleSubmit}>
        <input
          name="inputsText"
          readOnly
          type="hidden"
          value={serializeNseInputsForCompatibility(state.inputs)}
        />
        <input
          name="rangesText"
          readOnly
          type="hidden"
          value={serializeNseRangesForCompatibility(state.ranges)}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            {UI_LABELS.screener.nseCode}
            <input
              className={inputClass}
              disabled={readOnly}
              name="code"
              onChange={(event) => setState((current) => ({ ...current, code: event.target.value }))}
              value={state.code}
            />
          </label>
          <label className={labelClass}>
            {UI_LABELS.screener.nseLabel}
            <input
              className={inputClass}
              disabled={readOnly}
              name="label"
              onChange={(event) => setState((current) => ({ ...current, label: event.target.value }))}
              value={state.label}
            />
          </label>
        </div>

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

        {isSavedConfiguration ? (
          <p className="text-sm text-zinc-600" role="status">
            Esta configuracion NSE ya esta guardada en el borrador.
          </p>
        ) : null}

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <label className={labelClass}>
            Agregar pregunta al cálculo
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                className={inputClass}
                disabled={readOnly || availableQuestions.length === 0}
                onChange={(event) => setSelectedQuestionId(event.target.value)}
                value={selectedQuestionId}
              >
                <option value="">
                  {availableQuestions.length === 0
                    ? "No hay preguntas compatibles disponibles"
                    : "Selecciona una pregunta"}
                </option>
                {availableQuestions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.text}
                  </option>
                ))}
              </select>
              <button
                className={secondaryButtonClass}
                disabled={readOnly || !selectedQuestionId}
                onClick={addQuestion}
                type="button"
              >
                Agregar
              </button>
            </div>
          </label>
          <p className="mt-2 text-xs text-zinc-500">
            Se muestran preguntas de selección única o múltiple con opciones configuradas.
          </p>
        </div>

        <div className="space-y-4">
          {state.inputs.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
              Aún no hay preguntas incluidas en el cálculo.
            </p>
          ) : (
            state.inputs.map((input, inputIndex) => (
              <QuestionScoreCard
                input={input}
                inputIndex={inputIndex}
                key={input.questionId}
                readOnly={readOnly}
                setState={setState}
              />
            ))
          )}
        </div>

        <RangeEditor readOnly={readOnly} setState={setState} state={state} />
        <NseSummary
          inputsCount={state.inputs.length}
          isSavedConfiguration={isSavedConfiguration}
          rangesCount={state.ranges.length}
          validation={validation}
        />

        <div className="flex flex-wrap gap-2">
          <NseSubmitButton disabled={readOnly || !validation.ready} />
        </div>
      </form>

      <form action={clearScreenerNseAction.bind(null, studyId)} className="mt-3">
        <button className={secondaryButtonClass} disabled={readOnly} type="submit">
          {UI_LABELS.actions.removeNse}
        </button>
      </form>
    </section>
  );
}

function QuestionScoreCard({
  input,
  inputIndex,
  readOnly,
  setState
}: {
  input: NseEditorQuestion;
  inputIndex: number;
  readOnly: boolean;
  setState: (updater: (current: NseEditorState) => NseEditorState) => void;
}) {
  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">Pregunta: {input.questionText}</h3>
          <p className="mt-1 text-xs text-zinc-500">ID técnico: {input.questionId}</p>
        </div>
        <button
          className={secondaryButtonClass}
          disabled={readOnly}
          onClick={() =>
            setState((current) => ({
              ...current,
              inputs: current.inputs.filter((candidate) => candidate.questionId !== input.questionId)
            }))
          }
          type="button"
        >
          Eliminar pregunta del cálculo
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">Respuesta</th>
              <th className="w-36 px-2 py-2 text-right font-medium">Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {input.rows.map((row, rowIndex) => (
              <tr className="border-t border-zinc-100" key={row.value}>
                <td className="break-words px-2 py-2 text-zinc-900">{row.label}</td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Puntaje para ${row.label}`}
                    className={`${inputClass} text-right`}
                    disabled={readOnly}
                    onChange={(event) =>
                      setState((current) => updateScore(current, inputIndex, rowIndex, event.target.value))
                    }
                    type="number"
                    value={row.score}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className={`${labelClass} mt-4 max-w-xs`}>
        Puntaje si falta respuesta
        <input
          className={inputClass}
          disabled={readOnly}
          onChange={(event) =>
            setState((current) => updateMissingScore(current, inputIndex, event.target.value))
          }
          type="number"
          value={input.missingScore}
        />
      </label>
    </article>
  );
}

function RangeEditor({
  readOnly,
  setState,
  state
}: {
  readOnly: boolean;
  setState: (updater: (current: NseEditorState) => NseEditorState) => void;
  state: NseEditorState;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">{UI_LABELS.screener.nseRanges}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Define cómo se clasifica el puntaje total y qué rangos son elegibles.
          </p>
        </div>
        <button
          className={secondaryButtonClass}
          disabled={readOnly}
          onClick={() =>
            setState((current) => ({
              ...current,
              ranges: [...current.ranges, createEmptyNseRange(current.ranges.length + 1)]
            }))
          }
          type="button"
        >
          Agregar rango
        </button>
      </div>

      {state.ranges.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-sm text-zinc-600">
          Aún no hay rangos configurados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[48rem] text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="px-2 py-2 font-medium">Código técnico</th>
                <th className="px-2 py-2 font-medium">Etiqueta visible</th>
                <th className="px-2 py-2 font-medium">Mínimo</th>
                <th className="px-2 py-2 font-medium">Máximo</th>
                <th className="px-2 py-2 font-medium">Elegible</th>
                <th className="px-2 py-2 font-medium">Orden</th>
              </tr>
            </thead>
            <tbody>
              {state.ranges.map((range, index) => (
                <tr className="border-t border-zinc-200" key={`${range.code}-${index}`}>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Código del rango ${index + 1}`}
                      className={inputClass}
                      disabled={readOnly}
                      onChange={(event) => setState((current) => updateRange(current, index, { code: event.target.value }))}
                      value={range.code}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Etiqueta del rango ${index + 1}`}
                      className={inputClass}
                      disabled={readOnly}
                      onChange={(event) => setState((current) => updateRange(current, index, { label: event.target.value }))}
                      value={range.label}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Puntaje mínimo del rango ${index + 1}`}
                      className={inputClass}
                      disabled={readOnly}
                      onChange={(event) => setState((current) => updateRange(current, index, { min: event.target.value }))}
                      type="number"
                      value={range.min}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Puntaje máximo del rango ${index + 1}`}
                      className={inputClass}
                      disabled={readOnly}
                      onChange={(event) => setState((current) => updateRange(current, index, { max: event.target.value }))}
                      type="number"
                      value={range.max}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <label className="flex items-center gap-2 text-zinc-700">
                      <input
                        checked={range.eligible}
                        disabled={readOnly}
                        onChange={(event) =>
                          setState((current) => updateRange(current, index, { eligible: event.target.checked }))
                        }
                        type="checkbox"
                      />
                      Elegible
                    </label>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        className={tinyButtonClass}
                        disabled={readOnly || index === 0}
                        onClick={() => setState((current) => moveRange(current, index, -1))}
                        type="button"
                      >
                        Subir
                      </button>
                      <button
                        className={tinyButtonClass}
                        disabled={readOnly || index === state.ranges.length - 1}
                        onClick={() => setState((current) => moveRange(current, index, 1))}
                        type="button"
                      >
                        Bajar
                      </button>
                      <button
                        className={tinyButtonClass}
                        disabled={readOnly}
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            ranges: current.ranges.filter((_, currentIndex) => currentIndex !== index)
                          }))
                        }
                        type="button"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NseSummary({
  inputsCount,
  isSavedConfiguration,
  rangesCount,
  validation
}: {
  inputsCount: number;
  isSavedConfiguration: boolean;
  rangesCount: number;
  validation: ReturnType<typeof validateNseEditorState>;
}) {
  return (
    <section className="rounded-md border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">
      <h3 className="font-semibold">Resumen del cálculo</h3>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="font-medium">Preguntas incluidas</dt>
          <dd>{inputsCount}</dd>
        </div>
        <div>
          <dt className="font-medium">Puntajes configurados</dt>
          <dd>
            {validation.configuredScores}/{validation.totalScores}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Rangos configurados</dt>
          <dd>{rangesCount}</dd>
        </div>
        <div>
          <dt className="font-medium">Rangos elegibles</dt>
          <dd>{validation.eligibleRanges}</dd>
        </div>
        <div>
          <dt className="font-medium">Estado</dt>
          <dd>
            {validation.ready
              ? isSavedConfiguration
                ? "NSE configurado y guardado"
                : "Configuracion valida para guardar"
              : "Faltan configuraciones"}
          </dd>
        </div>
      </dl>
      {validation.errors.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-red-800">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-800">
          {validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function updateScore(
  state: NseEditorState,
  inputIndex: number,
  rowIndex: number,
  score: string
): NseEditorState {
  return {
    ...state,
    inputs: state.inputs.map((input, currentInputIndex) =>
      currentInputIndex === inputIndex
        ? {
            ...input,
            rows: input.rows.map((row, currentRowIndex) =>
              currentRowIndex === rowIndex ? { ...row, score } : row
            )
          }
        : input
    )
  };
}

function buildNseSignature(state: NseEditorState): string {
  return JSON.stringify({
    code: state.code,
    inputs: state.inputs.map((input) => ({
      missingScore: input.missingScore,
      questionId: input.questionId,
      rows: input.rows.map((row) => ({
        score: row.score,
        value: row.value
      }))
    })),
    label: state.label,
    ranges: state.ranges.map((range) => ({
      code: range.code,
      eligible: range.eligible,
      label: range.label,
      max: range.max,
      min: range.min
    }))
  });
}

function NseSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={primaryButtonClass} disabled={disabled || pending} type="submit">
      {pending ? "Guardando NSE..." : UI_LABELS.actions.saveNse}
    </button>
  );
}

function updateMissingScore(
  state: NseEditorState,
  inputIndex: number,
  missingScore: string
): NseEditorState {
  return {
    ...state,
    inputs: state.inputs.map((input, currentInputIndex) =>
      currentInputIndex === inputIndex ? { ...input, missingScore } : input
    )
  };
}

function updateRange(
  state: NseEditorState,
  rangeIndex: number,
  patch: Partial<NseEditorRange>
): NseEditorState {
  return {
    ...state,
    ranges: state.ranges.map((range, currentIndex) =>
      currentIndex === rangeIndex ? { ...range, ...patch } : range
    )
  };
}

function moveRange(state: NseEditorState, rangeIndex: number, offset: -1 | 1): NseEditorState {
  const nextIndex = rangeIndex + offset;

  if (nextIndex < 0 || nextIndex >= state.ranges.length) {
    return state;
  }

  const ranges = [...state.ranges];
  [ranges[rangeIndex], ranges[nextIndex]] = [ranges[nextIndex]!, ranges[rangeIndex]!];

  return {
    ...state,
    ranges
  };
}

const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const inputClass =
  "min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500";
const primaryButtonClass =
  "inline-flex w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex w-fit rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400";
const tinyButtonClass =
  "inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400";
