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

const STUDY_CODE = "FMASCULINA-NAVIGO-2026";
const NAV_PREFIX = "NAV";
const HUT_PREFIX = "HUT";
const MIN_SEQUENCE = 1;
const MAX_SEQUENCE = 330;
const PUBLIC_ORIGIN = normalizeOrigin(
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL
) || "https://mrblackbox-research-platform.vercel.app";
const OUTPUT_DIR = __dirname;
const OUTPUT_FILE = path.join(OUTPUT_DIR, "excel_maestro_operativo_fmasculina_navigo_2026.xlsx");

loadDotenv({ path: path.join(repoRoot, ".env") });

function createPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurado en .env.");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1
  });
  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool, {
        disposeExternalPool: false
      })
    })
  };
}

const { prisma, pool } = createPrisma();

try {
  const extract = await readStudySnapshot();
  const workbook = await buildWorkbook(extract);
  await verifyWorkbook(workbook);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(OUTPUT_FILE);
  await fs.writeFile(
    path.join(OUTPUT_DIR, "excel_maestro_operativo_summary.json"),
    JSON.stringify(extract.summary, null, 2),
    "utf8"
  );
  console.log(JSON.stringify({ output: OUTPUT_FILE, summary: extract.summary }, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}

async function readStudySnapshot() {
  const study = await prisma.study.findFirst({
    where: { code: STUDY_CODE },
    select: {
      code: true,
      id: true,
      name: true,
      participantPortalConfig: {
        select: {
          folioMaxSequence: true,
          folioPrefix: true,
          nextFolioSequence: true
        }
      }
    }
  });
  if (!study) {
    throw new Error(`No encontre el estudio ${STUDY_CODE}.`);
  }

  const [
    studyParticipants,
    hutParticipants
  ] = await Promise.all([
    prisma.studyParticipant.findMany({
      where: { studyId: study.id },
      include: {
        accessTokens: {
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            expiresAt: true,
            id: true,
            lastUsedAt: true,
            status: true
          }
        },
        activities: {
          include: {
            activitySchedule: {
              select: {
                code: true,
                name: true
              }
            },
            reminders: {
              orderBy: { sentAt: "desc" },
              select: {
                metadataJson: true,
                scheduledFor: true,
                sentAt: true,
                status: true
              }
            },
            responses: {
              select: {
                answerJson: true,
                createdAt: true,
                responseKey: true,
                updatedAt: true
              }
            }
          },
          orderBy: { scheduledAt: "asc" }
        },
        armAssignments: {
          include: {
            studyArm: {
              select: {
                code: true,
                label: true
              }
            },
            studyProduct: {
              select: {
                displayLabel: true,
                internalCode: true
              }
            }
          },
          orderBy: { applicationOrder: "asc" }
        },
        ctlSessions: {
          include: {
            ctlInterviewerCode: {
              select: {
                label: true
              }
            },
            phaseProgress: {
              select: {
                arm: true,
                completedAt: true,
                phase: true,
                productCode: true,
                referenceCodeSlot: true,
                status: true,
                validatedAt: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        },
        ctlTriangularRotationAssignment: true,
        hutParticipant: {
          include: hutParticipantInclude()
        },
        participantConfirmation: {
          include: {
            referenceCodes: {
              orderBy: { slot: "asc" }
            },
            screeningAttempt: {
              select: {
                completedAt: true,
                id: true,
                startedAt: true,
                status: true
              }
            }
          }
        },
        participantProfile: true,
        participantScreeningReviews: {
          orderBy: { reviewedAt: "desc" },
          select: {
            reviewedAt: true,
            status: true
          }
        },
        qaParticipantRun: {
          select: {
            folio: true,
            id: true,
            scenario: true,
            status: true
          }
        },
        rotationAssignment: {
          include: {
            arms: {
              include: {
                studyArm: {
                  select: {
                    code: true,
                    label: true
                  }
                },
                studyProduct: {
                  select: {
                    displayLabel: true,
                    internalCode: true
                  }
                }
              },
              orderBy: { applicationOrder: "asc" }
            },
            rotationPlan: {
              select: {
                name: true,
                rotationCode: true
              }
            }
          }
        },
        screeningAttempts: {
          orderBy: { startedAt: "desc" },
          select: {
            completedAt: true,
            id: true,
            startedAt: true,
            status: true
          }
        }
      }
    }),
    prisma.hutParticipant.findMany({
      where: { studyId: study.id },
      include: hutParticipantInclude(),
      orderBy: { folio: "asc" }
    })
  ]);

  const studyParticipantIds = studyParticipants.map((participant) => participant.id);
  const hutIds = hutParticipants.map((participant) => participant.id);
  const phones = unique([
    ...studyParticipants.map((participant) => participant.participantProfile?.phone),
    ...hutParticipants.map((participant) => participant.phone)
  ].map(normalizePhone).filter(Boolean));

  const [auditLogs, whatsAppConversations] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: { in: studyParticipantIds } },
          { entityId: { in: hutIds } }
        ]
      },
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        actorUserId: true,
        afterJson: true,
        beforeJson: true,
        createdAt: true,
        entityId: true,
        entityType: true,
        reason: true
      }
    }),
    prisma.oneuiWhatsAppConversation.findMany({
      where: {
        OR: [
          { linkedStudyId: study.id },
          { linkedParticipantId: { in: studyParticipantIds } },
          phones.length ? { phoneNumber: { in: phones } } : undefined
        ].filter(Boolean)
      },
      include: {
        messages: {
          orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
          take: 20
        }
      }
    })
  ]);

  const context = buildContext({ auditLogs, hutParticipants, study, studyParticipants, whatsAppConversations });
  const rows = [];
  for (let sequence = MIN_SEQUENCE; sequence <= MAX_SEQUENCE; sequence += 1) {
    rows.push(buildParticipantRow(sequence, context));
  }

  const codeRows = rows.map(buildCodeRow);
  const hutOperationRows = rows
    .filter((row) => row.HUT_APPLIES === "SI" || row.CLASIFICACION === "RESERVA_HUT")
    .map(buildHutOperationRow);
  const auditRows = buildAuditRows(rows, context);

  return {
    auditRows,
    codeRows,
    hutOperationRows,
    masterRows: rows,
    summary: {
      auditRows: auditRows.length,
      generatedAt: formatDateTimeMexicoCity(new Date()),
      hutOperationRows: hutOperationRows.length,
      masterRows: rows.length,
      outputPublicOrigin: PUBLIC_ORIGIN,
      studyCode: study.code,
      studyId: study.id,
      studyName: study.name,
      totals: countBy(rows, "CLASIFICACION")
    }
  };
}

