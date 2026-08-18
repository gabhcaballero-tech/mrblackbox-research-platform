import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = process.env.V1_SPEC_STUDY_CODE || "FMASCULINA-NAVIGO-2026";
const OUTPUT_XLSX = path.join(__dirname, "V1_OPERATIVE_SPECIFICATION.xlsx");
const OUTPUT_JSON = path.join(__dirname, "V1_OPERATIVE_SPECIFICATION.json");
const PREVIEW_DIR = path.join(__dirname, "previews");
const MEXICO_CITY_TIMEZONE = "America/Mexico_City";
const MAX_CELL_TEXT = 28000;

const CODE_SOURCES = [
  ["SCREENING", "src/modules/registration-service.ts", "registro publico, duplicados, intento de screening"],
  ["SCREENING", "src/modules/screening-service.ts", "evaluacion y aprobacion de screening"],
  ["CLT", "src/modules/ctl/definition.ts", "definicion de cuestionario CLT e instrucciones"],
  ["CLT", "src/modules/ctl/public-session.ts", "sesion publica CLT y progreso"],
  ["CLT", "src/app/ctl/[studyCode]/sessions/[sessionId]/CtlMobileCapture.tsx", "captura movil CLT y confirmaciones"],
  ["CLT", "src/app/ctl/[studyCode]/sessions/[sessionId]/CtlNavigoPreparedPanel.tsx", "cierre CLT y preparacion Navigo"],
  ["NAVIGO", "src/modules/navigo-app/definition.ts", "cuestionario AP1-AP7 y horarios T3/T4.5/T6"],
  ["NAVIGO", "src/modules/navigo-app/repository.ts", "tokens, actividades, disponibilidad, WhatsApp Navigo"],
  ["NAVIGO", "src/modules/navigo-app/service.ts", "servicios Navigo"],
  ["NAVIGO", "src/app/api/navigo/reminders/route.ts", "endpoint cron recordatorios Navigo"],
  ["HUT", "src/modules/hut/definition.ts", "cuestionario HUT, filtros, evaluaciones, reglas"],
  ["HUT", "src/modules/hut/progress.ts", "progreso y siguiente seccion HUT"],
  ["HUT", "src/modules/hut/photo-timeline.ts", "timeline fotografico HUT y disponibilidad"],
  ["HUT", "src/modules/hut/phase-codes.ts", "codigos de fase HUT legacy"],
  ["HUT", "src/modules/hut/operational-codes.ts", "resolver codigos maestros HUT"],
  ["HUT", "src/modules/hut/second-stage-authorization.ts", "autorizacion segunda etapa HUT"],
  ["HUT", "src/modules/hut/third-stage-authorization.ts", "autorizacion tercera etapa HUT"],
  ["HUT", "src/modules/hut/second-product-release.ts", "liberacion segundo producto HUT"],
  ["HUT", "src/modules/hut/photo-reminders.ts", "candidatos recordatorio fotografico HUT"],
  ["HUT", "src/app/api/hut/reminders/route.ts", "endpoint cron recordatorios HUT"],
  ["HUT", "src/app/hut/p/[token]/page.tsx", "portal publico HUT foto-only"],
  ["HUT", "src/app/hut/p/[token]/photo/[slot]/page.tsx", "captura individual de foto HUT"],
  ["HUT", "src/app/field/hut/page.tsx", "portal encuestador HUT"],
  ["WHATSAPP", "src/modules/oneui-whatsapp/templates.ts", "plantillas Meta y defaults de idioma"],
  ["WHATSAPP", "src/modules/oneui-whatsapp/service.ts", "envio Meta WhatsApp"],
  ["WHATSAPP", "src/modules/oneui-whatsapp/participant-support.ts", "envios manuales soporte"],
  ["READINESS", "src/modules/participant-readiness/service.ts", "readiness observacional"]
];

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  const sourceInventory = await readSourceInventory();
  const codeExtraction = buildCodeExtraction(sourceInventory);
  const dbSnapshot = await readDatabaseSnapshot();
  const spec = buildSpecification(sourceInventory, codeExtraction, dbSnapshot);
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  const workbook = await buildWorkbook(spec);
  await verifyWorkbook(workbook);
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(OUTPUT_XLSX);
  console.log(
    JSON.stringify(
      {
        outputXlsx: OUTPUT_XLSX,
        outputJson: OUTPUT_JSON,
        studyCode: STUDY_CODE,
        summary: spec.summary
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function createPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado en .env.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: false })
    })
  };
}

async function readSourceInventory() {
  const rows = [];
  for (const [moduleName, relativePath, purpose] of CODE_SOURCES) {
    const absolutePath = path.join(repoRoot, relativePath);
    let text = "";
    let exists = false;
    try {
      text = await fs.readFile(absolutePath, "utf8");
      exists = true;
    } catch {
      text = "";
    }
    rows.push({
      moduleName,
      relativePath,
      absolutePath,
      purpose,
      exists,
      lineCount: exists ? text.split(/\r?\n/).length : 0,
      text
    });
  }
  return rows;
}

