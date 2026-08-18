import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIT_FILE = path.join(__dirname, "auditoria_filtros_no_pasan_v1.xlsx");
const OUTSIDE_JSON = path.join(__dirname, "candidatos_migracion_fuera_de_lista.json");
const OUTPUT_FILE = path.join(__dirname, "lista_completa_candidatos_migracion_v2.xlsx");
const PREVIEW_FILE = path.join(__dirname, "lista_completa_candidatos_migracion_v2_preview.png");

const COLUMNS = [
  "NAV_FOLIO",
  "HUT_FOLIO",
  "NOMBRE",
  "TELEFONO",
  "EMAIL",
  "EN_LISTA_FILTROS_NO_PASAN",
  "SCREENING_STATUS",
  "OPERATIONAL_STATUS",
  "PROTOCOL",
  "CODES_COUNT",
  "ACTIVITIES_COUNT",
  "ANSWERS_COUNT",
  "EVIDENCE_COUNT",
  "CURRENT_STAGE",
  "NOTA"
];

const auditWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(AUDIT_FILE));
const inListRows = readSheetRows(auditWorkbook, "MIGRAR_V2").map((row) => ({
  NAV_FOLIO: row.NAV_FOLIO,
  HUT_FOLIO: row.HUT_FOLIO,
  NOMBRE: row.NOMBRE,
  TELEFONO: row.TELEFONO,
  EMAIL: row.EMAIL,
  EN_LISTA_FILTROS_NO_PASAN: "SI",
  SCREENING_STATUS: row.SCREENING_STATUS,
  OPERATIONAL_STATUS: null,
  PROTOCOL: row.PROTOCOL,
  CODES_COUNT: row.CODES_COUNT,
  ACTIVITIES_COUNT: row.ACTIVITIES_COUNT,
  ANSWERS_COUNT: row.ANSWERS_COUNT,
  EVIDENCE_COUNT: row.EVIDENCE_COUNT,
  CURRENT_STAGE: row.CURRENT_STAGE,
  NOTA: row.IDENTITY_WARNING || null
}));

const outsidePayload = JSON.parse(await fs.readFile(OUTSIDE_JSON, "utf8"));
const outsideRows = outsidePayload.candidatesNotInInputRows.map((row) => ({
  NAV_FOLIO: row.navFolio,
  HUT_FOLIO: row.hutFolio,
  NOMBRE: row.name,
  TELEFONO: row.phone,
  EMAIL: row.email,
  EN_LISTA_FILTROS_NO_PASAN: "NO",
  SCREENING_STATUS: row.screeningStatus,
  OPERATIONAL_STATUS: row.operationalStatus,
  PROTOCOL: row.protocol,
  CODES_COUNT: row.codesCount,
  ACTIVITIES_COUNT: row.activitiesCount,
  ANSWERS_COUNT: row.answersCount,
  EVIDENCE_COUNT: row.evidenceCount,
  CURRENT_STAGE: row.currentStage,
  NOTA: null
}));

const allRows = [...inListRows, ...outsideRows].sort((a, b) => folioNumber(a.NAV_FOLIO) - folioNumber(b.NAV_FOLIO));
const summaryRows = [
  ["Total candidatos a migrar", allRows.length],
  ["Estaban en FILTROS QUE NO PASAN", inListRows.length],
  ["No estaban en FILTROS QUE NO PASAN", outsideRows.length]
];

const workbook = Workbook.create();
addSummarySheet(workbook, summaryRows);
addRowsSheet(workbook, "LISTA_COMPLETA", allRows);
addRowsSheet(workbook, "EN_LISTA_FILTROS", allRows.filter((row) => row.EN_LISTA_FILTROS_NO_PASAN === "SI"));
addRowsSheet(workbook, "FUERA_DE_LISTA", allRows.filter((row) => row.EN_LISTA_FILTROS_NO_PASAN === "NO"));

const inspection = await workbook.inspect({
  kind: "table",
  sheetId: "LISTA_COMPLETA",
  tableMaxRows: 8,
  tableMaxCols: 8,
  maxChars: 3000
});
console.log(inspection.ndjson);

const preview = await workbook.render({
  sheetName: "LISTA_COMPLETA",
  range: "A1:O25",
  scale: 1,
  format: "png"
});
await fs.writeFile(PREVIEW_FILE, new Uint8Array(await preview.arrayBuffer()));

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 1000
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_FILE);
console.log(JSON.stringify({ output: OUTPUT_FILE, total: allRows.length, inList: inListRows.length, outside: outsideRows.length }, null, 2));

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getUsedRange(true)?.values ?? [];
  const headers = values[0] ?? [];
  return values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

function addSummarySheet(workbook, rows) {
  const sheet = workbook.worksheets.add("RESUMEN");
  sheet.showGridLines = false;
  sheet.getRange("A1:B1").values = [["Resumen", "Cantidad"]];
  sheet.getRangeByIndexes(1, 0, rows.length, 2).values = rows;
  sheet.getRange("A1:B1").format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", name: "Aptos", size: 11 }
  };
  sheet.getRangeByIndexes(0, 0, rows.length + 1, 2).format.borders = {
    preset: "insideHorizontal",
    style: "thin",
    color: "#E5E7EB"
  };
  sheet.getRange("A:B").format.autofitColumns();
}

function addRowsSheet(workbook, sheetName, rows) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const matrix = [COLUMNS, ...rows.map((row) => COLUMNS.map((column) => row[column] ?? null))];
  sheet.getRangeByIndexes(0, 0, matrix.length, COLUMNS.length).values = matrix;
  sheet.getRangeByIndexes(0, 0, matrix.length, COLUMNS.length).format = {
    font: { name: "Aptos", size: 10 },
    wrapText: false
  };
  sheet.getRangeByIndexes(0, 0, 1, COLUMNS.length).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", name: "Aptos", size: 10 },
    wrapText: true
  };
  sheet.freezePanes.freezeRows(1);
  const table = sheet.tables.add(sheet.getRangeByIndexes(0, 0, matrix.length, COLUMNS.length), true, `${sheetName.replace(/[^A-Za-z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  sheet.getRangeByIndexes(0, 0, matrix.length, COLUMNS.length).format.autofitColumns();
  for (let column = 0; column < COLUMNS.length; column += 1) {
    const width = ["NOMBRE", "EMAIL", "NOTA"].includes(COLUMNS[column]) ? 30 : 18;
    sheet.getRangeByIndexes(0, column, 1, 1).format.columnWidth = width;
  }
}

function folioNumber(value) {
  return Number(String(value ?? "").match(/\d+/)?.[0] ?? 0);
}