function hutParticipantInclude() {
  return {
    applicationEvidence: {
      orderBy: { capturedAt: "asc" },
      select: {
        capturedAt: true,
        phase: true,
        privateStorageKey: true,
        productCode: true
      }
    },
    applicationPhotoEntries: {
      orderBy: { useDayNumber: "asc" },
      select: {
        capturedAt: true,
        capturedLocalDate: true,
        capturedLocalTimezone: true,
        privateStorageKey: true,
        productCode: true,
        useDayNumber: true
      }
    },
    phaseCodes: {
      orderBy: { slot: "asc" },
      select: {
        createdAt: true,
        phase: true,
        sentAt: true,
        slot: true,
        status: true,
        usedAt: true,
        validatedAt: true
      }
    },
    qaParticipantRun: {
      select: {
        folio: true,
        id: true,
        scenario: true,
        status: true
      }
    },
    questionnaireAttempt: {
      include: {
        answers: {
          select: {
            answeredAt: true,
            answerJson: true,
            questionCode: true
          }
        },
        visits: {
          select: {
            completedAt: true,
            section: true,
            startedAt: true,
            status: true
          }
        }
      }
    },
    registrationSlot: true
  };
}

function buildContext({ auditLogs, hutParticipants, study, studyParticipants, whatsAppConversations }) {
  const studyParticipantsByFolio = new Map();
  const studyParticipantsById = new Map();
  for (const participant of studyParticipants) {
    studyParticipantsById.set(participant.id, participant);
    const folio = participant.participantConfirmation?.folio;
    if (folio) {
      studyParticipantsByFolio.set(folio, participant);
    }
  }

  const hutByFolio = new Map();
  const hutByStudyParticipantId = new Map();
  for (const participant of hutParticipants) {
    if (participant.folio) {
      hutByFolio.set(participant.folio, participant);
    }
    if (participant.studyParticipantId) {
      hutByStudyParticipantId.set(participant.studyParticipantId, participant);
    }
  }

  const auditsByEntityId = groupBy(auditLogs, (log) => log.entityId);
  const whatsappByParticipantId = new Map();
  const whatsappByPhone = new Map();
  for (const conversation of whatsAppConversations) {
    if (conversation.linkedParticipantId) {
      const existing = whatsappByParticipantId.get(conversation.linkedParticipantId) ?? [];
      existing.push(conversation);
      whatsappByParticipantId.set(conversation.linkedParticipantId, existing);
    }
    const phone = normalizePhone(conversation.phoneNumber);
    if (phone) {
      const existing = whatsappByPhone.get(phone) ?? [];
      existing.push(conversation);
      whatsappByPhone.set(phone, existing);
    }
  }

  return {
    auditsByEntityId,
    hutByFolio,
    hutByStudyParticipantId,
    study,
    studyParticipantsByFolio,
    studyParticipantsById,
    whatsappByParticipantId,
    whatsappByPhone
  };
}

