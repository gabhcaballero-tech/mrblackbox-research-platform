import {
  parseScreenerDefinition,
  type ScreenerAnswer,
  type ScreenerDefinition,
  type ScreenerQuestion
} from "@/modules/screener";
import {
  applyStudyScreenerDefinitionOverrides,
  DETERGENT_RECRUITER_QUESTION_ID
} from "@/modules/screener/study-overrides";
import {
  type ScreeningSupervisionRepository,
  type SupervisionAttemptExportRecord,
  type SupervisionAttemptRecord
} from "./repository";
import {
  canReviewScreeningAttempts,
  type ScreeningSupervisionActor,
  type ScreeningSupervisionResult
} from "./service";
import { parseScreeningAttemptFilters } from "./validation";

const TSV_SEPARATOR = "\t";
const TSV_CONTENT_TYPE = "text/tab-separated-values; charset=utf-8";
const DEFAULT_STUDY_TIME_ZONE = "America/Mexico_City";
const RECRUITER_QUESTION_IDS = [DETERGENT_RECRUITER_QUESTION_ID, "OP1_RECLUTADOR"];

type ExportColumn = {
  header: string;
  value: (attempt: SupervisionAttemptExportRecord, context: ExportContext) => string | number | null;
};

type ExportContext = {
  definition: ScreenerDefinition;
  timeZoneIana: string;
};

type PreparedExportAttempt = {
  attempt: SupervisionAttemptExportRecord;
  definition: ScreenerDefinition;
};

export type ScreeningAttemptTabularExport = {
  contentType: string;
  fileContent: string;
  filename: string;
  rowCount: number;
};

const baseColumns: ExportColumn[] = [
  { header: "Folio", value: (attempt) => attempt.participantConfirmation?.folio ?? "" },
  { header: "Nombre", value: (attempt) => attempt.studyParticipant.participantProfile.name },
  { header: "Teléfono", value: (attempt) => attempt.studyParticipant.participantProfile.phone },
  { header: "WhatsApp", value: (attempt) => attempt.studyParticipant.participantProfile.phone },
  { header: "Correo", value: (attempt) => attempt.studyParticipant.participantProfile.email },
  { header: "Fecha creación", value: (attempt, context) => formatDateTime(attempt.startedAt, context.timeZoneIana) },
  { header: "Fecha finalización", value: (attempt, context) => formatDateTime(attempt.completedAt, context.timeZoneIana) },
  { header: "Reclutador", value: (attempt, context) => firstQuestionAnswerText(attempt, context.definition, RECRUITER_QUESTION_IDS) },
  { header: "Entrevistador", value: (attempt) => userLabel(attempt.fieldUser) ?? "" },
  { header: "Referencia/código origen", value: (attempt) => attempt.studyParticipant.participantProfile.externalReference },
  { header: "Fuente", value: (attempt) => sourceLabel(attempt.source) },
  { header: "Estado intento", value: (attempt) => statusLabelsForAttempt(attempt).label },
  { header: "Elegibilidad", value: (attempt) => statusLabelsForAttempt(attempt).resultLabel },
  { header: "Motivo rechazo/revisión", value: (attempt) => rejectionOrReviewReason(attempt) },
  { header: "NSE", value: (attempt) => attempt.nseScore },
  { header: "Clasificación NSE", value: (attempt, context) => resolveNseClassLabel(context.definition, attempt.nseClass) },
  { header: "Código NSE interno", value: (attempt) => attempt.nseClass },
  { header: "Código 1", value: (attempt) => referenceCode(attempt, 1) },
  { header: "Código 2", value: (attempt) => referenceCode(attempt, 2) },
  { header: "Código 3", value: (attempt) => referenceCode(attempt, 3) },
  { header: "Selfie registrada", value: (attempt) => yesNo(selfieCount(attempt) > 0) },
  { header: "Número fotos perfumes", value: (attempt) => perfumePhotoCount(attempt) },
  { header: "Evidencia completa", value: (attempt) => yesNo(selfieCount(attempt) === 1 && perfumePhotoCount(attempt) >= 1) },
  { header: "Estado revisión evidencia", value: (attempt) => evidenceReviewStatusLabel(attempt) },
];

