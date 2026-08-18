import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const reportPath = path.join(repoRoot, "tmp", "vanguardia_recovered_folios_audit.json");
const outputPath = path.join(repoRoot, "tmp", "VANGUARDIA_FOLIOS_RECUPERADOS_AUDIT.xlsx");
const previewPath = path.join(repoRoot, "tmp", "VANGUARDIA_FOLIOS_RECUPERADOS_AUDIT_preview.png");

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const workbook = Workbook.create();

const summary = workbook.worksheets.add("RESUMEN");
summary.showGridLines = false;
summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["AUDITORIA PANELISTAS VANGUARDIA - FOLIOS RECUPERADOS"]];
summary.getRange("A1").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF", size: 14 },
};
summary.getRange("A3:B8").values = [
  ["Estudio", report.metadata.studyCode],
  ["Generado", report.metadata.generatedAt],
  ["Registros analizados", report.summary.total],
  ["Encontrados en V1", report.summary.v1Found],
  ["No encontrados en V1", report.summary.v1Missing],
  ["V2 verificado", report.v2.checked ? "SI" : "NO"],
];
summary.getRange("A3:A8").format = { fill: "#E5E7EB", font: { bold: true } };
summary.getRange("D3:E6").values = [
  ["Clasificacion", "Cantidad"],
  ["A) LISTO PARA MIGRAR", report.summary.byClassification["A) LISTO PARA MIGRAR"] ?? 0],
  ["B) FOLIO OCUPADO POR PRUEBA - LIBERAR", report.summary.byClassification["B) FOLIO OCUPADO POR PRUEBA - LIBERAR"] ?? 0],
  ["C) FOLIO OCUPADO REAL - REVISAR", report.summary.byClassification["C) FOLIO OCUPADO REAL - REVISAR"] ?? 0],
];
summary.getRange("D3:E3").format = { fill: "#2563EB", font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A10:F12").values = [
  ["Nota V2"],
  [report.v2.reason],
  [report.v2.requiredForFinalOccupationCheck],
];
summary.getRange("A10:F10").merge();
summary.getRange("A11:F11").merge();
summary.getRange("A12:F12").merge();
summary.getRange("A10:F12").format = { fill: "#FEF3C7", font: { color: "#92400E" }, wrapText: true };

const auditHeaders = [
  "NAV_FOLIO",
  "HUT_FOLIO",
  "NOMBRE",
  "TELEFONO",
  "EMAIL",
  "CODIGO_1",
  "CODIGO_2",
  "CODIGO_3",
  "SCREENING_STATUS",
  "SCREENING_COMPLETED_AT",
  "OPERATIONAL_STATUS",
  "PROTOCOLO",
  "CLT_INICIADO",
  "CLT_RESPUESTAS",
  "NAVIGO_ACTIVIDADES",
  "NAVIGO_RESPUESTAS",
  "HUT_INICIADO",
  "HUT_FOTOS",
  "HUT_RESPUESTAS",
  "EVIDENCIAS_TOTAL",
  "V2_OCUPACION",
  "CLASIFICACION",
  "RECOMENDACION"
];
const auditRows = report.rows.map((row) => [
  row.folio,
  row.v1.hutFolio ?? "",
  row.v1.name ?? "",
  row.v1.phone ?? "",
  row.v1.email ?? "",
  row.v1.codes.codigo1 ?? "",
  row.v1.codes.codigo2 ?? "",
  row.v1.codes.codigo3 ?? "",
  row.v1.screening.latestStatus ?? row.v1.screening.aggregateStatus ?? "",
  row.v1.screening.completedAt ?? "",
  row.v1.screening.operationalStatus ?? "",
  row.v1.protocol ?? "",
  row.v1.progress.cltStarted ? "SI" : "NO",
  row.v1.progress.cltAnswers,
  row.v1.progress.navigoActivities,
  row.v1.progress.navigoResponses,
  row.v1.progress.hutStarted ? "SI" : "NO",
  row.v1.progress.hutPhotos,
  row.v1.progress.hutAnswers,
  row.v1.progress.evidenceCount,
  row.v2.occupation,
  row.classification,
  row.recommendation
]);
writeSheet(workbook, "AUDITORIA_COMPLETA", auditHeaders, auditRows);

