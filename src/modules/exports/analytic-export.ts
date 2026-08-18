import {
  CTL_AGE_RANGE_OPTIONS,
  getCtlDefinition,
  type CtlMatrixQuestionDefinition,
  type CtlQuestionDefinition
} from "@/modules/ctl/definition";
import { getHutQuestions, type HutMatrixQuestionDefinition, type HutQuestionDefinition } from "@/modules/hut";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";

const DEFAULT_TIME_ZONE = "America/Mexico_City";
const EXCEL_XML_CONTENT_TYPE = "application/vnd.ms-excel; charset=utf-8";

type Delegate = {
  findMany?: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
};

type AnalyticExportPrismaClient = PrismaClientLike & {
  hutParticipant: Delegate;
  study: Delegate;
  studyParticipant: Delegate;
};

export type FinalAnalyticExportResult = {
  body: string;
  contentType: string;
  filename: string;
  rowCount: {
    reporteClt: number;
    reporteHut: number;
  };
  sheets: ["REPORTE CLT", "REPORTE HUT"];
};

type BuildFinalAnalyticExportInput = {
  now?: Date;
  prismaClient?: AnalyticExportPrismaClient;
  studyId: string;
};

type StudyRecord = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string | null;
};

type ReferenceCodeRecord = {
  code: string;
  slot: number;
};

type ScreeningAnswerRecord = {
  answerJson: unknown;
  questionId: string;
};

type ScreeningAttemptRecord = {
  answers: ScreeningAnswerRecord[];
  completedAt: Date | null;
  id: string;
  nseClass: string | null;
  nseScore: number | null;
  participantScreeningReview?: {
    status: string;
  } | null;
  startedAt: Date;
  status: string;
  terminationReason: string | null;
};

type CtlAnswerRecord = {
  answerValue: unknown;
  questionCode: string;
};

type CtlSessionRecord = {
  answers: CtlAnswerRecord[];
  completedAt: Date | null;
  id: string;
  status: string;
  triangularRotationSnapshot: unknown;
};

type RotationRecord = {
  rotationCode: string | null;
  rotationPlan: {
    name: string | null;
  } | null;
};

type ArmAssignmentRecord = {
  applicationOrder: number;
  participantVisibleLabel: string;
  studyArm: {
    code: string;
    label: string;
  };
  studyProduct: {
    displayLabel: string;
    internalCode: string;
  };
};

type TriangularRotationRecord = {
  triangular1Pr1: string;
  triangular1Pr2: string;
  triangular1Pr3: string;
  triangular1Verify: string;
  triangular2Pr1: string;
  triangular2Pr2: string;
  triangular2Pr3: string;
  triangular2Verify: string;
};

type HutAnswerRecord = {
  answerJson: unknown;
  questionCode: string;
};

type HutQuestionnaireAttemptRecord = {
  answers: HutAnswerRecord[];
};

type HutParticipantRecord = {
  email: string | null;
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  origin: string;
  phone: string | null;
  questionnaireAttempt: HutQuestionnaireAttemptRecord | null;
  secondFragranceRightArm: string | null;
  studyParticipantId?: string | null;
};

type StudyParticipantRecord = {
  armAssignments: ArmAssignmentRecord[];
  ctlSessions: CtlSessionRecord[];
  ctlTriangularRotationAssignment: TriangularRotationRecord | null;
  hutParticipant: HutParticipantRecord | null;
  id: string;
  participantConfirmation: {
    approvedAt: Date;
    folio: string;
    referenceCodes: ReferenceCodeRecord[];
    screeningAttempt: ScreeningAttemptRecord | null;
  } | null;
  participantProfile: {
    email: string | null;
    name: string;
    phone: string | null;
  };
  rotationAssignment: RotationRecord | null;
  screeningAttempts: ScreeningAttemptRecord[];
  screeningStatus: string;
};

type AnalyticParticipant = {
  arms: ArmAssignmentRecord[];
  cltAnswers: Map<string, unknown>;
  ctlSession: CtlSessionRecord | null;
  hutAnswers: Map<string, unknown>;
  hutEva1: string;
  hutEva2: string;
  hutFolio: string;
  id: string;
  name: string;
  navFolio: string;
  rotation: RotationRecord | null;
  screeningAttempt: ScreeningAttemptRecord | null;
  screeningAnswers: Map<string, unknown>;
  triangularRotation: TriangularRotationRecord | null;
};

