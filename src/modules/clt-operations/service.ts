import {
  getCtlApplicableQuestions,
  getCtlDefinition,
  getCtlQuestions,
  type CtlAnswerLookup,
  type CtlMatrixQuestionDefinition
} from "@/modules/ctl/definition";
import { formatDateTimeMexicoCity, MEXICO_CITY_TIME_ZONE } from "@/shared/utils/date-format";
import type {
  CltOperationsAnswerGroup,
  CltOperationsDashboard,
  CltOperationsDetail,
  CltOperationsExport,
  CltOperationsListItem
} from "./types";

const TSV_CONTENT_TYPE = "text/tab-separated-values; charset=utf-8";
const TSV_SEPARATOR = "\t";
const DEFAULT_TIME_ZONE = MEXICO_CITY_TIME_ZONE;

export function resolveCltProgress(answeredCount: number, questionCount: number): string {
  if (questionCount <= 0) {
    return "Sin preguntas";
  }

  return `${answeredCount}/${questionCount}`;
}

export function resolveCltApplicableProgress(answers: Array<{ questionCode: string; answerValue: unknown }>): {
  answeredCount: number;
  label: string;
  questionCount: number;
} {
  const answerLookup = buildCtlAnswerLookup(answers);
  const applicableQuestions = getCtlApplicableQuestions(getCtlDefinition(), answerLookup);
  const applicableCodes = new Set(applicableQuestions.map((question) => question.code));
  const answeredCodes = new Set(
    answers
      .filter((answer) => applicableCodes.has(answer.questionCode))
      .map((answer) => answer.questionCode)
  );
  const answeredCount = answeredCodes.size;
  const questionCount = applicableQuestions.length;

  return {
    answeredCount,
    label: resolveCltProgress(answeredCount, questionCount),
    questionCount
  };
}

export function formatOperationsDateTime(value: Date | null | undefined, timeZoneIana = DEFAULT_TIME_ZONE): string {
  void timeZoneIana;
  return formatDateTimeMexicoCity(value);
}

export function buildCltAnswerGroups(answers: Array<{ questionCode: string; answerValue: unknown }>): CltOperationsAnswerGroup[] {
  const definition = getCtlDefinition();
  const answerByCode = new Map(answers.map((answer) => [answer.questionCode, answer.answerValue]));

  return definition.sections.map((section) => ({
    answers: section.questions
      .filter((question) => answerByCode.has(question.code))
      .map((question) => ({
        code: question.code,
        label: question.label,
        value: stringifyAnswerValue(answerByCode.get(question.code))
      })),
    sectionId: section.id,
    sectionTitle: section.title
  })).filter((section) => section.answers.length > 0);
}

export function getCltQuestionCount(): number {
  return getCtlQuestions().length;
}

