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

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const START_UTC = new Date("2026-08-15T06:00:00.000Z");
const END_UTC = new Date("2026-08-16T06:00:00.000Z");
const OUTPUT_DIR = path.join(repoRoot, "outputs", "v1_to_v2_today_2026_08_15_export");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "v1_to_v2_participants_created_2026_08_15_cdmx.json");

function createPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: false })
    })
  };
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDateTimeMexicoCity(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    hour12: false,
    timeStyle: "medium",
    timeZone: "America/Mexico_City"
  }).format(new Date(value));
}

function hutFolioFromNav(navFolio) {
  const match = String(navFolio ?? "").match(/(\d+)$/);
  return match ? `HUT-${match[1].padStart(3, "0")}` : null;
}

function codeMap(confirmation) {
  const codes = new Map((confirmation?.referenceCodes ?? []).map((code) => [code.slot, code.code]));
  return {
    codigo1: codes.get(1) ?? null,
    codigo2: codes.get(2) ?? null,
    codigo3: codes.get(3) ?? null,
    source: "V1 ParticipantReferenceCode.slot/code"
  };
}

function latestBy(items, getter) {
  return [...items].sort((left, right) => {
    const leftTime = getter(left) ? new Date(getter(left)).getTime() : 0;
    const rightTime = getter(right) ? new Date(getter(right)).getTime() : 0;
    return rightTime - leftTime;
  })[0] ?? null;
}

function screeningResult(participant) {
  const confirmation = participant.participantConfirmation;
  const review = latestBy(participant.participantScreeningReviews ?? [], (item) => item.reviewedAt ?? item.createdAt);
  const attempt = confirmation?.screeningAttempt
    ?? latestBy(participant.screeningAttempts ?? [], (item) => item.completedAt ?? item.startedAt);

  if (confirmation && attempt?.status === "PASSED") return "APPROVED_ELIGIBLE";
  if (review?.status === "APPROVED") return "APPROVED_BY_REVIEW";
  if (attempt?.status === "TERMINATED") return "REJECTED";
  if (attempt?.status) return attempt.status;
  return participant.screeningStatus;
}

function migrationResult(participant) {
  const confirmation = participant.participantConfirmation;
  const codes = codeMap(confirmation);
  const hasCodes = Boolean(codes.codigo1 && codes.codigo2 && codes.codigo3);
  const cltAnswers = participant.ctlSessions.reduce((total, session) => total + session.answers.length, 0);
  const hasOperationalProgress =
    participant.ctlSessions.length > 0 ||
    participant.accessTokens.length > 0 ||
    participant.activities.length > 0 ||
    Boolean(participant.hutParticipant);

  if (!confirmation?.folio) return { include: false, reason: "SIN_NAV_FOLIO" };
  if (!hasCodes) return { include: false, reason: "CODIGOS_INCOMPLETOS" };
  return {
    include: true,
    reason: hasOperationalProgress || cltAnswers > 0 ? "IMPORTAR_CON_AVANCE" : "IMPORTAR_SCREENING",
    warnings: participant.screeningStatus !== "PASSED" && screeningResult(participant) !== "APPROVED_ELIGIBLE"
      ? [`SCREENING_STATUS_${participant.screeningStatus}`]
      : []
  };
}

