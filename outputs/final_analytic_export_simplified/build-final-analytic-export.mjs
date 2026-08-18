import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const MASTER_JSON = path.join(repoRoot, "outputs", "v1_master_participants_export", "V1_MASTER_PARTICIPANTS_EXPORT.json");
const SPEC_JSON = path.join(repoRoot, "outputs", "v1_operative_specification", "V1_OPERATIVE_SPECIFICATION.json");
const OUTPUT_XLSX = path.join(__dirname, "ANALYTIC_EXPORT_FINAL_SIMPLIFIED.xlsx");
const OUTPUT_JSON = path.join(__dirname, "ANALYTIC_EXPORT_FINAL_SIMPLIFIED.summary.json");

const SCREENING_ORDER = [
  "F0",
  "OP1_RECLUTADOR",
  "CONSENTIMIENTO",
  "F1_GENERO",
  "GENERO",
  "F2_EDAD",
  "EDAD_EXACTA",
  "RANGO_EDAD",
  "F3_EXCLUSION_LABORAL",
  "F4_PARTICIPACION_RECIENTE_PERFUMES",
  "F4_PARTICIPACION_RECIENTE",
  "F5_CONDICIONES_FISICAS",
  "F6_MARCAS_UTILIZA",
  "F7_Marca_Frecuente",
  "F7_MARCA_FRECUENTE",
  "F8_VARIANTE_COLOR",
  "F9_FRECUENCIA_SEMANAL",
  "F9A_VECES_AL_DIA",
  "F10_ULTIMA_COMPRA",
  "F11",
  "F12",
  "F13",
  "NSE",
  "PUNTAJE_NSE",
  "D1_ESCOLARIDAD_JEFE_HOGAR",
  "D2_BANOS_COMPLETOS",
  "D3_AUTOMOVILES_HOGAR",
  "D3_AUTOS",
  "D4_INTERNET_HOGAR",
  "D4_INTERNET",
  "D5_PERSONAS_TRABAJARON",
  "D6_CUARTOS_DORMIR",
  "HUT_ACCESO_CORRIDO"
];

const CLT_ORDER = [
  "DG_NOMBRE",
  "DG_FECHA",
  "DG_HORA_INICIO",
  "DG_DIRECCION",
  "DG_COLONIA",
  "DG_MUNICIPIO",
  "DG_TELEFONO",
  "F0",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F11A",
  "F12",
  "F13",
  "F14",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5A",
  "P6A",
  "P7A",
  "P8A",
  "P9A",
  "P10A",
  "P11A",
  "P12A",
  "P13A",
  "P5B",
  "P6B",
  "P7B",
  "P8B",
  "P9B",
  "P10B",
  "P11B",
  "P12B",
  "P13B",
  "P14",
  "P14A",
  "P15",
  "P16",
  "P17",
  "P18",
  "P19",
  "P20",
  "D1_ESCOLARIDAD_JEFE_HOGAR",
  "D2_BANOS_COMPLETOS",
  "D3_AUTOS",
  "D4_INTERNET",
  "D5_PERSONAS_TRABAJARON",
  "D6_CUARTOS_DORMIR",
  "D_TOTAL_PUNTOS_NSE",
  "D_NSE_CLASIFICACION",
  "DG_HORA_TERMINO"
];

