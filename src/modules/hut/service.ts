import { randomUUID } from "node:crypto";
import {
  getHutApplicableQuestions,
  getHutQuestions,
  getHutV5Definition,
  type HutDefinition,
  type HutDefinitionContext,
  type HutMatrixQuestionDefinition,
  type HutQuestionDefinition
} from "./definition";

export const HUT_REQUIRED_VIDEOS_PER_BLOCK = 3;
export const HUT_MAX_MISSED_DAYS_PER_BLOCK = 1;
export const HUT_MAX_BLOCK_CALENDAR_DAYS = 4;

export const HUT_PARTICIPANT_STATUSES = [
  "NOT_STARTED",
  "BLOCK_1_IN_PROGRESS",
  "BLOCK_1_CALL_PENDING",
  "BLOCK_2_IN_PROGRESS",
  "BLOCK_2_CALL_PENDING",
  "COMPLETED",
  "DISQUALIFIED"
] as const;

export type HutParticipantStatus = (typeof HUT_PARTICIPANT_STATUSES)[number];

export const HUT_BLOCK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "CALL_PENDING",
  "COMPLETED",
  "DISQUALIFIED"
] as const;

export type HutBlockStatus = (typeof HUT_BLOCK_STATUSES)[number];

export const HUT_CALL_STATUSES = [
  "PENDING",
  "SCHEDULED",
  "COMPLETED",
  "NO_ANSWER",
  "RESCHEDULE_NEEDED"
] as const;

export type HutCallEvaluationStatus = (typeof HUT_CALL_STATUSES)[number];

export type HutBlockState = {
  blockNumber: 1 | 2;
  requiredVideos: number;
  submittedVideosCount: number;
  missedDaysCount: number;
  maxMissedDaysAllowed: number;
  status: HutBlockStatus;
};

export type HutBlockProgressDecision =
  | {
      blockStatus: "IN_PROGRESS";
      disqualified: false;
      nextVideoSequence: number;
      participantStatus: "BLOCK_1_IN_PROGRESS" | "BLOCK_2_IN_PROGRESS";
      submittedVideosCount: number;
    }
  | {
      blockStatus: "CALL_PENDING";
      disqualified: false;
      nextVideoSequence: number;
      participantStatus: "BLOCK_1_CALL_PENDING" | "BLOCK_2_CALL_PENDING";
      submittedVideosCount: number;
    };

export type HutMissedDayDecision =
  | {
      blockStatus: "IN_PROGRESS";
      disqualified: false;
      missedDaysCount: number;
      participantStatus: "BLOCK_1_IN_PROGRESS" | "BLOCK_2_IN_PROGRESS";
      reminderStatus: "REMINDER_PENDING" | "REMINDER_SENT";
    }
  | {
      blockStatus: "DISQUALIFIED";
      disqualificationReason: string;
      disqualified: true;
      missedDaysCount: number;
      participantStatus: "DISQUALIFIED";
      reminderStatus: "MISSED";
    };

export type HutAvailabilityReason =
  | "AVAILABLE_FOR_SELFIE"
  | "AVAILABLE_FOR_VIDEO"
  | "BLOCK_NOT_ACTIVE"
  | "MISSING_REFERENCE_SELFIE"
  | "WAIT_UNTIL_5_AM"
  | "VISUAL_VERIFICATION_FAILED"
  | "VISUAL_VERIFICATION_PENDING"
  | "WAIT_UNTIL_NEXT_DAY";

export type HutAvailabilityInput = {
  block: HutBlockState & {
    id?: string;
    startDate: Date | null;
  };
  dailyChecks: Array<{
    blockDayNumber: number;
    date?: Date;
  }>;
  hasReferenceSelfie: boolean;
  testMode?: boolean;
  hasVisualOverride: boolean;
  latestVerificationStatus?: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN" | null;
  now: Date;
  timeZoneIana: string;
};

export type HutAvailability = {
  available: boolean;
  blockNumber: 1 | 2;
  blockDayNumber: number;
  daysMissedInBlock: number;
  expectedVideoSequence: number;
  nextAvailableAt: Date | null;
  reason: HutAvailabilityReason;
};

export function createHutParticipantToken(): string {
  return randomUUID();
}

export function createHutRegistrationToken(): string {
  return randomUUID();
}

export function normalizeHutText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Control}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

export function normalizeHutEmail(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeHutPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[^\d+]/g, "");
  return digits.length > 0 ? digits : null;
}

