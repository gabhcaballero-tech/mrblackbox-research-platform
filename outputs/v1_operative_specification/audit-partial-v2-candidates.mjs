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
const FOLIOS = [
  "NAV-009",
  "NAV-011",
  "NAV-023",
  "NAV-024",
  "NAV-027",
  "NAV-029",
  "NAV-035",
  "NAV-036",
  "NAV-038",
  "NAV-040",
  "NAV-041",
  "NAV-043",
  "NAV-044",
  "NAV-046",
  "NAV-048",
  "NAV-049",
  "NAV-050",
  "NAV-051",
  "NAV-054",
  "NAV-055",
  "NAV-056",
  "NAV-058",
  "NAV-061",
  "NAV-063",
  "NAV-064",
  "NAV-065",
  "NAV-066",
  "NAV-068",
  "NAV-073",
  "NAV-074",
  "NAV-075",
  "NAV-078",
  "NAV-079",
  "NAV-080",
  "NAV-081",
  "NAV-082",
  "NAV-084",
  "NAV-085",
  "NAV-089",
  "NAV-091",
  "NAV-092",
  "NAV-093",
  "NAV-094",
  "NAV-096",
  "NAV-100",
  "NAV-103"
];

loadDotenv({ path: path.join(repoRoot, ".env") });

const { prisma, pool } = createPrisma();