type Report = {
  columns: string[];
  rows: string[][];
};

const SCREENING_ORDER = [
  "F0",
  "OP1_RECLUTADOR",
  "CONSENTIMIENTO",
  "F1_GENERO",
  "GENERO",
  "F2_EDAD",
  "EDAD_EXACTA",
  "RANGO_EDAD",
  "F3_EXCLUSION_LABORAL",
  "F4_PARTICIPACION_RECIENTE_PERFUMES",
  "F4_PARTICIPACION_RECIENTE",
  "F5_CONDICIONES_FISICAS",
  "F6_MARCAS_UTILIZA",
  "F7_Marca_Frecuente",
  "F7_MARCA_FRECUENTE",
  "F8_VARIANTE_COLOR",
  "F9_FRECUENCIA_SEMANAL",
  "F9A_VECES_AL_DIA",
  "F10_ULTIMA_COMPRA",
  "F11",
  "F12",
  "F13",
  "NSE",
  "PUNTAJE_NSE",
  "D1_ESCOLARIDAD_JEFE_HOGAR",
  "D2_BANOS_COMPLETOS",
  "D3_AUTOMOVILES_HOGAR",
  "D3_AUTOS",
  "D4_INTERNET_HOGAR",
  "D4_INTERNET",
  "D5_PERSONAS_TRABAJARON",
  "D6_CUARTOS_DORMIR",
  "HUT_ACCESO_CORRIDO"
] as const;

const HUT_PREFIX_QUESTION_ORDER = [
  "HUT_DG_NOMBRE",
  "HUT_DG_FOLIO",
  "HUT_DG_COLONIA",
  "HUT_DG_TELEFONO",
  "HUT_DG_DIRECCION",
  "HUT_DG_EMAIL",
  "HUT_PARTICIPO_CLT",
  "HUT_F0_ACEPTA",
  "HUT_F1_GENERO",
  "HUT_F2_EDAD_EXACTA",
  "HUT_F6_PRODUCTOS_7_DIAS",
  "HUT_F20_TIEMPO_USO_MARCA",
  "HUT_F22_IMPORTANCIA_PERFUME",
  "HUT_V1_ACEPTA_USAR_PRODUCTO",
  "HUT_V1_CONFIRMACION_ENTREGA",
  "HUT_V1_OBSERVACIONES"
] as const;

const HUT_PRODUCT_1_QUESTION_ORDER = [
  "HUT_P1A_USO_PERFUME",
  "HUT_P3A_MOSTRO_ENVASE",
  "HUT_P4A_HORAS_DIA",
  "HUT_EVA1_GUSTO",
  "HUT_P6A_INTENSIDAD_FIT",
  "HUT_P7A_INTENSIDAD_PERCIBIDA",
  "HUT_P8A_GUSTO_ABIERTO",
  "HUT_P9A_DISGUSTO_ABIERTO",
  "HUT_EVA1_ATRIBUTOS",
  "HUT_P11A_RETOCO",
  "HUT_P11A_RAZON_RETOQUE",
  "HUT_P12A_CARACTERISTICA_INCOMODA",
  "HUT_P13A_CARACTERISTICA_INCOMODA_DETALLE",
  "HUT_P14A_ATOMIZADOR_ATRIBUTOS",
  "HUT_P15A_CANTIDAD_ATOMIZADOR",
  "HUT_P16A_INCONVENIENTES_ATOMIZADOR",
  "HUT_P17A_GUSTO_ATOMIZADOR",
  "HUT_P18A_DISGUSTO_ATOMIZADOR",
  "HUT_P19A_INTENCION_COMPRA",
  "HUT_P19A_RAZONES_COMPRA",
  "HUT_P21A_EXPECTATIVAS",
  "HUT_P22A_RECOMENDACION",
  "HUT_P23A_SATISFACCION"
] as const;

const HUT_PRODUCT_2_QUESTION_ORDER = [
  "HUT_V2_CONFIRMACION_ENTREGA",
  "HUT_V2_OBSERVACIONES",
  "HUT_P1B_USO_PERFUME",
  "HUT_P2B_RAZON_NO_USO",
  "HUT_P3B_MOSTRO_ENVASE",
  "HUT_P24_PREFERENCIA_GENERAL",
  "HUT_P25_COMPRA_PRIMERO",
  "HUT_P26_COMPRA_SEGUNDO",
  "HUT_P27_COMPARATIVA_ATRIBUTOS"
] as const;

