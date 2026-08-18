import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config: loadDotenv } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const OUTPUT_FILE = path.join(__dirname, "V1_TO_V2_SCREENING_APPROVED_NO_CLT_ALL.json");
const SUMMARY_CSV_FILE = path.join(__dirname, "V1_TO_V2_SCREENING_APPROVED_NO_CLT_ALL_SUMMARY.csv");

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  await fs.mkdir(__dirname, { recursive: true });
  const exportPayload = await buildExport();
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(exportPayload, null, 2)}\n`, "utf8");
  await fs.writeFile(SUMMARY_CSV_FILE, toSummaryCsv(exportPayload.participants), "utf8");
  console.log(
    JSON.stringify(
      {
        output: OUTPUT_FILE,
        summaryCsv: SUMMARY_CSV_FILE,
        totalCandidatos: exportPayload.metadata.totalCandidatos,
        totalIncluidos: exportPayload.participants.length,
        totalExcluidos: exportPayload.excluded.length,
        includedSummary: exportPayload.participants.map((participant) => ({
          folio: participant.identificacion.NAV_FOLIO,
          screening: participant.screening.screeningStatus,
          cltIniciado: participant.validacionOperativa.cltIniciado,
          hutFolio: participant.identificacion.HUT_FOLIO,
          codigo1: participant.codigos.codigo1,
          codigo2: participant.codigos.codigo2,
          codigo3: participant.codigos.codigo3,
          resultadoMigracion: participant.validacionOperativa.resultadoMigracion
        }))
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

async function buildExport() {
  const study = await prisma.study.findUnique({
    where: { code: STUDY_CODE },
    select: { id: true, code: true, name: true }
  });
  if (!study) {
    throw new Error(`No existe estudio ${STUDY_CODE}`);
  }

  const confirmations = await prisma.participantConfirmation.findMany({
    where: { studyId: study.id },
    include: {
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          participantScreeningReview: true
        }
      },
      studyParticipant: {
        include: {
          participantProfile: true,
          screeningAttempts: {
            include: {
              participantScreeningReview: true
            },
            orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }]
          },
          participantScreeningReviews: true,
          ctlSessions: {
            include: {
              answers: { select: { id: true } },
              phaseProgress: true
            },
            orderBy: { createdAt: "asc" }
          },
          hutParticipant: true
        }
      }
    },
    orderBy: { folioSequence: "asc" }
  });

  const participants = [];
  const excluded = [];

  for (const confirmation of confirmations) {
    const participant = confirmation.studyParticipant;
    const profile = participant.participantProfile;
    const screeningAttempt =
      confirmation.screeningAttempt ??
      participant.screeningAttempts.find((attempt) => attempt.status === "PASSED") ??
      participant.screeningAttempts.at(0) ??
      null;
    const review = screeningAttempt?.participantScreeningReview ?? participant.participantScreeningReviews.at(0) ?? null;
    const screeningCompleted = Boolean(screeningAttempt?.completedAt);
    const screeningApproved = Boolean(
      screeningAttempt?.status === "PASSED" ||
        participant.screeningStatus === "PASSED" ||
        review?.status === "APPROVED"
    );
    const cltAnswers = participant.ctlSessions.reduce((sum, session) => sum + session.answers.length, 0);
    const cltIniciado = participant.ctlSessions.some((session) =>
      Boolean(
        session.startedAt ||
          session.claimedAt ||
          session.completedAt ||
          session.status !== "PENDING" ||
          session.phaseProgress.some((phase) => phase.startedAt || phase.validatedAt || phase.completedAt)
      )
    );

    const codes = Object.fromEntries(confirmation.referenceCodes.map((code) => [code.slot, code.code]));
    const blockers = [];
    if (!screeningCompleted) blockers.push("screening incompleto");
    if (!screeningApproved) blockers.push(`screening no aprobado (${screeningAttempt?.status ?? participant.screeningStatus})`);
    if (cltIniciado) blockers.push("CLT iniciado");
    if (cltAnswers !== 0) blockers.push(`CLT respuestas = ${cltAnswers}`);
    if (!codes[1] || !codes[2] || !codes[3]) blockers.push("codigos V1 incompletos");

    if (blockers.length > 0) {
      excluded.push({
        NAV_FOLIO: confirmation.folio,
        screeningStatus: screeningAttempt?.status ?? participant.screeningStatus,
        cltIniciado,
        cltRespuestas: cltAnswers,
        reason: blockers.join("; ")
      });
      continue;
    }

    participants.push({
      identificacion: {
        NAV_FOLIO: confirmation.folio,
        HUT_FOLIO: participant.hutParticipant?.folio ?? null
      },
      datos: {
        nombre: profile.name,
        telefono: profile.phone,
        email: profile.email ?? null,
        reclutador: participant.hutParticipant?.recruiter ?? null
      },
      screening: {
        screeningStatus: screeningAttempt?.status ?? participant.screeningStatus,
        screeningResult: "APPROVED_ELIGIBLE",
        fechaAprobacion: toIso(confirmation.approvedAt ?? review?.reviewedAt ?? screeningAttempt?.completedAt)
      },
      codigos: {
        codigo1: codes[1],
        codigo2: codes[2],
        codigo3: codes[3],
        source: "V1 ParticipantReferenceCode.slot/code"
      },
      validacionOperativa: {
        cltIniciado,
        cltRespuestas: cltAnswers,
        resultadoMigracion: "MIGRAR"
      }
    });
  }

  return {
    metadata: {
      exportType: "V1_TO_V2_SCREENING_APPROVED_NO_CLT_ALL",
      sourceStudyCode: study.code,
      sourceStudyName: study.name,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      totalCandidatos: confirmations.length,
      criteria: [
        "Screening completado",
        "Screening aprobado/elegible",
        "CLT iniciado = NO",
        "CLT respuestas = 0",
        "ParticipantReferenceCode slots 1,2,3 presentes"
      ],
      excludedData: [
        "respuestas CLT",
        "respuestas HUT",
        "evidencias",
        "actividades posteriores"
      ]
    },
    participants,
    excluded
  };
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function toSummaryCsv(participants) {
  const headers = [
    "Folio",
    "Screening",
    "CLT iniciado",
    "HUT_FOLIO",
    "Código 1",
    "Código 2",
    "Código 3",
    "Resultado migración"
  ];
  const rows = participants.map((participant) => [
    participant.identificacion.NAV_FOLIO,
    participant.screening.screeningStatus,
    participant.validacionOperativa.cltIniciado ? "SI" : "NO",
    participant.identificacion.HUT_FOLIO ?? "",
    participant.codigos.codigo1,
    participant.codigos.codigo2,
    participant.codigos.codigo3,
    participant.validacionOperativa.resultadoMigracion
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
