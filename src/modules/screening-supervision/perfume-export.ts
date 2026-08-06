import {
  applyStudyScreenerDefinitionOverrides
} from "@/modules/screener/study-overrides";
import {
  parseScreenerDefinition,
  type ScreenerAnswer,
  type ScreenerDefinition,
  type ScreenerQuestion
} from "@/modules/screener";
import { F6_PERFUME_EVIDENCE_QUESTION_ID } from "@/modules/participant-portal/evidence-storage";
import type {
  ScreeningSupervisionRepository,
  SupervisionPerfumeExportRecord
} from "./repository";
import type {
  ScreeningSupervisionActor,
  ScreeningSupervisionResult
} from "./service";
import {
  createSignedEvidenceToken,
  resolveSignedEvidenceLinkSecret,
  resolveSignedEvidenceLinkTtlSeconds
} from "./signed-evidence-links";

const TSV_SEPARATOR = "\t";
const TSV_CONTENT_TYPE = "text/tab-separated-values; charset=utf-8";
const DEFAULT_STUDY_TIME_ZONE = "America/Mexico_City";
const MAX_PERFUME_PHOTO_COLUMNS = 3;

export type ScreeningPerfumeExport = {
  contentType: string;
  fileContent: string;
  filename: string;
  linkTtlSeconds: number;
  rowCount: number;
};

type PerfumeExportColumn = {
  header: string;
  value: (row: PerfumeExportRow) => string;
};

type PerfumeExportRow = {
  attempt: SupervisionPerfumeExportRecord;
  brand: string;
  photoUrls: string[];
};

export async function exportScreeningPerfumeParticipantsForStudy({
  actor,
  now = new Date(),
  repository,
  requestOrigin,
  studyId
}: {
  actor: ScreeningSupervisionActor | null;
  now?: Date;
  repository: ScreeningSupervisionRepository;
  requestOrigin: string;
  studyId: string;
}): Promise<ScreeningSupervisionResult<ScreeningPerfumeExport>> {
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    return {
      code: "UNAUTHORIZED",
      message: "No tienes permiso para exportar perfumes de participantes.",
      ok: false
    };
  }

  const study = await repository.getStudy(studyId);

  if (!study) {
    return {
      code: "STUDY_NOT_FOUND",
      message: "El estudio no existe.",
      ok: false
    };
  }

  const secret = resolveSignedEvidenceLinkSecret(process.env);

  if (!secret) {
    return {
      code: "VALIDATION_ERROR",
      message: "No fue posible preparar enlaces temporales de evidencia.",
      ok: false
    };
  }

  const linkTtlSeconds = resolveSignedEvidenceLinkTtlSeconds(process.env);
  const attempts = dedupeAttemptsByParticipant(await repository.listStudyAttemptsForPerfumeExport({ studyId }));
  const rows = attempts.map((attempt) => buildPerfumeExportRow({
    attempt,
    linkTtlSeconds,
    now,
    requestOrigin,
    secret
  }));

  return {
    data: {
      contentType: TSV_CONTENT_TYPE,
      fileContent: buildPerfumeParticipantsTsv(rows),
      filename: `${sanitizeFilenamePart(study.code)}_perfumes_participantes_${formatDateForFilename(now, study.timeZoneIana)}.tsv`,
      linkTtlSeconds,
      rowCount: rows.length
    },
    ok: true
  };
}

export function buildPerfumeParticipantsTsv(rows: PerfumeExportRow[]): string {
  const columns: PerfumeExportColumn[] = [
    { header: "Folio", value: (row) => row.attempt.participantConfirmation?.folio ?? "" },
    { header: "Participante", value: (row) => row.attempt.studyParticipant.participantProfile.name },
    { header: "Marca perfume", value: (row) => row.brand },
    { header: "Foto perfume 1", value: (row) => row.photoUrls[0] ?? "" },
    { header: "Foto perfume 2", value: (row) => row.photoUrls[1] ?? "" },
    { header: "Foto perfume 3", value: (row) => row.photoUrls[2] ?? "" }
  ];
  const header = columns.map((column) => tsvCell(column.header));
  const body = rows.map((row) => columns.map((column) => tsvCell(column.value(row))));

  return `\uFEFF${[header, ...body].map((row) => row.join(TSV_SEPARATOR)).join("\r\n")}\r\n`;
}