export function normalizeOptionalHutText(value: unknown): string | null {
  const normalized = normalizeHutText(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeHutFolio(value: unknown): string {
  return normalizeHutText(value).replace(/\s+/g, "-");
}

export type HutAnswerInput = Record<
  string,
  FormDataEntryValue | Record<string, FormDataEntryValue | null | undefined> | null | undefined
>;

export type HutAnswerDraft = {
  answerValue: unknown;
  questionCode: string;
};

export function parseHutQuestionnaireAnswers(
  input: HutAnswerInput,
  definition: HutDefinition = getHutV5Definition(),
  context: HutDefinitionContext = {}
):
  | {
      answers: HutAnswerDraft[];
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const answers: HutAnswerDraft[] = [];
  const missingQuestionCodes: string[] = [];

  for (const question of getHutApplicableQuestions({ answers: input, context, definition })) {
    const parsed = parseHutAnswerForQuestion(input, question);

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

export function parseHutQuestionAnswer(
  questionCode: string,
  input: HutAnswerInput,
  definition: HutDefinition = getHutV5Definition()
):
  | {
      answer: HutAnswerDraft | null;
      empty: boolean;
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const question = getHutQuestions(definition).find((candidate) => candidate.code === questionCode);

  if (!question) {
    return {
      message: "No encontramos la pregunta HUT.",
      missingQuestionCodes: [questionCode],
      ok: false
    };
  }

  const parsed = parseHutAnswerForQuestion(input, question);

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

export function hutFormDataToAnswerInput(formData: FormData): HutAnswerInput {
  const input: HutAnswerInput = {};

  for (const [key, value] of formData.entries()) {
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
    const nested = isHutMatrixValueRecord(current)
      ? current as Record<string, FormDataEntryValue | null | undefined>
      : {};

    nested[rowCode] = value;
    input[questionCode] = nested;
  }

  return input;
}

function parseHutAnswerForQuestion(input: HutAnswerInput, question: HutQuestionDefinition):
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
  if (question.type === "MATRIX") {
    return parseHutMatrixAnswer(input[question.code], question);
  }

  const rawValue = input[question.code];
  const normalized = question.type === "SELECT" || question.type === "SCALE"
    ? normalizeHutAnswerCode(rawValue)
    : normalizeHutText(rawValue);

  if (!normalized) {
    return { answerValue: null, empty: true, ok: true };
  }

  if (question.type === "SELECT") {
    const allowedValues = new Set(question.options.map((option) => normalizeHutAnswerCode(option.value)));

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

function parseHutMatrixAnswer(
  rawValue: HutAnswerInput[string],
  question: HutMatrixQuestionDefinition
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
  const rawRows = isHutMatrixValueRecord(rawValue)
    ? rawValue as Record<string, FormDataEntryValue | null | undefined>
    : {};
  const allowedValues = new Set(question.columns.map((column) => normalizeHutAnswerCode(column.value)));
  const answerValue: Record<string, string> = {};
  const missingRows: string[] = [];

  for (const row of question.rows) {
    const normalized = normalizeHutAnswerCode(rawRows[row.code]);

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

function normalizeHutAnswerCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function isHutMatrixValueRecord(value: unknown): value is Record<string, FormDataEntryValue | null | undefined> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function nextHutVideoSequence(block: Pick<HutBlockState, "requiredVideos" | "submittedVideosCount">): number | null {
  const next = block.submittedVideosCount + 1;
  return next <= block.requiredVideos ? next : null;
}

export function getHutCurrentAvailability(input: HutAvailabilityInput): HutAvailability {
  const expectedVideoSequence = nextHutVideoSequence(input.block) ?? input.block.requiredVideos;
  const blockDayNumber = nextHutBlockDayNumber(input.dailyChecks);
  const base = {
    blockNumber: input.block.blockNumber,
    blockDayNumber,
    daysMissedInBlock: input.block.missedDaysCount,
    expectedVideoSequence,
    nextAvailableAt: null
  };

  if (input.block.status !== "IN_PROGRESS" || !input.block.startDate) {
    return {
      ...base,
      available: false,
      reason: "BLOCK_NOT_ACTIVE"
    };
  }

  const nextAvailableAt = hutBlockDayAvailableAt({
    blockDayNumber,
    startDate: input.block.startDate,
    timeZoneIana: input.timeZoneIana
  });

  if (!input.testMode && input.now.getTime() < nextAvailableAt.getTime()) {
    return {
      ...base,
      available: false,
      nextAvailableAt,
      reason: "WAIT_UNTIL_5_AM"
    };
  }

  const nextDailyUploadAt = nextDailyUploadAvailableAt({
    dailyChecks: input.dailyChecks,
    now: input.now,
    timeZoneIana: input.timeZoneIana
  });
  if (!input.testMode && nextDailyUploadAt) {
    return {
      ...base,
      available: false,
      nextAvailableAt: nextDailyUploadAt,
      reason: "WAIT_UNTIL_NEXT_DAY"
    };
  }

  if (!input.hasReferenceSelfie && !input.hasVisualOverride) {
    return {
      ...base,
      available: false,
      nextAvailableAt,
      reason: "MISSING_REFERENCE_SELFIE"
    };
  }

  if (input.hasVisualOverride) {
    return {
      ...base,
      available: true,
      nextAvailableAt,
      reason: "AVAILABLE_FOR_VIDEO"
    };
  }

  if (input.latestVerificationStatus === "MATCHED") {
    return {
      ...base,
      available: true,
      nextAvailableAt,
      reason: "AVAILABLE_FOR_VIDEO"
    };
  }

  if (input.latestVerificationStatus === "NOT_MATCHED" || input.latestVerificationStatus === "UNCERTAIN") {
    return {
      ...base,
      available: false,
      nextAvailableAt,
      reason: "VISUAL_VERIFICATION_FAILED"
    };
  }

  if (input.latestVerificationStatus === "PENDING" || input.latestVerificationStatus === "PENDING_REVIEW") {
    return {
      ...base,
      available: false,
      nextAvailableAt,
      reason: "VISUAL_VERIFICATION_PENDING"
    };
  }

  return {
    ...base,
    available: true,
    nextAvailableAt,
    reason: "AVAILABLE_FOR_SELFIE"
  };
}

export function applyHutVideoSubmission(block: HutBlockState): HutBlockProgressDecision {
  if (block.status !== "IN_PROGRESS") {
    throw new Error("El bloque HUT no esta activo.");
  }

  const submittedVideosCount = block.submittedVideosCount + 1;
  const blockComplete = submittedVideosCount >= block.requiredVideos;
  const nextVideoSequence = Math.min(submittedVideosCount + 1, block.requiredVideos);

  if (blockComplete) {
    return {
      blockStatus: "CALL_PENDING",
      disqualified: false,
      nextVideoSequence,
      participantStatus: block.blockNumber === 1 ? "BLOCK_1_CALL_PENDING" : "BLOCK_2_CALL_PENDING",
      submittedVideosCount
    };
  }

  return {
    blockStatus: "IN_PROGRESS",
    disqualified: false,
    nextVideoSequence,
    participantStatus: block.blockNumber === 1 ? "BLOCK_1_IN_PROGRESS" : "BLOCK_2_IN_PROGRESS",
    submittedVideosCount
  };
}

export function applyHutMissedDay(block: HutBlockState): HutMissedDayDecision {
  if (block.status !== "IN_PROGRESS") {
    throw new Error("Solo se pueden registrar omisiones en un bloque activo.");
  }

  const missedDaysCount = block.missedDaysCount + 1;

  if (missedDaysCount > block.maxMissedDaysAllowed) {
    return {
      blockStatus: "DISQUALIFIED",
      disqualificationReason:
        "Excedio la tolerancia total del bloque: omitio mas de un dia durante la etapa de videos.",
      disqualified: true,
      missedDaysCount,
      participantStatus: "DISQUALIFIED",
      reminderStatus: "MISSED"
    };
  }

  return {
    blockStatus: "IN_PROGRESS",
    disqualified: false,
    missedDaysCount,
    participantStatus: block.blockNumber === 1 ? "BLOCK_1_IN_PROGRESS" : "BLOCK_2_IN_PROGRESS",
    reminderStatus: "REMINDER_PENDING"
  };
}

export function participantStatusForStartedBlock(blockNumber: 1 | 2): "BLOCK_1_IN_PROGRESS" | "BLOCK_2_IN_PROGRESS" {
  return blockNumber === 1 ? "BLOCK_1_IN_PROGRESS" : "BLOCK_2_IN_PROGRESS";
}

export function participantStatusForCallPendingBlock(blockNumber: 1 | 2): "BLOCK_1_CALL_PENDING" | "BLOCK_2_CALL_PENDING" {
  return blockNumber === 1 ? "BLOCK_1_CALL_PENDING" : "BLOCK_2_CALL_PENDING";
}

export function nextHutBlockDayNumber(dailyChecks: Array<{ blockDayNumber: number }>): number {
  const maxExistingDay = dailyChecks.reduce((max, check) => Math.max(max, check.blockDayNumber), 0);
  return maxExistingDay + 1;
}

export function hutBlockDayAvailableAt({
  blockDayNumber,
  startDate,
  timeZoneIana
}: {
  blockDayNumber: number;
  startDate: Date;
  timeZoneIana: string;
}): Date {
  const start = getTimeZoneDateParts(startDate, timeZoneIana);
  const localDate = new Date(Date.UTC(start.year, start.month - 1, start.day + blockDayNumber - 1, 5, 0, 0, 0));

  return localDateTimeToUtc({
    day: localDate.getUTCDate(),
    hour: 5,
    minute: 0,
    month: localDate.getUTCMonth() + 1,
    second: 0,
    timeZoneIana,
    year: localDate.getUTCFullYear()
  });
}

function nextDailyUploadAvailableAt({
  dailyChecks,
  now,
  timeZoneIana
}: {
  dailyChecks: Array<{ date?: Date }>;
  now: Date;
  timeZoneIana: string;
}): Date | null {
  const today = getTimeZoneDateParts(now, timeZoneIana);
  const hasCompletedToday = dailyChecks.some((check) => {
    if (!check.date) {
      return false;
    }
    const checkDate = getTimeZoneDateParts(check.date, timeZoneIana);
    return checkDate.year === today.year && checkDate.month === today.month && checkDate.day === today.day;
  });

  if (!hasCompletedToday) {
    return null;
  }

  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 5, 0, 0, 0));
  return localDateTimeToUtc({
    day: tomorrow.getUTCDate(),
    hour: 5,
    minute: 0,
    month: tomorrow.getUTCMonth() + 1,
    second: 0,
    timeZoneIana,
    year: tomorrow.getUTCFullYear()
  });
}

export function parseHutParticipantImportText(text: string): Array<{
  email: string | null;
  name: string;
  phone: string | null;
  recruiter: string | null;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(";") ? ";" : ",";
  const maybeHeader = splitDelimitedLine(lines[0] ?? "", delimiter).map((item) => item.toLowerCase());
  const hasHeader = maybeHeader.some((item) => ["nombre", "name"].includes(item));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const [name, phone, email, recruiter] = splitDelimitedLine(line, delimiter);
      return {
        email: normalizeHutEmail(email),
        name: normalizeHutText(name),
        phone: normalizeHutPhone(phone),
        recruiter: normalizeOptionalHutText(recruiter)
      };
    })
    .filter((row) => row.name.length > 0);
}

export function parseHutRegistrationSlotImportText(text: string): Array<{
  firstFragranceLeftArm: string;
  folio: string;
  secondFragranceRightArm: string;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(";") ? ";" : ",";
  const maybeHeader = splitDelimitedLine(lines[0] ?? "", delimiter).map((item) => item.toLowerCase());
  const hasHeader = maybeHeader.some((item) => ["folio", "firstfragranceleftarm", "primera fragancia / brazo izquierdo"].includes(item));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const [folio, firstFragranceLeftArm, secondFragranceRightArm] = splitDelimitedLine(line, delimiter);
      return {
        firstFragranceLeftArm: normalizeHutText(firstFragranceLeftArm),
        folio: normalizeHutFolio(folio),
        secondFragranceRightArm: normalizeHutText(secondFragranceRightArm)
      };
    })
    .filter((row) => row.folio.length > 0 && row.firstFragranceLeftArm.length > 0 && row.secondFragranceRightArm.length > 0);
}

export function buildHutTsv(rows: Array<Array<string | number | Date | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(escapeTsvCell).join("\t")).join("\r\n")}`;
}

function escapeTsvCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = value instanceof Date ? value.toISOString() : String(value);

  return raw.replace(/\t/g, " ").replace(/\r\n|\r|\n/g, " ").replace(/\s{2,}/g, " ").trim();
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((item) => item.trim());
}

function getTimeZoneDateParts(date: Date, timeZoneIana: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timeZoneIana,
    year: "numeric"
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value)
  };
}

function localDateTimeToUtc({
  day,
  hour,
  minute,
  month,
  second,
  timeZoneIana,
  year
}: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  timeZoneIana: string;
  year: number;
}): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const zoneParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timeZoneIana,
    year: "numeric"
  }).formatToParts(utcGuess);
  const zoneAsUtc = Date.UTC(
    Number(zoneParts.find((part) => part.type === "year")?.value),
    Number(zoneParts.find((part) => part.type === "month")?.value) - 1,
    Number(zoneParts.find((part) => part.type === "day")?.value),
    Number(zoneParts.find((part) => part.type === "hour")?.value),
    Number(zoneParts.find((part) => part.type === "minute")?.value),
    Number(zoneParts.find((part) => part.type === "second")?.value)
  );
  const offset = zoneAsUtc - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offset);
}
