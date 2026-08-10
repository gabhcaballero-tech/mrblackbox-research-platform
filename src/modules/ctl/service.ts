import { createHash, randomBytes } from "node:crypto";
import {
  CTL_AGE_RANGE_OPTIONS,
  getCtlApplicableQuestions,
  getCtlDefinition,
  getCtlQuestions,
  type CtlDefinition,
  type CtlMatrixQuestionDefinition,
  type CtlQuestionDefinition
} from "./definition";
import { formatDateMexicoCity, formatTimeMexicoCity } from "@/shared/utils/date-format";

export type CtlInternalActor = {
  id: string;
  kind?: "INTERNAL";
  role: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
  status: "ACTIVE" | "INACTIVE";
};

export type CtlPublicInterviewerActor = {
  id: string;
  kind: "PUBLIC_CTL_INTERVIEWER";
  label: string;
  role: "CTL_INTERVIEWER";
  status: "ACTIVE";
  studyId: string;
};

export type CtlActor = CtlInternalActor | CtlPublicInterviewerActor;

export type CtlSessionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type CtlInterviewerCodeStatus = "ACTIVE" | "DISABLED" | "EXPIRED";

export type CtlOperationalPhase = "COLOCACION" | "EVALUACION_1" | "EVALUACION_2";

export type CtlPhaseProgressStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "VALIDATED";

export type CtlAnswerInput = Record<
  string,
  FormDataEntryValue | Record<string, FormDataEntryValue | null | undefined> | null | undefined
>;

export type CtlAnswerDraft = {
  answerValue: unknown;
  questionCode: string;
};

export type CtlAgeAnswerValue = {
  exactAge: number;
  rangeCode: "1" | "2" | "3" | "4";
  rangeLabel: string;
};

export const CTL_OPERATIONAL_TIME_ZONE = "America/Mexico_City";

export type CtlTriangularRotationForAnswer = {
  triangular1: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
  triangular2: {
    pr1: string;
    pr2: string;
    pr3: string;
    verify: string;
  };
};

export function normalizeCtlCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export const INITIAL_PERMANENT_CTL_INTERVIEWERS = [
  "Jesus",
  "Mauricio",
  "Laura",
  "Esly",
  "Isabel",
  "Ulises",
  "Liz",
  "Susana",
  "Alondra",
  "Francisca",
  "Lupita",
  "Fatima"
] as const;

export function buildPermanentCtlInterviewerCode(label: string): string | null {
  const prefix = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "N")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);

  return prefix.length === 3 ? `${prefix}26` : null;
}

export function generateCtlInterviewerCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ2346789";
  const bytes = randomBytes(8);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function hashCtlInterviewerCode(value: unknown): string {
  return createHash("sha256")
    .update(`ctl-interviewer:${normalizeCtlCode(value)}`)
    .digest("hex");
}

export function normalizeCtlText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Control}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

export function formatCtlDate(value: Date, timeZoneIana = CTL_OPERATIONAL_TIME_ZONE): string {
  void timeZoneIana;
  return formatDateMexicoCity(value);
}

export function formatCtlTime(value: Date, timeZoneIana = CTL_OPERATIONAL_TIME_ZONE): string {
  void timeZoneIana;
  return formatTimeMexicoCity(value);
}

export function parseCtlAnswers(
  input: CtlAnswerInput,
  definition: CtlDefinition = getCtlDefinition()
):
  | {
      answers: CtlAnswerDraft[];
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const answers: CtlAnswerDraft[] = [];
  const missingQuestionCodes: string[] = [];

  for (const question of getCtlApplicableQuestions(definition, input)) {
    const parsed = parseCtlAnswerForQuestion(input, question);

    if (!parsed.ok) {
      return {
        message: parsed.message,
        missingQuestionCodes: parsed.missingQuestionCodes,
        ok: false
      };
    }

    if (question.required && parsed.empty) {
      missingQuestionCodes.push(question.code);
      continue;
    }

    if (parsed.empty) {
      continue;
    }

    answers.push({
      answerValue: parsed.answerValue,
      questionCode: question.code
    });
  }

  if (missingQuestionCodes.length > 0) {
    return {
      message: "Responde las preguntas obligatorias antes de continuar.",
      missingQuestionCodes,
      ok: false
    };
  }

  return {
    answers,
    ok: true
  };
}

export function parseCtlQuestionAnswer(
  questionCode: string,
  input: CtlAnswerInput,
  definition: CtlDefinition = getCtlDefinition()
):
  | {
      answer: CtlAnswerDraft | null;
      empty: boolean;
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const question = getCtlQuestions(definition).find((candidate) => candidate.code === questionCode);

  if (!question) {
    return {
      message: "No encontramos la pregunta CTL.",
      missingQuestionCodes: [questionCode],
      ok: false
    };
  }

  const parsed = parseCtlAnswerForQuestion(input, question);

  if (!parsed.ok) {
    return parsed;
  }

  if (question.required && parsed.empty) {
    return {
      message: "Responde la pregunta obligatoria antes de continuar.",
      missingQuestionCodes: [question.code],
      ok: false
    };
  }

  return {
    answer: parsed.empty
      ? null
      : {
          answerValue: parsed.answerValue,
          questionCode: question.code
        },
    empty: parsed.empty,
    ok: true
  };
}

