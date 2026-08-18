import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const repoRequire = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const { config } = repoRequire("dotenv");
const { PrismaClient } = repoRequire("@prisma/client");
const { PrismaPg } = repoRequire("@prisma/adapter-pg");
const { Pool } = repoRequire("pg");

config({ path: path.join(repoRoot, ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: false })
});

try {
  const terms = process.argv.slice(2);
  const searchTerms = terms.length > 0 ? terms : ["ALAN", "MAURICIO", "HERN", "SAUCEDO"];
  const nameWhere = {
    AND: searchTerms.map((term) => ({
      name: { contains: term, mode: "insensitive" }
    }))
  };

  const participantProfiles = await prisma.participantProfile.findMany({
    include: {
      participations: {
        include: {
          participantConfirmation: {
            include: {
              referenceCodes: { orderBy: { slot: "asc" } }
            }
          },
          ctlSessions: true,
          activities: true,
          hutParticipant: true,
          qaParticipantRun: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    where: nameWhere
  });

  const hutParticipants = await prisma.hutParticipant.findMany({
    include: {
      studyParticipant: {
        include: {
          participantConfirmation: {
            include: {
              referenceCodes: { orderBy: { slot: "asc" } }
            }
          },
          participantProfile: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    where: nameWhere
  });

  console.log(JSON.stringify({
    searchTerms,
    participantProfiles: participantProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      participations: profile.participations.map((participant) => ({
        id: participant.id,
        screeningStatus: participant.screeningStatus,
        operationalStatus: participant.operationalStatus,
        qa: Boolean(participant.qaParticipantRun),
        navFolio: participant.participantConfirmation?.folio ?? null,
        approvedAt: participant.participantConfirmation?.approvedAt ?? null,
        codes: participant.participantConfirmation?.referenceCodes.map((code) => ({
          slot: code.slot,
          code: code.code
        })) ?? [],
        cltSessions: participant.ctlSessions.length,
        navigoActivities: participant.activities.length,
        hutFolio: participant.hutParticipant?.folio ?? null,
        hutStatus: participant.hutParticipant?.status ?? null
      }))
    })),
    hutParticipants: hutParticipants.map((hut) => ({
      id: hut.id,
      folio: hut.folio,
      name: hut.name,
      phone: hut.phone,
      email: hut.email,
      origin: hut.origin,
      status: hut.status,
      studyParticipantId: hut.studyParticipantId,
      navFolio: hut.studyParticipant?.participantConfirmation?.folio ?? null,
      profileName: hut.studyParticipant?.participantProfile?.name ?? null,
      codes: hut.studyParticipant?.participantConfirmation?.referenceCodes.map((code) => ({
        slot: code.slot,
        code: code.code
      })) ?? []
    }))
  }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
