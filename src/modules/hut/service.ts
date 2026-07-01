import { randomUUID } from "node:crypto";

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

export function createHutParticipantToken(): string {
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

export function nextHutVideoSequence(block: Pick<HutBlockState, "requiredVideos" | "submittedVideosCount">): number | null {
  const next = block.submittedVideosCount + 1;
  return next <= block.requiredVideos ? next : null;
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
