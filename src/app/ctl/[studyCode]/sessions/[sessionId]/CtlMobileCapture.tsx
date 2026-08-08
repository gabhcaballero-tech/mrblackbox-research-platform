"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CTL_AGE_RANGE_OPTIONS,
  calculateCtlNse,
  getCtlApplicableQuestions,
  type CtlDefinition,
  type CtlMatrixQuestionDefinition,
  type CtlQuestionDefinition,
  type CtlQuestionOption,
  type CtlScaleQuestionDefinition
} from "@/modules/ctl/definition";
import {
  finishPublicCtlSessionAction,
  savePublicCtlQuestionAnswerAction
} from "@/modules/ctl/public-actions";
import type { CtlAgeAnswerValue } from "@/modules/ctl/service";

type FlatQuestion = {
  index: number;
  question: CtlQuestionDefinition;
  sectionId: string;
  sectionInstructions?: Array<{ text: string; title?: string; type: string }>;
  sectionInstructionTexts: string[];
  sectionTitle: string;
};

type CtlQuestionLookup = Map<string, CtlQuestionDefinition>;

type CtlMobileCaptureProps = {
  answers: Record<string, unknown>;
  completedAtLabel?: string | null;
  definition: CtlDefinition;
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  };
  readOnly: boolean;
  sessionId: string;
  phaseProgress?: Array<unknown>;
  startedAtLabel?: string | null;
  studyCode: string;
  todayLabel?: string;
};

type CtlTriangularRotationDisplay = {
  triangular1: {
    pr1: string;
    pr2: string;
    pr3: string;
  };
  triangular2: {
    pr1: string;
    pr2: string;
    pr3: string;
  };
};

type ActionResult =
  | {
      message: string;
      missingQuestionCodes?: string[];
      ok: false;
    }
  | {
      ok: true;
      redirectTo?: string;
    };

