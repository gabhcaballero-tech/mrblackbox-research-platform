"use client";

import { useMemo, useState, useTransition } from "react";
import {
  getCtlApplicableQuestions,
  type CtlDefinition,
  type CtlMatrixQuestionDefinition,
  type CtlQuestionDefinition,
  type CtlQuestionOption,
  type CtlScaleQuestionDefinition
} from "@/modules/ctl/definition";
import {
  finishPublicCtlSessionAction,
  savePublicCtlQuestionAnswerAction,
  validatePublicCtlPhaseCodeAction
} from "@/modules/ctl/public-actions";
import type { CtlOperationalPhase, CtlPhaseProgressStatus } from "@/modules/ctl/service";

type FlatQuestion = {
  index: number;
  question: CtlQuestionDefinition;
  sectionInstructions?: Array<{ text: string; title?: string; type: string }>;
  sectionTitle: string;
};

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
  phaseProgress?: CtlPhaseProgressDisplay[];
  readOnly: boolean;
  sessionId: string;
  startedAtLabel?: string | null;
  studyCode: string;
  todayLabel?: string;
};

type CtlPhaseProgressDisplay = {
  arm: string | null;
  phase: CtlOperationalPhase;
  productCode: string | null;
  referenceCodeSlot: 1 | 2 | 3;
  status: CtlPhaseProgressStatus;
  validatedAt: Date | string | null;
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
  phaseProgress = [],
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
  const [localPhaseProgress, setLocalPhaseProgress] = useState<CtlPhaseProgressDisplay[]>(phaseProgress);
  const [phaseCode, setPhaseCode] = useState("");
  const questions = useMemo(() => flattenCtlQuestions(definition, localAnswers), [definition, localAnswers]);
  const [currentIndex, setCurrentIndex] = useState(() => getInitialCtlQuestionIndex(definition, initialAnswers));
  const [isReviewing, setIsReviewing] = useState(readOnly);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationModal, setValidationModal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = questions[currentIndex];
  const needsTriangularRotation = questions.some(({ question }) => isTriangularQuestionCode(question.code));
  const isMissingTriangularRotation = needsTriangularRotation && !participant.triangularRotation && !readOnly;
  const completedCount = questions.filter(({ question }) => isCtlQuestionAnswered(question, localAnswers[question.code])).length;
  const progressPercent = questions.length > 0 ? Math.round((completedCount / questions.length) * 100) : 0;
  const pendingQuestionCodes = getPendingCtlQuestionCodes(definition, localAnswers);
  const requiredPhase = !isReviewing && current ? requiredCtlPhaseForQuestion(current.sectionTitle, current.question.code) : null;
  const phaseGate = requiredPhase ? localPhaseProgress.find((phase) => phase.phase === requiredPhase) ?? null : null;
  const isPhaseBlocked = Boolean(phaseGate && phaseGate.status !== "COMPLETED" && !readOnly);
  const canGoBack = !isPending && (isReviewing || currentIndex > 0);

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

    const incompletePhase = firstIncompletePhase(localPhaseProgress);
    if (incompletePhase) {
      setMessage(null);
      setError(`Valida la fase ${ctlPhaseLabel(incompletePhase.phase)} antes de finalizar CTL.`);
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

  function validatePhase() {
    if (!phaseGate || readOnly || isPending) {
      return;
    }

    if (!phaseCode.trim()) {
      setError("Captura el codigo de fase para continuar.");
      return;
    }

    setError(null);
    setMessage("Validando codigo de fase...");
    const formData = new FormData();
    formData.set("phaseCode", phaseCode);

    startTransition(async () => {
      const result = await validatePublicCtlPhaseCodeAction(
        studyCode,
        sessionId,
        phaseGate.phase,
        formData
      ) as ActionResult;

      if (!result.ok) {
        setMessage(null);
        setError(result.message);
        return;
      }

      setLocalPhaseProgress((currentPhases) =>
        currentPhases.map((phase) =>
          phase.phase === phaseGate.phase
            ? { ...phase, status: "COMPLETED", validatedAt: new Date().toISOString() }
            : phase
        )
      );
      setPhaseCode("");
      setMessage("Fase validada correctamente.");
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
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

      <StatusMessages error={error} message={message} />
      {validationModal ? (
        <ValidationModal message={validationModal} onClose={() => setValidationModal(null)} />
      ) : null}

      {isReviewing ? (
        <ReviewPanel
          pendingCount={pendingQuestionCodes.length}
          pendingQuestionCodes={pendingQuestionCodes}
        />
      ) : isPhaseBlocked && phaseGate ? (
        <PhaseGatePanel
          disabled={isPending}
          onChange={setPhaseCode}
          onSubmit={validatePhase}
          phase={phaseGate}
          value={phaseCode}
        />
      ) : current ? (
        <QuestionStep
          answer={localAnswers[current.question.code]}
          flatQuestion={current}
          onAnswer={setAnswer}
          participant={participant}
          readOnly={readOnly}
          sessionId={sessionId}
          answers={localAnswers}
        />
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
        ) : isPhaseBlocked ? (
          <button
            className={primaryButtonClass}
            disabled={readOnly || isPending}
            onClick={validatePhase}
            type="button"
          >
            {isPending ? "Validando..." : "Validar fase"}
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

function PhaseGatePanel({
  disabled,
  onChange,
  onSubmit,
  phase,
  value
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  phase: CtlPhaseProgressDisplay;
  value: string;
}) {
  return (
    <article className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Fase operativa</p>
      <h3 className="mt-2 text-xl font-bold text-amber-950">{ctlPhaseLabel(phase.phase)}</h3>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        Captura el codigo {phase.referenceCodeSlot} para continuar con esta fase de la entrevista.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <PhaseDetail label="Producto" value={phase.productCode ?? "No asignado"} />
        <PhaseDetail label="Brazo" value={phase.arm ?? "No aplica"} />
      </dl>
      <label className="mt-5 block text-sm font-semibold text-amber-950">
        Codigo de fase
        <input
          autoComplete="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-lg font-bold tracking-widest text-zinc-950"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Codigo ${phase.referenceCodeSlot}`}
          value={value}
        />
      </label>
      <button
        className={`${primaryButtonClass} mt-4`}
        disabled={disabled}
        onClick={onSubmit}
        type="button"
      >
        {disabled ? "Validando..." : "Validar codigo"}
      </button>
    </article>
  );
}

function PhaseDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <dt className="text-xs font-medium text-amber-700">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function QuestionStep({
  answers,
  answer,
  flatQuestion,
  onAnswer,
  participant,
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
  readOnly: boolean;
  sessionId: string;
}) {
  const { question, sectionInstructions, sectionTitle } = flatQuestion;
  const displayLabel = resolveQuestionLabel(question, answers, participant);

  return (
    <article className="mt-6 space-y-5">
      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-teal-700">{sectionTitle}</p>
        {sectionInstructions?.map((instruction, index) => (
          <InstructionBox instruction={instruction} key={`${instruction.type}-${index}`} />
        ))}
        {question.instructions?.map((instruction, index) => (
          <InstructionBox instruction={instruction} key={`${question.code}-${instruction.type}-${index}`} />
        ))}
        {question.references?.length ? (
          <ReferenceList answers={answers} participant={participant} references={question.references} />
        ) : null}
        <h3 className="mt-2 text-lg font-bold leading-7 text-zinc-950">
          {displayLabel}
          {question.required ? <span className="text-rose-700"> *</span> : null}
        </h3>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{question.code}</p>
      </div>
      {renderMobileQuestionInput(question, answer, onAnswer, participant, readOnly, sessionId)}
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
  readOnly: boolean,
  sessionId: string
) {
  if (question.type === "SELECT") {
    return (
      <OptionCards
        answer={answer}
        disabled={readOnly}
        onSelect={(value) => onAnswer(question.code, value)}
        options={question.options.map((option) => ({
          ...option,
          label: resolveTemplate(option.label, {}, participant)
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
      inputMode="text"
      onChange={(event) => onAnswer(question.code, event.target.value)}
      type="text"
      value={String(answer ?? "")}
    />
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
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {values.map((value) => {
          const isSelected = selected === String(value);
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-16 rounded-xl border px-4 py-3 text-xl font-bold transition ${
                isSelected
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
              }`}
              disabled={disabled}
              key={value}
              onClick={() => onSelect(value)}
              type="button"
            >
              {value}
            </button>
          );
        })}
      </div>
      {question.labels ? (
        <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {values.map((value) =>
            question.labels?.[value] ? (
              <p key={value}>
                <span className="font-semibold text-zinc-900">{value}</span> {question.labels[value]}
              </p>
            ) : null
          )}
        </div>
      ) : null}
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

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4" key={row.code}>
          <p className="text-base font-semibold text-zinc-950">{row.label}</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {question.columns.map((column) => {
              const value = String(column.value);
              const isSelected = matrixAnswer[row.code] === value;
              return (
                <button
                  aria-label={`${row.label}: ${column.label}`}
                  aria-pressed={isSelected}
                  className={`min-h-12 rounded-lg border px-2 py-2 text-sm font-bold transition ${
                    isSelected
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-600"
                  }`}
                  disabled={disabled}
                  key={value}
                  onClick={() => onChange({ ...matrixAnswer, [row.code]: value })}
                  type="button"
                >
                  {column.value}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-500">
            {question.columns.map((column) => (
              <span key={String(column.value)}>
                <span className="font-semibold">{column.value}</span> {column.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
  references
}: {
  answers: Record<string, unknown>;
  participant: { firstSampleKey?: string | null; folio: string; name: string; secondSampleKey?: string | null };
  references: Array<{ label: string; source: string }>;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
      {references.map((reference) => (
        <p key={`${reference.source}-${reference.label}`}>
          <span className="font-bold">{reference.label}:</span>{" "}
          {formatReferenceValue(resolveReferenceValue(reference.source, answers, participant))}
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
  pendingCount,
  pendingQuestionCodes
}: {
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

  return definition.sections.flatMap((section) =>
    section.questions
      .filter((question) => applicableCodes.has(question.code))
      .map((question, index) => ({
        index,
        question,
        sectionInstructions: section.instructions,
        sectionTitle: section.title
      }))
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

  return formData;
}

function appendQuestionAnswer(formData: FormData, question: CtlQuestionDefinition, answer: unknown): void {
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

function requiredCtlPhaseForQuestion(sectionTitle: string, questionCode: string): CtlOperationalPhase | null {
  if (questionCode.startsWith("P5A") || questionCode.startsWith("P6A") || questionCode.startsWith("P7A") || questionCode.startsWith("P8A") || questionCode.startsWith("P9A") || questionCode.startsWith("P10A") || questionCode.startsWith("P11A") || questionCode.startsWith("P12A") || questionCode.startsWith("P13A")) {
    return "COLOCACION";
  }
  if (questionCode.startsWith("P5B") || questionCode.startsWith("P6B") || questionCode.startsWith("P7B") || questionCode.startsWith("P8B") || questionCode.startsWith("P9B") || questionCode.startsWith("P10B") || questionCode.startsWith("P11B") || questionCode.startsWith("P12B") || questionCode.startsWith("P13B")) {
    return "EVALUACION_1";
  }
  if (sectionTitle.includes("COMPARATIVA") || sectionTitle.includes("DEMOGRAF")) {
    return "EVALUACION_2";
  }

  return null;
}

function firstIncompletePhase(phases: CtlPhaseProgressDisplay[]): CtlPhaseProgressDisplay | null {
  if (phases.length === 0) {
    return null;
  }

  return phases
    .slice()
    .sort((left, right) => left.referenceCodeSlot - right.referenceCodeSlot)
    .find((phase) => phase.status !== "COMPLETED") ?? null;
}

function ctlPhaseLabel(phase: CtlOperationalPhase): string {
  const labels: Record<CtlOperationalPhase, string> = {
    COLOCACION: "Colocacion - Entrega 1",
    EVALUACION_1: "Evaluacion 1 - Entrega 2",
    EVALUACION_2: "Evaluacion 2"
  };
  return labels[phase];
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
  }
): string {
  return resolveTemplate(question.displayTemplate ?? question.label, answers, participant);
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
  }
): string {
  const values: Record<string, unknown> = {
    ...answers,
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
    const value = values[token];
    if (isRecord(value)) {
      return Object.entries(value)
        .map(([key, item]) => `${key}: ${String(item ?? "")}`)
        .join(", ");
    }
    return String(value ?? "pendiente");
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

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
}

const primaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600";
const secondaryButtonClass =
  "inline-flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-base font-bold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400";
const textInputClass =
  "min-h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-zinc-100";