const HUT_ORDER = [
  "HUT_DG_NOMBRE",
  "HUT_DG_FOLIO",
  "HUT_DG_COLONIA",
  "HUT_DG_TELEFONO",
  "HUT_DG_DIRECCION",
  "HUT_DG_EMAIL",
  "HUT_PARTICIPO_CLT",
  "HUT_F0_ACEPTA",
  "HUT_F1_GENERO",
  "HUT_F2_EDAD_EXACTA",
  "HUT_F6_PRODUCTOS_7_DIAS",
  "HUT_F20_TIEMPO_USO_MARCA",
  "HUT_F22_IMPORTANCIA_PERFUME",
  "HUT_V1_ACEPTA_USAR_PRODUCTO",
  "HUT_V1_CONFIRMACION_ENTREGA",
  "HUT_V1_OBSERVACIONES",
  "HUT_P1A_USO_PERFUME",
  "HUT_P3A_MOSTRO_ENVASE",
  "HUT_P4A_HORAS_DIA",
  "HUT_EVA1_GUSTO",
  "HUT_P6A_INTENSIDAD_FIT",
  "HUT_P7A_INTENSIDAD_PERCIBIDA",
  "HUT_P8A_GUSTO_ABIERTO",
  "HUT_P9A_DISGUSTO_ABIERTO",
  "HUT_EVA1_ATRIBUTOS",
  "HUT_P11A_RETOCO",
  "HUT_P11A_RAZON_RETOQUE",
  "HUT_P12A_CARACTERISTICA_INCOMODA",
  "HUT_P13A_CARACTERISTICA_INCOMODA_DETALLE",
  "HUT_P14A_ATOMIZADOR_ATRIBUTOS",
  "HUT_P15A_CANTIDAD_ATOMIZADOR",
  "HUT_P16A_INCONVENIENTES_ATOMIZADOR",
  "HUT_P17A_GUSTO_ATOMIZADOR",
  "HUT_P18A_DISGUSTO_ATOMIZADOR",
  "HUT_P19A_INTENCION_COMPRA",
  "HUT_P19A_RAZONES_COMPRA",
  "HUT_P21A_EXPECTATIVAS",
  "HUT_P22A_RECOMENDACION",
  "HUT_P23A_SATISFACCION",
  "HUT_V2_CONFIRMACION_ENTREGA",
  "HUT_V2_OBSERVACIONES",
  "HUT_P1B_USO_PERFUME",
  "HUT_P2B_RAZON_NO_USO",
  "HUT_P3B_MOSTRO_ENVASE",
  "HUT_P24_PREFERENCIA_GENERAL",
  "HUT_P25_COMPRA_PRIMERO",
  "HUT_P26_COMPRA_SEGUNDO",
  "HUT_P27_COMPARATIVA_ATRIBUTOS"
];

const ATTRIBUTE_QUESTIONS = new Set([
  "P8A",
  "P9A",
  "P8B",
  "P9B",
  "HUT_EVA1_ATRIBUTOS",
  "HUT_P14A_ATOMIZADOR_ATRIBUTOS",
  "HUT_P27_COMPARATIVA_ATRIBUTOS"
]);

const CLT_TRACE_QUESTIONS = new Set([
  "TRI1_CONFIRMED_POS1",
  "TRI1_CONFIRMED_POS2",
  "TRI1_CONFIRMED_POS3",
  "TRI2_CONFIRMED_POS1",
  "TRI2_CONFIRMED_POS2",
  "TRI2_CONFIRMED_POS3",
  "EVA1_CONFIRMED_PRODUCT",
  "EVA1_CONFIRMED_ARM",
  "EVA1_CONFIRMED_ORDER",
  "EVA2_CONFIRMED_PRODUCT",
  "EVA2_CONFIRMED_ARM",
  "EVA2_CONFIRMED_ORDER",
  "SYS_EVA1_TRACE",
  "SYS_EVA2_TRACE"
]);

