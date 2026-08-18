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
const OUTPUT_DIR = path.join(repoRoot, "outputs", "participants_created_2026_08_15_cdmx");

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

function formatDateTimeMexicoCity(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    hour12: false,
    timeStyle: "medium",
    timeZone: "America/Mexico_City"
  }).format(new Date(value));
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function folioSequence(folio) {
  const match = String(folio ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function protocolFor(participant, hut) {
  if (hut?.origin === "HUT_DIRECTO") return "HUT_DIRECTO";
  if (hut?.origin === "CLT_HUT") return "CLT_NAVIGO_HUT";
  if (participant?.participantConfirmation || participant?.ctlSessions?.length || participant?.accessTokens?.length || participant?.activities?.length) {
    return "CLT_NAVIGO_HUT";
  }
  return "PENDING_ASSIGNMENT";
}

function originFor(participant, profile, hut) {
  if (participant?.qaParticipantRun || hut?.qaParticipantRun) return "QA";
  const markers = [
    profile?.externalReference,
    participant?.createdBy?.name,
    participant?.createdBy?.email
  ].filter(Boolean).join(" ").toUpperCase();
  if (markers.includes("IMPORT") || markers.includes("V1")) return "IMPORT_V1";
  if (participant?.createdByUserId || profile?.createdByUserId) return "MANUAL";
  return "OTRO";
}

function statusFor(participant, profile, hut) {
  if (profile?.status && profile.status !== "ACTIVE") return profile.status;
  if (participant?.operationalStatus) return participant.operationalStatus;
  if (hut?.status) return hut.status;
  return profile?.status ?? "OTRO";
}

function visibleReason({ participant, hut, fieldOperationalKeys }) {
  const keys = [];
  if (participant?.id) keys.push(`study:${participant.id}`);
  if (hut?.id) keys.push(hut.studyParticipantId ? `study:${hut.studyParticipantId}` : `hut:${hut.id}`);
  const visible = keys.some((key) => fieldOperationalKeys.has(key));
  if (visible) {
    return {
      visible,
      reason: "Incluido por union operacional CLT/Navigo/HUT."
    };
  }
  return {
    visible,
    reason: "No tiene CLT, Navigo ni HUT operativo dentro de la consulta de Field Operations."
  };
}

function codeMap(confirmation) {
  const map = new Map((confirmation?.referenceCodes ?? []).map((code) => [code.slot, code.code]));
  return {
    code1: map.get(1) ?? "",
    code2: map.get(2) ?? "",
    code3: map.get(3) ?? ""
  };
}

function latestOutbound(messages) {
  return messages
    .filter((message) => message.direction === "OUTBOUND")
    .sort((left, right) => {
      const leftTime = new Date(left.timestamp ?? left.createdAt).getTime();
      const rightTime = new Date(right.timestamp ?? right.createdAt).getTime();
      return rightTime - leftTime;
    })[0] ?? null;
}

async function main() {
  const { prisma, pool } = createPrisma();
  try {
    const study = await prisma.study.findFirst({ where: { code: STUDY_CODE } });
    if (!study) throw new Error(`No encontre estudio ${STUDY_CODE}.`);

    const createdStudyParticipants = await prisma.studyParticipant.findMany({
      include: {
        accessTokens: true,
        activities: true,
        ctlSessions: true,
        createdBy: { select: { email: true, name: true } },
        hutParticipant: {
          include: {
            applicationPhotoEntries: true,
            qaParticipantRun: true
          }
        },
        participantConfirmation: {
          include: { referenceCodes: { orderBy: { slot: "asc" } } }
        },
        participantProfile: true,
        qaParticipantRun: true
      },
      orderBy: { createdAt: "asc" },
      where: {
        createdAt: { gte: START_UTC, lt: END_UTC },
        studyId: study.id
      }
    });

    const createdHutParticipants = await prisma.hutParticipant.findMany({
      include: {
        applicationPhotoEntries: true,
        qaParticipantRun: true,
        studyParticipant: {
          include: {
            accessTokens: true,
            activities: true,
            ctlSessions: true,
            participantConfirmation: {
              include: { referenceCodes: { orderBy: { slot: "asc" } } }
            },
            participantProfile: true,
            qaParticipantRun: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      where: {
        createdAt: { gte: START_UTC, lt: END_UTC },
        studyId: study.id
      }
    });

    const createdProfiles = await prisma.participantProfile.findMany({
      include: {
        participations: {
          include: {
            accessTokens: true,
            activities: true,
            ctlSessions: true,
            hutParticipant: {
              include: {
                applicationPhotoEntries: true,
                qaParticipantRun: true
              }
            },
            participantConfirmation: {
              include: { referenceCodes: { orderBy: { slot: "asc" } } }
            },
            qaParticipantRun: true
          },
          where: { studyId: study.id }
        }
      },
      orderBy: { createdAt: "asc" },
      where: {
        createdAt: { gte: START_UTC, lt: END_UTC }
      }
    });

    const fieldCltParticipants = await prisma.ctlSession.findMany({
      select: { studyParticipantId: true },
      where: { studyId: study.id }
    });
    const fieldNavigoParticipants = await prisma.studyParticipant.findMany({
      select: { id: true },
      where: {
        qaParticipantRun: { is: null },
        studyId: study.id,
        OR: [
          { accessTokens: { some: {} } },
          { activities: { some: {} } },
          { applicationStartedAt: { not: null } }
        ]
      }
    });
    const fieldHutParticipants = await prisma.hutParticipant.findMany({
      select: { id: true, studyParticipantId: true },
      where: {
        qaParticipantRun: { is: null },
        studyId: study.id
      }
    });
    const fieldOperationalKeys = new Set([
      ...fieldCltParticipants.map((item) => `study:${item.studyParticipantId}`),
      ...fieldNavigoParticipants.map((item) => `study:${item.id}`),
      ...fieldHutParticipants.map((item) => item.studyParticipantId ? `study:${item.studyParticipantId}` : `hut:${item.id}`)
    ]);

    const rowsByKey = new Map();
    for (const participant of createdStudyParticipants) {
      rowsByKey.set(`study:${participant.id}`, {
        createdAt: participant.createdAt,
        hut: participant.hutParticipant,
        participant,
        profile: participant.participantProfile
      });
    }
    for (const hut of createdHutParticipants) {
      const key = hut.studyParticipantId ? `study:${hut.studyParticipantId}` : `hut:${hut.id}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          createdAt: hut.createdAt,
          hut,
          participant: hut.studyParticipant,
          profile: hut.studyParticipant?.participantProfile ?? null
        });
      }
    }
    for (const profile of createdProfiles) {
      if (profile.participations.length === 0) {
        rowsByKey.set(`profile:${profile.id}`, {
          createdAt: profile.createdAt,
          hut: null,
          participant: null,
          profile
        });
      }
      for (const participant of profile.participations) {
        const key = `study:${participant.id}`;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, {
            createdAt: profile.createdAt,
            hut: participant.hutParticipant,
            participant,
            profile
          });
        }
      }
    }

    const records = [...rowsByKey.values()].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    const participantIds = records.map((record) => record.participant?.id).filter(Boolean);
    const phones = [...new Set(records.flatMap((record) => [
      normalizePhone(record.profile?.phone),
      normalizePhone(record.hut?.phone)
    ]).filter(Boolean))];

    const conversations = await prisma.oneuiWhatsAppConversation.findMany({
      include: { messages: true },
      where: {
        OR: [
          participantIds.length ? { linkedParticipantId: { in: participantIds } } : undefined,
          phones.length ? { phoneNumber: { in: phones } } : undefined
        ].filter(Boolean)
      }
    });

    const conversationMessages = [];
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        conversationMessages.push({
          ...message,
          linkedParticipantId: conversation.linkedParticipantId,
          phoneNumber: conversation.phoneNumber
        });
      }
    }

    const operationalRows = records.map((record) => {
      const participant = record.participant;
      const profile = record.profile;
      const hut = record.hut;
      const confirmation = participant?.participantConfirmation ?? null;
      const codes = codeMap(confirmation);
      const navFolio = confirmation?.folio ?? "";
      const hutFolio = hut?.folio ?? (navFolio ? `HUT-${String(folioSequence(navFolio)).padStart(3, "0")}` : "");
      const profilePhone = normalizePhone(profile?.phone);
      const hutPhone = normalizePhone(hut?.phone);
      const messages = conversationMessages.filter((message) => {
        if (participant?.id && message.linkedParticipantId === participant.id) return true;
        const messagePhone = normalizePhone(message.phoneNumber || message.toPhone || message.fromPhone);
        return Boolean(messagePhone && (messagePhone === profilePhone || messagePhone === hutPhone));
      });
      const outbound = latestOutbound(messages);
      const visibility = visibleReason({ fieldOperationalKeys, hut, participant });
      const appearsByNav = Boolean(navFolio && visibility.visible);
      const appearsByHut = Boolean(hut?.folio && visibility.visible);
      const appearsByName = Boolean((profile?.name || hut?.name) && visibility.visible);
      const hasInterviewerAssignment = Boolean(participant?.ctlSessions?.some((session) => session.ctlInterviewerCodeId));
      const visibleWithInterviewerCode = visibility.visible && (
        Boolean(hut?.studyParticipantId === null && hut?.id) ||
        hasInterviewerAssignment
      );
      const classification = visibility.visible
        ? "A) Creado y visible correctamente"
        : outbound
          ? "C) WhatsApp enviado pero falta participante visible en campo"
          : "B) Creado pero no visible en campo";

      return {
        participantId: participant?.id ?? (hut?.id ? `hut:${hut.id}` : `profile:${profile?.id ?? ""}`),
        navFolio,
        hutFolio,
        name: profile?.name ?? hut?.name ?? "",
        phone: profile?.phone ?? hut?.phone ?? "",
        email: profile?.email ?? hut?.email ?? "",
        createdAtUtc: new Date(record.createdAt).toISOString(),
        createdAtMexicoCity: formatDateTimeMexicoCity(record.createdAt),
        origin: originFor(participant, profile, hut),
        status: statusFor(participant, profile, hut),
        protocol: protocolFor(participant, hut),
        code1: codes.code1,
        code2: codes.code2,
        code3: codes.code3,
        whatsappSent: outbound ? "SI" : "NO",
        whatsappWamid: outbound?.metaMessageId ?? "",
        whatsappStatus: outbound?.status ?? "",
        whatsappSentAtMexicoCity: outbound ? formatDateTimeMexicoCity(outbound.timestamp ?? outbound.createdAt) : "",
        appearsByNav: appearsByNav ? "SI" : "NO",
        appearsByHut: appearsByHut ? "SI" : "NO",
        appearsByName: appearsByName ? "SI" : "NO",
        outsideLimit50: "NO_APLICA_SIN_BUSCADOR",
        requiresInterviewerName: visibleWithInterviewerCode ? "SI, codigo de encuestador" : visibility.visible ? "NO en modo admin/supervisor" : "NO_APLICA",
        fieldVisibilityReason: visibility.reason,
        classification
      };
    });

    const summary = {
      studyCode: STUDY_CODE,
      cdmxRange: {
        start: "2026-08-15 00:00:00 America/Mexico_City",
        end: "2026-08-15 23:59:59 America/Mexico_City"
      },
      utcRange: {
        startInclusive: START_UTC.toISOString(),
        endExclusive: END_UTC.toISOString()
      },
      totalRecords: operationalRows.length,
      byClassification: operationalRows.reduce((acc, row) => {
        acc[row.classification] = (acc[row.classification] ?? 0) + 1;
        return acc;
      }, {}),
      note: "No existe ruta literal /campo en este repositorio; se valido contra /field/dashboard, que es la vista Field Operations."
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const jsonFile = path.join(OUTPUT_DIR, "audit.json");
    const csvFile = path.join(OUTPUT_DIR, "audit.csv");
    await fs.writeFile(jsonFile, JSON.stringify({ summary, rows: operationalRows }, null, 2), "utf8");
    const headers = Object.keys(operationalRows[0] ?? {
      participantId: "",
      navFolio: "",
      hutFolio: "",
      name: "",
      phone: "",
      email: "",
      createdAtMexicoCity: "",
      origin: "",
      status: "",
      protocol: "",
      code1: "",
      code2: "",
      code3: "",
      whatsappSent: "",
      whatsappWamid: "",
      whatsappStatus: "",
      appearsByNav: "",
      appearsByHut: "",
      appearsByName: "",
      outsideLimit50: "",
      requiresInterviewerName: "",
      classification: ""
    });
    const csv = [
      headers.join(","),
      ...operationalRows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    ].join("\n");
    await fs.writeFile(csvFile, csv, "utf8");

    console.log(JSON.stringify({ summary, files: { csvFile, jsonFile }, rows: operationalRows }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

await main();