async function readDatabaseSnapshot() {
  const study = await prisma.study.findFirst({
    where: { code: STUDY_CODE },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      participantPortalConfig: {
        select: {
          folioPrefix: true,
          folioMaxSequence: true,
          nextFolioSequence: true,
          enabled: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });
  if (!study) {
    throw new Error(`No se encontro Study.code=${STUDY_CODE}`);
  }

  const [
    products,
    arms,
    rotationPlans,
    activitySchedules,
    questionnaireVersions,
    participantsCount,
    confirmationsCount,
    hutParticipantsCount,
    ctlCompletedCount,
    navigoActivityCounts,
    hutEvidenceCounts,
    whatsappTemplateCounts
  ] = await Promise.all([
    prisma.studyProduct.findMany({
      where: { studyId: study.id },
      orderBy: { internalCode: "asc" }
    }),
    prisma.studyArm.findMany({
      where: { studyId: study.id },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.rotationPlan.findMany({
      where: { studyId: study.id },
      include: {
        arms: {
          include: { studyArm: true, studyProduct: true },
          orderBy: { applicationOrder: "asc" }
        }
      },
      orderBy: { rotationCode: "asc" }
    }),
    prisma.activitySchedule.findMany({
      where: { studyId: study.id },
      include: { questionnaireVersion: true },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.questionnaireVersion.findMany({
      where: { studyId: study.id },
      orderBy: [{ status: "asc" }, { versionNumber: "asc" }]
    }),
    prisma.studyParticipant.count({ where: { studyId: study.id } }),
    prisma.participantConfirmation.count({ where: { studyId: study.id } }),
    prisma.hutParticipant.count({ where: { studyId: study.id } }),
    prisma.ctlSession.count({ where: { studyId: study.id, status: "COMPLETED" } }),
    prisma.participantActivity.groupBy({
      by: ["status"],
      where: { studyParticipant: { studyId: study.id } },
      _count: { _all: true }
    }),
    prisma.hutApplicationEvidence.groupBy({
      by: ["phase"],
      where: { participant: { studyId: study.id } },
      _count: { _all: true }
    }),
    prisma.oneuiWhatsAppMessage.groupBy({
      by: ["templateName"],
      where: { conversation: { studyId: study.id }, templateName: { not: null } },
      _count: { _all: true }
    }).catch(() => [])
  ]);

  return {
    study,
    products,
    arms,
    rotationPlans,
    activitySchedules,
    questionnaireVersions,
    counts: {
      participants: participantsCount,
      confirmations: confirmationsCount,
      hutParticipants: hutParticipantsCount,
      ctlCompleted: ctlCompletedCount,
      navigoActivityCounts,
      hutEvidenceCounts,
      whatsappTemplateCounts
    }
  };
}

function buildCodeExtraction(sourceInventory) {
  const byPath = new Map(sourceInventory.map((source) => [source.relativePath, source]));
  return {
    questions: [
      ...extractCtlQuestions(byPath.get("src/modules/ctl/definition.ts")),
      ...extractHutQuestions(byPath.get("src/modules/hut/definition.ts")),
      ...extractNavigoQuestions(byPath.get("src/modules/navigo-app/definition.ts"))
    ],
    instructions: extractInstructionRows(sourceInventory),
    rules: extractRuleRows(sourceInventory),
    evidence: extractEvidenceRows(sourceInventory),
    whatsapp: extractWhatsAppRows(sourceInventory),
    times: extractTimeRows(sourceInventory),
    products: extractProductRows(sourceInventory)
  };
}

function buildSpecification(sourceInventory, extraction, db) {
  const activities = [
    ...baseOperationalFlowRows(),
    ...db.activitySchedules.map((schedule) => ({
      moduleName: "NAVIGO",
      activityCode: schedule.code ?? schedule.type,
      name: schedule.name,
      actor: "Participante",
      portal: "/p/[token]",
      order: schedule.sortOrder,
      preconditions: "ParticipantAccessToken valido; T0 applicationStartedAt; actividad disponible; secuencia previa completada",
      nextActivity: nextNavigoActivity(schedule.code),
      sourceType: "DB",
      source: "activity_schedules",
      details: `offset=${schedule.offsetMinutes}; window=${schedule.windowStartsMinutes}..${schedule.windowEndsMinutes}; status=${schedule.status}`
    })),
    ...extraction.evidence
      .filter((row) => row.moduleName === "HUT_TIMELINE_SLOT")
      .map((row, index) => ({
        moduleName: "HUT",
        activityCode: row.code,
        name: row.name,
        actor: row.actor,
        portal: row.portal,
        order: 400 + index,
        preconditions: row.preconditions,
        nextActivity: row.nextActivity,
        sourceType: "CODE",
        source: row.source,
        details: row.moment
      }))
  ];

  const products = [
    ...db.products.map((product) => ({
      sourceType: "DB",
      category: "StudyProduct",
      code: product.internalCode,
      label: product.displayLabel,
      detail: product.isSensitive ? "Producto sensible" : "Producto no sensible",
      relation: product.realName,
      source: "study_products"
    })),
    ...db.arms.map((arm) => ({
      sourceType: "DB",
      category: "StudyArm",
      code: arm.code,
      label: arm.label,
      detail: `sortOrder=${arm.sortOrder}`,
      relation: "",
      source: "study_arms"
    })),
    ...db.rotationPlans.flatMap((plan) =>
      plan.arms.map((arm) => ({
        sourceType: "DB",
        category: "RotationPlanArm",
        code: plan.rotationCode,
        label: plan.name,
        detail: `order=${arm.applicationOrder}; arm=${arm.studyArm?.code}; product=${arm.studyProduct?.internalCode}; visible=${arm.participantVisibleLabel}`,
        relation: `plan=${plan.rotationCode}; mode=${plan.assignmentModeAllowed}; status=${plan.status}`,
        source: "rotation_plans + rotation_plan_arms"
      }))
    ),
    ...extraction.products
  ];

  const questionnaireDbRows = db.questionnaireVersions.flatMap((version) =>
    flattenQuestionnaireVersion(version)
  );

  const spec = {
    generatedAt: formatMexicoCityDateTime(new Date()),
    generatedForStudyCode: STUDY_CODE,
    timeZone: MEXICO_CITY_TIMEZONE,
    readOnlyNotice: "Auditoria generada en modo solo lectura: no modifica codigo, base ni datos.",
    summary: {
      study: `${db.study.code} - ${db.study.name}`,
      sourceFilesRead: sourceInventory.filter((source) => source.exists).length,
      sourceFilesMissing: sourceInventory.filter((source) => !source.exists).length,
      dbProducts: db.products.length,
      dbRotationPlans: db.rotationPlans.length,
      dbActivitySchedules: db.activitySchedules.length,
      questionsExtractedFromCode: extraction.questions.length,
      questionnaireVersionsFromDb: db.questionnaireVersions.length,
      activitiesDocumented: activities.length,
      whatsappTemplatesDocumented: extraction.whatsapp.length
    },
    study: db.study,
    counts: db.counts,
    sourceInventory: sourceInventory.map(({ text, ...source }) => source),
    flow: baseOperationalFlowRows(),
    activities,
    instructions: extraction.instructions,
    questions: [...extraction.questions, ...questionnaireDbRows],
    rules: extraction.rules,
    evidence: extraction.evidence,
    products,
    times: [
      ...db.activitySchedules.map((schedule) => ({
        moduleName: "NAVIGO",
        code: schedule.code,
        name: schedule.name,
        timingRule: `T0 + ${schedule.offsetMinutes} minutos`,
        window: `${schedule.windowStartsMinutes} a ${schedule.windowEndsMinutes} minutos relativos`,
        timeZone: MEXICO_CITY_TIMEZONE,
        sourceType: "DB",
        source: "activity_schedules"
      })),
      ...extraction.times
    ],
    whatsapp: [
      ...extraction.whatsapp,
      ...db.counts.whatsappTemplateCounts.map((row) => ({
        templateName: row.templateName ?? "(sin template)",
        event: "Historial outbound detectado",
        language: "",
        variables: "",
        sourceType: "DB",
        source: "oneui_whatsapp_messages",
        details: `mensajes=${row._count?._all ?? 0}`
      }))
    ]
  };
  return spec;
}

function baseOperationalFlowRows() {
  return [
    {
      moduleName: "SCREENING",
      activityCode: "SCREENING",
      name: "Cuestionario filtro y aprobacion",
      actor: "Participante / Admin revision",
      portal: "Portal publico de participacion / Admin",
      order: 10,
      preconditions: "Registro de contacto y consentimiento; validacion de duplicados",
      nextActivity: "CLT o HUT_DIRECTO segun protocolo",
      sourceType: "CODE+DB",
      source: "screening-service + participant_confirmations",
      details: "Crea StudyParticipant, ScreeningAttempt y, al aprobar, ParticipantConfirmation + ReferenceCodes"
    },
    {
      moduleName: "CLT",
      activityCode: "CLT",
      name: "Entrevista CLT completa",
      actor: "Encuestador",
      portal: "/ctl/[studyCode]/sessions/[sessionId]",
      order: 100,
      preconditions: "Screening aprobado; ParticipantConfirmation; codigo slot 1; rotaciones CLT/triangular listas",
      nextActivity: "NAVIGO",
      sourceType: "CODE+DB",
      source: "src/modules/ctl + ctl_sessions",
      details: "Incluye filtros, triangulares, evaluacion primera fragancia, segunda fragancia, comparativa y demograficos"
    },
    {
      moduleName: "NAVIGO",
      activityCode: "NAVIGO_T0",
      name: "Preparacion Navigo desde CLT",
      actor: "Sistema / Encuestador",
      portal: "Cierre CLT + Admin Navigo",
      order: 200,
      preconditions: "CtlSession COMPLETED; inicio de Seccion V Comparativa 15 minutos como T0",
      nextActivity: "T3_HORAS",
      sourceType: "CODE",
      source: "CtlNavigoPreparedPanel + navigo-app",
      details: "Crea token/enlace y actividades T3/T4.5/T6; envio WhatsApp inicial opcional/manual"
    },
    {
      moduleName: "HUT",
      activityCode: "HUT_PHOTO_PORTAL",
      name: "Portal participante HUT foto-only",
      actor: "Participante",
      portal: "/hut/p/[token]",
      order: 300,
      preconditions: "HutParticipant activo con token valido; no reserva sin identidad",
      nextActivity: "Fotos de Producto 1 / evaluaciones de campo",
      sourceType: "CODE",
      source: "src/app/hut/p/[token]",
      details: "Muestra solo seguimiento fotografico; no expone cuestionario"
    },
    {
      moduleName: "HUT",
      activityCode: "FIELD_HUT",
      name: "Captura encuestador HUT",
      actor: "Encuestador / Supervisor",
      portal: "/field/hut",
      order: 350,
      preconditions: "Codigo de encuestador o supervisor; participante asignado o modo supervisor",
      nextActivity: "Evaluacion primer perfume, entrega segundo producto, confirmacion uso, comparativa",
      sourceType: "CODE",
      source: "src/app/field/hut/page.tsx",
      details: "Aplica cuestionario HUT; respeta codigos maestros y progreso por preguntas required"
    },
    {
      moduleName: "HUT",
      activityCode: "COMPARATIVA",
      name: "Evaluacion comparativa HUT",
      actor: "Encuestador",
      portal: "/field/hut",
      order: 500,
      preconditions: "Confirmacion uso segundo perfume; reglas de tercera etapa/codigo slot 3",
      nextActivity: "Cierre HUT",
      sourceType: "CODE",
      source: "src/modules/hut/definition.ts",
      details: "Incluye preguntas comparativas P24-P27 segun definicion V1"
    }
  ];
}

function flattenQuestionnaireVersion(version) {
  const rows = [];
  const definition = version.definitionJson;
  const versionLabel = `QV${version.versionNumber} ${version.status}`;
  const found = [];
  walkQuestionnaireDefinition(definition, [], found);
  if (found.length === 0) {
    return [
      {
        sourceType: "DB",
        moduleName: "QUESTIONNAIRE_VERSION",
        questionId: `version-${version.versionNumber}`,
        activity: versionLabel,
        textExact: summarizeJson(definition),
        type: "definitionJson",
        options: "",
        scale: "",
        required: "",
        condition: `hash=${version.definitionHash}; publishedAt=${formatIso(version.publishedAt)}`,
        source: "questionnaire_versions.definitionJson"
      }
    ];
  }
  for (const item of found) {
    const node = item.node;
    const id = node.id ?? node.code ?? node.questionId ?? node.key ?? node.name;
    rows.push({
      sourceType: "DB",
      moduleName: inferDbQuestionModule(definition, id, item.path),
      questionId: String(id),
      activity: `${versionLabel}; ${inferDbActivity(node, item.path)}`,
      textExact: node.text ?? node.label ?? node.title ?? node.displayTemplate ?? "",
      type: node.type ?? node.questionType ?? "",
      options: flattenDbOptions(node),
      scale: flattenDbScale(node),
      required: node.required === undefined ? "" : String(node.required),
      condition: [
        node.visibleIf ? `visibleIf=${JSON.stringify(node.visibleIf)}` : "",
        node.skipRules ? `skipRules=${JSON.stringify(node.skipRules)}` : "",
        node.terminationRules ? `terminationRules=${JSON.stringify(node.terminationRules)}` : "",
        node.requiredForCltHut !== undefined ? `requiredForCltHut=${node.requiredForCltHut}` : "",
        `hash=${version.definitionHash}`,
        `publishedAt=${formatIso(version.publishedAt)}`
      ].filter(Boolean).join(" | "),
      source: `questionnaire_versions.definitionJson path=${item.path.join(".")}`
    });
  }
  return rows;
}

function walkQuestionnaireDefinition(node, currentPath, found) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkQuestionnaireDefinition(child, [...currentPath, String(index)], found));
    return;
  }
  const hasQuestionIdentity =
    typeof node.id === "string" ||
    typeof node.code === "string" ||
    typeof node.questionId === "string";
  const hasQuestionText =
    typeof node.text === "string" ||
    typeof node.label === "string" ||
    typeof node.displayTemplate === "string";
  if (hasQuestionIdentity && hasQuestionText && !isLikelyOptionOnlyNode(node)) {
    found.push({ node, path: currentPath });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "options" || key === "rows" || key === "columns" || key === "scoreByAnswer") continue;
    walkQuestionnaireDefinition(value, [...currentPath, key], found);
  }
}

function isLikelyOptionOnlyNode(node) {
  return (
    typeof node.value !== "undefined" &&
    typeof node.label === "string" &&
    !node.text &&
    !node.displayTemplate &&
    !node.required &&
    !node.section
  );
}

function inferDbQuestionModule(definition, questionId, currentPath) {
  const serialized = JSON.stringify(definition).slice(0, 2000);
  const id = String(questionId ?? "");
  if (id.startsWith("AP")) return "NAVIGO_DB";
  if (id.startsWith("HUT_")) return "HUT_DB";
  if (/Ctl|CLT|nse|P5A|P14/i.test(serialized) || /^P\d|^D\d|^F\d/.test(id)) return "CLT_DB";
  return currentPath.includes("screening") ? "SCREENING_DB" : "QUESTIONNAIRE_DB";
}

function inferDbActivity(node, currentPath) {
  if (node.section) return String(node.section);
  const pathText = currentPath.join(".");
  if (/questions/i.test(pathText)) return pathText.replace(/\.\d+$/, "");
  return pathText;
}

function flattenDbOptions(node) {
  if (!Array.isArray(node.options)) return "";
  return node.options
    .map((option) => `${option.value ?? option.id ?? ""}=${option.label ?? option.text ?? ""}`)
    .join(" | ");
}

function flattenDbScale(node) {
  const pieces = [];
  if (node.min !== undefined || node.max !== undefined) {
    pieces.push(`${node.min ?? ""}..${node.max ?? ""}`);
  }
  if (Array.isArray(node.columns)) {
    pieces.push(
      node.columns.map((column) => `${column.value ?? ""}=${column.label ?? column.text ?? ""}`).join(" | ")
    );
  }
  if (node.minLabel || node.maxLabel) {
    pieces.push(`minLabel=${node.minLabel ?? ""}; maxLabel=${node.maxLabel ?? ""}`);
  }
  return pieces.join(" || ");
}

function nextNavigoActivity(code) {
  if (code === "T3_HORAS") return "T4_5_HORAS";
  if (code === "T4_5_HORAS") return "T6_HORAS";
  if (code === "T6_HORAS") return "Cierre Navigo";
  return "";
}

function extractCtlQuestions(source) {
  return extractObjectQuestions(source, {
    moduleName: "CLT",
    activityFromCode: ctlActivityFromCode,
    codeRegex: /code:\s*"([^"]+)"/g
  });
}