try {
  const rows = await buildAudit();
  await fs.writeFile(
    path.join(__dirname, "partial_v2_candidates_audit.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(__dirname, "partial_v2_candidates_audit.csv"), toCsv(rows), "utf8");
  console.log(JSON.stringify({
    total: rows.length,
    migrar: rows.filter((row) => row.resultadoMigracion === "MIGRAR").length,
    noMigrar: rows.filter((row) => row.resultadoMigracion.startsWith("NO MIGRAR")).length,
    rows
  }, null, 2));
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

async function buildAudit() {
  const study = await prisma.study.findUnique({
    where: { code: STUDY_CODE },
    select: { id: true }
  });
  if (!study) throw new Error(`No existe estudio ${STUDY_CODE}`);

  const confirmations = await prisma.participantConfirmation.findMany({
    where: { studyId: study.id, folio: { in: FOLIOS } },
    include: {
      referenceCodes: { orderBy: { slot: "asc" } },
      screeningAttempt: {
        include: {
          participantScreeningReview: true,
          answers: { select: { id: true } }
        }
      },
      studyParticipant: {
        include: {
          participantProfile: true,
          screeningAttempts: {
            include: {
              participantScreeningReview: true,
              answers: { select: { id: true } }
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
          hutParticipant: true,
          activities: {
            select: { id: true, status: true, actualStartedAt: true, actualCompletedAt: true }
          },
          participantActivityEvidence: { select: { id: true } },
          participantEvidence: { select: { id: true } }
        }
      }
    }
  });

  const byFolio = new Map(confirmations.map((confirmation) => [confirmation.folio, confirmation]));

  return FOLIOS.map((folio) => {
    const confirmation = byFolio.get(folio) ?? null;
    if (!confirmation) {
      return emptyRow(folio, "NO MIGRAR: sin ParticipantConfirmation / folio no encontrado");
    }
    const participant = confirmation.studyParticipant;
    const profile = participant.participantProfile;
    const screeningAttempt = chooseScreeningAttempt(confirmation, participant.screeningAttempts);
    const review = screeningAttempt?.participantScreeningReview ?? participant.participantScreeningReviews.at(0) ?? null;
    const screeningCompleted = Boolean(screeningAttempt?.completedAt);
    const screeningApproved = Boolean(
      confirmation &&
        (screeningAttempt?.status === "PASSED" ||
          participant.screeningStatus === "PASSED" ||
          review?.status === "APPROVED")
    );
    const approvalDate = confirmation.approvedAt ?? review?.reviewedAt ?? screeningAttempt?.completedAt ?? null;
    const cltSessions = participant.ctlSessions ?? [];
    const cltAnswers = cltSessions.reduce((sum, session) => sum + session.answers.length, 0);
    const cltStarted = cltSessions.some((session) =>
      Boolean(
        session.startedAt ||
          session.claimedAt ||
          session.completedAt ||
          session.status !== "PENDING" ||
          session.phaseProgress.some((phase) => phase.startedAt || phase.validatedAt || phase.completedAt)
      )
    );
    const fieldProgress = Boolean(
      cltStarted ||
        cltAnswers > 0 ||
        participant.activities.some((activity) => activity.actualStartedAt || activity.actualCompletedAt || activity.status !== "PENDING") ||
        participant.participantActivityEvidence.length > 0 ||
        participant.hutParticipant?.startDate
    );
    const codes = Object.fromEntries(confirmation.referenceCodes.map((code) => [code.slot, code.code]));
    const missingData = [];
    if (!profile.name) missingData.push("nombre");
    if (!profile.phone) missingData.push("telefono");
    if (!codes[1] || !codes[2] || !codes[3]) missingData.push("codigos 1/2/3");

    const blockers = [];
    if (!screeningCompleted) blockers.push("screening incompleto");
    if (!screeningApproved) blockers.push(`screening no aprobado (${screeningAttempt?.status ?? participant.screeningStatus})`);
    if (cltStarted) blockers.push("CLT iniciado");
    if (cltAnswers > 0) blockers.push(`CLT con ${cltAnswers} respuestas`);
    if (fieldProgress && !cltStarted && cltAnswers === 0) blockers.push("avance posterior al filtro");
    if (missingData.length > 0) blockers.push(`datos faltantes: ${missingData.join(", ")}`);

    return {
      folio,
      screening: screeningAttempt?.status ?? participant.screeningStatus ?? "SIN_SCREENING",
      fechaAprobacion: formatMexicoCity(approvalDate),
      cltIniciado: cltStarted ? "SI" : "NO",
      cltRespuestas: cltAnswers,
      nombre: profile.name ?? "",
      telefono: profile.phone ?? "",
      email: profile.email ?? "",
      reclutador: participant.hutParticipant?.recruiter ?? "",
      codigo1: codes[1] ?? "",
      codigo2: codes[2] ?? "",
      codigo3: codes[3] ?? "",
      resultadoMigracion: blockers.length === 0 ? "MIGRAR" : `NO MIGRAR: ${blockers.join("; ")}`,
      screeningCompletado: screeningCompleted ? "SI" : "NO",
      screeningAprobado: screeningApproved ? "SI" : "NO",
      operationalStatus: participant.operationalStatus,
      studyParticipantId: participant.id
    };
  });
}

function chooseScreeningAttempt(confirmation, attempts) {
  if (confirmation.screeningAttempt) return confirmation.screeningAttempt;
  return attempts.find((attempt) => attempt.status === "PASSED") ?? attempts.at(0) ?? null;
}

function emptyRow(folio, reason) {
  return {
    folio,
    screening: "SIN_REGISTRO",
    fechaAprobacion: "",
    cltIniciado: "NO",
    cltRespuestas: 0,
    nombre: "",
    telefono: "",
    email: "",
    reclutador: "",
    codigo1: "",
    codigo2: "",
    codigo3: "",
    resultadoMigracion: reason,
    screeningCompletado: "NO",
    screeningAprobado: "NO",
    operationalStatus: "",
    studyParticipantId: ""
  };
}

function formatMexicoCity(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function toCsv(rows) {
  const headers = [
    "Folio",
    "Screening",
    "Fecha aprobación",
    "CLT iniciado",
    "CLT respuestas",
    "Nombre",
    "Teléfono",
    "Email",
    "Reclutador",
    "Código1",
    "Código2",
    "Código3",
    "Resultado migración"
  ];
  const keys = [
    "folio",
    "screening",
    "fechaAprobacion",
    "cltIniciado",
    "cltRespuestas",
    "nombre",
    "telefono",
    "email",
    "reclutador",
    "codigo1",
    "codigo2",
    "codigo3",
    "resultadoMigracion"
  ];
  return [
    headers.join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
