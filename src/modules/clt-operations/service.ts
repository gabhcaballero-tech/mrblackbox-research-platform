import { getCtlDefinition, getCtlQuestions } from "@/modules/ctl/definition";
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
  const rows = [
    ["Folio", "Participante", "Estado CTL", "Encuestador", ...questionCodes],
    ...input.details.map((detail) => {
      const answerByCode = new Map(
        detail.answerGroups.flatMap((group) => group.answers.map((answer) => [answer.code, answer.value] as const))
      );

      return [
        detail.folio,
        detail.participantName,
        detail.cltStatus,
        detail.interviewer ?? "",
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