export function isCtlTerminatingAnswer(
  questionCode: string,
  answerValue: unknown,
  definition: CtlDefinition = getCtlDefinition()
): boolean {
  if (questionCode === "F2") {
    const rangeCode = resolveCtlAgeRangeCode(answerValue);
    return rangeCode === "1" || rangeCode === "4";
  }

  const question = getCtlQuestions(definition).find((candidate) => candidate.code === questionCode);

  if (!question || question.type !== "SELECT") {
    return false;
  }

  const normalized = normalizeCtlCode(answerValue);
  return question.options.some((option) => option.terminates && normalizeCtlCode(option.value) === normalized);
}

export function ctlFormDataToAnswerInput(formData: FormData): CtlAnswerInput {
  const input: CtlAnswerInput = {};

  for (const [key, value] of formData.entries()) {
    if (key === "complete") {
      continue;
    }

    const separatorIndex = key.indexOf(".");

    if (separatorIndex === -1) {
      input[key] = value;
      continue;
    }

    const questionCode = key.slice(0, separatorIndex);
    const rowCode = key.slice(separatorIndex + 1);

    if (!questionCode || !rowCode) {
      continue;
    }

    const current = input[questionCode];
    const nested = isMatrixValueRecord(current)
      ? current as Record<string, FormDataEntryValue | null | undefined>
      : {};

    nested[rowCode] = value;
    input[questionCode] = nested;
  }

  return input;
}

export function buildCtlTriangularAnswerValue({
  answerValue,
  questionCode,
  triangularRotation
}: {
  answerValue: unknown;
  questionCode: string;
  triangularRotation: CtlTriangularRotationForAnswer;
}):
  | {
      answerValue: {
        correct: 0 | 1;
        deliveryOrder: string[];
        positions: {
          PR1: string;
          PR2: string;
          PR3: string;
        };
        selectedKey: string;
        selectedPosition: "PR1" | "PR2" | "PR3";
      };
      ok: true;
    }
  | {
      message: string;
      ok: false;
    } {
  const selectedPosition = normalizeCtlCode(
    isGenericRecord(answerValue) && "selectedPosition" in answerValue
      ? answerValue.selectedPosition
      : answerValue
  );
  const triangular = questionCode === "P1" ? triangularRotation.triangular1 : triangularRotation.triangular2;
  const positions = {
    PR1: triangular.pr1,
    PR2: triangular.pr2,
    PR3: triangular.pr3
  } as const;

  if (selectedPosition !== "PR1" && selectedPosition !== "PR2" && selectedPosition !== "PR3") {
    return {
      message: "Selecciona una opcion triangular valida.",
      ok: false
    };
  }

  const selectedKey = positions[selectedPosition];
  if (!selectedKey) {
    return {
      message: "Selecciona una opcion triangular valida.",
      ok: false
    };
  }

  return {
    answerValue: {
      correct: selectedKey === triangular.verify ? 1 : 0,
      deliveryOrder: [positions.PR1, positions.PR2, positions.PR3],
      positions,
      selectedKey,
      selectedPosition
    },
    ok: true
  };
}

function parseCtlAnswerForQuestion(input: CtlAnswerInput, question: CtlQuestionDefinition):
  | {
      answerValue: unknown;
      empty: boolean;
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  if (question.code === "F2") {
    return parseCtlAgeAnswer(input[question.code], question.code);
  }

  if (question.type === "MATRIX") {
    return parseMatrixAnswer(input[question.code], question);
  }

  const rawValue = input[question.code];
  const normalized = question.type === "SELECT" || question.type === "SCALE"
    ? normalizeCtlCode(rawValue)
    : normalizeCtlText(rawValue);

  if (!normalized) {
    return { answerValue: null, empty: true, ok: true };
  }

  if (question.type === "SELECT") {
    const allowedValues = new Set(question.options.map((option) => normalizeCtlCode(option.value)));

    if (!allowedValues.has(normalized)) {
      return {
        message: "Selecciona una opcion valida.",
        missingQuestionCodes: [question.code],
        ok: false
      };
    }

    return { answerValue: normalized, empty: false, ok: true };
  }

  if (question.type === "SCALE") {
    const value = Number(normalized);

    if (!Number.isInteger(value) || value < question.min || value > question.max) {
      return {
        message: `Selecciona un valor entre ${question.min} y ${question.max}.`,
        missingQuestionCodes: [question.code],
        ok: false
      };
    }

    return { answerValue: value, empty: false, ok: true };
  }

  return { answerValue: normalized, empty: false, ok: true };
}

