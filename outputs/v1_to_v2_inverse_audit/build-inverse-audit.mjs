import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));

const sourceJson = path.join(repoRoot, "outputs", "v1_master_participants_export", "V1_MASTER_PARTICIPANTS_EXPORT.json");
const outputJson = path.join(__dirname, "V1_TO_V2_INVERSE_AUDIT.json");
const outputCsv = path.join(__dirname, "V1_TO_V2_INVERSE_AUDIT.csv");
const outputXlsx = path.join(__dirname, "V1_TO_V2_INVERSE_AUDIT.xlsx");

const specialFolios = new Set([
  "NAV-009",
  "NAV-053",
  "NAV-065",
  "NAV-150",
  "NAV-252",
  "NAV-040",
  "NAV-063",
  "NAV-108",
  "NAV-146"
]);

const localExportDir = path.join(repoRoot, "outputs", "v1_to_v2_export");
const source = JSON.parse(await fs.readFile(sourceJson, "utf8"));
const sheets = source.sheets;
const localExports = await listLocalExports(localExportDir);

const countsByParticipant = buildCounts(sheets);
const rows = sheets.participants.map((participant) => {
  const key = participant.participantIdV1;
  const counts = countsByParticipant.get(key) ?? {};
  const navFolio = participant.navFolio || "";
  const hasLocalExport = navFolio ? localExports.has(navFolio) : false;
  const v2Checked = false;
  const result = "V2_NO_VERIFICADO";
  const note = "No hay conexion V2 configurada en este workspace. Existe solo auditoria V1; el cruce V2 requiere DB/export V2.";
  return {
    V1_FOLIO: navFolio,
    V1_HUT_FOLIO: participant.hutFolio || "",
    V2_FOLIO: "",
    V2_PARTICIPANT_ID: "",
    NOMBRE: participant.name || "",
    TELEFONO: participant.phone || "",
    EMAIL: participant.email || "",
    SCREENING_V1: participant.screeningStatus || participant.screeningResult || "",
    PROTOCOL_V1: inferProtocol(participant),
    CODIGO_1: codeFor(sheets.codes, key, "Codigo 1"),
    CODIGO_2: codeFor(sheets.codes, key, "Codigo 2"),
    CODIGO_3: codeFor(sheets.codes, key, "Codigo 3"),
    RESPUESTAS_V1: counts.answers ?? 0,
    RESPUESTAS_V2: "",
    EVIDENCIAS_V1: counts.evidence ?? 0,
    EVIDENCIAS_V2: "",
    ACTIVIDADES_V1: counts.activities ?? 0,
    ACTIVIDADES_V2: "",
    CLT_V1: participant.cltStarted || "",
    NAVIGO_V1: participant.navigoStarted || "",
    HUT_V1: participant.hutStarted || "",
    ETAPA_V1: participant.currentStage || "",
    CLASIFICACION_V1: participant.operationalClassification || "",
    EXPORT_V1_TO_V2_LOCAL: hasLocalExport ? "SI" : "NO",
    FOLIO_ESPECIAL: specialFolios.has(navFolio) ? "SI" : "NO",
    V2_VERIFICADO: v2Checked ? "SI" : "NO",
    RESULTADO: result,
    NOTA: note
  };
});

const summary = summarize(rows);
const specialRows = rows.filter((row) => row.FOLIO_ESPECIAL === "SI");
const json = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  source: {
    primary: "V1_MASTER_PARTICIPANTS_EXPORT.json",
    v2ConnectionAvailable: false,
    v2Verification: "NOT_AVAILABLE_IN_WORKSPACE"
  },
  summary,
  rows,
  specialRows
};

await fs.mkdir(__dirname, { recursive: true });
await fs.writeFile(outputJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
await fs.writeFile(outputCsv, toCsv(rows), "utf8");

const workbook = await buildWorkbook({ rows, specialRows, summary });
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  summary: "formula error scan"
});
console.log(errors.ndjson);
for (const sheetName of ["RESUMEN", "AUDITORIA_INVERSA", "FOLIOS_ESPECIALES"]) {
  const preview = await workbook.render({ sheetName, range: "A1:K20", scale: 1, format: "png" });
  await fs.writeFile(path.join(__dirname, `${sheetName}_preview.png`), new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputXlsx);

console.log(JSON.stringify({
  outputXlsx,
  outputCsv,
  outputJson,
  summary
}, null, 2));

function buildCounts(sheets) {
  const map = new Map();
  for (const participant of sheets.participants) {
    map.set(participant.participantIdV1, { activities: 0, answers: 0, evidence: 0 });
  }
  for (const activity of sheets.activities) {
    increment(map, activity.participantIdV1, "activities");
  }
  for (const answer of sheets.answers) {
    increment(map, answer.participantIdV1, "answers");
  }
  for (const evidence of sheets.evidence) {
    increment(map, evidence.participantIdV1, "evidence");
  }
  return map;
}

function increment(map, key, field) {
  if (!key) return;
  if (!map.has(key)) map.set(key, { activities: 0, answers: 0, evidence: 0 });
  map.get(key)[field] += 1;
}

function codeFor(codes, participantId, slot) {
  return codes.find((code) => code.participantIdV1 === participantId && code.slot === slot)?.codeValue ?? "";
}

async function listLocalExports(dir) {
  const set = new Set();
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const match = file.match(/^(NAV-\d+)_v1_to_v2\.json$/u);
      if (match) set.add(match[1]);
    }
  } catch {
    // Optional signal only.
  }
  return set;
}

