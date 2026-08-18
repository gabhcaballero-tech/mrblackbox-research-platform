import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const auditPath = path.join(repoRoot, "outputs", "v1_to_v2_remaining_audit", "V1_TO_V2_REMAINING_MIGRATION_AUDIT.json");
const individualExporter = path.join(repoRoot, "outputs", "v1_to_v2_export", "export-participant-v1-to-v2.mjs");
const outputJson = path.join(__dirname, "V1_TO_V2_ADVANCED_CONTINUITY_EXPORT.json");
const outputCsv = path.join(__dirname, "V1_TO_V2_ADVANCED_CONTINUITY_SUMMARY.csv");

const nodeBin = process.execPath;

const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const auditRows = audit.rows.filter((row) => row.categoriaMigracion === "MIGRAR_AVANCE" && row.NAV_FOLIO !== "NAV-003");
const participants = [];
const excluded = [];

await fs.mkdir(__dirname, { recursive: true });

for (const row of auditRows) {
  const result = spawnSync(nodeBin, [individualExporter, row.NAV_FOLIO], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });

  if (result.status !== 0) {
    excluded.push({
      navFolio: row.NAV_FOLIO,
      reason: "INDIVIDUAL_EXPORT_FAILED",
      stderr: result.stderr,
      stdout: result.stdout
    });
    continue;
  }

  const individualPath = path.join(repoRoot, "outputs", "v1_to_v2_export", `${row.NAV_FOLIO}_v1_to_v2.json`);
  const v1 = JSON.parse(await fs.readFile(individualPath, "utf8"));
  participants.push(toContinuityParticipant(v1, row));
}

const payload = {
  schemaVersion: "v1-to-v2.advanced-continuity-export.1",
  source: {
    project: "mrblackbox-research-platform",
    studyCode: audit.metadata.sourceStudyCode,
    studyName: audit.metadata.sourceStudyName,
    exportedAt: new Date().toISOString(),
    exportedAtMexicoCity: formatDateTimeMexicoCity(new Date()),
    readOnly: true,
    selectionSource: "outputs/v1_to_v2_remaining_audit/V1_TO_V2_REMAINING_MIGRATION_AUDIT.json",
    includedCategory: "MIGRAR_AVANCE",
    excludedManualReleaseFolios: audit.metadata.manualReleaseFolios ?? [],
    excludedReleaseFolios: audit.metadata.excludedReleaseFolios ?? []
  },
  summary: {
    requestedAdvancedParticipants: auditRows.length,
    exportedParticipants: participants.length,
    failedExports: excluded.length,
    excludedFolios: excluded.map((item) => item.navFolio)
  },
  participants,
  excluded
};

