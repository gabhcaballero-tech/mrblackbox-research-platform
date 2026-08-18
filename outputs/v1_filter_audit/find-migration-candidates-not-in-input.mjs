import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = process.env.AUDIT_STUDY_CODE || "FMASCULINA-NAVIGO-2026";
const INPUT_FILE = process.argv[2] || "C:\\Users\\gabhc\\Downloads\\FILTROS QUE NO PASAN.xlsx";
const OUTPUT_FILE = path.join(__dirname, "candidatos_migracion_fuera_de_lista.json");

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  const inputFolios = await readInputFolios(INPUT_FILE);
  const study = await prisma.study.findFirst({ where: { code: STUDY_CODE }, select: { id: true, code: true } });
  if (!study) throw new Error(`No se encontro el estudio ${STUDY_CODE}.`);

  const participants = await prisma.studyParticipant.findMany({
    where: { studyId: study.id },
    include: {
      participantProfile: true,
      participantConfirmation: {
        include: { referenceCodes: true }
      },
      participantScreeningReviews: true,
      screeningAttempts: {
        include: {
          answers: true,
          participantEvidence: true,
          participantScreeningReview: true
        }
      },
      ctlSessions: {
        include: {
          answers: true,
          phaseProgress: true
        }
      },
      accessTokens: true,
      activities: {
        include: {
          responses: true,
          participantActivityEvidence: true
        }
      },
      participantEvidence: true,
      hutParticipant: {
        include: {
          applicationEvidence: true,
          applicationPhotoEntries: true,
          questionnaireAttempt: {
            include: {
              visits: true,
              answers: true
            }
          },
          phaseCodes: true,
          qaParticipantRun: true
        }
      },
      qaParticipantRun: true
    }
  });

  const candidates = participants
    .map(summarize)
    .filter((row) => row.recommendation === "MIGRAR_V2")
    .sort((a, b) => folioNumber(a.navFolio) - folioNumber(b.navFolio));

  const outside = candidates.filter((row) => !inputFolios.has(row.navFolio));
  const inside = candidates.filter((row) => inputFolios.has(row.navFolio));
  const result = {
    studyCode: STUDY_CODE,
    inputFoliosCount: inputFolios.size,
    totalMigrationCandidates: candidates.length,
    candidatesAlreadyInInput: inside.length,
    candidatesNotInInput: outside.length,
    candidatesNotInInputRows: outside
  };
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function createPrisma() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no esta configurado en .env.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: false }) })
  };
}

async function readInputFolios(file) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
  const folios = new Set();
  for (const sheet of workbook.worksheets.items) {
    const values = sheet.getUsedRange(true)?.values ?? [];
    for (const row of values) {
      const folio = normalizeNavFolio(row?.[0]);
      if (folio) folios.add(folio);
    }
  }
  return folios;
}

function summarize(participant) {
  const confirmation = participant.participantConfirmation;
  const hut = participant.hutParticipant;
  const screeningApproved =
    participant.screeningStatus === "PASSED" ||
    participant.screeningAttempts.some((attempt) => attempt.status === "PASSED") ||
    participant.participantScreeningReviews.some((review) => review.status === "APPROVED") ||
    Boolean(confirmation);
  const codesCount = confirmation?.referenceCodes?.length ?? 0;
  const ctlAnswerCount = participant.ctlSessions.reduce((sum, session) => sum + session.answers.length, 0);
  const navigoAnswerCount = participant.activities.reduce((sum, activity) => sum + activity.responses.length, 0);
  const hutAnswerCount = hut?.questionnaireAttempt?.answers?.length ?? 0;
  const evidenceCount =
    participant.participantEvidence.length +
    participant.screeningAttempts.reduce((sum, attempt) => sum + attempt.participantEvidence.length, 0) +
    participant.activities.reduce((sum, activity) => sum + activity.participantActivityEvidence.length, 0) +
    (hut?.applicationEvidence.length ?? 0) +
    (hut?.applicationPhotoEntries.length ?? 0);
  const activitiesCount =
    participant.screeningAttempts.length +
    participant.ctlSessions.length +
    participant.ctlSessions.reduce((sum, session) => sum + session.phaseProgress.length, 0) +
    participant.accessTokens.length +
    participant.activities.length +
    (hut?.phaseCodes.length ?? 0) +
    (hut?.questionnaireAttempt?.visits.length ?? 0);
  const downstreamProgress =
    codesCount > 0 ||
    participant.ctlSessions.some((session) => session.startedAt || session.completedAt || session.answers.length) ||
    participant.activities.some(
      (activity) => activity.status !== "PENDING" || activity.actualStartedAt || activity.actualCompletedAt || activity.responses.length
    ) ||
    Boolean(hut && (hut.status !== "NOT_STARTED" || hut.startDate || hutAnswerCount || evidenceCount));
  const qaMode = Boolean(participant.qaParticipantRun || hut?.qaParticipantRun);
  const recommendation = screeningApproved && confirmation?.folio && downstreamProgress && !qaMode ? "MIGRAR_V2" : "NO_MIGRAR";
  return {
    navFolio: confirmation?.folio ?? null,
    hutFolio: hut?.folio ?? null,
    name: participant.participantProfile.name,
    phone: participant.participantProfile.phone,
    email: participant.participantProfile.email,
    screeningStatus: participant.screeningStatus,
    operationalStatus: participant.operationalStatus,
    protocol: hut?.origin === "HUT_DIRECTO" ? "HUT_DIRECTO" : "CLT_NAVIGO_HUT",
    codesCount,
    activitiesCount,
    answersCount: ctlAnswerCount + navigoAnswerCount + hutAnswerCount,
    evidenceCount,
    currentStage: currentStage(participant),
    recommendation
  };
}

function currentStage(participant) {
  const hut = participant.hutParticipant;
  if (hut?.status === "COMPLETED") return "HUT_COMPLETED";
  if (hut && (hut.status !== "NOT_STARTED" || hut.startDate || hut.questionnaireAttempt?.answers.length)) return "HUT_INICIADO";
  if (participant.activities.some((activity) => activity.status !== "PENDING" || activity.responses.length)) return "NAVIGO_INICIADO";
  if (participant.accessTokens.length || participant.activities.length) return "NAVIGO_PREPARADO";
  if (participant.ctlSessions.some((session) => session.status === "COMPLETED")) return "CLT_COMPLETED";
  if (participant.ctlSessions.some((session) => session.status === "IN_PROGRESS" || session.startedAt)) return "CLT_INICIADO";
  if (participant.participantConfirmation) return "FOLIO_CONFIRMADO";
  if (participant.screeningStatus === "PASSED") return "SCREENING_APROBADO";
  return participant.screeningStatus;
}

function normalizeNavFolio(value) {
  const text = String(value ?? "").trim().toUpperCase();
  const match = text.match(/NAV[-\s_]?(\d{1,4})/);
  return match ? `NAV-${match[1].padStart(3, "0")}` : null;
}

function folioNumber(value) {
  return Number(String(value ?? "").match(/\d+/)?.[0] ?? 0);
}