function extractHutQuestions(source) {
  return extractObjectQuestions(source, {
    moduleName: "HUT",
    activityFromCode: hutActivityFromSnippet,
    codeRegex: /code:\s*"([^"]+)"/g
  });
}

function extractNavigoQuestions(source) {
  if (!source?.exists) return [];
  const rows = [];
  const text = source.text;
  for (const match of text.matchAll(/(?:singleChoiceQuestion|scaleQuestion)\(\{\s*id:\s*"([^"]+)"([\s\S]*?)\n\s*\}\)/g)) {
    const id = match[1];
    const snippet = match[0];
    rows.push({
      sourceType: "CODE",
      moduleName: "NAVIGO",
      questionId: id,
      activity: "T3_HORAS/T4_5_HORAS/T6_HORAS",
      textExact: firstStringProperty(snippet, "text"),
      type: snippet.includes("scaleQuestion") ? "scale" : "single_choice",
      options: extractOptions(snippet),
      scale: extractScale(snippet),
      required: "true",
      condition: "",
      source: `${source.relativePath}:${lineForIndex(text, match.index)}`
    });
  }
  return rows;
}

function extractObjectQuestions(source, config) {
  if (!source?.exists) return [];
  const rows = [];
  const text = source.text;
  for (const match of text.matchAll(config.codeRegex)) {
    const code = match[1];
    if (isTypeDefinitionCode(code)) continue;
    const objectSnippet = extractContainingObject(text, match.index);
    if (!objectSnippet) continue;
    const line = lineForIndex(text, match.index);
    rows.push({
      sourceType: "CODE",
      moduleName: config.moduleName,
      questionId: code,
      activity: typeof config.activityFromCode === "function" ? config.activityFromCode(code, objectSnippet) : "",
      textExact: firstStringProperty(objectSnippet, "label") || firstStringProperty(objectSnippet, "displayTemplate"),
      type: firstStringProperty(objectSnippet, "type"),
      options: extractOptions(objectSnippet),
      scale: extractScale(objectSnippet),
      required: firstBooleanProperty(objectSnippet, "required"),
      condition: buildQuestionCondition(objectSnippet),
      source: `${source.relativePath}:${line}`
    });
  }
  return dedupeBy(rows, (row) => `${row.moduleName}:${row.questionId}:${row.source}`);
}

function extractInstructionRows(sources) {
  const rows = [];
  for (const source of sources.filter((candidate) => candidate.exists)) {
    const text = source.text;
    const patterns = [
      /instructions:\s*\[([\s\S]*?)\]/g,
      /const\s+\w*Instruction\w*\s*:[^=]+=\s*\{([\s\S]*?)\};/g,
      /(?:title|text|note|instructions?|interviewerTask):\s*"([^"]{12,})"/g
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const snippet = match[0];
        const line = lineForIndex(text, match.index);
        rows.push({
          moduleName: source.moduleName,
          activityOrQuestion: nearestCodeBefore(text, match.index) ?? "",
          audience: inferAudience(snippet),
          instructionType: inferInstructionType(snippet),
          text: cleanSnippet(snippet),
          materials: inferMaterials(snippet),
          validation: inferValidation(snippet),
          sourceType: "CODE",
          source: `${source.relativePath}:${line}`
        });
      }
    }
  }
  return dedupeBy(rows, (row) => `${row.moduleName}:${row.source}:${row.text}`).slice(0, 800);
}