export async function exportScreeningAttemptsCsvForStudy({
  actor,
  filters,
  now = new Date(),
  repository,
  studyId
}: {
  actor: ScreeningSupervisionActor | null;
  filters: unknown;
  now?: Date;
  repository: ScreeningSupervisionRepository;
  studyId: string;
}): Promise<ScreeningSupervisionResult<ScreeningAttemptTabularExport>> {
  if (!canReviewScreeningAttempts(actor)) {
    return {
      code: "UNAUTHORIZED",
      message: "No tienes permiso para exportar intentos de screener.",
      ok: false
    };
  }

  let parsedFilters: ReturnType<typeof parseScreeningAttemptFilters>;

  try {
    parsedFilters = parseScreeningAttemptFilters(filters);
  } catch {
    return {
      code: "VALIDATION_ERROR",
      message: "Revisa los filtros de exportación.",
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

  const attempts = await repository.listStudyAttemptsForExport({ filters: parsedFilters, studyId });

  return {
    data: {
      contentType: TSV_CONTENT_TYPE,
      fileContent: buildScreeningAttemptsTsv(attempts, study.timeZoneIana),
      filename: `${sanitizeFilenamePart(study.code)}_intentos_screener_${formatDateForFilename(now, study.timeZoneIana)}.tsv`,
      rowCount: attempts.length
    },
    ok: true
  };
}

export function buildScreeningAttemptsTsv(attempts: SupervisionAttemptExportRecord[], timeZoneIana: string): string {
  const preparedAttempts = attempts.map<PreparedExportAttempt>((attempt) => ({
    attempt,
    definition: applyStudyScreenerDefinitionOverrides(
      attempt.questionnaireVersion.study.code,
      parseScreenerDefinition(attempt.questionnaireVersion.definitionJson)
    )
  }));
  const columns = [...baseColumns, ...buildQuestionAnswerColumns(preparedAttempts)];
  const rows = preparedAttempts.map(({ attempt, definition }) => {
    const context = { definition, timeZoneIana };

    return columns.map((column) => tsvCell(column.value(attempt, context)));
  });
  const header = columns.map((column) => tsvCell(column.header));
  const fileContent = `\uFEFF${[header, ...rows].map((row) => row.join(TSV_SEPARATOR)).join("\r\n")}\r\n`;

  validateTsvStructure(fileContent, header, rows);

  return fileContent;
}

function buildQuestionAnswerColumns(preparedAttempts: PreparedExportAttempt[]): ExportColumn[] {
  const questionIds: string[] = [];
  const seen = new Set<string>();

  function addQuestionId(questionId: string) {
    if (seen.has(questionId)) {
      return;
    }

    seen.add(questionId);
    questionIds.push(questionId);
  }

  for (const { attempt, definition } of preparedAttempts) {
    for (const question of [...definition.questions].sort((left, right) => left.order - right.order)) {
      addQuestionId(question.id);
    }

    for (const answer of attempt.answers) {
      addQuestionId(answer.questionId);
    }
  }

  return questionIds.map((questionId) => ({
    header: questionId,
    value: (attempt, context) => questionAnswerText(attempt, context.definition, questionId)
  }));
}

function firstQuestionAnswerText(
  attempt: SupervisionAttemptExportRecord,
  definition: ScreenerDefinition,
  questionIds: string[]
): string {
  for (const questionId of questionIds) {
    const value = questionAnswerText(attempt, definition, questionId).trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function questionAnswerText(
  attempt: SupervisionAttemptExportRecord,
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
  if (question.type === "INTEGER") {
    return String(answer);
  }

  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    return String(answer);
  }

  if (!("options" in question)) {
    return formatUnknownAnswer(answer);
  }

  const values = selectedValues(answer);
  const labels = values.map((value) => optionLabel(question, value));
  const otherText = otherTextFromAnswer(answer);
  const base = labels.length > 0 ? labels.join("|") : "";

  return otherText ? `${base} - Especificación: ${otherText}` : base;
}

function formatUnknownAnswer(answer: ScreenerAnswer): string {
  if (Array.isArray(answer)) {
    return answer.map(String).join("|");
  }

  if (typeof answer === "object" && answer !== null) {
    const values = selectedValues(answer);
    const otherText = otherTextFromAnswer(answer);
    const base = values.length > 0 ? values.join("|") : "";

    if (!base && !otherText) {
      return safeJsonAnswerText(answer);
    }

    return otherText ? `${base} - Especificación: ${otherText}` : base;
  }

  return String(answer);
}

function safeJsonAnswerText(value: object): string {
  try {
    return JSON.stringify(sanitizeJsonValue(value)) ?? "";
  } catch {
    return "[Respuesta no serializable]";
  }
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeTabularValue(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, sanitizeJsonValue(nestedValue)])
    );
  }

  return value;
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

function otherTextFromAnswer(answer: ScreenerAnswer): string {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer)
    ? answer.otherText?.trim() ?? ""
    : "";
}

function optionLabel(question: Extract<ScreenerQuestion, { options: unknown[] }>, value: string): string {
  return question.options.find((option) => option.value === value)?.label ?? `Valor registrado: ${value}`;
}

function rejectionOrReviewReason(attempt: SupervisionAttemptExportRecord): string {
  return attempt.participantScreeningReview?.rejectionReason ?? effectiveReason(attempt).reason;
}

function effectiveReason(attempt: SupervisionAttemptExportRecord): { code: string; reason: string } {
  const evaluation = parseEvaluation(attempt.evaluationJson);
  const firstReason = evaluation.reasons[0];

  return {
    code: attempt.terminationCode ?? firstReason?.code ?? "",
    reason: attempt.terminationReason ?? firstReason?.reason ?? ""
  };
}