export function stringifyAnswerValue(value: unknown): string {
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

export function buildCltOperationsTsv(input: {
  dashboard: CltOperationsDashboard;
  now?: Date;
}): CltOperationsExport {
  const rows = [
    [
      "Folio",
      "Participante",
      "Encuestador",
      "Estado CTL",
      "Progreso CTL",
      "T0",
      "Navigo",
      "WhatsApp",
      "HUT"
    ],
    ...input.dashboard.participants.map((participant) => [
      participant.folio,
      participant.participantName,
      participant.interviewer ?? "",
      participant.cltStatus,
      participant.cltProgressLabel,
      formatOperationsDateTime(participant.t0, input.dashboard.study.timeZoneIana),
      navigoStatusLabel(participant),
      whatsappStatusLabel(participant),
      hutStatusLabel(participant)
    ])
  ];

  return {
    body: buildTsv(rows),
    contentType: TSV_CONTENT_TYPE,
    filename: `${sanitizeFilenamePart(input.dashboard.study.code)}_clt_operaciones_${formatDateForFilename(
      input.now ?? new Date(),
      input.dashboard.study.timeZoneIana
    )}.tsv`,
    rowCount: input.dashboard.participants.length
  };
}

export function buildCltAnswersTsv(input: {
  dashboard: CltOperationsDashboard;
  details: CltOperationsDetail[];
  now?: Date;
}): CltOperationsExport {
  const questionCodes = collectAnswerQuestionCodes(input.details);
  const traceabilityColumns = buildCltTraceabilityColumns();
  const rows = [
    [
      "Folio",
      "Participante",
      "Estado CTL",
      "Encuestador",
      ...traceabilityColumns.map((column) => column.header),
      ...questionCodes
    ],
    ...input.details.map((detail) => {
      const answerByCode = new Map(
        detail.answerGroups.flatMap((group) => group.answers.map((answer) => [answer.code, answer.value] as const))
      );
      const rawAnswerByCode = new Map(detail.rawAnswers.map((answer) => [answer.questionCode, answer.answerValue] as const));
      const traceabilityValues = buildCltTraceabilityValues(detail, rawAnswerByCode, traceabilityColumns);

      return [
        detail.folio,
        detail.participantName,
        detail.cltStatus,
        detail.interviewer ?? "",
        ...traceabilityValues,
        ...questionCodes.map((code) => answerByCode.get(code) ?? "")
      ];
    })
  ];

  return {
    body: buildTsv(rows),
    contentType: TSV_CONTENT_TYPE,
    filename: `${sanitizeFilenamePart(input.dashboard.study.code)}_clt_respuestas_${formatDateForFilename(
      input.now ?? new Date(),
      input.dashboard.study.timeZoneIana
    )}.tsv`,
    rowCount: input.details.length
  };
}

export function buildTsv(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(tsvCell).join(TSV_SEPARATOR)).join("\r\n")}\r\n`;
}

export function navigoStatusLabel(participant: CltOperationsListItem): string {
  if (!participant.navigoLinkToken && participant.navigoActivities.length === 0) {
    return "Sin preparar";
  }

  const completed = participant.navigoActivities.filter((activity) => activity.status === "COMPLETED").length;
  return `${completed}/${participant.navigoActivities.length} actividades`;
}

export function whatsappStatusLabel(participant: CltOperationsListItem): string {
  if (participant.whatsapp.messageCount === 0) {
    return "Sin WhatsApp";
  }

  return participant.whatsapp.lastStatus ?? "Registrado";
}

export function hutStatusLabel(participant: CltOperationsListItem): string {
  if (!participant.hut.id) {
    return "Sin HUT";
  }

  return `${participant.hut.protocolVersion ?? "HUT"} / ${participant.hut.questionnaireStatus ?? participant.hut.status ?? "Sin estado"}`;
}

function collectAnswerQuestionCodes(details: CltOperationsDetail[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const question of getCtlQuestions()) {
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

type CltTraceabilityColumn = {
  header: string;
  read: (input: {
    detail: CltOperationsDetail;
    rawAnswerByCode: Map<string, unknown>;
  }) => string | number | null | undefined;
};

function buildCltTraceabilityColumns(): CltTraceabilityColumn[] {
  const definition = getCtlDefinition();
  const matrixColumns: CltTraceabilityColumn[] = getCtlQuestions(definition)
    .filter((question): question is CtlMatrixQuestionDefinition => question.type === "MATRIX")
    .flatMap((question) => [
      {
        header: `${question.code}_ATTRIBUTE_ORDER`,
        read: ({ detail }: { detail: CltOperationsDetail }) => getShownMatrixRowCodes(question, detail.id).join("|")
      },
      ...question.rows.map((row) => ({
        header: `${question.code}_${row.code}`,
        read: ({ rawAnswerByCode }: { rawAnswerByCode: Map<string, unknown> }) =>
          readMatrixCell(rawAnswerByCode.get(question.code), row.code)
      }))
    ]);

  return [
    {
      header: "TRI1_POS1",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P1"), "PR1")
    },
    {
      header: "TRI1_POS2",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P1"), "PR2")
    },
    {
      header: "TRI1_POS3",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P1"), "PR3")
    },
    {
      header: "TRI1_DELIVERY_ORDER",
      read: ({ rawAnswerByCode }) => readTriangularDeliveryOrder(rawAnswerByCode.get("P1"))
    },
    {
      header: "TRI1_SELECTED",
      read: ({ rawAnswerByCode }) => readTriangularSelectedKey(rawAnswerByCode.get("P1"))
    },
    {
      header: "TRI1_SELECTED_POSITION",
      read: ({ rawAnswerByCode }) => readTriangularSelectedPosition(rawAnswerByCode.get("P1"))
    },
    {
      header: "TRI1_CORRECT",
      read: ({ rawAnswerByCode }) => readTriangularCorrect(rawAnswerByCode.get("P1"))
    },
    {
      header: "TRI2_POS1",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P3"), "PR1")
    },
    {
      header: "TRI2_POS2",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P3"), "PR2")
    },
    {
      header: "TRI2_POS3",
      read: ({ rawAnswerByCode }) => readTriangularPosition(rawAnswerByCode.get("P3"), "PR3")
    },
    {
      header: "TRI2_DELIVERY_ORDER",
      read: ({ rawAnswerByCode }) => readTriangularDeliveryOrder(rawAnswerByCode.get("P3"))
    },
    {
      header: "TRI2_SELECTED",
      read: ({ rawAnswerByCode }) => readTriangularSelectedKey(rawAnswerByCode.get("P3"))
    },
    {
      header: "TRI2_SELECTED_POSITION",
      read: ({ rawAnswerByCode }) => readTriangularSelectedPosition(rawAnswerByCode.get("P3"))
    },
    {
      header: "TRI2_CORRECT",
      read: ({ rawAnswerByCode }) => readTriangularCorrect(rawAnswerByCode.get("P3"))
    },
    {
      header: "EVA1_PRODUCT",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA1_TRACE"), "productCode")
    },
    {
      header: "EVA1_ORDER",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA1_TRACE"), "order")
    },
    {
      header: "EVA1_ARM",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA1_TRACE"), "armLabel")
    },
    {
      header: "EVA2_PRODUCT",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA2_TRACE"), "productCode")
    },
    {
      header: "EVA2_ORDER",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA2_TRACE"), "order")
    },
    {
      header: "EVA2_ARM",
      read: ({ rawAnswerByCode }) => readProductTraceValue(rawAnswerByCode.get("SYS_EVA2_TRACE"), "armLabel")
    },
    ...matrixColumns
  ];
}

function buildCltTraceabilityValues(
  detail: CltOperationsDetail,
  rawAnswerByCode: Map<string, unknown>,
  columns: CltTraceabilityColumn[]
): Array<string | number | null | undefined> {
  return columns.map((column) => column.read({ detail, rawAnswerByCode }));
}

function readTriangularSelectedPosition(value: unknown): string {
  if (isRecord(value)) {
    return normalizeExportValue(value.selectedPosition);
  }

  return normalizeExportValue(value);
}

function readTriangularSelectedKey(value: unknown): string {
  if (isRecord(value) && typeof value.selectedKey !== "undefined") {
    return normalizeExportValue(value.selectedKey);
  }

  return "";
}

function readTriangularPosition(value: unknown, position: "PR1" | "PR2" | "PR3"): string {
  if (!isRecord(value) || !isRecord(value.positions)) {
    return "";
  }

  return normalizeExportValue(value.positions[position]);
}

function readTriangularDeliveryOrder(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.deliveryOrder)) {
    return "";
  }

  return value.deliveryOrder.map(normalizeExportValue).filter(Boolean).join("|");
}

function readTriangularCorrect(value: unknown): string | number {
  if (isRecord(value) && (value.correct === 0 || value.correct === 1 || value.correct === "0" || value.correct === "1")) {
    return String(value.correct);
  }

  return "";
}

function readProductTraceValue(value: unknown, key: "armLabel" | "order" | "productCode"): string | number {
  if (!isRecord(value)) {
    return "";
  }

  const field = value[key];
  if (key === "order" && typeof field === "number") {
    return field;
  }

  return normalizeExportValue(field);
}

function readMatrixCell(value: unknown, rowCode: string): string {
  if (!isRecord(value)) {
    return "";
  }

  return normalizeExportValue(value[rowCode]);
}

function getShownMatrixRowCodes(question: CtlMatrixQuestionDefinition, sessionId: string): string[] {
  const rows = question.randomizeRows ? stableShuffle(question.rows, `${sessionId}:${question.code}`) : question.rows;
  return rows.map((row) => row.code);
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

function buildCtlAnswerLookup(answers: Array<{ questionCode: string; answerValue: unknown }>): CtlAnswerLookup {
  return Object.fromEntries(answers.map((answer) => [answer.questionCode, answer.answerValue]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeExportValue(value: unknown): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  return String(value);
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