function buildPerfumeExportRow({
  attempt,
  linkTtlSeconds,
  now,
  requestOrigin,
  secret
}: {
  attempt: SupervisionPerfumeExportRecord;
  linkTtlSeconds: number;
  now: Date;
  requestOrigin: string;
  secret: string;
}): PerfumeExportRow {
  const definition = applyStudyScreenerDefinitionOverrides(
    attempt.questionnaireVersion.study.code,
    parseScreenerDefinition(attempt.questionnaireVersion.definitionJson)
  );
  const brand = questionAnswerText(attempt, definition, F6_PERFUME_EVIDENCE_QUESTION_ID);
  const photoUrls = attempt.participantEvidence
    .filter((evidence) => evidence.type === "PERFUME_PHOTO")
    .slice(0, MAX_PERFUME_PHOTO_COLUMNS)
    .map((evidence) => signedEvidenceUrl({ evidenceId: evidence.id, linkTtlSeconds, now, requestOrigin, secret }))
    .filter((url): url is string => Boolean(url));

  return {
    attempt,
    brand,
    photoUrls
  };
}

function signedEvidenceUrl({
  evidenceId,
  linkTtlSeconds,
  now,
  requestOrigin,
  secret
}: {
  evidenceId: string;
  linkTtlSeconds: number;
  now: Date;
  requestOrigin: string;
  secret: string;
}): string | null {
  const token = createSignedEvidenceToken({
    evidenceId,
    now,
    secret,
    ttlSeconds: linkTtlSeconds
  });

  return token ? new URL(`/evidence/signed/${encodeURIComponent(token)}`, requestOrigin).toString() : null;
}

function dedupeAttemptsByParticipant(attempts: SupervisionPerfumeExportRecord[]): SupervisionPerfumeExportRecord[] {
  const byParticipant = new Map<string, SupervisionPerfumeExportRecord>();

  for (const attempt of attempts) {
    const participantId = attempt.studyParticipantId;
    const existing = byParticipant.get(participantId);

    if (!existing || attemptScore(attempt) > attemptScore(existing)) {
      byParticipant.set(participantId, attempt);
    }
  }

  return [...byParticipant.values()].sort((left, right) =>
    (left.participantConfirmation?.folio ?? left.studyParticipant.participantProfile.name).localeCompare(
      right.participantConfirmation?.folio ?? right.studyParticipant.participantProfile.name,
      "es-MX",
      { numeric: true }
    )
  );
}

function attemptScore(attempt: SupervisionPerfumeExportRecord): number {
  return (attempt.participantConfirmation ? 100 : 0) + attempt.participantEvidence.length;
}

function questionAnswerText(
  attempt: SupervisionPerfumeExportRecord,
  definition: ScreenerDefinition,
  questionId: string
): string {
  const answer = attempt.answers.find((item) => item.questionId === questionId);

  if (!answer) {
    return "";
  }

  const question = definition.questions.find((item) => item.id === questionId);
  const answerValue = answer.answerJson as ScreenerAnswer;

  return question ? formatAnswer(question, answerValue) : formatUnknownAnswer(answerValue);
}

function formatAnswer(question: ScreenerQuestion, answer: ScreenerAnswer): string {
  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT" || question.type === "INTEGER") {
    return String(answer);
  }

  if (!("options" in question)) {
    return formatUnknownAnswer(answer);
  }

  const values = selectedValues(answer);

  return values.map((value) => question.options.find((option) => option.value === value)?.label ?? value).join("|");
}

function formatUnknownAnswer(answer: ScreenerAnswer): string {
  if (Array.isArray(answer)) {
    return answer.map(String).join("|");
  }

  if (typeof answer === "object" && answer !== null) {
    const values = selectedValues(answer);

    if (values.length > 0) {
      return values.join("|");
    }

    try {
      return JSON.stringify(answer) ?? "";
    } catch {
      return "[Respuesta no serializable]";
    }
  }

  return String(answer);
}

function selectedValues(answer: ScreenerAnswer): string[] {
  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  if (typeof answer === "object" && answer !== null) {
    if (Array.isArray(answer.values)) {
      return answer.values.map(String);
    }

    if (answer.value !== undefined) {
      return [String(answer.value)];
    }

    return [];
  }

  return [String(answer)];
}

function tsvCell(value: string | number | null | undefined): string {
  return neutralizeFormula(sanitizeTabularValue(value));
}

function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

function sanitizeTabularValue(value: string | number | null | undefined): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\t\v\f]+/g, " ")
    .replace(/\r\n|\r|\n|\u0085|\u2028|\u2029/g, " ")
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatDateForFilename(value: Date, timeZoneIana: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: resolveStudyTimeZone(timeZoneIana),
      year: "numeric"
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "00";
    const day = parts.find((part) => part.type === "day")?.value ?? "00";

    return `${year}-${month}-${day}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "estudio";
}

function resolveStudyTimeZone(timeZoneIana?: string | null): string {
  const candidate = timeZoneIana?.trim() || DEFAULT_STUDY_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: candidate
    }).format(new Date());

    return candidate;
  } catch {
    return DEFAULT_STUDY_TIME_ZONE;
  }
}