await fs.writeFile(outputJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await fs.writeFile(outputCsv, toSummaryCsv(participants), "utf8");

console.log(
  JSON.stringify(
    {
      outputJson,
      outputCsv,
      summary: payload.summary,
      folios: participants.map((participant) => participant.identidad.NAV_FOLIO)
    },
    null,
    2
  )
);

function toContinuityParticipant(v1, auditRow) {
  const cltRotation = v1.rotations?.clt ?? {};
  const hutRotation = v1.rotations?.hut ?? {};
  const answers = (v1.answers ?? []).map((answer) => ({
    actividad: answer.activity,
    preguntaV1: answer.questionKey,
    respuesta: answer.answerValue,
    fecha: answer.answeredAt,
    metadata: answer.metadata ?? null
  }));
  const evidence = (v1.evidence ?? []).map((item) => ({
    actividad: inferEvidenceActivity(item.type),
    tipo: item.type,
    fecha: item.fecha,
    fechaMexicoCity: item.fechaMexicoCity ?? null,
    referenciaArchivo: item.storage?.privateStorageKey ?? item.url ?? null,
    archivoOriginal: item.storage?.originalFilename ?? null,
    storage: item.storage ?? null,
    metadata: item.metadata ?? null
  }));

  return {
    IDENTIDAD: {
      NAV_FOLIO: v1.participant.navFolio,
      HUT_FOLIO: v1.participant.hutFolio,
      nombre: v1.participant.name,
      telefono: v1.participant.phone,
      email: v1.participant.email,
      reclutador: findRecruiter(v1.answers ?? []),
      protocolo: v1.participant.protocol,
      productos: v1.participant.products,
      idsV1: v1.participant.ids
    },
    identidad: {
      NAV_FOLIO: v1.participant.navFolio,
      HUT_FOLIO: v1.participant.hutFolio,
      nombre: v1.participant.name,
      telefono: v1.participant.phone,
      email: v1.participant.email,
      reclutador: findRecruiter(v1.answers ?? []),
      protocolo: v1.participant.protocol
    },
    SCREENING: {
      estado: v1.participant.statuses?.screeningStatus ?? auditRow.screeningResultado,
      resultado: auditRow.screeningResultado,
      fechaAprobacion: auditRow.fechaAprobacion
    },
    screening: {
      estado: v1.participant.statuses?.screeningStatus ?? auditRow.screeningResultado,
      resultado: auditRow.screeningResultado,
      fechaAprobacion: auditRow.fechaAprobacion
    },
    CODIGOS: v1.codes.map((code) => ({
      slot: code.slot,
      codigo: code.code,
      fuente: code.source,
      creado: code.createdAt
    })),
    ROTACION_HISTORICA: {
      PR1: cltRotation.pr1 ?? null,
      PR2: cltRotation.pr2 ?? null,
      PR3: cltRotation.pr3 ?? null,
      VERI_1: cltRotation.veri1 ?? null,
      PR4: cltRotation.pr4 ?? null,
      PR5: cltRotation.pr5 ?? null,
      PR6: cltRotation.pr6 ?? null,
      VERI_2: cltRotation.veri2 ?? null,
      EVA1: cltRotation.eva1?.code ?? cltRotation.eva1 ?? hutRotation.eva1 ?? null,
      EVA2: cltRotation.eva2?.code ?? cltRotation.eva2 ?? hutRotation.eva2 ?? null,
      rotationPlanName: cltRotation.rotationPlanName ?? null,
      rotationCode: cltRotation.rotationCode ?? null,
      triangularSource: cltRotation.triangularSource ?? null,
      hut: hutRotation
    },
    rotacionHistorica: {
      PR1: cltRotation.pr1 ?? null,
      PR2: cltRotation.pr2 ?? null,
      PR3: cltRotation.pr3 ?? null,
      VERI_1: cltRotation.veri1 ?? null,
      PR4: cltRotation.pr4 ?? null,
      PR5: cltRotation.pr5 ?? null,
      PR6: cltRotation.pr6 ?? null,
      VERI_2: cltRotation.veri2 ?? null,
      EVA1: cltRotation.eva1?.code ?? cltRotation.eva1 ?? hutRotation.eva1 ?? null,
      EVA2: cltRotation.eva2?.code ?? cltRotation.eva2 ?? hutRotation.eva2 ?? null
    },
    ACTIVIDADES: (v1.activities ?? []).map((activity) => ({
      tipo: activity.type,
      codigo: activity.code,
      estado: activity.status,
      inicio: activity.startedAt ?? activity.scheduledAt ?? null,
      termino: activity.completedAt ?? null,
      metadata: activity.metadata ?? null
    })),
    actividades: (v1.activities ?? []).map((activity) => ({
      tipo: activity.type,
      codigo: activity.code,
      estado: activity.status,
      inicio: activity.startedAt ?? activity.scheduledAt ?? null,
      termino: activity.completedAt ?? null
    })),
    RESPUESTAS: answers,
    respuestas: answers,
    EVIDENCIAS: evidence,
    evidencias: evidence,
    CLASIFICACION: {
      categoria: "MIGRAR_AVANCE",
      etapaActual: inferCurrentStage(auditRow),
      ultimaActividad: auditRow.ultimaActividad,
      siguienteActividadEsperada: inferNextExpectedActivity(auditRow),
      respuestasExistentes: Number(auditRow.respuestasExistentes ?? 0),
      accionRecomendada: auditRow.accionRecomendada
    },
    clasificacion: {
      categoria: "MIGRAR_AVANCE",
      etapaActual: inferCurrentStage(auditRow),
      ultimaActividad: auditRow.ultimaActividad,
      siguienteActividadEsperada: inferNextExpectedActivity(auditRow)
    },
    sourceV1: {
      schemaVersion: v1.schemaVersion,
      warnings: v1.warnings ?? []
    }
  };
}

function findRecruiter(answers) {
  const answer = answers.find((item) => {
    const key = String(item.questionKey ?? "").toUpperCase();
    return key.includes("RECLUTADOR") || key === "F0" || key === "OP1_RECLUTADOR";
  });
  if (!answer) {
    return null;
  }
  return stringifyAnswer(answer.answerValue);
}

function inferEvidenceActivity(type) {
  const [activity] = String(type ?? "").split(":");
  if (activity === "HUT_APPLICATION_EVIDENCE" || activity === "HUT_APPLICATION_PHOTO_ENTRY") return "HUT";
  if (activity === "NAVIGO") return "NAVIGO";
  if (activity === "SCREENING") return "SCREENING";
  return activity || "UNKNOWN";
}

function inferCurrentStage(row) {
  if (row.hutIniciado === "SI") return `HUT: ${row.hutEtapaActual || row.hutUltimaActividad || "INICIADO"}`;
  if (row.navigoIniciado === "SI") return row.navigoCompletado === "SI" ? "NAVIGO_COMPLETADO" : "NAVIGO_EN_PROGRESO";
  if (row.cltIniciado === "SI") return row.cltCompletado === "SI" ? "CLT_COMPLETADO" : "CLT_EN_PROGRESO";
  return "SCREENING_APROBADO";
}

function inferNextExpectedActivity(row) {
  if (row.hutIniciado === "SI") return "Continuar HUT desde etapa actual";
  if (row.navigoIniciado === "SI" && row.navigoCompletado !== "SI") return "Continuar evaluaciones Navigo pendientes";
  if (row.navigoIniciado === "SI" && row.navigoCompletado === "SI") return "Iniciar o continuar HUT";
  if (row.cltIniciado === "SI" && row.cltCompletado !== "SI") return "Continuar CLT";
  if (row.cltIniciado === "SI" && row.cltCompletado === "SI") return "Liberar o continuar Navigo";
  return "Revisar continuidad operativa";
}

function stringifyAnswer(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyAnswer).filter(Boolean).join(" | ");
  if (typeof value === "object") {
    if ("text" in value) return stringifyAnswer(value.text);
    if ("value" in value) return stringifyAnswer(value.value);
    if ("label" in value) return stringifyAnswer(value.label);
  }
  return JSON.stringify(value);
}

