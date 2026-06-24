import {
  parseScreenerDefinition,
  type ScreenerAnswer,
  type ScreenerDefinition,
  type ScreenerQuestion
} from "@/modules/screener";
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

type ExportColumn = {
  header: string;
  value: (attempt: SupervisionAttemptExportRecord, context: ExportContext) => string | number | null;
};

type ExportContext = {
  definition: ScreenerDefinition;
  timeZoneIana: string;
};

type KeyAnswerColumn = {
  header: string;
  questionIds: string[];
};

export type ScreeningAttemptTabularExport = {
  contentType: string;
  fileContent: string;
  filename: string;
  rowCount: number;
};

const keyAnswerColumns: KeyAnswerColumn[] = [
  { header: "Consentimiento", questionIds: ["CONSENTIMIENTO"] },
  { header: "Género", questionIds: ["F1_GENERO"] },
  { header: "Edad", questionIds: ["F2_EDAD"] },
  { header: "Exclusión laboral", questionIds: ["F3_EXCLUSION_LABORAL"] },
  { header: "Participación reciente", questionIds: ["F4_PARTICIPACION_RECIENTE"] },
  { header: "Condiciones físicas", questionIds: ["F5_CONDICIONES_FISICAS"] },
  { header: "Marcas/F6", questionIds: ["F6_MARCAS_UTILIZA", "F6_MARCAS"] },
  { header: "Marca frecuente/F7", questionIds: ["F7_MARCA_FRECUENTE"] },
  { header: "Variante/F8", questionIds: ["F8_VARIANTE_COLOR"] },
  { header: "Frecuencia/F9", questionIds: ["F9_FRECUENCIA_SEMANAL"] },
  { header: "Veces/día F9A", questionIds: ["F9A_VECES_AL_DIA"] },
  { header: "Última compra/F10", questionIds: ["F10_ULTIMA_COMPRA"] },
  { header: "D1", questionIds: ["D1_ESCOLARIDAD_JEFE_HOGAR", "D1"] },
  { header: "D2", questionIds: ["D2_BANOS_COMPLETOS", "D2"] },
  { header: "D3", questionIds: ["D3_AUTOMOVILES_HOGAR", "D3"] },
  { header: "D4", questionIds: ["D4_INTERNET_HOGAR", "D4"] },
  { header: "D5", questionIds: ["D5_PERSONAS_TRABAJARON", "D5"] },
  { header: "D6", questionIds: ["D6_CUARTOS_DORMIR", "D6"] }
];