function buildParticipantRow(sequence, context) {
  const navFolio = `${NAV_PREFIX}-${String(sequence).padStart(3, "0")}`;
  const hutFolio = `${HUT_PREFIX}-${String(sequence).padStart(3, "0")}`;
  const studyParticipant = context.studyParticipantsByFolio.get(navFolio) ?? null;
  const linkedHut = studyParticipant ? context.hutByStudyParticipantId.get(studyParticipant.id) ?? null : null;
  const hutParticipant = linkedHut ?? context.hutByFolio.get(hutFolio) ?? null;
  const profile = studyParticipant?.participantProfile ?? null;
  const confirmation = studyParticipant?.participantConfirmation ?? null;
  const referenceCodes = new Map((confirmation?.referenceCodes ?? []).map((code) => [code.slot, code]));
  const qaMode = Boolean(studyParticipant?.qaParticipantRun || hutParticipant?.qaParticipantRun);
  const protocolType = resolveProtocolType(studyParticipant, hutParticipant);
  const readiness = studyParticipant ? calculateReadiness(studyParticipant, hutParticipant) : null;
  const classification = classifyRow({ hutParticipant, qaMode, studyParticipant });
  const activeToken = latestActiveToken(studyParticipant?.accessTokens ?? []);
  const latestCtl = latest(studyParticipant?.ctlSessions ?? [], "createdAt");
  const rotation = summarizeRotation(studyParticipant);
  const triangularStatus = studyParticipant?.ctlTriangularRotationAssignment ? "COMPLETA" : "FALTA";
  const activitiesByCode = new Map((studyParticipant?.activities ?? []).map((activity) => [activity.activitySchedule?.code ?? activity.occurrenceKey, activity]));
  const hutFacts = summarizeHut(hutParticipant, context.auditsByEntityId.get(hutParticipant?.id ?? "") ?? []);
  const whatsapp = summarizeWhatsApp({
    conversations: collectWhatsAppConversations(studyParticipant, hutParticipant, context),
    referenceCodes
  });
  const warnings = [
    ...(readiness?.warnings ?? []).map((warning) => warning.code),
    ...hutFacts.warnings
  ];
  const blockingReasons = readiness?.blockingReasons.map((reason) => reason.code).join("; ") ?? "";
  const cltApplies = protocolType === "CLT_NAVIGO_HUT";
  const navigoApplies = protocolType === "CLT_NAVIGO_HUT";
  const hutApplies = Boolean(hutParticipant) || protocolType === "HUT_DIRECTO" || protocolType === "CLT_NAVIGO_HUT";
  const completedNavigoAt = maxDate(
    ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"]
      .map((code) => activitiesByCode.get(code)?.actualCompletedAt)
      .filter(Boolean)
  );

  return {
    NAV_FOLIO: navFolio,
    HUT_FOLIO: hutParticipant?.folio ?? (hutApplies ? hutFolio : ""),
    Nombre: profile?.name ?? hutParticipant?.name ?? "",
    "Telefono": profile?.phone ?? hutParticipant?.phone ?? "",
    Email: profile?.email ?? hutParticipant?.email ?? "",
    QA_MODE: qaMode ? "SI" : "NO",
    PROTOCOLO: protocolType,
    CLASIFICACION: classification,
    "Estado general participante": readiness?.currentStage ?? (classification === "RESERVA_HUT" ? "RESERVA_HUT_SIN_IDENTIDAD" : "SIN_REGISTRO"),
    SCREENING_STATUS: studyParticipant?.screeningStatus ?? "",
    OPERATIONAL_STATUS: studyParticipant?.operationalStatus ?? "",
    SCREENING_APPROVED_AT: formatDateTimeMexicoCity(confirmation?.approvedAt),
    IDENTIDAD_CREADA: studyParticipant ? "SI" : "NO",
    PARTICIPANT_CONFIRMATION: confirmation ? "SI" : "NO",
    CODIGO_SLOT_1: referenceCodes.get(1)?.code ?? "",
    CODIGO_SLOT_2: referenceCodes.get(2)?.code ?? "",
    CODIGO_SLOT_3: referenceCodes.get(3)?.code ?? "",
    USO_SLOT_1: codeSlotUsage(protocolType, 1),
    USO_SLOT_2: codeSlotUsage(protocolType, 2),
    USO_SLOT_3: codeSlotUsage(protocolType, 3),
    CODIGO_SLOT_1_STATUS: referenceCodes.get(1) ? "PRESENTE" : "FALTA",
    CODIGO_SLOT_2_STATUS: referenceCodes.get(2) ? "PRESENTE" : "FALTA",
    CODIGO_SLOT_3_STATUS: referenceCodes.get(3) ? "PRESENTE" : "FALTA",
    CODIGO_SLOT_1_USADO: "SIN_FUENTE_DIRECTA",
    CODIGO_SLOT_2_USADO: "SIN_FUENTE_DIRECTA",
    CODIGO_SLOT_3_USADO: "SIN_FUENTE_DIRECTA",
    CODIGO_SLOT_1_FECHA_USO: "",
    CODIGO_SLOT_2_FECHA_USO: "",
    CODIGO_SLOT_3_FECHA_USO: "",
    LINK_CLT: cltApplies ? new URL(`/ctl/${encodeURIComponent(context.study.code)}`, PUBLIC_ORIGIN).toString() : "",
    LINK_NAVIGO: navigoApplies && activeToken ? new URL(`/p/${encodeURIComponent(activeToken.id)}/activities`, PUBLIC_ORIGIN).toString() : "",
    LINK_HUT: hutParticipant?.token ? new URL(`/hut/p/${encodeURIComponent(hutParticipant.token)}`, PUBLIC_ORIGIN).toString() : "",
    PROTOCOL_TYPE: readiness?.protocolType ?? protocolType,
    CURRENT_STAGE: readiness?.currentStage ?? "",
    NEXT_ALLOWED_STAGE: readiness?.nextAllowedStage ?? "",
    READINESS_STATUS: readinessStatus(readiness),
    BLOCKING_REASON: blockingReasons,
    WARNINGS: warnings.join("; "),
    CLT_APPLIES: cltApplies ? "SI" : "NO",
    CLT_STATUS: latestCtl?.status ?? "",
    CLT_SESSION_ID: latestCtl?.id ?? "",
    CLT_STARTED_AT: formatDateTimeMexicoCity(latestCtl?.startedAt),
    CLT_COMPLETED_AT: formatDateTimeMexicoCity(latestCtl?.completedAt),
    CLT_T0: formatDateTimeMexicoCity(studyParticipant?.applicationStartedAt),
    CLT_ROTATION_STATUS: rotation.complete ? "COMPLETA" : "FALTA",
    TRIANGULAR_STATUS: triangularStatus,
    NAVIGO_APPLIES: navigoApplies ? "SI" : "NO",
    NAVIGO_STATUS: navigoStatus(activitiesByCode, activeToken),
    NAVIGO_TOKEN_STATUS: activeToken?.status ?? "",
    NAVIGO_STARTED_AT: formatDateTimeMexicoCity(studyParticipant?.applicationStartedAt),
    T3_STATUS: activityStatus(activitiesByCode.get("T3_HORAS")),
    T4_5_STATUS: activityStatus(activitiesByCode.get("T4_5_HORAS")),
    T6_STATUS: activityStatus(activitiesByCode.get("T6_HORAS")),
    NAVIGO_COMPLETED_AT: formatDateTimeMexicoCity(completedNavigoAt),
    HUT_APPLIES: hutApplies ? "SI" : "NO",
    HUT_ORIGIN: hutParticipant?.origin ?? "",
    HUT_STATUS: hutParticipant?.status ?? "",
    HUT_PROTOCOL_VERSION: hutParticipant?.protocolVersion ?? "",
    PRODUCT1_DELIVERY_STATUS: hutFacts.photoStatuses.DELIVERY,
    PRODUCT1_DAY1: hutFacts.photoStatuses.PRODUCT_1_DAY_1,
    PRODUCT1_DAY2: hutFacts.photoStatuses.PRODUCT_1_DAY_2,
    PRODUCT1_DAY3: hutFacts.photoStatuses.PRODUCT_1_DAY_3_MORNING,
    SECOND_STAGE_AUTHORIZED: hutFacts.secondStageAuthorized.explicit ? "SI" : hutFacts.secondStageAuthorized.legacy ? "LEGACY" : "NO",
    SECOND_STAGE_AUTHORIZED_AT: formatDateTimeMexicoCity(hutFacts.secondStageAuthorized.at),
    FIRST_PRODUCT_EVALUATION_STATUS: hutFacts.firstProductEvaluation.status,
    FIRST_PRODUCT_EVALUATION_COMPLETED_AT: formatDateTimeMexicoCity(hutFacts.firstProductEvaluation.completedAt),
    SECOND_PRODUCT_RELEASED: hutFacts.secondProductReleased.explicit ? "SI" : hutFacts.secondProductReleased.legacy ? "LEGACY" : "NO",
    SECOND_PRODUCT_RELEASED_AT: formatDateTimeMexicoCity(hutFacts.secondProductReleased.at),
    SECOND_PRODUCT_RELEASED_BY: hutFacts.secondProductReleased.actorUserId ?? "",
    SECOND_PRODUCT_RELEASED_REASON: hutFacts.secondProductReleased.reasonDetail ?? "",
    THIRD_STAGE_AUTHORIZED: hutFacts.thirdStageAuthorized.explicit ? "SI" : hutFacts.thirdStageAuthorized.legacy ? "LEGACY" : "NO",
    THIRD_STAGE_AUTHORIZED_AT: formatDateTimeMexicoCity(hutFacts.thirdStageAuthorized.at),
    CONFIRMACION_USO_SEGUNDO_PERFUME_STATUS: hutFacts.confirmSecondUse.status,
    COMPARATIVA_STATUS: hutFacts.comparativa.status,
    COMPARATIVA_COMPLETED_AT: formatDateTimeMexicoCity(hutFacts.comparativa.completedAt),
    LEGACY_REGRESO_1_STATUS: hutFacts.legacyRegreso1Status,
    LEGACY_REGRESO_2_STATUS: hutFacts.legacyRegreso2Status,
    LEGACY_SEGUNDA_VISITA_STATUS: hutFacts.legacySegundaVisitaStatus,
    LEGACY_CONFIRMACION_ENTREGA_STATUS: hutFacts.legacyConfirmacionEntregaStatus,
    WHATSAPP_PHONE: whatsapp.phone,
    LAST_TEMPLATE_SENT: whatsapp.lastTemplate,
    LAST_WHATSAPP_SENT_AT: formatDateTimeMexicoCity(whatsapp.lastSentAt),
    LAST_WHATSAPP_STATUS: whatsapp.lastStatus,
    CODE_MESSAGE_SENT: whatsapp.codeMessageSent ? "SI" : "NO",
    CODE_MESSAGE_SENT_AT: formatDateTimeMexicoCity(whatsapp.codeMessageSentAt),
    __sequence: sequence,
    __studyParticipantId: studyParticipant?.id ?? "",
    __hutParticipantId: hutParticipant?.id ?? "",
    __readiness: readiness,
    __hutFacts: hutFacts,
    __rotation: rotation
  };
}

