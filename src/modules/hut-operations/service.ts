import { getHutQuestions, getHutV5Definition } from "@/modules/hut/definition";
import { formatDateTimeMexicoCity, MEXICO_CITY_TIME_ZONE } from "@/shared/utils/date-format";
import type {
  HutOperationsAnswerGroup,
  HutOperationsDashboard,
  HutOperationsDetail,
  HutOperationsExport,
  HutOperationsTimelineItem
} from "./types";

const TSV_CONTENT_TYPE = "text/tab-separated-values; charset=utf-8";
const TSV_SEPARATOR = "\t";
const DEFAULT_TIME_ZONE = MEXICO_CITY_TIME_ZONE;

const HUT_MATRIX_EXPORT_COLUMNS = [
  {
    columnCode: "P10A_ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO",
    questionCode: "HUT_EVA1_ATRIBUTOS",
    rowCode: "ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO"
  },
  {
    columnCode: "P10A_REFLEJA_MI_PERSONALIDAD",
    questionCode: "HUT_EVA1_ATRIBUTOS",
    rowCode: "REFLEJA_MI_PERSONALIDAD"
  },
  {
    columnCode: "P27_ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO",
    questionCode: "HUT_P27_COMPARATIVA_ATRIBUTOS",
    rowCode: "ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO"
  },
  {
    columnCode: "P27_REFLEJA_MI_PERSONALIDAD",
    questionCode: "HUT_P27_COMPARATIVA_ATRIBUTOS",
    rowCode: "REFLEJA_MI_PERSONALIDAD"
  }
] as const;

export function resolveHutQuestionnaireProgress(answeredCount: number, questionCount: number): string {
  if (questionCount <= 0) {
    return "Sin cuestionario";
  }

  return `${answeredCount}/${questionCount}`;
}

export function formatHutOperationsDateTime(value: Date | null | undefined, timeZoneIana = DEFAULT_TIME_ZONE): string {
  void timeZoneIana;
  return formatDateTimeMexicoCity(value);
}

export function buildHutAnswerGroups(
  answers: Array<{ answerJson: unknown; questionCode: string }>
): HutOperationsAnswerGroup[] {
  const definition = getHutV5Definition();
  const answerByCode = new Map(answers.map((answer) => [answer.questionCode, answer.answerJson]));

  return definition.sections.map((section) => ({
    answers: section.questions
      .filter((question) => answerByCode.has(question.code))
      .map((question) => ({
        code: question.code,
        label: question.label,
        value: stringifyHutAnswerValue(answerByCode.get(question.code))
      })),
    sectionId: section.id,
    sectionTitle: section.title
  })).filter((section) => section.answers.length > 0);
}

export function getHutQuestionCount(): number {
  return getHutQuestions().length;
}

export function stringifyHutAnswerValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function latestTimelineDate(items: HutOperationsTimelineItem[]): Date | null {
  return [...items].sort((left, right) => right.at.getTime() - left.at.getTime())[0]?.at ?? null;
}

export function buildHutOperationsTsv(input: {
  dashboard: HutOperationsDashboard;
  now?: Date;
}): HutOperationsExport {
  const rows = [
    [
      "Folio HUT",
      "Folio NAV",
      "Participante",
      "Origen",
      "Protocolo",
      "Fase actual",
      "Progreso cuestionario",
      "Fotos",
      "Ultima actividad"
    ],
    ...input.dashboard.participants.map((participant) => [
      participant.hutFolio,
      participant.navFolio ?? "",
      participant.participant.name,
      participant.origin,
      participant.protocolVersion,
      participant.currentPhase,
      participant.questionnaireProgressLabel,
      participant.photoCount,
      formatHutOperationsDateTime(participant.lastActivityAt, input.dashboard.study.timeZoneIana)
    ])
  ];

  return {
    body: buildTsv(rows),
    contentType: TSV_CONTENT_TYPE,
    filename: `${sanitizeFilenamePart(input.dashboard.study.code)}_hut_operaciones_${formatDateForFilename(
      input.now ?? new Date(),
      input.dashboard.study.timeZoneIana
    )}.tsv`,
    rowCount: input.dashboard.participants.length
  };
}

export function buildHutAnswersTsv(input: {
  dashboard: HutOperationsDashboard;
  details: HutOperationsDetail[];
  now?: Date;
}): HutOperationsExport {
  const questionCodes = collectAnswerQuestionCodes(input.details);
  const exportColumns = expandHutAnswerExportColumns(questionCodes);
  const rows = [
    ["Folio HUT", "Folio NAV", "Participante", "Origen", "Protocolo", "Estado cuestionario", ...exportColumns],
    ...input.details.map((detail) => {
      const answerByCode = new Map(
        detail.answerGroups.flatMap((group) => group.answers.map((answer) => [answer.code, answer.value] as const))
      );

      return [
        detail.hutFolio,
        detail.navFolio ?? "",
        detail.participant.name,
        detail.origin,
        detail.protocolVersion,
        detail.questionnaireStatus ?? "",
        ...exportColumns.map((code) => resolveHutAnswerExportValue(code, answerByCode))
      ];
    })
  ];

  return {
    body: buildTsv(rows),
    contentType: TSV_CONTENT_TYPE,
    filename: `${sanitizeFilenamePart(input.dashboard.study.code)}_hut_respuestas_${formatDateForFilename(
      input.now ?? new Date(),
      input.dashboard.study.timeZoneIana
    )}.tsv`,
    rowCount: input.details.length
  };
}

export function buildTsv(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(tsvCell).join(TSV_SEPARATOR)).join("\r\n")}\r\n`;
}

function collectAnswerQuestionCodes(details: HutOperationsDetail[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const question of getHutQuestions()) {
    seen.add(question.code);
    ordered.push(question.code);
  }

  for (const detail of details) {
    for (const group of detail.answerGroups) {
      for (const answer of group.answers) {
        if (!seen.has(answer.code)) {
          seen.add(answer.code);
          ordered.push(answer.code);
        }
      }
    }
  }

  return ordered;
}

function expandHutAnswerExportColumns(questionCodes: string[]): string[] {
  return questionCodes.flatMap((questionCode) => [
    questionCode,
    ...HUT_MATRIX_EXPORT_COLUMNS
      .filter((column) => column.questionCode === questionCode)
      .map((column) => column.columnCode)
  ]);
}

function resolveHutAnswerExportValue(columnCode: string, answerByCode: Map<string, string>): string {
  const matrixColumn = HUT_MATRIX_EXPORT_COLUMNS.find((column) => column.columnCode === columnCode);

  if (!matrixColumn) {
    return answerByCode.get(columnCode) ?? "";
  }

  return getMatrixRowAnswerValue(answerByCode.get(matrixColumn.questionCode), matrixColumn.rowCode);
}

function getMatrixRowAnswerValue(serializedAnswer: string | undefined, rowCode: string): string {
  if (!serializedAnswer) {
    return "";
  }

  try {
    const parsed = JSON.parse(serializedAnswer) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "";
    }

    const value = (parsed as Record<string, unknown>)[rowCode];

    return value === null || value === undefined ? "" : stringifyHutAnswerValue(value);
  } catch {
    return "";
  }
}

function tsvCell(value: string | number | null | undefined): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "estudio";
}

function formatDateForFilename(value: Date, timeZoneIana: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timeZoneIana || DEFAULT_TIME_ZONE,
    year: "numeric"
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${read("year")}-${read("month")}-${read("day")}`;
}