const activitiesHeaders = ["NAV_FOLIO", "TIPO", "CODIGO", "STATUS", "STARTED_AT", "SCHEDULED_AT", "COMPLETED_AT"];
const activitiesRows = report.rows.flatMap((row) =>
  row.v1.activities.map((activity) => [
    row.folio,
    activity.kind,
    activity.code ?? "",
    activity.status ?? "",
    activity.startedAt ?? "",
    activity.scheduledAt ?? "",
    activity.completedAt ?? "",
  ])
);
writeSheet(workbook, "ACTIVIDADES_V1", activitiesHeaders, activitiesRows);

const answersHeaders = ["NAV_FOLIO", "MODULO", "ACTIVIDAD", "QUESTION_KEY", "ANSWER_JSON", "ANSWERED_AT"];
const answersRows = report.rows.flatMap((row) => {
  const groups = row.v1.answers;
  return [
    ...groups.screening.map((answer) => [row.folio, "SCREENING", "", answer.questionKey, JSON.stringify(answer.answer), answer.answeredAt ?? ""]),
    ...groups.clt.map((answer) => [row.folio, "CLT", "", answer.questionKey, JSON.stringify(answer.answer), answer.answeredAt ?? ""]),
    ...groups.navigo.map((answer) => [row.folio, "NAVIGO", answer.activityCode, answer.questionKey, JSON.stringify(answer.answer), answer.answeredAt ?? ""]),
    ...groups.hut.map((answer) => [row.folio, "HUT", "", answer.questionKey, JSON.stringify(answer.answer), answer.answeredAt ?? ""]),
  ];
});
writeSheet(workbook, "RESPUESTAS_V1", answersHeaders, answersRows);

const evidenceHeaders = ["NAV_FOLIO", "SOURCE", "TYPE_PHASE_SLOT", "PRODUCT", "CAPTURED_AT", "FILE_REFERENCE", "STATUS"];
const evidenceRows = report.rows.flatMap((row) =>
  row.v1.evidence.map((evidence) => [
    row.folio,
    evidence.source,
    evidence.type ?? evidence.phase ?? evidence.useDayNumber ?? "",
    evidence.product ?? "",
    evidence.capturedAt ?? "",
    evidence.file ?? "",
    evidence.status ?? "",
  ])
);
writeSheet(workbook, "EVIDENCIAS_V1", evidenceHeaders, evidenceRows);

const rotationsHeaders = ["NAV_FOLIO", "ROTACION_CLT", "ROTACION_PLAN", "TRIANGULAR_JSON", "HUT_EVA1", "HUT_EVA2"];
const rotationsRows = report.rows.map((row) => [
  row.folio,
  row.v1.rotations.clt?.rotationCode ?? "",
  row.v1.rotations.clt?.rotationPlanName ?? "",
  row.v1.rotations.triangular ? JSON.stringify(row.v1.rotations.triangular) : "",
  row.v1.rotations.hut?.eva1 ?? "",
  row.v1.rotations.hut?.eva2 ?? "",
]);
writeSheet(workbook, "ROTACIONES_V1", rotationsHeaders, rotationsRows);

for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  used.format.autofitColumns();
  used.format.autofitRows();
}

const preview = await workbook.render({
  sheetName: "RESUMEN",
  autoCrop: "all",
  scale: 1,
  format: "png"
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan"
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath }, null, 2));

function writeSheet(workbookRef, sheetName, headers, rows) {
  const sheet = workbookRef.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const matrix = [headers, ...rows];
  const range = sheet.getRangeByIndexes(0, 0, matrix.length, headers.length);
  range.values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: "#1F2937",
    font: { bold: true, color: "#FFFFFF" },
  };
  range.format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  range.format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
}