function buildCodeRow(row) {
  return {
    NAV: row.NAV_FOLIO,
    PROTOCOLO: row.PROTOCOLO,
    CODIGO_SLOT_1: row.CODIGO_SLOT_1,
    USO_SLOT_1: row.USO_SLOT_1,
    CODIGO_SLOT_2: row.CODIGO_SLOT_2,
    USO_SLOT_2: row.USO_SLOT_2,
    CODIGO_SLOT_3: row.CODIGO_SLOT_3,
    USO_SLOT_3: row.USO_SLOT_3
  };
}

function buildHutOperationRow(row) {
  const facts = row.__hutFacts;
  return {
    NAV: row.NAV_FOLIO,
    HUT: row.HUT_FOLIO,
    PROTOCOLO: row.PROTOCOLO,
    ESTADO_ACTUAL: row["Estado general participante"],
    SIGUIENTE_ACCION: nextHutAction(row),
    PRODUCTO_ACTUAL: currentHutProduct(row),
    CODIGO_REQUERIDO_SIGUIENTE_ETAPA: nextRequiredCodeSlot(row),
    BLOQUEO_ACTUAL: row.BLOCKING_REASON || facts?.blocking || ""
  };
}

function buildAuditRows(rows, context) {
  const auditRows = [
    {
      FOLIO: "GLOBAL",
      TIPO: "FUENTE_FALTANTE",
      CODIGO: "PARTICIPANT_REFERENCE_CODE_USAGE",
      DETALLE: "ParticipantReferenceCode almacena slot/code/createdAt, pero no status de uso ni fecha de uso. No se reconstruye desde HutParticipantPhaseCode por regla del export.",
      SEVERIDAD: "INFO"
    },
    {
      FOLIO: "GLOBAL",
      TIPO: "FUENTE_FALTANTE",
      CODIGO: "CLT_LINK_NO_PARTICIPANT_TOKEN",
      DETALLE: "CLT se expone como link de estudio/captura por codigo, no como link unico por participante en los modelos revisados.",
      SEVERIDAD: "INFO"
    },
    {
      FOLIO: "GLOBAL",
      TIPO: "CONFIGURACION",
      CODIGO: "PUBLIC_ORIGIN",
      DETALLE: `Los links se construyeron con dominio publico ${PUBLIC_ORIGIN}.`,
      SEVERIDAD: "INFO"
    }
  ];

  for (const row of rows) {
    if (row.CLASIFICACION === "RESERVA_HUT") {
      auditRows.push({
        FOLIO: row.NAV_FOLIO,
        TIPO: "RESERVA",
        CODIGO: "RESERVA_HUT_SIN_IDENTIDAD",
        DETALLE: `${row.HUT_FOLIO} existe sin StudyParticipant/ParticipantConfirmation operativo.`,
        SEVERIDAD: "WARN"
      });
    }
    for (const reason of row.__readiness?.blockingReasons ?? []) {
      auditRows.push({
        FOLIO: row.NAV_FOLIO,
        TIPO: "READINESS_BLOCKING",
        CODIGO: reason.code,
        DETALLE: reason.message,
        SEVERIDAD: "WARN"
      });
    }
    for (const warning of row.__readiness?.warnings ?? []) {
      auditRows.push({
        FOLIO: row.NAV_FOLIO,
        TIPO: "READINESS_WARNING",
        CODIGO: warning.code,
        DETALLE: warning.message,
        SEVERIDAD: "INFO"
      });
    }
    for (const warning of row.__hutFacts?.warnings ?? []) {
      auditRows.push({
        FOLIO: row.NAV_FOLIO,
        TIPO: "HUT_LEGACY",
        CODIGO: warning,
        DETALLE: "El HUT conserva avance/eventos historicos diferenciados del flujo nuevo.",
        SEVERIDAD: "INFO"
      });
    }
  }

  return auditRows;
}

async function buildWorkbook(extract) {
  const workbook = Workbook.create();
  writeSheet(workbook, "MAESTRO_PARTICIPANTES", stripInternal(extract.masterRows));
  writeSheet(workbook, "CODIGOS_MAESTROS", extract.codeRows);
  writeSheet(workbook, "OPERACION_HUT", extract.hutOperationRows);
  writeSheet(workbook, "AUDITORIA", extract.auditRows);
  return workbook;
}

function writeSheet(workbook, name, rows) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const headers = rows.length ? Object.keys(rows[0]) : ["SIN_DATOS"];
  const values = [
    headers,
    ...rows.map((row) => headers.map((header) => normalizeCellValue(row[header])))
  ];
  const range = sheet.getRangeByIndexes(0, 0, values.length, headers.length);
  range.values = values;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(name === "MAESTRO_PARTICIPANTES" ? 2 : 1);
  const headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
  headerRange.format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true
  };
  range.format.borders = { color: "#D7E2DF", preset: "inside", style: "thin" };
  range.format.font = { name: "Aptos", size: 10 };
  range.format.autofitColumns();
  range.format.autofitRows();
  for (let col = 0; col < headers.length; col += 1) {
    const colRange = sheet.getRangeByIndexes(0, col, values.length, 1);
    const width = preferredColumnWidth({
      header: headers[col],
      sheetName: name,
      values: values.slice(0, 80).map((row) => row[col])
    });
    colRange.format.columnWidth = width;
  }
  if (values.length > 1) {
    const dataRange = sheet.getRangeByIndexes(1, 0, values.length - 1, headers.length);
    dataRange.format.wrapText = false;
    if (name === "AUDITORIA") {
      sheet.getRangeByIndexes(1, 3, values.length - 1, 1).format.wrapText = true;
      sheet.getRangeByIndexes(1, 3, values.length - 1, 1).format.rowHeight = 36;
    }
    if (name === "OPERACION_HUT") {
      sheet.getRangeByIndexes(1, 7, values.length - 1, 1).format.wrapText = true;
    }
  }
}