const ATTRIBUTE_ORDERS = {
  P8A: [
    "LIMPIA",
    "MASCULINA",
    "FRESCA",
    "SEDUCTORA",
    "ATEMPORAL",
    "ATRACTIVA",
    "ALTA_CALIDAD",
    "INNOVADORA",
    "ENERGIZANTE",
    "TIENE_CARACTER",
    "PARA_ALGUIEN_COMO_YO",
    "VERSATIL",
    "ADICTIVA",
    "LLAMATIVA",
    "ME_HACE_SENTIR_SEGURO",
    "MODERNA",
    "ME_TRANSMITE_LIBERTAD",
    "ME_HACE_SENTIR_COMODO",
    "ELEGANTE",
    "ARTIFICIAL"
  ],
  P9A: [
    "FLORAL",
    "FRUTAL",
    "DULCE",
    "ATALCADA",
    "CITRICA",
    "AMADERADA_MADEROSA",
    "JUGOSA",
    "EMPALAGOSA",
    "ESPECIADA",
    "HERBAL",
    "LAVANDA",
    "MARINA",
    "ALCOHOL"
  ],
  HUT_EVA1_ATRIBUTOS: [
    "AROMA_DURADERO",
    "AROMA_AGRADABLE",
    "ENVASE_COMODO",
    "INTENSIDAD_ADECUADA",
    "DIRECCION_FACIL",
    "CANTIDAD_FACIL",
    "SEGURIDAD",
    "ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO",
    "REFLEJA_MI_PERSONALIDAD",
    "AROMA_UNICO"
  ],
  HUT_P14A_ATOMIZADOR_ATRIBUTOS: [
    "FACIL_PRESIONAR",
    "APLICACION_UNIFORME",
    "CANTIDAD_ADECUADA",
    "DISTRIBUYE_BIEN",
    "FUNCIONO_CORRECTAMENTE",
    "RESISTENTE",
    "CALIDAD"
  ],
  HUT_P27_COMPARATIVA_ATRIBUTOS: [
    "AROMA_DURADERO",
    "AROMA_AGRADABLE",
    "ENVASE_COMODO",
    "INTENSIDAD_ADECUADA",
    "DIRECCION_FACIL",
    "CANTIDAD_FACIL",
    "SEGURIDAD",
    "ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO",
    "REFLEJA_MI_PERSONALIDAD",
    "AROMA_UNICO",
    "ATOMIZADOR_FACIL_PRESIONAR",
    "ATOMIZADOR_UNIFORME",
    "ATOMIZADOR_CANTIDAD",
    "ATOMIZADOR_DISTRIBUYE",
    "ATOMIZADOR_FUNCIONO",
    "ATOMIZADOR_RESISTENTE",
    "ATOMIZADOR_CALIDAD"
  ]
};
ATTRIBUTE_ORDERS.P8B = ATTRIBUTE_ORDERS.P8A;
ATTRIBUTE_ORDERS.P9B = ATTRIBUTE_ORDERS.P9A;

const master = JSON.parse(await fs.readFile(MASTER_JSON, "utf8"));
const spec = JSON.parse(await fs.readFile(SPEC_JSON, "utf8"));

const questionText = buildQuestionTextMap(spec);
const answerIndex = buildAnswerIndex(master.sheets.answers);
const rotationIndex = buildRotationIndex(master.sheets.rotations);
const participants = master.sheets.participants.filter(isAnalyticParticipant).sort(compareParticipantFolio);

const reportClt = buildCltRows(participants);
const reportHut = buildHutRows(participants);
const workbook = buildWorkbook(reportClt, reportHut);
await verifyWorkbook(workbook);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_XLSX);

const summary = {
  generatedAt: new Date().toISOString(),
  source: MASTER_JSON,
  v2SourcePresent: false,
  sheets: ["REPORTE CLT", "REPORTE HUT"],
  rows: {
    reporteClt: reportClt.rows.length,
    reporteHut: reportHut.rows.length
  },
  columns: {
    reporteClt: reportClt.columns.length,
    reporteHut: reportHut.columns.length
  },
  validation: {
    onlyTwoSheets: true,
    removedSheets: ["REPORTE FILTRO", "REPORTE COMPLETO"],
    duplicateHeadersClt: findDuplicates(reportClt.columns),
    duplicateHeadersHut: findDuplicates(reportHut.columns)
  }
};
await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_XLSX, summary: OUTPUT_JSON, ...summary }, null, 2));