export function CtlMobileCapture({
  answers,
  completedAtLabel,
  definition,
  participant,
  readOnly,
  sessionId,
  startedAtLabel,
  studyCode,
  todayLabel
}: CtlMobileCaptureProps) {
  const initialAnswers = useMemo(
    () => ({
      ...buildAutomaticCtlAnswers({ completedAtLabel, participant, startedAtLabel, todayLabel }),
      ...answers
    }),
    [answers, completedAtLabel, participant, startedAtLabel, todayLabel]
  );
  const [localAnswers, setLocalAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const questions = useMemo(() => flattenCtlQuestions(definition, localAnswers), [definition, localAnswers]);
  const questionLookup = useMemo(() => buildCtlQuestionLookup(definition), [definition]);
  const [currentIndex, setCurrentIndex] = useState(() => getInitialCtlQuestionIndex(definition, initialAnswers));
  const [isReviewing, setIsReviewing] = useState(readOnly);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationModal, setValidationModal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const captureTopRef = useRef<HTMLElement | null>(null);
  const hasMountedRef = useRef(false);

  const current = questions[currentIndex];
  const needsTriangularRotation = questions.some(({ question }) => isTriangularQuestionCode(question.code));
  const isMissingTriangularRotation = needsTriangularRotation && !participant.triangularRotation && !readOnly;
  const completedCount = questions.filter(({ question }) => isCtlQuestionAnswered(question, localAnswers[question.code])).length;
  const progressPercent = questions.length > 0 ? Math.round((completedCount / questions.length) * 100) : 0;
  const pendingQuestionCodes = getPendingCtlQuestionCodes(definition, localAnswers);
  const nseCalculation = useMemo(() => calculateCtlNse(definition, localAnswers), [definition, localAnswers]);
  const shouldShowNseResult = isReviewing || current?.sectionId === "DEMOGRAFICOS";
  const canGoBack = !isPending && (isReviewing || currentIndex > 0);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    captureTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIndex, isReviewing]);

  function setAnswer(questionCode: string, answer: unknown) {
    setLocalAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionCode]: answer
    }));
    setError(null);
    setMessage(null);
  }

  function goBack() {
    if (isPending) {
      return;
    }

    setError(null);
    setMessage(null);

    if (isReviewing) {
      setIsReviewing(false);
      setCurrentIndex(Math.max(0, questions.length - 1));
      return;
    }

    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function saveAndContinue() {
    if (!current || readOnly || isPending) {
      return;
    }

    const validation = validateCtlQuestionForClient(current.question, localAnswers[current.question.code]);
    if (!validation.ok) {
      setError(validation.message);
      setValidationModal(validation.message);
      return;
    }

    setError(null);
    setMessage("Guardando respuesta...");
    startTransition(async () => {
      const result = await savePublicCtlQuestionAnswerAction(
        studyCode,
        sessionId,
        current.question.code,
        buildQuestionFormData(current.question, localAnswers[current.question.code])
      ) as ActionResult;

      if (!result.ok) {
        setMessage(null);
        setError(result.message);
        return;
      }

      if (result.redirectTo) {
        setMessage("Entrevista cerrada como no calificada.");
        window.location.assign(result.redirectTo);
        return;
      }

      setMessage("Respuesta guardada.");

      if (currentIndex >= questions.length - 1) {
        setIsReviewing(true);
        return;
      }

      setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
    });
  }

  function finishCtl() {
    if (readOnly || isPending) {
      return;
    }

    const pendingCodes = getPendingCtlQuestionCodes(definition, localAnswers);
    if (pendingCodes.length > 0) {
      const pendingIndex = questions.findIndex(({ question }) => pendingCodes.includes(question.code));
      setIsReviewing(false);
      setCurrentIndex(pendingIndex >= 0 ? pendingIndex : 0);
      setMessage(null);
      setError("Aun hay preguntas obligatorias pendientes.");
      return;
    }

    setError(null);
    setMessage("Finalizando CTL...");
    startTransition(async () => {
      const result = await finishPublicCtlSessionAction(
        studyCode,
        sessionId,
        buildAllAnswersFormData(definition, localAnswers)
      ) as ActionResult;

      if (!result.ok) {
        setMessage(null);
        setError(result.message);
        const firstMissing = result.missingQuestionCodes?.[0]?.split(".")[0];
        if (firstMissing) {
          const missingIndex = questions.findIndex(({ question }) => question.code === firstMissing);
          if (missingIndex >= 0) {
            setIsReviewing(false);
            setCurrentIndex(missingIndex);
          }
        }
        return;
      }

      setMessage("CTL completado correctamente.");
      if (result.redirectTo) {
        window.location.assign(result.redirectTo);
      }
    });
  }

  if (questions.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cuestionario CTL</h2>
        <p className="mt-2 text-sm text-zinc-600">No hay preguntas configuradas para esta captura.</p>
      </section>
    );
  }

  if (isMissingTriangularRotation) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-950">No existe rotacion triangular asignada para este participante.</h2>
        <p className="mt-2 text-sm leading-6 text-rose-900">
          Carga ROTACIONES NAVIGO.xlsx desde Administracion antes de continuar con la entrevista CTL.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6" ref={captureTopRef}>
      <header className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">CTL Navigo Homme</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950">{participant.folio}</h2>
          <p className="text-sm text-zinc-600">{participant.name}</p>
        </div>
        <div aria-label={`Progreso ${completedCount} de ${questions.length}`} className="space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold text-zinc-700">
            <span>{isReviewing ? "Revision final" : `Pregunta ${currentIndex + 1} de ${questions.length}`}</span>
            <span>{completedCount}/{questions.length}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      <AutomaticCtlDetails answers={localAnswers} completedAtLabel={completedAtLabel} />

      <StatusMessages error={error} message={message} />
      {validationModal ? (
        <ValidationModal message={validationModal} onClose={() => setValidationModal(null)} />
      ) : null}

      {isReviewing ? (
        <ReviewPanel
          nseCalculation={nseCalculation}
          pendingCount={pendingQuestionCodes.length}
          pendingQuestionCodes={pendingQuestionCodes}
        />
      ) : current ? (
        <>
          <QuestionStep
            answer={localAnswers[current.question.code]}
            flatQuestion={current}
            onAnswer={setAnswer}
            participant={participant}
            questionLookup={questionLookup}
            readOnly={readOnly}
            sessionId={sessionId}
            answers={localAnswers}
          />
          {shouldShowNseResult ? <CtlNseResultPanel calculation={nseCalculation} /> : null}
        </>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          className={secondaryButtonClass}
          disabled={!canGoBack}
          onClick={goBack}
          type="button"
        >
          Anterior
        </button>
        {isReviewing ? (
          <button
            className={primaryButtonClass}
            disabled={readOnly || isPending}
            onClick={finishCtl}
            type="button"
          >
            {isPending ? "Finalizando CTL..." : "Finalizar CTL"}
          </button>
        ) : (
          <button
            className={primaryButtonClass}
            disabled={readOnly || isPending}
            onClick={saveAndContinue}
            type="button"
          >
            {isPending ? "Guardando..." : currentIndex >= questions.length - 1 ? "Revisar respuestas" : "Siguiente"}
          </button>
        )}
      </div>
    </section>
  );
}

function AutomaticCtlDetails({
  answers,
  completedAtLabel
}: {
  answers: Record<string, unknown>;
  completedAtLabel?: string | null;
}) {
  return (
    <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Datos automaticos CTL</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <AutomaticDetail label="Fecha" value={String(answers.DG_FECHA ?? "Sin registro")} />
        <AutomaticDetail label="Hora inicio" value={String(answers.DG_HORA_INICIO ?? "Sin registro")} />
        {completedAtLabel ? (
          <AutomaticDetail label="Hora termino" value={String(answers.DG_HORA_TERMINO ?? completedAtLabel)} />
        ) : null}
      </dl>
    </div>
  );
}

function AutomaticDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-teal-700">{label}</dt>
      <dd className="mt-1 font-bold text-teal-950">{value}</dd>
    </div>
  );
}

function QuestionStep({
  answers,
  answer,
  flatQuestion,
  onAnswer,
  participant,
  questionLookup,
  readOnly,
  sessionId
}: {
  answers: Record<string, unknown>;
  answer: unknown;
  flatQuestion: FlatQuestion;
  onAnswer: (questionCode: string, answer: unknown) => void;
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  };
  questionLookup: CtlQuestionLookup;
  readOnly: boolean;
  sessionId: string;
}) {
  const { question, sectionInstructions, sectionTitle } = flatQuestion;
  const displayLabel = resolveQuestionLabel(question, answers, participant, questionLookup);
  const questionInstructions = question.instructions?.filter(
    (instruction) => !isSectionInstructionDuplicate(instruction.text, flatQuestion.sectionInstructionTexts)
  );

  return (
    <article className="mt-6 space-y-5">
      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-teal-700">{sectionTitle}</p>
        {sectionInstructions?.map((instruction, index) => (
          <InstructionBox instruction={instruction} key={`${instruction.type}-${index}`} />
        ))}
        {questionInstructions?.map((instruction, index) => (
          <InstructionBox instruction={instruction} key={`${question.code}-${instruction.type}-${index}`} />
        ))}
        {question.references?.length ? (
          <ReferenceList
            answers={answers}
            participant={participant}
            questionLookup={questionLookup}
            references={question.references}
          />
        ) : null}
        <h3 className="mt-2 text-lg font-bold leading-7 text-zinc-950">
          {displayLabel}
          {question.required ? <span className="text-rose-700"> *</span> : null}
        </h3>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{question.code}</p>
      </div>
      {renderMobileQuestionInput(question, answer, onAnswer, participant, questionLookup, readOnly, sessionId)}
    </article>
  );
}

function renderMobileQuestionInput(
  question: CtlQuestionDefinition,
  answer: unknown,
  onAnswer: (questionCode: string, answer: unknown) => void,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  },
  questionLookup: CtlQuestionLookup,
  readOnly: boolean,
  sessionId: string
) {
  if (question.code === "F2") {
    return (
      <AgeRangeInput
        answer={answer}
        disabled={readOnly}
        onChange={(value) => onAnswer(question.code, value)}
      />
    );
  }

  if (question.type === "SELECT") {
    return (
      <OptionCards
        answer={answer}
        disabled={readOnly}
        onSelect={(value) => onAnswer(question.code, value)}
        options={question.options.map((option) => ({
          ...option,
          label: resolveTemplate(option.label, {}, participant, questionLookup)
        }))}
      />
    );
  }

  if (question.type === "SCALE") {
    return <ScaleButtons answer={answer} disabled={readOnly} onSelect={(value) => onAnswer(question.code, value)} question={question} />;
  }

  if (question.type === "MATRIX") {
    return (
      <MatrixBlocks
        answer={answer}
        disabled={readOnly}
        onChange={(value) => onAnswer(question.code, value)}
        question={question}
        sessionId={sessionId}
      />
    );
  }

  if (question.type === "LONG_TEXT") {
    return (
      <textarea
        className={textInputClass}
        disabled={readOnly}
        inputMode="text"
        onChange={(event) => onAnswer(question.code, event.target.value)}
        rows={6}
        value={String(answer ?? "")}
      />
    );
  }

  return (
    <input
      className={textInputClass}
      disabled={readOnly}
      inputMode={question.code === "F2" ? "numeric" : "text"}
      onChange={(event) => onAnswer(question.code, event.target.value)}
      pattern={question.code === "F2" ? "[0-9]*" : undefined}
      type={question.code === "F2" ? "number" : "text"}
      value={formatTextInputAnswer(question, answer)}
    />
  );
}