function preferredColumnWidth({ header, sheetName, values }) {
  const maxTextLength = Math.max(
    String(header).length,
    ...values.map((value) => String(value ?? "").length)
  );
  const base = Math.ceil(maxTextLength * 0.9);
  const caps = {
    AUDITORIA: header === "DETALLE" ? 70 : 30,
    CODIGOS_MAESTROS: 38,
    MAESTRO_PARTICIPANTES: header.startsWith("LINK_") || header === "BLOCKING_REASON" || header === "WARNINGS" ? 48 : 34,
    OPERACION_HUT: header === "BLOQUEO_ACTUAL" ? 70 : 36
  };
  const cap = caps[sheetName] ?? 36;
  return Math.min(Math.max(11, base), cap);
}

async function verifyWorkbook(workbook) {
  for (const sheetName of ["MAESTRO_PARTICIPANTES", "CODIGOS_MAESTROS", "OPERACION_HUT", "AUDITORIA"]) {
    const preview = await workbook.render({
      autoCrop: "all",
      format: "png",
      range: sheetName === "MAESTRO_PARTICIPANTES" ? "A1:AD25" : "A1:L25",
      scale: 1,
      sheetName
    });
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${sheetName.toLowerCase()}_preview.png`),
      new Uint8Array(await preview.arrayBuffer())
    );
  }
  const errors = await workbook.inspect({
    kind: "match",
    options: { maxResults: 50, useRegex: true },
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    summary: "final formula error scan"
  });
  if (errors.ndjson && /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(errors.ndjson)) {
    throw new Error(`Formula error scan found issues: ${errors.ndjson}`);
  }
}

function stripInternal(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("__"))
  ));
}

function summarizeRotation(studyParticipant) {
  const arms = studyParticipant?.rotationAssignment?.arms ?? studyParticipant?.armAssignments ?? [];
  const first = arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const second = arms.find((arm) => arm.applicationOrder === 2) ?? null;
  return {
    complete: Boolean(first?.studyProduct?.internalCode && second?.studyProduct?.internalCode),
    eva1: first?.studyProduct?.internalCode ?? "",
    eva2: second?.studyProduct?.internalCode ?? "",
    rotationCode: studyParticipant?.rotationAssignment?.rotationCode ?? "",
    rotationPlan: studyParticipant?.rotationAssignment?.rotationPlan?.name ?? ""
  };
}

function summarizeHut(participant, auditLogs) {
  if (!participant) {
    return emptyHutFacts();
  }

  const phaseByName = new Map((participant.phaseCodes ?? []).map((code) => [code.phase, code]));
  const visits = participant.questionnaireAttempt?.visits ?? [];
  const answers = participant.questionnaireAttempt?.answers ?? [];
  const visitBySection = new Map(visits.map((visit) => [visit.section, visit]));
  const evidenceByPhase = new Map((participant.applicationEvidence ?? []).map((evidence) => [evidence.phase, evidence]));
  const photoByDay = new Map((participant.applicationPhotoEntries ?? []).map((photo) => [photo.useDayNumber, photo]));
  const legacyMirror = isLegacyMirroredPlacementPhoto(evidenceByPhase.get("COLOCACION"), photoByDay.get(1), photoByDay.get(0));
  const deliveryDone = Boolean(photoByDay.get(0) || (legacyMirror && evidenceByPhase.get("COLOCACION")));
  const product1Day1Done = Boolean(legacyMirror ? false : photoByDay.get(1) || evidenceByPhase.get("COLOCACION"));
  const product2PhotosStarted = [4, 5, 6].some((day) => photoByDay.has(day));
  const secondStageAudit = findAudit(auditLogs, "SECOND_STAGE_AUTHORIZED");
  const secondProductAudit = findAudit(auditLogs, "SECOND_PRODUCT_RELEASED");
  const thirdStageAudit = findAudit(auditLogs, "THIRD_STAGE_AUTHORIZED");
  const firstEvalVisit = visitBySection.get("EVALUACION_PRIMER_PERFUME") ?? null;
  const confirmUseVisit = visitBySection.get("EVALUACION_SEGUNDO_PERFUME") ?? null;
  const comparativaVisit = visitBySection.get("COMPARATIVA") ?? null;
  const legacySecondStage = Boolean(
    ["USED", "VALIDATED"].includes(phaseByName.get("REGRESO_1")?.status ?? "") ||
    firstEvalVisit ||
    answers.some((answer) => /^HUT_P(?:[1-9]|1[0-9]|2[0-3])A(?:_|$)/.test(answer.questionCode))
  );
  const legacySecondProduct = Boolean(
    ["USED", "VALIDATED"].includes(phaseByName.get("REGRESO_1")?.status ?? "") ||
    product2PhotosStarted ||
    evidenceByPhase.get("REGRESO_2") ||
    visits.some((visit) => ["EVALUACION_SEGUNDO_PERFUME", "SEGUNDA_VISITA", "COMPARATIVA"].includes(visit.section)) ||
    answers.some((answer) => /^HUT_P(?:[1-9]|1[0-9]|2[0-7])B(?:_|$)/.test(answer.questionCode) || /^HUT_P2[4-7](?:_|$)/.test(answer.questionCode) || answer.questionCode.startsWith("HUT_V2_"))
  );
  const legacyThirdStage = Boolean(
    visits.some((visit) => ["EVALUACION_SEGUNDO_PERFUME", "COMPARATIVA"].includes(visit.section)) ||
    answers.some((answer) => /^HUT_P(?:[1-9]|1[0-9]|2[0-3])B(?:_|$)/.test(answer.questionCode) || /^HUT_P2[4-7](?:_|$)/.test(answer.questionCode))
  );
  const warnings = [];
  if (!secondStageAudit && legacySecondStage) warnings.push("LEGACY_PROGRESS_WITHOUT_EVENT_SECOND_STAGE");
  if (!secondProductAudit && legacySecondProduct) warnings.push("LEGACY_PROGRESS_WITHOUT_EVENT_SECOND_PRODUCT");
  if (!thirdStageAudit && legacyThirdStage) warnings.push("LEGACY_PROGRESS_WITHOUT_EVENT_THIRD_STAGE");

  return {
    blocking: "",
    comparativa: {
      completedAt: comparativaVisit?.completedAt ?? null,
      status: comparativaVisit?.status ?? inferQuestionSetStatus(answers, /^HUT_P2[4-7](?:_|$)/)
    },
    confirmSecondUse: {
      completedAt: confirmUseVisit?.completedAt ?? null,
      status: confirmUseVisit?.status ?? inferQuestionSetStatus(answers, /^HUT_P[1-3]B(?:_|$)/)
    },
    firstProductEvaluation: {
      completedAt: firstEvalVisit?.completedAt ?? null,
      status: firstEvalVisit?.status ?? inferQuestionSetStatus(answers, /^HUT_P(?:[1-9]|1[0-9]|2[0-3])A(?:_|$)/)
    },
    legacyConfirmacionEntregaStatus: answers.some((answer) => answer.questionCode === "HUT_V2_CONFIRMACION_ENTREGA") ? "RESPONDIDA" : "",
    legacyRegreso1Status: phaseByName.get("REGRESO_1")?.status ?? "",
    legacyRegreso2Status: phaseByName.get("REGRESO_2")?.status ?? "",
    legacySegundaVisitaStatus: visitBySection.get("SEGUNDA_VISITA")?.status ?? "",
    photoStatuses: {
      DELIVERY: deliveryDone ? "COMPLETED" : "PENDING",
      PRODUCT_1_DAY_1: product1Day1Done ? "COMPLETED" : deliveryDone ? "AVAILABLE" : "BLOCKED",
      PRODUCT_1_DAY_2: photoByDay.get(2) ? "COMPLETED" : product1Day1Done ? "PENDING" : "BLOCKED",
      PRODUCT_1_DAY_3_MORNING: photoByDay.get(3) ? "COMPLETED" : photoByDay.get(2) ? "PENDING" : "BLOCKED",
      PRODUCT_2_DAY_1: photoByDay.get(4) ? "COMPLETED" : secondProductAudit || legacySecondProduct ? "PENDING" : "BLOCKED",
      PRODUCT_2_DAY_2: photoByDay.get(5) ? "COMPLETED" : photoByDay.get(4) ? "PENDING" : "BLOCKED",
      PRODUCT_2_DAY_3_MORNING: photoByDay.get(6) ? "COMPLETED" : photoByDay.get(5) ? "PENDING" : "BLOCKED"
    },
    secondProductReleased: {
      actorUserId: secondProductAudit?.actorUserId ?? null,
      at: secondProductAudit?.createdAt ?? null,
      explicit: Boolean(secondProductAudit),
      legacy: !secondProductAudit && legacySecondProduct,
      reasonDetail: objectValue(secondProductAudit?.afterJson, "reasonDetail") ?? secondProductAudit?.reason ?? ""
    },
    secondStageAuthorized: {
      at: secondStageAudit?.createdAt ?? null,
      explicit: Boolean(secondStageAudit),
      legacy: !secondStageAudit && legacySecondStage
    },
    thirdStageAuthorized: {
      at: thirdStageAudit?.createdAt ?? null,
      explicit: Boolean(thirdStageAudit),
      legacy: !thirdStageAudit && legacyThirdStage
    },
    warnings
  };
}

function emptyHutFacts() {
  return {
    blocking: "",
    comparativa: { completedAt: null, status: "" },
    confirmSecondUse: { completedAt: null, status: "" },
    firstProductEvaluation: { completedAt: null, status: "" },
    legacyConfirmacionEntregaStatus: "",
    legacyRegreso1Status: "",
    legacyRegreso2Status: "",
    legacySegundaVisitaStatus: "",
    photoStatuses: {
      DELIVERY: "",
      PRODUCT_1_DAY_1: "",
      PRODUCT_1_DAY_2: "",
      PRODUCT_1_DAY_3_MORNING: ""
    },
    secondProductReleased: { actorUserId: null, at: null, explicit: false, legacy: false, reasonDetail: "" },
    secondStageAuthorized: { at: null, explicit: false, legacy: false },
    thirdStageAuthorized: { at: null, explicit: false, legacy: false },
    warnings: []
  };
}

function calculateReadiness(studyParticipant, hutParticipant) {
  const protocolType = resolveProtocolType(studyParticipant, hutParticipant);
  const referenceSlots = (studyParticipant.participantConfirmation?.referenceCodes ?? []).map((code) => code.slot).sort((a, b) => a - b);
  const screeningPassedByEvidence = Boolean(
    studyParticipant.participantConfirmation &&
    (
      studyParticipant.participantConfirmation.screeningAttempt?.status === "PASSED" ||
      studyParticipant.participantScreeningReviews?.some((review) => review.status === "APPROVED")
    )
  );
  const rotationComplete = summarizeRotation(studyParticipant).complete;
  const cltCompleted = (studyParticipant.ctlSessions ?? []).some((session) => session.status === "COMPLETED");
  const activeTokenExists = Boolean(latestActiveToken(studyParticipant.accessTokens ?? []));
  const activitiesByCode = new Map((studyParticipant.activities ?? []).map((activity) => [activity.activitySchedule?.code ?? "", activity]));
  const currentNavigoActivitiesExist = ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"].every((code) => activitiesByCode.has(code));
  const navigoCompleted = ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"].every((code) => activitiesByCode.get(code)?.status === "COMPLETED");
  const hutFacts = summarizeHut(hutParticipant, []);
  const hutStarted = Boolean(hutParticipant && (hutParticipant.status !== "NOT_STARTED" || hutParticipant.applicationPhotoEntries?.length || hutParticipant.applicationEvidence?.length));
  const hutCompleted = Boolean(hutParticipant?.status === "COMPLETED" || hutFacts.comparativa.status === "COMPLETED");
  const evidence = {
    activeTokenExists,
    cltCompleted,
    confirmationExists: Boolean(studyParticipant.participantConfirmation),
    currentNavigoActivitiesExist,
    hasAllReferenceCodes: [1, 2, 3].every((slot) => referenceSlots.includes(slot)),
    hutCompleted,
    hutExists: Boolean(hutParticipant),
    hutStarted,
    navigoCompleted,
    referenceSlots,
    rotationComplete,
    screeningPassedByEvidence,
    t0Exists: Boolean(studyParticipant.applicationStartedAt),
    triangularRotationExists: Boolean(studyParticipant.ctlTriangularRotationAssignment)
  };
  const stages = {
    screening: stageStatus([
      [Boolean(studyParticipant.id), "PARTICIPANT_MISSING", "Falta identidad operativa."],
      [evidence.confirmationExists, "CONFIRMATION_MISSING", "Falta ParticipantConfirmation."],
      [evidence.screeningPassedByEvidence, "SCREENING_EVIDENCE_NOT_PASSED", "No existe evidencia de screening aprobado."],
      [evidence.hasAllReferenceCodes, "REFERENCE_CODES_INCOMPLETE", "Faltan codigos maestros 1/2/3."]
    ]),
    clt: protocolType === "HUT_DIRECTO" ? notApplicableStage() : stageStatus([
      [evidence.screeningPassedByEvidence, "SCREENING_NOT_READY", "Screening aun no esta listo."],
      [evidence.rotationComplete, "ROTATION_INCOMPLETE", "Falta rotacion Navigo completa."],
      [evidence.triangularRotationExists, "TRIANGULAR_ROTATION_MISSING", "Falta rotacion triangular."]
    ], evidence.cltCompleted),
    navigo: protocolType === "HUT_DIRECTO" ? notApplicableStage() : stageStatus([
      [evidence.cltCompleted, "CLT_NOT_COMPLETED", "CLT aun no esta completado."],
      [evidence.t0Exists, "T0_MISSING", "Falta T0/applicationStartedAt."],
      [evidence.rotationComplete, "ROTATION_INCOMPLETE", "Falta rotacion Navigo completa."],
      [evidence.activeTokenExists, "ACTIVE_TOKEN_MISSING", "Falta token Navigo activo."],
      [evidence.currentNavigoActivitiesExist, "ACTIVITIES_MISSING", "Faltan actividades T3/T4.5/T6."]
    ], evidence.navigoCompleted),
    hut: stageStatus([
      [evidence.screeningPassedByEvidence, "SCREENING_NOT_READY", "Screening aun no esta listo."],
      [protocolType === "HUT_DIRECTO" || evidence.cltCompleted, "CLT_NOT_COMPLETED", "CLT aun no esta completado."],
      [protocolType === "HUT_DIRECTO" || (evidence.activeTokenExists && evidence.currentNavigoActivitiesExist), "NAVIGO_NOT_READY", "Navigo aun no esta listo."],
      [evidence.hutExists, "HUT_PARTICIPANT_MISSING", "Falta HutParticipant."],
      [!isReservedHutWithoutIdentity(hutParticipant), "RESERVED_WITHOUT_OPERATIONAL_IDENTITY", "HUT reservado sin identidad operativa."]
    ], evidence.hutCompleted)
  };
  const blockingReasons = Object.values(stages).flatMap((stage) => stage.blockingReasons);
  const warnings = [];
  if (evidence.screeningPassedByEvidence && studyParticipant.screeningStatus !== "PASSED") {
    warnings.push({ code: "STALE_AGGREGATED_STATUS", message: "screeningStatus declarado no coincide con evidencia de aprobacion.", stage: "SCREENING" });
  }
  return {
    blockingReasons,
    currentStage: resolveCurrentStage({ evidence, protocolType, stages }),
    nextAllowedStage: resolveNextAllowedStage({ evidence, protocolType, stages }),
    operationalEvidence: evidence,
    protocolType,
    stages,
    warnings
  };
}

function stageStatus(checks, completed = false) {
  const blockingReasons = checks
    .filter(([ok]) => !ok)
    .map(([, code, message]) => ({ code, message, stage: "HUT" }));
  return {
    applicable: true,
    blockingReasons: completed ? [] : blockingReasons,
    completed,
    ready: !completed && blockingReasons.length === 0,
    status: completed ? "COMPLETED" : blockingReasons.length === 0 ? "READY" : "BLOCKED",
    warnings: []
  };
}

function notApplicableStage() {
  return { applicable: false, blockingReasons: [], completed: false, ready: false, status: "NOT_APPLICABLE", warnings: [] };
}

function resolveCurrentStage({ evidence, protocolType }) {
  if (!evidence.confirmationExists || !evidence.screeningPassedByEvidence || !evidence.hasAllReferenceCodes) return "SCREENING_PENDING";
  if (evidence.hutCompleted) return "HUT_COMPLETED";
  if (protocolType === "HUT_DIRECTO") return "SCREENING_COMPLETED";
  if (evidence.activeTokenExists && evidence.currentNavigoActivitiesExist) return "NAVIGO_READY";
  if (evidence.cltCompleted) return "CLT_COMPLETED";
  if (evidence.rotationComplete && evidence.triangularRotationExists) return "CLT_READY";
  return "SCREENING_COMPLETED";
}

function resolveNextAllowedStage({ evidence, protocolType }) {
  if (!evidence.confirmationExists || !evidence.screeningPassedByEvidence || !evidence.hasAllReferenceCodes) return "SCREENING";
  if (protocolType === "HUT_DIRECTO") return evidence.hutCompleted ? null : "HUT";
  if (!evidence.cltCompleted) return "CLT";
  if (!evidence.navigoCompleted) return "NAVIGO";
  if (!evidence.hutCompleted) return "HUT";
  return null;
}

function resolveProtocolType(studyParticipant, hutParticipant) {
  if (hutParticipant?.origin === "HUT_DIRECTO") return "HUT_DIRECTO";
  return "CLT_NAVIGO_HUT";
}

function classifyRow({ hutParticipant, qaMode, studyParticipant }) {
  if (qaMode) return "QA";
  if (studyParticipant) return "PARTICIPANTE_OPERATIVO";
  if (isReservedHutWithoutIdentity(hutParticipant)) return "RESERVA_HUT";
  if (hutParticipant) return "HUT_SIN_IDENTIDAD_OPERATIVA";
  return "SIN_REGISTRO";
}

function isReservedHutWithoutIdentity(hutParticipant) {
  return Boolean(
    hutParticipant &&
    hutParticipant.origin === "HUT_DIRECTO" &&
    !hutParticipant.studyParticipantId &&
    !normalizeText(hutParticipant.phone) &&
    !normalizeText(hutParticipant.email) &&
    /^HUT-\d+$/i.test(normalizeText(hutParticipant.name))
  );
}

function codeSlotUsage(protocolType, slot) {
  if (protocolType === "HUT_DIRECTO") {
    return {
      1: "HUT inicial / Producto 1",
      2: "Evaluacion primer perfume",
      3: "Confirmacion uso segundo perfume + comparativa"
    }[slot] ?? "";
  }
  return {
    1: "CLT",
    2: "HUT inicial / Producto 1",
    3: "Segunda etapa HUT: confirmacion uso segundo perfume + comparativa"
  }[slot] ?? "";
}

function nextHutAction(row) {
  const facts = row.__hutFacts;
  if (row.CLASIFICACION === "RESERVA_HUT") return "Reserva HUT sin identidad";
  if (row.PROTOCOLO === "CLT_NAVIGO_HUT" && row.CLT_STATUS !== "COMPLETED") return "Esperando CLT";
  if (row.PROTOCOLO === "CLT_NAVIGO_HUT" && !["READY", "COMPLETED"].includes(row.__readiness?.stages?.navigo?.status ?? "")) return "Esperando Navigo";
  if (facts.photoStatuses.DELIVERY !== "COMPLETED") return "Entrega de producto";
  if (["PRODUCT_1_DAY_1", "PRODUCT_1_DAY_2", "PRODUCT_1_DAY_3_MORNING"].some((slot) => facts.photoStatuses[slot] !== "COMPLETED")) return "Fotos Producto 1";
  if (row.SECOND_STAGE_AUTHORIZED === "NO") return "Esperando codigo segunda etapa";
  if (row.FIRST_PRODUCT_EVALUATION_STATUS !== "COMPLETED") return "Evaluacion primer perfume";
  if (row.SECOND_PRODUCT_RELEASED === "NO") return "Esperando liberacion segundo producto";
  if (["PRODUCT_2_DAY_1", "PRODUCT_2_DAY_2", "PRODUCT_2_DAY_3_MORNING"].some((slot) => facts.photoStatuses[slot] !== "COMPLETED")) return "Fotos Producto 2";
  if (row.THIRD_STAGE_AUTHORIZED === "NO") return "Esperando codigo tercera etapa";
  if (row.CONFIRMACION_USO_SEGUNDO_PERFUME_STATUS !== "COMPLETED") return "Confirmacion uso segundo perfume";
  if (row.COMPARATIVA_STATUS !== "COMPLETED") return "Comparativa";
  return "HUT completo";
}

function currentHutProduct(row) {
  const action = nextHutAction(row);
  if (action.includes("Producto 2") || action.includes("segundo")) return "Producto 2";
  if (action.includes("Producto 1") || action.includes("primer") || action.includes("Entrega")) return "Producto 1";
  return "";
}

function nextRequiredCodeSlot(row) {
  const action = nextHutAction(row);
  if (action === "Esperando codigo segunda etapa") return row.PROTOCOLO === "HUT_DIRECTO" ? "SLOT_2" : "SLOT_3";
  if (action === "Esperando codigo tercera etapa") return "SLOT_3";
  return "";
}

function readinessStatus(readiness) {
  if (!readiness) return "";
  if (readiness.blockingReasons.length) return "BLOQUEADO";
  if (readiness.currentStage.endsWith("COMPLETED")) return "COMPLETED";
  return "READY";
}

function navigoStatus(activitiesByCode, activeToken) {
  if (!activeToken) return "";
  const statuses = ["T3_HORAS", "T4_5_HORAS", "T6_HORAS"].map((code) => activitiesByCode.get(code)?.status).filter(Boolean);
  if (statuses.length === 0) return "TOKEN_SIN_ACTIVIDADES";
  if (statuses.every((status) => status === "COMPLETED")) return "COMPLETED";
  if (statuses.some((status) => ["AVAILABLE", "STARTED", "REOPENED"].includes(status))) return "EN_PROGRESO";
  return "PENDIENTE";
}

function activityStatus(activity) {
  if (!activity) return "";
  return `${activity.status}${activity.actualCompletedAt ? ` (${formatDateTimeMexicoCity(activity.actualCompletedAt)})` : ""}`;
}

function collectWhatsAppConversations(studyParticipant, hutParticipant, context) {
  const conversations = [];
  if (studyParticipant?.id) conversations.push(...(context.whatsappByParticipantId.get(studyParticipant.id) ?? []));
  for (const phone of [studyParticipant?.participantProfile?.phone, hutParticipant?.phone].map(normalizePhone).filter(Boolean)) {
    conversations.push(...(context.whatsappByPhone.get(phone) ?? []));
  }
  return uniqueBy(conversations, (item) => item.id);
}

function summarizeWhatsApp({ conversations, referenceCodes }) {
  const messages = conversations
    .flatMap((conversation) => conversation.messages.map((message) => ({ ...message, conversation })))
    .filter((message) => message.direction === "OUTBOUND")
    .sort((left, right) => dateValue(right.timestamp ?? right.createdAt) - dateValue(left.timestamp ?? left.createdAt));
  const last = messages[0] ?? null;
  const codeMessage = messages.find((message) => {
    const template = extractTemplateName(message.rawPayload);
    return ["oneui_navigo_confirmation_participacion", "oneui_navigo_confirmacion_participacion"].includes(template ?? "");
  }) ?? null;
  return {
    codeMessageSent: Boolean(codeMessage && referenceCodes.size === 3),
    codeMessageSentAt: codeMessage?.timestamp ?? codeMessage?.createdAt ?? null,
    lastSentAt: last?.timestamp ?? last?.createdAt ?? null,
    lastStatus: last?.status ?? "",
    lastTemplate: extractTemplateName(last?.rawPayload) ?? "",
    phone: last?.toPhone ?? conversations[0]?.phoneNumber ?? ""
  };
}

function extractTemplateName(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.templateName === "string") return value.templateName;
  if (value.template && typeof value.template === "object" && typeof value.template.name === "string") return value.template.name;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractTemplateName(item);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = extractTemplateName(child);
    if (found) return found;
  }
  return null;
}

function findAudit(logs, reason) {
  return logs.find((log) => log.reason === reason || objectValue(log.afterJson, "action") === reason) ?? null;
}

function inferQuestionSetStatus(answers, regex) {
  return answers.some((answer) => regex.test(answer.questionCode)) ? "IN_PROGRESS" : "PENDING";
}

function isLegacyMirroredPlacementPhoto(colocacionEvidence, day1Entry, deliveryEntry) {
  if (!colocacionEvidence || !day1Entry || deliveryEntry) return false;
  return colocacionEvidence.privateStorageKey &&
    day1Entry.privateStorageKey &&
    colocacionEvidence.privateStorageKey === day1Entry.privateStorageKey &&
    dateValue(colocacionEvidence.capturedAt) === dateValue(day1Entry.capturedAt) &&
    colocacionEvidence.productCode === day1Entry.productCode;
}

function latestActiveToken(tokens) {
  const now = Date.now();
  return tokens.find((token) => token.status === "ACTIVE" && (!token.expiresAt || dateValue(token.expiresAt) > now)) ?? null;
}

function latest(items, dateKey) {
  return [...items].sort((left, right) => dateValue(right[dateKey]) - dateValue(left[dateKey]))[0] ?? null;
}

function maxDate(values) {
  if (!values.length) return null;
  return new Date(Math.max(...values.map(dateValue)));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "SIN_VALOR";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function unique(items) {
  return [...new Set(items)];
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return [...map.values()];
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeText(value) {
  return (value ?? "").toString().trim();
}

function normalizeOrigin(value) {
  return normalizeText(value).replace(/\/+$/g, "");
}

function dateValue(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function objectValue(value, key) {
  return value && typeof value === "object" && key in value ? value[key] : null;
}

function formatDateTimeMexicoCity(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Mexico_City",
    year: "numeric"
  }).format(date);
  return `${formatted} hrs CDMX`;
}

function normalizeCellValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return formatDateTimeMexicoCity(value);
  if (Array.isArray(value)) return value.join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}