export async function buildFinalAnalyticExport(input: BuildFinalAnalyticExportInput): Promise<FinalAnalyticExportResult> {
  const prisma = input.prismaClient ?? ((await createPrismaClient()) as AnalyticExportPrismaClient);
  const study = await prisma.study.findUnique?.({
    select: {
      code: true,
      id: true,
      name: true,
      timeZoneIana: true
    },
    where: { id: input.studyId }
  }) as StudyRecord | null;

  if (!study) {
    throw new Error("STUDY_NOT_FOUND");
  }

  const participants = await readAnalyticParticipants(prisma, input.studyId);
  const cltReport = buildCltReport(participants);
  const hutReport = buildHutReport(participants);
  const body = buildSpreadsheetXmlWorkbook([
    { columns: cltReport.columns, name: "REPORTE CLT", rows: cltReport.rows },
    { columns: hutReport.columns, name: "REPORTE HUT", rows: hutReport.rows }
  ]);

  return {
    body,
    contentType: EXCEL_XML_CONTENT_TYPE,
    filename: `${sanitizeFilenamePart(study.code)}_reporte_analitico_final_${formatDateForFilename(
      input.now ?? new Date(),
      study.timeZoneIana ?? DEFAULT_TIME_ZONE
    )}.xls`,
    rowCount: {
      reporteClt: cltReport.rows.length,
      reporteHut: hutReport.rows.length
    },
    sheets: ["REPORTE CLT", "REPORTE HUT"]
  };
}