function extractRuleRows(sources) {
  const rows = [];
  const keywords = [
    "terminationRules",
    "skipRules",
    "terminates",
    "skipTo",
    "requiredForCltHut",
    "requiredOptionValues",
    "missingRequiredOptionValues",
    "SECOND_STAGE_AUTHORIZED",
    "SECOND_PRODUCT_RELEASED",
    "THIRD_STAGE_AUTHORIZED",
    "faceVerificationRequired",
    "AVAILABLE_OVERRIDE",
    "reopenedAt",
    "HUT_REMINDER_BLOCKED",
    "OUTSIDE_OPERATIONAL_WINDOW",
    "15:00",
    "18:00"
  ];
  for (const source of sources.filter((candidate) => candidate.exists)) {
    const lines = source.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!keywords.some((keyword) => line.includes(keyword))) return;
      rows.push({
        moduleName: source.moduleName,
        ruleType: inferRuleType(line),
        subject: nearestCodeBefore(source.text, source.text.split(/\r?\n/).slice(0, index).join("\n").length),
        condition: cleanSnippet(line),
        action: inferRuleAction(line),
        reason: "",
        sourceType: "CODE",
        source: `${source.relativePath}:${index + 1}`
      });
    });
  }
  return rows;
}

function extractEvidenceRows(sources) {
  const rows = [];
  const timeline = sources.find((source) => source.relativePath === "src/modules/hut/photo-timeline.ts");
  if (timeline?.exists) {
    for (const match of timeline.text.matchAll(/\{\s*dayLabel:\s*"([^"]+)"([\s\S]*?)id:\s*"([^"]+)"([\s\S]*?)note:\s*"([^"]+)"/g)) {
      const name = match[1];
      const id = match[3];
      const note = match[5];
      rows.push({
        moduleName: "HUT_TIMELINE_SLOT",
        code: id,
        name,
        evidenceType: id.includes("EVALUATION") ? "Visita/evaluacion encuestador" : "Foto HUT",
        actor: id.includes("EVALUATION") ? "Encuestador" : "Participante",
        portal: id.includes("EVALUATION") ? "/field/hut" : "/hut/p/[token]/photo/[slot]",
        moment: note,
        preconditions: inferTimelinePreconditions(id),
        nextActivity: nextHutTimelineSlot(id),
        sourceType: "CODE",
        source: `${timeline.relativePath}:${lineForIndex(timeline.text, match.index)}`
      });
    }
  }

  for (const source of sources.filter((candidate) => candidate.exists)) {
    const evidenceRegex = /(HutApplicationEvidence|HutApplicationPhotoEntry|ParticipantActivityEvidence|MediaEvidence|ReferenceSelfie|selfie|photo|foto|evidence|evidencia)/gi;
    const lines = source.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!evidenceRegex.test(line)) return;
      rows.push({
        moduleName: source.moduleName,
        code: nearestCodeBefore(source.text, source.text.split(/\r?\n/).slice(0, index).join("\n").length) ?? "",
        name: "",
        evidenceType: inferEvidenceType(line),
        actor: inferAudience(line),
        portal: "",
        moment: cleanSnippet(line),
        preconditions: "",
        nextActivity: "",
        sourceType: "CODE",
        source: `${source.relativePath}:${index + 1}`
      });
    });
  }
  return dedupeBy(rows, (row) => `${row.source}:${row.moment}`).slice(0, 500);
}

