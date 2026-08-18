import fs from "node:fs";

const jsonPath = "outputs/v1_to_v2_remaining_audit/V1_TO_V2_REMAINING_MIGRATION_AUDIT.json";
const csvPath = "outputs/v1_to_v2_remaining_audit/V1_TO_V2_REMAINING_MIGRATION_AUDIT.csv";

const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
report.metadata.manualReleaseFolios = [...new Set([...(report.metadata.manualReleaseFolios ?? []), "NAV-003"])];

const nav003 = report.rows.find((row) => row.NAV_FOLIO === "NAV-003");
if (!nav003) {
  throw new Error("NAV-003 not found in audit report.");
}

nav003.categoriaMigracion = "LIBERAR_FOLIO";
nav003.accionRecomendada = "Liberar folio: prueba interna autorizada manualmente; no migrar a V2";
nav003.motivoExcepcionManual = "Folio utilizado para prueba interna";

report.summary.migrarAvance = report.rows.filter((row) => row.categoriaMigracion === "MIGRAR_AVANCE").length;
report.summary.migrarScreening = report.rows.filter((row) => row.categoriaMigracion === "MIGRAR_SCREENING").length;
report.summary.noMigrar = report.rows.filter((row) => row.categoriaMigracion === "NO_MIGRAR").length;
report.summary.liberarFolio = report.rows.filter((row) => row.categoriaMigracion === "LIBERAR_FOLIO").length;
report.summary.manualReleaseFolios = report.metadata.manualReleaseFolios;
report.summary.totalFoliosLiberacion = report.summary.foliosLiberacionExcluidos + report.summary.liberarFolio;

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const headers = [
  "NAV_FOLIO",
  "HUT_FOLIO",
  "Nombre",
  "Categoria migracion",
  "Ultima actividad",
  "Respuestas existentes",
  "Accion recomendada",
  "Telefono",
  "Email",
  "Screening",
  "Fecha aprobacion",
  "CLT iniciado",
  "CLT respuestas",
  "CLT completado",
  "Navigo iniciado",
  "Navigo respuestas",
  "Navigo completado",
  "HUT iniciado",
  "HUT etapa actual",
  "HUT ultima actividad",
  "Codigo 1",
  "Codigo 2",
  "Codigo 3",
  "Motivo excepcion manual"
];

const keys = [
  "NAV_FOLIO",
  "HUT_FOLIO",
  "nombre",
  "categoriaMigracion",
  "ultimaActividad",
  "respuestasExistentes",
  "accionRecomendada",
  "telefono",
  "email",
  "screeningResultado",
  "fechaAprobacion",
  "cltIniciado",
  "cltRespuestas",
  "cltCompletado",
  "navigoIniciado",
  "navigoRespuestas",
  "navigoCompletado",
  "hutIniciado",
  "hutEtapaActual",
  "hutUltimaActividad",
  "codigo1",
  "codigo2",
  "codigo3",
  "motivoExcepcionManual"
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csv = [
  headers.join(","),
  ...report.rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))
].join("\n");

fs.writeFileSync(csvPath, `${csv}\n`);

console.log(JSON.stringify(report.summary, null, 2));