function buildQuestionTextMap(data) {
  const map = new Map();
  for (const question of data.questions ?? []) {
    if (!question.questionId || map.has(question.questionId)) continue;
    map.set(question.questionId, question.textExact || "");
  }
  for (const answer of master.sheets.answers) {
    if (!answer.questionId || map.has(answer.questionId)) continue;
    map.set(answer.questionId, answer.questionText || "");
  }
  return map;
}

function buildAnswerIndex(answers) {
  const byParticipant = new Map();
  for (const answer of answers) {
    const participantKey = answer.participantIdV1 || answer.navFolio || answer.hutFolio;
    if (!participantKey) continue;
    const activity = answer.activity || "";
    const questionId = answer.questionId || "";
    if (!questionId) continue;
    const activityMap = getOrCreateMap(byParticipant, participantKey);
    const questionMap = getOrCreateMap(activityMap, activity);
    const current = questionMap.get(questionId);
    if (!current || timestamp(answer.answeredAt) >= timestamp(current.answeredAt)) {
      questionMap.set(questionId, answer);
    }
  }
  return byParticipant;
}

function buildRotationIndex(rotations) {
  const byParticipant = new Map();
  for (const rotation of rotations) {
    const key = rotation.navFolio || rotation.hutFolio;
    if (!key) continue;
    const participantRotations = getOrCreateMap(byParticipant, key);
    participantRotations.set(rotation.type, rotation);
  }
  return byParticipant;
}

function buildCltRows(rows) {
  const columns = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "NOMBRE",
    ...SCREENING_ORDER,
    "ROTATION_PLAN",
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
    "TRI1_SYSTEM_POS1",
    "TRI1_SYSTEM_POS2",
    "TRI1_SYSTEM_POS3",
    "TRI1_CONFIRMED_POS1",
    "TRI1_CONFIRMED_POS2",
    "TRI1_CONFIRMED_POS3",
    "TRI1_DELIVERY_ORDER",
    "P1",
    "TRI1_SELECTED_KEY",
    "TRI1_SELECTED_POSITION",
    "TRI1_CORRECT",
    "P2",
    "TRI2_SYSTEM_POS1",
    "TRI2_SYSTEM_POS2",
    "TRI2_SYSTEM_POS3",
    "TRI2_CONFIRMED_POS1",
    "TRI2_CONFIRMED_POS2",
    "TRI2_CONFIRMED_POS3",
    "TRI2_DELIVERY_ORDER",
    "P3",
    "TRI2_SELECTED_KEY",
    "TRI2_SELECTED_POSITION",
    "TRI2_CORRECT",
    "P4",
    "EVA1_SYSTEM_PRODUCT",
    "EVA1_SYSTEM_ARM",
    "EVA1_SYSTEM_ORDER",
    "EVA1_CONFIRMED_PRODUCT",
    "EVA1_CONFIRMED_ARM",
    "EVA1_CONFIRMED_ORDER",
    ...expandCltBlock(["P5A", "P6A", "P7A", "P8A", "P9A", "P10A", "P11A", "P12A", "P13A"]),
    "EVA2_SYSTEM_PRODUCT",
    "EVA2_SYSTEM_ARM",
    "EVA2_SYSTEM_ORDER",
    "EVA2_CONFIRMED_PRODUCT",
    "EVA2_CONFIRMED_ARM",
    "EVA2_CONFIRMED_ORDER",
    ...expandCltBlock(["P5B", "P6B", "P7B", "P8B", "P9B", "P10B", "P11B", "P12B", "P13B"]),
    "P14_FIRST_PRODUCT",
    "P14_SECOND_PRODUCT",
    ...expandCltBlock(["P14", "P14A", "P15", "P16", "P17", "P18", "P19", "P20"]),
    "D1_ESCOLARIDAD_JEFE_HOGAR",
    "D2_BANOS_COMPLETOS",
    "D3_AUTOS",
    "D4_INTERNET",
    "D5_PERSONAS_TRABAJARON",
    "D6_CUARTOS_DORMIR",
    "D_TOTAL_PUNTOS_NSE",
    "D_NSE_CLASIFICACION",
    "DG_HORA_TERMINO"
  ].filter((column, index, array) => array.indexOf(column) === index);

  return {
    columns,
    rows: rows.map((participant) => buildCltRow(participant, columns))
  };
}