function extractWhatsAppRows(sources) {
  const rows = [];
  for (const source of sources.filter((candidate) => candidate.exists && candidate.moduleName === "WHATSAPP" || candidate.relativePath.includes("/api/"))) {
    const text = source.text;
    const templateMatches = [
      ...text.matchAll(/templateName:\s*([^,\n]+)/g),
      ...text.matchAll(/name:\s*process\.env\.[^?]+\?\?\s*"([^"]+)"/g),
      ...text.matchAll(/"((?:navigo|hut|oneui)[a-z0-9_]+)"/g)
    ];
    for (const match of templateMatches) {
      const raw = (match[1] ?? "").trim();
      if (!raw || raw.length > 120 || !/(navigo|hut|oneui)/i.test(raw)) continue;
      const line = lineForIndex(text, match.index);
      rows.push({
        templateName: raw.replace(/^["']|["']$/g, ""),
        event: inferWhatsAppEvent(text, match.index),
        language: nearestEnvOrLiteral(text, match.index, /LANGUAGE[^\n]+/),
        variables: inferWhatsAppVariables(text, match.index),
        sourceType: "CODE",
        source: `${source.relativePath}:${line}`,
        details: cleanSnippet(extractWindow(text, match.index, 700))
      });
    }
  }
  return dedupeBy(rows, (row) => `${row.templateName}:${row.source}`).slice(0, 200);
}

function extractTimeRows(sources) {
  const rows = [];
  for (const source of sources.filter((candidate) => candidate.exists)) {
    const lines = source.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/(America\/Mexico_City|offsetMinutes|windowStartsMinutes|windowEndsMinutes|04:00|15:00|18:00|cron|schedule|availableFrom|availableUntil|nextPhotoCaptureAvailableAt|T3_HORAS|T4_5_HORAS|T6_HORAS)/.test(line)) {
        return;
      }
      rows.push({
        moduleName: source.moduleName,
        code: nearestCodeBefore(source.text, source.text.split(/\r?\n/).slice(0, index).join("\n").length) ?? "",
        name: "",
        timingRule: cleanSnippet(line),
        window: inferWindow(line),
        timeZone: line.includes("America/Mexico_City") ? MEXICO_CITY_TIMEZONE : "",
        sourceType: "CODE",
        source: `${source.relativePath}:${index + 1}`
      });
    });
  }
  return rows.slice(0, 500);
}

