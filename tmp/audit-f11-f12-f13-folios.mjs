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

const folios = ["NAV-006", "NAV-009", "NAV-012"];
const cltCodes = new Set(["F11", "F12", "F13"]);
const hutCodeMap = new Map([
  ["HUT_F11_MARCA_FRECUENTE", "F11"],
  ["HUT_F12_VARIANTE", "F12"],
  ["HUT_F13_FRECUENCIA_SEMANAL", "F13"]
]);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no esta configurado.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: false })
});

try {
  const result = [];
  for (const folio of folios) {
    const confirmation = await prisma.participantConfirmation.findFirst({
      where: { folio },
      include: {
        referenceCodes: { orderBy: { slot: "asc" } },
        studyParticipant: {
          include: {
            participantProfile: true,
            screeningAttempts: {
              include: { answers: { orderBy: { createdAt: "asc" } } },
              orderBy: { startedAt: "asc" }
            },
            ctlSessions: {
              include: { answers: { orderBy: { createdAt: "asc" } } },
              orderBy: { createdAt: "asc" }
            },
            hutParticipant: {
              include: {
                questionnaireAttempt: {
                  include: { answers: { orderBy: { answeredAt: "asc" } } }
                }
              }
            }
          }
        }
      }
    });
    const participant = confirmation?.studyParticipant ?? null;
    const profile = participant?.participantProfile ?? null;
    const cltAnswers = [];
    for (const session of participant?.ctlSessions ?? []) {
      for (const answer of session.answers ?? []) {
        if (cltCodes.has(answer.questionCode)) {
          cltAnswers.push({
            sessionId: session.id,
            sessionStatus: session.status,
            questionCode: answer.questionCode,
            answerValue: answer.answerValue,
            answeredAt: iso(answer.createdAt)
          });
        }
      }
    }
    const hutAnswers = [];
    for (const answer of participant?.hutParticipant?.questionnaireAttempt?.answers ?? []) {
      if (hutCodeMap.has(answer.questionCode)) {
        hutAnswers.push({
          mappedCode: hutCodeMap.get(answer.questionCode),
          questionCode: answer.questionCode,
          answerValue: answer.answerJson,
          answeredAt: iso(answer.answeredAt)
        });
      }
    }
    const screeningAnswers = [];
    for (const attempt of participant?.screeningAttempts ?? []) {
      for (const answer of attempt.answers ?? []) {
        if (cltCodes.has(answer.questionId)) {
          screeningAnswers.push({
            attemptId: attempt.id,
            attemptStatus: attempt.status,
            questionId: answer.questionId,
            answerValue: answer.answerJson,
            answeredAt: iso(answer.createdAt)
          });
        }
      }
    }
    result.push({
      folio,
      exists: Boolean(confirmation),
      name: profile?.name ?? null,
      phone: profile?.phone ?? null,
      screeningStatus: participant?.screeningStatus ?? null,
      operationalStatus: participant?.operationalStatus ?? null,
      codes: (confirmation?.referenceCodes ?? []).map((code) => ({ slot: code.slot, code: code.code })),
      cltSessions: (participant?.ctlSessions ?? []).map((session) => ({
        id: session.id,
        status: session.status,
        answerCount: session.answers.length,
        startedAt: iso(session.startedAt ?? session.claimedAt),
        completedAt: iso(session.completedAt)
      })),
      hasCltF11: cltAnswers.some((answer) => answer.questionCode === "F11"),
      hasCltF12: cltAnswers.some((answer) => answer.questionCode === "F12"),
      hasCltF13: cltAnswers.some((answer) => answer.questionCode === "F13"),
      cltAnswers,
      hasHutF11: hutAnswers.some((answer) => answer.mappedCode === "F11"),
      hasHutF12: hutAnswers.some((answer) => answer.mappedCode === "F12"),
      hasHutF13: hutAnswers.some((answer) => answer.mappedCode === "F13"),
      hutAnswers,
      screeningAnswers
    });
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}