function parseCtlAgeAnswer(
  rawValue: CtlAnswerInput[string],
  questionCode: string
):
  | {
      answerValue: CtlAgeAnswerValue | string | null;
      empty: boolean;
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const isStructuredAge = isGenericRecord(rawValue);
  const normalized = normalizeCtlCode(isStructuredAge ? rawValue.exactAge : rawValue);

  if (!normalized) {
    return { answerValue: null, empty: true, ok: true };
  }

  if (!isStructuredAge && isLegacyCtlAgeRangeCode(normalized)) {
    return { answerValue: normalized, empty: false, ok: true };
  }

  if (!/^\d{1,3}$/.test(normalized)) {
    return {
      message: "Captura la edad exacta con numeros.",
      missingQuestionCodes: [questionCode],
      ok: false
    };
  }

  const exactAge = Number(normalized);
  if (!Number.isInteger(exactAge) || exactAge < 1 || exactAge > 120) {
    return {
      message: "Captura una edad valida.",
      missingQuestionCodes: [questionCode],
      ok: false
    };
  }

  const derivedRange = deriveCtlAgeRange(exactAge);
  const selectedRangeCode = isStructuredAge ? normalizeCtlCode(rawValue.rangeCode) : "";
  if (selectedRangeCode && selectedRangeCode !== derivedRange.rangeCode) {
    return {
      message: "El rango operativo no coincide con la edad capturada.",
      missingQuestionCodes: [questionCode],
      ok: false
    };
  }

  return {
    answerValue: {
      exactAge,
      ...derivedRange
    },
    empty: false,
    ok: true
  };
}

function parseMatrixAnswer(
  rawValue: CtlAnswerInput[string],
  question: CtlMatrixQuestionDefinition
):
  | {
      answerValue: Record<string, string>;
      empty: boolean;
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const rawRows = isMatrixValueRecord(rawValue)
    ? rawValue as Record<string, FormDataEntryValue | null | undefined>
    : {};
  const allowedValues = new Set(question.columns.map((column) => normalizeCtlCode(column.value)));
  const answerValue: Record<string, string> = {};
  const missingRows: string[] = [];

  for (const row of question.rows) {
    const normalized = normalizeCtlCode(rawRows[row.code]);

    if (!normalized) {
      if (question.required) {
        missingRows.push(row.code);
      }
      continue;
    }

    if (!allowedValues.has(normalized)) {
      return {
        message: "Selecciona una opcion valida.",
        missingQuestionCodes: [`${question.code}.${row.code}`],
        ok: false
      };
    }

    answerValue[row.code] = normalized;
  }

  if (missingRows.length > 0) {
    return {
      message: "Responde las preguntas obligatorias antes de continuar.",
      missingQuestionCodes: missingRows.map((rowCode) => `${question.code}.${rowCode}`),
      ok: false
    };
  }

  return {
    answerValue,
    empty: Object.keys(answerValue).length === 0,
    ok: true
  };
}

function isMatrixValueRecord(value: unknown): value is Record<string, FormDataEntryValue | null | undefined> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isGenericRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deriveCtlAgeRange(exactAge: number): Pick<CtlAgeAnswerValue, "rangeCode" | "rangeLabel"> {
  if (exactAge <= 29) {
    return { rangeCode: "1", rangeLabel: CTL_AGE_RANGE_OPTIONS[0].label };
  }

  if (exactAge <= 45) {
    return { rangeCode: "2", rangeLabel: CTL_AGE_RANGE_OPTIONS[1].label };
  }

  if (exactAge <= 55) {
    return { rangeCode: "3", rangeLabel: CTL_AGE_RANGE_OPTIONS[2].label };
  }

  return { rangeCode: "4", rangeLabel: CTL_AGE_RANGE_OPTIONS[3].label };
}

function resolveCtlAgeRangeCode(answerValue: unknown): string | null {
  if (isGenericRecord(answerValue)) {
    const rangeCode = normalizeCtlCode(answerValue.rangeCode);
    if (isLegacyCtlAgeRangeCode(rangeCode)) {
      return rangeCode;
    }

    const exactAge = Number(normalizeCtlCode(answerValue.exactAge));
    if (Number.isInteger(exactAge)) {
      return deriveCtlAgeRange(exactAge).rangeCode;
    }
  }

  const normalized = normalizeCtlCode(answerValue);
  if (isLegacyCtlAgeRangeCode(normalized)) {
    return normalized;
  }

  if (/^\d{1,3}$/.test(normalized)) {
    return deriveCtlAgeRange(Number(normalized)).rangeCode;
  }

  return null;
}

function isLegacyCtlAgeRangeCode(value: string): value is CtlAgeAnswerValue["rangeCode"] {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

export function canAccessCtl(actor: CtlActor): boolean {
  if (isPublicCtlInterviewerActor(actor)) {
    return actor.status === "ACTIVE";
  }

  return actor.status === "ACTIVE" && actor.role !== "ANALYST";
}

export function isPublicCtlInterviewerActor(actor: CtlActor): actor is CtlPublicInterviewerActor {
  return actor.kind === "PUBLIC_CTL_INTERVIEWER";
}

export function ctlStatusLabel(status: CtlSessionStatus | null | undefined): string {
  switch (status) {
    case "CANCELLED":
      return "Cancelado";
    case "COMPLETED":
      return "Completado";
    case "IN_PROGRESS":
      return "En captura";
    case "PENDING":
      return "Pendiente";
    default:
      return "Sin CTL";
  }
}