function buildHutRows(rows) {
  const columns = [
    "NAV_FOLIO",
    "HUT_FOLIO",
    "NOMBRE",
    ...SCREENING_ORDER,
    "HUT_ROTATION_PLAN",
    "HUT_EVA1",
    "HUT_EVA2",
    ...expandHutBlock([
      "HUT_DG_NOMBRE",
      "HUT_DG_FOLIO",
      "HUT_DG_COLONIA",
      "HUT_DG_TELEFONO",
      "HUT_DG_DIRECCION",
      "HUT_DG_EMAIL",
      "HUT_PARTICIPO_CLT",
      "HUT_F0_ACEPTA",
      "HUT_F1_GENERO",
      "HUT_F2_EDAD_EXACTA",
      "HUT_F6_PRODUCTOS_7_DIAS",
      "HUT_F20_TIEMPO_USO_MARCA",
      "HUT_F22_IMPORTANCIA_PERFUME",
      "HUT_V1_ACEPTA_USAR_PRODUCTO",
      "HUT_V1_CONFIRMACION_ENTREGA",
      "HUT_V1_OBSERVACIONES"
    ]),
    "PRODUCTO_1_ROTACION_ASIGNADA",
    ...expandHutBlock([
      "HUT_P1A_USO_PERFUME",
      "HUT_P3A_MOSTRO_ENVASE",
      "HUT_P4A_HORAS_DIA",
      "HUT_EVA1_GUSTO",
      "HUT_P6A_INTENSIDAD_FIT",
      "HUT_P7A_INTENSIDAD_PERCIBIDA",
      "HUT_P8A_GUSTO_ABIERTO",
      "HUT_P9A_DISGUSTO_ABIERTO",
      "HUT_EVA1_ATRIBUTOS",
      "HUT_P11A_RETOCO",
      "HUT_P11A_RAZON_RETOQUE",
      "HUT_P12A_CARACTERISTICA_INCOMODA",
      "HUT_P13A_CARACTERISTICA_INCOMODA_DETALLE",
      "HUT_P14A_ATOMIZADOR_ATRIBUTOS",
      "HUT_P15A_CANTIDAD_ATOMIZADOR",
      "HUT_P16A_INCONVENIENTES_ATOMIZADOR",
      "HUT_P17A_GUSTO_ATOMIZADOR",
      "HUT_P18A_DISGUSTO_ATOMIZADOR",
      "HUT_P19A_INTENCION_COMPRA",
      "HUT_P19A_RAZONES_COMPRA",
      "HUT_P21A_EXPECTATIVAS",
      "HUT_P22A_RECOMENDACION",
      "HUT_P23A_SATISFACCION"
    ]),
    "PRODUCTO_2_ROTACION_ASIGNADA",
    ...expandHutBlock([
      "HUT_V2_CONFIRMACION_ENTREGA",
      "HUT_V2_OBSERVACIONES",
      "HUT_P1B_USO_PERFUME",
      "HUT_P2B_RAZON_NO_USO",
      "HUT_P3B_MOSTRO_ENVASE",
      "HUT_P24_PREFERENCIA_GENERAL",
      "HUT_P25_COMPRA_PRIMERO",
      "HUT_P26_COMPRA_SEGUNDO",
      "HUT_P27_COMPARATIVA_ATRIBUTOS"
    ])
  ].filter((column, index, array) => array.indexOf(column) === index);

  return {
    columns,
    rows: rows.map((participant) => buildHutRow(participant, columns))
  };
}