export function buildSpreadsheetXmlWorkbook(sheets: Array<{ columns: string[]; name: string; rows: string[][] }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F2937" ss:Pattern="Solid"/>
  </Style>
 </Styles>
${sheets.map((sheet) => buildWorksheetXml(sheet)).join("\n")}
</Workbook>`;
}

async function readAnalyticParticipants(
  prisma: AnalyticExportPrismaClient,
  studyId: string
): Promise<AnalyticParticipant[]> {
  const studyParticipants = await prisma.studyParticipant.findMany?.({
    orderBy: { createdAt: "asc" },
    select: {
      armAssignments: {
        orderBy: { applicationOrder: "asc" },
        select: {
          applicationOrder: true,
          participantVisibleLabel: true,
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
        }
      },
      ctlSessions: {
        orderBy: { createdAt: "desc" },
        select: {
          answers: {
            orderBy: { questionCode: "asc" },
            select: {
              answerValue: true,
              questionCode: true
            }
          },
          completedAt: true,
          id: true,
          status: true,
          triangularRotationSnapshot: true
        }
      },
      ctlTriangularRotationAssignment: {
        select: {
          triangular1Pr1: true,
          triangular1Pr2: true,
          triangular1Pr3: true,
          triangular1Verify: true,
          triangular2Pr1: true,
          triangular2Pr2: true,
          triangular2Pr3: true,
          triangular2Verify: true
        }
      },
      hutParticipant: {
        select: {
          email: true,
          firstFragranceLeftArm: true,
          folio: true,
          id: true,
          name: true,
          origin: true,
          phone: true,
          questionnaireAttempt: {
            select: {
              answers: {
                orderBy: { questionCode: "asc" },
                select: {
                  answerJson: true,
                  questionCode: true
                }
              }
            }
          },
          secondFragranceRightArm: true
        }
      },
      id: true,
      participantConfirmation: {
        select: {
          approvedAt: true,
          folio: true,
          referenceCodes: {
            orderBy: { slot: "asc" },
            select: {
              code: true,
              slot: true
            }
          },
          screeningAttempt: {
            select: screeningAttemptSelect
          }
        }
      },
      participantProfile: {
        select: {
          email: true,
          name: true,
          phone: true
        }
      },
      rotationAssignment: {
        select: {
          rotationCode: true,
          rotationPlan: {
            select: {
              name: true
            }
          }
        }
      },
      screeningAttempts: {
        orderBy: [
          { completedAt: "desc" },
          { startedAt: "desc" }
        ],
        select: screeningAttemptSelect
      },
      screeningStatus: true
    },
    where: {
      qaParticipantRun: { is: null },
      studyId
    }
  }) as StudyParticipantRecord[] | undefined;

  const linkedHutIds = new Set((studyParticipants ?? []).map((participant) => participant.hutParticipant?.id).filter(Boolean));
  const orphanHutParticipants = await prisma.hutParticipant.findMany?.({
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      firstFragranceLeftArm: true,
      folio: true,
      id: true,
      name: true,
      origin: true,
      phone: true,
      questionnaireAttempt: {
        select: {
          answers: {
            orderBy: { questionCode: "asc" },
            select: {
              answerJson: true,
              questionCode: true
            }
          }
        }
      },
      secondFragranceRightArm: true,
      studyParticipantId: true
    },
    where: {
      qaParticipantRun: { is: null },
      studyId,
      studyParticipantId: null
    }
  }) as HutParticipantRecord[] | undefined;

  const participants = [
    ...(studyParticipants ?? []).map(toAnalyticParticipant),
    ...(orphanHutParticipants ?? [])
      .filter((hut) => !linkedHutIds.has(hut.id) && isOperationalHutOrphan(hut))
      .map(toAnalyticHutOrphan)
  ];

  return participants.sort((left, right) => folioNumber(left.navFolio || left.hutFolio) - folioNumber(right.navFolio || right.hutFolio));
}

const screeningAttemptSelect = {
  answers: {
    orderBy: { questionId: "asc" },
    select: {
      answerJson: true,
      questionId: true
    }
  },
  completedAt: true,
  id: true,
  nseClass: true,
  nseScore: true,
  participantScreeningReview: {
    select: {
      status: true
    }
  },
  startedAt: true,
  status: true,
  terminationReason: true
} as const;

function toAnalyticParticipant(participant: StudyParticipantRecord): AnalyticParticipant {
  const screeningAttempt = participant.participantConfirmation?.screeningAttempt ??
    participant.screeningAttempts.find((attempt) => attempt.status === "PASSED") ??
    participant.screeningAttempts[0] ??
    null;
  const ctlSession = participant.ctlSessions[0] ?? null;
  const hut = participant.hutParticipant;

  return {
    arms: participant.armAssignments,
    cltAnswers: buildAnswerMap(ctlSession?.answers ?? [], "questionCode", "answerValue"),
    ctlSession,
    hutAnswers: buildAnswerMap(hut?.questionnaireAttempt?.answers ?? [], "questionCode", "answerJson"),
    hutEva1: hut?.firstFragranceLeftArm ?? participant.armAssignments[0]?.studyProduct.internalCode ?? "",
    hutEva2: hut?.secondFragranceRightArm ?? participant.armAssignments[1]?.studyProduct.internalCode ?? "",
    hutFolio: hut?.folio ?? "",
    id: participant.id,
    name: participant.participantProfile.name,
    navFolio: participant.participantConfirmation?.folio ?? "",
    rotation: participant.rotationAssignment,
    screeningAnswers: buildAnswerMap(screeningAttempt?.answers ?? [], "questionId", "answerJson"),
    screeningAttempt,
    triangularRotation: participant.ctlTriangularRotationAssignment
  };
}

function toAnalyticHutOrphan(hut: HutParticipantRecord): AnalyticParticipant {
  return {
    arms: [],
    cltAnswers: new Map(),
    ctlSession: null,
    hutAnswers: buildAnswerMap(hut.questionnaireAttempt?.answers ?? [], "questionCode", "answerJson"),
    hutEva1: hut.firstFragranceLeftArm ?? "",
    hutEva2: hut.secondFragranceRightArm ?? "",
    hutFolio: hut.folio ?? "",
    id: hut.id,
    name: hut.name,
    navFolio: "",
    rotation: null,
    screeningAnswers: new Map(),
    screeningAttempt: null,
    triangularRotation: null
  };
}

function buildCltReport(participants: AnalyticParticipant[]): Report {
  const ctlQuestions = getCtlDefinition().sections.flatMap((section) => section.questions);
  const columns = dedupeColumns([
    "NAV_FOLIO",
    "HUT_FOLIO",
    "NOMBRE",
    ...SCREENING_ORDER,
    "ROTATION_PLAN",
    "PR1",
    "PR2",
    "PR3",
    "VERI_1",
    "PR4",
    "PR5",
    "PR6",
    "VERI_2",
    "EVA1",
    "EVA2",
    ...ctlQuestions.flatMap(cltColumnsForQuestion)
  ]);

  return {
    columns,
    rows: participants.map((participant) => columns.map((column) => readCltColumn(participant, column)))
  };
}

function buildHutReport(participants: AnalyticParticipant[]): Report {
  const questionsByCode = new Map(getHutQuestions().map((question) => [question.code, question] as const));
  const columns = dedupeColumns([
    "NAV_FOLIO",
    "HUT_FOLIO",
    "NOMBRE",
    ...SCREENING_ORDER,
    "HUT_ROTATION_PLAN",
    "HUT_EVA1",
    "HUT_EVA2",
    ...HUT_PREFIX_QUESTION_ORDER.flatMap((code) => hutColumnsForQuestion(questionsByCode.get(code), code)),
    "PRODUCTO_1_ROTACION_ASIGNADA",
    ...HUT_PRODUCT_1_QUESTION_ORDER.flatMap((code) => hutColumnsForQuestion(questionsByCode.get(code), code)),
    "PRODUCTO_2_ROTACION_ASIGNADA",
    ...HUT_PRODUCT_2_QUESTION_ORDER.flatMap((code) => hutColumnsForQuestion(questionsByCode.get(code), code))
  ]);

  return {
    columns,
    rows: participants.map((participant) => columns.map((column) => readHutColumn(participant, column)))
  };
}

function cltColumnsForQuestion(question: CtlQuestionDefinition): string[] {
  if (question.code === "F2") {
    return ["EDAD_EXACTA", "RANGO_EDAD"];
  }

  if (question.code === "TRI1_CONFIRMED_POS1") {
    return [
      "TRI1_SYSTEM_POS1",
      "TRI1_SYSTEM_POS2",
      "TRI1_SYSTEM_POS3",
      "TRI1_CONFIRMED_POS1",
      "TRI1_CONFIRMED_POS2",
      "TRI1_CONFIRMED_POS3",
      "TRI1_DELIVERY_ORDER"
    ];
  }

  if (question.code === "TRI1_CONFIRMED_POS2" || question.code === "TRI1_CONFIRMED_POS3") {
    return [];
  }

  if (question.code === "P1") {
    return ["P1", "TRI1_SELECTED_KEY", "TRI1_SELECTED_POSITION", "TRI1_CORRECT"];
  }

  if (question.code === "TRI2_CONFIRMED_POS1") {
    return [
      "TRI2_SYSTEM_POS1",
      "TRI2_SYSTEM_POS2",
      "TRI2_SYSTEM_POS3",
      "TRI2_CONFIRMED_POS1",
      "TRI2_CONFIRMED_POS2",
      "TRI2_CONFIRMED_POS3",
      "TRI2_DELIVERY_ORDER"
    ];
  }

  if (question.code === "TRI2_CONFIRMED_POS2" || question.code === "TRI2_CONFIRMED_POS3") {
    return [];
  }

  if (question.code === "P3") {
    return ["P3", "TRI2_SELECTED_KEY", "TRI2_SELECTED_POSITION", "TRI2_CORRECT"];
  }

  if (question.code === "EVA1_CONFIRMED_PRODUCT") {
    return [
      "EVA1_SYSTEM_PRODUCT",
      "EVA1_SYSTEM_ARM",
      "EVA1_SYSTEM_ORDER",
      "EVA1_CONFIRMED_PRODUCT",
      "EVA1_CONFIRMED_ARM",
      "EVA1_CONFIRMED_ORDER"
    ];
  }

  if (question.code === "EVA1_CONFIRMED_ARM" || question.code === "EVA1_CONFIRMED_ORDER") {
    return [];
  }

  if (question.code === "EVA2_CONFIRMED_PRODUCT") {
    return [
      "EVA2_SYSTEM_PRODUCT",
      "EVA2_SYSTEM_ARM",
      "EVA2_SYSTEM_ORDER",
      "EVA2_CONFIRMED_PRODUCT",
      "EVA2_CONFIRMED_ARM",
      "EVA2_CONFIRMED_ORDER"
    ];
  }

  if (question.code === "EVA2_CONFIRMED_ARM" || question.code === "EVA2_CONFIRMED_ORDER") {
    return [];
  }

  if (question.code === "P14") {
    return ["P14_FIRST_PRODUCT", "P14_SECOND_PRODUCT", "P14"];
  }

  if (question.type === "MATRIX") {
    return matrixColumns(question);
  }

  return [question.code];
}

function hutColumnsForQuestion(question: HutQuestionDefinition | undefined, fallbackCode: string): string[] {
  if (question?.type === "MATRIX") {
    return matrixColumns(question);
  }

  return [fallbackCode];
}

function matrixColumns(question: CtlMatrixQuestionDefinition | HutMatrixQuestionDefinition): string[] {
  return [
    ...question.rows.map((row) => `${question.code}_${row.code}`),
    `${question.code}_ATTRIBUTE_ORDER`
  ];
}

function readCltColumn(participant: AnalyticParticipant, column: string): string {
  const base = readBaseOrScreeningColumn(participant, column);
  if (base !== null) return base;

  const triangular = participant.triangularRotation;
  const firstArm = participant.arms.find((arm) => arm.applicationOrder === 1) ?? null;
  const secondArm = participant.arms.find((arm) => arm.applicationOrder === 2) ?? null;
  const p1 = participant.cltAnswers.get("P1");
  const p3 = participant.cltAnswers.get("P3");

  switch (column) {
    case "ROTATION_PLAN":
      return participant.rotation?.rotationPlan?.name ?? participant.rotation?.rotationCode ?? "";
    case "PR1":
    case "TRI1_SYSTEM_POS1":
      return triangular?.triangular1Pr1 ?? readTriangularSnapshot(participant, 1, "pr1");
    case "PR2":
    case "TRI1_SYSTEM_POS2":
      return triangular?.triangular1Pr2 ?? readTriangularSnapshot(participant, 1, "pr2");
    case "PR3":
    case "TRI1_SYSTEM_POS3":
      return triangular?.triangular1Pr3 ?? readTriangularSnapshot(participant, 1, "pr3");
    case "VERI_1":
      return triangular?.triangular1Verify ?? readTriangularSnapshot(participant, 1, "verify");
    case "PR4":
    case "TRI2_SYSTEM_POS1":
      return triangular?.triangular2Pr1 ?? readTriangularSnapshot(participant, 2, "pr1");
    case "PR5":
    case "TRI2_SYSTEM_POS2":
      return triangular?.triangular2Pr2 ?? readTriangularSnapshot(participant, 2, "pr2");
    case "PR6":
    case "TRI2_SYSTEM_POS3":
      return triangular?.triangular2Pr3 ?? readTriangularSnapshot(participant, 2, "pr3");
    case "VERI_2":
      return triangular?.triangular2Verify ?? readTriangularSnapshot(participant, 2, "verify");
    case "EVA1":
    case "EVA1_SYSTEM_PRODUCT":
      return firstArm?.studyProduct.internalCode ?? readProductTraceValue(participant.cltAnswers.get("SYS_EVA1_TRACE"), "productCode");
    case "EVA2":
    case "EVA2_SYSTEM_PRODUCT":
      return secondArm?.studyProduct.internalCode ?? readProductTraceValue(participant.cltAnswers.get("SYS_EVA2_TRACE"), "productCode");
    case "EVA1_SYSTEM_ARM":
      return firstArm?.studyArm.label ?? readProductTraceValue(participant.cltAnswers.get("SYS_EVA1_TRACE"), "armLabel");
    case "EVA2_SYSTEM_ARM":
      return secondArm?.studyArm.label ?? readProductTraceValue(participant.cltAnswers.get("SYS_EVA2_TRACE"), "armLabel");
    case "EVA1_SYSTEM_ORDER":
      return firstArm ? String(firstArm.applicationOrder) : normalizeExportValue(readProductTraceValue(participant.cltAnswers.get("SYS_EVA1_TRACE"), "order"));
    case "EVA2_SYSTEM_ORDER":
      return secondArm ? String(secondArm.applicationOrder) : normalizeExportValue(readProductTraceValue(participant.cltAnswers.get("SYS_EVA2_TRACE"), "order"));
    case "P14_FIRST_PRODUCT":
      return normalizeExportValue(participant.cltAnswers.get("EVA1_CONFIRMED_PRODUCT")) || readCltColumn(participant, "EVA1_SYSTEM_PRODUCT");
    case "P14_SECOND_PRODUCT":
      return normalizeExportValue(participant.cltAnswers.get("EVA2_CONFIRMED_PRODUCT")) || readCltColumn(participant, "EVA2_SYSTEM_PRODUCT");
    case "TRI1_DELIVERY_ORDER":
      return readTriangularDeliveryOrder(p1);
    case "TRI1_SELECTED_KEY":
      return readTriangularSelectedKey(p1);
    case "TRI1_SELECTED_POSITION":
      return readTriangularSelectedPosition(p1);
    case "TRI1_CORRECT":
      return readTriangularCorrect(p1);
    case "TRI2_DELIVERY_ORDER":
      return readTriangularDeliveryOrder(p3);
    case "TRI2_SELECTED_KEY":
      return readTriangularSelectedKey(p3);
    case "TRI2_SELECTED_POSITION":
      return readTriangularSelectedPosition(p3);
    case "TRI2_CORRECT":
      return readTriangularCorrect(p3);
    default:
      return readAnswerOrMatrixCell(participant.cltAnswers, column);
  }
}

function readHutColumn(participant: AnalyticParticipant, column: string): string {
  const base = readBaseOrScreeningColumn(participant, column);
  if (base !== null) return base;

  switch (column) {
    case "HUT_ROTATION_PLAN":
      return participant.hutFolio ? `slot ${participant.hutFolio}` : "";
    case "HUT_EVA1":
    case "PRODUCTO_1_ROTACION_ASIGNADA":
      return participant.hutEva1;
    case "HUT_EVA2":
    case "PRODUCTO_2_ROTACION_ASIGNADA":
      return participant.hutEva2;
    default:
      return readAnswerOrMatrixCell(participant.hutAnswers, column);
  }
}

function readBaseOrScreeningColumn(participant: AnalyticParticipant, column: string): string | null {
  switch (column) {
    case "NAV_FOLIO":
      return participant.navFolio;
    case "HUT_FOLIO":
      return participant.hutFolio;
    case "NOMBRE":
      return participant.name;
    case "GENERO":
      return normalizeExportValue(participant.screeningAnswers.get("F1_GENERO") ?? participant.screeningAnswers.get("F1"));
    case "EDAD_EXACTA":
      return readExactAge(participant.screeningAnswers.get("F2_EDAD") ?? participant.screeningAnswers.get("F2"));
    case "RANGO_EDAD":
      return readAgeRange(participant.screeningAnswers.get("F2_EDAD") ?? participant.screeningAnswers.get("F2"));
    case "NSE":
      return participant.screeningAttempt?.nseClass ?? "";
    case "PUNTAJE_NSE":
      return participant.screeningAttempt?.nseScore == null ? "" : String(participant.screeningAttempt.nseScore);
    default:
      if ((SCREENING_ORDER as readonly string[]).includes(column)) {
        return stringifyAnswerValue(participant.screeningAnswers.get(column));
      }
      return null;
  }
}

function readAnswerOrMatrixCell(answers: Map<string, unknown>, column: string): string {
  if (answers.has(column)) {
    return stringifyAnswerValue(answers.get(column));
  }

  const matrixMatch = column.match(/^(.+)_ATTRIBUTE_ORDER$/);
  if (matrixMatch) {
    const matrixValue = answers.get(matrixMatch[1] ?? "");
    return isRecord(matrixValue) ? normalizeExportValue(matrixValue.__rowOrder) : "";
  }

  for (const [questionCode, answerValue] of answers.entries()) {
    if (!column.startsWith(`${questionCode}_`)) continue;
    const rowCode = column.slice(questionCode.length + 1);
    if (!isRecord(answerValue)) continue;
    return normalizeExportValue(answerValue[rowCode]);
  }

  return "";
}

function buildWorksheetXml(sheet: { columns: string[]; name: string; rows: string[][] }): string {
  const rows = [
    buildRowXml(sheet.columns, "Header"),
    ...sheet.rows.map((row) => buildRowXml(row))
  ].join("\n");

  return ` <Worksheet ss:Name="${escapeXml(sheet.name)}">
  <Table>
${rows}
  </Table>
 </Worksheet>`;
}

function buildRowXml(values: string[], styleId?: string): string {
  const styleAttribute = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `   <Row>${values.map((value) => `<Cell${styleAttribute}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join("")}</Row>`;
}

function buildAnswerMap<T extends Record<string, unknown>>(
  answers: T[],
  keyField: keyof T,
  valueField: keyof T
): Map<string, unknown> {
  return new Map(answers.map((answer) => [String(answer[keyField] ?? ""), answer[valueField]]));
}

function isOperationalHutOrphan(hut: HutParticipantRecord): boolean {
  const hasRealIdentity = Boolean(hut.phone || hut.email || (hut.name && hut.name !== hut.folio));
  const hasAnswers = (hut.questionnaireAttempt?.answers.length ?? 0) > 0;
  return hasRealIdentity || hasAnswers;
}

function readTriangularSnapshot(
  participant: AnalyticParticipant,
  triangularNumber: 1 | 2,
  key: "pr1" | "pr2" | "pr3" | "verify"
): string {
  const snapshot = participant.ctlSession?.triangularRotationSnapshot;
  if (!isRecord(snapshot)) return "";
  const candidate = triangularNumber === 1 ? snapshot.triangular1 : snapshot.triangular2;
  return isRecord(candidate) ? normalizeExportValue(candidate[key]) : "";
}

function readTriangularSelectedPosition(value: unknown): string {
  return isRecord(value) ? normalizeExportValue(value.selectedPosition) : normalizeExportValue(value);
}

function readTriangularSelectedKey(value: unknown): string {
  return isRecord(value) ? normalizeExportValue(value.selectedKey) : "";
}

function readTriangularDeliveryOrder(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.deliveryOrder)) return "";
  return value.deliveryOrder.map(normalizeExportValue).filter(Boolean).join("|");
}