function AgeRangeInput({
  answer,
  disabled,
  onChange
}: {
  answer: unknown;
  disabled: boolean;
  onChange: (value: CtlAgeAnswerValue) => void;
}) {
  const exactAge = getCtlAgeExactInput(answer);
  const derivedRange = deriveCtlAgeRangeOption(exactAge);
  const selectedRangeCode = getCtlAgeRangeInput(answer) || derivedRange?.value || "";
  const hasMismatch = Boolean(derivedRange && selectedRangeCode && selectedRangeCode !== derivedRange.value);

  function updateExactAge(value: string) {
    const nextDerived = deriveCtlAgeRangeOption(value);
    onChange({
      exactAge: Number(value),
      rangeCode: (nextDerived?.value ?? selectedRangeCode ?? "") as CtlAgeAnswerValue["rangeCode"],
      rangeLabel: nextDerived?.label ?? ctlAgeRangeLabel(selectedRangeCode)
    });
  }

  function updateRange(rangeCode: string) {
    onChange({
      exactAge: Number(exactAge),
      rangeCode: rangeCode as CtlAgeAnswerValue["rangeCode"],
      rangeLabel: ctlAgeRangeLabel(rangeCode)
    });
  }

  return (
    <div className="space-y-5">
      <label className="block text-sm font-semibold text-zinc-700">
        Edad exacta
        <input
          className={textInputClass}
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) => updateExactAge(event.target.value)}
          pattern="[0-9]*"
          type="number"
          value={exactAge}
        />
      </label>

      <div>
        <p className="text-sm font-bold text-zinc-800">Rango operativo</p>
        <p className="mt-1 text-sm text-zinc-600">
          El rango se preselecciona con la edad exacta. Confirma que corresponde antes de continuar.
        </p>
        <div className="mt-3 grid gap-3">
          {CTL_AGE_RANGE_OPTIONS.map((option) => {
            const isSelected = selectedRangeCode === option.value;
            const isDerived = derivedRange?.value === option.value;
            return (
              <button
                aria-pressed={isSelected}
                className={optionButtonClass(isSelected)}
                disabled={disabled || !exactAge}
                key={option.value}
                onClick={() => updateRange(option.value)}
                type="button"
              >
                <span className="text-left">
                  {option.label}
                  {isDerived ? <span className="ml-2 text-xs font-bold uppercase opacity-80">Sugerido</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        {hasMismatch ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            El rango seleccionado no coincide con la edad capturada. Corrige el rango antes de continuar.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function OptionCards({
  answer,
  disabled,
  onSelect,
  options
}: {
  answer: unknown;
  disabled: boolean;
  onSelect: (value: string) => void;
  options: CtlQuestionOption[];
}) {
  const selected = getSelectAnswerValue(answer);

  return (
    <div className="grid gap-3">
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            aria-pressed={isSelected}
            className={optionButtonClass(isSelected)}
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span className="text-left">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScaleButtons({
  answer,
  disabled,
  onSelect,
  question
}: {
  answer: unknown;
  disabled: boolean;
  onSelect: (value: number) => void;
  question: CtlScaleQuestionDefinition;
}) {
  const selected = String(answer ?? "");
  const values = Array.from({ length: question.max - question.min + 1 }, (_, index) => question.min + index);

  return (
    <div className="grid gap-3">
      {values.map((value) => {
        const isSelected = selected === String(value);
        const label = formatScaleQuestionOptionLabel(question, value);
        return (
          <button
            aria-label={label}
            aria-pressed={isSelected}
            className={`flex min-h-16 items-center rounded-xl border px-4 py-3 text-left text-base font-semibold leading-6 transition ${
              isSelected
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
            }`}
            disabled={disabled}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MatrixBlocks({
  answer,
  disabled,
  onChange,
  question,
  sessionId
}: {
  answer: unknown;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
  question: CtlMatrixQuestionDefinition;
  sessionId: string;
}) {
  const matrixAnswer = isRecord(answer) ? toStringRecord(answer) : {};
  const rows = question.randomizeRows ? stableShuffle(question.rows, `${sessionId}:${question.code}`) : question.rows;
  const isBinaryMatrix = isBinaryYesNoColumns(question.columns);

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={row.code}>
          {!isBinaryMatrix && index > 0 && index % 5 === 0 ? (
            <ScaleReminder columns={question.columns} />
          ) : null}
          <p className="text-base font-semibold text-zinc-950">{row.label}</p>
          <div className="mt-3 grid gap-2">
            {question.columns.map((column) => {
              const value = String(column.value);
              const isSelected = matrixAnswer[row.code] === value;
              const label = isBinaryMatrix ? column.label : formatScaleOptionLabel(column.value, column.label);
              return (
                <button
                  aria-label={`${row.label}: ${label}`}
                  aria-pressed={isSelected}
                  className={`min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-bold transition ${
                    isSelected
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
                  }`}
                  disabled={disabled}
                  key={value}
                  onClick={() => onChange({ ...matrixAnswer, [row.code]: value })}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScaleReminder({ columns }: { columns: CtlMatrixQuestionDefinition["columns"] }) {
  return (
    <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-950">
      <p className="font-bold">ENCUESTADOR: POR FAVOR HAGA EL RECORDATORIO DE ESCALA AL PANELISTA</p>
      <p className="mt-1">
        {columns.map((column) => formatScaleOptionLabel(column.value, column.label)).join(" · ")}
      </p>
    </div>
  );
}

function formatScaleOptionLabel(value: number | string, label: string): string {
  return `${value} - ${label}`;
}

function formatScaleQuestionOptionLabel(question: CtlScaleQuestionDefinition, value: number): string {
  const label = question.labels?.[value] ?? `Valor ${value}`;
  return isBinaryYesNoScale(question) ? label : formatScaleOptionLabel(value, label);
}

function isBinaryYesNoScale(question: CtlScaleQuestionDefinition): boolean {
  if (question.min !== 1 || question.max !== 2 || !question.labels) {
    return false;
  }

  return isYesLabel(question.labels[1]) && isNoLabel(question.labels[2]);
}

function isBinaryYesNoColumns(columns: CtlMatrixQuestionDefinition["columns"]): boolean {
  if (columns.length !== 2) {
    return false;
  }

  const [first, second] = columns;
  return (
    String(first?.value) === "1" &&
    String(second?.value) === "2" &&
    isYesLabel(first?.label) &&
    isNoLabel(second?.label)
  );
}

function isYesLabel(label: string | undefined): boolean {
  const normalized = normalizeOptionLabel(label);
  return normalized === "si" || normalized.startsWith("s");
}

function isNoLabel(label: string | undefined): boolean {
  return normalizeOptionLabel(label) === "no";
}

function normalizeOptionLabel(label: string | undefined): string {
  return String(label ?? "")
    .trim()
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function InstructionBox({
  instruction
}: {
  instruction: { text: string; title?: string; type: string };
}) {
  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
      <p className="text-xs font-bold uppercase tracking-wide">{instruction.title ?? "INSTRUCCION"}</p>
      <p className="mt-1">{instruction.text}</p>
    </div>
  );
}

function ReferenceList({
  answers,
  participant,
  questionLookup,
  references
}: {
  answers: Record<string, unknown>;
  participant: { firstSampleKey?: string | null; folio: string; name: string; secondSampleKey?: string | null };
  questionLookup: CtlQuestionLookup;
  references: Array<{ label: string; source: string }>;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
      {references.map((reference) => (
        <p key={`${reference.source}-${reference.label}`}>
          <span className="font-bold">{reference.label}:</span>{" "}
          {formatContextValue(
            reference.source,
            resolveReferenceValue(reference.source, answers, participant),
            answers,
            participant,
            questionLookup
          )}
        </p>
      ))}
    </div>
  );
}

function ValidationModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      aria-labelledby="ctl-validation-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-950" id="ctl-validation-modal-title">Falta responder esta pregunta</h3>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
        <button className={`${primaryButtonClass} mt-5 w-full`} onClick={onClose} type="button">
          Entendido
        </button>
      </div>
    </div>
  );
}

function ReviewPanel({
  nseCalculation,
  pendingCount,
  pendingQuestionCodes
}: {
  nseCalculation: ReturnType<typeof calculateCtlNse>;
  pendingCount: number;
  pendingQuestionCodes: string[];
}) {
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-lg font-bold text-zinc-950">Revisar respuestas</h3>
      {pendingCount > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Aun hay {pendingCount} pregunta(s) obligatoria(s) pendiente(s).</p>
          <p className="mt-1">Pendientes: {pendingQuestionCodes.join(", ")}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Todas las preguntas obligatorias estan completas. Puedes finalizar CTL.
        </p>
      )}
      <CtlNseResultPanel calculation={nseCalculation} />
    </div>
  );
}

function CtlNseResultPanel({ calculation }: { calculation: ReturnType<typeof calculateCtlNse> }) {
  return (
    <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
      <h3 className="text-base font-bold">NSE calculado</h3>
      {calculation.ok ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <AutomaticDetail label="Total de puntos NSE" value={String(calculation.totalPoints)} />
          <AutomaticDetail label="Nivel NSE (letra)" value={calculation.levelLabel} />
          <AutomaticDetail label="Clasificacion NSE (numero)" value={String(calculation.classificationNumber)} />
        </dl>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">Faltan datos demograficos para calcular NSE.</p>
          <p className="mt-1">Pendientes: {calculation.missingQuestionCodes.join(", ")}</p>
        </div>
      )}
    </div>
  );
}

function StatusMessages({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      {message ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function flattenCtlQuestions(definition: CtlDefinition, answers: Record<string, unknown> = {}): FlatQuestion[] {
  const applicableCodes = new Set(getCtlApplicableQuestions(definition, answers).map((question) => question.code));

  return definition.sections.flatMap((section) => {
    const sectionInstructions = ctlSectionInstructions(section.description, section.instructions);
    const sectionInstructionTexts = (sectionInstructions ?? []).map((instruction) => normalizeInstructionText(instruction.text));

    return section.questions
      .filter((question) => applicableCodes.has(question.code) && question.captureMode !== "AUTO")
      .map((question, index) => ({
        index,
        question,
        sectionId: section.id,
        sectionInstructions: index === 0 ? sectionInstructions : undefined,
        sectionInstructionTexts,
        sectionTitle: section.title
      }));
  });
}

function buildCtlQuestionLookup(definition: CtlDefinition): CtlQuestionLookup {
  return new Map(definition.sections.flatMap((section) => section.questions.map((question) => [question.code, question])));
}

function ctlSectionInstructions(
  description: string | undefined,
  instructions: FlatQuestion["sectionInstructions"] | undefined
): FlatQuestion["sectionInstructions"] | undefined {
  const allInstructions = [
    ...(description ? [{ text: description, title: "INSTRUCCION OPERATIVA", type: "SECTION" }] : []),
    ...(instructions ?? [])
  ];

  return allInstructions.length > 0 ? allInstructions : undefined;
}

function normalizeInstructionText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

function isSectionInstructionDuplicate(instructionText: string, sectionInstructionTexts: string[]): boolean {
  const normalized = normalizeInstructionText(instructionText);
  return sectionInstructionTexts.some((sectionText) =>
    sectionText === normalized || sectionText.includes(normalized) || normalized.includes(sectionText)
  );
}

export function getInitialCtlQuestionIndex(definition: CtlDefinition, answers: Record<string, unknown>): number {
  const questions = flattenCtlQuestions(definition, answers);
  const firstPendingIndex = questions.findIndex(({ question }) => !isCtlQuestionAnswered(question, answers[question.code]));

  return firstPendingIndex >= 0 ? firstPendingIndex : Math.max(0, questions.length - 1);
}

export function getPendingCtlQuestionCodes(definition: CtlDefinition, answers: Record<string, unknown>): string[] {
  return flattenCtlQuestions(definition, answers)
    .filter(({ question }) => question.required && !isCtlQuestionAnswered(question, answers[question.code]))
    .map(({ question }) => question.code);
}

export function isCtlQuestionAnswered(question: CtlQuestionDefinition, answer: unknown): boolean {
  if (!question.required) {
    return true;
  }

  if (question.code === "F2") {
    return formatCtlAgeInputValue(answer).length > 0;
  }

  if (question.type === "MATRIX") {
    const matrixAnswer = isRecord(answer) ? answer : {};
    return question.rows.every((row) => String(matrixAnswer[row.code] ?? "").trim().length > 0);
  }

  if (question.type === "SELECT" && isRecord(answer) && "selectedPosition" in answer) {
    return String(answer.selectedPosition ?? "").trim().length > 0;
  }

  return String(answer ?? "").trim().length > 0;
}

function validateCtlQuestionForClient(
  question: CtlQuestionDefinition,
  answer: unknown
): { ok: true } | { message: string; ok: false } {
  if (isCtlQuestionAnswered(question, answer)) {
    if (question.code === "F2") {
      const ageValidation = validateCtlAgeInput(answer);
      if (!ageValidation.ok) {
        return ageValidation;
      }
    }

    return { ok: true };
  }

  return {
    message: question.type === "MATRIX"
      ? "Responde cada atributo antes de continuar."
      : "Responde la pregunta obligatoria antes de continuar.",
    ok: false
  };
}

function buildQuestionFormData(question: CtlQuestionDefinition, answer: unknown): FormData {
  const formData = new FormData();

  appendQuestionAnswer(formData, question, answer);

  return formData;
}

function buildAllAnswersFormData(definition: CtlDefinition, answers: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const { question } of flattenCtlQuestions(definition, answers)) {
    appendQuestionAnswer(formData, question, answers[question.code]);
  }

  appendCalculatedCtlNseAnswers(formData, definition, answers);

  return formData;
}

function appendCalculatedCtlNseAnswers(formData: FormData, definition: CtlDefinition, answers: Record<string, unknown>): void {
  const calculation = calculateCtlNse(definition, answers);
  if (!calculation.ok) {
    return;
  }

  formData.set("D_TOTAL_PUNTOS_NSE", String(calculation.totalPoints));
  formData.set("D_NSE_CLASIFICACION", calculation.classificationCode);
}

function appendQuestionAnswer(formData: FormData, question: CtlQuestionDefinition, answer: unknown): void {
  if (question.code === "F2") {
    if (isRecord(answer)) {
      formData.set(`${question.code}.exactAge`, formatCtlAgeInputValue(answer));
      formData.set(`${question.code}.rangeCode`, getCtlAgeRangeInput(answer));
      return;
    }

    formData.set(question.code, formatCtlAgeInputValue(answer));
    return;
  }

  if (question.type === "SELECT" && isRecord(answer) && "selectedPosition" in answer) {
    formData.set(question.code, String(answer.selectedPosition ?? ""));
    return;
  }

  if (question.type === "MATRIX") {
    const matrixAnswer = isRecord(answer) ? answer : {};
    for (const row of question.rows) {
      const value = matrixAnswer[row.code];
      if (value !== undefined && value !== null) {
        formData.set(`${question.code}.${row.code}`, String(value));
      }
    }
    return;
  }

  if (answer !== undefined && answer !== null) {
    formData.set(question.code, String(answer));
  }
}

function formatTextInputAnswer(question: CtlQuestionDefinition, answer: unknown): string {
  if (question.code === "F2") {
    return formatCtlAgeInputValue(answer);
  }

  return String(answer ?? "");
}

function formatCtlAgeInputValue(answer: unknown): string {
  if (isCtlAgeAnswerValue(answer)) {
    return Number.isFinite(answer.exactAge) && answer.exactAge > 0 ? String(answer.exactAge) : "";
  }

  return String(answer ?? "").trim();
}

function validateCtlAgeInput(answer: unknown): { ok: true } | { message: string; ok: false } {
  const value = formatCtlAgeInputValue(answer);
  if (isLegacyCtlAgeRangeCode(value) && !isRecord(answer)) {
    return { ok: true };
  }

  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 120) {
    return { message: "Captura la edad exacta con numeros.", ok: false };
  }

  const derived = deriveCtlAgeRangeOption(value);
  const selectedRangeCode = getCtlAgeRangeInput(answer) || derived?.value || "";

  if (!derived || selectedRangeCode !== derived.value) {
    return { message: "El rango operativo no coincide con la edad capturada.", ok: false };
  }

  return { ok: true };
}

function getCtlAgeExactInput(answer: unknown): string {
  if (isCtlAgeAnswerValue(answer)) {
    return Number.isFinite(answer.exactAge) && answer.exactAge > 0 ? String(answer.exactAge) : "";
  }

  const value = String(answer ?? "").trim();
  return isLegacyCtlAgeRangeCode(value) ? "" : value;
}

function getCtlAgeRangeInput(answer: unknown): string {
  if (isCtlAgeAnswerValue(answer)) {
    return String(answer.rangeCode ?? "");
  }

  const value = String(answer ?? "").trim();
  return isLegacyCtlAgeRangeCode(value) ? value : "";
}

function deriveCtlAgeRangeOption(exactAgeInput: unknown): (typeof CTL_AGE_RANGE_OPTIONS)[number] | null {
  const value = String(exactAgeInput ?? "").trim();
  if (!/^\d{1,3}$/.test(value)) {
    return null;
  }

  const exactAge = Number(value);
  if (!Number.isInteger(exactAge) || exactAge < 1 || exactAge > 120) {
    return null;
  }

  if (exactAge <= 29) {
    return CTL_AGE_RANGE_OPTIONS[0];
  }
  if (exactAge <= 45) {
    return CTL_AGE_RANGE_OPTIONS[1];
  }
  if (exactAge <= 55) {
    return CTL_AGE_RANGE_OPTIONS[2];
  }

  return CTL_AGE_RANGE_OPTIONS[3];
}

function ctlAgeRangeLabel(rangeCode: string): string {
  return CTL_AGE_RANGE_OPTIONS.find((option) => option.value === rangeCode)?.label ?? "";
}

function isLegacyCtlAgeRangeCode(value: string): value is CtlAgeAnswerValue["rangeCode"] {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

function buildAutomaticCtlAnswers({
  completedAtLabel,
  participant,
  startedAtLabel,
  todayLabel
}: {
  completedAtLabel?: string | null;
  participant: { name: string };
  startedAtLabel?: string | null;
  todayLabel?: string;
}): Record<string, string> {
  return {
    DG_FECHA: todayLabel ?? new Date().toLocaleDateString("es-MX"),
    DG_HORA_INICIO: startedAtLabel ?? "",
    DG_HORA_TERMINO: completedAtLabel ?? "",
    DG_NOMBRE: participant.name
  };
}

function resolveQuestionLabel(
  question: CtlQuestionDefinition,
  answers: Record<string, unknown>,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  },
  questionLookup: CtlQuestionLookup
): string {
  return resolveTemplate(question.displayTemplate ?? question.label, answers, participant, questionLookup);
}

function resolveTemplate(
  template: string,
  answers: Record<string, unknown>,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  },
  questionLookup: CtlQuestionLookup
): string {
  const values: Record<string, unknown> = {
    FIRST_SAMPLE: participant.firstSampleKey,
    FOLIO: participant.folio,
    PARTICIPANT_NAME: participant.name,
    SECOND_SAMPLE: participant.secondSampleKey,
    TRIANGULAR_1_PR1: participant.triangularRotation?.triangular1.pr1,
    TRIANGULAR_1_PR2: participant.triangularRotation?.triangular1.pr2,
    TRIANGULAR_1_PR3: participant.triangularRotation?.triangular1.pr3,
    TRIANGULAR_2_PR1: participant.triangularRotation?.triangular2.pr1,
    TRIANGULAR_2_PR2: participant.triangularRotation?.triangular2.pr2,
    TRIANGULAR_2_PR3: participant.triangularRotation?.triangular2.pr3
  };

  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, token: string) => {
    const value = token in values ? values[token] : answers[token];
    return formatContextValue(token, value, answers, participant, questionLookup);
  });
}

function resolveReferenceValue(
  source: string,
  answers: Record<string, unknown>,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  }
): unknown {
  if (source === "FIRST_SAMPLE") {
    return participant.firstSampleKey;
  }

  if (source === "SECOND_SAMPLE") {
    return participant.secondSampleKey;
  }

  if (source === "PARTICIPANT_NAME") {
    return participant.name;
  }

  if (source === "FOLIO") {
    return participant.folio;
  }

  if (source === "TRIANGULAR_1_PR1") return participant.triangularRotation?.triangular1.pr1;
  if (source === "TRIANGULAR_1_PR2") return participant.triangularRotation?.triangular1.pr2;
  if (source === "TRIANGULAR_1_PR3") return participant.triangularRotation?.triangular1.pr3;
  if (source === "TRIANGULAR_2_PR1") return participant.triangularRotation?.triangular2.pr1;
  if (source === "TRIANGULAR_2_PR2") return participant.triangularRotation?.triangular2.pr2;
  if (source === "TRIANGULAR_2_PR3") return participant.triangularRotation?.triangular2.pr3;

  return answers[source];
}

function formatContextValue(
  source: string,
  value: unknown,
  answers: Record<string, unknown>,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  },
  questionLookup: CtlQuestionLookup
): string {
  const sourceQuestion = questionLookup.get(source);
  if (!sourceQuestion) {
    return formatReferenceValue(value);
  }

  return formatQuestionAnswerValue(sourceQuestion, value, answers, participant, questionLookup);
}

function formatQuestionAnswerValue(
  question: CtlQuestionDefinition,
  value: unknown,
  answers: Record<string, unknown>,
  participant: {
    firstSampleKey?: string | null;
    folio: string;
    name: string;
    secondSampleKey?: string | null;
    triangularRotation?: CtlTriangularRotationDisplay | null;
  },
  questionLookup: CtlQuestionLookup
): string {
  if (value === null || value === undefined || value === "") {
    return "pendiente";
  }

  if (question.type === "SELECT") {
    const selectedValue = getSelectAnswerValue(value);
    const option = question.options.find((candidate) => String(candidate.value) === selectedValue);
    return option ? resolveTemplate(option.label, answers, participant, questionLookup) : selectedValue;
  }

  if (question.type === "SCALE") {
    const selectedValue = Number(String(value));
    const label = Number.isFinite(selectedValue) ? question.labels?.[selectedValue] : undefined;
    return label ?? String(value);
  }

  if (question.type === "MATRIX" && isRecord(value)) {
    return Object.entries(value)
      .map(([rowCode, item]) => {
        const rowLabel = question.rows.find((row) => row.code === rowCode)?.label ?? rowCode;
        const columnLabel = question.columns.find((column) => String(column.value) === String(item))?.label ?? String(item ?? "");
        return `${rowLabel}: ${columnLabel}`;
      })
      .join(", ");
  }

  if (question.code === "F2" && isCtlAgeAnswerValue(value)) {
    return `${value.exactAge} años (${value.rangeLabel})`;
  }

  return formatReferenceValue(value);
}

function formatReferenceValue(value: unknown): string {
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${String(item ?? "")}`)
      .join(", ");
  }

  return String(value ?? "pendiente");
}

function stableShuffle<T>(items: T[], seed: string): T[] {
  return [...items]
    .map((item, index) => ({
      item,
      sortKey: stableHash(`${seed}:${index}`)
    }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map(({ item }) => item);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function optionButtonClass(isSelected: boolean): string {
  return `flex min-h-16 items-center justify-between rounded-xl border px-4 py-3 text-base font-semibold transition ${
    isSelected
      ? "border-teal-700 bg-teal-700 text-white"
      : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
  }`;
}

function getSelectAnswerValue(answer: unknown): string {
  if (isRecord(answer) && "selectedPosition" in answer) {
    return String(answer.selectedPosition ?? "");
  }

  return String(answer ?? "");
}

function isTriangularQuestionCode(questionCode: string): boolean {
  return questionCode === "P1" || questionCode === "P3";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCtlAgeAnswerValue(value: unknown): value is CtlAgeAnswerValue {
  return isRecord(value) && typeof value.exactAge === "number";
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
}

const primaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-base font-bold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
const textInputClass =
  "min-h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