function buildCltRow(participant, columns) {
  const row = baseRow(participant);
  addScreeningAnswers(row, participant);
  const rotation = findRotation(participant, "CLT");
  Object.assign(row, rotationRow(rotation, ""));
  row.TRI1_SYSTEM_POS1 = rotation?.pr1 ?? "";
  row.TRI1_SYSTEM_POS2 = rotation?.pr2 ?? "";
  row.TRI1_SYSTEM_POS3 = rotation?.pr3 ?? "";
  row.TRI2_SYSTEM_POS1 = rotation?.pr4 ?? "";
  row.TRI2_SYSTEM_POS2 = rotation?.pr5 ?? "";
  row.TRI2_SYSTEM_POS3 = rotation?.pr6 ?? "";
  row.EVA1_SYSTEM_PRODUCT = rotation?.eva1 ?? "";
  row.EVA1_SYSTEM_ARM = inferArm(rotation?.eva1);
  row.EVA1_SYSTEM_ORDER = rotation?.eva1 ? "1" : "";
  row.EVA2_SYSTEM_PRODUCT = rotation?.eva2 ?? "";
  row.EVA2_SYSTEM_ARM = inferArm(rotation?.eva2);
  row.EVA2_SYSTEM_ORDER = rotation?.eva2 ? "2" : "";
  row.P14_FIRST_PRODUCT = getAnswerValue(participant, "CLT", "EVA1_CONFIRMED_PRODUCT") || row.EVA1_SYSTEM_PRODUCT;
  row.P14_SECOND_PRODUCT = getAnswerValue(participant, "CLT", "EVA2_CONFIRMED_PRODUCT") || row.EVA2_SYSTEM_PRODUCT;
  addActivityAnswers(row, participant, "CLT", CLT_ORDER);
  addTriangularDerived(row, participant);
  return projectRow(row, columns);
}

function buildHutRow(participant, columns) {
  const row = baseRow(participant);
  addScreeningAnswers(row, participant);
  const rotation = findRotation(participant, "HUT");
  row.HUT_ROTATION_PLAN = rotation?.rotationPlan ?? "";
  row.HUT_EVA1 = rotation?.eva1 ?? "";
  row.HUT_EVA2 = rotation?.eva2 ?? "";
  row.PRODUCTO_1_ROTACION_ASIGNADA = rotation?.eva1 ?? "";
  row.PRODUCTO_2_ROTACION_ASIGNADA = rotation?.eva2 ?? "";
  addActivityAnswers(row, participant, "HUT", HUT_ORDER);
  return projectRow(row, columns);
}

function baseRow(participant) {
  return {
    NAV_FOLIO: participant.navFolio || "",
    HUT_FOLIO: participant.hutFolio || "",
    NOMBRE: participant.name || ""
  };
}

function addScreeningAnswers(row, participant) {
  for (const questionId of SCREENING_ORDER) {
    row[questionId] = "";
  }
  for (const questionId of SCREENING_ORDER) {
    if (["GENERO", "EDAD_EXACTA", "RANGO_EDAD", "NSE", "PUNTAJE_NSE"].includes(questionId)) continue;
    row[questionId] = getAnswerValue(participant, "SCREENING", questionId);
  }
  row.GENERO = row.F1_GENERO || row.F1 || "";
  row.EDAD_EXACTA = row.F2_EDAD || row.F2 || "";
  row.RANGO_EDAD = ageRange(row.EDAD_EXACTA);
  row.NSE = getAnswerValue(participant, "CLT", "D_NSE_CLASIFICACION");
  row.PUNTAJE_NSE = getAnswerValue(participant, "CLT", "D_TOTAL_PUNTOS_NSE");
}