function readTriangularCorrect(value: unknown): string {
  if (isRecord(value) && (value.correct === 0 || value.correct === 1 || value.correct === "0" || value.correct === "1")) {
    return String(value.correct);
  }

  return "";
}

function readProductTraceValue(value: unknown, key: "armLabel" | "order" | "productCode"): string {
  if (!isRecord(value)) return "";
  return normalizeExportValue(value[key]);
}

function readExactAge(value: unknown): string {
  if (isRecord(value)) {
    return normalizeExportValue(value.exactAge);
  }

  const normalized = normalizeExportValue(value);
  return /^\d{1,3}$/.test(normalized) ? normalized : "";
}

function readAgeRange(value: unknown): string {
  if (isRecord(value)) {
    const rangeLabel = normalizeExportValue(value.rangeLabel);
    if (rangeLabel) return rangeLabel;

    const rangeCode = normalizeExportValue(value.rangeCode);
    const option = CTL_AGE_RANGE_OPTIONS.find((candidate) => candidate.value === rangeCode);
    if (option) return option.label;

    const exactAge = Number(normalizeExportValue(value.exactAge));
    if (Number.isInteger(exactAge)) return deriveAgeRangeLabel(exactAge);
  }

  const normalized = normalizeExportValue(value);
  const exactAge = Number(normalized);
  if (Number.isInteger(exactAge)) return deriveAgeRangeLabel(exactAge);

  return normalized;
}