function parseEvaluation(input: unknown): { reasons: Array<{ code: string; reason: string }> } {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const reasons = Array.isArray(value.reasons) ? value.reasons.filter(isReason) : [];

  return { reasons };
}

function isReason(value: unknown): value is { code: string; reason: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { code?: unknown }).code === "string" &&
      typeof (value as { reason?: unknown }).reason === "string"
  );
}

function statusLabelsForAttempt(
  attempt: Pick<SupervisionAttemptRecord, "participantConfirmation" | "participantScreeningReview" | "status">
) {
  if (attempt.participantConfirmation || attempt.participantScreeningReview?.status === "APPROVED") {
    return { label: "Elegible confirmado", resultLabel: "Elegible confirmado" };
  }

  if (attempt.participantScreeningReview?.status === "REJECTED") {
    return { label: "Evidencia rechazada", resultLabel: "Evidencia rechazada" };
  }

  switch (attempt.status) {
    case "STARTED":
      return { label: "Iniciado", resultLabel: "Iniciado" };
    case "INCOMPLETE":
      return { label: "Incompleto", resultLabel: "Incompleto" };
    case "PASSED":
      return { label: "Elegible", resultLabel: "Elegible" };
    case "TERMINATED":
      return { label: "No elegible", resultLabel: "No elegible" };
    case "PENDING_REVIEW":
      return { label: "Pendiente de revisión", resultLabel: "Pendiente de revisión" };
  }
}

function resolveNseClassLabel(definition: ScreenerDefinition, classCode: string | null): string {
  if (!classCode) {
    return "";
  }

  return definition.nse?.ranges.find((range) => range.code === classCode)?.label ?? classCode;
}

function evidenceReviewStatusLabel(attempt: SupervisionAttemptExportRecord): string {
  if (attempt.participantScreeningReview?.status) {
    return reviewStatusLabel(attempt.participantScreeningReview.status);
  }

  const statuses = [...new Set(attempt.participantEvidence.map((evidence) => evidence.reviewStatus))];

  if (statuses.length === 0) {
    return "Sin revisión";
  }

  return statuses.map(reviewStatusLabel).join(" / ");
}

function reviewStatusLabel(status: "APPROVED" | "PENDING" | "REJECTED"): string {
  switch (status) {
    case "APPROVED":
      return "Aprobado";
    case "REJECTED":
      return "Rechazado";
    case "PENDING":
      return "Pendiente";
  }
}

function selfieCount(attempt: SupervisionAttemptExportRecord): number {
  return attempt.participantEvidence.filter((evidence) => evidence.type === "SELFIE_IDENTIFICATION").length;
}

function perfumePhotoCount(attempt: SupervisionAttemptExportRecord): number {
  return attempt.participantEvidence.filter((evidence) => evidence.type === "PERFUME_PHOTO").length;
}

function referenceCode(attempt: SupervisionAttemptExportRecord, slot: number): string {
  return attempt.participantConfirmation?.referenceCodes.find((code) => code.slot === slot)?.code ?? "";
}

function userLabel(user: { email: string; name: string } | null | undefined): string | null {
  return user?.name.trim() || user?.email || null;
}

function sourceLabel(source: SupervisionAttemptRecord["source"]): string {
  return source === "FIELD" ? "Campo" : "Portal participante";
}

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function tsvCell(value: string | number | null | undefined): string {
  return neutralizeFormula(sanitizeTabularValue(value));
}

function validateTsvStructure(fileContent: string, header: string[], rows: string[][]): void {
  const lines = fileContent.replace(/^\uFEFF/, "").replace(/\r\n$/, "").split("\r\n");
  const expectedColumns = lines[0]?.split(TSV_SEPARATOR).length ?? 0;

  lines.slice(1).forEach((line, rowIndex) => {
    const actualColumns = line.split(TSV_SEPARATOR).length;

    if (actualColumns !== expectedColumns) {
      const suspectedColumn = findPotentialBreakingColumn(header, rows[rowIndex] ?? []);

      console.error("screening export tsv structure mismatch", {
        actualColumns,
        expectedColumns,
        rowNumber: rowIndex + 2,
        suspectedColumn
      });
    }
  });
}

function findPotentialBreakingColumn(header: string[], row: string[]): string {
  const unsafeIndex = row.findIndex((cell) => containsTsvBreakingCharacter(cell));

  if (unsafeIndex >= 0) {
    return header[unsafeIndex] ?? `column_${unsafeIndex + 1}`;
  }

  return "unknown";
}

function containsTsvBreakingCharacter(value: string): boolean {
  return /[\t\r\n\u0085\u2028\u2029]/.test(value);
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

function formatDateTime(value: Date | null, timeZoneIana: string): string {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: resolveStudyTimeZone(timeZoneIana)
    }).format(value);
  } catch {
    return value.toISOString();
  }
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