function addActivityAnswers(row, participant, activity, questionOrder) {
  for (const questionId of questionOrder) {
    if (ATTRIBUTE_QUESTIONS.has(questionId)) {
      addAttributeAnswers(row, participant, activity, questionId);
      continue;
    }
    if (CLT_TRACE_QUESTIONS.has(questionId)) {
      row[questionId] = getAnswerValue(participant, activity, questionId);
      continue;
    }
    row[questionId] = getAnswerValue(participant, activity, questionId);
  }
}

function addAttributeAnswers(row, participant, activity, questionId) {
  const parsed = getAnswerJson(participant, activity, questionId);
  const order = ATTRIBUTE_ORDERS[questionId] ?? [];
  for (const attribute of order) {
    row[`${questionId}_${attribute}`] = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? normalizeScalar(parsed[attribute])
      : "";
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.__rowOrder) {
    row[`${questionId}_ATTRIBUTE_ORDER`] = normalizeScalar(parsed.__rowOrder);
  }
}

function addTriangularDerived(row, participant) {
  const p1 = getAnswerJson(participant, "CLT", "P1");
  const p3 = getAnswerJson(participant, "CLT", "P3");
  Object.assign(row, triangularValues(p1, "TRI1"));
  Object.assign(row, triangularValues(p3, "TRI2"));
}

function triangularValues(parsed, prefix) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      [`${prefix}_DELIVERY_ORDER`]: "",
      [`${prefix}_SELECTED_KEY`]: "",
      [`${prefix}_SELECTED_POSITION`]: "",
      [`${prefix}_CORRECT`]: ""
    };
  }
  return {
    [`${prefix}_DELIVERY_ORDER`]: normalizeScalar(parsed.deliveryOrder ?? parsed.order ?? parsed.displayOrder),
    [`${prefix}_SELECTED_KEY`]: normalizeScalar(parsed.selectedKey ?? parsed.selectedSampleKey ?? parsed.selection),
    [`${prefix}_SELECTED_POSITION`]: normalizeScalar(parsed.selectedPosition ?? parsed.position),
    [`${prefix}_CORRECT`]: normalizeScalar(parsed.correct ?? parsed.isCorrect)
  };
}

function rotationRow(rotation, prefix) {
  const label = prefix ? `${prefix}_` : "";
  return {
    [`${label}ROTATION_PLAN`]: rotation?.rotationPlan ?? "",
    [`${label}PR1`]: rotation?.pr1 ?? "",
    [`${label}PR2`]: rotation?.pr2 ?? "",
    [`${label}PR3`]: rotation?.pr3 ?? "",
    [`${label}VERI_1`]: rotation?.veri1 ?? "",
    [`${label}PR4`]: rotation?.pr4 ?? "",
    [`${label}PR5`]: rotation?.pr5 ?? "",
    [`${label}PR6`]: rotation?.pr6 ?? "",
    [`${label}VERI_2`]: rotation?.veri2 ?? "",
    [`${label}EVA1`]: rotation?.eva1 ?? "",
    [`${label}EVA2`]: rotation?.eva2 ?? ""
  };
}

function expandCltBlock(questionIds) {
  return questionIds.flatMap((questionId) => expandQuestion(questionId));
}

function expandHutBlock(questionIds) {
  return questionIds.flatMap((questionId) => expandQuestion(questionId));
}

function expandQuestion(questionId) {
  if (!ATTRIBUTE_QUESTIONS.has(questionId)) return [questionId];
  const order = ATTRIBUTE_ORDERS[questionId] ?? [];
  const columns = order.map((attribute) => `${questionId}_${attribute}`);
  return [...columns, `${questionId}_ATTRIBUTE_ORDER`];
}

function getAnswerValue(participant, activity, questionId) {
  const answer = getAnswer(participant, activity, questionId);
  if (!answer) return "";
  const parsed = safeJson(answer.answerJson);
  if (Array.isArray(parsed)) return parsed.map(normalizeScalar).filter(Boolean).join(", ");
  if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
  return normalizeAnswer(answer.answerReadable || parsed);
}