function inferProtocol(participant) {
  if (participant.origin === "HUT_DIRECTO") return "HUT_DIRECTO";
  if (participant.hutFolio || participant.navFolio) return "CLT_NAVIGO_HUT";
  return "";
}

function summarize(rows) {
  const byResult = countBy(rows, "RESULTADO");
  const byV1Classification = countBy(rows, "CLASIFICACION_V1");
  return {
    totalV1: rows.length,
    v2Verified: rows.filter((row) => row.V2_VERIFICADO === "SI").length,
    v2NotVerified: rows.filter((row) => row.V2_VERIFICADO !== "SI").length,
    specialFoliosRequested: specialFolios.size,
    specialFoliosFound: rows.filter((row) => row.FOLIO_ESPECIAL === "SI").length,
    withLocalV1ToV2Export: rows.filter((row) => row.EXPORT_V1_TO_V2_LOCAL === "SI").length,
    byResult,
    byV1Classification
  };
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "SIN_VALOR";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

async function buildWorkbook({ rows, specialRows, summary }) {
  const workbook = Workbook.create();
  addSummarySheet(workbook, summary);
  addRowsSheet(workbook, "AUDITORIA_INVERSA", rows);
  addRowsSheet(workbook, "FOLIOS_ESPECIALES", specialRows);
  addRowsSheet(workbook, "NOTAS", [
    {
      CAMPO: "Alcance",
      VALOR: "La fuente principal V1 fue refrescada desde base. V2 no pudo consultarse porque no existe V2_DATABASE_URL, export V2 ni proyecto V2 local en este workspace."
    },
    {
      CAMPO: "Interpretacion RESULTADO",
      VALOR: "V2_NO_VERIFICADO significa que el participante existe en V1, pero no fue posible validar su representacion real en V2 con los accesos disponibles."
    },
    {
      CAMPO: "Siguiente paso",
      VALOR: "Proporcionar conexion/export de V2 para clasificar COMPLETO, MIGRADO SIN HISTORICO, NO MIGRADO, FOLIO REASIGNADO o POSIBLE DUPLICADO."
    }
  ]);
  return workbook;
}

function addSummarySheet(workbook, summary) {
  const sheet = workbook.worksheets.add("RESUMEN");
  sheet.showGridLines = false;
  const rows = [
    ["Metrica", "Valor"],
    ["Total participantes/fuentes V1", summary.totalV1],
    ["V2 verificados", summary.v2Verified],
    ["V2 no verificados", summary.v2NotVerified],
    ["Folios especiales solicitados", summary.specialFoliosRequested],
    ["Folios especiales encontrados", summary.specialFoliosFound],
    ["Con export local V1->V2 preparado", summary.withLocalV1ToV2Export]
  ];
  sheet.getRangeByIndexes(0, 0, rows.length, 2).values = rows;
  sheet.getRange("A1:B1").format = { fill: "#1F2937", font: { bold: true, color: "#FFFFFF" } };

  const resultRows = [["Resultado", "Cantidad"], ...Object.entries(summary.byResult)];
  sheet.getRangeByIndexes(0, 3, resultRows.length, 2).values = resultRows;
  sheet.getRange("D1:E1").format = { fill: "#7C2D12", font: { bold: true, color: "#FFFFFF" } };

  const classRows = [["Clasificacion V1", "Cantidad"], ...Object.entries(summary.byV1Classification)];
  sheet.getRangeByIndexes(0, 6, classRows.length, 2).values = classRows;
  sheet.getRange("G1:H1").format = { fill: "#065F46", font: { bold: true, color: "#FFFFFF" } };

  sheet.getRange("A10:H12").merge();
  sheet.getRange("A10").values = [["Nota: este reporte deja V2 como no verificado por falta de conexion/export V2 en el entorno. No se modificaron datos."]];
  sheet.getRange("A10").format = { fill: "#FEF3C7", font: { color: "#92400E", bold: true }, wrapText: true };
  sheet.getUsedRange().format.autofitColumns();
  sheet.getUsedRange().format.autofitRows();
}

function addRowsSheet(workbook, sheetName, rows) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const headers = rows[0] ? Object.keys(rows[0]) : ["SIN_DATOS"];
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const range = sheet.getRangeByIndexes(0, 0, matrix.length, headers.length);
  range.values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true
  };
  range.format.borders = { preset: "all", style: "thin", color: "#E5E7EB" };
  range.format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  sheet.getUsedRange().format.autofitColumns();
  sheet.getUsedRange().format.autofitRows();
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/u.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}