function toSummaryCsv(participants) {
  const headers = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "Nombre",
    "Telefono",
    "Email",
    "Reclutador",
    "Screening",
    "Fecha aprobacion",
    "PR1",
    "PR2",
    "PR3",
    "VERI_1",
    "PR4",
    "PR5",
    "PR6",
    "VERI_2",
    "EVA1",
    "EVA2",
    "Actividades",
    "Respuestas",
    "Evidencias",
    "Etapa actual",
    "Siguiente actividad esperada"
  ];
  const rows = participants.map((participant) => {
    const identity = participant.identidad;
    const rotation = participant.rotacionHistorica;
    return [
      identity.NAV_FOLIO,
      identity.HUT_FOLIO,
      identity.nombre,
      identity.telefono,
      identity.email,
      identity.reclutador,
      participant.screening.resultado,
      participant.screening.fechaAprobacion,
      rotation.PR1,
      rotation.PR2,
      rotation.PR3,
      rotation.VERI_1,
      rotation.PR4,
      rotation.PR5,
      rotation.PR6,
      rotation.VERI_2,
      rotation.EVA1,
      rotation.EVA2,
      participant.actividades.length,
      participant.respuestas.length,
      participant.evidencias.length,
      participant.clasificacion.etapaActual,
      participant.clasificacion.siguienteActividadEsperada
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDateTimeMexicoCity(value) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}