function deriveAgeRangeLabel(age: number): string {
  if (age <= 29) return "29 años o menos";
  if (age <= 45) return "30 a 45 años";
  if (age <= 55) return "46 a 55 años";
  return "56 años o más";
}

function stringifyAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(normalizeExportValue).filter(Boolean).join(", ");
  if (isRecord(value) && Array.isArray(value.values)) {
    const base = value.values.map(normalizeExportValue).filter(Boolean).join(", ");
    const otherText = normalizeExportValue(value.otherText);
    return otherText ? `${base}. Especificación: ${otherText}` : base;
  }
  if (isRecord(value) && "value" in value && Object.keys(value).length <= 2) {
    const base = normalizeExportValue(value.value);
    const otherText = normalizeExportValue(value.otherText);
    return otherText ? `${base}. Especificación: ${otherText}` : base;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return normalizeExportValue(value);
}

function normalizeExportValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(normalizeExportValue).filter(Boolean).join(", ");
  return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function dedupeColumns(columns: readonly string[]): string[] {
  const seen = new Set<string>();
  return columns.filter((column) => {
    if (seen.has(column)) return false;
    seen.add(column);
    return true;
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "estudio";
}

function formatDateForFilename(value: Date, timeZoneIana: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timeZoneIana || DEFAULT_TIME_ZONE,
    year: "numeric"
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function folioNumber(value: string): number {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