async function main() {
  const { prisma, pool } = createPrisma();
  try {
    const study = await prisma.study.findFirst({ where: { code: STUDY_CODE } });
    if (!study) throw new Error(`No encontre el estudio ${STUDY_CODE}.`);

    const participants = await prisma.studyParticipant.findMany({
      include: {
        accessTokens: true,
        activities: true,
        ctlSessions: { include: { answers: true } },
        hutParticipant: {
          include: {
            applicationEvidence: true,
            applicationPhotoEntries: true,
            questionnaireAttempt: { include: { answers: true, visits: true } }
          }
        },
        participantConfirmation: {
          include: {
            referenceCodes: { orderBy: { slot: "asc" } },
            screeningAttempt: true
          }
        },
        participantProfile: true,
        participantScreeningReviews: true,
        screeningAttempts: { include: { answers: true } }
      },
      orderBy: { createdAt: "asc" },
      where: {
        createdAt: { gte: START_UTC, lt: END_UTC },
        studyId: study.id
      }
    });

    const exportRows = [];
    const excluded = [];

    for (const participant of participants) {
      const decision = migrationResult(participant);
      const confirmation = participant.participantConfirmation;
      const latestScreening = confirmation?.screeningAttempt
        ?? latestBy(participant.screeningAttempts, (item) => item.completedAt ?? item.startedAt);
      const cltAnswers = participant.ctlSessions.reduce((total, session) => total + session.answers.length, 0);
      const hut = participant.hutParticipant;
      const rowBase = {
        participantIdV1: participant.id,
        identificacion: {
          NAV_FOLIO: confirmation?.folio ?? null,
          HUT_FOLIO: hut?.folio ?? hutFolioFromNav(confirmation?.folio)
        },
        datos: {
          nombre: participant.participantProfile.name,
          telefono: participant.participantProfile.phone,
          email: participant.participantProfile.email || null,
          reclutador: hut?.recruiter ?? null
        },
        screening: {
          screeningStatus: participant.screeningStatus,
          screeningResult: screeningResult(participant),
          fechaAprobacion: iso(confirmation?.approvedAt),
          fechaAprobacionMexicoCity: formatDateTimeMexicoCity(confirmation?.approvedAt),
          latestAttemptId: latestScreening?.id ?? null,
          latestAttemptStatus: latestScreening?.status ?? null
        },
        codigos: codeMap(confirmation),
        validacionOperativa: {
          cltIniciado: participant.ctlSessions.length > 0,
          cltRespuestas: cltAnswers,
          navigoIniciado: participant.accessTokens.length > 0 || participant.activities.length > 0,
          hutIniciado: Boolean(hut),
          resultadoMigracion: decision.reason,
          warnings: decision.warnings ?? []
        },
        registroV1: {
          createdAt: iso(participant.createdAt),
          createdAtMexicoCity: formatDateTimeMexicoCity(participant.createdAt),
          operationalStatus: participant.operationalStatus
        }
      };

      if (decision.include) {
        exportRows.push(rowBase);
      } else {
        excluded.push({
          ...rowBase,
          motivoExclusion: decision.reason
        });
      }
    }

    const payload = {
      metadata: {
        exportType: "V1_TO_V2_CREATED_TODAY_2026_08_15_CDMX",
        sourceStudyCode: STUDY_CODE,
        sourceStudyName: study.name,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        cdmxRange: {
          start: "2026-08-15 00:00:00 America/Mexico_City",
          end: "2026-08-15 23:59:59 America/Mexico_City"
        },
        utcRange: {
          startInclusive: START_UTC.toISOString(),
          endExclusive: END_UTC.toISOString()
        },
        criteria: [
          "StudyParticipant.createdAt dentro del 15/08/2026 CDMX",
          "Incluidos para importacion: NAV_FOLIO existente y codigos 1/2/3 completos",
          "Estados agregados de screening distintos a PASSED se conservan como warnings",
          "Excluidos: registros sin folio/codigos"
        ],
        excludedData: [
          "respuestas CLT detalladas",
          "respuestas HUT detalladas",
          "evidencias binarias",
          "tokens internos"
        ],
        totals: {
          createdToday: participants.length,
          included: exportRows.length,
          excluded: excluded.length
        }
      },
      participants: exportRows,
      excluded
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify({
      output: OUTPUT_FILE,
      totals: payload.metadata.totals,
      includedFolios: exportRows.map((row) => row.identificacion.NAV_FOLIO),
      excluded: excluded.map((row) => ({
        folio: row.identificacion.NAV_FOLIO,
        name: row.datos.nombre,
        reason: row.motivoExclusion
      }))
    }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

await main();