const baseColumns: ExportColumn[] = [
  { header: "Código del estudio", value: (attempt) => attempt.questionnaireVersion.study.code },
  { header: "Nombre del estudio", value: (attempt) => attempt.questionnaireVersion.study.name },
  { header: "Versión de screener usada", value: (attempt) => `v${attempt.questionnaireVersion.versionNumber}` },
  { header: "Hash de versión", value: (attempt) => attempt.questionnaireVersion.definitionHash },
  { header: "Nombre", value: (attempt) => attempt.studyParticipant.participantProfile.name },
  { header: "Celular", value: (attempt) => attempt.studyParticipant.participantProfile.phone },
  { header: "Correo", value: (attempt) => attempt.studyParticipant.participantProfile.email },
  { header: "Referencia externa", value: (attempt) => attempt.studyParticipant.participantProfile.externalReference },
  {
    header: "Fecha de registro",
    value: (attempt, context) => formatDateTime(attempt.studyParticipant.participantProfile.createdAt, context.timeZoneIana)
  },
  { header: "Fuente del intento", value: (attempt) => sourceLabel(attempt.source) },
  { header: "ID interno", value: (attempt) => attempt.id },
  { header: "Fecha/hora inicio", value: (attempt, context) => formatDateTime(attempt.startedAt, context.timeZoneIana) },
  { header: "Fecha/hora cierre", value: (attempt, context) => formatDateTime(attempt.completedAt, context.timeZoneIana) },
  { header: "Estado interno", value: (attempt) => attempt.status },
  { header: "Estado visible", value: (attempt) => statusLabelsForAttempt(attempt).label },
  { header: "Resultado visible", value: (attempt) => statusLabelsForAttempt(attempt).resultLabel },
  { header: "Código interno terminación/revisión", value: (attempt) => effectiveReason(attempt).code },
  { header: "Motivo interno", value: (attempt) => effectiveReason(attempt).reason },
  { header: "Entrevistador/aplicador", value: (attempt) => userLabel(attempt.fieldUser) ?? "Portal participante" },
  { header: "Origen", value: (attempt) => attempt.source },
  { header: "Puntaje NSE", value: (attempt) => attempt.nseScore },
  { header: "Clasificación NSE visible", value: (attempt, context) => resolveNseClassLabel(context.definition, attempt.nseClass) },
  { header: "Código NSE interno", value: (attempt) => attempt.nseClass },
  { header: "Estado de revisión de evidencia", value: (attempt) => evidenceReviewStatusLabel(attempt) },
  {
    header: "Fecha de revisión",
    value: (attempt, context) => formatDateTime(attempt.participantScreeningReview?.reviewedAt ?? null, context.timeZoneIana)
  },
  { header: "Supervisor que revisó", value: (attempt) => userLabel(attempt.participantScreeningReview?.reviewedBy ?? null) },
  { header: "Nota interna de revisión", value: (attempt) => attempt.participantScreeningReview?.internalNote ?? "" },
  { header: "Motivo interno rechazo", value: (attempt) => attempt.participantScreeningReview?.rejectionReason ?? "" },
  { header: "Selfie registrada", value: (attempt) => yesNo(selfieCount(attempt) > 0) },
  { header: "Número fotos perfumes", value: (attempt) => perfumePhotoCount(attempt) },
  { header: "Evidencia completa", value: (attempt) => yesNo(selfieCount(attempt) === 1 && perfumePhotoCount(attempt) >= 1) },
  { header: "Folio", value: (attempt) => attempt.participantConfirmation?.folio ?? "" },
  { header: "Código 1", value: (attempt) => referenceCode(attempt, 1) },
  { header: "Código 2", value: (attempt) => referenceCode(attempt, 2) },
  { header: "Código 3", value: (attempt) => referenceCode(attempt, 3) },
  { header: "WhatsApp manual status", value: (attempt) => manualMessageStatusLabel(attempt.participantConfirmation?.manualMessageStatus) },
  {
    header: "Fecha marcado enviado",
    value: (attempt, context) => formatDateTime(attempt.participantConfirmation?.manualMessageMarkedSentAt ?? null, context.timeZoneIana)
  },
  { header: "Usuario que marcó enviado", value: (attempt) => userLabel(attempt.participantConfirmation?.manualMessageMarkedSentBy ?? null) }
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
  const columns = [
    ...baseColumns,
    ...keyAnswerColumns.map<ExportColumn>((column) => ({
      header: column.header,
      value: (attempt, context) => keyAnswerText(attempt, context.definition, column.questionIds)
    }))
  ];
  const rows = attempts.map((attempt) => {
    const definition = parseScreenerDefinition(attempt.questionnaireVersion.definitionJson);
    const context = { definition, timeZoneIana };

    return columns.map((column) => tsvCell(column.value(attempt, context)));
  });
  const header = columns.map((column) => tsvCell(column.header));

  return `\uFEFF${[header, ...rows].map((row) => row.join(TSV_SEPARATOR)).join("\r\n")}\r\n`;
}

function keyAnswerText(attempt: SupervisionAttemptExportRecord, definition: ScreenerDefinition, questionIds: string[]): string {
  const answerByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer.answerJson as ScreenerAnswer]));

  for (const questionId of questionIds) {
    if (!answerByQuestionId.has(questionId)) {
      continue;
    }

    const question = definition.questions.find((item) => item.id === questionId);
    const answer = answerByQuestionId.get(questionId);

    if (answer === undefined) {
      return "";
    }

    return question ? formatAnswer(question, answer) : formatUnknownAnswer(answer);
  }

  return "";
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

    return otherText ? `${base} - Especificación: ${otherText}` : base;
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

function otherTextFromAnswer(answer: ScreenerAnswer): string {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer)
    ? answer.otherText?.trim() ?? ""
    : "";
}

function optionLabel(question: Extract<ScreenerQuestion, { options: unknown[] }>, value: string): string {
  return question.options.find((option) => option.value === value)?.label ?? `Valor registrado: ${value}`;
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

function manualMessageStatusLabel(status: "MARKED_SENT" | "NOT_SENT" | undefined): string {
  if (status === "MARKED_SENT") {
    return "Marcado enviado";
  }

  if (status === "NOT_SENT") {
    return "No enviado";
  }

  return "";
}

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function tsvCell(value: string | number | null | undefined): string {
  return neutralizeFormula(sanitizeTabularValue(value));
}

function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

function sanitizeTabularValue(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\t+/g, " ")
    .replace(/\r\n|\r|\n/g, " ")
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