function getAnswerJson(participant, activity, questionId) {
  const answer = getAnswer(participant, activity, questionId);
  return answer ? safeJson(answer.answerJson) : null;
}

function getAnswer(participant, activity, questionId) {
  const key = participant.participantIdV1 || participant.navFolio || participant.hutFolio;
  return answerIndex.get(key)?.get(activity)?.get(questionId) ?? null;
}

function findRotation(participant, type) {
  const key = participant.navFolio || participant.hutFolio;
  if (!key) return null;
  return rotationIndex.get(key)?.get(type) ?? null;
}

function isAnalyticParticipant(participant) {
  const hasName = Boolean(participant.name && participant.name.trim());
  if (!hasName) return false;
  const isPureHutReserve =
    participant.sourceRecordType === "HUT_PARTICIPANT_ORPHAN" &&
    participant.name === participant.hutFolio &&
    !participant.navFolio &&
    !participant.phone &&
    !participant.email &&
    participant.hasAnswers !== "SI" &&
    participant.hasEvidence !== "SI";
  return !isPureHutReserve;
}

function compareParticipantFolio(a, b) {
  return folioNumber(a.navFolio || a.hutFolio) - folioNumber(b.navFolio || b.hutFolio);
}

function folioNumber(value) {
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function projectRow(row, columns) {
  const projected = {};
  for (const column of columns) projected[column] = cellValue(row[column]);
  return projected;
}

function buildWorkbook(cltReport, hutReport) {
  const workbook = Workbook.create();
  addSheet(workbook, "REPORTE CLT", cltReport.columns, cltReport.rows);
  addSheet(workbook, "REPORTE HUT", hutReport.columns, hutReport.rows);
  return workbook;
}

function addSheet(workbook, sheetName, columns, rows) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const matrix = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  const range = sheet.getRangeByIndexes(0, 0, matrix.length, columns.length);
  range.values = matrix;
  range.format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  range.format.wrapText = true;
  sheet.getRangeByIndexes(0, 0, 1, columns.length).format = {
    fill: "#1F2937",
    font: { bold: true, color: "#FFFFFF" }
  };
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(3);
  const used = sheet.getUsedRange();
  used.format.autofitColumns();
  used.format.autofitRows();
}

async function verifyWorkbook(workbook) {
  const sheetInspect = await workbook.inspect({ kind: "sheet", include: "name", maxChars: 2000 });
  const errorInspect = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 200 },
    summary: "formula error scan"
  });
  await fs.writeFile(path.join(__dirname, "ANALYTIC_EXPORT_FINAL_SIMPLIFIED.inspect.ndjson"), `${sheetInspect.ndjson}\n${errorInspect.ndjson}\n`, "utf8");
  for (const sheetName of ["REPORTE CLT", "REPORTE HUT"]) {
    const preview = await workbook.render({ sheetName, range: "A1:L20", scale: 1, format: "png" });
    await fs.writeFile(path.join(__dirname, `${sheetName.replaceAll(" ", "_")}_preview.png`), new Uint8Array(await preview.arrayBuffer()));
  }
}

function safeJson(value) {
  if (value == null || value === "") return "";
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeAnswer(value) {
  return normalizeScalar(value).replace(/\s+\|\s+/g, ", ");
}

function normalizeScalar(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return value.map(normalizeScalar).filter(Boolean).join(", ");
  return String(value);
}

function ageRange(value) {
  const age = Number(String(value ?? "").match(/\d+/)?.[0] ?? "");
  if (!Number.isFinite(age)) return "";
  if (age <= 29) return "29 O MENOS";
  if (age <= 45) return "30-45";
  if (age <= 55) return "46-55";
  return "56 O MAS";
}

function inferArm(product) {
  if (!product) return "";
  return String(product);
}

function cellValue(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function getOrCreateMap(parent, key) {
  if (!parent.has(key)) parent.set(key, new Map());
  return parent.get(key);
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}