function extractProductRows(sources) {
  const rows = [];
  for (const source of sources.filter((candidate) => candidate.exists)) {
    const lines = source.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/(EVA1|EVA2|PR1|PR2|PR3|PR4|PR5|PR6|VERI_1|VERI_2|triangular|rotation|Rotation|firstFragrance|secondFragrance|productCode)/.test(line)) return;
      rows.push({
        sourceType: "CODE",
        category: source.moduleName,
        code: nearestCodeBefore(source.text, source.text.split(/\r?\n/).slice(0, index).join("\n").length) ?? "",
        label: "",
        detail: cleanSnippet(line),
        relation: "",
        source: `${source.relativePath}:${index + 1}`
      });
    });
  }
  return rows.slice(0, 700);
}

async function buildWorkbook(spec) {
  const workbook = Workbook.create();
  addSheet(workbook, "RESUMEN", [
    ["Campo", "Valor"],
    ["Estudio", spec.summary.study],
    ["Generado", spec.generatedAt],
    ["Zona horaria operativa", spec.timeZone],
    ["Aviso", spec.readOnlyNotice],
    ["Archivos de codigo leidos", spec.summary.sourceFilesRead],
    ["Archivos de codigo faltantes", spec.summary.sourceFilesMissing],
    ["Actividades documentadas", spec.summary.activitiesDocumented],
    ["Preguntas extraidas de codigo", spec.summary.questionsExtractedFromCode],
    ["Versiones cuestionario BD", spec.summary.questionnaireVersionsFromDb],
    ["Productos BD", spec.summary.dbProducts],
    ["Planes rotacion BD", spec.summary.dbRotationPlans],
    ["Schedules Navigo BD", spec.summary.dbActivitySchedules],
    ["Templates WhatsApp documentados", spec.summary.whatsappTemplatesDocumented],
    ["Participantes V1 en estudio", spec.counts.participants],
    ["Confirmaciones V1", spec.counts.confirmations],
    ["HUT participants V1", spec.counts.hutParticipants],
    ["CLT completados V1", spec.counts.ctlCompleted]
  ]);

  addJsonSheet(workbook, "FLUJO_ESTUDIO", spec.flow, [
    "order",
    "moduleName",
    "activityCode",
    "name",
    "actor",
    "portal",
    "preconditions",
    "nextActivity",
    "details",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "ACTIVIDADES", spec.activities, [
    "order",
    "moduleName",
    "activityCode",
    "name",
    "actor",
    "portal",
    "preconditions",
    "nextActivity",
    "details",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "INSTRUCCIONES", spec.instructions, [
    "moduleName",
    "activityOrQuestion",
    "audience",
    "instructionType",
    "text",
    "materials",
    "validation",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "PREGUNTAS", spec.questions, [
    "moduleName",
    "activity",
    "questionId",
    "textExact",
    "type",
    "options",
    "scale",
    "required",
    "condition",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "REGLAS", spec.rules, [
    "moduleName",
    "ruleType",
    "subject",
    "condition",
    "action",
    "reason",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "EVIDENCIAS", spec.evidence, [
    "moduleName",
    "code",
    "name",
    "evidenceType",
    "actor",
    "portal",
    "moment",
    "preconditions",
    "nextActivity",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "PRODUCTOS_ROTACIONES", spec.products, [
    "category",
    "code",
    "label",
    "detail",
    "relation",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "TIEMPOS", spec.times, [
    "moduleName",
    "code",
    "name",
    "timingRule",
    "window",
    "timeZone",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "WHATSAPP", spec.whatsapp, [
    "templateName",
    "event",
    "language",
    "variables",
    "details",
    "sourceType",
    "source"
  ]);
  addJsonSheet(workbook, "FUENTES", spec.sourceInventory, [
    "moduleName",
    "relativePath",
    "purpose",
    "exists",
    "lineCount",
    "absolutePath"
  ]);
  return workbook;
}

function addSheet(workbook, name, rows) {
  const sheet = workbook.worksheets.add(name);
  const matrix = rows.map((row) => row.map((value) => normalizeCell(value)));
  sheet.getRangeByIndexes(0, 0, matrix.length, matrix[0].length).values = matrix;
  styleSheet(sheet, matrix.length, matrix[0].length, rows[0]);
}

function addJsonSheet(workbook, name, rows, columns) {
  const sheet = workbook.worksheets.add(name);
  const matrix = [columns, ...rows.map((row) => columns.map((column) => normalizeCell(row[column])))];
  sheet.getRangeByIndexes(0, 0, matrix.length, matrix[0].length).values = matrix;
  styleSheet(sheet, matrix.length, matrix[0].length, columns);
}

function styleSheet(sheet, rowCount, colCount, headers = []) {
  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format.font = { name: "Aptos", size: 10 };
  used.format.wrapText = true;
  used.format.borders = { preset: "inside", style: "thin", color: "#E5E7EB" };
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true
  };
  header.format.rowHeight = 26;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  used.format.autofitColumns();
  used.format.autofitRows();
  for (let col = 0; col < colCount; col += 1) {
    const colRange = sheet.getRangeByIndexes(0, col, rowCount, 1);
    const header = String(headers[col] ?? "").toLowerCase();
    const width = widthForHeader(header, colCount);
    colRange.format.columnWidth = width;
  }
}

function widthForHeader(header, colCount) {
  if (colCount === 2) return header.includes("campo") ? 36 : 74;
  if (/(text|texto|exact|condition|details|detalle|preconditions|moment|instruction|options|scale|source|absolute|purpose|validation|materials|window|timing|relation)/i.test(header)) {
    return 48;
  }
  if (/(name|nombre|activity|portal|template|question|source)/i.test(header)) return 30;
  if (/(order|status|required|exists|count|type|actor|code|module|category)/i.test(header)) return 18;
  return 24;
}

async function verifyWorkbook(workbook) {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const summary = await workbook.inspect({
    kind: "sheet",
    include: "id,name",
    maxChars: 4000
  });
  console.log(summary.ndjson);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan"
  });
  console.log(errors.ndjson);

  for (const sheetName of [
    "RESUMEN",
    "FLUJO_ESTUDIO",
    "ACTIVIDADES",
    "INSTRUCCIONES",
    "PREGUNTAS",
    "REGLAS",
    "EVIDENCIAS",
    "PRODUCTOS_ROTACIONES",
    "TIEMPOS",
    "WHATSAPP",
    "FUENTES"
  ]) {
    const preview = await workbook.render({
      sheetName,
      range: "A1:J24",
      scale: 1,
      format: "png"
    });
    await fs.writeFile(
      path.join(PREVIEW_DIR, `${sheetName}.png`),
      new Uint8Array(await preview.arrayBuffer())
    );
  }
}

function normalizeCell(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return safeText(String(value));
}

function safeText(value) {
  return value.length > MAX_CELL_TEXT ? `${value.slice(0, MAX_CELL_TEXT - 20)}... [TRUNCADO]` : value;
}

function formatIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function formatMexicoCityDateTime(date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MEXICO_CITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function summarizeJson(value) {
  if (!value) return "";
  const text = JSON.stringify(value);
  return safeText(text.length > 2500 ? `${text.slice(0, 2500)}...` : text);
}

function isTypeDefinitionCode(code) {
  return /^(A_B|C_PLUS|C_TIPICO|C_MINUS|D_PLUS|D|E)$/.test(code);
}

function ctlActivityFromCode(code) {
  if (/^F\d|^F0/.test(code)) return "Filtros CLT";
  if (code === "P1" || code === "P2" || code.startsWith("TRI1_")) return "Triangular 1";
  if (code === "P3" || code === "P4" || code.startsWith("TRI2_")) return "Triangular 2";
  if (/A$|^P(5A|6A|7A|8A|9A|10A|11A|12A|13A)/.test(code)) return "Evaluacion primera fragancia";
  if (/B$|^P(5B|6B|7B|8B|9B|10B|11B|12B|13B)/.test(code)) return "Evaluacion segunda fragancia";
  if (/^P1[4-9]|^P20/.test(code)) return "Comparativa";
  if (/^D\d|NSE|DEMOGRAF/.test(code)) return "Demograficos";
  return "CLT";
}

function hutActivityFromSnippet(code, snippet) {
  const section = firstStringProperty(snippet, "section");
  if (section) return section;
  if (code.startsWith("HUT_F")) return "FILTROS";
  if (code.includes("P1B") || code.includes("P2B") || code.includes("P3B")) return "CONFIRMACION_USO_SEGUNDO_PERFUME";
  if (/P2[4-7]/.test(code)) return "COMPARATIVA";
  return "HUT";
}

function extractContainingObject(text, index) {
  let start = index;
  while (start >= 0 && text[start] !== "{") start -= 1;
  if (start < 0) return "";
  let depth = 0;
  for (let end = start; end < text.length; end += 1) {
    const char = text[end];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, end + 1);
  }
  return "";
}

function firstStringProperty(snippet, property) {
  const match = snippet.match(new RegExp(`${property}:\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
}

function firstBooleanProperty(snippet, property) {
  const match = snippet.match(new RegExp(`${property}:\\s*(true|false)`, "m"));
  return match?.[1] ?? "";
}

function extractOptions(snippet) {
  const options = [...snippet.matchAll(/\{\s*label:\s*"([^"]+)"[\s\S]{0,160}?value:\s*"?([^",}\n]+)"?/g)].map(
    (match) => `${match[2]}=${match[1]}`
  );
  return options.join(" | ");
}

function extractScale(snippet) {
  const min = snippet.match(/min:\s*(\d+)/)?.[1];
  const max = snippet.match(/max:\s*(\d+)/)?.[1];
  const columns = [...snippet.matchAll(/\{\s*label:\s*"([^"]+)"\s*,\s*value:\s*(\d+)/g)].map(
    (match) => `${match[2]}=${match[1]}`
  );
  if (columns.length) return columns.join(" | ");
  if (min || max) return `${min ?? ""}..${max ?? ""}`;
  return "";
}

function buildQuestionCondition(snippet) {
  const parts = [];
  for (const key of ["visibleIf", "skipRules", "terminationRules", "requiredForCltHut", "requiredOptionValues"]) {
    if (snippet.includes(`${key}:`)) {
      parts.push(cleanSnippet(extractPropertyBlock(snippet, key)));
    }
  }
  return parts.join(" || ");
}

function extractPropertyBlock(snippet, key) {
  const index = snippet.indexOf(`${key}:`);
  if (index < 0) return "";
  return snippet.slice(index, Math.min(snippet.length, index + 450));
}

function lineForIndex(text, index = 0) {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function nearestCodeBefore(text, index) {
  const prefix = text.slice(Math.max(0, index - 1800), index);
  const matches = [...prefix.matchAll(/(?:code|id|questionCode|section):\s*"([^"]+)"/g)];
  return matches.at(-1)?.[1] ?? null;
}

function inferAudience(text) {
  const lower = text.toLowerCase();
  if (lower.includes("participante")) return "Participante";
  if (lower.includes("entrevistador") || lower.includes("encuestador")) return "Encuestador";
  if (lower.includes("admin") || lower.includes("supervisor")) return "Admin/Supervisor";
  return "";
}

function inferInstructionType(text) {
  if (/ROTAR|rotation/i.test(text)) return "ROTACION";
  if (/SONDEO|INSISTA/i.test(text)) return "SONDEO";
  if (/VALIDAR|confirm/i.test(text)) return "VALIDACION";
  return "INSTRUCCION";
}

function inferMaterials(text) {
  const materials = [];
  if (/perfume|fragancia|producto/i.test(text)) materials.push("fragancia/producto");
  if (/tira|triangular|PR\d|VERI/i.test(text)) materials.push("tiras triangulares");
  if (/foto|camara|evidencia/i.test(text)) materials.push("camara/foto");
  if (/codigo/i.test(text)) materials.push("codigo operativo");
  return materials.join(", ");
}

function inferValidation(text) {
  if (/TERMINAR|terminates/i.test(text)) return "Puede terminar entrevista";
  if (/required|oblig/i.test(text)) return "Requerido";
  if (/codigo|code/i.test(text)) return "Validacion de codigo";
  if (/dominio|origin|preview/i.test(text)) return "Validacion dominio publico";
  return "";
}

function inferRuleType(line) {
  if (/termination|terminates|TERMINAR/i.test(line)) return "TERMINACION";
  if (/skip|PASE/i.test(line)) return "SALTO";
  if (/required/i.test(line)) return "OBLIGATORIEDAD";
  if (/SECOND|STAGE|PRODUCT/i.test(line)) return "COMPUERTA_HUT";
  if (/REMINDER|WINDOW|OUTSIDE|15:00|18:00/i.test(line)) return "WHATSAPP_TIEMPO";
  if (/reopened|OVERRIDE/i.test(line)) return "OVERRIDE";
  return "REGLA";
}

function inferRuleAction(line) {
  if (/TERMINATE|TERMINAR|terminates/i.test(line)) return "Terminar";
  if (/skip|goTo|skipTo/i.test(line)) return "Saltar";
  if (/BLOCK|blocked|bloque/i.test(line)) return "Bloquear";
  if (/AVAILABLE|available|liberar/i.test(line)) return "Habilitar";
  return "";
}

function inferEvidenceType(line) {
  if (/selfie/i.test(line)) return "Selfie";
  if (/PhotoEntry|foto|photo/i.test(line)) return "Foto";
  if (/Evidence/i.test(line)) return "Evidencia";
  return "";
}

function inferTimelinePreconditions(id) {
  const map = {
    DELIVERY: "HUT iniciado / entrega realizada por operacion",
    PRODUCT_1_DAY_1: "Entrega completada o compatibilidad historica; slot disponible",
    PRODUCT_1_DAY_2: "Producto 1 Dia 1 completado; siguiente dia 04:00 CDMX salvo testMode/override",
    PRODUCT_1_DAY_3_MORNING: "Producto 1 Dia 2 completado; siguiente dia 04:00 CDMX salvo testMode/override",
    PRODUCT_1_EVALUATION_1: "Producto 1 ciclo fotografico completo; segunda etapa autorizada segun codigo/resolver",
    PRODUCT_2_DAY_1: "Evaluacion primer perfume completada; SECOND_PRODUCT_RELEASED o legacy valido",
    PRODUCT_2_DAY_2: "Producto 2 Dia 1 completado; siguiente dia 04:00 CDMX salvo testMode/override",
    PRODUCT_2_DAY_3_MORNING: "Producto 2 Dia 2 completado; siguiente dia 04:00 CDMX salvo testMode/override",
    PRODUCT_2_EVALUATION_2: "Producto 2 ciclo fotografico completo; tercera etapa/autorizacion segun resolver"
  };
  return map[id] ?? "";
}

function nextHutTimelineSlot(id) {
  const order = [
    "DELIVERY",
    "PRODUCT_1_DAY_1",
    "PRODUCT_1_DAY_2",
    "PRODUCT_1_DAY_3_MORNING",
    "PRODUCT_1_EVALUATION_1",
    "PRODUCT_2_DAY_1",
    "PRODUCT_2_DAY_2",
    "PRODUCT_2_DAY_3_MORNING",
    "PRODUCT_2_EVALUATION_2"
  ];
  const index = order.indexOf(id);
  return index >= 0 ? order[index + 1] ?? "Cierre HUT" : "";
}

function inferWhatsAppEvent(text, index) {
  const window = extractWindow(text, index, 1200);
  if (/Reminder|recordatorio|reminder/i.test(window)) return "Recordatorio";
  if (/Link|enlace|access/i.test(window)) return "Envio enlace";
  if (/both|ambos|combined/i.test(window)) return "Envio ambos enlaces";
  return "";
}

function inferWhatsAppVariables(text, index) {
  const window = extractWindow(text, index, 900);
  const variables = [];
  if (/participantName|nombre|name/i.test(window)) variables.push("nombre");
  if (/navigo.*link|linkNavigo|link_navigo/i.test(window)) variables.push("link_navigo");
  if (/hut.*link|linkHut|link_hut/i.test(window)) variables.push("link_hut");
  if (/folio/i.test(window)) variables.push("folio");
  return variables.join(", ");
}

function nearestEnvOrLiteral(text, index, regex) {
  const window = extractWindow(text, index, 1000);
  return cleanSnippet(window.match(regex)?.[0] ?? "");
}

function inferWindow(line) {
  if (/15:00|18:00/.test(line)) return "15:00-18:00 CDMX";
  if (/04:00|4,\s*0|hour,\s*minute/.test(line)) return "04:00 CDMX";
  return "";
}

function extractWindow(text, index, size) {
  return text.slice(Math.max(0, index - Math.floor(size / 2)), Math.min(text.length, index + Math.floor(size / 2)));
}

function cleanSnippet(value) {
  return safeText(String(value ?? "").replace(/\s+/g, " ").trim());
}

function dedupeBy(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}
