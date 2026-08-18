import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const sourceFile = path.join(repoRoot, "outputs", "v1_to_v2_partial_export", "V1_TO_V2_SCREENING_APPROVED_NO_CLT_ALL.json");
const outputFile = path.join(__dirname, "NAV-009_V1_TO_V2_SCREENING_APPROVED_NO_CLT.json");
const outputCsv = path.join(__dirname, "NAV-009_V1_TO_V2_SCREENING_APPROVED_NO_CLT.csv");

const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const participant = source.participants.find((item) => item.identificacion?.NAV_FOLIO === "NAV-009");

if (!participant) {
  throw new Error("NAV-009 no existe en el export parcial V1 -> V2.");
}

const payload = {
  metadata: {
    exportType: "V1_TO_V2_SINGLE_SCREENING_APPROVED_NO_CLT",
    sourceStudyCode: source.metadata.sourceStudyCode,
    sourceStudyName: source.metadata.sourceStudyName,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    includedFolios: ["NAV-009"],
    criteria: source.metadata.criteria,
    excludedData: source.metadata.excludedData
  },
  participants: [participant]
};

await fs.mkdir(__dirname, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await fs.writeFile(outputCsv, toCsv(participant), "utf8");

console.log(
  JSON.stringify(
    {
      outputFile,
      outputCsv,
      participant
    },
    null,
    2
  )
);

function toCsv(item) {
  const headers = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "Nombre",
    "Telefono",
    "Email",
    "Reclutador",
    "Screening",
    "ScreeningResult",
    "FechaAprobacion",
    "Codigo1",
    "Codigo2",
    "Codigo3",
    "CltIniciado",
    "CltRespuestas",
    "ResultadoMigracion"
  ];
  const row = [
    item.identificacion.NAV_FOLIO,
    item.identificacion.HUT_FOLIO ?? "",
    item.datos.nombre,
    item.datos.telefono,
    item.datos.email ?? "",
    item.datos.reclutador ?? "",
    item.screening.screeningStatus,
    item.screening.screeningResult,
    item.screening.fechaAprobacion,
    item.codigos.codigo1,
    item.codigos.codigo2,
    item.codigos.codigo3,
    item.validacionOperativa.cltIniciado ? "SI" : "NO",
    item.validacionOperativa.cltRespuestas,
    item.validacionOperativa.resultadoMigracion
  ];
  return `${headers.join(",")}\n${row.map(csvCell).join(",")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
