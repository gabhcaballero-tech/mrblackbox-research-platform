import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

loadDotenv({ path: path.join(repoRoot, ".env") });

const folios = ["NAV-117", "NAV-100", "NAV-110", "NAV-078", "NAV-124", "NAV-129"];
const comparativeQuestionCodes = new Set([
  "HUT_P24_PREFERENCIA_GENERAL",
  "HUT_P25_COMPRA_PRIMERO",
  "HUT_P26_COMPRA_SEGUNDO",
  "HUT_P27_COMPARATIVA_ATRIBUTOS"
]);

const questionLabels = {
  HUT_P24_PREFERENCIA_GENERAL: "P24. Preferencia general",
  HUT_P25_COMPRA_PRIMERO: "P25. Probabilidad de compra primer perfume",
  HUT_P26_COMPRA_SEGUNDO: "P26. Probabilidad de compra segundo perfume",
  HUT_P27_COMPARATIVA_ATRIBUTOS: "P27. Comparativa de atributos"
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no esta configurado.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: false })
});

try {
  const rows = [];
  for (const folio of folios) {
    const confirmation = await prisma.participantConfirmation.findFirst({
      where: { folio },
      include: {
        studyParticipant: {
          include: {
            participantProfile: true,
            hutParticipant: {
              include: {
                applicationEvidence: { orderBy: { capturedAt: "asc" } },
                applicationPhotoEntries: { orderBy: { capturedAt: "asc" } },
                questionnaireAttempt: {
                  include: {
                    visits: { orderBy: { createdAt: "asc" } },
                    answers: {
                      include: { visitProgress: true },
                      orderBy: { answeredAt: "asc" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const participant = confirmation?.studyParticipant ?? null;
    const hut = participant?.hutParticipant ?? null;
    const attempt = hut?.questionnaireAttempt ?? null;
    const comparativeVisit = attempt?.visits?.find((visit) => visit.section === "COMPARATIVA") ?? null;
    const comparativeAnswers = (attempt?.answers ?? []).filter((answer) =>
      comparativeQuestionCodes.has(answer.questionCode) ||
      answer.visitProgress?.section === "COMPARATIVA"
    );
    const comparativeEvidence = [
      ...(hut?.applicationEvidence ?? []).filter((evidence) => String(evidence.phase).includes("COMPARATIVA")),
      ...(hut?.applicationPhotoEntries ?? []).filter((entry) => String(entry.notes ?? "").includes("COMPARATIVA"))
    ];
    let classification = "C_NO_EXISTE_CAPTURA";
    if (comparativeAnswers.length >= 4 || comparativeVisit?.status === "COMPLETED") {
      classification = comparativeAnswers.length > 0 ? "A_COMPARATIVA_REAL_CAPTURADA" : "B_SOLO_CIERRE_SIN_RESPUESTAS";
    } else if ((attempt?.visits ?? []).some((visit) => visit.section === "SEGUNDA_VISITA" && visit.status === "COMPLETED")) {
      classification = "B_SOLO_CIERRE_SEGUNDA_VISITA";
    }

    rows.push({
      folio,
      hutFolio: hut?.folio ?? null,
      participantName: participant?.participantProfile?.name ?? hut?.name ?? null,
      studyParticipantId: participant?.id ?? null,
      hutParticipantId: hut?.id ?? null,
      attempt: attempt ? {
        id: attempt.id,
        status: attempt.status,
        startedAt: iso(attempt.startedAt),
        completedAt: iso(attempt.completedAt),
        updatedAt: iso(attempt.updatedAt)
      } : null,
      comparativeVisit: comparativeVisit ? {
        id: comparativeVisit.id,
        section: comparativeVisit.section,
        status: comparativeVisit.status,
        startedAt: iso(comparativeVisit.startedAt),
        completedAt: iso(comparativeVisit.completedAt),
        updatedAt: iso(comparativeVisit.updatedAt)
      } : null,
      comparativeAnswers: comparativeAnswers.map((answer) => ({
        id: answer.id,
        questionCode: answer.questionCode,
        questionLabel: questionLabels[answer.questionCode] ?? answer.questionCode,
        sectionFromVisitProgress: answer.visitProgress?.section ?? null,
        answerJson: answer.answerJson,
        answeredAt: iso(answer.answeredAt),
        updatedAt: iso(answer.updatedAt)
      })),
      comparativeEvidence: comparativeEvidence.map((item) => ({
        id: item.id,
        type: "phase" in item ? "HutApplicationEvidence" : "HutApplicationPhotoEntry",
        phase: "phase" in item ? item.phase : null,
        useDayNumber: "useDayNumber" in item ? item.useDayNumber : null,
        capturedAt: iso(item.capturedAt),
        privateStorageKey: item.privateStorageKey
      })),
      allHutEvidence: [
        ...(hut?.applicationEvidence ?? []).map((evidence) => ({
          type: "HutApplicationEvidence",
          phase: evidence.phase,
          capturedAt: iso(evidence.capturedAt),
          privateStorageKey: evidence.privateStorageKey
        })),
        ...(hut?.applicationPhotoEntries ?? []).map((entry) => ({
          type: "HutApplicationPhotoEntry",
          useDayNumber: entry.useDayNumber,
          productCode: entry.productCode,
          capturedAt: iso(entry.capturedAt),
          privateStorageKey: entry.privateStorageKey
        }))
      ],
      classification
    });
  }

  const outputDir = path.join(repoRoot, "outputs", "hut_comparativa_validation_v1");
  await fs.mkdir(outputDir, { recursive: true });
  const outputJson = path.join(outputDir, "HUT_COMPARATIVA_SOURCE_VALIDATION_NAV_117_100_110_078_124_129.json");
  const outputCsv = path.join(outputDir, "HUT_COMPARATIVA_SOURCE_VALIDATION_NAV_117_100_110_078_124_129.csv");
  await fs.writeFile(outputJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, rows }, null, 2)}\n`, "utf8");
  await fs.writeFile(outputCsv, toCsv(rows), "utf8");
  console.log(JSON.stringify({ outputJson, outputCsv, rows: rows.map((row) => ({
    folio: row.folio,
    name: row.participantName,
    classification: row.classification,
    comparativeVisit: row.comparativeVisit?.status ?? null,
    comparativeAnswers: row.comparativeAnswers.length,
    comparativeEvidence: row.comparativeEvidence.length
  })) }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toCsv(rows) {
  const headers = [
    "folio",
    "hutFolio",
    "participantName",
    "classification",
    "comparativeVisitStatus",
    "comparativeVisitCompletedAt",
    "comparativeAnswersCount",
    "comparativeEvidenceCount",
    "questionCodes"
  ];
  return [
    headers.join(","),
    ...rows.map((row) => [
      row.folio,
      row.hutFolio ?? "",
      row.participantName ?? "",
      row.classification,
      row.comparativeVisit?.status ?? "",
      row.comparativeVisit?.completedAt ?? "",
      row.comparativeAnswers.length,
      row.comparativeEvidence.length,
      row.comparativeAnswers.map((answer) => answer.questionCode).join(" | ")
    ].map(csvCell).join(","))
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/u.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}
