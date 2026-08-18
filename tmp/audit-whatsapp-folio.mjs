import { createRequire } from "node:module";
import path from "node:path";
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

const terms = process.argv.slice(2).filter(Boolean);

if (terms.length === 0) {
  throw new Error("Indica al menos un termino de busqueda.");
}

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

function cdmx(value) {
  if (!value) {
    return null;
  }
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false
  }).format(new Date(value));
}

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function templateName(rawPayload) {
  const payload = rawPayload?.template;
  if (payload && typeof payload === "object" && "name" in payload) {
    return payload.name;
  }
  const text = stringify(rawPayload);
  const templateMatch = text.match(/"template"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/);
  if (templateMatch) {
    return templateMatch[1];
  }
  const templateNameMatch = text.match(/"templateName"\s*:\s*"([^"]+)"/);
  return templateNameMatch?.[1] ?? null;
}

function snippetFor(message) {
  const text = [message.bodyText ?? "", stringify(message.rawPayload)].join(" ");
  const match = terms.find((term) => text.includes(term));
  if (!match) {
    return null;
  }
  const index = text.indexOf(match);
  return text.slice(Math.max(0, index - 120), Math.min(text.length, index + 220));
}

const { prisma, pool } = createPrisma();

try {
  const since = new Date("2026-08-18T00:00:00.000Z");
  const messages = await prisma.oneuiWhatsAppMessage.findMany({
    include: {
      conversation: true,
      statusEvents: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
    where: {
      createdAt: { gte: since }
    }
  });

  const filtered = messages.filter((message) => {
    const text = stringify(message);
    return terms.some((term) => text.includes(term));
  });

  console.log(JSON.stringify({
    terms,
    totalMessagesSince: messages.length,
    matchedMessages: filtered.map((message) => ({
      id: message.id,
      direction: message.direction,
      fromPhone: message.fromPhone,
      toPhone: message.toPhone,
      conversationPhone: message.conversation?.phoneNumber ?? null,
      conversationWaId: message.conversation?.waId ?? null,
      linkedParticipantId: message.conversation?.linkedParticipantId ?? null,
      createdAtUtc: message.createdAt,
      createdAtCdmx: cdmx(message.createdAt),
      timestampCdmx: cdmx(message.timestamp),
      messageType: message.messageType,
      templateName: templateName(message.rawPayload),
      status: message.status,
      metaMessageId: message.metaMessageId,
      statusEvents: message.statusEvents.map((event) => ({
        status: event.status,
        atCdmx: cdmx(event.timestamp ?? event.createdAt)
      })),
      bodyText: message.bodyText,
      snippet: snippetFor(message)
    }))
  }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
